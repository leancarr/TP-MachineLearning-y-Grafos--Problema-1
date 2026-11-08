import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import {
  getEdgeWeightByHierarchy,
  getLodBadgeLabel,
} from "../MapViewer";
import { DEFAULT_NORMAL_DAY_CONTEXT } from "../../App";

vi.mock("leaflet", () => ({
  default: {
    canvas: vi.fn(() => ({})),
  },
  canvas: vi.fn(() => ({})),
}));

const mockMapInstance = {
  getZoom: () => 13,
  getBounds: () => ({
    getSouth: () => -32.97,
    getWest: () => -60.68,
    getNorth: () => -32.92,
    getEast: () => -60.62,
  }),
};

// Mock react-leaflet to avoid full DOM Canvas issues in jsdom unit tests while testing MapViewer HUD & props
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="leaflet-map-container">{children}</div>
  ),
  TileLayer: () => <div data-testid="leaflet-tile-layer" />,
  Polyline: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="leaflet-polyline">{children}</div>
  ),
  CircleMarker: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="leaflet-circle-marker">{children}</div>
  ),
  Tooltip: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  useMap: () => mockMapInstance,
  useMapEvents: () => null,
}));

vi.mock("../../services/api", () => ({
  fetchViewportEdges: vi.fn().mockResolvedValue({
    total_edges: 1850,
    max_hierarchy_visible: 2,
    context: {},
    execution_time_ms: 14.2,
    edges: [
      {
        tramo_id: "101",
        u: 1,
        v: 2,
        u_lat: -32.9468,
        u_lon: -60.6393,
        v_lat: -32.9475,
        v_lon: -60.6401,
        tipo_calle: "avenida",
        jerarquia: 1,
        longitud_m: 120,
        tiempo_seg: 11.4,
        congestion_ratio: 1.12,
        level: "fluido",
        color: "#10B981",
      },
    ],
  }),
  fetchNearestNode: vi.fn().mockResolvedValue({
    id: 1,
    lat: -32.9468,
    lon: -60.6393,
    label: "Bv. Oroño y Córdoba",
    distance_m: 4.5,
  }),
  calculateRouteComparison: vi.fn(),
}));

import MapViewer from "../MapViewer";

describe("MapViewer & Progressive LOD Utilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calculates edge stroke weights appropriately by hierarchy and zoom level", () => {
    expect(getEdgeWeightByHierarchy(1, 12)).toBeCloseTo(3.2);
    expect(getEdgeWeightByHierarchy(2, 12)).toBeCloseTo(2.2);
    expect(getEdgeWeightByHierarchy(3, 12)).toBeCloseTo(1.4);

    // Higher zoom scales up stroke width
    expect(getEdgeWeightByHierarchy(1, 15)).toBeGreaterThan(
      getEdgeWeightByHierarchy(1, 13)
    );
  });

  it("returns descriptive LOD badge labels for macro, medium and detailed zooms", () => {
    expect(getLodBadgeLabel(11)).toContain("LOD Macro");
    expect(getLodBadgeLabel(13)).toContain("LOD Medio");
    expect(getLodBadgeLabel(16)).toContain("LOD Detallado");
  });

  it("renders MapViewer HUD and pre-loads normal day traffic context", async () => {
    render(<MapViewer context={DEFAULT_NORMAL_DAY_CONTEXT} />);

    expect(screen.getByTestId("map-viewer-container")).toBeInTheDocument();
    expect(screen.getByText(/Rosario Graph LOD/i)).toBeInTheDocument();
    expect(screen.getByText(/Fluido/i)).toBeInTheDocument();
    expect(screen.getByText(/Moderado/i)).toBeInTheDocument();
    expect(screen.getByText(/Congestionado/i)).toBeInTheDocument();
  });
});
