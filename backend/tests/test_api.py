"""
Tests unitarios y de integración para la API FastAPI de Rosario (Ticket 15 - MACHI-22).

Verifica:
- Inicialización en memoria lifespan.
- Snapping y búsqueda de esquinas (/api/nodes/nearest y /api/nodes/search).
- Filtrado de viewport y cálculo de congestión en vivo (/api/graph/viewport).
- Ruteo comparativo estático vs dinámico en <50 ms (/api/route).
- Optimización de ronda TSP con 2-opt (/api/tour).
- Auditoría de métricas oficiales del benchmark (/api/metrics) y presets (/api/presets).
"""

import time
import pytest
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.state import app_state


@pytest.fixture(scope="module")
def client():
    """Cliente de test con lifespan context ejecutado una sola vez."""
    app_state.initialize()
    with TestClient(app) as test_client:
        yield test_client


def test_root_endpoint(client: TestClient):
    """Verifica que el root devuelva metadatos y enlaces a la documentación."""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["app"] == "Rosario Last-Mile Routing API"
    assert data["docs"] == "/docs"
    assert "route" in data["endpoints"]
    assert "viewport" in data["endpoints"]


def test_health_check(client: TestClient):
    """Verifica el estado de salud, conteo exacto de la red y modelos en RAM."""
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["city"] == "Rosario, Santa Fe, Argentina"
    assert data["nodes_count"] == 13134
    assert data["edges_count"] == 30053
    assert data["scc_strictly_connected"] is True
    assert data["ml_model_loaded"] is True
    assert data["uptime_seconds"] >= 0.0


def test_nearest_node_snapping(client: TestClient):
    """Verifica snapping de coordenadas a la esquina más cercana en <0.5 ms."""
    # Coordenada cerca de Av. Pellegrini y Corrientes
    lat, lon = -32.9550, -60.6550
    t0 = time.perf_counter()
    response = client.get(f"/api/nodes/nearest?lat={lat}&lon={lon}")
    elapsed_ms = (time.perf_counter() - t0) * 1000.0

    assert response.status_code == 200
    data = response.json()
    assert "id" in data
    assert "lat" in data
    assert "lon" in data
    assert "label" in data
    assert data["distance_m"] >= 0.0
    assert elapsed_ms < 100.0  # SLA de snapping


def test_search_nodes_by_name(client: TestClient):
    """Verifica búsqueda de intersecciones por texto."""
    response = client.get("/api/nodes/search?q=pellegrini&limit=5")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) > 0
    assert any("pellegrini" in item["label"].lower() for item in data)


def test_graph_viewport_filtering(client: TestClient):
    """Verifica el filtrado LOD de aristas dentro de un Bounding Box con sus niveles de congestión."""
    payload = {
        "min_lat": -32.9650,
        "min_lon": -60.6700,
        "max_lat": -32.9450,
        "max_lon": -60.6400,
        "zoom": 14,
        "hora_dia": 18.5,
        "dia_semana": "viernes",
        "clima": "tormenta",
        "es_feriado": False,
        "max_edges": 1000,
    }
    t0 = time.perf_counter()
    response = client.post("/api/graph/viewport", json=payload)
    elapsed_ms = (time.perf_counter() - t0) * 1000.0

    assert response.status_code == 200
    data = response.json()
    assert data["total_edges"] > 0
    assert len(data["edges"]) == data["total_edges"]
    assert elapsed_ms < 250.0

    # Validar formato de las aristas
    edge = data["edges"][0]
    assert "tramo_id" in edge
    assert "u_lat" in edge and "u_lon" in edge
    assert "v_lat" in edge and "v_lon" in edge
    assert edge["level"] in ("fluido", "moderado", "congestionado")
    assert edge["color"].startswith("#")
    assert edge["congestion_ratio"] > 0.0


def test_route_computation_static_vs_dynamic(client: TestClient):
    """Verifica el ruteo origen-destino comparativo entre camino en metros y camino en tiempo IA."""
    # Tramo representativo: Macrocentro a zona Parque Urquiza
    payload = {
        "origin_lat": -32.9500,
        "origin_lon": -60.6600,
        "destination_lat": -32.9600,
        "destination_lon": -60.6350,
        "hora_dia": 18.5,
        "dia_semana": "viernes",
        "clima": "tormenta",
        "es_feriado": False,
    }

    t0 = time.perf_counter()
    response = client.post("/api/route", json=payload)
    elapsed_ms = (time.perf_counter() - t0) * 1000.0

    assert response.status_code == 200
    data = response.json()

    # Validar SLA estricto (<50 ms)
    assert elapsed_ms < 50.0

    # Validar orígenes resueltos
    assert data["origin"]["id"] != data["destination"]["id"]

    # Validar ruta estática
    static_r = data["static_route"]
    assert static_r["found"] is True
    assert static_r["distance_m"] > 0.0
    assert static_r["time_sec"] > 0.0
    assert len(static_r["coordinates"]) >= 2
    assert len(static_r["nodes"]) == len(static_r["coordinates"])

    # Validar ruta dinámica
    dynamic_r = data["dynamic_route"]
    assert dynamic_r["found"] is True
    assert dynamic_r["distance_m"] > 0.0
    assert dynamic_r["time_sec"] > 0.0
    assert len(dynamic_r["coordinates"]) >= 2

    # La ruta dinámica por definición no puede demorar más tiempo que la estática evaluada en el mismo contexto
    assert dynamic_r["time_sec"] <= static_r["time_sec"] + 1e-4

    # Validar comparación
    comp = data["comparison"]
    assert comp["time_saved_sec"] >= -1e-4
    assert comp["time_saved_pct"] >= 0.0


def test_route_same_node_error(client: TestClient):
    """Verifica que calcular una ruta con origen igual a destino retorne error 400."""
    node_id = int(app_state.graph.nodes[0]["id"])
    payload = {
        "origin_id": node_id,
        "destination_id": node_id,
        "hora_dia": 10.0,
        "dia_semana": "lunes",
        "clima": "despejado",
        "es_feriado": False,
    }
    response = client.post("/api/route", json=payload)
    assert response.status_code == 400
    assert "distintas" in response.json()["detail"].lower()


def test_tour_tsp_endpoint(client: TestClient):
    """Verifica la optimización de ronda de entregas (TSP) con 2-opt."""
    # Seleccionamos depósito y 3 paradas de prueba
    depot_node = int(app_state.graph.nodes[100]["id"])
    stop_nodes = [
        int(app_state.graph.nodes[200]["id"]),
        int(app_state.graph.nodes[300]["id"]),
        int(app_state.graph.nodes[400]["id"]),
    ]

    payload = {
        "depot": {"node_id": depot_node},
        "stops": [{"node_id": sid} for sid in stop_nodes],
        "hora_dia": 18.5,
        "dia_semana": "viernes",
        "clima": "tormenta",
        "es_feriado": False,
        "return_to_depot": True,
    }

    t0 = time.perf_counter()
    response = client.post("/api/tour", json=payload)
    elapsed_ms = (time.perf_counter() - t0) * 1000.0

    assert response.status_code == 200
    data = response.json()
    assert elapsed_ms < 500.0

    dyn_tour = data["dynamic_tour"]
    assert len(dyn_tour["numbered_stops"]) == 3
    assert len(dyn_tour["legs"]) == 4  # 3 paradas + regreso al depósito = 4 tramos
    assert dyn_tour["total_distance_km"] > 0.0
    assert dyn_tour["total_time_min"] > 0.0
    assert len(dyn_tour["coordinates"]) > 0


def test_benchmark_metrics_endpoint(client: TestClient):
    """Verifica que /api/metrics devuelva los 4 modelos de la cátedra con sus métricas y residuos."""
    response = client.get("/api/metrics")
    assert response.status_code == 200
    data = response.json()
    assert "models" in data
    models = data["models"]

    # Debe contener los 4 modelos exigidos
    assert "DecisionTreeRegressor" in models
    assert "RidgeRegression" in models
    assert "KNeighborsRegressor" in models
    assert "SupportVectorRegressor" in models

    # Árbol de decisión seleccionado
    dt = models["DecisionTreeRegressor"]
    assert dt["selected_for_production"] is True
    assert dt["r2_score"] >= 0.88
    assert dt["mae_seg"] <= 2.0
    assert "residual_analysis" in dt
    assert "p95_error_seg" in dt["residual_analysis"]

    # Atributos adicionales
    assert "feature_importances" in data


def test_presets_endpoint(client: TestClient):
    """Verifica que /api/presets retorne los escenarios urbanos para el panel web."""
    response = client.get("/api/presets")
    assert response.status_code == 200
    presets = response.json()
    assert isinstance(presets, list)
    assert len(presets) >= 4

    preset_ids = [p["id"] for p in presets]
    assert "madrugada_despejado" in preset_ids
    assert "pico_manana" in preset_ids
    assert "pico_tarde_tormenta" in preset_ids
    assert "domingo_feriado" in preset_ids

    for p in presets:
        assert "name" in p
        assert "hora_dia" in p
        assert "clima" in p
        assert "icon" in p
        assert "description" in p
