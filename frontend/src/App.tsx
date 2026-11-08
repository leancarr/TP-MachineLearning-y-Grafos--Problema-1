import React, { useCallback, useState } from "react";
import { MapPin, Navigation, Activity, Layers, BarChart3 } from "lucide-react";
import MapViewer, { SelectionMode, ViewportStats } from "./components/MapViewer";
import BenchmarkModal from "./components/BenchmarkModal";
import { ContextParams, NodeInfo, RouteResponse, TourResponse } from "./types";
import { calculateRouteComparison } from "./services/api";

export const DEFAULT_NORMAL_DAY_CONTEXT: ContextParams = {
  hora_dia: 14,
  dia_semana: "miercoles",
  clima: "despejado",
  es_feriado: false,
};

export const App: React.FC = () => {
  const [context] = useState<ContextParams>(DEFAULT_NORMAL_DAY_CONTEXT);
  const [origin, setOrigin] = useState<NodeInfo | null>(null);
  const [destination, setDestination] = useState<NodeInfo | null>(null);
  const [depot] = useState<NodeInfo | null>(null);
  const [stops] = useState<NodeInfo[]>([]);
  const [selectionMode, setSelectionMode] = useState<SelectionMode>("origin");
  const [routeResult, setRouteResult] = useState<RouteResponse | null>(null);
  const [tourResult] = useState<TourResponse | null>(null);
  const [showTrafficLayer, setShowTrafficLayer] = useState<boolean>(true);
  const [viewportStats, setViewportStats] = useState<ViewportStats | null>(null);
  const [calculatingRoute, setCalculatingRoute] = useState<boolean>(false);
  const [isBenchmarkOpen, setIsBenchmarkOpen] = useState<boolean>(false);

  const handleNodeSelected = useCallback(
    async (node: NodeInfo, mode: SelectionMode) => {
      if (mode === "origin") {
        setOrigin(node);
        setSelectionMode("destination");
        if (destination) {
          setCalculatingRoute(true);
          try {
            const res = await calculateRouteComparison({
              origin_id: node.id,
              destination_id: destination.id,
              ...context,
            });
            setRouteResult(res);
          } catch (e) {
            console.error("Error calculando ruta:", e);
          } finally {
            setCalculatingRoute(false);
          }
        }
      } else if (mode === "destination") {
        setDestination(node);
        setSelectionMode("origin");
        if (origin) {
          setCalculatingRoute(true);
          try {
            const res = await calculateRouteComparison({
              origin_id: origin.id,
              destination_id: node.id,
              ...context,
            });
            setRouteResult(res);
          } catch (e) {
            console.error("Error calculando ruta:", e);
          } finally {
            setCalculatingRoute(false);
          }
        }
      }
    },
    [origin, destination, context]
  );

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-slate-950 text-slate-100">
      {/* Main Interactive Leaflet Canvas Map */}
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
        onNodeSelected={handleNodeSelected}
        onViewportStatsChange={setViewportStats}
      />

      {/* Floating Header Bar / Quick Controls */}
      <div className="pointer-events-auto absolute left-4 top-4 z-[500] flex max-w-md flex-col gap-3 rounded-2xl border border-slate-800/90 bg-slate-900/90 p-4 shadow-2xl backdrop-blur-md">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400">
              <Navigation className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight text-white">
                Rosario Last-Mile ML Router
              </h1>
              <p className="text-[11px] text-slate-400">
                13,134 esquinas · 30,053 cuadras · Árbol de Decisión + Dijkstra
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIsBenchmarkOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/90 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition hover:border-emerald-500/50 hover:bg-slate-700 hover:text-white"
              title="Abrir auditoría y benchmark científico de modelos"
              data-testid="open-benchmark-btn"
            >
              <BarChart3 className="h-3.5 w-3.5 text-emerald-400" />
              <span>Auditoría ML</span>
            </button>

            <button
              type="button"
              onClick={() => setShowTrafficLayer((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                showTrafficLayer
                  ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                  : "border-slate-700 bg-slate-800 text-slate-400"
              }`}
              title="Alternar capa de congestión ML"
            >
              <Layers className="h-3.5 w-3.5" />
              <span>Capa ML</span>
            </button>
          </div>
        </div>

        {/* Click Selection Mode Indicator */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <button
            type="button"
            onClick={() => setSelectionMode("origin")}
            className={`flex items-center gap-2 rounded-lg border p-2 text-left transition ${
              selectionMode === "origin"
                ? "border-emerald-500 bg-emerald-500/15 text-emerald-200"
                : "border-slate-800 bg-slate-950/60 text-slate-300 hover:border-slate-700"
            }`}
          >
            <MapPin className="h-4 w-4 shrink-0 text-emerald-400" />
            <div className="truncate">
              <div className="text-[10px] uppercase tracking-wider text-slate-400">
                Origen (Clic Mapa)
              </div>
              <div className="truncate font-medium">
                {origin ? origin.label : "Seleccionar esquina..."}
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setSelectionMode("destination")}
            className={`flex items-center gap-2 rounded-lg border p-2 text-left transition ${
              selectionMode === "destination"
                ? "border-rose-500 bg-rose-500/15 text-rose-200"
                : "border-slate-800 bg-slate-950/60 text-slate-300 hover:border-slate-700"
            }`}
          >
            <MapPin className="h-4 w-4 shrink-0 text-rose-400" />
            <div className="truncate">
              <div className="text-[10px] uppercase tracking-wider text-slate-400">
                Destino (Clic Mapa)
              </div>
              <div className="truncate font-medium">
                {destination ? destination.label : "Seleccionar esquina..."}
              </div>
            </div>
          </button>
        </div>

        {calculatingRoute && (
          <div className="flex items-center gap-2 rounded-lg bg-slate-800/80 px-3 py-1.5 text-xs text-emerald-300">
            <Activity className="h-3.5 w-3.5 animate-spin" />
            <span>Calculando camino mínimo estático vs dinámico...</span>
          </div>
        )}

        {routeResult && !calculatingRoute && (
          <div className="rounded-xl border border-emerald-500/30 bg-slate-950/80 p-3 text-xs">
            <div className="flex items-center justify-between font-semibold text-emerald-300">
              <span>Ruta IA Óptima Calculada</span>
              <span>
                Ahorro: {routeResult.comparison.time_saved_min.toFixed(1)} min (
                {routeResult.comparison.time_saved_pct.toFixed(1)}%)
              </span>
            </div>
            <div className="mt-1 flex justify-between text-slate-400">
              <span>
                Tiempo IA: {routeResult.dynamic_route.time_min.toFixed(1)} min
              </span>
              <span>
                Distancia: {routeResult.dynamic_route.distance_km.toFixed(2)} km
              </span>
            </div>
          </div>
        )}

        {viewportStats && (
          <div className="flex items-center justify-between border-t border-slate-800/80 pt-2 text-[11px] text-slate-400">
            <span>Contexto inicial: Día Normal (14:00 hs · Despejado)</span>
            <span>Zoom {viewportStats.zoom}</span>
          </div>
        )}
      </div>

      {/* Benchmark & Machine Learning Audit Modal */}
      <BenchmarkModal
        isOpen={isBenchmarkOpen}
        onClose={() => setIsBenchmarkOpen(false)}
      />
    </div>
  );
};

export default App;
