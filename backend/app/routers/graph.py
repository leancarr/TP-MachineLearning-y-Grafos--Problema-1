"""
Router para operaciones de grafo, indexación espacial y viewport (Ticket 15).
"""

from __future__ import annotations

import time
from typing import Any
from fastapi import APIRouter, Depends, Query

from backend.app.schemas import (
    CongestedCorridorsResponse,
    ContextParams,
    NodeInfo,
    ViewportRequest,
    ViewportResponse,
)
from backend.app.state import AppState, get_app_state

router = APIRouter(prefix="/api", tags=["Grafo y Espacial"])


@router.post(
    "/graph/viewport",
    response_model=ViewportResponse,
    summary="Aristas visibles filtradas por Bounding Box y Zoom con nivel de congestión",
)
def get_graph_viewport(
    req: ViewportRequest,
    state: AppState = Depends(get_app_state),
) -> ViewportResponse:
    """
    Retorna las aristas que caen dentro del viewport actual del usuario en Leaflet,
    filtradas vectorialmente por nivel de detalle (LOD) con su color y ratio de congestión.
    """
    t0 = time.perf_counter()

    edges = state.get_viewport_edges(
        min_lat=req.min_lat,
        min_lon=req.min_lon,
        max_lat=req.max_lat,
        max_lon=req.max_lon,
        zoom=req.zoom,
        hora_dia=req.hora_dia,
        dia_semana=req.dia_semana,
        clima=req.clima,
        es_feriado=req.es_feriado,
        max_edges=req.max_edges,
    )

    max_h = state.spatial_index.max_hierarchy_for_zoom(req.zoom)
    elapsed_ms = (time.perf_counter() - t0) * 1000.0

    return ViewportResponse(
        total_edges=len(edges),
        max_hierarchy_visible=max_h,
        context={
            "hora_dia": req.hora_dia,
            "dia_semana": req.dia_semana,
            "clima": req.clima,
            "es_feriado": req.es_feriado,
            "zoom": req.zoom,
        },
        edges=edges,
        execution_time_ms=round(elapsed_ms, 2),
    )


@router.post(
    "/graph/congested",
    response_model=CongestedCorridorsResponse,
    summary="Top de arterias más congestionadas en tiempo real",
)
def get_congested_corridors(
    req: ContextParams,
    limit: int = Query(default=10, ge=1, le=50, description="Cantidad de arterias a retornar"),
    state: AppState = Depends(get_app_state),
) -> CongestedCorridorsResponse:
    """
    Retorna el ranking de las arterias más congestionadas de Rosario para el contexto
    temporal y meteorológico consultado.
    """
    t0 = time.perf_counter()

    corridors = state.get_top_congested_corridors(
        hora_dia=req.hora_dia,
        dia_semana=req.dia_semana,
        clima=req.clima,
        es_feriado=req.es_feriado,
        limit=limit,
    )

    elapsed_ms = (time.perf_counter() - t0) * 1000.0

    return CongestedCorridorsResponse(
        total_corridors=len(corridors),
        context={
            "hora_dia": req.hora_dia,
            "dia_semana": req.dia_semana,
            "clima": req.clima,
            "es_feriado": req.es_feriado,
        },
        corridors=corridors,
        execution_time_ms=round(elapsed_ms, 2),
    )


@router.get(
    "/nodes/nearest",
    response_model=NodeInfo,
    summary="Ubica la esquina más cercana ante un clic en el mapa (<0.1 ms)",
)
def get_nearest_node(
    lat: float = Query(..., ge=-34.0, le=-32.0, description="Latitud"),
    lon: float = Query(..., ge=-61.5, le=-60.0, description="Longitud"),
    state: AppState = Depends(get_app_state),
) -> NodeInfo:
    """Realiza snapping espacial con `cKDTree` de la coordenada consultada a una esquina de la red vial."""
    nearest = state.spatial_index.get_nearest_node(lat=lat, lon=lon)
    return NodeInfo(
        id=nearest["id"],
        lat=nearest["lat"],
        lon=nearest["lon"],
        label=nearest["label"],
        distance_m=nearest["distance_m"],
    )


@router.get(
    "/nodes/search",
    response_model=list[NodeInfo],
    summary="Búsqueda de esquinas e intersecciones por nombre",
)
def search_nodes(
    q: str = Query(..., min_length=2, description="Texto de búsqueda (ej: 'pellegrini')"),
    limit: int = Query(default=15, ge=1, le=50),
    state: AppState = Depends(get_app_state),
) -> list[NodeInfo]:
    """Busca esquinas por nombre de calle o intersección."""
    results = state.spatial_index.search_nodes(query=q, limit=limit)
    return [
        NodeInfo(
            id=int(n["id"]),
            lat=float(n["lat"]),
            lon=float(n["lon"]),
            label=str(n["label"]),
        )
        for n in results
    ]
