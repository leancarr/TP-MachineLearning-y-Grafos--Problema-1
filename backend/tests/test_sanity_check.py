"""
Tests unitarios para Ticket 04 (MACHI-11): Validación estadística del dataset (sanity check).
"""

from __future__ import annotations

from backend.app.ml.sanity_check import (
    QA_HISTOGRAM_PATH,
    QA_REPORT_PATH,
    run_dataset_sanity_check,
)


def test_dataset_statistical_sanity_check() -> None:
    """Verifica 0 NaNs, tiempos > 0, velocidades implícitas entre 3 y 90 km/h e histogramas."""
    report = run_dataset_sanity_check()

    assert report["status"] == "PASSED"
    assert report["rows_count"] == 100_000
    assert report["total_nulls"] == 0
    assert report["travel_time_sec"]["min"] > 0.0
    assert report["implied_speed_kmh"]["within_3_to_90_kmh"] is True
    assert 3.0 <= report["implied_speed_kmh"]["p01"]
    assert report["implied_speed_kmh"]["p99"] <= 90.0
    assert report["causal_Validation"]["peak_to_night_ratio"] > 1.35

    assert QA_REPORT_PATH.exists()
    assert QA_HISTOGRAM_PATH.exists()
    assert sum(report["histogram_0_60s"]["counts"]) > 90_000
