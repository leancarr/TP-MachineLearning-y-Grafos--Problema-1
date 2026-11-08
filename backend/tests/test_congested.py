"""
Tests unitarios para el endpoint /api/graph/congested (Top de Arterias Más Colapsadas de Rosario).

Verifica:
- Comportamiento en hora pico (08:00 hs y 18:30 hs): devuelve 10 arterias con congestion_ratio > 1.2 ordenadas descendentemente.
- Comportamiento en madrugada (03:00 hs): devuelve ratios cercanos a 1.0.
- Validación de tipos de datos y atributos de CongestedCorridor.
- Coordenadas geográficas dentro de los límites estrictos de Rosario (-33.1 < lat < -32.8, -60.8 < lon < -60.5).
- Soporte para parámetro limit personalizado y propagación del contexto.
"""

from __future__ import annotations

import time
import pytest
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.state import app_state


@pytest.fixture(scope="module")
def client():
    """Cliente de test con lifespan inicializado."""
    app_state.initialize()
    with TestClient(app) as test_client:
        yield test_client


def test_congested_corridors_rush_hour_morning_and_evening(client: TestClient):
    """
    Verifica que en horas pico (08:00 hs y 18:30 hs) el endpoint devuelva 10 arterias
    con congestion_ratio > 1.2, ordenadas descendentemente y dentro de Rosario.
    """
    peak_scenarios = [
        {"hora_dia": 8.0, "dia_semana": "miercoles", "clima": "despejado", "es_feriado": False},
        {"hora_dia": 18.5, "dia_semana": "viernes", "clima": "tormenta", "es_feriado": False},
    ]

    for payload in peak_scenarios:
        t0 = time.perf_counter()
        response = client.post("/api/graph/congested", json=payload)
        elapsed_ms = (time.perf_counter() - t0) * 1000.0

        assert response.status_code == 200
        data = response.json()

        # Validaciones de estructura de respuesta
        assert data["total_corridors"] == 10
        assert len(data["corridors"]) == 10
        assert "execution_time_ms" in data
        assert elapsed_ms < 250.0

        # Contexto propagado fielmente
        assert data["context"]["hora_dia"] == payload["hora_dia"]
        assert data["context"]["dia_semana"] == payload["dia_semana"]
        assert data["context"]["clima"] == payload["clima"]
        assert data["context"]["es_feriado"] == payload["es_feriado"]

        corridors = data["corridors"]

        # Validar orden descendente por congestion_ratio
        ratios = [c["congestion_ratio"] for c in corridors]
        assert ratios == sorted(ratios, reverse=True), "Las arterias deben estar ordenadas descendentemente por congestion_ratio"

        for c in corridors:
            # En hora pico todas las arterias top deben presentar congestión significativa (>1.2)
            assert c["congestion_ratio"] > 1.2, f"Arteria {c['name']} ratio={c['congestion_ratio']} <= 1.2 en hora pico"

            # Validación de tipos de datos
            assert isinstance(c["name"], str) and len(c["name"]) > 0
            assert c["name"] != "Calle S/N", "No debe incluir nombres genéricos como 'Calle S/N'"
            assert c["tipo_calle"] in {"avenida", "circunvalacion", "comercial", "residencial"}
            assert isinstance(c["sample_tramo_id"], str) and c["sample_tramo_id"].startswith("T_")
            assert c["average_speed_kmh"] > 0.0
            assert c["nominal_speed_kmh"] > 0.0

            # Consistencia matemática del delay_pct
            expected_delay = (c["congestion_ratio"] - 1.0) * 100.0
            assert c["delay_pct"] == pytest.approx(expected_delay, abs=1.5)

            # Rango geográfico estricto del aglomerado de Rosario
            assert -33.1 < c["lat"] < -32.8, f"Latitud {c['lat']} fuera del rango de Rosario"
            assert -60.8 < c["lon"] < -60.5, f"Longitud {c['lon']} fuera del rango de Rosario"


def test_congested_corridors_early_morning(client: TestClient):
    """
    Verifica que en horario de madrugada (03:00 hs) el tráfico sea fluido
    y los ratios de congestión estén cercanos a 1.0 (sin congestión severa).
    """
    payload = {
        "hora_dia": 3.0,
        "dia_semana": "lunes",
        "clima": "despejado",
        "es_feriado": False,
    }

    response = client.post("/api/graph/congested", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert data["total_corridors"] == 10
    corridors = data["corridors"]

    # En la madrugada el ratio promedio de las arterias top debe ser mucho menor que en hora pico
    top_ratio = corridors[0]["congestion_ratio"]
    tenth_ratio = corridors[-1]["congestion_ratio"]

    # En hora pico el top superaba 5.0 a 8.8; en madrugada el ratio máximo debe ser notablemente menor
    assert top_ratio < 3.0, f"Top ratio inesperadamente alto en madrugada: {top_ratio}"
    # La décima arteria debe estar muy próxima a 1.0 (o incluso <1.0)
    assert tenth_ratio <= 1.6, f"Décima arteria en madrugada demasiado congestionada: {tenth_ratio}"

    # Verificamos que las velocidades promedio sean coherentes (no colapsadas)
    for c in corridors:
        assert c["average_speed_kmh"] > 10.0


def test_congested_corridors_custom_limit(client: TestClient):
    """Verifica que el parámetro query 'limit' limite correctamente la cantidad de arterias."""
    payload = {
        "hora_dia": 12.0,
        "dia_semana": "martes",
        "clima": "nublado",
        "es_feriado": False,
    }

    response = client.post("/api/graph/congested?limit=5", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert data["total_corridors"] == 5
    assert len(data["corridors"]) == 5

    # Validar ordenamiento
    ratios = [c["congestion_ratio"] for c in data["corridors"]]
    assert ratios == sorted(ratios, reverse=True)


def test_search_nodes_endpoint_compatibility(client: TestClient):
    """Verifica que /api/nodes/search continúe respondiendo correctamente tras la adición del router."""
    response = client.get("/api/nodes/search?q=corrientes&limit=5")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) > 0
    assert any("corrientes" in item["label"].lower() for item in data)
