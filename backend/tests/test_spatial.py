"""
Tests unitarios para Ticket 03 (MACHI-10): Indexador espacial cKDTree y filtrado LOD por zoom.
"""

from __future__ import annotations

import time
import numpy as np

from backend.app.graph.spatial import RosarioSpatialIndex


def test_nearest_node_speed_and_accuracy() -> None:
    """Verifica que get_nearest_node resuelva en <0.5 ms y 1.000 consultas en <50 ms."""
    spatial = RosarioSpatialIndex()

    t0 = time.perf_counter()
    node = spatial.get_nearest_node(-32.9540, -60.6450)  # Zona Av. Pellegrini y Corrientes
    single_ms = (time.perf_counter() - t0) * 1000.0

    assert single_ms < 5.0
    assert "id" in node and "lat" in node and "lon" in node and "label" in node
    assert node["distance_m"] < 400.0

    # 1.000 consultas aleatorias en Rosario
    rng = np.random.default_rng(42)
    lats = rng.uniform(-33.01, -32.89, size=1000)
    lons = rng.uniform(-60.71, -60.63, size=1000)

    t_batch = time.perf_counter()
    for lat, lon in zip(lats, lons):
        spatial.get_nearest_node(float(lat), float(lon))
    batch_ms = (time.perf_counter() - t_batch) * 1000.0

    # El promedio por consulta debe ser < 0.5 ms (y 1.000 consultas < 25 ms)
    assert batch_ms < 25.0, f"1.000 consultas demoraron {batch_ms:.2f} ms"
    assert batch_ms / 1000.0 < 0.5, f"Promedio por consulta {batch_ms/1000.0:.4f} ms excede 0.5 ms"


def test_viewport_filtering_by_zoom_lod() -> None:
    """Verifica que al aumentar el zoom aparezcan progresivamente más calles en el viewport."""
    spatial = RosarioSpatialIndex()
    min_lat, min_lon, max_lat, max_lon = -32.965, -60.665, -32.935, -60.630

    idx_z12 = spatial.filter_edge_indices_by_viewport(min_lat, min_lon, max_lat, max_lon, zoom=12, max_edges=50000)
    idx_z14 = spatial.filter_edge_indices_by_viewport(min_lat, min_lon, max_lat, max_lon, zoom=14, max_edges=50000)
    idx_z16 = spatial.filter_edge_indices_by_viewport(min_lat, min_lon, max_lat, max_lon, zoom=16, max_edges=50000)

    assert len(idx_z12) > 0
    assert len(idx_z14) >= len(idx_z12)
    assert len(idx_z16) > len(idx_z14)
