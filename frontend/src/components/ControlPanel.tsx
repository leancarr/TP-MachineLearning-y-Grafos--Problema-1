import React from "react";
import {
  Clock,
  Cloud,
  CloudRain,
  CloudLightning,
  Sun,
  Calendar,
  Layers,
  Sparkles,
  Zap,
  Route,
  Truck,
  RotateCcw,
} from "lucide-react";
import {
  ClimaType,
  ContextParams,
  DiaSemanaType,
  ScenarioPreset,
} from "../types";

export interface ControlPanelProps {
  context: ContextParams;
  onContextChange: (newContext: ContextParams) => void;
  activePresetId: string | null;
  onApplyPreset: (preset: ScenarioPreset) => void;
  presets: ScenarioPreset[];
  presetsLoading?: boolean;
  appMode: "route" | "tour";
  onAppModeChange: (mode: "route" | "tour") => void;
  showTrafficLayer: boolean;
  onToggleTrafficLayer: () => void;
  showStaticRoute: boolean;
  onToggleStaticRoute: () => void;
  showDynamicRoute: boolean;
  onToggleDynamicRoute: () => void;
  isCalculating?: boolean;
  onResetPoints?: () => void;
}

const DIAS: { key: DiaSemanaType; label: string }[] = [
  { key: "lunes", label: "Lun" },
  { key: "martes", label: "Mar" },
  { key: "miercoles", label: "Mié" },
  { key: "jueves", label: "Jue" },
  { key: "viernes", label: "Vie" },
  { key: "sabado", label: "Sáb" },
  { key: "domingo", label: "Dom" },
];

const CLIMAS: { key: ClimaType; label: string; icon: React.ReactNode }[] = [
  { key: "despejado", label: "Despejado", icon: <Sun className="h-3.5 w-3.5 text-amber-400" /> },
  { key: "nublado", label: "Nublado", icon: <Cloud className="h-3.5 w-3.5 text-slate-300" /> },
  { key: "lluvia", label: "Lluvia", icon: <CloudRain className="h-3.5 w-3.5 text-sky-400" /> },
  { key: "tormenta", label: "Tormenta", icon: <CloudLightning className="h-3.5 w-3.5 text-purple-400" /> },
];

function formatTime(val: number): string {
  const hours = Math.floor(val);
  const minutes = Math.round((val - hours) * 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")} hs`;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  context,
  onContextChange,
  activePresetId,
  onApplyPreset,
  presets,
  presetsLoading,
  appMode,
  onAppModeChange,
  showTrafficLayer,
  onToggleTrafficLayer,
  showStaticRoute,
  onToggleStaticRoute,
  showDynamicRoute,
  onToggleDynamicRoute,
  isCalculating,
  onResetPoints,
}) => {
  const isRushHour =
    !context.es_feriado &&
    !["sabado", "domingo"].includes(context.dia_semana) &&
    ((context.hora_dia >= 7.5 && context.hora_dia <= 9.5) ||
      (context.hora_dia >= 17.5 && context.hora_dia <= 19.5));

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onContextChange({
      ...context,
      hora_dia: parseFloat(e.target.value),
    });
  };

  const handleDiaChange = (dia: DiaSemanaType) => {
    onContextChange({ ...context, dia_semana: dia });
  };

  const handleClimaChange = (clima: ClimaType) => {
    onContextChange({ ...context, clima });
  };

  const handleFeriadoToggle = () => {
    onContextChange({ ...context, es_feriado: !context.es_feriado });
  };

  return (
    <div
      data-testid="control-panel"
      className="flex flex-col gap-2.5 rounded-2xl border border-slate-800 bg-slate-900/95 p-3 text-slate-200 shadow-2xl backdrop-blur-md"
    >
      {/* Selector de Modo: Ruta vs Ronda TSP */}
      <div className="flex rounded-xl bg-slate-950/80 p-1 text-xs">
        <button
          type="button"
          onClick={() => onAppModeChange("route")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 font-medium transition ${
            appMode === "route"
              ? "bg-emerald-500 text-slate-950 shadow-md font-semibold"
              : "text-slate-400 hover:text-slate-200"
          }`}
          data-testid="mode-route-btn"
        >
          <Route className="h-3.5 w-3.5" />
          <span>Ruta A ➔ B</span>
        </button>
        <button
          type="button"
          onClick={() => onAppModeChange("tour")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 font-medium transition ${
            appMode === "tour"
              ? "bg-emerald-500 text-slate-950 shadow-md font-semibold"
              : "text-slate-400 hover:text-slate-200"
          }`}
          data-testid="mode-tour-btn"
        >
          <Truck className="h-3.5 w-3.5" />
          <span>Ronda TSP 2-opt</span>
        </button>
      </div>

      {/* Presets de 1 Clic */}
      <div>
        <div className="mb-1 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          <span className="flex items-center gap-1">
            <Sparkles className="h-3 w-3 text-amber-400" />
            <span>Escenarios Urbanos (1 Clic)</span>
          </span>
          {activePresetId && (
            <span className="text-[10px] text-emerald-400">Activo</span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {presetsLoading ? (
            <div className="col-span-2 py-2 text-center text-xs text-slate-500 animate-pulse">
              Cargando escenarios urbanos...
            </div>
          ) : (
            presets.map((preset) => {
              const isSelected = activePresetId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  disabled={isCalculating}
                  onClick={() => onApplyPreset(preset)}
                  data-testid={`preset-${preset.id}`}
                  className={`flex items-center gap-1.5 rounded-lg border p-1.5 text-left text-xs transition ${
                    isCalculating ? "opacity-60 cursor-not-allowed" : ""
                  } ${
                    isSelected
                      ? "border-emerald-500 bg-emerald-500/15 text-emerald-200 shadow-sm"
                      : "border-slate-800 bg-slate-950/60 text-slate-300 hover:border-slate-700 hover:bg-slate-800/60"
                  }`}
                  title={preset.description}
                >
                  <span className="text-sm shrink-0">{preset.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-semibold leading-tight text-slate-100">
                      {preset.name}
                    </div>
                    <div className="text-[10px] text-slate-400 leading-tight">
                      {preset.time_label}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Slider de Hora Continua */}
      <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-2.5">

        <div className="mb-2 flex items-center justify-between">
          <label
            htmlFor="hora-slider"
            className="flex items-center gap-1.5 text-xs font-medium text-slate-300"
          >
            <Clock className="h-3.5 w-3.5 text-emerald-400" />
            <span>Hora del Día</span>
          </label>
          <div className="flex items-center gap-1.5">
            {isRushHour && (
              <span className="flex items-center gap-1 rounded bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-bold text-rose-300">
                <Zap className="h-2.5 w-2.5 text-rose-400" />
                PICO
              </span>
            )}
            <span
              data-testid="time-display"
              className="font-mono text-sm font-bold text-emerald-400"
            >
              {formatTime(context.hora_dia)}
            </span>
          </div>
        </div>
        <input
          id="hora-slider"
          type="range"
          min="0"
          max="23.5"
          step="0.5"
          value={context.hora_dia}
          onChange={handleTimeChange}
          data-testid="time-slider"
          className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-800 accent-emerald-500 focus:outline-none"
        />
        <div className="mt-1 flex justify-between text-[10px] text-slate-500">
          <span>00:00 (Noche)</span>
          <span>08:00 (Pico)</span>
          <span>13:00 (Valle)</span>
          <span>18:30 (Pico)</span>
          <span>23:30</span>
        </div>
      </div>

      {/* Día de la Semana y Feriado */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            <Calendar className="h-3 w-3 text-slate-400" />
            <span>Día de Semana</span>
          </span>
          <button
            type="button"
            onClick={handleFeriadoToggle}
            data-testid="feriado-toggle"
            className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium transition ${
              context.es_feriado
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                : "bg-slate-800 text-slate-400 hover:text-slate-300"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                context.es_feriado ? "bg-amber-400 animate-pulse" : "bg-slate-600"
              }`}
            />
            <span>Feriado</span>
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {DIAS.map((dia) => {
            const isSelected = context.dia_semana === dia.key;
            return (
              <button
                key={dia.key}
                type="button"
                onClick={() => handleDiaChange(dia.key)}
                data-testid={`day-${dia.key}`}
                className={`rounded-lg py-1.5 text-center text-xs font-medium transition ${
                  isSelected
                    ? "bg-emerald-500 text-slate-950 font-bold shadow-sm"
                    : "bg-slate-950/60 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                }`}
              >
                {dia.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selector de Clima */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Condición Climática
        </span>
        <div className="grid grid-cols-4 gap-1.5">
          {CLIMAS.map((clima) => {
            const isSelected = context.clima === clima.key;
            return (
              <button
                key={clima.key}
                type="button"
                onClick={() => handleClimaChange(clima.key)}
                data-testid={`clima-${clima.key}`}
                className={`flex flex-col items-center gap-1 rounded-lg border p-1.5 text-center text-[11px] font-medium transition ${
                  isSelected
                    ? "border-emerald-500 bg-emerald-500/15 text-emerald-200 shadow-sm"
                    : "border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                }`}
              >
                {clima.icon}
                <span>{clima.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Toggles de Visualización y Trazado Dual */}
      <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-2.5">
        <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          <span className="flex items-center gap-1">
            <Layers className="h-3 w-3 text-emerald-400" />
            <span>Capas & Trazado Dual</span>
          </span>
          {onResetPoints && (
            <button
              type="button"
              onClick={onResetPoints}
              className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-rose-400 transition"
              title="Limpiar puntos y rutas del mapa"
            >
              <RotateCcw className="h-2.5 w-2.5" />
              <span>Limpiar</span>
            </button>
          )}
        </div>
        <div className="grid grid-cols-3 gap-1.5 text-[11px]">
          <button
            type="button"
            onClick={onToggleTrafficLayer}
            data-testid="toggle-traffic-layer"
            className={`flex items-center justify-center gap-1 rounded-lg border py-1.5 transition ${
              showTrafficLayer
                ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300 font-medium"
                : "border-slate-800 bg-slate-900 text-slate-500"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                showTrafficLayer ? "bg-emerald-400" : "bg-slate-600"
              }`}
            />
            <span>Tráfico</span>
          </button>

          <button
            type="button"
            onClick={onToggleDynamicRoute}
            data-testid="toggle-dynamic-route"
            className={`flex items-center justify-center gap-1 rounded-lg border py-1.5 transition ${
              showDynamicRoute
                ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300 font-medium"
                : "border-slate-800 bg-slate-900 text-slate-500"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                showDynamicRoute ? "bg-emerald-400" : "bg-slate-600"
              }`}
            />
            <span>Ruta IA</span>
          </button>

          <button
            type="button"
            onClick={onToggleStaticRoute}
            data-testid="toggle-static-route"
            className={`flex items-center justify-center gap-1 rounded-lg border py-1.5 transition ${
              showStaticRoute
                ? "border-blue-500/40 bg-blue-500/15 text-blue-300 font-medium"
                : "border-slate-800 bg-slate-900 text-slate-500"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                showStaticRoute ? "bg-blue-400" : "bg-slate-600"
              }`}
            />
            <span>Ruta Metros</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ControlPanel;
