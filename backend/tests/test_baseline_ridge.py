"""
Tests unitarios para Ticket 06 (MACHI-13): Modelo Baseline Regresión Lineal Ridge.
"""

from __future__ import annotations

import json
from backend.app.ml.baseline_ridge import (
    DEFAULT_BASELINE_METRICS_PATH,
    DEFAULT_RIDGE_MODEL_PATH,
    TrafficRidgeBaselineTrainer,
)


def test_ridge_baseline_training_and_metrics() -> None:
    """Verifica el entrenamiento de Ridge(alpha=1.0), exportación de baseline_metrics.json y limitación teórica."""
    trainer = TrafficRidgeBaselineTrainer(alpha=1.0)
    metrics = trainer.train_and_evaluate()
    m_path, j_path = trainer.save()

    assert m_path.exists()
    assert j_path.exists()

    with open(DEFAULT_BASELINE_METRICS_PATH, "r", encoding="utf-8") as f:
        saved = json.load(f)

    assert saved["model_name"] == "Ridge"
    assert 0.50 <= saved["test_metrics"]["r2_score"] < 0.85
    assert saved["test_metrics"]["mae_seg"] > 1.5
    assert saved["test_metrics"]["rmse_seg"] > 4.2
    assert "bimodal" in saved["theoretical_limitation"].lower()
    assert len(saved["coefficients"]) >= 10

    loaded_model = TrafficRidgeBaselineTrainer.load(DEFAULT_RIDGE_MODEL_PATH)
    assert hasattr(loaded_model, "coef_")
