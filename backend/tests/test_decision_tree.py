"""
Tests unitarios para Ticket 07 (MACHI-14): Modelo Principal: Árbol de Decisión & Tuning.
"""

from __future__ import annotations

import time
import numpy as np
import pytest

from backend.app.ml.decision_tree import (
    TrafficDecisionTreeTrainer,
    DEFAULT_MODEL_PATH,
    DEFAULT_METRICS_PATH,
)
from backend.app.ml.preprocessor import load_dataset_and_split


@pytest.fixture(scope="module")
def trained_trainer() -> TrafficDecisionTreeTrainer:
    """Entrena y evalúa una instancia del Árbol de Decisión compartida."""
    trainer = TrafficDecisionTreeTrainer(max_depth=16, min_samples_leaf=10)
    trainer.train_and_evaluate()
    return trainer


def test_decision_tree_target_r2_above_88(
    trained_trainer: TrafficDecisionTreeTrainer,
) -> None:
    """Verifica que el coeficiente de determinación R² en Test sea >= 0.88."""
    r2_test = trained_trainer.metrics_["test_metrics"]["r2_score"]
    assert r2_test >= 0.88, f"R² en Test ({r2_test}) es inferior al umbral 0.88"


def test_decision_tree_low_overfitting_gap(
    trained_trainer: TrafficDecisionTreeTrainer,
) -> None:
    """Verifica que la brecha entre Train y Test sea < 0.03 (control estricto de overfitting)."""
    gap = trained_trainer.metrics_["overfitting_gap_r2"]
    assert gap < 0.03, f"Brecha de sobreajuste ({gap}) excede el límite de 0.03"


def test_decision_tree_mae_and_rmse_bounds(
    trained_trainer: TrafficDecisionTreeTrainer,
) -> None:
    """Verifica que el MAE sea < 2.5s y que RMSE no se dispare."""
    mae = trained_trainer.metrics_["test_metrics"]["mae_seg"]
    rmse = trained_trainer.metrics_["test_metrics"]["rmse_seg"]

    assert mae < 2.5, f"MAE ({mae}s) excede 2.5s"
    assert rmse < 6.0, f"RMSE ({rmse}s) excede 6.0s"
    assert rmse >= mae, "RMSE debe ser siempre >= MAE matemáticamente"


def test_decision_tree_feature_importances(
    trained_trainer: TrafficDecisionTreeTrainer,
) -> None:
    """Verifica que las variables físicas y contextuales principales tengan peso positivo."""
    importances = trained_trainer.metrics_["feature_importances"]
    assert len(importances) >= 5

    features_dict = {item["feature"]: item["importance_pct"] for item in importances}
    # La longitud física en metros debe ser la variable más determinante
    assert "longitud_m" in features_dict
    assert features_dict["longitud_m"] > 50.0

    # Variables climáticas y horarias deben tener peso no nulo
    assert any("clima" in f for f in features_dict)
    assert any("hora" in f for f in features_dict)


def test_decision_tree_inference_speed_1k(
    trained_trainer: TrafficDecisionTreeTrainer,
) -> None:
    """Verifica que la inferencia de 1.000 muestras tome < 5.0 ms."""
    _, _, X_test, _, _ = load_dataset_and_split()
    sample_1k = X_test[:1000]

    # Warmup
    _ = trained_trainer.model.predict(sample_1k)

    t0 = time.perf_counter()
    preds = trained_trainer.model.predict(sample_1k)
    elapsed_ms = (time.perf_counter() - t0) * 1000.0

    assert len(preds) == 1000
    assert not np.isnan(preds).any()
    assert np.all(preds > 0.0)
    assert elapsed_ms < 5.0, f"Inferencia de 1k demoró {elapsed_ms:.2f} ms (> 5.0 ms)"


def test_decision_tree_serialization_and_reproducibility(
    trained_trainer: TrafficDecisionTreeTrainer,
    tmp_path,
) -> None:
    """Verifica que el modelo se guarde y recargue produciendo predicciones idénticas."""
    test_model_file = tmp_path / "tree.joblib"
    test_metrics_file = tmp_path / "metrics.json"

    trained_trainer.save(model_path=test_model_file, metrics_path=test_metrics_file)

    assert test_model_file.exists()
    assert test_metrics_file.exists()

    loaded_model = TrafficDecisionTreeTrainer.load(test_model_file)
    _, _, X_test, _, _ = load_dataset_and_split()

    orig_preds = trained_trainer.model.predict(X_test[:50])
    loaded_preds = loaded_model.predict(X_test[:50])

    assert np.allclose(orig_preds, loaded_preds)
