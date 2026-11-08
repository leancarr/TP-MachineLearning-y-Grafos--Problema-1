/**
 * Contratos TypeScript sincronizados con `backend/app/schemas.py` (Ticket 16 - MACHI-23).
 */

export type ClimaType = "despejado" | "nublado" | "lluvia" | "tormenta";

export type DiaSemanaType =
  | "lunes"
  | "martes"
  | "miercoles"
  | "jueves"
  | "viernes"
  | "sabado"
  | "domingo";

export interface ContextParams {
  hora_dia: number;
  dia_semana: DiaSemanaType;
  clima: ClimaType;
  es_feriado: boolean;
}

export interface ViewportRequest extends ContextParams {
  min_lat: number;
  min_lon: number;
  max_lat: number;
  max_lon: number;
  zoom: number;
  max_edges?: number;
}

export interface ViewportEdge {
  tramo_id: string;
  u: number;
  v: number;
  u_lat: number;
  u_lon: number;
  v_lat: number;
  v_lon: number;
  tipo_calle: string;
  jerarquia: number;
  longitud_m: number;
  tiempo_seg: number;
  congestion_ratio: number;
  level: "fluido" | "moderado" | "congestionado";
  color: string;
}

export interface ViewportResponse {
  total_edges: number;
  max_hierarchy_visible: number;
  context: Record<string, unknown>;
  edges: ViewportEdge[];
  execution_time_ms: number;
}

export interface NodeInfo {
  id: number;
  lat: number;
  lon: number;
  label: string;
  distance_m?: number | null;
}

export interface RouteRequest extends ContextParams {
  origin_lat?: number;
  origin_lon?: number;
  origin_id?: number;
  destination_lat?: number;
  destination_lon?: number;
  destination_id?: number;
}

export interface RouteDetail {
  found: boolean;
  mode: string;
  distance_m: number;
  distance_km: number;
  time_sec: number;
  time_min: number;
  nodes: number[];
  coordinates: [number, number][];
  tramos: string[];
  execution_time_ms: number;
}

export interface RouteComparison {
  time_saved_sec: number;
  time_saved_min: number;
  time_saved_pct: number;
  distance_diff_m: number;
  is_dynamic_faster: boolean;
}

export interface RouteResponse {
  origin: NodeInfo;
  destination: NodeInfo;
  static_route: RouteDetail;
  dynamic_route: RouteDetail;
  comparison: RouteComparison;
  context: Record<string, unknown>;
  total_execution_time_ms: number;
}

export interface TourStopInput {
  lat?: number;
  lon?: number;
  node_id?: number;
  label?: string;
}

export interface TourRequest extends ContextParams {
  depot: TourStopInput;
  stops: TourStopInput[];
  return_to_depot?: boolean;
}

export interface TourStopResponse {
  visit_order: number;
  node_id: number;
  label: string;
  lat: number;
  lon: number;
}

export interface TourLeg {
  leg_order: number;
  from_node: number;
  to_node: number;
  distance_m: number;
  time_sec: number;
  nodes: number[];
  coordinates: [number, number][];
}

export interface TourDetail {
  mode: string;
  ordered_sequence: number[];
  numbered_stops: TourStopResponse[];
  legs: TourLeg[];
  coordinates: [number, number][];
  total_distance_km: number;
  total_time_min: number;
  execution_time_ms: number;
}

export interface TourResponse {
  dynamic_tour: TourDetail;
  static_tour: TourDetail;
  time_saved_sec: number;
  time_saved_min: number;
  time_saved_pct: number;
  context: Record<string, unknown>;
  total_execution_time_ms: number;
}

export interface ScenarioPreset {
  id: string;
  name: string;
  time_label: string;
  hora_dia: number;
  dia_semana: DiaSemanaType;
  clima: ClimaType;
  es_feriado: boolean;
  icon: string;
  badge: string;
  badge_color: string;
  description: string;
}

export interface ModelBenchmarkItem {
  mae_seg: number;
  rmse_seg: number;
  r2_score: number;
  inference_time_30k: string;
  residual_analysis: {
    mean_error: number;
    std_error: number;
    median_error: number;
    p95_error_seg: number;
    skewness: number;
  };
  selected_for_production: boolean;
  reason: string;
}

export interface FeatureImportanceItem {
  feature: string;
  importance_pct: number;
}

export interface BenchmarkMetricsResponse {
  benchmark_date: string;
  test_set_size: number;
  models: Record<string, ModelBenchmarkItem>;
  feature_importances?: FeatureImportanceItem[];
  decision_tree_hyperparameters?: Record<string, unknown>;
}

export type str = string;

export interface CongestedCorridor {
  name: string;
  tipo_calle: string;
  congestion_ratio: number;
  delay_pct: number;
  average_speed_kmh: number;
  nominal_speed_kmh: number;
  lat: number;
  lon: number;
  sample_tramo_id: string;
}

export interface CongestedCorridorsResponse {
  total_corridors: number;
  context: Record<string, unknown>;
  corridors: CongestedCorridor[];
  execution_time_ms: number;
}

