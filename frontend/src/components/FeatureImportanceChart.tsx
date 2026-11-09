import React from "react";
import { FeatureImportanceItem } from "../types";

export interface FeatureImportanceChartProps {
  features: FeatureImportanceItem[];
  limit?: number;
}

const FEATURE_LABELS: Record<string, string> = {
  longitud_m: "Longitud del tramo (m)",
  clima_tormenta: "Clima: Tormenta severa",
  hora_dia: "Hora del día (bimodalidad)",
  clima_lluvia: "Clima: Lluvia / calzada húmeda",
  velocidad_promedio_historica: "Velocidad promedio histórica",
  tipo_calle_circunvalacion: "Tipo: Circunvalación",
  tipo_calle_comercial: "Tipo: Calle comercial céntrica",
  tipo_calle_residencial: "Tipo: Calle residencial",
  tipo_calle_avenida: "Tipo: Avenida semaforizada",
  dia_semana_sabado: "Día: Sábado",
  dia_semana_domingo: "Día: Domingo",
  jerarquia_osm: "Jerarquía de red OSM",
  es_feriado: "Es día feriado nacional",
};

export const FeatureImportanceChart: React.FC<FeatureImportanceChartProps> = ({
  features,
  limit = 8,
}) => {
  if (!features || features.length === 0) {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 text-center text-xs text-slate-400">
        No hay datos de importancia de variables disponibles.
      </div>
    );
  }

  const sorted = [...features]
    .sort((a, b) => b.importance_pct - a.importance_pct)
    .slice(0, limit);

  const maxPct = Math.max(...sorted.map((f) => f.importance_pct), 1);

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span className="font-medium text-slate-300">Variable / Característica</span>
        <span>Peso Relativo (%)</span>
      </div>

      <div className="flex flex-col gap-2">
        {sorted.map((item, idx) => {
          const friendlyLabel = FEATURE_LABELS[item.feature] || item.feature;
          const barWidth = `${Math.min(100, Math.max(3, (item.importance_pct / maxPct) * 100))}%`;

          const barColorClass =
            idx === 0
              ? "bg-emerald-500"
              : idx < 3
              ? "bg-cyan-500"
              : idx < 5
              ? "bg-blue-500"
              : "bg-slate-500";

          return (
            <div key={item.feature} className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-xs">
                <span className="truncate text-slate-300" title={item.feature}>
                  {friendlyLabel}
                </span>
                <span className="font-mono text-[11px] font-semibold text-slate-200">
                  {item.importance_pct.toFixed(2)}%
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${barColorClass}`}
                  style={{ width: barWidth }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default FeatureImportanceChart;
