import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Navigation,
  BarChart3,
  PanelLeftClose,
  PanelLeftOpen,
  RotateCcw,
  Plus,
  Menu,
  X,
} from "lucide-react";
import MapViewer, { SelectionMode } from "./components/MapViewer";
import BenchmarkModal from "./components/BenchmarkModal";
import ControlPanel from "./components/ControlPanel";
import MetricsCard from "./components/MetricsCard";
import StreetSearch from "./components/StreetSearch";
import {
  ContextParams,
  DiaSemanaType,
  NodeInfo,
  RouteResponse,
  ScenarioPreset,
} from "./types";
import { calculateRouteComparison } from "./services/api";

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
  const minutes = now.getMinutes();

  return {
    hora_dia: Number((hours + minutes / 60).toFixed(2)),
    dia_semana,
    clima: "despejado",
    es_feriado: false,
  };
}

export const DEFAULT_CONTEXT: ContextParams = getSystemDefaultContext();
export const DEFAULT_NORMAL_DAY_CONTEXT = DEFAULT_CONTEXT;

export const FALLBACK_PRESETS: ScenarioPreset[] = [];

export const App: React.FC = () => {
  // Inicializa por defecto con la hora y día reales del sistema operativo / navegador
  const [context, setContext] = useState<ContextParams>(() =>
    getSystemDefaultContext()
  );

  // Panel lateral ocultable para ver el mapa completo cuando se desee
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);

  // Lista unificada de paradas (empieza con 1. Origen y 2. Destino, y permite sumar más paradas)
  const [waypoints, setWaypoints] = useState<(NodeInfo | null)[]>([null, null]);
  // Índice de la parada actualmente seleccionada para ubicar o corregir en el mapa
  const [activeStopIndex, setActiveStopIndex] = useState<number>(0);

  // Estado para arrastrar y reordenar paradas manteniendo presionadas las 3 rayitas (≡)
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const draggingIndexRef = useRef<number | null>(null);

  const [routeResult, setRouteResult] = useState<RouteResponse | null>(null);
  const [isCalculating, setIsCalculating] = useState<boolean>(false);
  const [routeError, setRouteError] = useState<string | null>(null);

  // Capas, Visualización y Cámara
  const [showTrafficLayer, setShowTrafficLayer] = useState<boolean>(true);
  const [showStaticRoute, setShowStaticRoute] = useState<boolean>(true);
  const [showDynamicRoute, setShowDynamicRoute] = useState<boolean>(true);
  const [flyToLocation, setFlyToLocation] = useState<{
    lat: number;
    lon: number;
    zoom?: number;
  } | null>(null);

  // Modal de Auditoría
  const [isBenchmarkOpen, setIsBenchmarkOpen] = useState<boolean>(false);

  // Calcula la ruta encadenando todas las paradas en orden (1 ➔ 2 ➔ 3...) SIN vuelta al origen
  const calculateSequentialRoute = useCallback(
    async (currentWaypoints: (NodeInfo | null)[], ctx: ContextParams) => {
      const filledStops: NodeInfo[] = [];

      currentWaypoints.forEach((wp) => {
        if (wp !== null) {
          filledStops.push(wp);
        }
      });

      if (filledStops.length < 2) {
        setRouteResult(null);
        setRouteError(null);
        return;
      }

      setIsCalculating(true);
      setRouteError(null);

      try {
        // Calculamos cada tramo consecutivo (1 -> 2, 2 -> 3, etc.) en paralelo por las calles reales
        const legPromises: Promise<RouteResponse>[] = [];
        for (let i = 0; i < filledStops.length - 1; i++) {
          const orig = filledStops[i];
          const dest = filledStops[i + 1];
          legPromises.push(
            calculateRouteComparison({
              origin_id: orig.id > 10000 ? orig.id : undefined,
              destination_id: dest.id > 10000 ? dest.id : undefined,
              origin_lat: orig.lat,
              origin_lon: orig.lon,
              destination_lat: dest.lat,
              destination_lon: dest.lon,
              ...ctx,
            })
          );
        }

        const legResults = await Promise.all(legPromises);

        if (legResults.length === 1) {
          setRouteResult(legResults[0]);
          return;
        }

        // Si hay 3 o más paradas, encadenamos todos los tramos en orden (1 ➔ 2 ➔ 3...) sin retorno
        let dynDistM = 0;
        let dynTimeSec = 0;
        let dynExecMs = 0;
        const dynCoords: [number, number][] = [];
        const dynNodes: number[] = [];
        const dynTramos: string[] = [];

        let statDistM = 0;
        let statTimeSec = 0;
        let statExecMs = 0;
        const statCoords: [number, number][] = [];
        const statNodes: number[] = [];
        const statTramos: string[] = [];

        let totalExecMs = 0;

        legResults.forEach((leg, idx) => {
          dynDistM += leg.dynamic_route.distance_m;
          dynTimeSec += leg.dynamic_route.time_sec;
          dynExecMs += leg.dynamic_route.execution_time_ms;
          leg.dynamic_route.coordinates.forEach((coord, cIdx) => {
            if (idx === 0 || cIdx > 0) {
              dynCoords.push(coord);
            }
          });
          leg.dynamic_route.nodes.forEach((nid, nIdx) => {
            if (idx === 0 || nIdx > 0) {
              dynNodes.push(nid);
            }
          });
          dynTramos.push(...leg.dynamic_route.tramos);

          statDistM += leg.static_route.distance_m;
          statTimeSec += leg.static_route.time_sec;
          statExecMs += leg.static_route.execution_time_ms;
          leg.static_route.coordinates.forEach((coord, cIdx) => {
            if (idx === 0 || cIdx > 0) {
              statCoords.push(coord);
            }
          });
          leg.static_route.nodes.forEach((nid, nIdx) => {
            if (idx === 0 || nIdx > 0) {
              statNodes.push(nid);
            }
          });
          statTramos.push(...leg.static_route.tramos);

          totalExecMs += leg.total_execution_time_ms;
        });

        const timeSavedSec = statTimeSec - dynTimeSec;
        const timeSavedMin = timeSavedSec / 60.0;
        const timeSavedPct =
          statTimeSec > 0 ? (timeSavedSec / statTimeSec) * 100.0 : 0.0;

        const combinedResponse: RouteResponse = {
          origin: legResults[0].origin,
          destination: legResults[legResults.length - 1].destination,
          dynamic_route: {
            found: true,
            mode: "dynamic_time",
            distance_m: dynDistM,
            distance_km: dynDistM / 1000.0,
            time_sec: dynTimeSec,
            time_min: dynTimeSec / 60.0,
            nodes: dynNodes,
            coordinates: dynCoords,
            tramos: dynTramos,
            execution_time_ms: dynExecMs,
          },
          static_route: {
            found: true,
            mode: "static_distance",
            distance_m: statDistM,
            distance_km: statDistM / 1000.0,
            time_sec: statTimeSec,
            time_min: statTimeSec / 60.0,
            nodes: statNodes,
            coordinates: statCoords,
            tramos: statTramos,
            execution_time_ms: statExecMs,
          },
          comparison: {
            time_saved_sec: timeSavedSec,
            time_saved_min: timeSavedMin,
            time_saved_pct: timeSavedPct,
            distance_diff_m: dynDistM - statDistM,
            is_dynamic_faster: timeSavedSec > 1.0,
          },
          context: legResults[0].context,
          total_execution_time_ms: totalExecMs,
        };

        setRouteResult(combinedResponse);
      } catch (err) {
        console.error("Error calculando ruta:", err);
        setRouteError(
          err instanceof Error
            ? err.message
            : "No se pudo calcular el recorrido entre esas esquinas."
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
      const filledCount = waypoints.filter((w) => w !== null).length;
      if (filledCount >= 2) {
        calculateSequentialRoute(waypoints, newCtx);
      }
    },
    [waypoints, calculateSequentialRoute]
  );

  // Botón para volver a la hora y día reales del sistema operativo
  const handleUseCurrentTime = useCallback(() => {
    const sysCtx = getSystemDefaultContext();
    handleContextChange({
      ...sysCtx,
      clima: context.clima,
    });
  }, [context.clima, handleContextChange]);

  // Manejador cuando el usuario hace clic en el mapa (o elige una esquina en el buscador):
  // Evaluación inteligente:
  // - Si la parada actual estaba vacía (es la 1ra vez que la estás marcando) y abajo hay otra parada vacía, avanza sola a esa parada vacía.
  // - Si la parada actual YA tenía una calle (le diste clic para corregirla) o ya no quedan vacías abajo, se queda en esa misma parada aunque toques el mapa varias veces.
  const handleNodeSelected = useCallback(
    (node: NodeInfo, _mode?: SelectionMode) => {
      const targetIdx =
        activeStopIndex >= 0 && activeStopIndex < waypoints.length
          ? activeStopIndex
          : 0;

      const wasTargetEmpty = waypoints[targetIdx] === null;
      const nextWaypoints = [...waypoints];
      nextWaypoints[targetIdx] = node;
      setWaypoints(nextWaypoints);

      if (wasTargetEmpty) {
        // Solo si era la primera vez que se completaba este casillero, buscamos si hay uno vacío más abajo
        const nextEmptyBelow = nextWaypoints.findIndex(
          (w, idx) => idx > targetIdx && w === null
        );
        if (nextEmptyBelow !== -1) {
          setActiveStopIndex(nextEmptyBelow);
        }
      }

      // Si ya hay al menos 2 paradas cargadas, calcula la ruta automáticamente
      if (nextWaypoints.filter((w) => w !== null).length >= 2) {
        calculateSequentialRoute(nextWaypoints, context);
      }
    },
    [activeStopIndex, waypoints, context, calculateSequentialRoute]
  );

  // Agregar una nueva parada a la lista
  const handleAddStop = useCallback(() => {
    if (waypoints.length >= 10) return;
    const newIdx = waypoints.length;
    setWaypoints((prev) => [...prev, null]);
    setActiveStopIndex(newIdx);
  }, [waypoints.length]);

  // Eliminar o limpiar una parada
  const handleRemoveStop = useCallback(
    (idx: number) => {
      let nextWaypoints: (NodeInfo | null)[];
      if (waypoints.length <= 2) {
        nextWaypoints = [...waypoints];
        nextWaypoints[idx] = null;
        setWaypoints(nextWaypoints);
        setActiveStopIndex(idx);
      } else {
        nextWaypoints = waypoints.filter((_, i) => i !== idx);
        setWaypoints(nextWaypoints);
        setActiveStopIndex((prev) =>
          Math.min(prev, nextWaypoints.length - 1)
        );
      }

      if (nextWaypoints.filter((w) => w !== null).length >= 2) {
        calculateSequentialRoute(nextWaypoints, context);
      } else {
        setRouteResult(null);
      }
    },
    [waypoints, context, calculateSequentialRoute]
  );

  // Mover una parada de lugar (manteniendo presionadas las tres rayitas ≡)
  const moveWaypoint = useCallback(
    (fromIdx: number, toIdx: number) => {
      if (fromIdx === toIdx || fromIdx < 0 || toIdx < 0) return;
      setWaypoints((prev) => {
        if (fromIdx >= prev.length || toIdx >= prev.length) return prev;
        const updated = [...prev];
        const [movedItem] = updated.splice(fromIdx, 1);
        updated.splice(toIdx, 0, movedItem);

        // Recalcular automáticamente la ruta con el nuevo orden de paradas
        if (updated.filter((w) => w !== null).length >= 2) {
          calculateSequentialRoute(updated, context);
        }
        return updated;
      });
      setActiveStopIndex(toIdx);
    },
    [context, calculateSequentialRoute]
  );

  // Soltar el arrastre al soltar el clic en cualquier parte de la ventana
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (draggingIndexRef.current !== null) {
        draggingIndexRef.current = null;
        setDraggingIndex(null);
      }
    };
    window.addEventListener("mouseup", handleGlobalMouseUp);
    return () => window.removeEventListener("mouseup", handleGlobalMouseUp);
  }, []);

  // Limpiar todos los puntos y rutas
  const handleResetPoints = useCallback(() => {
    setWaypoints([null, null]);
    setActiveStopIndex(0);
    setRouteResult(null);
    setRouteError(null);
  }, []);

  const hasAnyStop = waypoints.some((w) => w !== null);

  return (
    <div className="fixed inset-0 h-screen w-screen overflow-hidden overscroll-none bg-slate-950 text-slate-100">
      {/* Mapa interactivo con paradas numeradas y rutas de alto contraste */}
      <MapViewer
        context={context}
        waypoints={waypoints}
        activeStopIndex={activeStopIndex}
        routeResult={routeResult}
        showTrafficLayer={showTrafficLayer}
        showStaticRoute={showStaticRoute}
        showDynamicRoute={showDynamicRoute}
        flyToLocation={flyToLocation}
        onNodeSelected={handleNodeSelected}
      />

      {/* Botón flotante para reabrir el panel cuando está oculto */}
      {!isSidebarOpen && (
        <div className="pointer-events-auto absolute left-4 top-4 z-[500] flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsSidebarOpen(true)}
            className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/95 px-3.5 py-2.5 text-xs font-semibold text-white shadow-2xl backdrop-blur-md transition hover:border-cyan-500/50 hover:bg-slate-800"
            title="Mostrar panel de control"
          >
            <PanelLeftOpen className="h-4 w-4 text-cyan-400" />
            <span>Mostrar Controles</span>
          </button>

          <button
            type="button"
            onClick={() => setIsBenchmarkOpen(true)}
            className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900/95 px-3 py-2.5 text-xs font-semibold text-slate-200 shadow-2xl backdrop-blur-md transition hover:border-cyan-500/50 hover:bg-slate-800"
          >
            <BarChart3 className="h-4 w-4 text-cyan-400" />
            <span>Auditoría ML</span>
          </button>
        </div>
      )}

      {/* Barra Lateral Flotante de Control (Ocultable, sin saltos de layout ni desborde de scroll) */}
      {isSidebarOpen && (
        <aside
          onWheel={(e) => e.stopPropagation()}
          className="pointer-events-auto absolute left-4 top-4 bottom-4 z-[500] flex w-96 flex-col gap-2.5 overflow-y-auto overscroll-contain pr-1"
        >
          {/* 1. Cabecera Principal con botón de Ocultar Panel */}
          <div className="relative z-10 flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900/95 p-3 shadow-2xl">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/20 text-cyan-400">
                <Navigation className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-sm font-bold tracking-tight text-white">
                  Rosario Last-Mile Router
                </h1>
                <p className="text-[11px] text-slate-400">
                  13.134 esquinas · Árbol CART + Dijkstra
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setIsBenchmarkOpen(true)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/90 px-2 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-cyan-500/50 hover:bg-slate-700 hover:text-white"
                title="Abrir auditoría científica de Machine Learning"
                data-testid="open-benchmark-btn"
              >
                <BarChart3 className="h-3.5 w-3.5 text-cyan-400" />
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

          {/* 2. Lista Unificada de Paradas Numeradas (z-30 para que el buscador flote siempre por arriba) */}
          <div className="relative z-30 flex flex-col gap-2 rounded-2xl border border-slate-800 bg-slate-900/95 p-3 shadow-2xl">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-slate-200">
                📍 Paradas del recorrido (clic en el mapa)
              </span>
              {hasAnyStop && (
                <button
                  type="button"
                  onClick={handleResetPoints}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-400 hover:text-rose-300"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Reiniciar</span>
                </button>
              )}
            </div>

            {/* Lista de Paradas Numeradas Reordenables */}
            <div className="flex flex-col gap-1.5 select-none">
              {waypoints.map((wp, idx) => {
                const isSelected = activeStopIndex === idx;
                const isDragging = draggingIndex === idx;
                const isFirst = idx === 0;
                const isLast = idx === waypoints.length - 1 && waypoints.length > 1;
                const roleLabel = isFirst
                  ? "Origen"
                  : isLast
                  ? "Destino"
                  : `Parada intermedia`;

                const badgeBg = isFirst
                  ? "bg-cyan-500 text-slate-950"
                  : isLast
                  ? "bg-rose-500 text-white"
                  : "bg-purple-500 text-white";

                return (
                  <div
                    key={`stop-row-${idx}`}
                    draggable
                    onDragStart={(e) => {
                      draggingIndexRef.current = idx;
                      setDraggingIndex(idx);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (
                        draggingIndexRef.current !== null &&
                        draggingIndexRef.current !== idx
                      ) {
                        const from = draggingIndexRef.current;
                        draggingIndexRef.current = idx;
                        setDraggingIndex(idx);
                        moveWaypoint(from, idx);
                      }
                    }}
                    onDragEnd={() => {
                      draggingIndexRef.current = null;
                      setDraggingIndex(null);
                    }}
                    onMouseEnter={() => {
                      if (
                        draggingIndexRef.current !== null &&
                        draggingIndexRef.current !== idx
                      ) {
                        const from = draggingIndexRef.current;
                        draggingIndexRef.current = idx;
                        setDraggingIndex(idx);
                        moveWaypoint(from, idx);
                      }
                    }}
                    className={`flex items-center gap-2 rounded-xl border p-2 text-xs transition ${
                      isDragging
                        ? "border-cyan-400 bg-cyan-500/20 shadow-lg opacity-90"
                        : isSelected
                        ? "border-cyan-500 bg-cyan-500/15 text-white shadow-sm"
                        : "border-slate-800 bg-slate-950/70 text-slate-300 hover:border-slate-700"
                    }`}
                  >
                    {/* Tres rayitas (≡) para mantener apretado y mover la parada de lugar */}
                    <div
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        draggingIndexRef.current = idx;
                        setDraggingIndex(idx);
                      }}
                      className="flex cursor-grab active:cursor-grabbing items-center justify-center rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-cyan-300"
                      title="Mantené presionadas las 3 rayitas y arrastrá hacia arriba o abajo para cambiar el orden"
                    >
                      <Menu className="h-4 w-4" />
                    </div>

                    {/* Botón principal de la fila con el número de parada y nombre de esquina */}
                    <button
                      type="button"
                      onClick={() => setActiveStopIndex(idx)}
                      className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                    >
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold shadow-sm ${badgeBg}`}
                      >
                        {idx + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                          Parada {idx + 1} · {roleLabel}
                        </div>
                        <div className="truncate font-medium text-white">
                          {wp
                            ? wp.label
                            : isSelected
                            ? "Hacé clic en el mapa para ubicar..."
                            : "Sin definir (clic para elegir)"}
                        </div>
                      </div>
                    </button>

                    {/* Botón para quitar parada o vaciar casillero */}
                    {(waypoints.length > 2 || wp !== null) && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveStop(idx);
                        }}
                        className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-rose-400 transition"
                        title={
                          waypoints.length > 2
                            ? "Eliminar esta parada"
                            : "Limpiar esquina"
                        }
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Botón directo para agregar una parada más */}
            {waypoints.length < 10 && (
              <button
                type="button"
                onClick={handleAddStop}
                data-testid="add-stop-btn"
                className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-cyan-500/50 bg-cyan-500/10 py-2 text-xs font-semibold text-cyan-300 transition hover:border-cyan-400 hover:bg-cyan-500/20"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Agregar parada (#{waypoints.length + 1})</span>
              </button>
            )}

            {/* Buscador por nombre de calle (asigna directamente a la parada activa y flota por encima) */}
            <StreetSearch
              activeStopNumber={activeStopIndex + 1}
              onSelectCorner={(node) => {
                handleNodeSelected(node);
              }}
              onFlyTo={(coords) => setFlyToLocation(coords)}
            />
          </div>

          {routeError && (
            <div className="relative z-10 rounded-xl border border-rose-500/40 bg-rose-950/60 p-3 text-xs text-rose-200">
              {routeError}
            </div>
          )}

          {/* 3. Tarjeta de Métricas y Comparación (z-10, sin colapsar ni parpadear al recalcular) */}
          <div className="relative z-10">
            <MetricsCard
              routeResult={routeResult}
              tourResult={null}
              appMode="route"
              isCalculating={isCalculating}
              onClear={handleResetPoints}
            />
          </div>

          {/* 4. Panel de Control Contextual (Reloj digital HH:MM, Día, Switch Feriado, Clima y Capas) */}
          <div className="relative z-10">
            <ControlPanel
              context={context}
              onContextChange={handleContextChange}
              activePresetId={null}
              onApplyPreset={() => {}}
              presets={[]}
              appMode="route"
              onAppModeChange={() => {}}
              hideModeSwitch={true}
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
