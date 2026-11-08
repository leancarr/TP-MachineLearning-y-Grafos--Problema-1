import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import BenchmarkModal from "../BenchmarkModal";
import * as api from "../../services/api";
import { BenchmarkMetricsResponse } from "../../types";

const mockMetrics: BenchmarkMetricsResponse = {
  benchmark_date: "2026-11-08",
  test_set_size: 20000,
  models: {
    DecisionTreeRegressor: {
      mae_seg: 1.4949,
      rmse_seg: 4.1565,
      r2_score: 0.899,
      inference_time_30k: "4.57 ms",
      residual_analysis: {
        mean_error: -0.0369,
        std_error: 4.1564,
        median_error: 0.013,
        p95_error_seg: 4.5329,
        skewness: 1.0901,
      },
      selected_for_production: true,
      reason: "Excelente R² (0.899) y velocidad óptima (<10 ms para 30k aristas)",
    },
    RidgeRegression: {
      mae_seg: 2.9314,
      rmse_seg: 6.2621,
      r2_score: 0.7709,
      inference_time_30k: "1.52 ms",
      residual_analysis: {
        mean_error: -0.0288,
        std_error: 6.262,
        median_error: 0.1358,
        p95_error_seg: 8.6608,
        skewness: 2.8754,
      },
      selected_for_production: false,
      reason: "Modelo lineal incapaz de capturar la bimodalidad horaria",
    },
    KNeighborsRegressor: {
      mae_seg: 2.4167,
      rmse_seg: 5.7177,
      r2_score: 0.7809,
      inference_time_30k: "~7.9 s",
      residual_analysis: {
        mean_error: 0.1284,
        std_error: 5.7162,
        median_error: -0.144,
        p95_error_seg: 8.5926,
        skewness: 4.3488,
      },
      selected_for_production: false,
      reason: "Inviable en tiempo real por alta latencia O(N)",
    },
    SupportVectorRegressor: {
      mae_seg: 2.15,
      rmse_seg: 6.693,
      r2_score: 0.6997,
      inference_time_30k: "~14.8 s",
      residual_analysis: {
        mean_error: 0.7637,
        std_error: 6.6493,
        median_error: -0.0402,
        p95_error_seg: 7.655,
        skewness: 10.9835,
      },
      selected_for_production: false,
      reason: "Bajo R² y complejidad cuadrática O(N²)",
    },
  },
  feature_importances: [
    { feature: "longitud_m", importance_pct: 76.01 },
    { feature: "clima_tormenta", importance_pct: 5.53 },
    { feature: "hora_dia", importance_pct: 3.95 },
  ],
  decision_tree_hyperparameters: {
    max_depth: 16,
    min_samples_leaf: 10,
    random_state: 42,
  },
};

describe("BenchmarkModal Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not render anything when isOpen is false", () => {
    render(<BenchmarkModal isOpen={false} onClose={vi.fn()} />);
    expect(screen.queryByTestId("benchmark-modal-backdrop")).not.toBeInTheDocument();
  });

  it("renders metrics, summary cards, comparative table and feature importances when opened", async () => {
    vi.spyOn(api, "fetchBenchmarkMetrics").mockResolvedValue(mockMetrics);

    render(<BenchmarkModal isOpen={true} onClose={vi.fn()} />);

    // Initially shows loading or immediately resolves
    await waitFor(() => {
      expect(
        screen.getByText(/Auditoría Científica & Benchmark de Machine Learning/i)
      ).toBeInTheDocument();
    });

    // Highlights winning model
    expect(screen.getByText("Árbol CART")).toBeInTheDocument();
    expect(screen.getByText("20,000")).toBeInTheDocument();

    // Table rows
    expect(screen.getByText("Árbol de Decisión (CART)")).toBeInTheDocument();
    expect(screen.getByText("Regresión Lineal Ridge")).toBeInTheDocument();
    expect(screen.getByText("K-Nearest Neighbors (KNN)")).toBeInTheDocument();
    expect(screen.getByText("Support Vector Regressor (SVR)")).toBeInTheDocument();

    // Feature importance check
    expect(screen.getByText("Longitud del tramo (m)")).toBeInTheDocument();
    expect(screen.getByText("76.01%")).toBeInTheDocument();

    // Residual analysis
    expect(screen.getByText("Diagnóstico de Residuos")).toBeInTheDocument();
    expect(screen.getByText("±4.156 s")).toBeInTheDocument();

    // Hyperparameters
    expect(screen.getByText("max_depth")).toBeInTheDocument();
    expect(screen.getByText("16")).toBeInTheDocument();
  });

  it("triggers onClose when clicking the close button", async () => {
    vi.spyOn(api, "fetchBenchmarkMetrics").mockResolvedValue(mockMetrics);
    const handleClose = vi.fn();

    render(<BenchmarkModal isOpen={true} onClose={handleClose} />);

    await waitFor(() => {
      expect(screen.getByTestId("benchmark-modal-close")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("benchmark-modal-close"));
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("triggers onClose when clicking the modal backdrop", async () => {
    vi.spyOn(api, "fetchBenchmarkMetrics").mockResolvedValue(mockMetrics);
    const handleClose = vi.fn();

    render(<BenchmarkModal isOpen={true} onClose={handleClose} />);

    await waitFor(() => {
      expect(screen.getByTestId("benchmark-modal-backdrop")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("benchmark-modal-backdrop"));
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("triggers onClose when pressing the Escape key", async () => {
    vi.spyOn(api, "fetchBenchmarkMetrics").mockResolvedValue(mockMetrics);
    const handleClose = vi.fn();

    render(<BenchmarkModal isOpen={true} onClose={handleClose} />);

    await waitFor(() => {
      expect(screen.getByTestId("benchmark-modal-content")).toBeInTheDocument();
    });

    fireEvent.keyDown(window, { key: "Escape" });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("renders error view with retry button on API failure", async () => {
    vi.spyOn(api, "fetchBenchmarkMetrics").mockRejectedValue(
      new Error("Fallo de conexión con el backend")
    );

    render(<BenchmarkModal isOpen={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(
        screen.getByText("Fallo de conexión con el backend")
      ).toBeInTheDocument();
      expect(screen.getByText("Reintentar")).toBeInTheDocument();
    });
  });
});
