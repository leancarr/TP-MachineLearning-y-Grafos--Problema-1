"""
Ticket 05 (MACHI-12): Pipeline ColumnTransformer sin data leakage (80/20).

Implementa el preprocesador modular y reproducible con:
- OneHotEncoder(handle_unknown='ignore') para variables categóricas (dia_semana, clima, tipo_calle).
- StandardScaler() para variables numéricas (hora_dia, es_feriado, jerarquia_osm, longitud_m, velocidad_promedio_historica).
- Partición estricta 80% Train (80k) / 20% Test (20k) con random_state=42.
- Ajuste exclusivo sobre Train para garantizar cero data leakage.
- Generador de matriz de contexto batch para inferencia instantánea sobre las 30.053 aristas de Rosario.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any
import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import OneHotEncoder, StandardScaler

DEFAULT_DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DEFAULT_CSV_PATH = DEFAULT_DATA_DIR / "viajes_historicos.csv"
DEFAULT_PREPROCESSOR_PATH = DEFAULT_DATA_DIR / "preprocessor.joblib"

CATEGORICAL_FEATURES = ["dia_semana", "clima", "tipo_calle"]
NUMERIC_FEATURES = [
    "hora_dia",
    "es_feriado",
    "jerarquia_osm",
    "longitud_m",
    "velocidad_promedio_historica",
]
ALL_FEATURES = CATEGORICAL_FEATURES + NUMERIC_FEATURES
TARGET_COLUMN = "tiempo_real_viaje"


class TrafficDataPreprocessor:
    """
    Pipeline de preprocesamiento scikit-learn con ColumnTransformer.
    Garantiza aislamiento estricto de Train/Test sin fuga de datos (data leakage).
    """

    def __init__(self) -> None:
        self.categorical_features = list(CATEGORICAL_FEATURES)
        self.numeric_features = list(NUMERIC_FEATURES)
        self.all_features = list(ALL_FEATURES)
        self.target_column = TARGET_COLUMN

        self.transformer: ColumnTransformer = ColumnTransformer(
            transformers=[
                (
                    "cat",
                    OneHotEncoder(
                        handle_unknown="ignore",
                        sparse_output=False,
                    ),
                    self.categorical_features,
                ),
                (
                    "num",
                    StandardScaler(),
                    self.numeric_features,
                ),
            ],
            remainder="drop",
        )
        self.is_fitted: bool = False
        self.feature_names_: list[str] = []

    def prepare_dataframe(self, df: pd.DataFrame) -> pd.DataFrame:
        """Normaliza tipos de datos (ej. booleanos a enteros 0/1) y valida columnas requeridas."""
        clean_df = df.copy()
        if "es_feriado" in clean_df.columns:
            clean_df["es_feriado"] = clean_df["es_feriado"].astype(int)
        if "hora_dia" in clean_df.columns:
            clean_df["hora_dia"] = clean_df["hora_dia"].astype(float)
        if "jerarquia_osm" in clean_df.columns:
            clean_df["jerarquia_osm"] = clean_df["jerarquia_osm"].astype(int)
        if "longitud_m" in clean_df.columns:
            clean_df["longitud_m"] = clean_df["longitud_m"].astype(float)
        if "velocidad_promedio_historica" in clean_df.columns:
            clean_df["velocidad_promedio_historica"] = clean_df[
                "velocidad_promedio_historica"
            ].astype(float)
        return clean_df

    def split_data(
        self,
        df: pd.DataFrame,
        test_size: float = 0.2,
        random_state: int = 42,
    ) -> tuple[pd.DataFrame, pd.DataFrame, pd.Series, pd.Series]:
        """
        Divide el dataset en 80% Train y 20% Test de forma determinista.
        """
        clean_df = self.prepare_dataframe(df)
        X = clean_df[self.all_features]
        y = clean_df[self.target_column].astype(float)

        return train_test_split(
            X,
            y,
            test_size=test_size,
            random_state=random_state,
        )

    def fit(self, X_train: pd.DataFrame) -> TrafficDataPreprocessor:
        """Ajusta el encoder y el escalador únicamente con el conjunto de entrenamiento."""
        X_clean = self.prepare_dataframe(X_train)[self.all_features]
        self.transformer.fit(X_clean)
        self.is_fitted = True

        # Extraer nombres legibles de características resultantes
        cat_encoder: OneHotEncoder = self.transformer.named_transformers_["cat"]
        cat_names = list(
            cat_encoder.get_feature_names_out(self.categorical_features)
        )
        self.feature_names_ = cat_names + self.numeric_features
        return self

    def transform(self, X: pd.DataFrame) -> np.ndarray:
        """Transforma un conjunto de datos a una matriz NumPy lista para regresión."""
        if not self.is_fitted:
            raise ValueError(
                "El preprocesador no ha sido ajustado. Llame a .fit() primero."
            )
        X_clean = self.prepare_dataframe(X)[self.all_features]
        transformed = self.transformer.transform(X_clean)
        return np.asarray(transformed, dtype=np.float64)

    def fit_transform(self, X_train: pd.DataFrame) -> np.ndarray:
        """Ajusta y transforma en una sola operación optimizada."""
        return self.fit(X_train).transform(X_train)

    def prepare_graph_batch(
        self,
        edges: list[dict[str, Any]],
        hora_dia: float,
        dia_semana: str,
        clima: str,
        es_feriado: bool | int,
    ) -> np.ndarray:
        """
        Construye y transforma la matriz de features para TODAS las aristas de Rosario
        bajo un contexto específico (hora, día, clima, feriado) en <5 ms utilizando
        pre-cálculo estático vectorizado sobre NumPy.
        """
        if not self.is_fitted:
            raise ValueError(
                "El preprocesador no ha sido ajustado. Llame a .fit() primero."
            )

        cat_encoder: OneHotEncoder = self.transformer.named_transformers_["cat"]
        num_scaler: StandardScaler = self.transformer.named_transformers_["num"]

        # Inicialización perezosa de la plantilla estática de aristas
        if not hasattr(self, "_static_edge_count") or self._static_edge_count != len(edges):
            self._init_static_graph_template(edges, cat_encoder, num_scaler)

        dia_clean = dia_semana.lower().strip()
        clima_clean = clima.lower().strip()

        # Índices one-hot de día y clima
        dia_cats = list(cat_encoder.categories_[0])
        clima_cats = list(cat_encoder.categories_[1])
        dia_offset = dia_cats.index(dia_clean) if dia_clean in dia_cats else -1
        clima_offset = (
            (len(dia_cats) + clima_cats.index(clima_clean))
            if clima_clean in clima_cats
            else -1
        )

        hora_val = float(hora_dia)
        feriado_val = float(int(bool(es_feriado)))

        # Valores estandarizados de hora y feriado
        hora_scaled = (hora_val - num_scaler.mean_[0]) / num_scaler.scale_[0]
        feriado_scaled = (feriado_val - num_scaler.mean_[1]) / num_scaler.scale_[1]

        # Copia rápida de la plantilla base en RAM
        batch_matrix = self._static_graph_template.copy()

        if dia_offset >= 0:
            batch_matrix[:, dia_offset] = 1.0
        if clima_offset >= 0:
            batch_matrix[:, clima_offset] = 1.0

        num_start_col = self._num_start_col
        batch_matrix[:, num_start_col] = hora_scaled
        batch_matrix[:, num_start_col + 1] = feriado_scaled

        return batch_matrix

    def _init_static_graph_template(
        self,
        edges: list[dict[str, Any]],
        cat_encoder: OneHotEncoder,
        num_scaler: StandardScaler,
    ) -> None:
        """Inicializa la matriz base estática (tipo de calle, jerarquía, longitud, velocidad)."""
        n_edges = len(edges)
        total_features = len(self.feature_names_)
        self._static_graph_template = np.zeros((n_edges, total_features), dtype=np.float64)

        # One-hot de tipo_calle (tercer transformador categórico)
        n_dia_cats = len(cat_encoder.categories_[0])
        n_clima_cats = len(cat_encoder.categories_[1])
        tipo_cats = list(cat_encoder.categories_[2])
        tipo_col_offset = n_dia_cats + n_clima_cats
        self._num_start_col = tipo_col_offset + len(tipo_cats)

        for i, e in enumerate(edges):
            t_calle = str(e["tipo_calle"]).lower().strip()
            if t_calle in tipo_cats:
                col = tipo_col_offset + tipo_cats.index(t_calle)
                self._static_graph_template[i, col] = 1.0

        # Columnas numéricas estáticas: jerarquia_osm (idx 2), longitud_m (idx 3), velocidad (idx 4)
        jerarquias = np.array([float(e["jerarquia_osm"]) for e in edges], dtype=np.float64)
        longitudes = np.array([float(e["longitud_m"]) for e in edges], dtype=np.float64)
        velocidades = np.array(
            [float(e["velocidad_promedio_historica"]) for e in edges], dtype=np.float64
        )

        self._static_graph_template[:, self._num_start_col + 2] = (
            jerarquias - num_scaler.mean_[2]
        ) / num_scaler.scale_[2]
        self._static_graph_template[:, self._num_start_col + 3] = (
            longitudes - num_scaler.mean_[3]
        ) / num_scaler.scale_[3]
        self._static_graph_template[:, self._num_start_col + 4] = (
            velocidades - num_scaler.mean_[4]
        ) / num_scaler.scale_[4]

        self._static_edge_count = n_edges


    def save(self, filepath: Path | str | None = None) -> Path:
        """Serializa el preprocesador entrenado usando joblib."""
        if not self.is_fitted:
            raise ValueError("No se puede guardar un preprocesador sin ajustar.")
        out_path = Path(filepath or DEFAULT_PREPROCESSOR_PATH)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(self, out_path)
        return out_path

    @classmethod
    def load(cls, filepath: Path | str | None = None) -> TrafficDataPreprocessor:
        """Carga un preprocesador serializado previamente."""
        in_path = Path(filepath or DEFAULT_PREPROCESSOR_PATH)
        if not in_path.exists():
            raise FileNotFoundError(f"No se encontró el preprocesador en: {in_path}")
        loaded = joblib.load(in_path)
        if not isinstance(loaded, cls):
            raise TypeError(f"El objeto cargado no es de tipo {cls.__name__}")
        return loaded


def load_dataset_and_split(
    csv_path: Path | str | None = None,
    test_size: float = 0.2,
    random_state: int = 42,
) -> tuple[
    TrafficDataPreprocessor,
    np.ndarray,
    np.ndarray,
    np.ndarray,
    np.ndarray,
]:
    """
    Función utilitaria integral que:
    1. Carga `viajes_historicos.csv`.
    2. Divide en 80% Train y 20% Test.
    3. Ajusta el preprocesador únicamente en Train (sin data leakage).
    4. Retorna (preprocessor, X_train_proc, X_test_proc, y_train, y_test).
    """
    path = Path(csv_path or DEFAULT_CSV_PATH)
    if not path.exists():
        raise FileNotFoundError(f"Dataset de viajes no encontrado en: {path}")

    df = pd.read_csv(path)
    preprocessor = TrafficDataPreprocessor()
    X_train_df, X_test_df, y_train_s, y_test_s = preprocessor.split_data(
        df, test_size=test_size, random_state=random_state
    )

    X_train_proc = preprocessor.fit_transform(X_train_df)
    X_test_proc = preprocessor.transform(X_test_df)
    y_train = y_train_s.to_numpy(dtype=np.float64)
    y_test = y_test_s.to_numpy(dtype=np.float64)

    return preprocessor, X_train_proc, X_test_proc, y_train, y_test
