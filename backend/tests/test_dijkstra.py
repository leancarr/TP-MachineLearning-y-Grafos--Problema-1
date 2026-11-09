"""
Tests unitarios para Ticket 12 (MACHI-19): Algoritmo artesanal de Dijkstra con heapq.

Verifica:
1. Resolución precisa de rutas entre esquinas reales de Rosario (ej. Pellegrini/Corrientes al Monumento).
2. Tiempo de ejecución < 35 ms para consultas de punta a punta de la ciudad.
3. Contraste entre modo estático (metros) y dinámico (segundos) ante congestión vial simulada.
4. Manejo correcto de nodos inalcanzables o inexistentes (found=False, path vacío, inf distancia).
5. Casos borde (origen == destino, modos inválidos, accesos como dict y objeto).
"""

from __future__ import annotations

import time
import pytest

from backend.app.graph.adjacency import DirectedAdjacencyGraph
from backend.app.graph.dijkstra import (
    DijkstraResult,
    DijkstraRouter,
    dijkstra_shortest_path,
)
from backend.app.graph.spatial import RosarioSpatialIndex


@pytest.fixture(scope="module")
def shared_graph() -> DirectedAdjacencyGraph:
    """Instancia del grafo de Rosario compartida entre los tests del módulo."""
    return DirectedAdjacencyGraph()


@pytest.fixture(scope="module")
def spatial_index() -> RosarioSpatialIndex:
    """Índice espacial para snapping de coordenadas en tests."""
    return RosarioSpatialIndex()


def test_dijkstra_route_resolution_pellegrini_to_monumento(
    shared_graph: DirectedAdjacencyGraph, spatial_index: RosarioSpatialIndex
) -> None:
    """Verifica el cálculo de ruta entre Av. Pellegrini / Corrientes y el Monumento a la Bandera."""
    orig = spatial_index.get_nearest_node(-32.9540, -60.6450)
    dest = spatial_index.get_nearest_node(-32.9475, -60.6300)

    router = DijkstraRouter(shared_graph)

    # 1. Modo dinámico
    res_dyn = router.shortest_path(orig["id"], dest["id"], mode="dynamic")
    assert isinstance(res_dyn, DijkstraResult)
    assert res_dyn.found is True
    assert bool(res_dyn) is True
    assert len(res_dyn.nodes) >= 5
    assert res_dyn.nodes[0] == orig["id"]
    assert res_dyn.nodes[-1] == dest["id"]
    assert len(res_dyn.tramos) == len(res_dyn.nodes) - 1
    assert len(res_dyn.coordinates) == len(res_dyn.nodes)

    # Coordenadas geográficas válidas en Rosario
    for lat, lon in res_dyn.coordinates:
        assert -33.10 < lat < -32.80
        assert -60.80 < lon < -60.55

    # Métricas coherentes
    assert 1500.0 < res_dyn.total_distance_m < 3500.0
    assert 60.0 < res_dyn.total_time_sec < 600.0
    assert res_dyn.total_time_min == pytest.approx(res_dyn.total_time_sec / 60.0, rel=1e-2)

    # Acceso estilo dict y serialización to_dict()
    assert res_dyn["found"] is True
    assert res_dyn["total_distance_m"] == res_dyn.total_distance_m
    d = res_dyn.to_dict()
    assert isinstance(d, dict) and d["found"] is True

    # 2. Modo estático mediante la función de conveniencia
    res_static = dijkstra_shortest_path(shared_graph, orig["id"], dest["id"], mode="static")
    assert res_static.found is True
    assert res_static.nodes[0] == orig["id"]
    assert res_static.nodes[-1] == dest["id"]
    # En modo estático se minimiza la distancia física
    assert res_static.total_distance_m <= res_dyn.total_distance_m + 1e-3


def test_dijkstra_execution_time_across_rosario(
    shared_graph: DirectedAdjacencyGraph,
) -> None:
    """Verifica que una consulta de punta a punta de Rosario resuelva en <35 ms."""
    router = DijkstraRouter(shared_graph)

    # Nodos extremos del grafo (punta sur a punta norte)
    u_start = shared_graph.nodes[0]["id"]
    u_end = shared_graph.nodes[-1]["id"]

    # Calentamiento / verificación
    warmup = router.shortest_path(u_start, u_end, mode="dynamic")
    assert warmup.found is True

    # Medición de consulta individual a través de la ciudad
    t0 = time.perf_counter()
    res = router.shortest_path(u_start, u_end, mode="dynamic")
    elapsed_ms = (time.perf_counter() - t0) * 1000.0

    assert res.found is True
    assert res.execution_time_ms < 35.0, (
        f"Consulta interna demoró {res.execution_time_ms:.2f} ms (>35 ms)"
    )
    assert elapsed_ms < 35.0, f"Tiempo medido exteriormente {elapsed_ms:.2f} ms (>35 ms)"


def test_dijkstra_static_vs_dynamic_congestion_detour(
    shared_graph: DirectedAdjacencyGraph, spatial_index: RosarioSpatialIndex
) -> None:
    """
    Verifica que ante una congestión severa sobre una arteria principal (calle Corrientes),
    el modo dinámico elija un desvío alternativo con menor tiempo de viaje mientras el
    modo estático siga tomando la arteria por menor distancia física.
    """
    orig = spatial_index.get_nearest_node(-32.9540, -60.6450)  # Pellegrini y Corrientes
    dest = spatial_index.get_nearest_node(-32.9475, -60.6300)  # Monumento

    router = DijkstraRouter(shared_graph)

    # Backup de los pesos dinámicos originales
    original_weights = shared_graph.dynamic_weights.copy()

    try:
        # Identificar tramos de calle Corrientes
        corrientes_edge_indices = [
            idx
            for idx, e in enumerate(shared_graph.edges)
            if "corrientes" in e["nombre_calle"].lower()
        ]
        assert len(corrientes_edge_indices) > 0

        # Simular embotellamiento severo (multiplicador 30x en tiempo de viaje)
        congested_weights = original_weights.copy()
        for idx in corrientes_edge_indices:
            congested_weights[idx] *= 30.0

        shared_graph.update_weights(congested_weights)

        # Resolver con ambos modos
        res_static = router.shortest_path(orig["id"], dest["id"], mode="static")
        res_dyn = router.shortest_path(orig["id"], dest["id"], mode="dynamic")

        assert res_static.found is True
        assert res_dyn.found is True

        # Verificar que tomaron rutas distintas (desvío dinámico)
        assert res_static.nodes != res_dyn.nodes

        # El modo dinámico debe tener un tiempo de viaje significativamente menor al estático
        assert res_dyn.total_time_sec < res_static.total_time_sec
        # Y el modo estático debe tener una distancia física menor o igual al desvío dinámico
        assert res_static.total_distance_m <= res_dyn.total_distance_m

        # Verificar que el camino estático contiene tramos de Corrientes y el dinámico los evitó
        static_street_names = [
            shared_graph.edges[shared_graph.edge_index_by_tramo_id[t]]["nombre_calle"].lower()
            for t in res_static.tramos
        ]
        dynamic_street_names = [
            shared_graph.edges[shared_graph.edge_index_by_tramo_id[t]]["nombre_calle"].lower()
            for t in res_dyn.tramos
        ]

        assert any("corrientes" in name for name in static_street_names)
        assert not any("corrientes" in name for name in dynamic_street_names)

    finally:
        # Restaurar estado limpio para no afectar otros tests
        shared_graph.update_weights(original_weights)


def test_dijkstra_unreachable_node_handling(
    shared_graph: DirectedAdjacencyGraph,
) -> None:
    """Verifica que nodos inexistentes o inalcanzables retornen found=False y distancia inf."""
    router = DijkstraRouter(shared_graph)
    valid_node = shared_graph.nodes[0]["id"]
    non_existent_node_1 = 999_999_999_999
    non_existent_node_2 = -888_888

    # Origen inexistente
    res1 = router.shortest_path(non_existent_node_1, valid_node)
    assert res1.found is False
    assert bool(res1) is False
    assert res1.nodes == []
    assert res1.tramos == []
    assert res1.coordinates == []
    assert res1.total_distance_m == float("inf")
    assert res1.total_time_sec == float("inf")
    assert res1.total_time_min == float("inf")

    # Destino inexistente
    res2 = router.shortest_path(valid_node, non_existent_node_2)
    assert res2.found is False
    assert res2.total_distance_m == float("inf")

    # Grafo desconectado sintético con nodo inalcanzable
    synthetic_graph_data = {
        "nodes": [
            {"id": 1, "lat": -32.95, "lon": -60.65, "label": "A"},
            {"id": 2, "lat": -32.96, "lon": -60.66, "label": "B"},
            {"id": 3, "lat": -32.97, "lon": -60.67, "label": "C_aislado"},
        ],
        "edges": [
            {
                "tramo_id": "T_1_2",
                "u": 1,
                "v": 2,
                "nombre_calle": "Calle 1",
                "longitud_m": 100.0,
                "jerarquia_osm": 3,
                "tipo_calle": "residencial",
                "velocidad_promedio_historica": 30.0,
                "tiempo_base_seg": 12.0,
            }
        ],
    }
    synth_g = DirectedAdjacencyGraph(synthetic_graph_data)
    synth_router = DijkstraRouter(synth_g)

    # 1 hacia 3 es topológicamente inalcanzable
    res_unreachable = synth_router.shortest_path(1, 3)
    assert res_unreachable.found is False
    assert res_unreachable.nodes == []
    assert res_unreachable.tramos == []
    assert res_unreachable.total_distance_m == float("inf")
    assert res_unreachable.total_time_sec == float("inf")


def test_dijkstra_same_origin_and_destination(
    shared_graph: DirectedAdjacencyGraph,
) -> None:
    """Verifica el caso borde donde origen == destino."""
    router = DijkstraRouter(shared_graph)
    sample_id = shared_graph.nodes[10]["id"]

    res = router.shortest_path(sample_id, sample_id, mode="dynamic")
    assert res.found is True
    assert res.nodes == [sample_id]
    assert res.tramos == []
    assert res.total_distance_m == 0.0
    assert res.total_time_sec == 0.0
    assert res.total_time_min == 0.0
    assert len(res.coordinates) == 1


def test_dijkstra_invalid_mode_raises(shared_graph: DirectedAdjacencyGraph) -> None:
    """Verifica que un modo distinto de 'static' o 'dynamic' lance ValueError."""
    router = DijkstraRouter(shared_graph)
    u = shared_graph.nodes[0]["id"]
    v = shared_graph.nodes[1]["id"]

    with pytest.raises(ValueError, match="Modo de ruteo inválido"):
        router.shortest_path(u, v, mode="heuristica_invalida")


def test_dijkstra_one_to_all_matrix_helper(
    shared_graph: DirectedAdjacencyGraph,
) -> None:
    """Verifica la función helper one_to_all para cálculo masivo de matrices (Ticket 14)."""
    router = DijkstraRouter(shared_graph)
    u_start = shared_graph.nodes[0]["id"]

    t0 = time.perf_counter()
    distances, predecessors = router.one_to_all(u_start, mode="dynamic")
    elapsed_ms = (time.perf_counter() - t0) * 1000.0

    assert len(distances) == len(shared_graph.nodes)  # SCC completo
    assert distances[u_start] == 0.0
    assert elapsed_ms < 80.0


def test_dijkstra_50_random_pairs_exact_match_vs_networkx(
    shared_graph: DirectedAdjacencyGraph,
) -> None:
    """
    Ticket 13 (MACHI-20): Suite TDD de 50 pares aleatorios Origen-Destino en la red real
    de Rosario contrastando DijkstraRouter contra `networkx.dijkstra_path` y
    `networkx.dijkstra_path_length`, verificando:
    1) Igualdad exacta de costo al centésimo (tanto en modo dinámico como estático).
    2) Igualdad de secuencia de nodos y validez de cada arista dirigida (sin viajar en contramano).
    """
    import networkx as nx
    import numpy as np

    router = DijkstraRouter(shared_graph)

    # Construir el DiGraph equivalente en NetworkX con pesos estáticos y dinámicos
    G_nx = nx.DiGraph()
    for n in shared_graph.nodes:
        G_nx.add_node(int(n["id"]))

    for idx, e in enumerate(shared_graph.edges):
        u = int(e["u"])
        v = int(e["v"])
        G_nx.add_edge(
            u,
            v,
            static_w=float(shared_graph.static_lengths[idx]),
            dynamic_w=float(shared_graph.dynamic_weights[idx]),
        )

    rng = np.random.default_rng(42)
    all_node_ids = [int(n["id"]) for n in shared_graph.nodes]
    origins = rng.choice(all_node_ids, size=50, replace=False)
    destinations = rng.choice(all_node_ids, size=50, replace=False)

    for u_orig, v_dest in zip(origins, destinations):
        u_int, v_int = int(u_orig), int(v_dest)

        # Contrastar modo dinámico (tiempo en segundos)
        res_dyn = router.shortest_path(u_int, v_int, mode="dynamic")
        nx_len_dyn = float(nx.dijkstra_path_length(G_nx, u_int, v_int, weight="dynamic_w"))
        nx_path_dyn = nx.dijkstra_path(G_nx, u_int, v_int, weight="dynamic_w")

        assert res_dyn.found is True
        assert round(res_dyn.total_time_sec, 2) == round(nx_len_dyn, 2)
        assert res_dyn.nodes == nx_path_dyn

        # Verificar que ninguna arista del camino viaje en contramano
        for a, b in zip(res_dyn.nodes[:-1], res_dyn.nodes[1:]):
            assert (a, b) in shared_graph.edge_by_pair, f"Arista en contramano detectada: ({a} -> {b})"

        # Contrastar modo estático (distancia en metros)
        res_stat = router.shortest_path(u_int, v_int, mode="static")
        nx_len_stat = float(nx.dijkstra_path_length(G_nx, u_int, v_int, weight="static_w"))
        nx_path_stat = nx.dijkstra_path(G_nx, u_int, v_int, weight="static_w")

        assert res_stat.found is True
        assert round(res_stat.total_distance_m, 2) == round(nx_len_stat, 2)
        assert res_stat.nodes == nx_path_stat

