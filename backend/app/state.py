"""
Application State Manager in RAM for the Rosario Routing Backend (Ticket 15).

Pre-loads all urban network components and machine learning predictors into RAM:
- Graph data: 13,134 nodes and 30,053 directed edges (SCC Rosario).
- cKDTree spatial index for <0.1 ms snapping and vector viewport filtering.
- DirectedAdjacencyGraph with NumPy float64 dynamic weight buffer.
- NetworkTravelTimePredictor with scikit-learn DecisionTree and LRU context cache.
- DijkstraRouter with binary min-heap (`heapq`).
- TSPTourOptimizer with Nearest Neighbor + local 2-opt search.
"""

from __future__ import annotations

import time
from typing import Any
import numpy as np

from backend.app.graph.adjacency import DirectedAdjacencyGraph
from backend.app.graph.builder import build_or_load_rosario_graph
from backend.app.graph.dijkstra import DijkstraRouter
from backend.app.graph.spatial import RosarioSpatialIndex
from backend.app.graph.tsp import DeliveryTourOptimizer
from backend.app.ml.predictor import NetworkTravelTimePredictor
from backend.app.schemas import CongestedCorridor, ViewportEdge


class AppState:
    """Contenedor de estado único en memoria para el servidor FastAPI."""

    def __init__(self) -> None:
        self.start_time: float = time.time()
        self.graph_data: dict[str, Any] | None = None
        self.spatial_index: RosarioSpatialIndex | None = None
        self.graph: DirectedAdjacencyGraph | None = None
        self.predictor: NetworkTravelTimePredictor | None = None
        self.router: DijkstraRouter | None = None
        self.tsp_optimizer: DeliveryTourOptimizer | None = None

        # Precomputación para ranking de corredores viales (/api/graph/congested)
        self._valid_edge_ids: np.ndarray | None = None
        self._valid_street_ids: np.ndarray | None = None
        self._n_corridors: int = 0
        self._corridor_names: list[str] = []
        self._corridor_counts: np.ndarray | None = None
        self._corridor_lats: np.ndarray | None = None
        self._corridor_lons: np.ndarray | None = None
        self._corridor_sample_tramos: list[str] = []
        self._corridor_tipos: list[str] = []
        self._corridor_nominal_speeds: np.ndarray | None = None

        self.current_context: dict[str, Any] = {
            "hora_dia": 8.0,
            "dia_semana": "miercoles",
            "clima": "despejado",
            "es_feriado": False,
        }
        self.is_initialized: bool = False

    def initialize(self) -> None:
        """Carga en RAM todos los motores del backend (<0.3s)."""
        if self.is_initialized:
            return

        t0 = time.perf_counter()

        # 1. Cargar datos del grafo
        self.graph_data = build_or_load_rosario_graph(force_rebuild=False)

        # 2. Indexador espacial cKDTree
        self.spatial_index = RosarioSpatialIndex(self.graph_data)

        # 3. Estructura de adyacencia dirigida en RAM
        self.graph = DirectedAdjacencyGraph(self.graph_data)

        # 4. Predictor de Machine Learning con Caché LRU
        self.predictor = NetworkTravelTimePredictor(self.graph)

        # 5. Dijkstra artesanal
        self.router = DijkstraRouter(self.graph)

        # 6. Optimizador de ronda TSP 2-opt
        self.tsp_optimizer = DeliveryTourOptimizer(self.graph)

        # 7. Precomputación de corredores viales para top congestionados
        self._init_corridors()

        # Precalentamiento del predictor con estado 'Día Normal' (Miércoles 08:00 hs)
        initial_times, _, _ = self.predictor.predict_network_times(
            hora_dia=8.0,
            dia_semana="miercoles",
            clima="despejado",
            es_feriado=False,
        )
        self.graph.update_weights(initial_times)

        self.is_initialized = True
        elapsed_ms = (time.perf_counter() - t0) * 1000.0
        print(f"🚀 Rosario Backend inicializado en RAM en {elapsed_ms:.2f} ms")

    def sync_weights_for_context(
        self,
        hora_dia: float,
        dia_semana: str,
        clima: str,
        es_feriado: bool,
    ) -> tuple[np.ndarray, bool, float]:
        """
        Sincroniza los 30.053 pesos dinámicos en memoria según el contexto consultado.
        Si coincide con el contexto activo actual, no vuelve a escribir en RAM.
        """
        if (
            self.current_context["hora_dia"] == hora_dia
            and self.current_context["dia_semana"] == dia_semana
            and self.current_context["clima"] == clima
            and self.current_context["es_feriado"] == es_feriado
        ):
            return self.graph.dynamic_weights, True, 0.01

        times, cached, ms = self.predictor.predict_network_times(
            hora_dia=hora_dia,
            dia_semana=dia_semana,
            clima=clima,
            es_feriado=es_feriado,
        )
        self.graph.update_weights(times)

        self.current_context = {
            "hora_dia": hora_dia,
            "dia_semana": dia_semana,
            "clima": clima,
            "es_feriado": es_feriado,
        }
        return times, cached, ms

    def get_viewport_edges(
        self,
        min_lat: float,
        min_lon: float,
        max_lat: float,
        max_lon: float,
        zoom: int,
        hora_dia: float,
        dia_semana: str,
        clima: str,
        es_feriado: bool,
        max_edges: int = 4500,
    ) -> list[ViewportEdge]:
        """Filtra y serializa las aristas visibles para Leaflet Canvas con su congestión."""
        # 1. Asegurar pesos y ratios correspondientes al contexto
        self.sync_weights_for_context(hora_dia, dia_semana, clima, es_feriado)
        ratios = self.predictor.get_congestion_ratios(
            hora_dia, dia_semana, clima, es_feriado
        )

        # 2. Filtrado espacial vectorizado en cKDTree
        indices = self.spatial_index.filter_edge_indices_by_viewport(
            min_lat=min_lat,
            min_lon=min_lon,
            max_lat=max_lat,
            max_lon=max_lon,
            zoom=zoom,
            max_edges=max_edges,
        )

        edges_meta = self.graph.edges
        dyn_weights = self.graph.dynamic_weights
        node_map = self.spatial_index.node_by_id

        result: list[ViewportEdge] = []
        for idx in indices:
            meta = edges_meta[int(idx)]
            u_id = meta["u"]
            v_id = meta["v"]
            u_node = node_map[u_id]
            v_node = node_map[v_id]

            ratio = float(ratios[idx])
            tiempo = float(dyn_weights[idx])

            # Categorización y color semántico para Leaflet Canvas
            if ratio <= 1.20:
                level = "fluido"
                color = "#10B981"  # Emerald 500
            elif ratio <= 1.60:
                level = "moderado"
                color = "#F59E0B"  # Amber 500
            else:
                level = "congestionado"
                color = "#EF4444"  # Rose 500

            result.append(
                ViewportEdge(
                    tramo_id=str(meta["tramo_id"]),
                    u=u_id,
                    v=v_id,
                    u_lat=float(u_node["lat"]),
                    u_lon=float(u_node["lon"]),
                    v_lat=float(v_node["lat"]),
                    v_lon=float(v_node["lon"]),
                    tipo_calle=str(meta["tipo_calle"]),
                    jerarquia=int(meta["jerarquia_osm"]),
                    longitud_m=round(float(meta["longitud_m"]), 2),
                    tiempo_seg=round(tiempo, 2),
                    congestion_ratio=round(ratio, 3),
                    level=level,
                    color=color,
                )
            )

        return result

    def _init_corridors(self) -> None:
        """Precomputa las estructuras vectorizadas de calles para cálculo de arterias congestionadas (<2 ms)."""
        street_names: list[str] = []
        street_to_id: dict[str, int] = {}
        edge_street_ids = np.full(len(self.graph.edges), -1, dtype=np.int32)

        for idx, edge in enumerate(self.graph.edges):
            name = (edge.get("nombre_calle") or "").strip()
            name_lower = name.lower()
            if not name or "s/n" in name_lower or "sin nombre" in name_lower:
                continue
            if name not in street_to_id:
                street_to_id[name] = len(street_names)
                street_names.append(name)
            edge_street_ids[idx] = street_to_id[name]

        valid_edge_mask = edge_street_ids >= 0
        self._valid_edge_ids = np.where(valid_edge_mask)[0]
        self._valid_street_ids = edge_street_ids[self._valid_edge_ids]
        self._n_corridors = len(street_names)
        self._corridor_names = street_names

        counts = np.bincount(self._valid_street_ids, minlength=self._n_corridors)
        self._corridor_counts = np.maximum(counts, 1)

        # Centroides usando self.spatial_index._edge_u_lat y _edge_u_lon
        u_lats = self.spatial_index._edge_u_lat[self._valid_edge_ids]
        u_lons = self.spatial_index._edge_u_lon[self._valid_edge_ids]
        sum_lats = np.bincount(self._valid_street_ids, weights=u_lats, minlength=self._n_corridors)
        sum_lons = np.bincount(self._valid_street_ids, weights=u_lons, minlength=self._n_corridors)
        self._corridor_lats = sum_lats / self._corridor_counts
        self._corridor_lons = sum_lons / self._corridor_counts

        # Tramo representativo y tipo de calle
        street_first_edge: dict[int, int] = {}
        for idx in self._valid_edge_ids:
            s_id = edge_street_ids[idx]
            if s_id not in street_first_edge:
                street_first_edge[s_id] = idx
                if len(street_first_edge) == self._n_corridors:
                    break

        self._corridor_sample_tramos = [
            str(self.graph.edges[street_first_edge[i]]["tramo_id"])
            for i in range(self._n_corridors)
        ]
        self._corridor_tipos = [
            str(self.graph.edges[street_first_edge[i]]["tipo_calle"])
            for i in range(self._n_corridors)
        ]

        # Velocidades nominales promedio históricas
        nom_speeds = np.array(
            [float(self.graph.edges[idx]["velocidad_promedio_historica"]) for idx in self._valid_edge_ids],
            dtype=np.float64,
        )
        self._corridor_nominal_speeds = (
            np.bincount(self._valid_street_ids, weights=nom_speeds, minlength=self._n_corridors)
            / self._corridor_counts
        )

    def get_top_congested_corridors(
        self,
        hora_dia: float,
        dia_semana: str,
        clima: str,
        es_feriado: bool,
        limit: int = 10,
    ) -> list[CongestedCorridor]:
        """
        Calcula el ranking del Top N arterias más congestionadas para el contexto urbano dado.
        Ordenado descendentemente por congestion_ratio promedio.
        """
        if self._valid_edge_ids is None:
            self._init_corridors()

        # 1. Sincronizar pesos dinámicos en memoria RAM
        dyn_weights, _, _ = self.sync_weights_for_context(
            hora_dia=hora_dia,
            dia_semana=dia_semana,
            clima=clima,
            es_feriado=es_feriado,
        )

        base_times = self.graph.base_times
        lengths = self.graph.static_lengths

        valid_edges = self._valid_edge_ids
        valid_streets = self._valid_street_ids
        n_corridors = self._n_corridors
        counts = self._corridor_counts

        # 2. Calcular ratios y velocidades por arista
        sub_dyn = dyn_weights[valid_edges]
        sub_base = base_times[valid_edges]
        sub_lengths = lengths[valid_edges]

        edge_ratios = sub_dyn / sub_base
        edge_speeds = (sub_lengths / sub_dyn) * 3.6

        # 3. Promediar por arteria usando np.bincount
        mean_ratios = np.bincount(valid_streets, weights=edge_ratios, minlength=n_corridors) / counts
        mean_speeds = np.bincount(valid_streets, weights=edge_speeds, minlength=n_corridors) / counts

        # 4. Ordenar de mayor a menor por congestion_ratio_avg
        actual_limit = min(limit, n_corridors)
        top_indices = np.argpartition(mean_ratios, -actual_limit)[-actual_limit:]
        top_sorted = top_indices[np.argsort(-mean_ratios[top_indices])]

        results: list[CongestedCorridor] = []
        for i in top_sorted:
            ratio_val = float(mean_ratios[i])
            delay_val = (ratio_val - 1.0) * 100.0
            results.append(
                CongestedCorridor(
                    name=self._corridor_names[i],
                    tipo_calle=self._corridor_tipos[i],
                    congestion_ratio=round(ratio_val, 2),
                    delay_pct=round(delay_val, 1),
                    average_speed_kmh=round(float(mean_speeds[i]), 1),
                    nominal_speed_kmh=round(float(self._corridor_nominal_speeds[i]), 1),
                    lat=round(float(self._corridor_lats[i]), 6),
                    lon=round(float(self._corridor_lons[i]), 6),
                    sample_tramo_id=self._corridor_sample_tramos[i],
                )
            )

        return results


# Singleton global
app_state = AppState()


def get_app_state() -> AppState:
    """Dependency provider para FastAPI."""
    return app_state
