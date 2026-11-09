"""
Tests unitarios para Ticket 11 (MACHI-18): Estructura de adyacencia dirigida en memoria.
"""

from __future__ import annotations

import time
import numpy as np

from backend.app.graph.adjacency import DirectedAdjacencyGraph


def test_directed_adjacency_and_update_weights_speed() -> None:
    """Verifica el diccionario `adj[u] = [(v, tramo_id, peso_estatico), ...]` y update_weights en <5 ms."""
    g = DirectedAdjacencyGraph()

    assert len(g.adj) == len(g.nodes)
    sample_u = g.nodes[0]["id"]
    assert len(g.adj[sample_u]) > 0
    v, tramo_id, peso_estatico = g.adj[sample_u][0]
    assert isinstance(v, int)
    assert isinstance(tramo_id, str)
    assert peso_estatico > 0.0

    # Actualizar las ~30.053 aristas con un vector NumPy debe tardar < 5 ms
    new_weights = g.base_times * 1.85
    t0 = time.perf_counter()
    g.update_weights(new_weights)
    elapsed_ms = (time.perf_counter() - t0) * 1000.0

    assert elapsed_ms < 5.0, f"update_weights tardó {elapsed_ms:.3f} ms (> 5.0 ms)"
    assert np.allclose(g.dynamic_weights, new_weights)
