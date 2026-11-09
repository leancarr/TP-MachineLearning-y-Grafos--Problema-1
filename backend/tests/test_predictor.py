"""
Tests unitarios para Ticket 10 (MACHI-17): Predictor vectorizado batch sobre 30k aristas con caché LRU.
"""

from __future__ import annotations

import numpy as np
import pytest

from backend.app.graph.adjacency import DirectedAdjacencyGraph
from backend.app.ml.predictor import (
    NetworkTravelTimePredictor,
    get_global_predictor,
)


@pytest.fixture(scope="module")
def shared_predictor() -> NetworkTravelTimePredictor:
    """Instancia del predictor compartida para la suite de tests."""
    return NetworkTravelTimePredictor()


def test_predict_network_times_shape_and_validity(
    shared_predictor: NetworkTravelTimePredictor,
) -> None:
    """Verifica que prediga todas las 30.053 aristas de Rosario sin nulos ni tiempos negativos."""
    preds, cached, elapsed_ms = shared_predictor.predict_network_times(
        hora_dia=8.5,
        dia_semana="lunes",
        clima="despejado",
        es_feriado=False,
    )

    n_edges = len(shared_predictor.graph.edges)
    assert len(preds) == n_edges
    assert not np.isnan(preds).any()
    assert np.all(preds >= 0.5)
    assert elapsed_ms < 30.0, f"Inferencia batch demoró {elapsed_ms:.2f} ms (> 30 ms)"


def test_lru_cache_speedup(
    shared_predictor: NetworkTravelTimePredictor,
) -> None:
    """Verifica que una consulta repetida se sirva desde caché en < 1 ms."""
    context = (17.5, "viernes", "tormenta", False)

    # Primera consulta (Miss o Hit si ya estaba)
    preds1, _, _ = shared_predictor.predict_network_times(*context)

    # Segunda consulta (Hit garantizado)
    preds2, is_cached, cache_ms = shared_predictor.predict_network_times(*context)

    assert is_cached is True
    assert cache_ms < 1.0, f"Caché LRU tardó {cache_ms:.3f} ms (> 1.0 ms)"
    assert np.array_equal(preds1, preds2)


def test_update_graph_weights_sync(
    shared_predictor: NetworkTravelTimePredictor,
) -> None:
    """Verifica que update_graph_weights sincronice dynamic_weights del grafo."""
    g = shared_predictor.graph
    res = shared_predictor.update_graph_weights(
        hora_dia=12.0, dia_semana="miercoles", clima="nublado", es_feriado=False
    )

    assert res["edges_count"] == len(g.edges)
    assert res["total_ms"] < 25.0
    assert not np.isnan(g.dynamic_weights).any()
    assert np.all(g.dynamic_weights >= 0.5)


def test_congestion_ratios_discrimination(
    shared_predictor: NetworkTravelTimePredictor,
) -> None:
    """Verifica que hora pico con tormenta incremente los ratios de congestión respecto a la madrugada."""
    ratios_madrugada = shared_predictor.get_congestion_ratios(
        hora_dia=3.0, dia_semana="lunes", clima="despejado", es_feriado=False
    )
    ratios_tormenta_pico = shared_predictor.get_congestion_ratios(
        hora_dia=18.5, dia_semana="lunes", clima="tormenta", es_feriado=False
    )

    assert np.mean(ratios_tormenta_pico) > np.mean(ratios_madrugada) * 1.5

    # En avenidas principales, la congestión en tormenta/pico debe superar el ratio 2.0
    avenidas_mask = np.array(
        [e["tipo_calle"] == "avenida" for e in shared_predictor.graph.edges]
    )
    assert np.mean(ratios_tormenta_pico[avenidas_mask]) > 2.0


def test_predict_single_edge(
    shared_predictor: NetworkTravelTimePredictor,
) -> None:
    """Verifica la consulta de tiempo para un tramo puntual."""
    sample_edge = shared_predictor.graph.edges[0]
    tramo_id = sample_edge["tramo_id"]

    t_pred = shared_predictor.predict_single_edge(
        tramo_id=tramo_id,
        hora_dia=8.0,
        dia_semana="lunes",
        clima="despejado",
        es_feriado=False,
    )
    assert isinstance(t_pred, float)
    assert t_pred > 0.0

    with pytest.raises(KeyError):
        shared_predictor.predict_single_edge(
            tramo_id="TRAMO_INEXISTENTE_9999",
            hora_dia=8.0,
            dia_semana="lunes",
            clima="despejado",
            es_feriado=False,
        )


def test_singleton_getter() -> None:
    """Verifica que get_global_predictor retorne la misma instancia activa."""
    p1 = get_global_predictor()
    p2 = get_global_predictor()
    assert p1 is p2
    assert p1.graph is not None
    assert p1.model is not None
