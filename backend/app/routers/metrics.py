"""
Router para auditoría, métricas comparativas del benchmark y presets contextuales (Ticket 15).
"""

from __future__ import annotations

import json
from typing import Any
from fastapi import APIRouter, HTTPException

from backend.app.config import DATA_DIR, METRICS_JSON_PATH

router = APIRouter(prefix="/api", tags=["Auditoría y Presets"])

PRESETS: list[dict[str, Any]] = [
    {
        "id": "madrugada_despejado",
        "name": "Madrugada Despejada",
        "time_label": "03:00 hs",
        "hora_dia": 3.0,
        "dia_semana": "martes",
        "clima": "despejado",
        "es_feriado": False,
        "icon": "🌙",
        "badge": "Fluido",
        "badge_color": "green",
        "description": "Tránsito prácticamente nulo, velocidades máximas en avenidas y circunvalación sin demoras en semáforos.",
    },
    {
        "id": "pico_manana",
        "name": "Hora Pico Mañana",
        "time_label": "08:00 hs",
        "hora_dia": 8.0,
        "dia_semana": "miercoles",
        "clima": "despejado",
        "es_feriado": False,
        "icon": "🚗",
        "badge": "Congestión Severa",
        "badge_color": "red",
        "description": "Ingreso laboral y escolar masivo hacia el macrocentro. Cuellos de botella severos en Av. Pellegrini, Av. Francia y Bv. Oroño.",
    },
    {
        "id": "mediodia_lluvia",
        "name": "Mediodía Lluvioso",
        "time_label": "13:00 hs",
        "hora_dia": 13.0,
        "dia_semana": "jueves",
        "clima": "lluvia",
        "es_feriado": False,
        "icon": "🌧️",
        "badge": "Moderado / Húmedo",
        "badge_color": "yellow",
        "description": "Salida escolar y tránsito gastronómico. Pavimento resbaladizo, baja velocidad media y frenadas anticipadas.",
    },
    {
        "id": "pico_tarde_tormenta",
        "name": "Pico Tarde con Tormenta",
        "time_label": "18:30 hs",
        "hora_dia": 18.5,
        "dia_semana": "viernes",
        "clima": "tormenta",
        "es_feriado": False,
        "icon": "⛈️",
        "badge": "Colapso Crítico",
        "badge_color": "red",
        "description": "Peor escenario urbano: regreso a casa de viernes + tormenta severa. Multiplicador de hasta 6.7x en tiempos de viaje.",
    },
    {
        "id": "domingo_feriado",
        "name": "Domingo / Feriado Tranquilo",
        "time_label": "16:00 hs",
        "hora_dia": 16.0,
        "dia_semana": "domingo",
        "clima": "despejado",
        "es_feriado": True,
        "icon": "☀️",
        "badge": "Flujo Turístico",
        "badge_color": "green",
        "description": "Comercio céntrico cerrado, flujo vehicular concentrado exclusivamente en la ribera del Paraná y parques.",
    },
]


@router.get(
    "/metrics",
    summary="Tabla comparativa oficial del benchmark de Machine Learning y diagnóstico de residuos",
)
def get_benchmark_metrics() -> dict[str, Any]:
    """Retorna las métricas cuantitativas (R², MAE, RMSE, tiempo de inferencia) de los 4 modelos evaluados."""
    if not METRICS_JSON_PATH.exists():
        raise HTTPException(
            status_code=404,
            detail="El archivo de métricas del benchmark aún no fue generado.",
        )
    try:
        with open(METRICS_JSON_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)

        # Si existe el archivo detallado del árbol, adjuntamos la importancia de variables
        dt_metrics_path = DATA_DIR / "decision_tree_metrics.json"
        if dt_metrics_path.exists():
            with open(dt_metrics_path, "r", encoding="utf-8") as f_dt:
                dt_data = json.load(f_dt)
                data["feature_importances"] = dt_data.get("feature_importances", [])
                data["decision_tree_hyperparameters"] = dt_data.get("hyperparameters", {})

        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al leer metrics.json: {e}")


@router.get(
    "/presets",
    summary="Escenarios urbanos contextuales predefinidos para la app web",
)
def get_scenario_presets() -> list[dict[str, Any]]:
    """Devuelve los presets contextuales para alternar rápidamente en el panel de control del frontend."""
    return PRESETS
