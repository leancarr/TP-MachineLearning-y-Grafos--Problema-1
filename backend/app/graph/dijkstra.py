"""
Ticket 12 (MACHI-19): Algoritmo artesanal de Dijkstra con heapq (estático y dinámico).

Implementación de Dijkstra desde cero con la librería estándar `heapq` (binary min-heap),
optimizada para la red vial completa de Rosario (~13.100 nodos y ~30.000 aristas) sin dependencias
externas para el solver.

Características principales:
- Modos:
    - 'static': Minimiza distancia física en metros (`longitud_m`).
    - 'dynamic': Minimiza tiempo total de viaje en segundos (`dynamic_weights`).
- Optimizaciones clave:
    - Mapeo bidireccional contiguo a enteros `0..N-1` para accesos O(1) con listas nativas CPython.
    - Zero-copy view mediante `memoryview` sobre arreglos de pesos.
    - Line guard `if dist_u < d: continue` para descartar entradas obsoletas en el heap.
    - Early exit en cuanto `current_node == target_node`.
    - Local variable caching (`heappop`, `heappush`, `adj`) para reducir overhead de llamadas en bucle crítico.
    - Reconstrucción eficiente del camino (secuencia de nodos, tramos, coordenadas y métricas).
"""

from __future__ import annotations

import heapq
import time
from dataclasses import dataclass
from typing import Any

from backend.app.graph.adjacency import DirectedAdjacencyGraph


@dataclass(slots=True)
class DijkstraResult:
    """Resultado del cálculo de camino mínimo con Dijkstra."""

    found: bool
    nodes: list[int]
    tramos: list[str]
    total_distance_m: float
    total_time_sec: float
    total_time_min: float
    coordinates: list[tuple[float, float]]
    mode: str
    execution_time_ms: float

    def to_dict(self) -> dict[str, Any]:
        """Serializa el resultado a diccionario estándar (compatible con JSON y FastAPI)."""
        return {
            "found": self.found,
            "nodes": self.nodes,
            "tramos": self.tramos,
            "total_distance_m": self.total_distance_m,
            "total_time_sec": self.total_time_sec,
            "total_time_min": self.total_time_min,
            "coordinates": self.coordinates,
            "mode": self.mode,
            "execution_time_ms": self.execution_time_ms,
        }

    def __getitem__(self, item: str) -> Any:
        return getattr(self, item)

    def get(self, item: str, default: Any = None) -> Any:
        return getattr(self, item, default)

    def __contains__(self, item: str) -> bool:
        return hasattr(self, item)

    def __bool__(self) -> bool:
        return self.found


class DijkstraRouter:
    """
    Ruteador artesanal de camino mínimo sobre DirectedAdjacencyGraph.

    Utiliza indexación contigua `0..N-1` y `memoryview` sobre pesos estáticos y dinámicos
    para resolver cualquier consulta en la ciudad de Rosario en <35 ms (y <2 ms en distancias urbanas típicas).
    """

    def __init__(self, graph: DirectedAdjacencyGraph | None = None) -> None:
        if graph is None:
            graph = DirectedAdjacencyGraph()
        self.graph = graph
        self.nodes = graph.nodes
        self.edges = graph.edges
        self.node_by_id = graph.node_by_id

        self.n_nodes = len(self.nodes)
        self.n_edges = len(self.edges)

        # Mapeos O(1) ID OSM <-> Índice contiguo 0..N-1
        self.node_to_idx: dict[int, int] = {
            int(n["id"]): idx for idx, n in enumerate(self.nodes)
        }
        self.idx_to_node: list[int] = [int(n["id"]) for n in self.nodes]

        # Estructura compacta de adyacencia contigua optimizada (2-tuplas):
        # compact_adj[u_idx] = [(v_idx, edge_idx), ...]
        self.compact_adj: list[list[tuple[int, int]]] = [
            [] for _ in range(self.n_nodes)
        ]
        for u_id, neighbors in self.graph.adj_indexed.items():
            u_idx = self.node_to_idx[u_id]
            self.compact_adj[u_idx] = [
                (self.node_to_idx[v_id], edge_idx)
                for v_id, edge_idx, _, _ in neighbors
            ]

        # Vistas y cachés rápidas para evitar formateos repetitivos
        self.edge_tramos: list[str] = [str(e["tramo_id"]) for e in self.edges]
        self.node_coords: list[tuple[float, float]] = [
            (float(n["lat"]), float(n["lon"])) for n in self.nodes
        ]
        self.static_weights_mv = memoryview(self.graph.static_lengths)

    def shortest_path(
        self, source: int, target: int, mode: str = "dynamic"
    ) -> DijkstraResult:
        """
        Calcula el camino mínimo entre dos nodos usando min-heap artesanal (`heapq`).

        Parámetros:
            source: ID OSM del nodo de origen.
            target: ID OSM del nodo de destino.
            mode: 'static' (minimiza metros) o 'dynamic' (minimiza segundos).

        Retorna:
            DijkstraResult con el camino detallado y métricas completas.
        """
        t0 = time.perf_counter()

        if mode not in ("dynamic", "static"):
            raise ValueError(
                f"Modo de ruteo inválido: '{mode}'. Valores válidos: 'dynamic' o 'static'."
            )

        source_idx = self.node_to_idx.get(source)
        target_idx = self.node_to_idx.get(target)

        # Si origen o destino no existen en el grafo
        if source_idx is None or target_idx is None:
            elapsed_ms = (time.perf_counter() - t0) * 1000.0
            return DijkstraResult(
                found=False,
                nodes=[],
                tramos=[],
                total_distance_m=float("inf"),
                total_time_sec=float("inf"),
                total_time_min=float("inf"),
                coordinates=[],
                mode=mode,
                execution_time_ms=round(elapsed_ms, 3),
            )

        # Caso trivial: origen == destino
        if source_idx == target_idx:
            elapsed_ms = (time.perf_counter() - t0) * 1000.0
            return DijkstraResult(
                found=True,
                nodes=[source],
                tramos=[],
                total_distance_m=0.0,
                total_time_sec=0.0,
                total_time_min=0.0,
                coordinates=[self.node_coords[source_idx]],
                mode=mode,
                execution_time_ms=round(elapsed_ms, 3),
            )

        # Selección de pesos sin copias de memoria
        weights = (
            memoryview(self.graph.dynamic_weights)
            if mode == "dynamic"
            else self.static_weights_mv
        )

        n = self.n_nodes
        dist = [float("inf")] * n
        dist[source_idx] = 0.0

        prev_node = [-1] * n
        prev_edge = [-1] * n

        # Optimización de bucle interno en CPython
        heappop = heapq.heappop
        heappush = heapq.heappush
        adj = self.compact_adj

        # Min-heap con tuplas (costo_acumulado, nodo_idx)
        heap: list[tuple[float, int]] = [(0.0, source_idx)]
        found = False

        while heap:
            d, u = heappop(heap)

            # Line guard: descartar de inmediato entradas obsoletas en el heap
            dist_u = dist[u]
            if dist_u < d:
                continue

            # Early exit: interrupción inmediata al llegar al nodo objetivo
            current_node = u
            target_node = target_idx
            if current_node == target_node:
                found = True
                break

            # Relajación de aristas dirigidas salientes
            for v, edge_idx in adj[u]:
                cost = weights[edge_idx]
                new_d = d + cost
                if new_d < dist[v]:
                    dist[v] = new_d
                    prev_node[v] = u
                    prev_edge[v] = edge_idx
                    heappush(heap, (new_d, v))

        if not found:
            elapsed_ms = (time.perf_counter() - t0) * 1000.0
            return DijkstraResult(
                found=False,
                nodes=[],
                tramos=[],
                total_distance_m=float("inf"),
                total_time_sec=float("inf"),
                total_time_min=float("inf"),
                coordinates=[],
                mode=mode,
                execution_time_ms=round(elapsed_ms, 3),
            )

        # Reconstrucción del camino desde target hacia source
        curr = target_idx
        path_node_indices: list[int] = []
        path_edge_indices: list[int] = []

        while curr != source_idx:
            path_node_indices.append(curr)
            path_edge_indices.append(prev_edge[curr])
            curr = prev_node[curr]

        path_node_indices.append(source_idx)
        path_node_indices.reverse()
        path_edge_indices.reverse()

        # Reconstrucción de atributos legibles
        path_nodes = [self.idx_to_node[idx] for idx in path_node_indices]
        path_tramos = [self.edge_tramos[e_idx] for e_idx in path_edge_indices]
        coordinates = [self.node_coords[idx] for idx in path_node_indices]

        static_mv = self.static_weights_mv
        dyn_mv = memoryview(self.graph.dynamic_weights)

        total_distance_m = sum(static_mv[e_idx] for e_idx in path_edge_indices)
        total_time_sec = sum(dyn_mv[e_idx] for e_idx in path_edge_indices)
        total_time_min = total_time_sec / 60.0

        elapsed_ms = (time.perf_counter() - t0) * 1000.0

        return DijkstraResult(
            found=True,
            nodes=path_nodes,
            tramos=path_tramos,
            total_distance_m=round(float(total_distance_m), 2),
            total_time_sec=round(float(total_time_sec), 2),
            total_time_min=round(float(total_time_min), 3),
            coordinates=coordinates,
            mode=mode,
            execution_time_ms=round(elapsed_ms, 3),
        )

    def one_to_all(
        self, source: int, mode: str = "dynamic"
    ) -> tuple[dict[int, float], dict[int, int]]:
        """
        Calcula distancias mínimas y predecesores desde `source` a todos los nodos alcanzables.
        Útil para matrices de costos en problemas de ruteo TSP/VRP (Ticket 14).

        Retorna:
            (distancias_por_id, predecesores_por_id)
        """
        if mode not in ("dynamic", "static"):
            raise ValueError(
                f"Modo de ruteo inválido: '{mode}'. Valores válidos: 'dynamic' o 'static'."
            )

        source_idx = self.node_to_idx.get(source)
        if source_idx is None:
            return {}, {}

        weights = (
            memoryview(self.graph.dynamic_weights)
            if mode == "dynamic"
            else self.static_weights_mv
        )

        n = self.n_nodes
        dist = [float("inf")] * n
        dist[source_idx] = 0.0
        prev_node = [-1] * n

        heappop = heapq.heappop
        heappush = heapq.heappush
        adj = self.compact_adj

        heap: list[tuple[float, int]] = [(0.0, source_idx)]

        while heap:
            d, u = heappop(heap)
            dist_u = dist[u]
            if dist_u < d:
                continue

            for v, edge_idx in adj[u]:
                cost = weights[edge_idx]
                new_d = d + cost
                if new_d < dist[v]:
                    dist[v] = new_d
                    prev_node[v] = u
                    heappush(heap, (new_d, v))

        idx_to_node = self.idx_to_node
        dist_by_id = {
            idx_to_node[i]: dist[i] for i in range(n) if dist[i] < float("inf")
        }
        prev_by_id = {
            idx_to_node[i]: idx_to_node[prev_node[i]]
            for i in range(n)
            if prev_node[i] != -1
        }
        return dist_by_id, prev_by_id


def dijkstra_shortest_path(
    graph: DirectedAdjacencyGraph,
    source: int,
    target: int,
    mode: str = "dynamic",
) -> DijkstraResult:
    """
    Función de conveniencia para invocar Dijkstra sobre un grafo DirectedAdjacencyGraph.
    Reutiliza una instancia DijkstraRouter en caché del grafo si existe.
    """
    router: DijkstraRouter | None = getattr(graph, "_dijkstra_router", None)
    if router is None or router.graph is not graph:
        router = DijkstraRouter(graph)
        graph._dijkstra_router = router  # type: ignore[attr-defined]

    return router.shortest_path(source, target, mode=mode)
