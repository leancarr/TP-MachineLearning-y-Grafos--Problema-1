import React, { useCallback, useEffect, useState } from "react";
import {
  MapPin,
  Navigation,
  BarChart3,
  Car,
  Package,
  Zap,
  PanelLeftClose,
  PanelLeftOpen,
  RotateCcw,
} from "lucide-react";
import MapViewer, { SelectionMode, ViewportStats } from "./components/MapViewer";
import BenchmarkModal from "./components/BenchmarkModal";
import ControlPanel from "./components/ControlPanel";
import MetricsCard from "./components/MetricsCard";
import StopsManager from "./components/StopsManager";
import StreetSearch from "./components/StreetSearch";
import {
  ContextParams,
  DiaSemanaType,
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

export function getSystemDefaultContext(): ContextParams {
  const now = new Date();
  const days: DiaSemanaType[] = [
    "domingo",
    "lunes",
    "martes",
    "miercoles",
    "jueves",
    "viernes",
    "sabado",
  ];
  const dia_semana = days[now.getDay()] ?? "miercoles";
  const hours = now.getHours();
  const halfHour = now.getMinutes() >= 30 ? 0.5 : 0.0;

  return {
    hora_dia: hours + halfHour,
    dia_semana,
    clima: "despejado",
    es_feriado: false,
  };
}

export const DEFAULT_CONTEXT: ContextParams = getSystemDefaultContext();
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
  // Inicializa por defecto con la hora y día reales del sistema operativo / navegador
  const [context, setContext] = useState<ContextParams>(() =>
    getSystemDefaultContext()
  );
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [presets, setPresets] = useState<ScenarioPreset[]>(FALLBACK_PRESETS);
  const [appMode, setAppMode] = useState<"route" | "tour">("route");

  // Panel lateral ocultable para ver el mapa completo cuando se desee
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);

  // Puntos de Ruteo (limpios al iniciar para que el usuario elija con 2 clics en el mapa)
  const [origin, setOrigin] = useState<NodeInfo | null>(null);
  const [destination, setDestination] = useState<NodeInfo | null>(null);

  // Controla si el usuario presionó explícitamente el botón de cambiar sólo el Origen
  const [explicitSelectionButton, setExplicitSelectionButton] =
    useState<boolean>(false);

  // Puntos de TSP
  const [depot, setDepot] = useState<NodeInfo | null>(null);
  const [stops, setStops] = useState<NodeInfo[]>([]);
  const [returnToDepot, setReturnToDepot] = useState<boolean>(true);

  // Estados de Interacción y Resultados: SIEMPRE activo en "origin" al iniciar
  const [selectionMode, setSelectionMode] = useState<SelectionMode>("origin");
  const [routeResult, setRouteResult] = useState<RouteResponse | null>(null);
  const [tourResult, setTourResult] = useState<TourResponse | null>(null);
  const [isCalculating, setIsCalculating] = useState<boolean>(false);
  const [routeError, setRouteError] = useState<string | null>(null);

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

  // Función para calcular ruta real calle por calle entre origen y destino
  const triggerRouteCalculation = useCallback(
    async (orig: NodeInfo, dest: NodeInfo, ctx: ContextParams) => {
      setIsCalculating(true);
      setRouteError(null);
      try {
        const res = await calculateRouteComparison({
          origin_id: orig.id > 10000 ? orig.id : undefined,
          destination_id: dest.id > 10000 ? dest.id : undefined,
          origin_lat: orig.lat,
          origin_lon: orig.lon,
          destination_lat: dest.lat,
          destination_lon: dest.lon,
          ...ctx,
        });
        setOrigin(res.origin);
        setDestination(res.destination);
        setRouteResult(res);
      } catch (err) {
        console.error("Error calculando ruta en backend:", err);
        setRouteError(
          err instanceof Error
            ? err.message
            : "No se pudo calcular la ruta entre esas esquinas."
        );
      } finally {
        setIsCalculating(false);
      }
    },
    []
  );

  // Función para optimizar ronda de entregas (TSP 2-opt) por calles reales
  const triggerTourOptimization = useCallback(
    async (dep: NodeInfo, stps: NodeInfo[], ret: boolean, ctx: ContextParams) => {
      if (!dep || stps.length === 0) return;
      setIsCalculating(true);
      setRouteError(null);
      try {
        const res = await calculateDeliveryTour({
          depot: {
            node_id: dep.id > 10000 ? dep.id : undefined,
            lat: dep.lat,
            lon: dep.lon,
          },
          stops: stps.map((s) => ({
            node_id: s.id > 10000 ? s.id : undefined,
            lat: s.lat,
            lon: s.lon,
          })),
          return_to_depot: ret,
          ...ctx,
        });
        setTourResult(res);
      } catch (err) {
        console.error("Error en cálculo TSP:", err);
        setRouteError(
          err instanceof Error
            ? err.message
            : "No se pudo optimizar la ronda de reparto."
        );
      } finally {
        setIsCalculating(false);
      }
    },
    []
  );

  // Recálculo reactivo cuando el usuario cambia hora, día o clima
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

  // Botón para volver a la hora y día reales del sistema operativo
  const handleUseCurrentTime = useCallback(() => {
    const sysCtx = getSystemDefaultContext();
    handleContextChange({
      ...sysCtx,
      clima: context.clima,
    });
  }, [context.clima, handleContextChange]);

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

  // Manejador de clics en esquinas del mapa:
  // Ciclo intuitivo de 2 clics: Clic 1 = Origen -> Clic 2 = Destino (y calcula ruta) -> Clic 3 = Nuevo Origen
  const handleNodeSelected = useCallback(
    (node: NodeInfo, mode: SelectionMode) => {
      const effectiveMode = mode || "origin";

      if (effectiveMode === "origin") {
        setOrigin(node);
        if (explicitSelectionButton && destination) {
          // Si tocó el botón "Origen" en el panel y ya tenía destino, recalcula con ese destino
          setExplicitSelectionButton(false);
          setSelectionMode("destination");
          triggerRouteCalculation(node, destination, context);
        } else {
          // Flujo natural en el mapa: el 1er clic fija Origen, limpia ruta previa y pide el 2do clic (Destino)
          setDestination(null);
          setRouteResult(null);
          setSelectionMode("destination");
        }
      } else if (effectiveMode === "destination") {
        setDestination(node);
        setExplicitSelectionButton(false);
        // Luego de marcar el destino, deja listo "origin" por si el usuario quiere armar otra ruta con 2 clics
        setSelectionMode("origin");
        if (origin) {
          triggerRouteCalculation(origin, node, context);
        }
      } else if (effectiveMode === "depot") {
        setDepot(node);
        setSelectionMode("stop");
      } else if (effectiveMode === "stop") {
        if (stops.length < 10) {
          const newStops = [...stops, node];
          setStops(newStops);
        }
      }
    },
    [
      origin,
      destination,
      stops,
      context,
      explicitSelectionButton,
      triggerRouteCalculation,
    ]
  );

  // 3 Atajos de Ejemplos Rápidos (usando coordenadas reales para que Dijkstra trace por las calles reales)
  const handleQuickRoutePellegrini = useCallback(() => {
    setAppMode("route");
    const orig: NodeInfo = {
      id: 0,
      lat: -32.9554,
      lon: -60.6558,
      label: "Av. Pellegrini y Corrientes",
    };
    const dest: NodeInfo = {
      id: 0,
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
    setSelectionMode("origin");
    triggerRouteCalculation(orig, dest, ctx);
    setFlyToLocation({ lat: -32.9515, lon: -60.643, zoom: 14 });
  }, [triggerRouteCalculation]);

  const handleQuickRouteCircunvalacion = useCallback(() => {
    setAppMode("route");
    const orig: NodeInfo = {
      id: 0,
      lat: -32.973,
      lon: -60.68,
      label: "Av. Circunvalación y Av. Pellegrini",
    };
    const dest: NodeInfo = {
      id: 0,
      lat: -32.9468,
      lon: -60.6393,
      label: "Bv. Oroño y Córdoba (Centro)",
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
    setSelectionMode("origin");
    triggerRouteCalculation(orig, dest, ctx);
    setFlyToLocation({ lat: -32.96, lon: -60.66, zoom: 13 });
  }, [triggerRouteCalculation]);

  const handleQuickRouteTSP = useCallback(() => {
    setAppMode("tour");
    const dep: NodeInfo = {
      id: 0,
      lat: -32.9377,
      lon: -60.6728,
      label: "Depósito Central (Terminal de Ómnibus)",
    };
    const stps: NodeInfo[] = [
      {
        id: 0,
        lat: -32.9554,
        lon: -60.6558,
        label: "Cliente 1 · Pellegrini y Corrientes",
      },
      {
        id: 0,
        lat: -32.9475,
        lon: -60.6305,
        label: "Cliente 2 · Monumento a la Bandera",
      },
      {
        id: 0,
        lat: -32.9468,
        lon: -60.6393,
        label: "Cliente 3 · Bv. Oroño y Córdoba",
      },
      {
        id: 0,
        lat: -32.943,
        lon: -60.665,
        label: "Cliente 4 · Santa Fe y Avellaneda",
      },
    ];
    setDepot(dep);
    setStops(stps);
    setReturnToDepot(true);
    setSelectionMode("stop");
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
    setRouteError(null);
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

      {/* Botón flotante para reabrir el panel cuando está oculto */}
      {!isSidebarOpen && (
        <div className="pointer-events-auto absolute left-4 top-4 z-[500] flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsSidebarOpen(true)}
            className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/95 px-3.5 py-2.5 text-xs font-semibold text-white shadow-2xl backdrop-blur-md transition hover:border-emerald-500/50 hover:bg-slate-800"
            title="Mostrar panel de control"
          >
            <PanelLeftOpen className="h-4 w-4 text-emerald-400" />
            <span>Mostrar Controles</span>
          </button>

          <button
            type="button"
            onClick={() => setIsBenchmarkOpen(true)}
            className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900/95 px-3 py-2.5 text-xs font-semibold text-slate-200 shadow-2xl backdrop-blur-md transition hover:border-emerald-500/50 hover:bg-slate-800"
          >
            <BarChart3 className="h-4 w-4 text-emerald-400" />
            <span>Auditoría ML</span>
          </button>
        </div>
      )}

      {/* Barra Lateral Flotante de Control (Ocultable y Simplificada) */}
      {isSidebarOpen && (
        <aside className="pointer-events-auto absolute left-4 top-4 bottom-4 z-[500] flex w-96 flex-col gap-2.5 overflow-y-auto pr-1">
          {/* 1. Cabecera Principal con botón de Ocultar Panel */}
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
                    ? `${viewportStats.totalEdges.toLocaleString()} cuadras · ${viewportStats.executionTimeMs.toFixed(0)} ms`
                    : "13.134 esquinas · Árbol CART + Dijkstra"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setIsBenchmarkOpen(true)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/90 px-2 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-emerald-500/50 hover:bg-slate-700 hover:text-white"
                title="Abrir auditoría científica de Machine Learning"
                data-testid="open-benchmark-btn"
              >
                <BarChart3 className="h-3.5 w-3.5 text-emerald-400" />
                <span>Auditoría</span>
              </button>

              <button
                type="button"
                onClick={() => setIsSidebarOpen(false)}
                className="inline-flex items-center justify-center rounded-lg border border-slate-700 bg-slate-800/90 p-1.5 text-slate-300 transition hover:border-slate-600 hover:bg-slate-700 hover:text-white"
                title="Ocultar panel lateral para ver el mapa completo"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* 2. Selección de Puntos en el Mapa (Origen y Destino) */}
          {appMode === "route" && (
            <div className="flex flex-col gap-2 rounded-2xl border border-slate-800 bg-slate-900/95 p-3 shadow-2xl backdrop-blur-md">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold text-slate-200">
                  📍 Seleccioná 2 esquinas haciendo clic en el mapa
                </span>
                {(origin || destination) && (
                  <button
                    type="button"
                    onClick={handleResetPoints}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-400 hover:text-rose-300"
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>Borrar</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setExplicitSelectionButton(true);
                    setSelectionMode("origin");
                  }}
                  data-testid="select-origin-btn"
                  className={`flex items-center gap-2 rounded-xl border p-2.5 text-left transition ${
                    selectionMode === "origin"
                      ? "border-emerald-500 bg-emerald-500/20 text-emerald-200 shadow-md"
                      : "border-slate-800 bg-slate-950/70 text-slate-300 hover:border-slate-700"
                  }`}
                >
                  <MapPin className="h-4 w-4 shrink-0 text-emerald-400" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
                      1. Origen (Verde)
                    </div>
                    <div className="truncate font-medium text-white">
                      {origin ? origin.label : "Clic en el mapa..."}
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setExplicitSelectionButton(true);
                    setSelectionMode("destination");
                  }}
                  data-testid="select-dest-btn"
                  className={`flex items-center gap-2 rounded-xl border p-2.5 text-left transition ${
                    selectionMode === "destination"
                      ? "border-rose-500 bg-rose-500/20 text-rose-200 shadow-md"
                      : "border-slate-800 bg-slate-950/70 text-slate-300 hover:border-slate-700"
                  }`}
                >
                  <MapPin className="h-4 w-4 shrink-0 text-rose-400" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-rose-400">
                      2. Destino (Rojo)
                    </div>
                    <div className="truncate font-medium text-white">
                      {destination ? destination.label : "Clic en el mapa..."}
                    </div>
                  </div>
                </button>
              </div>

              {/* Buscador opcional por nombre de calle */}
              <StreetSearch
                onSelectCorner={(node, mode) => {
                  setExplicitSelectionButton(true);
                  handleNodeSelected(node, mode);
                }}
                onFlyTo={(coords) => setFlyToLocation(coords)}
              />
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

          {routeError && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-950/60 p-3 text-xs text-rose-200">
              {routeError}
            </div>
          )}

          {/* 3. Tarjeta de Métricas y Comparación (aparece cuando hay ruta calculada) */}
          <MetricsCard
            routeResult={routeResult}
            tourResult={tourResult}
            appMode={appMode}
            isCalculating={isCalculating}
            onClear={handleResetPoints}
          />

          {/* 4. Panel de Control Contextual (Hora, Día, Clima y Capas siempre visibles) */}
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
            onUseCurrentTime={handleUseCurrentTime}
          />

          {/* 5. Ejemplos Rápidos de Demostración (1 Clic, compactos al pie) */}
          <div className="flex flex-col gap-1.5 rounded-2xl border border-slate-800 bg-slate-900/95 p-2.5 shadow-2xl backdrop-blur-md">
            <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              <span className="flex items-center gap-1 text-amber-400">
                <Zap className="h-3 w-3" />
                <span>Ejemplos de Ruta Prearmados (Opcional)</span>
              </span>
              <span className="text-[9px] text-emerald-400 font-mono">1 CLIC</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5 text-left">
              <button
                type="button"
                onClick={handleQuickRoutePellegrini}
                data-testid="quick-route-pellegrini"
                className="flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-950/60 p-2 text-left transition hover:border-emerald-500/50 hover:bg-slate-800/60"
                title="Pellegrini ➔ Monumento (Hora pico con tormenta)"
              >
                <div className="flex items-center gap-1 text-amber-400 text-xs">
                  <Zap className="h-3.5 w-3.5 shrink-0" />
                  <span className="font-bold text-[11px] text-slate-200">
                    Pellegrini
                  </span>
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5 leading-tight">
                  ➔ Monumento
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
                <div className="text-[10px] text-slate-400 mt-0.5 leading-tight">
                  ➔ Centro
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
                <div className="text-[10px] text-slate-400 mt-0.5 leading-tight">
                  TSP 2-opt
                </div>
              </button>
            </div>
          </div>
        </aside>
      )}

      {/* Modal de Auditoría y Benchmark Científico */}
      <BenchmarkModal
        isOpen={isBenchmarkOpen}
        onClose={() => setIsBenchmarkOpen(false)}
      />
    </div>
  );
};

export default App;
