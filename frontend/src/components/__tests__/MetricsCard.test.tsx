import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import MetricsCard from "../MetricsCard";
import { RouteResponse, TourResponse } from "../../types";

const mockRouteFaster: RouteResponse = {
  origin: { id: 1, lat: -32.94, lon: -60.65, label: "Av Pellegrini y Corrientes" },
  destination: { id: 2, lat: -32.96, lon: -60.63, label: "Monumento a la Bandera" },
  static_route: {
    found: true,
    mode: "static_distance",
    distance_m: 4000,
    distance_km: 4.0,
    time_sec: 720,
    time_min: 12.0,
    nodes: [1, 5, 2],
    coordinates: [[-32.94, -60.65], [-32.96, -60.63]],
    tramos: ["t1", "t2"],
    execution_time_ms: 3.2,
  },
  dynamic_route: {
    found: true,
    mode: "dynamic_time",
    distance_m: 4300,
    distance_km: 4.3,
    time_sec: 540,
    time_min: 9.0,
    nodes: [1, 9, 2],
    coordinates: [[-32.94, -60.65], [-32.95, -60.64], [-32.96, -60.63]],
    tramos: ["t3", "t4"],
    execution_time_ms: 4.1,
  },
  comparison: {
    time_saved_sec: 180,
    time_saved_min: 3.0,
    time_saved_pct: 25.0,
    distance_diff_m: 300,
    is_dynamic_faster: true,
  },
  context: {},
  total_execution_time_ms: 7.3,
};

const mockRouteIdentical: RouteResponse = {
  ...mockRouteFaster,
  dynamic_route: { ...mockRouteFaster.static_route },
  comparison: {
    time_saved_sec: 0,
    time_saved_min: 0,
    time_saved_pct: 0,
    distance_diff_m: 0,
    is_dynamic_faster: false,
  },
};

const mockTour: TourResponse = {
  dynamic_tour: {
    mode: "dynamic_tsp",
    ordered_sequence: [1, 2, 3, 1],
    numbered_stops: [
      { visit_order: 1, node_id: 1, label: "Depósito Pellegrini", lat: -32.94, lon: -60.65 },
      { visit_order: 2, node_id: 2, label: "Parada Oroño", lat: -32.95, lon: -60.66 },
      { visit_order: 3, node_id: 3, label: "Parada Puerto", lat: -32.96, lon: -60.64 },
    ],
    legs: [],
    coordinates: [[-32.94, -60.65], [-32.95, -60.66]],
    total_distance_km: 12.5,
    total_time_min: 24.2,
    execution_time_ms: 15.2,
  },
  static_tour: {
    mode: "static_tsp",
    ordered_sequence: [1, 3, 2, 1],
    numbered_stops: [
      { visit_order: 1, node_id: 1, label: "Depósito Pellegrini", lat: -32.94, lon: -60.65 },
      { visit_order: 2, node_id: 3, label: "Parada Puerto", lat: -32.96, lon: -60.64 },
      { visit_order: 3, node_id: 2, label: "Parada Oroño", lat: -32.95, lon: -60.66 },
    ],
    legs: [],
    coordinates: [[-32.94, -60.65], [-32.96, -60.64]],
    total_distance_km: 14.1,
    total_time_min: 32.5,
    execution_time_ms: 14.0,
  },
  time_saved_sec: 498,
  time_saved_min: 8.3,
  time_saved_pct: 25.5,
  context: {},
  total_execution_time_ms: 29.2,
};

describe("MetricsCard Component", () => {
  it("renders loading state when isCalculating is true", () => {
    render(
      <MetricsCard
        routeResult={null}
        tourResult={null}
        appMode="route"
        isCalculating={true}
      />
    );
    expect(screen.getByTestId("metrics-card-loading")).toBeInTheDocument();
    expect(
      screen.getByText(/Dijkstra artesanal evaluando pesos dinámicos/i)
    ).toBeInTheDocument();
  });

  it("renders route comparison metrics with time savings badge and causal explanation", () => {
    render(
      <MetricsCard
        routeResult={mockRouteFaster}
        tourResult={null}
        appMode="route"
        isCalculating={false}
      />
    );

    expect(screen.getByTestId("metrics-card")).toBeInTheDocument();
    expect(screen.getByTestId("time-saved-badge")).toBeInTheDocument();
    expect(screen.getByText("-3.0 min")).toBeInTheDocument();
    expect(screen.getByText("25.0% más rápida")).toBeInTheDocument();
    expect(screen.getByText("Desvío inteligente:")).toBeInTheDocument();
    expect(screen.getByText(/300 m más en distancia física/i)).toBeInTheDocument();
    expect(screen.getByText("9.0")).toBeInTheDocument(); // Dynamic time
    expect(screen.getByText("12.0")).toBeInTheDocument(); // Static time
  });

  it("renders identical routes badge when time savings is negligible", () => {
    render(
      <MetricsCard
        routeResult={mockRouteIdentical}
        tourResult={null}
        appMode="route"
        isCalculating={false}
      />
    );

    expect(screen.getByText("Rutas coincidentes")).toBeInTheDocument();
    expect(screen.getByText(/En condiciones de baja congestión/i)).toBeInTheDocument();
  });

  it("renders tour TSP metrics in tour mode", () => {
    render(
      <MetricsCard
        routeResult={null}
        tourResult={mockTour}
        appMode="tour"
        isCalculating={false}
      />
    );

    expect(screen.getByTestId("metrics-card-tour")).toBeInTheDocument();
    expect(screen.getByText("Ronda TSP Optimizada (2-opt)")).toBeInTheDocument();
    expect(screen.getByText("3 paradas encadenadas")).toBeInTheDocument();
    expect(screen.getByText("-8.3 min")).toBeInTheDocument();
    expect(screen.getByText("25.5% ahorro")).toBeInTheDocument();
    expect(screen.getByText("24.2 min")).toBeInTheDocument();
    expect(screen.getByText("32.5 min")).toBeInTheDocument();
  });

  it("renders null when no result is available", () => {
    const { container } = render(
      <MetricsCard
        routeResult={null}
        tourResult={null}
        appMode="route"
        isCalculating={false}
      />
    );
    expect(container.firstChild).toBeNull();
  });
});
