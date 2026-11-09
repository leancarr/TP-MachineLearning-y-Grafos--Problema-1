import React from "react";
import {
  TrendingDown,
  Sparkles,
  Zap,
  CheckCircle2,
  AlertCircle,
  Truck,
  RotateCcw,
} from "lucide-react";
import { RouteResponse, TourResponse } from "../types";

export interface MetricsCardProps {
  routeResult: RouteResponse | null;
  tourResult: TourResponse | null;
  appMode: "route" | "tour";
  isCalculating?: boolean;
  onClear?: () => void;
}

export const MetricsCard: React.FC<MetricsCardProps> = React.memo(({
  routeResult,
  tourResult,
  appMode,
  isCalculating,
  onClear,
}) => {
  if (isCalculating && !routeResult && !tourResult) {
    return (
      <div
        data-testid="metrics-card-loading"
        className="flex items-center gap-2.5 rounded-2xl border border-cyan-500/30 bg-slate-900 p-4 text-xs text-cyan-300 shadow-2xl"
      >
        <Zap className="h-4 w-4 animate-spin text-cyan-400" />
        <span className="font-medium">
          Dijkstra artesanal evaluando pesos dinámicos en tiempo real...
        </span>
      </div>
    );
  }

  // Modo Ruta Punto a Punto
  if (appMode === "route" && routeResult) {
    const { comparison, dynamic_route, static_route, origin, destination } =
      routeResult;
    const isFaster = comparison.time_saved_sec > 1.0;
    const distanceDiffM = comparison.distance_diff_m;

    return (
      <div
        data-testid="metrics-card"
        className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/95 p-4 text-slate-100 shadow-2xl backdrop-blur-md"
      >
        {/* Cabecera y KPI de Ahorro */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-white">
                Ruta Optimizada por IA
              </div>
              <div className="text-[10px] text-slate-400">
                {origin.label.split(" y ")[0]} ➔ {destination.label.split(" y ")[0]}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {isFaster ? (
              <div
                data-testid="time-saved-badge"
                className="flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-3 py-1 text-right"
              >
                <TrendingDown className="h-4 w-4 text-emerald-400" />
                <div>
                  <div className="font-mono text-sm font-extrabold text-emerald-300">
                    -{comparison.time_saved_min.toFixed(1)} min
                  </div>
                  <div className="text-[9px] font-semibold text-emerald-400/90">
                    {comparison.time_saved_pct.toFixed(1)}% más rápida
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-700 bg-slate-800/60 px-2.5 py-1 text-[11px] font-medium text-slate-300">
                Rutas coincidentes
              </div>
            )}
            {onClear && (
              <button
                type="button"
                onClick={onClear}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-rose-400 transition"
                title="Limpiar trazado"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Comparativa Cara a Cara */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          {/* Ruta Dinámica ML */}
          <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/20 p-2.5">
            <div className="flex items-center gap-1.5 font-semibold text-cyan-300">
              <span className="h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_6px_#00f0ff]" />
              <span>Ruta Dinámica (IA)</span>
            </div>
            <div className="mt-1.5 flex items-baseline gap-1">
              <span className="font-mono text-lg font-black text-white">
                {dynamic_route.time_min.toFixed(1)}
              </span>
              <span className="text-xs text-slate-400">min</span>
            </div>
            <div className="mt-1 flex justify-between text-[11px] text-slate-400">
              <span>{dynamic_route.distance_km.toFixed(2)} km</span>
              <span>{dynamic_route.execution_time_ms.toFixed(1)} ms</span>
            </div>
          </div>

          {/* Ruta Estática (Distancia) */}
          <div className="rounded-xl border border-purple-500/30 bg-purple-950/20 p-2.5">
            <div className="flex items-center gap-1.5 font-semibold text-purple-300">
              <span className="h-2 w-2 rounded-full bg-purple-400 shadow-sm" />
              <span>Ruta Estática (Metros)</span>
            </div>
            <div className="mt-1.5 flex items-baseline gap-1">
              <span className="font-mono text-lg font-black text-white">
                {static_route.time_min.toFixed(1)}
              </span>
              <span className="text-xs text-slate-400">min</span>
            </div>
            <div className="mt-1 flex justify-between text-[11px] text-slate-400">
              <span>{static_route.distance_km.toFixed(2)} km</span>
              <span>{static_route.execution_time_ms.toFixed(1)} ms</span>
            </div>
          </div>
        </div>

        {/* Explicación Causal de la Decisión */}
        <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-2.5 text-[11px] text-slate-300">
          {isFaster ? (
            <div className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
              <p>
                <strong className="text-emerald-300">Desvío inteligente:</strong>{" "}
                La IA evitó tramos colapsados recorriendo{" "}
                {Math.abs(distanceDiffM).toFixed(0)} m más en distancia física, pero
                ahorrando{" "}
                <strong>{comparison.time_saved_min.toFixed(1)} minutos</strong> en
                tiempo real.
              </p>
            </div>
          ) : (
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
              <p>
                En condiciones de baja congestión, el camino más corto en metros es
                también el óptimo en tiempo.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Modo Ronda de Entregas TSP
  if (appMode === "tour" && tourResult) {
    const { dynamic_tour, static_tour, time_saved_min, time_saved_pct } =
      tourResult;
    const isFaster = time_saved_min > 0.1;

    return (
      <div
        data-testid="metrics-card-tour"
        className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/95 p-4 text-slate-100 shadow-2xl backdrop-blur-md"
      >
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400">
              <Truck className="h-4 w-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-white">
                Ronda TSP Optimizada (2-opt)
              </div>
              <div className="text-[10px] text-slate-400">
                {dynamic_tour.numbered_stops.length} paradas encadenadas
              </div>
            </div>
          </div>

          {isFaster && (
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-2.5 py-1 text-right">
              <div className="font-mono text-xs font-bold text-emerald-300">
                -{time_saved_min.toFixed(1)} min
              </div>
              <div className="text-[9px] text-emerald-400">
                {time_saved_pct.toFixed(1)}% ahorro
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-2.5">
            <div className="text-[11px] font-semibold text-emerald-300">
              Tour Dinámico IA
            </div>
            <div className="mt-1 font-mono text-base font-bold text-white">
              {dynamic_tour.total_time_min.toFixed(1)} min
            </div>
            <div className="text-[10px] text-slate-400">
              {dynamic_tour.total_distance_km.toFixed(2)} km
            </div>
          </div>

          <div className="rounded-xl border border-blue-500/30 bg-blue-950/20 p-2.5">
            <div className="text-[11px] font-semibold text-blue-300">
              Tour Estático
            </div>
            <div className="mt-1 font-mono text-base font-bold text-white">
              {static_tour.total_time_min.toFixed(1)} min
            </div>
            <div className="text-[10px] text-slate-400">
              {static_tour.total_distance_km.toFixed(2)} km
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
});

export default MetricsCard;
