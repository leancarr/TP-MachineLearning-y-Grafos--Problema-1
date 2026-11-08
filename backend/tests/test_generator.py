"""
Tests for Ticket 02 (MACHI-9): Deterministic dataset generator with causal rules.

Validates:
1. Exact row count (100,000 rows).
2. Schema and target columns required by cátedra.
3. 0 null values, all physical dimensions and travel times > 0.
4. Statistical sanity: rush hour avenue travel time is significantly higher than midnight (> 2x).
5. Weather synergy: rain and storm significantly increase transit times.
6. Weekend peak flattening.
7. Full determinism and reproducibility with seed=42.
"""

from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from backend.app.config import DATASET_CSV_PATH, GRAPH_JSON_PATH, RANDOM_SEED
from backend.app.ml.generator import generate_trips_dataset, get_rush_intensity, save_dataset_csv


@pytest.fixture(scope="module")
def dataset_df() -> pd.DataFrame:
    """Loads the generated dataset or generates it if not present."""
    if not DATASET_CSV_PATH.is_file():
        df = generate_trips_dataset(n_samples=100_000, seed=RANDOM_SEED, graph_path=GRAPH_JSON_PATH)
        save_dataset_csv(df, DATASET_CSV_PATH)
    return pd.read_csv(DATASET_CSV_PATH)


def test_dataset_exact_100k_rows(dataset_df: pd.DataFrame) -> None:
    """Verifies that the dataset has exactly 100,000 rows."""
    assert len(dataset_df) == 100_000, f"Expected 100,000 rows, but got {len(dataset_df)}"


def test_dataset_required_columns(dataset_df: pd.DataFrame) -> None:
    """Verifies that all columns required by the syllabus are present."""
    expected_columns = [
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
    assert list(dataset_df.columns) == expected_columns, (
        f"Columns mismatch: expected {expected_columns}, got {list(dataset_df.columns)}"
    )


def test_no_nulls_and_positive_travel_time(dataset_df: pd.DataFrame) -> None:
    """Verifies zero nulls and strictly positive travel times and physical dimensions."""
    # 0 null values
    null_counts = dataset_df.isnull().sum()
    assert null_counts.sum() == 0, f"Dataset contains null values: {null_counts[null_counts > 0]}"

    # All tiempo_real_viaje > 0
    assert (dataset_df["tiempo_real_viaje"] > 0).all(), "Found non-positive tiempo_real_viaje values"

    # All longitud_m > 0
    assert (dataset_df["longitud_m"] > 0).all(), "Found non-positive longitud_m values"

    # All velocidad_promedio_historica > 0
    assert (dataset_df["velocidad_promedio_historica"] > 0).all(), (
        "Found non-positive velocidad_promedio_historica values"
    )


def test_valid_categorical_domains(dataset_df: pd.DataFrame) -> None:
    """Verifies that categorical features and hours stay within valid urban bounds."""
    # hora_dia in [0.0, 24.0)
    assert dataset_df["hora_dia"].min() >= 0.0
    assert dataset_df["hora_dia"].max() < 24.0

    # dia_semana
    expected_dias = {"lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"}
    assert set(dataset_df["dia_semana"].unique()).issubset(expected_dias)

    # clima
    expected_climas = {"despejado", "nublado", "lluvia", "tormenta"}
    assert set(dataset_df["clima"].unique()).issubset(expected_climas)

    # tipo_calle
    expected_tipos = {"avenida", "circunvalacion", "comercial", "residencial"}
    assert set(dataset_df["tipo_calle"].unique()).issubset(expected_tipos)

    # jerarquia_osm
    expected_jerarquias = {1, 2, 3, 4}
    assert set(dataset_df["jerarquia_osm"].unique()).issubset(expected_jerarquias)

    # es_feriado
    assert set(dataset_df["es_feriado"].unique()).issubset({True, False})


def test_clima_distribution_proportions(dataset_df: pd.DataFrame) -> None:
    """Verifies weather distribution matches syllabus targets (~60% despejado, ~20% nublado, ~15% lluvia, ~5% tormenta)."""
    clima_counts = dataset_df["clima"].value_counts(normalize=True)
    assert 0.58 <= clima_counts["despejado"] <= 0.62
    assert 0.18 <= clima_counts["nublado"] <= 0.22
    assert 0.13 <= clima_counts["lluvia"] <= 0.17
    assert 0.04 <= clima_counts["tormenta"] <= 0.06


def test_statistical_sanity_rush_hour_vs_midnight(dataset_df: pd.DataFrame) -> None:
    """
    Statistical sanity test:
    Avenue travel time per 100 meters (pace) during weekday morning rush hour (07:30-09:30)
    under clear weather is significantly higher (> 2.0x) than at midnight (00:00-05:00).
    """
    avenidas_habiles = dataset_df[
        (dataset_df["tipo_calle"] == "avenida")
        & (~dataset_df["dia_semana"].isin(["sabado", "domingo"]))
        & (~dataset_df["es_feriado"])
        & (dataset_df["clima"] == "despejado")
    ]

    rush_mask = (avenidas_habiles["hora_dia"] >= 7.5) & (avenidas_habiles["hora_dia"] <= 9.5)
    midnight_mask = (avenidas_habiles["hora_dia"] >= 0.0) & (avenidas_habiles["hora_dia"] <= 5.0)

    rush_trips = avenidas_habiles[rush_mask]
    midnight_trips = avenidas_habiles[midnight_mask]

    assert len(rush_trips) > 100, f"Too few rush hour avenue trips: {len(rush_trips)}"
    assert len(midnight_trips) > 100, f"Too few midnight avenue trips: {len(midnight_trips)}"

    # Pace in seconds per 100 meters
    rush_pace = (rush_trips["tiempo_real_viaje"] / rush_trips["longitud_m"]) * 100.0
    midnight_pace = (midnight_trips["tiempo_real_viaje"] / midnight_trips["longitud_m"]) * 100.0

    mean_rush = rush_pace.mean()
    mean_midnight = midnight_pace.mean()

    # Rush hour travel time should be at least 2.2x to 3.0x higher than midnight
    ratio = mean_rush / mean_midnight
    assert ratio >= 2.0, (
        f"Rush hour pace ({mean_rush:.2f} s/100m) is not significantly higher than "
        f"midnight pace ({mean_midnight:.2f} s/100m). Ratio: {ratio:.2f}x"
    )


def test_hierarchy_interaction_during_rush(dataset_df: pd.DataFrame) -> None:
    """
    Verifies that during rush hour, Avenidas (hierarchy 1 & 2) suffer much higher congestion
    multiplier than Residential streets (hierarchy 4).
    """
    rush_habiles = dataset_df[
        (~dataset_df["dia_semana"].isin(["sabado", "domingo"]))
        & (~dataset_df["es_feriado"])
        & (dataset_df["clima"] == "despejado")
        & (dataset_df["hora_dia"] >= 7.5) & (dataset_df["hora_dia"] <= 9.5)
    ]

    av_trips = rush_habiles[rush_habiles["tipo_calle"] == "avenida"]
    res_trips = rush_habiles[rush_habiles["tipo_calle"] == "residencial"]

    # Calculate empirical congestion multiplier: tiempo_real / tiempo_base
    av_base = av_trips["longitud_m"] / (av_trips["velocidad_promedio_historica"] / 3.6)
    av_mult = (av_trips["tiempo_real_viaje"] / av_base).mean()

    res_base = res_trips["longitud_m"] / (res_trips["velocidad_promedio_historica"] / 3.6)
    res_mult = (res_trips["tiempo_real_viaje"] / res_base).mean()

    # Avenidas get x2.2 to x2.8 while residential gets x1.10 to x1.20
    assert 2.1 <= av_mult <= 2.9, f"Avenida rush multiplier out of expected range: {av_mult:.2f}"
    assert 1.05 <= res_mult <= 1.25, f"Residencial rush multiplier out of expected range: {res_mult:.2f}"
    assert av_mult > res_mult * 1.8, "Avenida multiplier should be substantially higher than residential"


def test_weather_synergy(dataset_df: pd.DataFrame) -> None:
    """Verifies that storm and rain increase avenue travel times over clear weather."""
    av_rush = dataset_df[
        (dataset_df["tipo_calle"] == "avenida")
        & (~dataset_df["dia_semana"].isin(["sabado", "domingo"]))
        & (~dataset_df["es_feriado"])
        & (dataset_df["hora_dia"] >= 7.5) & (dataset_df["hora_dia"] <= 9.5)
    ]

    despejado_pace = (
        (av_rush[av_rush["clima"] == "despejado"]["tiempo_real_viaje"] /
         av_rush[av_rush["clima"] == "despejado"]["longitud_m"]) * 100.0
    ).mean()

    lluvia_pace = (
        (av_rush[av_rush["clima"] == "lluvia"]["tiempo_real_viaje"] /
         av_rush[av_rush["clima"] == "lluvia"]["longitud_m"]) * 100.0
    ).mean()

    tormenta_pace = (
        (av_rush[av_rush["clima"] == "tormenta"]["tiempo_real_viaje"] /
         av_rush[av_rush["clima"] == "tormenta"]["longitud_m"]) * 100.0
    ).mean()

    assert lluvia_pace > despejado_pace * 1.5, f"Rain pace {lluvia_pace:.2f} should exceed clear {despejado_pace:.2f} * 1.5"
    assert tormenta_pace > lluvia_pace * 1.3, f"Storm pace {tormenta_pace:.2f} should exceed rain {lluvia_pace:.2f} * 1.3"


def test_weekend_peak_flattening(dataset_df: pd.DataFrame) -> None:
    """Verifies that on Sunday mornings, rush hour peaks are flattened."""
    av_morning = dataset_df[
        (dataset_df["tipo_calle"] == "avenida")
        & (dataset_df["clima"] == "despejado")
        & (dataset_df["hora_dia"] >= 7.5) & (dataset_df["hora_dia"] <= 9.5)
    ]

    weekday_pace = (
        (av_morning[av_morning["dia_semana"] == "miercoles"]["tiempo_real_viaje"] /
         av_morning[av_morning["dia_semana"] == "miercoles"]["longitud_m"]) * 100.0
    ).mean()

    sunday_pace = (
        (av_morning[av_morning["dia_semana"] == "domingo"]["tiempo_real_viaje"] /
         av_morning[av_morning["dia_semana"] == "domingo"]["longitud_m"]) * 100.0
    ).mean()

    assert weekday_pace > sunday_pace * 1.7, (
        f"Weekday pace ({weekday_pace:.2f}) should be much higher than Sunday morning ({sunday_pace:.2f})"
    )


def test_generator_reproducibility() -> None:
    """Verifies that two runs with the same seed yield identical samples."""
    df1 = generate_trips_dataset(n_samples=500, seed=42)
    df2 = generate_trips_dataset(n_samples=500, seed=42)
    pd.testing.assert_frame_equal(df1, df2)
