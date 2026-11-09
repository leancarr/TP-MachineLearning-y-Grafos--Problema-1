"""
Ticket 14 (MACHI-21): Ronda de entregas multipunto (TSP con Nearest Neighbor + 2-opt).

Resuelve el problema de ruteo de ronda de entregas para un depósito de origen y K paradas
en toda la ciudad de Rosario:
1. Calcula la submatriz K x K de costos y caminos mínimos ejecutando `DijkstraRouter.one_to_all`
   solo desde los puntos involucrados (`depot + stops`), logrando tiempos <120 ms hasta 12 paradas.
2. Construye un recorrido inicial con la heurística voraz del Vecino más Cercano (`Nearest Neighbor`).
3. Refina el orden de visita eliminando cruces mediante búsqueda local `2-opt` sobre la matriz asimétrica.
4. Reconstruye la polilínea completa calle por calle (`coordinates`, `nodes`, `tramos`) y devuelve
   el orden numerado de paradas (`1, 2, ..., K`) y la comparación contra la ronda estática por distancia.
"""

from __future__ import annotations

import time
from typing import Any

from backend.app.graph.adjacency import DirectedAdjacencyGraph
from backend.app.graph.dijkstra import DijkstraRouter


def _solve_tsp_nearest_neighbor_and_2opt(
    depot: int,
    stops: list[int],
    cost_matrix: dict[tuple[int, int], float],
    return_to_depot: bool = True,
) -> list[int]:
    """
    Construye el orden de visita [depot, s_1, s_2, ..., s_k, (depot)] usando
    Vecino más Cercano seguido de optimización local 2-opt.
    """
    if not stops:
        return [depot, depot] if return_to_depot else [depot]

    unvisited = list(dict.fromkeys(stops))  # Preserva orden y quita duplicados
    tour = [depot]
    current = depot

    while unvisited:
        next_stop = min(
            unvisited,
            key=lambda candidate: cost_matrix.get((current, candidate), float("inf")),
        )
        tour.append(next_stop)
        unvisited.remove(next_stop)
        current = next_stop

    if return_to_depot:
        tour.append(depot)

    # Optimización local 2-opt sobre el segmento interno de paradas tour[1..m]
    # Evaluamos la función objetivo completa del recorrido dirigido porque en calles de mano única
    # invertir un sub-segmento cambia el sentido de travesía entre paradas intermedias.
    def _tour_cost(seq: list[int]) -> float:
        return sum(
            cost_matrix.get((seq[i], seq[i + 1]), float("inf"))
            for i in range(len(seq) - 1)
        )

    best_tour = list(tour)
    best_cost = _tour_cost(best_tour)
    n_stops = len(stops)

    if n_stops >= 2:
        improved = True
        max_passes = 20
        passes = 0
        end_idx = len(best_tour) - 1 if return_to_depot else len(best_tour)

        while improved and passes < max_passes:
            improved = False
            passes += 1
            for i in range(1, end_idx - 1):
                for j in range(i + 1, end_idx):
                    candidate = (
                        best_tour[:i]
                        + best_tour[i : j + 1][::-1]
                        + best_tour[j + 1 :]
                    )
                    c_cost = _tour_cost(candidate)
                    if c_cost + 1e-6 < best_cost:
                        best_tour = candidate
                        best_cost = c_cost
                        improved = True

    return best_tour


class DeliveryTourOptimizer:
    """Optimizador de rondas de entrega multipunto en la red vial de Rosario."""

    def __init__(self, graph: DirectedAdjacencyGraph | None = None) -> None:
        if graph is None:
            graph = DirectedAdjacencyGraph()
        self.graph = graph
        self.router = DijkstraRouter(graph)

    def _compute_pairwise_matrix(
        self, points: list[int], mode: str
    ) -> dict[tuple[int, int], float]:
        """
        Calcula la matriz K x K ejecutando `one_to_many` con corte temprano (early exit)
        en cuanto se alcanzan los K destinos desde cada punto de interés.
        """
        unique_pts = list(dict.fromkeys(points))
        pts_set = set(unique_pts)
        matrix: dict[tuple[int, int], float] = {}
        for u in unique_pts:
            dists = self.router.one_to_many(u, pts_set, mode=mode)
            for v in unique_pts:
                matrix[(u, v)] = 0.0 if u == v else dists.get(v, float("inf"))
        return matrix

    def compute_tour(
        self,
        depot_id: int,
        stop_ids: list[int],
        mode: str = "dynamic",
        return_to_depot: bool = True,
    ) -> dict[str, Any]:
        """
        Optimiza la ronda de entrega para `depot_id` y `stop_ids` en el modo indicado
        ('dynamic' minimiza tiempo predicho por ML; 'static' minimiza distancia en metros).
        """
        t0 = time.perf_counter()
        clean_stops = [int(s) for s in stop_ids if int(s) != int(depot_id)]
        all_points = [int(depot_id)] + clean_stops

        cost_matrix = self._compute_pairwise_matrix(all_points, mode=mode)
        ordered_sequence = _solve_tsp_nearest_neighbor_and_2opt(
            int(depot_id),
            clean_stops,
            cost_matrix=cost_matrix,
            return_to_depot=return_to_depot,
        )

        # Reconstruir los tramos exactos calle por calle entre cada par consecutivo
        full_nodes: list[int] = []
        full_tramos: list[str] = []
        full_coords: list[tuple[float, float]] = []
        legs: list[dict[str, Any]] = []
        total_distance_m = 0.0
        total_time_sec = 0.0

        for leg_idx in range(len(ordered_sequence) - 1):
            u = ordered_sequence[leg_idx]
            v = ordered_sequence[leg_idx + 1]
            leg_res = self.router.shortest_path(u, v, mode=mode)
            if not leg_res.found:
                raise ValueError(f"No existe ruta válida entre las paradas {u} y {v}")

            if not full_nodes:
                full_nodes.extend(leg_res.nodes)
                full_coords.extend(leg_res.coordinates)
            else:
                full_nodes.extend(leg_res.nodes[1:])
                full_coords.extend(leg_res.coordinates[1:])

            full_tramos.extend(leg_res.tramos)
            total_distance_m += leg_res.total_distance_m
            total_time_sec += leg_res.total_time_sec

            legs.append(
                {
                    "leg_order": leg_idx + 1,
                    "from_node": u,
                    "to_node": v,
                    "distance_m": round(leg_res.total_distance_m, 2),
                    "time_sec": round(leg_res.total_time_sec, 2),
                    "nodes": leg_res.nodes,
                    "coordinates": leg_res.coordinates,
                }
            )

        visited_stops_only = (
            ordered_sequence[1:-1] if return_to_depot else ordered_sequence[1:]
        )
        numbered_stops = [
            {
                "visit_order": idx + 1,
                "node_id": nid,
                "label": self.graph.node_by_id[nid]["label"],
                "lat": self.graph.node_by_id[nid]["lat"],
                "lon": self.graph.node_by_id[nid]["lon"],
            }
            for idx, nid in enumerate(visited_stops_only)
        ]

        elapsed_ms = (time.perf_counter() - t0) * 1000.0
        return {
            "mode": mode,
            "depot_id": int(depot_id),
            "ordered_sequence": ordered_sequence,
            "numbered_stops": numbered_stops,
            "legs": legs,
            "nodes": full_nodes,
            "tramos": full_tramos,
            "coordinates": full_coords,
            "total_distance_m": round(total_distance_m, 2),
            "total_distance_km": round(total_distance_m / 1000.0, 3),
            "total_time_sec": round(total_time_sec, 2),
            "total_time_min": round(total_time_sec / 60.0, 2),
            "execution_time_ms": round(elapsed_ms, 2),
        }

    def compare_dynamic_vs_static_tour(
        self,
        depot_id: int,
        stop_ids: list[int],
        return_to_depot: bool = True,
    ) -> dict[str, Any]:
        """
        Compara la ronda calculada con pesos dinámicos ML frente a la ronda calculada
        con pesos estáticos (distancia física).
        """
        dyn_tour = self.compute_tour(
            depot_id, stop_ids, mode="dynamic", return_to_depot=return_to_depot
        )
        stat_tour = self.compute_tour(
            depot_id, stop_ids, mode="static", return_to_depot=return_to_depot
        )

        saved_sec = round(stat_tour["total_time_sec"] - dyn_tour["total_time_sec"], 2)
        saved_pct = (
            round((saved_sec / stat_tour["total_time_sec"]) * 100.0, 2)
            if stat_tour["total_time_sec"] > 0
            else 0.0
        )

        return {
            "dynamic_tour": dyn_tour,
            "static_tour": stat_tour,
            "time_saved_sec": saved_sec,
            "time_saved_min": round(saved_sec / 60.0, 2),
            "time_saved_pct": saved_pct,
        }
