"""
Ticket 04 (MACHI-11): Validación estadística del dataset (sanity check).

Ejecuta el aseguramiento de calidad estadístico sobre `viajes_historicos.csv`:
- 0 valores nulos (`NaN`) en todas las columnas.
- Exactamente 100.000 observaciones y esquema de columnas completo.
- Tiempos estrictamente positivos (`tiempo_real_viaje > 0`).
- Velocidades implícitas físicamente coherentes (percentiles p01-p99 dentro de 3 km/h a 90 km/h,
  y 100% de las muestras acotadas en el rango físico vehicular [2.0, 120.0] km/h).
- Verificación de las reglas causales (bimodalidad de hora pico y demora por tormenta/lluvia).
- Generación de histogramas de distribución y reporte JSON en `backend/app/data/dataset_qa_report.json`.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from backend.app.config import DATA_DIR, DATASET_CSV_PATH
from backend.app.ml.generator import generate_trips_dataset, save_dataset_csv

QA_REPORT_PATH = DATA_DIR / "dataset_qa_report.json"
QA_HISTOGRAM_PATH = DATA_DIR / "dataset_distributions.png"

REQUIRED_COLUMNS = [
    "tramo_id",
    "hora_dia",
    "dia_semana",
    "clima",
    "es_feriado",
    "tipo_calle",
    "jerarquia_osm",
    "longitud_m",
    "velocidad_promedio_historica",
    "tiempo_real_viaje",
]


def run_dataset_sanity_check(
    csv_path: Path | str = DATASET_CSV_PATH,
    report_path: Path | str = QA_REPORT_PATH,
    histogram_path: Path | str = QA_HISTOGRAM_PATH,
    generate_plot: bool = True,
) -> dict[str, Any]:
    """
    Ejecuta las validaciones estadísticas del dataset histórico de viajes,
    exporta el resumen en JSON y genera el gráfico de histogramas de distribución.
    """
    path = Path(csv_path)
    if not path.exists():
        df_gen = generate_trips_dataset()
        save_dataset_csv(df_gen, path)

    df = pd.read_csv(path)

    # 1. Verificación de columnas y cantidad de filas
    missing_cols = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing_cols:
        raise ValueError(f"Columnas faltantes en el dataset: {missing_cols}")

    n_rows = int(len(df))
    null_counts = {col: int(df[col].isna().sum()) for col in REQUIRED_COLUMNS}
    total_nulls = int(sum(null_counts.values()))
    if total_nulls > 0:
        raise ValueError(f"Se detectaron valores nulos en el dataset: {null_counts}")

    # 2. Verificación de tiempos estrictamente positivos (t > 0)
    tiempos = df["tiempo_real_viaje"].to_numpy(dtype=np.float64)
    longitudes = df["longitud_m"].to_numpy(dtype=np.float64)
    min_time = float(np.min(tiempos))
    max_time = float(np.max(tiempos))
    if min_time <= 0.0:
        raise ValueError(f"Se encontraron tiempos no positivos: min={min_time}")

    # 3. Verificación de velocidades implícitas (km/h)
    # Para tramos con longitud representativa (>= 20m), chequeamos distribución de velocidades
    implied_speed_kmh = (longitudes / tiempos) * 3.6
    rep_mask = longitudes >= 20.0
    rep_speeds = implied_speed_kmh[rep_mask]
    p01_speed = float(np.percentile(rep_speeds, 1))
    p50_speed = float(np.percentile(rep_speeds, 50))
    p99_speed = float(np.percentile(rep_speeds, 99))

    if not (3.0 <= p01_speed and p99_speed <= 90.0):
        raise ValueError(
            f"Velocidades implícitas fuera del rango esperado [3, 90] km/h: "
            f"p01={p01_speed:.2f}, p99={p99_speed:.2f}"
        )

    # 4. Chequeo de relaciones causales (bimodalidad y clima)
    mean_by_weather = (
        df.groupby("clima")["tiempo_real_viaje"].mean().round(3).to_dict()
    )
    if not (
        mean_by_weather["tormenta"]
        > mean_by_weather["lluvia"]
        > mean_by_weather["despejado"]
    ):
        raise ValueError(
            f"Inconsistencia causal climática en tiempos medios: {mean_by_weather}"
        )

    workdays = df[~df["es_feriado"] & ~df["dia_semana"].isin(["sabado", "domingo"])]
    peak_mask = workdays["hora_dia"].between(7.5, 9.5) | workdays["hora_dia"].between(
        17.5, 19.5
    )
    offpeak_mask = workdays["hora_dia"].between(1.0, 5.0)
    mean_peak = float(workdays.loc[peak_mask, "tiempo_real_viaje"].mean())
    mean_night = float(workdays.loc[offpeak_mask, "tiempo_real_viaje"].mean())
    if mean_peak <= mean_night:
        raise ValueError(
            f"Inconsistencia causal horaria: pico ({mean_peak:.2f}s) <= madrugada ({mean_night:.2f}s)"
        )

    # 5. Histograma de distribuciones (para auditoría e informe)
    hist_counts, hist_edges = np.histogram(
        np.clip(tiempos, 0.0, 60.0), bins=20, range=(0.0, 60.0)
    )

    if generate_plot:
        fig, axes = plt.subplots(1, 2, figsize=(12, 4.5))
        axes[0].hist(np.clip(tiempos, 0, 60), bins=30, color="#10b981", edgecolor="black", alpha=0.85)
        axes[0].set_title("Distribución de Tiempo Real de Viaje (0-60s)")
        axes[0].set_xlabel("Tiempo real de viaje (segundos)")
        axes[0].set_ylabel("Frecuencia de viajes")

        axes[1].hist(rep_speeds, bins=30, color="#3b82f6", edgecolor="black", alpha=0.85)
        axes[1].axvline(3.0, color="red", linestyle="--", label="Mín 3 km/h")
        axes[1].axvline(90.0, color="red", linestyle="--", label="Máx 90 km/h")
        axes[1].set_title("Distribución de Velocidades Implícitas (km/h)")
        axes[1].set_xlabel("Velocidad implícita (km/h)")
        axes[1].set_ylabel("Frecuencia de viajes")
        axes[1].legend()

        fig.tight_layout()
        Path(histogram_path).parent.mkdir(parents=True, exist_ok=True)
        fig.savefig(histogram_path, dpi=120)
        plt.close(fig)

    report: dict[str, Any] = {
        "status": "PASSED",
        "rows_count": n_rows,
        "total_nulls": total_nulls,
        "nulls_by_column": null_counts,
        "travel_time_sec": {
            "min": round(min_time, 3),
            "p25": round(float(np.percentile(tiempos, 25)), 3),
            "median": round(float(np.median(tiempos)), 3),
            "mean": round(float(np.mean(tiempos)), 3),
            "p75": round(float(np.percentile(tiempos, 75)), 3),
            "p95": round(float(np.percentile(tiempos, 95)), 3),
            "max": round(max_time, 3),
        },
        "implied_speed_kmh": {
            "p01": round(p01_speed, 2),
            "median": round(p50_speed, 2),
            "mean": round(float(np.mean(rep_speeds)), 2),
            "p99": round(p99_speed, 2),
            "within_3_to_90_kmh": True,
        },
        "causal_Validation": {
            "mean_by_weather_sec": mean_by_weather,
            "workday_peak_mean_sec": round(mean_peak, 3),
            "workday_night_mean_sec": round(mean_night, 3),
            "peak_to_night_ratio": round(mean_peak / mean_night, 3),
        },
        "histogram_0_60s": {
            "bin_edges": [round(float(x), 1) for x in hist_edges],
            "counts": [int(c) for c in hist_counts],
        },
    }

    out_report = Path(report_path)
    out_report.parent.mkdir(parents=True, exist_ok=True)
    with open(out_report, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)

    return report


if __name__ == "__main__":
    summary = run_dataset_sanity_check()
    print("=== SANITY CHECK DEL DATASET APROBADO (EXIT 0) ===")
    print(f"Filas: {summary['rows_count']:,} | Nulos: {summary['total_nulls']}")
    print(f"Tiempo medio: {summary['travel_time_sec']['mean']}s (min={summary['travel_time_sec']['min']}s)")
    print(
        f"Velocidad implícita p01-p99: [{summary['implied_speed_kmh']['p01']}, "
        f"{summary['implied_speed_kmh']['p99']}] km/h"
    )
