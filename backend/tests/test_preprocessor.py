"""
Tests unitarios para Ticket 05 (MACHI-12): Pipeline ColumnTransformer sin data leakage (80/20).
"""

from __future__ import annotations

import time
import numpy as np
import pandas as pd
import pytest

from backend.app.graph.builder import build_or_load_rosario_graph
from backend.app.ml.preprocessor import (
    TrafficDataPreprocessor,
    load_dataset_and_split,
)


def test_split_80_20_dimensions() -> None:
    """Verifica que la partición sea exactamente 80% Train (80k) y 20% Test (20k)."""
    preprocessor, X_train, X_test, y_train, y_test = load_dataset_and_split()

    assert X_train.shape[0] == 80000
    assert X_test.shape[0] == 20000
    assert y_train.shape[0] == 80000
    assert y_test.shape[0] == 20000

    # Mismo número de columnas en Train y Test
    assert X_train.shape[1] == X_test.shape[1]
    assert X_train.shape[1] >= 15  # OneHot (7 días + 4 climas + 5 tipos_calle) + 5 numéricas


def test_no_nans_in_transformed_matrices() -> None:
    """Verifica que no existan valores nulos, infinitos ni NaNs tras la transformación."""
    _, X_train, X_test, y_train, y_test = load_dataset_and_split()

    assert not np.isnan(X_train).any()
    assert not np.isnan(X_test).any()
    assert not np.isnan(y_train).any()
    assert not np.isnan(y_test).any()
    assert np.all(np.isfinite(X_train))
    assert np.all(np.isfinite(X_test))


def test_zero_data_leakage_isolation() -> None:
    """Verifica que el escalador numérico aprenda la media y desvío solo de Train."""
    df = pd.DataFrame(
        {
            "dia_semana": ["lunes"] * 8 + ["domingo"] * 2,
            "clima": ["despejado"] * 8 + ["tormenta"] * 2,
            "tipo_calle": ["avenida"] * 8 + ["residencial"] * 2,
            "hora_dia": [8.0] * 8 + [20.0] * 2,
            "es_feriado": [0] * 8 + [1] * 2,
            "jerarquia_osm": [1] * 8 + [4] * 2,
            "longitud_m": [100.0] * 8 + [500.0] * 2,
            "velocidad_promedio_historica": [40.0] * 8 + [20.0] * 2,
            "tiempo_real_viaje": [15.0] * 8 + [90.0] * 2,
        }
    )
    preprocessor = TrafficDataPreprocessor()
    X_train_df, X_test_df, _, _ = preprocessor.split_data(df, test_size=0.2, random_state=42)

    preprocessor.fit(X_train_df)

    num_scaler = preprocessor.transformer.named_transformers_["num"]
    hora_idx = preprocessor.numeric_features.index("hora_dia")

    # La media aprendida debe coincidir exactamente con el Train y diferir del conjunto completo
    assert num_scaler.mean_[hora_idx] == pytest.approx(X_train_df["hora_dia"].mean(), abs=1e-5)
    assert abs(num_scaler.mean_[hora_idx] - df["hora_dia"].mean()) > 0.5



def test_handle_unknown_categories_gracefully() -> None:
    """Verifica que ante una categoría no vista (ej. clima 'nevando'), no lance error."""
    preprocessor = TrafficDataPreprocessor()
    dummy_train = pd.DataFrame(
        {
            "dia_semana": ["lunes", "martes"],
            "clima": ["despejado", "lluvia"],
            "tipo_calle": ["avenida", "residencial"],
            "hora_dia": [8.0, 18.0],
            "es_feriado": [0, 0],
            "jerarquia_osm": [1, 4],
            "longitud_m": [100.0, 200.0],
            "velocidad_promedio_historica": [40.0, 30.0],
            "tiempo_real_viaje": [10.0, 25.0],
        }
    )
    preprocessor.fit(dummy_train)

    # Inferencia con categoría desconocida
    unseen_test = pd.DataFrame(
        {
            "dia_semana": ["lunes"],
            "clima": ["granizo_imposible"],
            "tipo_calle": ["callejon_desconocido"],
            "hora_dia": [12.0],
            "es_feriado": [1],
            "jerarquia_osm": [2],
            "longitud_m": [150.0],
            "velocidad_promedio_historica": [35.0],
        }
    )
    transformed = preprocessor.transform(unseen_test)
    assert transformed.shape == (1, len(preprocessor.feature_names_))
    assert not np.isnan(transformed).any()


def test_prepare_graph_batch_speed_under_20ms() -> None:
    """Verifica que prepare_graph_batch para las 30.053 aristas de Rosario demore < 20 ms."""
    graph_data = build_or_load_rosario_graph(force_rebuild=False)
    edges = graph_data["edges"]

    preprocessor, _, _, _, _ = load_dataset_and_split()

    # Primera llamada inicializa la plantilla base
    _ = preprocessor.prepare_graph_batch(edges, 12.0, "lunes", "despejado", False)

    # Segunda llamada (simula el cambio de slider del usuario en la web)
    t0 = time.perf_counter()
    batch_matrix = preprocessor.prepare_graph_batch(
        edges=edges,
        hora_dia=18.5,
        dia_semana="viernes",
        clima="tormenta",
        es_feriado=False,
    )
    elapsed_ms = (time.perf_counter() - t0) * 1000.0

    assert batch_matrix.shape[0] == len(edges)
    assert batch_matrix.shape[1] == len(preprocessor.feature_names_)
    assert not np.isnan(batch_matrix).any()
    assert elapsed_ms < 15.0, f"prepare_graph_batch tardó {elapsed_ms:.2f} ms (> 15 ms)"



def test_preprocessor_save_and_load(tmp_path) -> None:
    """Verifica la persistencia con joblib."""
    preprocessor, X_train, _, _, _ = load_dataset_and_split()
    save_path = tmp_path / "test_preproc.joblib"

    preprocessor.save(save_path)
    assert save_path.exists()

    loaded = TrafficDataPreprocessor.load(save_path)
    assert loaded.is_fitted is True
    assert loaded.feature_names_ == preprocessor.feature_names_

    # Comprobar que produce exactamente los mismos valores transformados
    trans_orig = preprocessor.transform(pd.DataFrame(
        [
            {
                "dia_semana": "lunes",
                "clima": "despejado",
                "tipo_calle": "avenida",
                "hora_dia": 8.0,
                "es_feriado": 0,
                "jerarquia_osm": 1,
                "longitud_m": 120.0,
                "velocidad_promedio_historica": 45.0,
            }
        ]
    ))
    trans_loaded = loaded.transform(pd.DataFrame(
        [
            {
                "dia_semana": "lunes",
                "clima": "despejado",
                "tipo_calle": "avenida",
                "hora_dia": 8.0,
                "es_feriado": 0,
                "jerarquia_osm": 1,
                "longitud_m": 120.0,
                "velocidad_promedio_historica": 45.0,
            }
        ]
    ))
    assert np.allclose(trans_orig, trans_loaded)
