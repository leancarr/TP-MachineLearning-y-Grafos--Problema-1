"""
Tests unitarios para Ticket 01 (MACHI-8): Extracción, filtrado SCC y cacheo local OSMnx.
"""

from __future__ import annotations

import time
import networkx as nx

from backend.app.config import GRAPH_JSON_PATH
from backend.app.graph.builder import build_or_load_rosario_graph


def test_rosario_graph_cache_and_schema() -> None:
    """Verifica que rosario_graph.json cargue en <2s y tenga la estructura y tamaño de todo Rosario."""
    assert GRAPH_JSON_PATH.exists(), "El archivo rosario_graph.json debe existir en disco."

    t0 = time.perf_counter()
    data = build_or_load_rosario_graph(output_path=GRAPH_JSON_PATH, force_rebuild=False)
    elapsed = time.perf_counter() - t0

    assert elapsed < 2.0, f"La carga local desde caché demoró {elapsed:.3f}s (> 2.0s)"

    nodes = data["nodes"]
    edges = data["edges"]
    assert len(nodes) >= 12000, f"Se esperaban >12k nodos de todo Rosario, se obtuvieron {len(nodes)}"
    assert len(edges) >= 28000, f"Se esperaban >28k aristas de todo Rosario, se obtuvieron {len(edges)}"

    sample_node = nodes[0]
    for key in ("id", "lat", "lon", "label"):
        assert key in sample_node

    sample_edge = edges[0]
    for key in (
        "tramo_id",
        "u",
        "v",
        "nombre_calle",
        "longitud_m",
        "jerarquia_osm",
        "tipo_calle",
        "velocidad_promedio_historica",
        "tiempo_base_seg",
    ):
        assert key in sample_edge
    assert sample_edge["jerarquia_osm"] in {1, 2, 3, 4}
    assert sample_edge["tipo_calle"] in {"circunvalacion", "avenida", "comercial", "residencial"}
    assert sample_edge["longitud_m"] > 0


def test_rosario_graph_is_single_scc() -> None:
    """Verifica que el grafo serializado forme una única Componente Fuertemente Conexa (SCC)."""
    data = build_or_load_rosario_graph(output_path=GRAPH_JSON_PATH, force_rebuild=False)
    G = nx.DiGraph()
    for n in data["nodes"]:
        G.add_node(n["id"])
    for e in data["edges"]:
        G.add_edge(e["u"], e["v"])

    assert nx.number_strongly_connected_components(G) == 1
