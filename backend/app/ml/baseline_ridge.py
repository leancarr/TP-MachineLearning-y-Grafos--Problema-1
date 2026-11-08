"""
Ticket 06 (MACHI-13): Modelo Baseline: Regresión Lineal Ridge y primeras métricas.

Entrena y evalúa `Ridge(alpha=1.0)` como modelo baseline lineal sobre el conjunto
de entrenamiento (80k) y evalúa sobre el conjunto de test separado (20k):
- Calcula MAE, RMSE y R² en Train y Test.
- Registra los coeficientes lineales aprendidos.
- Documenta formalmente por qué un hiperplano aditivo lineal falla en capturar:
  1) La curva horaria bimodal de Rosario (picos 08:00 y 18:30 hs separados por valles).
  2) Las interacciones multiplicativas entre longitud, tipo de vía y clima.
- Exporta `backend/app/data/baseline_metrics.json` y `backend/app/data/ridge_model.joblib`.
"""

from __future__ import annotations

import json
from pathlib import Path
import time
from typing import Any
import joblib
import numpy as np
from sklearn.linear_model import Ridge

from backend.app.ml.decision_tree import evaluate_regression
from backend.app.ml.preprocessor import (
    DEFAULT_DATA_DIR,
    TrafficDataPreprocessor,
    load_dataset_and_split,
)

DEFAULT_RIDGE_MODEL_PATH = DEFAULT_DATA_DIR / "ridge_model.joblib"
DEFAULT_BASELINE_METRICS_PATH = DEFAULT_DATA_DIR / "baseline_metrics.json"

THEORETICAL_LIMITATION_NOTE = (
    "La Regresión Lineal con regularización L2 (Ridge) modela el tiempo de viaje como una "
    "combinación lineal aditiva de las features: y_hat = w_0 + sum(w_i * x_i). "
    "Esto presenta dos limitaciones estructurales frente a la dinámica urbana de Rosario: "
    "(1) No-monotonía horaria (curva bimodal): la variable numérica `hora_dia` (0 a 23.99) "
    "posee dos picos de congestión (07:30-09:30 y 17:30-19:30) separados por valles de flujo "
    "medio al mediodía y flujo libre a la madrugada; una única pendiente lineal w_hora * hora_dia "
    "es incapaz de subir, bajar y volver a subir sin ingeniería manual de splines o bines horarios. "
    "(2) Interacción multiplicativa entre longitud, jerarquía y clima: el impacto de una tormenta "
    "o de la hora pico escala proporcionalmente al tiempo físico base (longitud / velocidad) y se "
    "concentra en avenidas y arterias comerciales, mientras que un modelo lineal suma segundos fijos "
    "independientemente de si la cuadra mide 30 m o 400 m."
)


class TrafficRidgeBaselineTrainer:
    """Entrenador y evaluador del modelo Baseline de Regresión Lineal (Ridge)."""

    def __init__(self, alpha: float = 1.0, random_state: int = 42) -> None:
        self.alpha = alpha
        self.random_state = random_state
        self.model = Ridge(alpha=self.alpha, random_state=self.random_state)
        self.preprocessor: TrafficDataPreprocessor | None = None
        self.metrics_: dict[str, Any] = {}
        self.is_trained: bool = False

    def train_and_evaluate(
        self,
        csv_path: Path | str | None = None,
    ) -> dict[str, Any]:
        """Entrena Ridge en 80% Train y evalúa MAE, RMSE y R² sobre 20% Test."""
        preprocessor, X_train, X_test, y_train, y_test = load_dataset_and_split(
            csv_path=csv_path
        )
        self.preprocessor = preprocessor

        t0_train = time.perf_counter()
        self.model.fit(X_train, y_train)
        train_time_sec = time.perf_counter() - t0_train

        y_train_pred = np.maximum(self.model.predict(X_train), 0.5)
        y_test_pred = np.maximum(self.model.predict(X_test), 0.5)

        train_metrics = evaluate_regression(y_train, y_train_pred)
        test_metrics = evaluate_regression(y_test, y_test_pred)

        # Tiempo de inferencia sobre 1.000 muestras
        sample_1k = X_test[:1000]
        t0_inf = time.perf_counter()
        _ = self.model.predict(sample_1k)
        inf_1k_ms = (time.perf_counter() - t0_inf) * 1000.0

        feature_names = preprocessor.feature_names_
        coefs = self.model.coef_
        sorted_idx = np.argsort(np.abs(coefs))[::-1]
        top_coefficients = [
            {
                "feature": feature_names[i],
                "coefficient": round(float(coefs[i]), 4),
            }
            for i in sorted_idx
        ]

        overfitting_gap = round(
            abs(train_metrics["r2_score"] - test_metrics["r2_score"]), 4
        )

        self.metrics_ = {
            "model_name": "Ridge",
            "hyperparameters": {
                "alpha": self.alpha,
                "random_state": self.random_state,
            },
            "train_metrics": train_metrics,
            "test_metrics": test_metrics,
            "overfitting_gap_r2": overfitting_gap,
            "train_time_sec": round(train_time_sec, 4),
            "inference_1k_ms": round(inf_1k_ms, 4),
            "intercept": round(float(self.model.intercept_), 4),
            "coefficients": top_coefficients,
            "theoretical_limitation": THEORETICAL_LIMITATION_NOTE,
        }
        self.is_trained = True
        return self.metrics_

    def save(
        self,
        model_path: Path | str | None = None,
        metrics_path: Path | str | None = None,
    ) -> tuple[Path, Path]:
        """Guarda el modelo Ridge en joblib y las métricas en JSON."""
        if not self.is_trained:
            raise ValueError("El modelo Ridge no fue entrenado todavía.")

        out_model = Path(model_path or DEFAULT_RIDGE_MODEL_PATH)
        out_metrics = Path(metrics_path or DEFAULT_BASELINE_METRICS_PATH)
        out_model.parent.mkdir(parents=True, exist_ok=True)

        joblib.dump(self.model, out_model)
        with open(out_metrics, "w", encoding="utf-8") as f:
            json.dump(self.metrics_, f, indent=2, ensure_ascii=False)

        return out_model, out_metrics

    @classmethod
    def load(cls, model_path: Path | str | None = None) -> Ridge:
        """Carga el modelo Ridge serializado."""
        path = Path(model_path or DEFAULT_RIDGE_MODEL_PATH)
        if not path.exists():
            raise FileNotFoundError(f"Modelo Ridge no encontrado en: {path}")
        return joblib.load(path)


if __name__ == "__main__":
    trainer = TrafficRidgeBaselineTrainer(alpha=1.0)
    metrics = trainer.train_and_evaluate()
    m_path, j_path = trainer.save()
    print("=== MODELO BASELINE RIDGE ENTRENADO CON ÉXITO ===")
    print(f"Modelo: {m_path}")
    print(f"Métricas: {j_path}")
    print(f"Test R²:   {metrics['test_metrics']['r2_score']}")
    print(f"Test MAE:  {metrics['test_metrics']['mae_seg']} seg")
    print(f"Test RMSE: {metrics['test_metrics']['rmse_seg']} seg")
