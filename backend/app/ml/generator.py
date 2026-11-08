"""
Ticket 02 (MACHI-9): Generador determinista del dataset (100k) con reglas causales.

Genera un dataset sintético reproducible (seed=42) de 100.000 viajes históricos
sobre la red vial real de Rosario a partir de `backend/app/data/rosario_graph.json`.

Reglas Causales Modeladas:
1. Curva Horaria Bimodal:
   - Pico Mañana (07:30 a 09:30 hs)
   - Pico Tarde (17:30 a 19:30 hs)
2. Interacción por Jerarquía Vial:
   - Avenidas (jerarquías 1 y 2): multiplicador de congestión x2.2 a x2.8 durante horas pico.
   - Calles Comerciales (jerarquía 3): multiplicador x1.8 a x2.2 durante horas pico.
   - Autopista Circunvalación: tráfico pesado x1.5 a x1.7 durante horas pico.
   - Calles Residenciales (jerarquía 4): impacto bajo x1.10 a x1.20 (vías de escape).
3. Sinergia Climática:
   - Despejado: x1.0
   - Nublado: x1.02
   - Lluvia: x1.75 en avenidas/comerciales, x1.50 circunvalación, x1.30 residencial.
   - Tormenta: x2.60 en avenidas/comerciales, x1.80 circunvalación, x1.70 residencial.
4. Fines de Semana y Feriados:
   - Desaparición de picos laborales/escolares (sin hora pico).
   - Reducción del -20% sobre la congestión urbana basal.
5. Ruido Gaussiano Continuo:
   - epsilon ~ N(1.0, 0.08) generado con NumPy RNG para evitar memorización trivial
     y permitir un R^2 objetivo ~ 0.90 con modelos de regresión no lineales.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from backend.app.config import DATASET_CSV_PATH, GRAPH_JSON_PATH, RANDOM_SEED


def get_rush_intensity(horas: np.ndarray) -> np.ndarray:
    """
    Calcula la intensidad de la hora pico bimodal en [0.0, 1.0].

    - Pico mañana: 07:30 a 09:30 (rampa 07:00 a 07:30, centro en 08:30, caída 09:30 a 10:00).
    - Pico tarde: 17:30 a 19:30 (rampa 17:00 a 17:30, centro en 18:30, caída 19:30 a 20:00).
    """
    morning = np.zeros_like(horas, dtype=np.float64)
    m_ramp_up = (horas >= 7.0) & (horas < 7.5)
    morning[m_ramp_up] = (horas[m_ramp_up] - 7.0) / 0.5 * 0.88

    m_peak = (horas >= 7.5) & (horas <= 9.5)
    morning[m_peak] = 0.88 + 0.12 * (1.0 - (np.abs(horas[m_peak] - 8.5) / 1.0) ** 2)

    m_ramp_down = (horas > 9.5) & (horas <= 10.0)
    morning[m_ramp_down] = (10.0 - horas[m_ramp_down]) / 0.5 * 0.88

    evening = np.zeros_like(horas, dtype=np.float64)
    e_ramp_up = (horas >= 17.0) & (horas < 17.5)
    evening[e_ramp_up] = (horas[e_ramp_up] - 17.0) / 0.5 * 0.88

    e_peak = (horas >= 17.5) & (horas <= 19.5)
    evening[e_peak] = 0.88 + 0.12 * (1.0 - (np.abs(horas[e_peak] - 18.5) / 1.0) ** 2)

    e_ramp_down = (horas > 19.5) & (horas <= 20.0)
    evening[e_ramp_down] = (20.0 - horas[e_ramp_down]) / 0.5 * 0.88

    return np.clip(morning + evening, 0.0, 1.0)


def generate_trips_dataset(
    n_samples: int = 100_000,
    seed: int = RANDOM_SEED,
    graph_path: Path | str = GRAPH_JSON_PATH,
) -> pd.DataFrame:
    """
    Genera un DataFrame determinista con 100.000 viajes históricos muestreados sobre
    las aristas del grafo vial de Rosario, aplicando reglas físicas y causales.

    Columnas generadas:
    - tramo_id: str (identificador de arista en rosario_graph.json)
    - hora_dia: float (0.0 a 23.99)
    - dia_semana: str (lunes..domingo)
    - clima: str (despejado, nublado, lluvia, tormenta)
    - es_feriado: bool
    - tipo_calle: str (avenida, circunvalacion, comercial, residencial)
    - jerarquia_osm: int (1, 2, 3, 4)
    - longitud_m: float (metros de la cuadra)
    - velocidad_promedio_historica: float (km/h)
    - tiempo_real_viaje: float (segundos de cruce con tráfico y clima)
    """
    graph_file = Path(graph_path)
    if not graph_file.exists():
        raise FileNotFoundError(f"No se encontró el grafo en {graph_file}")

    with open(graph_file, "r", encoding="utf-8") as f:
        graph_data: dict[str, Any] = json.load(f)

    edges = graph_data.get("edges", [])
    if not edges:
        raise ValueError(f"El grafo en {graph_file} no contiene aristas.")

    # Generador pseudoaleatorio reproducible de NumPy
    rng = np.random.default_rng(seed)

    # 1. Extracción vectorizada de atributos fijos de los tramos
    edge_longitud = np.array([float(e["longitud_m"]) for e in edges], dtype=np.float64)
    edge_velocidad = np.array([float(e["velocidad_promedio_historica"]) for e in edges], dtype=np.float64)
    edge_jerarquia = np.array([int(e["jerarquia_osm"]) for e in edges], dtype=np.int32)
    edge_tipo = np.array([str(e["tipo_calle"]) for e in edges], dtype=object)
    edge_tramo_id = np.array([str(e["tramo_id"]) for e in edges], dtype=object)

    # 2. Muestreo de tramos con reemplazo
    edge_indices = rng.choice(len(edges), size=n_samples, replace=True)
    sample_tramos = edge_tramo_id[edge_indices]
    sample_longitudes = edge_longitud[edge_indices]
    sample_velocidades = edge_velocidad[edge_indices]
    sample_jerarquias = edge_jerarquia[edge_indices]
    sample_tipos = edge_tipo[edge_indices]

    # 3. Distribución horaria realista (0.0 a 23.99 con mayor densidad diurna y picos)
    hour_weights = np.array([
        0.010, 0.007, 0.005, 0.005, 0.008, 0.015,  # 00-05h (madrugada libre)
        0.035, 0.075, 0.090, 0.075, 0.050, 0.050,  # 06-11h (pico mañana)
        0.060, 0.055, 0.050, 0.055, 0.060, 0.080,  # 12-17h (mediodía comercial)
        0.095, 0.080, 0.055, 0.035, 0.020, 0.010,  # 18-23h (pico tarde y noche)
    ], dtype=np.float64)
    hour_weights /= hour_weights.sum()

    int_hours = rng.choice(24, size=n_samples, p=hour_weights)
    minute_fracs = rng.uniform(0.0, 0.99, size=n_samples)
    horas = np.round(int_hours + minute_fracs, 2)

    # 4. Días de la semana (mayor actividad en días laborales)
    dias_list = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"]
    dia_probs = [0.155, 0.155, 0.155, 0.155, 0.160, 0.115, 0.105]
    dias = rng.choice(dias_list, size=n_samples, p=dia_probs)

    # 5. Clima: despejado 60%, nublado 20%, lluvia 15%, tormenta 5%
    climas_list = ["despejado", "nublado", "lluvia", "tormenta"]
    clima_probs = [0.60, 0.20, 0.15, 0.05]
    climas = rng.choice(climas_list, size=n_samples, p=clima_probs)

    # 6. Feriados: ~4.5% en días hábiles, ~2.0% en fines de semana
    random_feriados = rng.random(n_samples)
    es_fin_de_semana = np.isin(dias, ["sabado", "domingo"])
    es_feriado = np.where(es_fin_de_semana, random_feriados < 0.02, random_feriados < 0.045)

    is_off_peak_day = es_fin_de_semana | es_feriado

    # 7. Máscaras de tipo de calle
    is_avenida = np.isin(sample_jerarquias, [1, 2]) & (sample_tipos != "circunvalacion")
    is_circunvalacion = (sample_tipos == "circunvalacion")
    is_comercial = (sample_jerarquias == 3) | (sample_tipos == "comercial")
    is_residencial = (sample_jerarquias == 4) | (sample_tipos == "residencial")

    # 8. Intensidad de hora pico (desaparece en fines de semana y feriados)
    rush_intensity = get_rush_intensity(horas)
    rush_intensity[is_off_peak_day] = 0.0

    # 9. Congestión basal según franja horaria (días hábiles normales)
    base_traffic = np.ones(n_samples, dtype=np.float64)
    is_night = (horas >= 22.0) | (horas < 6.0)
    is_midday = (horas >= 10.5) & (horas < 16.5)

    # Nocturno (flujo libre)
    base_traffic[is_night & is_avenida] = 0.85
    base_traffic[is_night & is_circunvalacion] = 0.80
    base_traffic[is_night & is_comercial] = 0.90
    base_traffic[is_night & is_residencial] = 0.95

    # Mediodía (actividad normal sostenida)
    base_traffic[is_midday & is_avenida] = 1.30
    base_traffic[is_midday & is_circunvalacion] = 1.15
    base_traffic[is_midday & is_comercial] = 1.25
    base_traffic[is_midday & is_residencial] = 1.05

    # 10. Multiplicador de pico por jerarquía:
    # Avenidas jerarquías 1 y 2: x2.2 a x2.8
    # Residenciales jerarquía 4: x1.10 a x1.20
    rush_target = np.zeros(n_samples, dtype=np.float64)
    rush_target[is_avenida & (sample_jerarquias == 1)] = 2.65
    rush_target[is_avenida & (sample_jerarquias == 2)] = 2.45
    rush_target[is_circunvalacion] = 1.60
    rush_target[is_comercial] = 2.05
    rush_target[is_residencial] = 1.15

    # Factor de tráfico combinado
    traffic_factor = base_traffic + rush_intensity * (rush_target - base_traffic)

    # En fines de semana y feriados: aplana picos y reduce la congestión basal en -20%
    traffic_factor[is_off_peak_day] = 1.0 + (traffic_factor[is_off_peak_day] - 1.0) * 0.80
    traffic_factor[is_off_peak_day & is_night] = 0.80

    # 11. Sinergia climática:
    # Lluvia: x1.75 avenidas/comerciales, x1.50 circunvalación, x1.30 residencial
    # Tormenta: x2.60 avenidas/comerciales, x1.80 circunvalación, x1.70 residencial
    weather_factor = np.ones(n_samples, dtype=np.float64)
    is_cloudy = (climas == "nublado")
    is_rain = (climas == "lluvia")
    is_storm = (climas == "tormenta")

    weather_factor[is_cloudy] = 1.02

    weather_factor[is_rain & (is_avenida | is_comercial)] = 1.75
    weather_factor[is_rain & is_circunvalacion] = 1.50
    weather_factor[is_rain & is_residencial] = 1.30

    weather_factor[is_storm & (is_avenida | is_comercial)] = 2.60
    weather_factor[is_storm & is_circunvalacion] = 1.80
    weather_factor[is_storm & is_residencial] = 1.70

    # 12. Tiempo físico base: t_base = longitud_m / (velocidad_kmh / 3.6)
    t_base = sample_longitudes / (sample_velocidades / 3.6)

    # 13. Ruido Gaussiano: epsilon ~ N(1.0, 0.08)
    epsilon = rng.normal(1.0, 0.08, size=n_samples)
    epsilon = np.clip(epsilon, 0.70, 1.35)

    # Tiempo real final en segundos
    tiempo_real = np.round(t_base * traffic_factor * weather_factor * epsilon, 2)
    tiempo_real = np.maximum(tiempo_real, 0.50)  # Garantiza tiempo_real_viaje > 0

    df = pd.DataFrame({
        "tramo_id": sample_tramos,
        "hora_dia": horas,
        "dia_semana": dias,
        "clima": climas,
        "es_feriado": es_feriado,
        "tipo_calle": sample_tipos,
        "jerarquia_osm": sample_jerarquias,
        "longitud_m": np.round(sample_longitudes, 1),
        "velocidad_promedio_historica": sample_velocidades,
        "tiempo_real_viaje": tiempo_real,
    })

    return df


def save_dataset_csv(
    df: pd.DataFrame,
    output_path: Path | str = DATASET_CSV_PATH,
) -> Path:
    """Guarda el DataFrame generado en archivo CSV con codificación UTF-8 y sin índice."""
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(path, index=False, encoding="utf-8")
    return path


def main() -> None:
    """Función de entrada para ejecución CLI."""
    print("=== Generador de Dataset Histórico de Rosario (100k) ===")
    print(f"Grafo de entrada: {GRAPH_JSON_PATH}")
    print(f"Destino CSV: {DATASET_CSV_PATH}")

    df = generate_trips_dataset()
    save_dataset_csv(df)

    print(f"Dataset generado exitosamente: {len(df):,} filas.")
    print("\nColumnas:")
    for col in df.columns:
        print(f" - {col}: {df[col].dtype}")

    print("\nPrimeras 5 filas:")
    print(df.head())

    print("\nEstadísticas de tiempo_real_viaje:")
    print(df["tiempo_real_viaje"].describe())


if __name__ == "__main__":
    main()
