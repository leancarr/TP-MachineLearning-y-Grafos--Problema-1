"""
Ticket 11 (MACHI-18): Estructura de adyacencia dirigida en memoria.

Implementa una estructura de grafo propia en Python liviana indexada por enteros
`adj[u] = [(v, tramo_id, peso_estatico), ...]` y por índice contiguo de arista `(0..E-1)`,
preparada para reasignación ultrarrápida de pesos dinámicos (`update_weights`) en <5 ms.
"""

from __future__ import annotations

from typing import Any
import numpy as np

from backend.app.graph.builder import build_or_load_rosario_graph


class DirectedAdjacencyGraph:
    """
    Estructura de adyacencia dirigida en memoria RAM para toda la red vial de Rosario.

    Atributos principales:
        - `adj`: dict[int, list[tuple[int, str, float]]]
            Formato pedido por especificación: `adj[u] = [(v, tramo_id, peso_estatico), ...]`.
        - `adj_indexed`: dict[int, list[tuple[int, int, str, float]]]
            Incluye el `edge_idx` (0..E-1) para consultar en O(1) el peso dinámico actual
            en `dynamic_weights[edge_idx]` durante Dijkstra.
        - `dynamic_weights`: np.ndarray (float64) con los tiempos predichos actuales en segundos.
        - `static_lengths`: np.ndarray (float64) con las longitudes físicas en metros.
        - `base_times`: np.ndarray (float64) con los tiempos base históricos en segundos.
    """

    def __init__(self, graph_data: dict[str, Any] | None = None) -> None:
        if graph_data is None:
            graph_data = build_or_load_rosario_graph(force_rebuild=False)

        self.nodes: list[dict[str, Any]] = graph_data["nodes"]
        self.edges: list[dict[str, Any]] = graph_data["edges"]

        self.node_by_id: dict[int, dict[str, Any]] = {}
        self.adj: dict[int, list[tuple[int, str, float]]] = {}
        self.adj_indexed: dict[int, list[tuple[int, int, str, float]]] = {}

        for n in self.nodes:
            nid = int(n["id"])
            self.node_by_id[nid] = n
            self.adj[nid] = []
            self.adj_indexed[nid] = []

        n_edges = len(self.edges)
        self.static_lengths = np.empty(n_edges, dtype=np.float64)
        self.base_times = np.empty(n_edges, dtype=np.float64)
        self.dynamic_weights = np.empty(n_edges, dtype=np.float64)

        self.edge_index_by_tramo_id: dict[str, int] = {}
        self.edge_by_pair: dict[tuple[int, int], int] = {}

        for idx, edge in enumerate(self.edges):
            u = int(edge["u"])
            v = int(edge["v"])
            tramo_id = str(edge["tramo_id"])
            longitud_m = float(edge["longitud_m"])
            tiempo_base = float(edge["tiempo_base_seg"])

            self.static_lengths[idx] = longitud_m
            self.base_times[idx] = tiempo_base
            self.dynamic_weights[idx] = tiempo_base

            self.edge_index_by_tramo_id[tramo_id] = idx
            self.edge_by_pair[(u, v)] = idx

            self.adj[u].append((v, tramo_id, longitud_m))
            self.adj_indexed[u].append((v, idx, tramo_id, longitud_m))

    def update_weights(
        self, tiempos_predichos: dict[str, float] | list[float] | np.ndarray
    ) -> np.ndarray:
        """
        Actualiza los pesos dinámicos de todas las aristas del grafo en <5 ms.

        Soporta:
            - `np.ndarray` o `list[float]` de longitud `E` (operación vectorizada en <0.2 ms).
            - `dict[tramo_id, float]` mapeado por identificador de tramo.
        """
        if isinstance(tiempos_predichos, np.ndarray):
            if len(tiempos_predichos) != len(self.edges):
                raise ValueError(
                    f"Longitud de tiempos_predichos ({len(tiempos_predichos)}) != {len(self.edges)}"
                )
            np.maximum(tiempos_predichos, 0.1, out=self.dynamic_weights)
            return self.dynamic_weights

        if isinstance(tiempos_predichos, list):
            arr = np.asarray(tiempos_predichos, dtype=np.float64)
            if len(arr) != len(self.edges):
                raise ValueError(f"Longitud de lista ({len(arr)}) != {len(self.edges)}")
            np.maximum(arr, 0.1, out=self.dynamic_weights)
            return self.dynamic_weights

        if isinstance(tiempos_predichos, dict):
            for tramo_id, val in tiempos_predichos.items():
                idx = self.edge_index_by_tramo_id.get(tramo_id)
                if idx is not None:
                    self.dynamic_weights[idx] = max(0.1, float(val))
            return self.dynamic_weights

        raise TypeError("Formato no soportado para tiempos_predichos.")

    def get_edge_weight(self, u: int, v: int, mode: str = "dynamic") -> float:
        """Obtiene el peso de la arista (u, v) según el modo ('dynamic' o 'static')."""
        idx = self.edge_by_pair[(u, v)]
        if mode == "static":
            return float(self.static_lengths[idx])
        return float(self.dynamic_weights[idx])
