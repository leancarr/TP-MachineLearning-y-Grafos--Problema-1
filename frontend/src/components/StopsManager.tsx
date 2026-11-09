import React from "react";
import {
  Plus,
  Trash2,
  Truck,
  RotateCcw,
  Navigation,
} from "lucide-react";
import { NodeInfo, TourResponse } from "../types";
import { SelectionMode } from "./MapViewer";

export interface StopsManagerProps {
  depot: NodeInfo | null;
  stops: NodeInfo[];
  selectionMode: SelectionMode;
  onSetSelectionMode: (mode: SelectionMode) => void;
  onRemoveStop: (index: number) => void;
  onClearStops: () => void;
  returnToDepot: boolean;
  onToggleReturnToDepot: () => void;
  onOptimizeTour: () => void;
  isCalculating: boolean;
  tourResult: TourResponse | null;
}

export const StopsManager: React.FC<StopsManagerProps> = ({
  depot,
  stops,
  selectionMode,
  onSetSelectionMode,
  onRemoveStop,
  onClearStops,
  returnToDepot,
  onToggleReturnToDepot,
  onOptimizeTour,
  isCalculating,
  tourResult,
}) => {
  const canOptimize = depot !== null && stops.length >= 1;

  return (
    <div
      data-testid="stops-manager"
      className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/95 p-4 text-slate-100 shadow-2xl backdrop-blur-md"
    >
      {/* Cabecera del Gestor */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400">
            <Truck className="h-4 w-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-white">
              Gestor de Entregas (TSP)
            </div>
            <div className="text-[10px] text-slate-400">
              {tourResult
                ? `Ruta encadenada (${tourResult.dynamic_tour.numbered_stops.length} paradas)`
                : "Heurística Voraz + Refinamiento 2-opt"}
            </div>
          </div>
        </div>

        {stops.length > 0 && (
          <button
            type="button"
            onClick={onClearStops}
            className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-rose-400 transition"
            title="Borrar todas las paradas"
            data-testid="clear-stops-btn"
          >
            <RotateCcw className="h-3 w-3" />
            <span>Limpiar</span>
          </button>
        )}
      </div>

      {/* Depósito Central */}
      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Depósito Central de Salida
        </span>
        <button
          type="button"
          onClick={() => onSetSelectionMode("depot")}
          data-testid="select-depot-btn"
          className={`flex items-center justify-between gap-2 rounded-xl border p-2.5 text-left text-xs transition ${
            selectionMode === "depot"
              ? "border-emerald-500 bg-emerald-500/15 text-emerald-200"
              : "border-slate-800 bg-slate-950/60 text-slate-300 hover:border-slate-700"
          }`}
        >
          <div className="flex items-center gap-2 truncate">
            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-slate-950">
              D
            </div>
            <div className="truncate font-medium">
              {depot ? depot.label : "Clic en el mapa para fijar depósito..."}
            </div>
          </div>
          <span className="text-[10px] text-slate-500">
            {selectionMode === "depot" ? "Seleccionando..." : "Modificar"}
          </span>
        </button>
      </div>

      {/* Lista de Paradas */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          <span>Paradas de Reparto ({stops.length}/10)</span>
          <button
            type="button"
            onClick={() => onSetSelectionMode("stop")}
            data-testid="add-stop-mode-btn"
            className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold transition ${
              selectionMode === "stop"
                ? "bg-emerald-500 text-slate-950"
                : "bg-slate-800 text-emerald-400 hover:bg-slate-700"
            }`}
          >
            <Plus className="h-3 w-3" />
            <span>{selectionMode === "stop" ? "Clic en mapa activo" : "Añadir Parada"}</span>
          </button>
        </div>

        {stops.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-800 p-4 text-center text-xs text-slate-500">
            Haz clic en "Añadir Parada" y toca el mapa para agregar puntos de entrega.
          </div>
        ) : (
          <div className="flex max-h-44 flex-col gap-1 overflow-y-auto pr-1">
            {stops.map((stop, idx) => (
              <div
                key={`${stop.id}-${idx}`}
                data-testid={`stop-item-${idx}`}
                className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/50 p-2 text-xs"
              >
                <div className="flex items-center gap-2 truncate">
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[10px] font-bold text-emerald-400">
                    {idx + 1}
                  </span>
                  <span className="truncate font-medium text-slate-300">
                    {stop.label}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onRemoveStop(idx)}
                  data-testid={`remove-stop-${idx}`}
                  className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-rose-400 transition"
                  title="Eliminar parada"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Switch de Regreso al Depósito */}
      <div className="flex items-center justify-between border-t border-slate-800/80 pt-2 text-xs">
        <span className="text-slate-300">Circuito cerrado (retorna al depósito)</span>
        <button
          type="button"
          onClick={onToggleReturnToDepot}
          data-testid="return-to-depot-toggle"
          className={`flex h-5 w-9 items-center rounded-full p-0.5 transition ${
            returnToDepot ? "bg-emerald-500" : "bg-slate-800"
          }`}
        >
          <div
            className={`h-4 w-4 rounded-full bg-white transition ${
              returnToDepot ? "translate-x-4" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      {/* Botón de Optimización TSP */}
      <button
        type="button"
        disabled={!canOptimize || isCalculating}
        onClick={onOptimizeTour}
        data-testid="optimize-tour-btn"
        className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition shadow-lg ${
          canOptimize && !isCalculating
            ? "bg-emerald-500 text-slate-950 hover:bg-emerald-400 cursor-pointer shadow-emerald-500/20"
            : "bg-slate-800 text-slate-500 cursor-not-allowed"
        }`}
      >
        <Navigation className={`h-4 w-4 ${isCalculating ? "animate-spin" : ""}`} />
        <span>
          {isCalculating
            ? "Calculando matrices y 2-opt..."
            : "Optimizar Ronda de Reparto"}
        </span>
      </button>
    </div>
  );
};

export default StopsManager;
