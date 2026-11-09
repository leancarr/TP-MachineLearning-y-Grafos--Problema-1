"""
Tests unitarios para Ticket 14 (MACHI-21): Ronda de entregas multipunto (TSP con Nearest Neighbor + 2-opt).
"""

from __future__ import annotations

import numpy as np
from backend.app.graph.adjacency import DirectedAdjacencyGraph
from backend.app.graph.tsp import DeliveryTourOptimizer


def test_tsp_delivery_tour_up_to_12_stops_and_comparison() -> None:
    """Verifica que una ronda de hasta 12 paradas en Rosario devuelva orden numerado (1..K) y geometría."""
    graph = DirectedAdjacencyGraph()
    optimizer = DeliveryTourOptimizer(graph)

    rng = np.random.default_rng(42)
    all_ids = [int(n["id"]) for n in graph.nodes]
    chosen = rng.choice(all_ids, size=11, replace=False)
    depot_id = int(chosen[0])
    stops = [int(x) for x in chosen[1:11]]  # 10 paradas + depósito

    res = optimizer.compute_tour(depot_id, stops, mode="dynamic", return_to_depot=True)

    assert res["depot_id"] == depot_id
    assert len(res["numbered_stops"]) == len(stops)
    orders = [s["visit_order"] for s in res["numbered_stops"]]
    assert orders == list(range(1, len(stops) + 1))

    visited_set = {s["node_id"] for s in res["numbered_stops"]}
    assert visited_set == set(stops)

    assert res["ordered_sequence"][0] == depot_id
    assert res["ordered_sequence"][-1] == depot_id
    assert len(res["coordinates"]) == len(res["nodes"])
    assert len(res["tramos"]) == len(res["nodes"]) - 1
    assert res["total_distance_m"] > 0.0
    assert res["total_time_sec"] > 0.0

    # Comparación dinámica vs estática con 5 paradas
    comparison = optimizer.compare_dynamic_vs_static_tour(depot_id, stops[:5])
    assert "dynamic_tour" in comparison
    assert "static_tour" in comparison
    assert comparison["dynamic_tour"]["total_time_sec"] <= comparison["static_tour"]["total_time_sec"] + 1e-3
