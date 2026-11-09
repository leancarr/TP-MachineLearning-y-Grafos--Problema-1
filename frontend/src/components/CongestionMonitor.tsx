import React, { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Flame,
  Gauge,
  MapPin,
  TrendingUp,
} from "lucide-react";
import { CongestedCorridor, ContextParams } from "../types";
import { fetchTopCongested } from "../services/api";

export interface CongestionMonitorProps {
  context: ContextParams;
  onSelectCorridor?: (corridor: CongestedCorridor) => void;
  selectedCorridorName?: string | null;
}

export const CongestionMonitor: React.FC<CongestionMonitorProps> = ({
  context,
  onSelectCorridor,
  selectedCorridorName,
}) => {
  const [corridors, setCorridors] = useState<CongestedCorridor[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  useEffect(() => {
    let isCurrent = true;
    setLoading(true);

    fetchTopCongested(context)
      .then((res) => {
        if (isCurrent && res && res.corridors) {
          setCorridors(res.corridors);
        }
      })
      .catch((err) => {
        console.warn("Error cargando monitoreo de congestión:", err);
      })
      .finally(() => {
        if (isCurrent) setLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [context.hora_dia, context.dia_semana, context.clima, context.es_feriado]);

  // Mostrar top 3 en modo compacto, o top 10 al expandir
  const visibleCorridors = isExpanded ? corridors : corridors.slice(0, 3);

  const getSeverityBadge = (ratio: number, delayPct: number) => {
    if (ratio >= 2.0) {
      return (
        <span className="inline-flex items-center gap-1 rounded bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-bold text-rose-300">
          <Flame className="h-3 w-3 text-rose-400" />
          +{delayPct}%
        </span>
      );
    }
    if (ratio >= 1.4) {
      return (
        <span className="inline-flex items-center gap-1 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
          <AlertTriangle className="h-3 w-3 text-amber-400" />
          +{delayPct}%
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300">
        <TrendingUp className="h-3 w-3 text-emerald-400" />
        +{delayPct}%
      </span>
    );
  };

  const getProgressGradient = (ratio: number) => {
    if (ratio >= 2.0) return "from-amber-500 to-rose-500";
    if (ratio >= 1.4) return "from-emerald-500 to-amber-500";
    return "from-emerald-400 to-emerald-500";
  };

  return (
    <div
      data-testid="congestion-monitor"
      className="flex flex-col gap-2.5 rounded-2xl border border-slate-800 bg-slate-900/95 p-3.5 text-slate-200 shadow-2xl backdrop-blur-md"
    >
      {/* Header con Telemetría en Vivo */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-500/20 text-rose-400">
            <Activity className="h-4 w-4 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold tracking-tight text-white">
                Monitor Top Arterias Colapsadas
              </span>
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" />
              </span>
            </div>
            <p className="text-[10px] text-slate-400">
              Telemetría urbana en tiempo real según ML
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-950/60 px-2 py-1 text-[10px] font-medium text-slate-300 transition hover:border-slate-700 hover:text-white"
          title={isExpanded ? "Mostrar menos" : "Ver ranking completo"}
        >
          <span>{isExpanded ? "Top 3" : `Ver 10`}</span>
          {isExpanded ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
        </button>
      </div>

      {/* Lista de Arterias */}
      {loading && corridors.length === 0 ? (
        <div className="py-4 text-center text-xs text-slate-500 animate-pulse">
          Calculando cuellos de botella urbanos...
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {visibleCorridors.map((c, idx) => {
            const isSelected = selectedCorridorName === c.name;
            const progressPercent = Math.min(
              100,
              Math.max(15, Math.round(((c.congestion_ratio - 1.0) / 1.6) * 100))
            );

            return (
              <div
                key={c.name}
                onClick={() => onSelectCorridor?.(c)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    onSelectCorridor?.(c);
                  }
                }}
                data-testid={`corridor-item-${idx}`}
                className={`group relative flex flex-col gap-1 rounded-xl border p-2 text-left transition-all cursor-pointer ${
                  isSelected
                    ? "border-rose-500/70 bg-rose-500/15 shadow-sm"
                    : "border-slate-800/80 bg-slate-950/60 hover:border-slate-700 hover:bg-slate-800/50"
                }`}
                title={`Hacer clic para volar la cámara hacia ${c.name}`}
              >
                {/* Nombre de la calle, tipo y badge de demora */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded text-[10px] font-bold ${
                        idx === 0
                          ? "bg-amber-400 text-slate-950"
                          : idx === 1
                          ? "bg-slate-300 text-slate-950"
                          : idx === 2
                          ? "bg-amber-700 text-amber-100"
                          : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      {idx + 1}
                    </span>
                    <span className="truncate text-xs font-semibold text-slate-100 group-hover:text-emerald-300 transition-colors">
                      {c.name}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {getSeverityBadge(c.congestion_ratio, c.delay_pct)}
                    <MapPin className="h-3 w-3 text-slate-500 opacity-0 group-hover:opacity-100 group-hover:text-emerald-400 transition-opacity" />
                  </div>
                </div>

                {/* Telemetría: Velocidad actual vs nominal */}
                <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                  <span className="flex items-center gap-1">
                    <Gauge className="h-3 w-3 text-slate-500" />
                    <span className="font-semibold text-slate-200">
                      {c.average_speed_kmh} km/h
                    </span>
                    <span className="text-[10px] text-slate-500">
                      (nom. {c.nominal_speed_kmh} km/h)
                    </span>
                  </span>
                  <span className="text-[10px] text-slate-400">
                    Ratio {c.congestion_ratio.toFixed(2)}x
                  </span>
                </div>

                {/* Barra de Severidad con degradado */}
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${getProgressGradient(
                      c.congestion_ratio
                    )} transition-all duration-500`}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CongestionMonitor;
