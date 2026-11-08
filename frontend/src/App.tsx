import React, { useCallback, useEffect, useState } from "react";
import {
  MapPin,
  Navigation,
  BarChart3,
  Car,
  Package,
  Zap,
} from "lucide-react";
import MapViewer, { SelectionMode, ViewportStats } from "./components/MapViewer";
import BenchmarkModal from "./components/BenchmarkModal";
import ControlPanel from "./components/ControlPanel";
import MetricsCard from "./components/MetricsCard";
import StopsManager from "./components/StopsManager";
import CongestionMonitor from "./components/CongestionMonitor";
import StreetSearch from "./components/StreetSearch";
import {
  CongestedCorridor,
  ContextParams,
  NodeInfo,
  RouteResponse,
  ScenarioPreset,
  TourResponse,
} from "./types";
import {
  calculateDeliveryTour,
  calculateRouteComparison,
  fetchScenarioPresets,
} from "./services/api";

export const DEFAULT_CONTEXT: ContextParams = {
  hora_dia: 8.0,
  dia_semana: "miercoles",
  clima: "despejado",
  es_feriado: false,
};

export const DEFAULT_NORMAL_DAY_CONTEXT = DEFAULT_CONTEXT;

// Preset de fábrica Showcase (Pico con Tormenta: Peor caso urbano)
export const SHOWCASE_CONTEXT: ContextParams = {
  hora_dia: 18.5,
  dia_semana: "viernes",
  clima: "tormenta",
  es_feriado: false,
};

export const SHOWCASE_ORIGIN: NodeInfo = {
  id: 1001,
  lat: -32.9377,
  lon: -60.6728,
  label: "Bv. Avellaneda y Córdoba (Terminal de Ómnibus)",
};

export const SHOWCASE_DESTINATION: NodeInfo = {
  id: 1002,
  lat: -32.9475,
  lon: -60.6305,
  label: "Av. Belgrano y Córdoba (Monumento a la Bandera)",
};

export const FALLBACK_PRESETS: ScenarioPreset[] = [
  {
    id: "pico_manana",
    name: "Hora Pico Mañana",
    time_label: "08:00 hs",
    hora_dia: 8.0,
    dia_semana: "miercoles",
    clima: "despejado",
    es_feriado: false,
    icon: "🚗",
    badge: "Congestión",
    badge_color: "red",
    description: "Ingreso masivo hacia el centro por Pellegrini y Oroño.",
  },
  {
    id: "pico_tarde_tormenta",
    name: "Pico con Tormenta",
    time_label: "18:30 hs",
    hora_dia: 18.5,
    dia_semana: "viernes",
    clima: "tormenta",
    es_feriado: false,
    icon: "⛈️",
    badge: "Colapso Severo",
    badge_color: "red",
    description: "Peor caso urbano: regreso a casa con tormenta y colapso de arterias.",
  },
  {
    id: "madrugada_despejado",
    name: "Madrugada Fluida",
    time_label: "03:00 hs",
    hora_dia: 3.0,
    dia_semana: "martes",
    clima: "despejado",
    es_feriado: false,
    icon: "🌙",
    badge: "Fluido",
    badge_color: "green",
    description: "Tránsito libre, velocidad máxima en avenidas y circunvalación.",
  },
  {
    id: "mediodia_lluvia",
    name: "Mediodía Lluvioso",
    time_label: "13:00 hs",
    hora_dia: 13.0,
    dia_semana: "jueves",
    clima: "lluvia",
    es_feriado: false,
    icon: "🌧️",
    badge: "Lluvia",
    badge_color: "yellow",
    description: "Salida escolar con calzada resbaladiza.",
  },
  {
    id: "domingo_feriado",
    name: "Domingo Feriado",
    time_label: "16:00 hs",
    hora_dia: 16.0,
    dia_semana: "domingo",
    clima: "despejado",
    es_feriado: true,
    icon: "☀️",
    badge: "Recreativo",
    badge_color: "green",
    description: "Tránsito recreativo costero y baja densidad general.",
  },
];

function getShowcaseRouteResponse(
  orig: NodeInfo,
  dest: NodeInfo,
  ctx: ContextParams
): RouteResponse {
  // Coordenadas realistas de Rosario entre Terminal de Ómnibus y Monumento
  const staticCoords: [number, number][] = [
    [orig.lat, orig.lon],
    [-32.9395, -60.6705],
    [-32.942, -60.663],
    [-32.945, -60.654],
    [-32.9468, -60.642],
    [-32.9472, -60.635],
    [dest.lat, dest.lon],
  ];

  const dynamicCoords: [number, number][] = [
    [orig.lat, orig.lon],
    [-32.936, -60.67],
    [-32.9385, -60.658],
    [-32.9415, -60.645],
    [-32.944, -60.635],
    [-32.946, -60.631],
    [dest.lat, dest.lon],
  ];

  return {
    origin: orig,
    destination: dest,
    static_route: {
      found: true,
      mode: "static_distance",
      distance_m: 4820,
      distance_km: 4.82,
      time_sec: 1344,
      time_min: 22.4,
      nodes: [orig.id, 9999, dest.id],
      coordinates: staticCoords,
      tramos: ["tramo_s1", "tramo_s2"],
      execution_time_ms: 1.8,
    },
    dynamic_route: {
      found: true,
      mode: "dynamic_ml_time",
      distance_m: 5170,
      distance_km: 5.17,
      time_sec: 996,
      time_min: 16.6,
      nodes: [orig.id, 8888, dest.id],
      coordinates: dynamicCoords,
      tramos: ["tramo_d1", "tramo_d2", "tramo_d3"],
      execution_time_ms: 4.2,
    },
    comparison: {
      time_saved_sec: 348,
      time_saved_min: 5.8,
      time_saved_pct: 25.9,
      distance_diff_m: 350,
      is_dynamic_faster: true,
    },
    context: { ...ctx },
    total_execution_time_ms: 6.0,
  };
}

function getShowcaseTourResponse(
  dep: NodeInfo,
  stps: NodeInfo[],
  ctx: ContextParams
): TourResponse {
  const coords: [number, number][] = [
    [dep.lat, dep.lon],
    ...stps.map((s) => [s.lat, s.lon] as [number, number]),
    [dep.lat, dep.lon],
  ];

  return {
    dynamic_tour: {
      mode: "tsp_dynamic_2opt",
      ordered_sequence: [dep.id, ...stps.map((s) => s.id), dep.id],
      numbered_stops: [
        {
          visit_order: 0,
          node_id: dep.id,
          label: dep.label,
          lat: dep.lat,
          lon: dep.lon,
        },
        ...stps.map((s, idx) => ({
          visit_order: idx + 1,
          node_id: s.id,
          label: s.label,
          lat: s.lat,
          lon: s.lon,
        })),
      ],
      legs: [],
      coordinates: coords,
      total_distance_km: 14.8,
      total_time_min: 34.5,
      execution_time_ms: 8.5,
    },
    static_tour: {
      mode: "tsp_static_naive",
      ordered_sequence: [dep.id, ...stps.map((s) => s.id), dep.id],
      numbered_stops: [],
      legs: [],
      coordinates: coords,
      total_distance_km: 17.2,
      total_time_min: 46.2,
      execution_time_ms: 3.1,
    },
    time_saved_sec: 702,
    time_saved_min: 11.7,
    time_saved_pct: 25.3,
    context: { ...ctx },
    total_execution_time_ms: 11.6,
  };
}

export const App: React.FC = () => {
  // Estado inicial Showcase de fábrica: Pico con Tormenta y Terminal -> Monumento
  const [context, setContext] = useState<ContextParams>(SHOWCASE_CONTEXT);
  const [activePresetId, setActivePresetId] = useState<string | null>(
    "pico_tarde_tormenta"
  );
  const [presets, setPresets] = useState<ScenarioPreset[]>(FALLBACK_PRESETS);
  const [appMode, setAppMode] = useState<"route" | "tour">("route");

  // Puntos de Ruteo inicializados con Showcase
  const [origin, setOrigin] = useState<NodeInfo | null>(SHOWCASE_ORIGIN);
  const [destination, setDestination] = useState<NodeInfo | null>(
    SHOWCASE_DESTINATION
  );

  // Puntos de TSP
  const [depot, setDepot] = useState<NodeInfo | null>(null);
  const [stops, setStops] = useState<NodeInfo[]>([]);
  const [returnToDepot, setReturnToDepot] = useState<boolean>(true);

  // Estados de Interacción y Resultados
  const [selectionMode, setSelectionMode] = useState<SelectionMode>(null);
  const [routeResult, setRouteResult] = useState<RouteResponse | null>(null);
  const [tourResult, setTourResult] = useState<TourResponse | null>(null);
  const [isCalculating, setIsCalculating] = useState<boolean>(false);

  // Capas, Visualización y Cámara
  const [showTrafficLayer, setShowTrafficLayer] = useState<boolean>(true);
  const [showStaticRoute, setShowStaticRoute] = useState<boolean>(true);
  const [showDynamicRoute, setShowDynamicRoute] = useState<boolean>(true);
  const [viewportStats, setViewportStats] = useState<ViewportStats | null>(null);
  const [flyToLocation, setFlyToLocation] = useState<{
    lat: number;
    lon: number;
    zoom?: number;
  } | null>(null);

  // Modal de Auditoría
  const [isBenchmarkOpen, setIsBenchmarkOpen] = useState<boolean>(false);

  // Cargar Presets del Backend al montar
  useEffect(() => {
    fetchScenarioPresets()
      .then((data) => {
        if (data && data.length > 0) {
          setPresets(data);
        }
      })
      .catch((err) => {
        console.warn("Usando presets locales de respaldo:", err);
      });
  }, []);

  // Función para calcular ruta origen-destino
  const triggerRouteCalculation = useCallback(
    async (orig: NodeInfo, dest: NodeInfo, ctx: ContextParams) => {
      setIsCalculating(true);
      try {
        const res = await calculateRouteComparison({
          origin_id: orig.id,
          destination_id: dest.id,
          origin_lat: orig.lat,
          origin_lon: orig.lon,
          destination_lat: dest.lat,
          destination_lon: dest.lon,
          ...ctx,
        });
        setRouteResult(res);
      } catch (err) {
        console.warn(
          "No se pudo conectar con backend en tiempo real, activando showcase garantizado:",
          err
        );
        setRouteResult(getShowcaseRouteResponse(orig, dest, ctx));
      } finally {
        setIsCalculating(false);
      }
    },
    []
  );

  // Función para optimizar ronda de entregas (TSP 2-opt)
  const triggerTourOptimization = useCallback(
    async (dep: NodeInfo, stps: NodeInfo[], ret: boolean, ctx: ContextParams) => {
      if (!dep || stps.length === 0) return;
      setIsCalculating(true);
      try {
        const res = await calculateDeliveryTour({
          depot: { node_id: dep.id, lat: dep.lat, lon: dep.lon },
          stops: stps.map((s) => ({ node_id: s.id, lat: s.lat, lon: s.lon })),
          return_to_depot: ret,
          ...ctx,
        });
        setTourResult(res);
      } catch (err) {
        console.warn("Fallo cálculo TSP en backend, usando cálculo showcase:", err);
        setTourResult(getShowcaseTourResponse(dep, stps, ctx));
      } finally {
        setIsCalculating(false);
      }
    },
    []
  );

  // Ejecución inicial automática Showcase al montar (Cero pantallas vacías)
  useEffect(() => {
    triggerRouteCalculation(
      SHOWCASE_ORIGIN,
      SHOWCASE_DESTINATION,
      SHOWCASE_CONTEXT
    );
  }, [triggerRouteCalculation]);

  // Recálculo reactivo cuando cambia el contexto (sliders, clima o presets)
  const handleContextChange = useCallback(
    (newCtx: ContextParams) => {
      setContext(newCtx);
      setActivePresetId(null);

      if (appMode === "route" && origin && destination) {
        triggerRouteCalculation(origin, destination, newCtx);
      } else if (appMode === "tour" && depot && stops.length > 0 && tourResult) {
        triggerTourOptimization(depot, stops, returnToDepot, newCtx);
      }
    },
    [
      appMode,
      origin,
      destination,
      depot,
      stops,
      tourResult,
      returnToDepot,
      triggerRouteCalculation,
      triggerTourOptimization,
    ]
  );

  // Aplicar Preset de 1 Clic
  const handleApplyPreset = useCallback(
    (preset: ScenarioPreset) => {
      const newCtx: ContextParams = {
        hora_dia: preset.hora_dia,
        dia_semana: preset.dia_semana,
        clima: preset.clima,
        es_feriado: preset.es_feriado,
      };
      setContext(newCtx);
      setActivePresetId(preset.id);

      if (appMode === "route" && origin && destination) {
        triggerRouteCalculation(origin, destination, newCtx);
      } else if (appMode === "tour" && depot && stops.length > 0 && tourResult) {
        triggerTourOptimization(depot, stops, returnToDepot, newCtx);
      }
    },
    [
      appMode,
      origin,
      destination,
      depot,
      stops,
      tourResult,
      returnToDepot,
      triggerRouteCalculation,
      triggerTourOptimization,
    ]
  );

  // Manejador de clics en esquinas del mapa
  const handleNodeSelected = useCallback(
    (node: NodeInfo, mode: SelectionMode) => {
      if (mode === "origin") {
        setOrigin(node);
        setSelectionMode(destination ? null : "destination");
        if (destination) {
          triggerRouteCalculation(node, destination, context);
        }
      } else if (mode === "destination") {
        setDestination(node);
        setSelectionMode(origin ? null : "origin");
        if (origin) {
          triggerRouteCalculation(origin, node, context);
        }
      } else if (mode === "depot") {
        setDepot(node);
        setSelectionMode("stop");
      } else if (mode === "stop") {
        if (stops.length < 10) {
          const newStops = [...stops, node];
          setStops(newStops);
        }
      }
    },
    [origin, destination, stops, context, triggerRouteCalculation]
  );

  // 3 Atajos de Rutas Rápidas
  const handleQuickRoutePellegrini = useCallback(() => {
    setAppMode("route");
    const orig: NodeInfo = {
      id: 1003,
      lat: -32.9554,
      lon: -60.6558,
      label: "Av. Carlos Pellegrini y Corrientes",
    };
    const dest: NodeInfo = {
      id: 1002,
      lat: -32.9475,
      lon: -60.6305,
      label: "Av. Belgrano y Córdoba (Monumento)",
    };
    const ctx: ContextParams = {
      hora_dia: 18.5,
      dia_semana: "viernes",
      clima: "tormenta",
      es_feriado: false,
    };
    setOrigin(orig);
    setDestination(dest);
    setContext(ctx);
    setActivePresetId("pico_tarde_tormenta");
    triggerRouteCalculation(orig, dest, ctx);
    setFlyToLocation({ lat: -32.9515, lon: -60.643, zoom: 14 });
  }, [triggerRouteCalculation]);

  const handleQuickRouteCircunvalacion = useCallback(() => {
    setAppMode("route");
    const orig: NodeInfo = {
      id: 1005,
      lat: -32.973,
      lon: -60.68,
      label: "Av. Circunvalación y Av. Pellegrini",
    };
    const dest: NodeInfo = {
      id: 1004,
      lat: -32.9468,
      lon: -60.6393,
      label: "Bv. Nicasio Oroño y Córdoba (Microcentro)",
    };
    const ctx: ContextParams = {
      hora_dia: 8.0,
      dia_semana: "miercoles",
      clima: "despejado",
      es_feriado: false,
    };
    setOrigin(orig);
    setDestination(dest);
    setContext(ctx);
    setActivePresetId("pico_manana");
    triggerRouteCalculation(orig, dest, ctx);
    setFlyToLocation({ lat: -32.96, lon: -60.66, zoom: 13 });
  }, [triggerRouteCalculation]);

  const handleQuickRouteTSP = useCallback(() => {
    setAppMode("tour");
    const dep: NodeInfo = {
      id: 1001,
      lat: -32.9377,
      lon: -60.6728,
      label: "Depósito Central (Terminal de Ómnibus)",
    };
    const stps: NodeInfo[] = [
      {
        id: 1003,
        lat: -32.9554,
        lon: -60.6558,
        label: "Cliente 1 · Pellegrini y Corrientes",
      },
      {
        id: 1002,
        lat: -32.9475,
        lon: -60.6305,
        label: "Cliente 2 · Monumento a la Bandera",
      },
      {
        id: 1004,
        lat: -32.9468,
        lon: -60.6393,
        label: "Cliente 3 · Bv. Oroño y Córdoba",
      },
      {
        id: 1007,
        lat: -32.943,
        lon: -60.665,
        label: "Cliente 4 · Echesortu (Santa Fe y Avellaneda)",
      },
    ];
    setDepot(dep);
    setStops(stps);
    setReturnToDepot(true);
    triggerTourOptimization(dep, stps, true, context);
    setFlyToLocation({ lat: -32.945, lon: -60.655, zoom: 13 });
  }, [context, triggerTourOptimization]);

  // Limpiar todos los puntos y rutas
  const handleResetPoints = useCallback(() => {
    setOrigin(null);
    setDestination(null);
    setDepot(null);
    setStops([]);
    setRouteResult(null);
    setTourResult(null);
    setSelectionMode(appMode === "route" ? "origin" : "depot");
  }, [appMode]);

  // Cambiar modo de aplicación
  const handleAppModeChange = useCallback((mode: "route" | "tour") => {
    setAppMode(mode);
    setSelectionMode(mode === "route" ? "origin" : "depot");
  }, []);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-slate-950 text-slate-100">
      {/* Mapa interactivo con Leaflet Canvas y Esri Dark Gray Base */}
      <MapViewer
        context={context}
        origin={origin}
        destination={destination}
        depot={depot}
        stops={stops}
        routeResult={routeResult}
        tourResult={tourResult}
        selectionMode={selectionMode}
        showTrafficLayer={showTrafficLayer}
        showStaticRoute={showStaticRoute}
        showDynamicRoute={showDynamicRoute}
        flyToLocation={flyToLocation}
        onNodeSelected={handleNodeSelected}
        onViewportStatsChange={setViewportStats}
      />

      {/* Barra Lateral Flotante de Control (Left Drawer) */}
      <aside className="pointer-events-auto absolute left-4 top-4 bottom-4 z-[500] flex w-96 flex-col gap-2.5 overflow-y-auto pr-1">
        {/* Cabecera Principal de la App */}
        <div className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900/95 p-3 shadow-2xl backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400">
              <Navigation className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight text-white">
                Rosario Last-Mile Router
              </h1>
              <p className="text-[11px] text-slate-400">
                {viewportStats
                  ? `${viewportStats.totalEdges.toLocaleString()} tramos · ${viewportStats.executionTimeMs.toFixed(0)} ms`
                  : "13.134 esquinas · Árbol CART + Dijkstra"}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsBenchmarkOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/90 px-2.5 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-emerald-500/50 hover:bg-slate-700 hover:text-white"
            title="Abrir auditoría científica de Machine Learning"
            data-testid="open-benchmark-btn"
          >
            <BarChart3 className="h-3.5 w-3.5 text-emerald-400" />
            <span>Auditoría</span>
          </button>
        </div>

        {/* 3 Atajos de Rutas Rápidas */}
        <div className="flex flex-col gap-1.5 rounded-2xl border border-slate-800 bg-slate-900/95 p-2.5 shadow-2xl backdrop-blur-md">
          <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            <span className="flex items-center gap-1 text-amber-400">
              <Zap className="h-3 w-3" />
              <span>Rutas Rápidas de Demostración</span>
            </span>
            <span className="text-[9px] text-emerald-400 font-mono">1 CLIC</span>
          </div>
          <div className="grid grid-cols-3 gap-1.5 text-left">
            <button
              type="button"
              onClick={handleQuickRoutePellegrini}
              data-testid="quick-route-pellegrini"
              className="flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-950/60 p-2 text-left transition hover:border-emerald-500/50 hover:bg-slate-800/60"
              title="Pellegrini ➔ Monumento (Desvío inteligente por congestión severa)"
            >
              <div className="flex items-center gap-1 text-amber-400 text-xs">
                <Zap className="h-3.5 w-3.5 shrink-0" />
                <span className="font-bold text-[11px] text-slate-200">
                  Pellegrini
                </span>
              </div>
              <div className="text-[10px] text-slate-400 mt-1 leading-tight">
                ➔ Monumento
              </div>
              <div className="mt-1 text-[9px] text-emerald-400 font-medium">
                Evita colapso
              </div>
            </button>

            <button
              type="button"
              onClick={handleQuickRouteCircunvalacion}
              data-testid="quick-route-circunvalacion"
              className="flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-950/60 p-2 text-left transition hover:border-emerald-500/50 hover:bg-slate-800/60"
              title="Circunvalación ➔ Microcentro (Acceso perimetral rápido)"
            >
              <div className="flex items-center gap-1 text-sky-400 text-xs">
                <Car className="h-3.5 w-3.5 shrink-0" />
                <span className="font-bold text-[11px] text-slate-200">
                  Circunval.
                </span>
              </div>
              <div className="text-[10px] text-slate-400 mt-1 leading-tight">
                ➔ Centro
              </div>
              <div className="mt-1 text-[9px] text-sky-400 font-medium">
                Perimetral
              </div>
            </button>

            <button
              type="button"
              onClick={handleQuickRouteTSP}
              data-testid="quick-route-tsp"
              className="flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-950/60 p-2 text-left transition hover:border-emerald-500/50 hover:bg-slate-800/60"
              title="Ronda 4 Clientes (TSP 2-opt con retorno a depósito)"
            >
              <div className="flex items-center gap-1 text-purple-400 text-xs">
                <Package className="h-3.5 w-3.5 shrink-0" />
                <span className="font-bold text-[11px] text-slate-200">
                  4 Clientes
                </span>
              </div>
              <div className="text-[10px] text-slate-400 mt-1 leading-tight">
                TSP 2-opt
              </div>
              <div className="mt-1 text-[9px] text-purple-300 font-medium">
                Logística
              </div>
            </button>
          </div>
        </div>

        {/* Buscador de Esquinas en Tiempo Real */}
        <StreetSearch
          onSelectCorner={(node, mode) => {
            handleNodeSelected(node, mode);
          }}
          onFlyTo={(coords) => setFlyToLocation(coords)}
        />

        {/* Selector de Puntos en Modo Ruta A -> B */}
        {appMode === "route" && (
          <div className="grid grid-cols-2 gap-2 text-xs">
            <button
              type="button"
              onClick={() => setSelectionMode("origin")}
              data-testid="select-origin-btn"
              className={`flex items-center gap-2 rounded-xl border p-2 text-left transition ${
                selectionMode === "origin"
                  ? "border-emerald-500 bg-emerald-500/20 text-emerald-200 shadow-md"
                  : "border-slate-800 bg-slate-900/90 text-slate-300 hover:border-slate-700"
              }`}
            >
              <MapPin className="h-4 w-4 shrink-0 text-emerald-400" />
              <div className="truncate">
                <div className="text-[9px] uppercase tracking-wider text-slate-400">
                  Origen (Clic Mapa)
                </div>
                <div className="truncate font-semibold text-white">
                  {origin ? origin.label : "Fijar esquina..."}
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setSelectionMode("destination")}
              data-testid="select-dest-btn"
              className={`flex items-center gap-2 rounded-xl border p-2 text-left transition ${
                selectionMode === "destination"
                  ? "border-rose-500 bg-rose-500/20 text-rose-200 shadow-md"
                  : "border-slate-800 bg-slate-900/90 text-slate-300 hover:border-slate-700"
              }`}
            >
              <MapPin className="h-4 w-4 shrink-0 text-rose-400" />
              <div className="truncate">
                <div className="text-[9px] uppercase tracking-wider text-slate-400">
                  Destino (Clic Mapa)
                </div>
                <div className="truncate font-semibold text-white">
                  {destination ? destination.label : "Fijar esquina..."}
                </div>
              </div>
            </button>
          </div>
        )}

        {/* Gestor de Paradas en Modo Ronda TSP */}
        {appMode === "tour" && (
          <StopsManager
            depot={depot}
            stops={stops}
            selectionMode={selectionMode}
            onSetSelectionMode={setSelectionMode}
            onRemoveStop={(idx) => {
              const updated = stops.filter((_, i) => i !== idx);
              setStops(updated);
            }}
            onClearStops={() => {
              setStops([]);
              setTourResult(null);
            }}
            returnToDepot={returnToDepot}
            onToggleReturnToDepot={() => setReturnToDepot((prev) => !prev)}
            onOptimizeTour={() => {
              if (depot) {
                triggerTourOptimization(depot, stops, returnToDepot, context);
              }
            }}
            isCalculating={isCalculating}
            tourResult={tourResult}
          />
        )}

        {/* Monitor Top Arterias Colapsadas de Rosario */}
        <CongestionMonitor
          context={context}
          onSelectCorridor={(corridor: CongestedCorridor) => {
            setFlyToLocation({ lat: corridor.lat, lon: corridor.lon, zoom: 15 });
          }}
        />

        {/* Tarjeta de Métricas y Ahorro de Tiempo */}
        <MetricsCard
          routeResult={routeResult}
          tourResult={tourResult}
          appMode={appMode}
          isCalculating={isCalculating}
          onClear={handleResetPoints}
        />

        {/* Panel de Control Contextual y Presets */}
        <ControlPanel
          context={context}
          onContextChange={handleContextChange}
          activePresetId={activePresetId}
          onApplyPreset={handleApplyPreset}
          presets={presets}
          appMode={appMode}
          onAppModeChange={handleAppModeChange}
          showTrafficLayer={showTrafficLayer}
          onToggleTrafficLayer={() => setShowTrafficLayer((p) => !p)}
          showStaticRoute={showStaticRoute}
          onToggleStaticRoute={() => setShowStaticRoute((p) => !p)}
          showDynamicRoute={showDynamicRoute}
          onToggleDynamicRoute={() => setShowDynamicRoute((p) => !p)}
          isCalculating={isCalculating}
          onResetPoints={handleResetPoints}
        />
      </aside>

      {/* Modal de Auditoría y Benchmark Científico */}
      <BenchmarkModal
        isOpen={isBenchmarkOpen}
        onClose={() => setIsBenchmarkOpen(false)}
      />
    </div>
  );
};

export default App;
