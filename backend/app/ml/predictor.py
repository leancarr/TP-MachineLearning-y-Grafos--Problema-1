"""
Ticket 10 (MACHI-17): Predictor vectorizado batch sobre 30k aristas con caché LRU.

Mantiene en RAM:
- El modelo entrenado de producción (`DecisionTreeRegressor`).
- El preprocesador (`TrafficDataPreprocessor`) con la plantilla base de aristas.
- La estructura de grafo (`DirectedAdjacencyGraph`).

Funcionalidades clave:
1. `predict_network_times()`: Vectorizado matricial sobre las 30.053 aristas de Rosario en < 15 ms.
2. Caché LRU de contextos: Si la consulta (hora, día, clima, feriado) ya fue calculada, responde en < 0.1 ms.
3. `update_graph_weights()`: Inyecta las predicciones directamente en `dynamic_weights` de la adyacencia en RAM.
4. `get_congestion_ratios()`: Calcula el ratio de congestión (tiempo_predicho / tiempo_base) para coloreado en el mapa (verde, amarillo, rojo).
"""

from __future__ import annotations

from collections import OrderedDict
from dataclasses import dataclass
from pathlib import Path
import time
from typing import Any
import numpy as np

from backend.app.graph.adjacency import DirectedAdjacencyGraph
from backend.app.ml.decision_tree import DEFAULT_MODEL_PATH, TrafficDecisionTreeTrainer
from backend.app.ml.preprocessor import (
    DEFAULT_PREPROCESSOR_PATH,
    TrafficDataPreprocessor,
)


@dataclass(frozen=True, slots=True)
class ContextKey:
    """Clave inmutable normalizada para la caché LRU de contextos urbanos."""


    hora_dia: float
    dia_semana: str
    clima: str
    es_feriado: bool

    @classmethod
    def from_raw(
        cls, hora_dia: float, dia_semana: str, clima: str, es_feriado: bool | int
    ) -> ContextKey:
        return cls(
            hora_dia=round(float(hora_dia), 1),
            dia_semana=dia_semana.lower().strip(),
            clima=clima.lower().strip(),
            es_feriado=bool(es_feriado),
        )


class NetworkTravelTimePredictor:
    """
    Predictor de tiempos de viaje en memoria RAM para la red vial completa de Rosario.
    """

    def __init__(
        self,
        graph: DirectedAdjacencyGraph | None = None,
        model: Any | None = None,
        preprocessor: TrafficDataPreprocessor | None = None,
        max_cache_size: int = 64,
    ) -> None:
        self.graph = graph if graph is not None else DirectedAdjacencyGraph()
        self.model = (
            model
            if model is not None
            else TrafficDecisionTreeTrainer.load(DEFAULT_MODEL_PATH)
        )
        self.preprocessor = (
            preprocessor
            if preprocessor is not None
            else TrafficDataPreprocessor.load(DEFAULT_PREPROCESSOR_PATH)
        )
        self.max_cache_size = max_cache_size
        self._lru_cache: OrderedDict[ContextKey, np.ndarray] = OrderedDict()
        self._last_context: ContextKey | None = None

        # Pre-calentamiento perezoso de la plantilla de features de aristas
        _ = self.preprocessor.prepare_graph_batch(
            self.graph.edges,
            hora_dia=12.0,
            dia_semana="lunes",
            clima="despejado",
            es_feriado=False,
        )

    def predict_network_times(
        self,
        hora_dia: float,
        dia_semana: str,
        clima: str,
        es_feriado: bool | int,
    ) -> tuple[np.ndarray, bool, float]:
        """
        Predice los tiempos de cruce (en segundos) de las 30.053 aristas de Rosario.
        Retorna: (tiempos_segundos, is_cached_hit, elapsed_ms).
        """
        key = ContextKey.from_raw(hora_dia, dia_semana, clima, es_feriado)

        t0 = time.perf_counter()
        if key in self._lru_cache:
            # Hit de caché: mueve la entrada al final para mantener el orden LRU
            self._lru_cache.move_to_end(key)
            cached_array = self._lru_cache[key]
            elapsed_ms = (time.perf_counter() - t0) * 1000.0
            return cached_array, True, elapsed_ms

        # Miss de caché: calcula matriz de features y evalúa el árbol
        batch_matrix = self.preprocessor.prepare_graph_batch(
            self.graph.edges,
            hora_dia=key.hora_dia,
            dia_semana=key.dia_semana,
            clima=key.clima,
            es_feriado=key.es_feriado,
        )

        preds = self.model.predict(batch_matrix)
        preds = np.maximum(preds, 0.5)  # Restricción física de tiempo mínimo
        preds_clean = np.asarray(preds, dtype=np.float64)

        # Inserción en caché con desalojo si supera max_cache_size
        if len(self._lru_cache) >= self.max_cache_size:
            self._lru_cache.popitem(last=False)
        self._lru_cache[key] = preds_clean

        elapsed_ms = (time.perf_counter() - t0) * 1000.0
        return preds_clean, False, elapsed_ms

    def update_graph_weights(
        self,
        hora_dia: float,
        dia_semana: str,
        clima: str,
        es_feriado: bool | int,
    ) -> dict[str, Any]:
        """
        Predice y actualiza los pesos dinámicos en la memoria RAM del grafo dirigido.
        """
        preds, is_cached, elapsed_ms = self.predict_network_times(
            hora_dia, dia_semana, clima, es_feriado
        )

        t_up = time.perf_counter()
        self.graph.update_weights(preds)
        update_ms = (time.perf_counter() - t_up) * 1000.0
        self._last_context = ContextKey.from_raw(
            hora_dia, dia_semana, clima, es_feriado
        )

        return {
            "edges_count": len(preds),
            "cached": is_cached,
            "prediction_ms": round(elapsed_ms, 3),
            "graph_update_ms": round(update_ms, 3),
            "total_ms": round(elapsed_ms + update_ms, 3),
            "mean_travel_time_seg": round(float(np.mean(preds)), 2),
            "max_travel_time_seg": round(float(np.max(preds)), 2),
        }

    def get_congestion_ratios(
        self,
        hora_dia: float,
        dia_semana: str,
        clima: str,
        es_feriado: bool | int,
    ) -> np.ndarray:
        """
        Retorna un arreglo float64 de longitud E con el ratio de congestión:
        ratio = tiempo_predicho / tiempo_base.

        Semántica visual para el frontend:
        - ratio <= 1.20: Tráfico fluido (Verde).
        - 1.20 < ratio <= 1.80: Congestión moderada (Amarillo / Naranja).
        - ratio > 1.80: Congestión pesada (Rojo).
        """
        preds, _, _ = self.predict_network_times(
            hora_dia, dia_semana, clima, es_feriado
        )
        base = self.graph.base_times
        return np.round(preds / base, 3)

    def predict_single_edge(
        self,
        tramo_id: str,
        hora_dia: float,
        dia_semana: str,
        clima: str,
        es_feriado: bool | int,
    ) -> float:
        """Obtiene el tiempo predicho para un tramo específico."""
        idx = self.graph.edge_index_by_tramo_id.get(tramo_id)
        if idx is None:
            raise KeyError(f"Tramo '{tramo_id}' no existe en el grafo de Rosario.")
        preds, _, _ = self.predict_network_times(
            hora_dia, dia_semana, clima, es_feriado
        )
        return float(preds[idx])


# Instancia Singleton compartida para la API de FastAPI
_GLOBAL_PREDICTOR: NetworkTravelTimePredictor | None = None


def get_global_predictor() -> NetworkTravelTimePredictor:
    """Retorna la instancia singleton del predictor en RAM."""
    global _GLOBAL_PREDICTOR
    if _GLOBAL_PREDICTOR is None:
        _GLOBAL_PREDICTOR = NetworkTravelTimePredictor()
    return _GLOBAL_PREDICTOR
