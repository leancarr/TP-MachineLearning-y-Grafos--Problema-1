"""
Router para ruteo punto a punto y ronda de entregas TSP (Ticket 15).
"""

from __future__ import annotations

import time
from fastapi import APIRouter, Depends, HTTPException

from backend.app.schemas import (
    NodeInfo,
    RouteComparison,
    RouteDetail,
    RouteRequest,
    RouteResponse,
    TourDetail,
    TourLeg,
    TourRequest,
    TourResponse,
    TourStopResponse,
)
from backend.app.state import AppState, get_app_state

router = APIRouter(prefix="/api", tags=["Ruteo y Optimización"])


def _resolve_node(
    state: AppState,
    node_id: int | None,
    lat: float | None,
    lon: float | None,
    role: str = "Punto",
) -> NodeInfo:
    """Resuelve un nodo por su ID directo o mediante snapping cKDTree desde (lat, lon)."""
    if node_id is not None:
        if node_id not in state.spatial_index.node_by_id:
            raise HTTPException(
                status_code=404,
                detail=f"{role}: el ID de nodo {node_id} no existe en la red de Rosario.",
            )
        node = state.spatial_index.node_by_id[node_id]
        return NodeInfo(
            id=int(node["id"]),
            lat=float(node["lat"]),
            lon=float(node["lon"]),
            label=str(node["label"]),
            distance_m=0.0,
        )

    if lat is not None and lon is not None:
        nearest = state.spatial_index.get_nearest_node(lat=lat, lon=lon)
        return NodeInfo(
            id=nearest["id"],
            lat=nearest["lat"],
            lon=nearest["lon"],
            label=nearest["label"],
            distance_m=nearest["distance_m"],
        )

    raise HTTPException(
        status_code=400,
        detail=f"{role}: debe especificar 'node_id' o las coordenadas 'lat' y 'lon'.",
    )


@router.post(
    "/route",
    response_model=RouteResponse,
    summary="Cálculo comparativo: Camino más corto (metros) vs Camino más rápido (IA en segundos)",
)
def compute_route(
    req: RouteRequest,
    state: AppState = Depends(get_app_state),
) -> RouteResponse:
    """
    Calcula simultáneamente:
    1. **Ruta estática (Distancia):** Camino mínimo físico en metros.
    2. **Ruta dinámica (IA):** Camino mínimo con pesos predichos por el Árbol de Decisión según contexto.
    Devuelve polilíneas GeoJSON, tiempos, metros y ahorro porcentual.
    """
    t0 = time.perf_counter()

    # 1. Resolver origen y destino
    origin = _resolve_node(state, req.origin_id, req.origin_lat, req.origin_lon, "Origen")
    destination = _resolve_node(
        state, req.destination_id, req.destination_lat, req.destination_lon, "Destino"
    )

    if origin.id == destination.id:
        raise HTTPException(
            status_code=400,
            detail="El origen y el destino deben ser esquinas distintas.",
        )

    # 2. Sincronizar pesos dinámicos en RAM
    state.sync_weights_for_context(
        hora_dia=req.hora_dia,
        dia_semana=req.dia_semana,
        clima=req.clima,
        es_feriado=req.es_feriado,
    )

    # 3. Ejecución de Dijkstra (estático y dinámico)
    t_stat = time.perf_counter()
    res_static = state.router.shortest_path(origin.id, destination.id, mode="static")
    ms_static = (time.perf_counter() - t_stat) * 1000.0

    t_dyn = time.perf_counter()
    res_dynamic = state.router.shortest_path(origin.id, destination.id, mode="dynamic")
    ms_dynamic = (time.perf_counter() - t_dyn) * 1000.0

    if not res_static.found or not res_dynamic.found:
        raise HTTPException(
            status_code=404,
            detail=f"No se encontró camino transitable entre {origin.label} y {destination.label}.",
        )

    # 4. Cálculo de diferencias y ahorro
    time_saved_sec = round(res_static.total_time_sec - res_dynamic.total_time_sec, 2)
    time_saved_min = round(time_saved_sec / 60.0, 2)
    time_saved_pct = (
        round((time_saved_sec / res_static.total_time_sec) * 100.0, 2)
        if res_static.total_time_sec > 0
        else 0.0
    )
    distance_diff_m = round(res_dynamic.total_distance_m - res_static.total_distance_m, 2)

    total_ms = (time.perf_counter() - t0) * 1000.0

    return RouteResponse(
        origin=origin,
        destination=destination,
        static_route=RouteDetail(
            found=res_static.found,
            mode="static",
            distance_m=res_static.total_distance_m,
            distance_km=round(res_static.total_distance_m / 1000.0, 3),
            time_sec=res_static.total_time_sec,
            time_min=round(res_static.total_time_sec / 60.0, 2),
            nodes=res_static.nodes,
            coordinates=[[lat, lon] for lat, lon in res_static.coordinates],
            tramos=res_static.tramos,
            execution_time_ms=round(ms_static, 2),
        ),
        dynamic_route=RouteDetail(
            found=res_dynamic.found,
            mode="dynamic",
            distance_m=res_dynamic.total_distance_m,
            distance_km=round(res_dynamic.total_distance_m / 1000.0, 3),
            time_sec=res_dynamic.total_time_sec,
            time_min=round(res_dynamic.total_time_sec / 60.0, 2),
            nodes=res_dynamic.nodes,
            coordinates=[[lat, lon] for lat, lon in res_dynamic.coordinates],
            tramos=res_dynamic.tramos,
            execution_time_ms=round(ms_dynamic, 2),
        ),
        comparison=RouteComparison(
            time_saved_sec=time_saved_sec,
            time_saved_min=time_saved_min,
            time_saved_pct=time_saved_pct,
            distance_diff_m=distance_diff_m,
            is_dynamic_faster=time_saved_sec > 0,
        ),
        context={
            "hora_dia": req.hora_dia,
            "dia_semana": req.dia_semana,
            "clima": req.clima,
            "es_feriado": req.es_feriado,
        },
        total_execution_time_ms=round(total_ms, 2),
    )


@router.post(
    "/tour",
    response_model=TourResponse,
    summary="Optimización de ronda de entregas (TSP con Nearest Neighbor + 2-opt)",
)
def compute_tour(
    req: TourRequest,
    state: AppState = Depends(get_app_state),
) -> TourResponse:
    """
    Resuelve el problema de ruteo de vehículos para entregas multipunto en Rosario.
    Compara la secuencia optimizada por distancia vs la secuencia optimizada por tiempo dinámico.
    """
    t0 = time.perf_counter()

    if not req.stops:
        raise HTTPException(status_code=400, detail="Debe proporcionar al menos 1 parada.")
    if len(req.stops) > 20:
        raise HTTPException(
            status_code=400,
            detail="El número máximo de paradas para la ronda interactiva es 20.",
        )

    # 1. Resolver depósito y paradas
    depot_info = _resolve_node(
        state, req.depot.node_id, req.depot.lat, req.depot.lon, "Depósito"
    )
    stop_ids: list[int] = []
    for i, s in enumerate(req.stops):
        s_info = _resolve_node(state, s.node_id, s.lat, s.lon, f"Parada #{i+1}")
        stop_ids.append(s_info.id)

    # 2. Sincronizar pesos dinámicos
    state.sync_weights_for_context(
        hora_dia=req.hora_dia,
        dia_semana=req.dia_semana,
        clima=req.clima,
        es_feriado=req.es_feriado,
    )

    # 3. Ejecutar comparación de tour
    comp = state.tsp_optimizer.compare_dynamic_vs_static_tour(
        depot_id=depot_info.id,
        stop_ids=stop_ids,
        return_to_depot=req.return_to_depot,
    )

    def _format_tour_detail(raw: dict) -> TourDetail:
        legs: list[TourLeg] = [
            TourLeg(
                leg_order=leg["leg_order"],
                from_node=leg["from_node"],
                to_node=leg["to_node"],
                distance_m=leg["distance_m"],
                time_sec=leg["time_sec"],
                nodes=leg["nodes"],
                coordinates=[[lat, lon] for lat, lon in leg["coordinates"]],
            )
            for leg in raw["legs"]
        ]
        numbered_stops: list[TourStopResponse] = [
            TourStopResponse(
                visit_order=ns["visit_order"],
                node_id=ns["node_id"],
                label=ns["label"],
                lat=ns["lat"],
                lon=ns["lon"],
            )
            for ns in raw["numbered_stops"]
        ]
        return TourDetail(
            mode=raw["mode"],
            ordered_sequence=raw["ordered_sequence"],
            numbered_stops=numbered_stops,
            legs=legs,
            coordinates=[[lat, lon] for lat, lon in raw["coordinates"]],
            total_distance_km=raw["total_distance_km"],
            total_time_min=raw["total_time_min"],
            execution_time_ms=raw["execution_time_ms"],
        )

    dyn_tour = _format_tour_detail(comp["dynamic_tour"])
    stat_tour = _format_tour_detail(comp["static_tour"])
    total_ms = (time.perf_counter() - t0) * 1000.0

    return TourResponse(
        dynamic_tour=dyn_tour,
        static_tour=stat_tour,
        time_saved_sec=comp["time_saved_sec"],
        time_saved_min=comp["time_saved_min"],
        time_saved_pct=comp["time_saved_pct"],
        context={
            "hora_dia": req.hora_dia,
            "dia_semana": req.dia_semana,
            "clima": req.clima,
            "es_feriado": req.es_feriado,
            "return_to_depot": req.return_to_depot,
            "stops_count": len(stop_ids),
        },
        total_execution_time_ms=round(total_ms, 2),
    )
