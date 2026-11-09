import React, { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, MapPin, Navigation, Search, X } from "lucide-react";
import { NodeInfo } from "../types";
import { searchCorners } from "../services/api";

export interface StreetSearchProps {
  onSelectCorner: (node: NodeInfo, mode: "origin" | "destination") => void;
  onFlyTo?: (coords: { lat: number; lon: number; zoom?: number }) => void;
  activeStopNumber?: number;
  className?: string;
}

export const StreetSearch: React.FC<StreetSearchProps> = React.memo(({
  onSelectCorner,
  onFlyTo,
  activeStopNumber,
  className = "",
}) => {
  const [query, setQuery] = useState<string>("");
  const [results, setResults] = useState<NodeInfo[]>([]);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<number | null>(null);

  // Cerrar dropdown al hacer clic afuera
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Búsqueda con debounce de 250ms
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setIsOpen(false);
      setLoading(false);
      return;
    }

    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
    }

    setLoading(true);
    debounceTimerRef.current = window.setTimeout(async () => {
      try {
        const hits = await searchCorners(trimmed, 8);
        setResults(hits);
        setIsOpen(hits.length > 0);
      } catch (err) {
        console.warn("Error en autocompletado de esquinas:", err);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => {
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
      }
    };
  }, [query]);

  const handleClear = useCallback(() => {
    setQuery("");
    setResults([]);
    setIsOpen(false);
  }, []);

  const handleChoose = useCallback(
    (node: NodeInfo, mode: "origin" | "destination") => {
      onSelectCorner(node, mode);
      onFlyTo?.({ lat: node.lat, lon: node.lon, zoom: 15 });
      setIsOpen(false);
      setQuery("");
    },
    [onSelectCorner, onFlyTo]
  );

  return (
    <div
      ref={containerRef}
      className={`relative w-full ${className}`}
      data-testid="street-search"
    >
      <div className="relative flex items-center">
        <Search className="pointer-events-none absolute left-3 h-4 w-4 text-slate-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (results.length > 0) setIsOpen(true);
          }}
          placeholder="Buscar esquina (ej: Pellegrini, Terminal, Monumento)..."
          className="h-9 w-full rounded-xl border border-slate-800 bg-slate-950/80 pl-9 pr-8 text-xs text-slate-200 placeholder-slate-500 shadow-inner transition focus:border-emerald-500/80 focus:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
          data-testid="street-search-input"
        />
        {loading ? (
          <Loader2 className="absolute right-2.5 h-3.5 w-3.5 animate-spin text-slate-400" />
        ) : query.length > 0 ? (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2.5 rounded p-0.5 text-slate-400 hover:text-white"
            title="Borrar búsqueda"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      {/* Dropdown de Autocompletado (siempre por encima de las tarjetas inferiores) */}
      {isOpen && results.length > 0 && (
        <div
          data-testid="search-results-dropdown"
          className="absolute left-0 right-0 top-full z-[999] mt-1.5 max-h-60 overflow-y-auto rounded-xl border border-cyan-500/40 bg-slate-950 p-1.5 shadow-[0_20px_50px_rgba(0,0,0,0.95)]"
        >
          <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-cyan-400">
            Esquinas encontradas ({results.length})
          </div>
          <div className="flex flex-col gap-1">
            {results.map((node) => (
              <div
                key={node.id}
                onClick={() => handleChoose(node, "origin")}
                className="group flex cursor-pointer items-center justify-between gap-2 rounded-lg p-2 text-left transition hover:bg-slate-800/90"
              >
                <div className="flex flex-1 items-center gap-2 min-w-0">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-cyan-400 transition" />
                  <span className="truncate text-xs font-medium text-slate-100 group-hover:text-white">
                    {node.label}
                  </span>
                </div>

                {activeStopNumber !== undefined ? (
                  <span className="shrink-0 rounded-md bg-cyan-500/20 px-2 py-0.5 text-[10px] font-bold text-cyan-300 group-hover:bg-cyan-500 group-hover:text-slate-950 transition">
                    Parada #{activeStopNumber}
                  </span>
                ) : (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleChoose(node, "origin");
                      }}
                      className="inline-flex items-center gap-1 rounded bg-emerald-500/20 px-2 py-1 text-[10px] font-semibold text-emerald-300 transition hover:bg-emerald-500 hover:text-slate-950"
                      title="Fijar como punto de Origen"
                    >
                      <Navigation className="h-2.5 w-2.5" />
                      <span>Origen</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleChoose(node, "destination");
                      }}
                      className="inline-flex items-center gap-1 rounded bg-rose-500/20 px-2 py-1 text-[10px] font-semibold text-rose-300 transition hover:bg-rose-500 hover:text-white"
                      title="Fijar como punto de Destino"
                    >
                      <MapPin className="h-2.5 w-2.5" />
                      <span>Destino</span>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

export default StreetSearch;
