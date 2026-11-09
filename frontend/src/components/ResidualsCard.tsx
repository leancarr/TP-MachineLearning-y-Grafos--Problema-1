import React from "react";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { ModelBenchmarkItem } from "../types";

export interface ResidualsCardProps {
  modelName: string;
  modelData: ModelBenchmarkItem;
}

export const ResidualsCard: React.FC<ResidualsCardProps> = ({
  modelName,
  modelData,
}) => {
  const { residual_analysis: res, selected_for_production } = modelData;

  const isLowBias = Math.abs(res.mean_error) < 0.2;
  const isP95Under5 = res.p95_error_seg < 5.0;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900/70 p-4">
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
            Diagnóstico de Residuos
          </span>
          <span className="font-mono text-xs text-slate-400">({modelName})</span>
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
            selected_for_production
              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
              : "bg-slate-800 text-slate-400"
          }`}
        >
          {selected_for_production ? (
            <>
              <CheckCircle2 className="h-3 w-3 text-emerald-400" />
              <span>Modelo de Producción</span>
            </>
          ) : (
            <span>Benchmark Comparativo</span>
          )}
        </span>
      </div>

      {/* Grid de 4 Métricas de Residuos */}
      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <div className="rounded-lg bg-slate-950/70 p-2.5">
          <div className="text-[10px] uppercase tracking-wider text-slate-400">
            Media (Sesgo)
          </div>
          <div
            className={`font-mono text-sm font-bold ${
              isLowBias ? "text-emerald-400" : "text-amber-400"
            }`}
          >
            {res.mean_error > 0 ? `+${res.mean_error.toFixed(3)}` : res.mean_error.toFixed(3)} s
          </div>
          <div className="text-[10px] text-slate-500">
            {isLowBias ? "Sin sesgo sistemático" : "Sesgo residual leve"}
          </div>
        </div>

        <div className="rounded-lg bg-slate-950/70 p-2.5">
          <div className="text-[10px] uppercase tracking-wider text-slate-400">
            Desvío Estándar
          </div>
          <div className="font-mono text-sm font-bold text-slate-200">
            ±{res.std_error.toFixed(3)} s
          </div>
          <div className="text-[10px] text-slate-500">Dispersión del error</div>
        </div>

        <div className="rounded-lg bg-slate-950/70 p-2.5">
          <div className="text-[10px] uppercase tracking-wider text-slate-400">
            Mediana Error
          </div>
          <div className="font-mono text-sm font-bold text-slate-200">
            {res.median_error.toFixed(3)} s
          </div>
          <div className="text-[10px] text-slate-500">Residuo central 50%</div>
        </div>

        <div className="rounded-lg bg-slate-950/70 p-2.5">
          <div className="text-[10px] uppercase tracking-wider text-slate-400">
            Percentil 95 (P95)
          </div>
          <div
            className={`font-mono text-sm font-bold ${
              isP95Under5 ? "text-emerald-400" : "text-amber-400"
            }`}
          >
            {res.p95_error_seg.toFixed(2)} s
          </div>
          <div className="text-[10px] text-slate-500">95% de viajes con error &lt;</div>
        </div>
      </div>

      {/* Explicación Técnica Contextual */}
      <div className="flex items-start gap-2 rounded-lg bg-slate-950/50 p-2.5 text-[11px] text-slate-400">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-400" />
        <div>
          <span className="font-medium text-slate-300">
            Asimetría (Skewness: {res.skewness.toFixed(2)}):{" "}
          </span>
          La distribución de residuos está fuertemente centrada en 0 segundos,
          con una leve cola hacia la derecha provocada por eventos extremos de
          tormenta severa y congestión en hora pico (comportamiento esperado en
          tráfico urbano real).
        </div>
      </div>
    </div>
  );
};

export default ResidualsCard;
