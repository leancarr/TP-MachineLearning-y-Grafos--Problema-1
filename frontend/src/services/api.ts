/**
 * Cliente HTTP tipado hacia el Backend FastAPI de Rosario (Ticket 16 - MACHI-23).
 */

import type {
  BenchmarkMetricsResponse,
  NodeInfo,
  RouteRequest,
  RouteResponse,
  ScenarioPreset,
  TourRequest,
  TourResponse,
  ViewportRequest,
  ViewportResponse,
} from "../types";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    let errMsg = `HTTP ${response.status}`;
    try {
      const errBody = await response.json();
      if (errBody?.detail) {
        errMsg = String(errBody.detail);
      }
    } catch {
      // ignore json parse error
    }
    throw new Error(errMsg);
  }

  return (await response.json()) as T;
}

export async function fetchViewportEdges(
  payload: ViewportRequest
): Promise<ViewportResponse> {
  return requestJson<ViewportResponse>("/api/graph/viewport", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchNearestNode(
  lat: number,
  lon: number
): Promise<NodeInfo> {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
  });
  return requestJson<NodeInfo>(`/api/nodes/nearest?${params.toString()}`);
}

export async function searchNodesByName(
  query: string,
  limit = 15
): Promise<NodeInfo[]> {
  const params = new URLSearchParams({
    q: query,
    limit: String(limit),
  });
  return requestJson<NodeInfo[]>(`/api/nodes/search?${params.toString()}`);
}

export async function calculateRouteComparison(
  payload: RouteRequest
): Promise<RouteResponse> {
  return requestJson<RouteResponse>("/api/route", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function calculateDeliveryTour(
  payload: TourRequest
): Promise<TourResponse> {
  return requestJson<TourResponse>("/api/tour", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchBenchmarkMetrics(): Promise<BenchmarkMetricsResponse> {
  return requestJson<BenchmarkMetricsResponse>("/api/metrics");
}

export async function fetchScenarioPresets(): Promise<ScenarioPreset[]> {
  return requestJson<ScenarioPreset[]>("/api/presets");
}
