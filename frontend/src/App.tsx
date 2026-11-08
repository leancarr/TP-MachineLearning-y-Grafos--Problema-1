import React, { useCallback, useEffect, useState } from "react";
import {
  MapPin,
  Navigation,
  BarChart3,
} from "lucide-react";
import MapViewer, { SelectionMode, ViewportStats } from "./components/MapViewer";
import BenchmarkModal from "./components/BenchmarkModal";
import ControlPanel from "./components/ControlPanel";
import MetricsCard from "./components/MetricsCard";
import StopsManager from "./components/StopsManager";
import {
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

export const App: React.FC = () => {
  const [context, setContext] = useState<ContextParams>(DEFAULT_CONTEXT);
  const [activePresetId, setActivePresetId] = useState<string | null>("pico_manana");
  const [presets, setPresets] = useState<ScenarioPreset[]>(FALLBACK_PRESETS);
  const [appMode, setAppMode] = useState<"route" | "tour">("route");

  // Puntos de Ruteo
  const [origin, setOrigin] = useState<NodeInfo | null>(null);
  const [destination, setDestination] = useState<NodeInfo | null>(null);

  // Puntos de TSP
  const [depot, setDepot] = useState<NodeInfo | null>(null);
  const [stops, setStops] = useState<NodeInfo[]>([]);
  const [returnToDepot, setReturnToDepot] = useState<boolean>(true);

  // Estados de Interacción y Resultados
  const [selectionMode, setSelectionMode] = useState<SelectionMode>("origin");
  const [routeResult, setRouteResult] = useState<RouteResponse | null>(null);
  const [tourResult, setTourResult] = useState<TourResponse | null>(null);
  const [isCalculating, setIsCalculating] = useState<boolean>(false);

  // Capas y Visualización
  const [showTrafficLayer, setShowTrafficLayer] = useState<boolean>(true);
  const [showStaticRoute, setShowStaticRoute] = useState<boolean>(true);
  const [showDynamicRoute, setShowDynamicRoute] = useState<boolean>(true);
  const [viewportStats, setViewportStats] = useState<ViewportStats | null>(null);

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
          ...ctx,
        });
        setRouteResult(res);
      } catch (err) {
        console.error("Error al calcular ruta:", err);
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
          depot: { node_id: dep.id },
          stops: stps.map((s) => ({ node_id: s.id })),
          return_to_depot: ret,
          ...ctx,
        });
        setTourResult(res);
      } catch (err) {
        console.error("Error al calcular ronda TSP:", err);
      } finally {
        setIsCalculating(false);
      }
    },
    []
  );

  // Recálculo reactivo cuando cambia el contexto (sliders, clima o presets)
  const handleContextChange = useCallback(
    (newCtx: ContextParams) => {
      setContext(newCtx);
      setActivePresetId(null); // Modificado manualmente

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
      {/* Mapa interactivo con Leaflet Canvas */}
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
        onNodeSelected={handleNodeSelected}
        onViewportStatsChange={setViewportStats}
      />

      {/* Barra Lateral Flotante de Control (Left Drawer) */}
      <aside className="pointer-events-auto absolute left-4 top-4 bottom-4 z-[500] flex w-96 flex-col gap-3 overflow-y-auto pr-1">
        {/* Cabecera Principal de la App */}
        <div className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900/95 p-3.5 shadow-2xl backdrop-blur-md">
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
                  ? `${viewportStats.totalEdges} tramos · ${viewportStats.executionTimeMs.toFixed(0)} ms`
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

        {/* Selector de Puntos en Modo Ruta A -> B */}
        {appMode === "route" && (
          <div className="grid grid-cols-2 gap-2 text-xs">
            <button
              type="button"
              onClick={() => setSelectionMode("origin")}
              data-testid="select-origin-btn"
              className={`flex items-center gap-2 rounded-xl border p-2.5 text-left transition ${
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
              className={`flex items-center gap-2 rounded-xl border p-2.5 text-left transition ${
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
