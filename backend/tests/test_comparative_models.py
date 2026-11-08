"""
Tests unitarios para Ticket 08 (MACHI-15): Modelos Comparativos KNN y SVR con muestra estratificada.
"""

from __future__ import annotations

import json
from backend.app.ml.comparative_models import (
     ComparativeModelsTrainer,
    DEFAULT_COMPARATIVE_METRICS_PATH,
    DEFAULT_KNN_METRICS_PATH,
    DEFAULT_KNN_MODEL_PATH,
    DEFAULT_SVR_METRICS_PATH,
    DEFAULT_SVR_MODEL_PATH,
)


def test_comparative_knn_and_svr_models() -> None:
    """Verifica el entrenamiento, métricas sobre Test Set de 20k y exportación de KNN y SVR."""
    trainer = ComparativeModelsTrainer(svr_train_sample_size=6000)
    results = trainer.train_and_evaluate()
    trainer.save()

    assert DEFAULT_KNN_MODEL_PATH.exists()
    assert DEFAULT_KNN_METRICS_PATH.exists()
    assert DEFAULT_SVR_MODEL_PATH.exists()
    assert DEFAULT_SVR_METRICS_PATH.exists()
    assert DEFAULT_COMPARATIVE_METRICS_PATH.exists()

    with open(DEFAULT_COMPARATIVE_METRICS_PATH, "r", encoding="utf-8") as f:
        saved = json.load(f)

    knn = saved["knn"]
    svr = saved["svr"]

    assert knn["model_name"] == "KNeighborsRegressor"
    assert knn["test_metrics"]["r2_score"] > 0.80
    assert knn["test_metrics"]["mae_seg"] < 2.80
    assert knn["inference_1k_ms"] > 0.0

    assert svr["model_name"] == "SVR"
    assert svr["hyperparameters"]["stratified_train_sample_size"] == 6000
    assert svr["test_metrics"]["r2_score"] > 0.78
    assert svr["test_metrics"]["mae_seg"] < 2.80
    assert svr["inference_1k_ms"] > 0.0
    assert results["knn"]["test_metrics"]["r2_score"] == knn["test_metrics"]["r2_score"]
