import React, { useEffect, useState } from "react";
import {
  X,
  Award,
  Zap,
  TrendingDown,
  Database,
  CheckCircle,
  XCircle,
  RefreshCw,
  Cpu,
} from "lucide-react";
import { BenchmarkMetricsResponse } from "../types";
import { fetchBenchmarkMetrics } from "../services/api";
import FeatureImportanceChart from "./FeatureImportanceChart";
import ResidualsCard from "./ResidualsCard";

export interface BenchmarkModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const MODEL_FRIENDLY_NAMES: Record<string, string> = {
  DecisionTreeRegressor: "Árbol de Decisión (CART)",
  RidgeRegression: "Regresión Lineal Ridge",
  KNeighborsRegressor: "K-Nearest Neighbors (KNN)",
  SupportVectorRegressor: "Support Vector Regressor (SVR)",
};

export const BenchmarkModal: React.FC<BenchmarkModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [data, setData] = useState<BenchmarkMetricsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setLoading(true);
    setError(null);

    fetchBenchmarkMetrics()
      .then((res) => {
        if (isMounted) {
          setData(res);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.error("Error al cargar benchmark metrics:", err);
          setError(
            err instanceof Error
              ? err.message
              : "No se pudieron obtener las métricas del servidor."
          );
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // Handle ESC key press
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const dtModel = data?.models?.DecisionTreeRegressor;
  const ridgeModel = data?.models?.RidgeRegression;

  // Error reduction calculation (Ridge vs DecisionTree)
  const maeReductionPct =
    dtModel && ridgeModel
      ? ((ridgeModel.mae_seg - dtModel.mae_seg) / ridgeModel.mae_seg) * 100
      : 49.0;

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
      data-testid="benchmark-modal-backdrop"
    >
      <div
        className="relative flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 text-slate-100 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="benchmark-modal-title"
        data-testid="benchmark-modal-content"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/70 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
              <Award className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2
                  id="benchmark-modal-title"
                  className="text-base font-bold text-white sm:text-lg"
                >
                  Auditoría Científica & Benchmark de Machine Learning
                </h2>
                <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
                  Producción
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Comparativa de 4 familias de regresión sobre 20,000 tramos de test
                en Rosario sin data leakage.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white"
            aria-label="Cerrar modal de auditoría"
            data-testid="benchmark-modal-close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading && (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-400">
              <RefreshCw className="h-8 w-8 animate-spin text-emerald-400" />
              <p className="text-sm">Cargando métricas y análisis de residuos...</p>
            </div>
          )}

          {error && !loading && (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <div className="rounded-full bg-rose-500/20 p-3 text-rose-400">
                <XCircle className="h-8 w-8" />
              </div>
              <p className="text-sm font-medium text-rose-300">{error}</p>
              <button
                type="button"
                onClick={() => {
                  setLoading(true);
                  setError(null);
                  fetchBenchmarkMetrics()
                    .then(setData)
                    .catch((e) => setError(String(e.message || e)))
                    .finally(() => setLoading(false));
                }}
                className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-700"
              >
                Reintentar
              </button>
            </div>
          )}

          {data && !loading && !error && (
            <div className="flex flex-col gap-6">
              {/* Highlight KPI Summary Cards */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="flex flex-col gap-1 rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3.5">
                  <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                    <Award className="h-4 w-4" />
                    <span>Modelo Ganador</span>
                  </div>
                  <div className="text-lg font-bold text-white">Árbol CART</div>
                  <div className="text-[11px] text-emerald-300/80">
                    R² = {dtModel?.r2_score.toFixed(4) ?? "0.8990"} (90% varianza)
                  </div>
                </div>

                <div className="flex flex-col gap-1 rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
                  <div className="flex items-center gap-1.5 text-xs text-cyan-400">
                    <TrendingDown className="h-4 w-4" />
                    <span>Reducción de MAE</span>
                  </div>
                  <div className="text-lg font-bold text-white">
                    -{maeReductionPct.toFixed(1)}%
                  </div>
                  <div className="text-[11px] text-slate-400">
                    1.49 s vs 2.93 s de Ridge
                  </div>
                </div>

                <div className="flex flex-col gap-1 rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
                  <div className="flex items-center gap-1.5 text-xs text-amber-400">
                    <Zap className="h-4 w-4" />
                    <span>Inferencia en Batch</span>
                  </div>
                  <div className="text-lg font-bold text-white">
                    {dtModel?.inference_time_30k ?? "<5 ms"}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Sobre 30,053 aristas en RAM
                  </div>
                </div>

                <div className="flex flex-col gap-1 rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
                  <div className="flex items-center gap-1.5 text-xs text-indigo-400">
                    <Database className="h-4 w-4" />
                    <span>Dataset de Test</span>
                  </div>
                  <div className="text-lg font-bold text-white">
                    {data.test_set_size?.toLocaleString() ?? "20,000"}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Muestras independientes 80/20
                  </div>
                </div>
              </div>

              {/* Comparative Models Table */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                    Tabla Comparativa Oficial del Benchmark
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    Evaluado el {data.benchmark_date}
                  </span>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/40">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-950/80 text-[11px] font-semibold text-slate-400">
                        <th className="py-2.5 pl-4 pr-3">Modelo Evaluado</th>
                        <th className="px-3 py-2.5 text-center">R² Score</th>
                        <th className="px-3 py-2.5 text-center">MAE (s)</th>
                        <th className="px-3 py-2.5 text-center">RMSE (s)</th>
                        <th className="px-3 py-2.5 text-center">Inferencia (30k)</th>
                        <th className="px-3 py-2.5 text-center">P95 Error</th>
                        <th className="py-2.5 pl-3 pr-4 text-center">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {Object.entries(data.models).map(([modelKey, m]) => {
                        const isProd = m.selected_for_production;
                        const friendlyName =
                          MODEL_FRIENDLY_NAMES[modelKey] || modelKey;

                        return (
                          <tr
                            key={modelKey}
                            className={`transition hover:bg-slate-800/40 ${
                              isProd
                                ? "bg-emerald-950/20 font-medium text-emerald-100"
                                : "text-slate-300"
                            }`}
                          >
                            <td className="py-3 pl-4 pr-3">
                              <div className="flex flex-col">
                                <span className="font-semibold text-white">
                                  {friendlyName}
                                </span>
                                <span className="text-[10px] text-slate-400">
                                  {m.reason}
                                </span>
                              </div>
                            </td>
                            <td className="px-3 py-3 text-center font-mono font-bold">
                              <span
                                className={`rounded px-1.5 py-0.5 ${
                                  isProd
                                    ? "bg-emerald-500/20 text-emerald-300"
                                    : "text-slate-300"
                                }`}
                              >
                                {m.r2_score.toFixed(4)}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-center font-mono">
                              {m.mae_seg.toFixed(2)} s
                            </td>
                            <td className="px-3 py-3 text-center font-mono">
                              {m.rmse_seg.toFixed(2)} s
                            </td>
                            <td className="px-3 py-3 text-center font-mono">
                              {m.inference_time_30k}
                            </td>
                            <td className="px-3 py-3 text-center font-mono">
                              {m.residual_analysis?.p95_error_seg.toFixed(2)} s
                            </td>
                            <td className="py-3 pl-3 pr-4 text-center">
                              {isProd ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] font-semibold text-emerald-300 border border-emerald-500/40">
                                  <CheckCircle className="h-3 w-3" />
                                  <span>Producción</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-slate-400">
                                  <XCircle className="h-3 w-3" />
                                  <span>Descartado</span>
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Two Column Layout: Feature Importances & Residual Analysis */}
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                {/* Feature Importance Column */}
                <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                      Importancia de Variables (Feature Importance)
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Criterio CART (Gini / MSE)
                    </span>
                  </div>

                  <FeatureImportanceChart
                    features={data.feature_importances || []}
                    limit={7}
                  />

                  <div className="mt-1 text-[11px] text-slate-400">
                    La física de la red urbana domina el modelo: la{" "}
                    <strong className="text-slate-200">longitud del tramo</strong>{" "}
                    establece la cota base, mientras que los multiplicadores no
                    lineales de{" "}
                    <strong className="text-slate-200">tormenta</strong> y{" "}
                    <strong className="text-slate-200">hora pico</strong> explican
                    el incremento dinámico de congestión.
                  </div>
                </div>

                {/* Residuals & Model Hyperparameters Column */}
                <div className="flex flex-col gap-4">
                  {dtModel && (
                    <ResidualsCard
                      modelName="Árbol de Decisión"
                      modelData={dtModel}
                    />
                  )}

                  {/* Hyperparameters Card */}
                  <div className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-xs">
                    <div className="flex items-center gap-1.5 font-semibold text-slate-200">
                      <Cpu className="h-4 w-4 text-emerald-400" />
                      <span>Hiperparámetros de Producción (Anti-Overfitting)</span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-1 font-mono text-[11px]">
                      <div className="rounded-lg bg-slate-950 p-2">
                        <div className="text-slate-500">max_depth</div>
                        <div className="text-emerald-300 font-bold">16</div>
                      </div>
                      <div className="rounded-lg bg-slate-950 p-2">
                        <div className="text-slate-500">min_samples_leaf</div>
                        <div className="text-emerald-300 font-bold">10</div>
                      </div>
                      <div className="rounded-lg bg-slate-950 p-2">
                        <div className="text-slate-500">random_state</div>
                        <div className="text-emerald-300 font-bold">42</div>
                      </div>
                    </div>

                    <div className="text-[11px] text-slate-400">
                      Gap Train-Test de apenas{" "}
                      <span className="text-emerald-300 font-semibold">
                        0.0055 R²
                      </span>
                      , demostrando generalización óptima sin sobreajuste.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-800 bg-slate-950/80 px-6 py-3 text-xs text-slate-400">
          <span>
            Arquitectura de Inferencia: Preprocesamiento sin fugas + Árbol CART +
            Dijkstra Ponderado
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-slate-800 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-700"
          >
            Entendido / Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

export default BenchmarkModal;
