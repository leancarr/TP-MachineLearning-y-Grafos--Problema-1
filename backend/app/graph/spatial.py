"""
Ticket 03 (MACHI-10): Indexador espacial cKDTree para snapping de esquinas y filtro de viewport (LOD).

Construye un índice `scipy.spatial.cKDTree` sobre las coordenadas (lat, lon) de todos los nodos
del grafo de Rosario para ubicar la esquina más cercana en <0.5 ms ante un clic en el mapa,
además de ofrecer búsqueda por nombre de intersección y filtrado vectorizado de aristas por
Bounding Box (`bbox`) y nivel de zoom (`LOD`).
"""

from __future__ import annotations

from typing import Any
import numpy as np
from scipy.spatial import cKDTree

from backend.app.graph.builder import build_or_load_rosario_graph


class RosarioSpatialIndex:
    """Índice espacial en memoria para nodos y aristas de toda la red vial de Rosario."""

    def __init__(self, graph_data: dict[str, Any] | None = None) -> None:
        if graph_data is None:
            graph_data = build_or_load_rosario_graph(force_rebuild=False)

        self.nodes: list[dict[str, Any]] = graph_data["nodes"]
        self.edges: list[dict[str, Any]] = graph_data["edges"]
        self.node_by_id: dict[int, dict[str, Any]] = {int(n["id"]): n for n in self.nodes}

        # Arreglos NumPy para cKDTree (lat, lon)
        self._coords = np.array(
            [[float(n["lat"]), float(n["lon"])] for n in self.nodes],
            dtype=np.float64,
        )
        # Escalamos longitud por cos(lat_rosario) para que la distancia euclídea local sea isométrica
        self._cos_lat = float(np.cos(np.radians(-32.9468)))
        self._scaled_coords = np.column_stack(
            (self._coords[:, 0], self._coords[:, 1] * self._cos_lat)
        )
        self._kdtree = cKDTree(self._scaled_coords)

        # Arreglos NumPy de aristas para filtrado rápido por Bounding Box + Zoom (LOD)
        n_edges = len(self.edges)
        self._edge_u_lat = np.empty(n_edges, dtype=np.float64)
        self._edge_u_lon = np.empty(n_edges, dtype=np.float64)
        self._edge_v_lat = np.empty(n_edges, dtype=np.float64)
        self._edge_v_lon = np.empty(n_edges, dtype=np.float64)
        self._edge_hierarchy = np.empty(n_edges, dtype=np.int32)

        for i, e in enumerate(self.edges):
            nu = self.node_by_id[int(e["u"])]
            nv = self.node_by_id[int(e["v"])]
            self._edge_u_lat[i] = float(nu["lat"])
            self._edge_u_lon[i] = float(nu["lon"])
            self._edge_v_lat[i] = float(nv["lat"])
            self._edge_v_lon[i] = float(nv["lon"])
            self._edge_hierarchy[i] = int(e["jerarquia_osm"])

    def get_nearest_node(self, lat: float, lon: float) -> dict[str, Any]:
        """
        Retorna el nodo (esquina) más cercano a (lat, lon) en <0.5 ms usando cKDTree.
        Incluye `distance_m` aproximada al punto consultado.
        """
        query_pt = np.array([float(lat), float(lon) * self._cos_lat], dtype=np.float64)
        dist_deg, idx = self._kdtree.query(query_pt, k=1)
        node = self.nodes[int(idx)]
        distance_m = float(dist_deg) * 111320.0
        return {
            "id": int(node["id"]),
            "lat": float(node["lat"]),
            "lon": float(node["lon"]),
            "label": str(node["label"]),
            "distance_m": round(distance_m, 2),
        }

    @staticmethod
    def _normalize_text(text: str) -> str:
        import unicodedata
        norm = unicodedata.normalize("NFKD", str(text).lower())
        return "".join(c for c in norm if not unicodedata.combining(c))

    def search_nodes(self, query: str, limit: int = 15) -> list[dict[str, Any]]:
        """
        Busca esquinas y puntos de interés de Rosario por nombre de intersección o calles.
        Soporta:
        - Búsqueda por intersección directa (ej: 'Pellegrini y Corrientes').
        - Intersecciones complejas/rotondas con snapping espacial (ej: 'Pellegrini y Oro' / 'Oroño').
        - Puntos de interés icónicos de Rosario (ej: 'Terminal', 'Monumento', 'HECA').
        """
        raw_q = query.strip()
        q = self._normalize_text(raw_q)
        if not q:
            return self.nodes[:limit]

        results: list[dict[str, Any]] = []
        seen_ids: set[int] = set()
        seen_labels: set[str] = set()

        # 1. Puntos de Interés (Landmarks) icónicos de Rosario
        landmarks = [
            ({"monumento", "bandera"}, -32.9475, -60.6305, "Monumento a la Bandera (Av. Belgrano y Córdoba)"),
            ({"terminal", "omnibus", "colectivos"}, -32.9377, -60.6728, "Terminal de Ómnibus (Cafferata y Santa Fe)"),
            ({"parque", "independencia"}, -32.9547, -60.6552, "Parque de la Independencia (Av. Pellegrini y Bv. Oroño)"),
            ({"heca", "clemente"}, -32.9613, -60.6698, "HECA - Hospital de Emergencias (Av. Pellegrini y Crespo)"),
            ({"centenario", "hospital"}, -32.9366, -60.6653, "Hospital Centenario (Urquiza y Francia)"),
            ({"puerto", "norte"}, -32.9231, -60.6631, "Puerto Norte (Av. Carballo y Francia)"),
            ({"pichincha"}, -32.9348, -60.6542, "Barrio Pichincha (Bv. Oroño y Jujuy)"),
        ]

        query_tokens = set(q.replace(",", " ").replace(".", " ").split())
        for trigger_words, lat, lon, custom_label in landmarks:
            if trigger_words & query_tokens:
                nearest = self.get_nearest_node(lat, lon)
                node_dict = dict(self.node_by_id[nearest["id"]])
                node_dict["label"] = custom_label
                results.append(node_dict)
                seen_ids.add(node_dict["id"])
                if len(results) >= limit:
                    return results

        # 2. Descomposición de términos descartando conectores
        stop_words = {"y", "e", "de", "del", "la", "el", "los", "las", "av", "av.", "bv", "bv.", "calle", "pasaje"}
        terms = [
            t
            for t in q.replace(",", " ").replace(".", " ").split()
            if t and t not in stop_words
        ]
        if not terms:
            terms = [q]

        # 3. Coincidencia directa (todos los términos en la etiqueta de un mismo nodo)
        for n in self.nodes:
            lbl = self._normalize_text(n["label"])
            if all(t in lbl for t in terms):
                nid = int(n["id"])
                raw_lbl = str(n["label"])
                if nid not in seen_ids and raw_lbl not in seen_labels:
                    seen_ids.add(nid)
                    seen_labels.add(raw_lbl)
                    results.append(n)
                    if len(results) >= limit:
                        return results

        # 4. Búsqueda de Intersección por Proximidad Espacial (ej: 'Pellegrini y Oro')
        # Cuando dos avenidas se conectan a través de una rotonda, plaza o cantero central
        if len(results) < limit and len(terms) >= 2:
            t1, t2 = terms[0], terms[1]
            nodes_t1 = [n for n in self.nodes if t1 in self._normalize_text(n["label"])]
            nodes_t2 = [n for n in self.nodes if t2 in self._normalize_text(n["label"])]

            if nodes_t1 and nodes_t2:
                coords_t2 = np.array(
                    [[n["lat"], n["lon"] * self._cos_lat] for n in nodes_t2],
                    dtype=np.float64,
                )
                tree_t2 = cKDTree(coords_t2)

                for n1 in nodes_t1:
                    dist_deg, idx2 = tree_t2.query(
                        [n1["lat"], n1["lon"] * self._cos_lat], k=1
                    )
                    dist_m = float(dist_deg) * 111320.0
                    if dist_m <= 85.0:
                        nid = int(n1["id"])
                        n2 = nodes_t2[int(idx2)]
                        st1 = n1["label"].split(" y ")[0]
                        st2 = n2["label"].split(" y ")[0]
                        clean_label = f"{st1} y {st2}"
                        if nid not in seen_ids and clean_label not in seen_labels:
                            combined_node = dict(n1)
                            combined_node["label"] = clean_label
                            seen_ids.add(nid)
                            seen_labels.add(clean_label)
                            results.append(combined_node)
                            if len(results) >= limit:
                                return results

        return results

    @staticmethod
    def max_hierarchy_for_zoom(zoom: int) -> int:
        """
        Determina qué jerarquía máxima de calles mostrar según el nivel de zoom (LOD estilo Google Maps):
        - zoom <= 12: 1 (Circunvalación, accesos y avenidas primarias)
        - zoom == 13: 2 (+ Avenidas secundarias)
        - zoom == 14: 3 (+ Calles terciarias y comerciales)
        - zoom >= 15: 4 (100% de las cuadras incluidas residenciales)
        """
        if zoom <= 12:
            return 1
        if zoom == 13:
            return 2
        if zoom == 14:
            return 3
        return 4

    def filter_edge_indices_by_viewport(
        self,
        min_lat: float,
        min_lon: float,
        max_lat: float,
        max_lon: float,
        zoom: int = 13,
        max_edges: int = 4500,
    ) -> np.ndarray:
        """
        Filtra de forma vectorizada los índices de aristas que caen dentro del Bounding Box
        y cumplen con la jerarquía vial correspondiente al nivel de zoom.
        """
        max_h = self.max_hierarchy_for_zoom(zoom)
        mask = (
            (self._edge_hierarchy <= max_h)
            & (
                (
                    (self._edge_u_lat >= min_lat)
                    & (self._edge_u_lat <= max_lat)
                    & (self._edge_u_lon >= min_lon)
                    & (self._edge_u_lon <= max_lon)
                )
                | (
                    (self._edge_v_lat >= min_lat)
                    & (self._edge_v_lat <= max_lat)
                    & (self._edge_v_lon >= min_lon)
                    & (self._edge_v_lon <= max_lon)
                )
            )
        )
        indices = np.flatnonzero(mask)
        if len(indices) > max_edges:
            # Priorizar siempre las arterias de mayor jerarquía si el viewport es muy amplio
            order = np.argsort(self._edge_hierarchy[indices], kind="stable")
            indices = indices[order[:max_edges]]
        return indices
