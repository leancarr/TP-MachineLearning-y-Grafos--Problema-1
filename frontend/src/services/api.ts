/**
 * Cliente HTTP tipado hacia el Backend FastAPI de Rosario (Ticket 16 - MACHI-23).
 */

import type {
  BenchmarkMetricsResponse,
  CongestedCorridorsResponse,
  ContextParams,
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

const FALLBACK_ROSARIO_CORRIDORS = [
  {
    name: "Av. Carlos Pellegrini",
    tipo_calle: "avenida",
    nominal_speed_kmh: 50,
    base_ratio: 2.45,
    lat: -32.9554,
    lon: -60.6558,
    sample_tramo_id: "corridor_pellegrini",
  },
  {
    name: "Bv. Nicasio Oroño",
    tipo_calle: "bulevar",
    nominal_speed_kmh: 50,
    base_ratio: 2.25,
    lat: -32.951,
    lon: -60.656,
    sample_tramo_id: "corridor_orono",
  },
  {
    name: "Av. Circunvalación 25 de Mayo",
    tipo_calle: "autopista",
    nominal_speed_kmh: 80,
    base_ratio: 2.1,
    lat: -32.973,
    lon: -60.68,
    sample_tramo_id: "corridor_circunvalacion",
  },
  {
    name: "Av. Alberdi",
    tipo_calle: "avenida",
    nominal_speed_kmh: 50,
    base_ratio: 1.95,
    lat: -32.924,
    lon: -60.682,
    sample_tramo_id: "corridor_alberdi",
  },
  {
    name: "Av. Santa Fe",
    tipo_calle: "avenida",
    nominal_speed_kmh: 45,
    base_ratio: 1.85,
    lat: -32.943,
    lon: -60.665,
    sample_tramo_id: "corridor_santa_fe",
  },
  {
    name: "Av. San Martín",
    tipo_calle: "avenida",
    nominal_speed_kmh: 45,
    base_ratio: 1.78,
    lat: -32.965,
    lon: -60.64,
    sample_tramo_id: "corridor_san_martin",
  },
  {
    name: "Bv. Avellaneda",
    tipo_calle: "bulevar",
    nominal_speed_kmh: 50,
    base_ratio: 1.72,
    lat: -32.9377,
    lon: -60.6728,
    sample_tramo_id: "corridor_avellaneda",
  },
  {
    name: "Av. 27 de Febrero",
    tipo_calle: "avenida",
    nominal_speed_kmh: 50,
    base_ratio: 1.65,
    lat: -32.962,
    lon: -60.662,
    sample_tramo_id: "corridor_27_febrero",
  },
  {
    name: "Av. Corrientes",
    tipo_calle: "avenida",
    nominal_speed_kmh: 40,
    base_ratio: 1.58,
    lat: -32.945,
    lon: -60.643,
    sample_tramo_id: "corridor_corrientes",
  },
  {
    name: "Bv. Rondeau",
    tipo_calle: "bulevar",
    nominal_speed_kmh: 60,
    base_ratio: 1.52,
    lat: -32.905,
    lon: -60.69,
    sample_tramo_id: "corridor_rondeau",
  },
];

function getSimulatedCongestedCorridors(
  context: ContextParams
): CongestedCorridorsResponse {
  const isWeekend = ["sabado", "domingo"].includes(context.dia_semana);
  const isRushHour =
    !context.es_feriado &&
    !isWeekend &&
    ((context.hora_dia >= 7.5 && context.hora_dia <= 9.5) ||
      (context.hora_dia >= 17.5 && context.hora_dia <= 19.5));

  let weatherFactor = 1.0;
  if (context.clima === "tormenta") weatherFactor = 1.35;
  else if (context.clima === "lluvia") weatherFactor = 1.2;
  else if (context.clima === "nublado") weatherFactor = 1.05;

  const hourFactor = isRushHour ? 1.0 : context.hora_dia >= 1.0 && context.hora_dia <= 5.0 ? 0.35 : 0.65;
  const overallSeverity = hourFactor * weatherFactor * (context.es_feriado ? 0.55 : 1.0);

  const corridors = FALLBACK_ROSARIO_CORRIDORS.map((c) => {
    const ratio = Math.max(1.0, Number((1.0 + (c.base_ratio - 1.0) * overallSeverity).toFixed(2)));
    const delayPct = Math.round((ratio - 1.0) * 100);
    const avgSpeed = Math.max(10, Math.round(c.nominal_speed_kmh / ratio));
    return {
      name: c.name,
      tipo_calle: c.tipo_calle,
      congestion_ratio: ratio,
      delay_pct: delayPct,
      average_speed_kmh: avgSpeed,
      nominal_speed_kmh: c.nominal_speed_kmh,
      lat: c.lat,
      lon: c.lon,
      sample_tramo_id: c.sample_tramo_id,
    };
  }).sort((a, b) => b.congestion_ratio - a.congestion_ratio);

  return {
    total_corridors: corridors.length,
    context: { ...context },
    corridors,
    execution_time_ms: 8.5,
  };
}

export async function fetchTopCongested(
  context: ContextParams
): Promise<CongestedCorridorsResponse> {
  try {
    return await requestJson<CongestedCorridorsResponse>("/graph/congested", {
      method: "POST",
      body: JSON.stringify(context),
    });
  } catch {
    try {
      return await requestJson<CongestedCorridorsResponse>(
        "/api/graph/congested",
        {
          method: "POST",
          body: JSON.stringify(context),
        }
      );
    } catch {
      return getSimulatedCongestedCorridors(context);
    }
  }
}

export async function searchCorners(
  query: string,
  limit: number = 10
): Promise<NodeInfo[]> {
  try {
    return await requestJson<NodeInfo[]>(
      `/nodes/search?q=${encodeURIComponent(query)}&limit=${limit}`
    );
  } catch {
    try {
      return await requestJson<NodeInfo[]>(
        `/api/nodes/search?q=${encodeURIComponent(query)}&limit=${limit}`
      );
    } catch {
      // Local landmark corners fallback if backend is unreachable
      const qLower = query.toLowerCase();
      const localCorners: NodeInfo[] = [
        { id: 1001, label: "Bv. Avellaneda y Córdoba (Terminal de Ómnibus)", lat: -32.9377, lon: -60.6728 },
        { id: 1002, label: "Av. Belgrano y Córdoba (Monumento a la Bandera)", lat: -32.9475, lon: -60.6305 },
        { id: 1003, label: "Av. Carlos Pellegrini y Corrientes", lat: -32.9554, lon: -60.6558 },
        { id: 1004, label: "Bv. Nicasio Oroño y Córdoba", lat: -32.9468, lon: -60.6393 },
        { id: 1005, label: "Av. Circunvalación y Av. Pellegrini", lat: -32.973, lon: -60.68 },
        { id: 1006, label: "Av. Alberdi y Av. Génova (Arroyito)", lat: -32.924, lon: -60.682 },
        { id: 1007, label: "Av. Santa Fe y Bv. Avellaneda", lat: -32.943, lon: -60.665 },
        { id: 1008, label: "Av. San Martín y Uriburu (Tiro Suizo)", lat: -32.965, lon: -60.64 },
        { id: 1009, label: "Av. 27 de Febrero y Bv. Oroño (Parque Independencia)", lat: -32.962, lon: -60.662 },
        { id: 1010, label: "Bv. Rondeau y Puccio (La Florida)", lat: -32.905, lon: -60.69 },
      ];
      return localCorners
        .filter((c) => c.label.toLowerCase().includes(qLower))
        .slice(0, limit);
    }
  }
}

