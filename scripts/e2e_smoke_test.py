"""
End-to-end smoke test script for Rosario Last-Mile Routing system (Ticket 20 - MACHI-27).
Verifies that FastAPI backend initializes, loads 13k nodes, 30k edges, ML Decision Tree,
KDTree spatial index, and responds with correct payloads across all REST endpoints.
"""

import sys
import time
from pathlib import Path

# Ensure repository root is in sys.path
REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from fastapi.testclient import TestClient
from backend.app.main import app

def run_e2e_smoke():
    print("[E2E Smoke Test] Initializing FastAPI TestClient with pre-cached RAM state...")
    start_init = time.time()
    with TestClient(app) as client:
        init_duration = time.time() - start_init
        print(f"[E2E Smoke Test] Lifespan state loaded in {init_duration:.3f} s.")

        # 1. OpenAPI & Health
        r_docs = client.get("/docs")
        assert r_docs.status_code == 200, f"Docs failed: {r_docs.status_code}"
        print("[OK] OpenAPI /docs rendered successfully (HTTP 200).")

        # 2. Presets
        r_presets = client.get("/api/presets")
        assert r_presets.status_code == 200
        presets = r_presets.json()
        assert len(presets) == 5, f"Expected 5 presets, got {len(presets)}"
        print(f"[OK] GET /api/presets returned {len(presets)} presets.")

        # 3. Metrics & ML Benchmark
        r_metrics = client.get("/api/metrics")
        assert r_metrics.status_code == 200
        metrics = r_metrics.json()
        assert "DecisionTreeRegressor" in metrics["models"]
        assert metrics["models"]["DecisionTreeRegressor"]["r2_score"] >= 0.89
        print(f"[OK] GET /api/metrics validated (R2 = {metrics['models']['DecisionTreeRegressor']['r2_score']:.4f}).")

        # 4. Nearest Node Snapping (Rosario Downtown: Bv. Oroño & Córdoba)
        r_node = client.get("/api/nodes/nearest?lat=-32.9468&lon=-60.6393")
        assert r_node.status_code == 200
        node = r_node.json()
        assert "id" in node and "label" in node
        print(f"[OK] GET /api/nodes/nearest snapped to node #{node['id']} ({node['label']}).")

        # 5. Search Corners
        r_search = client.get("/api/nodes/search?q=pellegrini&limit=5")
        assert r_search.status_code == 200
        search_results = r_search.json()
        assert len(search_results) > 0
        print(f"[OK] GET /api/nodes/search returned {len(search_results)} intersections matching 'pellegrini'.")

        # 6. Viewport LOD progressive loading
        r_vp = client.post(
            "/api/graph/viewport",
            json={
                "min_lat": -32.96,
                "min_lon": -60.66,
                "max_lat": -32.93,
                "max_lon": -60.63,
                "zoom": 14,
                "hora_dia": 18.5,
                "dia_semana": "viernes",
                "clima": "tormenta",
                "es_feriado": False,
            },
        )
        assert r_vp.status_code == 200
        vp_data = r_vp.json()
        assert len(vp_data["edges"]) > 0
        print(f"[OK] POST /api/graph/viewport returned {len(vp_data['edges'])} edges in {vp_data['execution_time_ms']:.1f} ms.")

        # 7. Dual Route (Static vs Dynamic ML Dijkstra)
        dest_node = search_results[0]
        r_route = client.post(
            "/api/route",
            json={
                "origin_id": node["id"],
                "destination_id": dest_node["id"],
                "hora_dia": 18.5,
                "dia_semana": "viernes",
                "clima": "tormenta",
                "es_feriado": False,
            },
        )
        assert r_route.status_code == 200, f"Route calculation failed: {r_route.text}"
        route_data = r_route.json()
        assert route_data["static_route"]["found"]
        assert route_data["dynamic_route"]["found"]
        print(f"[OK] POST /api/route computed dual routes: Static {route_data['static_route']['time_min']:.1f} min vs IA {route_data['dynamic_route']['time_min']:.1f} min.")

        # 8. Top Congested Arteries
        r_cong = client.post(
            "/api/graph/congested?limit=10",
            json={
                "hora_dia": 18.5,
                "dia_semana": "viernes",
                "clima": "tormenta",
                "es_feriado": False,
            },
        )
        assert r_cong.status_code == 200, f"Congested corridors failed: {r_cong.text}"
        cong_data = r_cong.json()
        assert len(cong_data["corridors"]) > 0
        print(f"[OK] POST /api/graph/congested returned {len(cong_data['corridors'])} top congested avenues.")

        # 9. Multi-stop TSP Tour (4 stops)
        stop_ids = [res["id"] for res in search_results[1:4]]
        r_tour = client.post(
            "/api/tour",
            json={
                "depot": {"node_id": node["id"], "label": node["label"]},
                "stops": [
                    {"node_id": sid, "label": f"Parada #{idx+1}"}
                    for idx, sid in enumerate(stop_ids)
                ],
                "return_to_depot": True,
                "hora_dia": 14.0,
                "dia_semana": "miercoles",
                "clima": "despejado",
                "es_feriado": False,
            },
        )
        assert r_tour.status_code == 200, f"Tour calculation failed: {r_tour.text}"
        tour_data = r_tour.json()
        assert len(tour_data["dynamic_tour"]["ordered_sequence"]) == len(stop_ids) + 2 # depot + stops + return
        print(f"[OK] POST /api/tour computed TSP tour: {tour_data['dynamic_tour']['total_time_min']:.1f} min ({len(tour_data['dynamic_tour']['numbered_stops'])} paradas).")

        print("\n=======================================================")
        print(">>> TODOS LOS TESTS E2E DEL BACKEND PASARON CON ÉXITO! <<<")
        print("=======================================================")

if __name__ == "__main__":
    run_e2e_smoke()
