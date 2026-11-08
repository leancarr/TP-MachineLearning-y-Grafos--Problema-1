import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import {
  ContextParams,
  NodeInfo,
  RouteResponse,
  TourResponse,
  ViewportEdge,
  ViewportResponse,
} from "../types";
import { fetchNearestNode, fetchViewportEdges } from "../services/api";

export type SelectionMode = "origin" | "destination" | "depot" | "stop" | null;

export interface ViewportStats {
  totalEdges: number;
  maxHierarchyVisible: number;
  executionTimeMs: number;
  zoom: number;
  loading: boolean;
}

export interface MapViewerProps {
  context: ContextParams;
  origin?: NodeInfo | null;
  destination?: NodeInfo | null;
  depot?: NodeInfo | null;
  stops?: NodeInfo[];
  routeResult?: RouteResponse | null;
  tourResult?: TourResponse | null;
  selectionMode?: SelectionMode;
  showTrafficLayer?: boolean;
  showStaticRoute?: boolean;
  showDynamicRoute?: boolean;
  onNodeSelected?: (node: NodeInfo, mode: SelectionMode) => void;
  onViewportStatsChange?: (stats: ViewportStats) => void;
}

const ROSARIO_CENTER: [number, number] = [-32.9468, -60.6393];
const DEFAULT_ZOOM = 13;

export function getEdgeWeightByHierarchy(jerarquia: number, zoom: number): number {
  const zoomScale = zoom >= 15 ? 1.35 : zoom >= 14 ? 1.15 : 1.0;
  if (jerarquia === 1) return 3.2 * zoomScale;
  if (jerarquia === 2) return 2.2 * zoomScale;
  return 1.4 * zoomScale;
}

export function getLodBadgeLabel(zoom: number): string {
  if (zoom <= 12) return "LOD Macro · Arterias Primarias";
  if (zoom <= 14) return "LOD Medio · Primarias + Secundarias";
  return "LOD Detallado · Red Completa de Calles";
}

interface ViewportControllerProps {
  context: ContextParams;
  showTrafficLayer: boolean;
  selectionMode: SelectionMode;
  onEdgesLoaded: (resp: ViewportResponse, zoom: number) => void;
  onLoadingChange: (loading: boolean, zoom: number) => void;
  onMapClickNode: (lat: number, lon: number) => void;
}

const ViewportController: React.FC<ViewportControllerProps> = ({
  context,
  showTrafficLayer,
  selectionMode,
  onEdgesLoaded,
  onLoadingChange,
  onMapClickNode,
}) => {
  const map = useMap();
  const debounceTimerRef = useRef<number | null>(null);
  const requestCounterRef = useRef<number>(0);

  const triggerViewportFetch = useCallback(() => {
    if (!showTrafficLayer) return;

    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = window.setTimeout(async () => {
      const currentZoom = Math.round(map.getZoom());
      onLoadingChange(true, currentZoom);
      const reqId = ++requestCounterRef.current;
      const bounds = map.getBounds();
      const zoom = Math.round(map.getZoom());

      try {
        const resp = await fetchViewportEdges({
          min_lat: bounds.getSouth(),
          min_lon: bounds.getWest(),
          max_lat: bounds.getNorth(),
          max_lon: bounds.getEast(),
          zoom,
          max_edges: zoom >= 15 ? 4000 : zoom >= 13 ? 3000 : 2500,
          hora_dia: context.hora_dia,
          dia_semana: context.dia_semana,
          clima: context.clima,
          es_feriado: context.es_feriado,
        });
        if (reqId === requestCounterRef.current) {
          onEdgesLoaded(resp, zoom);
        }
      } catch (err) {
        console.error("Error cargando viewport de Rosario:", err);
        if (reqId === requestCounterRef.current) {
          onLoadingChange(false, zoom);
        }
      }
    }, 250);
  }, [map, context, showTrafficLayer, onEdgesLoaded, onLoadingChange]);

  // Initial load & re-fetch whenever traffic context or layer visibility changes
  useEffect(() => {
    triggerViewportFetch();
    return () => {
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
      }
    };
  }, [
    context.hora_dia,
    context.dia_semana,
    context.clima,
    context.es_feriado,
    showTrafficLayer,
    triggerViewportFetch,
  ]);

  useMapEvents({
    moveend: () => {
      triggerViewportFetch();
    },
    zoomend: () => {
      triggerViewportFetch();
    },
    click: (e) => {
      if (selectionMode) {
        onMapClickNode(e.latlng.lat, e.latlng.lng);
      }
    },
  });

  return null;
};

export const MapViewer: React.FC<MapViewerProps> = ({
  context,
  origin = null,
  destination = null,
  depot = null,
  stops = [],
  routeResult = null,
  tourResult = null,
  selectionMode = "origin",
  showTrafficLayer = true,
  showStaticRoute = true,
  showDynamicRoute = true,
  onNodeSelected,
  onViewportStatsChange,
}) => {
  const [edges, setEdges] = useState<ViewportEdge[]>([]);
  const [zoom, setZoom] = useState<number>(DEFAULT_ZOOM);
  const [loading, setLoading] = useState<boolean>(false);
  const [snapping, setSnapping] = useState<boolean>(false);
  const [stats, setStats] = useState<ViewportStats>({
    totalEdges: 0,
    maxHierarchyVisible: 2,
    executionTimeMs: 0,
    zoom: DEFAULT_ZOOM,
    loading: false,
  });

  // Shared Leaflet Canvas renderer for high-performance rendering of thousands of streets
  const canvasRenderer = useMemo(() => L.canvas({ padding: 0.5 }), []);

  const handleLoadingChange = useCallback(
    (isLoading: boolean, currentZoom: number) => {
      setLoading(isLoading);
      setZoom(currentZoom);
      setStats((prev) => {
        const next = { ...prev, loading: isLoading, zoom: currentZoom };
        onViewportStatsChange?.(next);
        return next;
      });
    },
    [onViewportStatsChange]
  );

  const handleEdgesLoaded = useCallback(
    (resp: ViewportResponse, currentZoom: number) => {
      setEdges(resp.edges);
      setZoom(currentZoom);
      setLoading(false);
      const nextStats: ViewportStats = {
        totalEdges: resp.total_edges,
        maxHierarchyVisible: resp.max_hierarchy_visible,
        executionTimeMs: resp.execution_time_ms,
        zoom: currentZoom,
        loading: false,
      };
      setStats(nextStats);
      onViewportStatsChange?.(nextStats);
    },
    [onViewportStatsChange]
  );

  const handleMapClickNode = useCallback(
    async (lat: number, lon: number) => {
      if (!selectionMode || !onNodeSelected) return;
      setSnapping(true);
      try {
        const nearest = await fetchNearestNode(lat, lon);
        onNodeSelected(nearest, selectionMode);
      } catch (err) {
        console.error("Error haciendo snap a esquina más cercana:", err);
      } finally {
        setSnapping(false);
      }
    },
    [selectionMode, onNodeSelected]
  );

  const staticRoutePositions = useMemo<[number, number][]>(() => {
    if (tourResult && showStaticRoute) {
      return tourResult.static_tour.coordinates;
    }
    if (routeResult && showStaticRoute) {
      return routeResult.static_route.coordinates;
    }
    return [];
  }, [routeResult, tourResult, showStaticRoute]);

  const dynamicRoutePositions = useMemo<[number, number][]>(() => {
    if (tourResult && showDynamicRoute) {
      return tourResult.dynamic_tour.coordinates;
    }
    if (routeResult && showDynamicRoute) {
      return routeResult.dynamic_route.coordinates;
    }
    return [];
  }, [routeResult, tourResult, showDynamicRoute]);

  return (
    <div className="relative h-full w-full select-none overflow-hidden bg-slate-950" data-testid="map-viewer-container">
      <MapContainer
        center={ROSARIO_CENTER}
        zoom={DEFAULT_ZOOM}
        minZoom={11}
        maxZoom={18}
        preferCanvas={true}
        zoomControl={false}
        className="h-full w-full z-0"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />

        <ViewportController
          context={context}
          showTrafficLayer={showTrafficLayer}
          selectionMode={selectionMode}
          onEdgesLoaded={handleEdgesLoaded}
          onLoadingChange={handleLoadingChange}
          onMapClickNode={handleMapClickNode}
        />

        {/* Progressive Viewport LOD Edges rendered on HTML5 Canvas */}
        {showTrafficLayer &&
          edges.map((edge) => (
            <Polyline
              key={edge.tramo_id}
              renderer={canvasRenderer}
              positions={[
                [edge.u_lat, edge.u_lon],
                [edge.v_lat, edge.v_lon],
              ]}
              pathOptions={{
                color: edge.color,
                weight: getEdgeWeightByHierarchy(edge.jerarquia, zoom),
                opacity: zoom >= 15 ? 0.78 : 0.68,
              }}
            >
              <Tooltip sticky direction="top" className="text-xs">
                <div className="font-sans">
                  <div className="font-semibold text-slate-900">
                    Tramo #{edge.tramo_id} ({edge.tipo_calle})
                  </div>
                  <div className="text-slate-700">
                    Longitud: {edge.longitud_m.toFixed(0)} m · Tiempo ML:{" "}
                    {edge.tiempo_seg.toFixed(1)} s
                  </div>
                  <div className="text-slate-700">
                     Ratio Congestión: {edge.congestion_ratio.toFixed(2)}x ({edge.level})
                  </div>
                </div>
              </Tooltip>
            </Polyline>
          ))}

        {/* Static Route Polyline (Dashed Blue/Slate) */}
        {staticRoutePositions.length > 1 && (
          <Polyline
            positions={staticRoutePositions}
            pathOptions={{
              color: "#60A5FA",
              weight: 5,
              opacity: 0.85,
              dashArray: "10, 8",
            }}
          >
            <Tooltip sticky>
              Ruta Estática (Flujo libre sin ML)
            </Tooltip>
          </Polyline>
        )}

        {/* Dynamic ML Route Polyline (Solid Emerald) */}
        {dynamicRoutePositions.length > 1 && (
          <Polyline
            positions={dynamicRoutePositions}
            pathOptions={{
              color: "#10B981",
              weight: 6,
              opacity: 0.95,
            }}
          >
            <Tooltip sticky>
              Ruta IA Dinámica (Árbol de Decisión + Dijkstra)
            </Tooltip>
          </Polyline>
        )}

        {/* Origin Marker */}
        {origin && (
          <CircleMarker
            center={[origin.lat, origin.lon]}
            radius={9}
            pathOptions={{
              color: "#ffffff",
              weight: 2.5,
              fillColor: "#10B981",
              fillOpacity: 1,
            }}
          >
            <Tooltip permanent direction="top" offset={[0, -10]}>
              <span className="font-semibold text-emerald-700">
                Origen: {origin.label}
              </span>
            </Tooltip>
          </CircleMarker>
        )}

        {/* Destination Marker */}
        {destination && (
          <CircleMarker
            center={[destination.lat, destination.lon]}
            radius={9}
            pathOptions={{
              color: "#ffffff",
              weight: 2.5,
              fillColor: "#EF4444",
              fillOpacity: 1,
            }}
          >
            <Tooltip permanent direction="top" offset={[0, -10]}>
              <span className="font-semibold text-rose-700">
                Destino: {destination.label}
              </span>
            </Tooltip>
          </CircleMarker>
        )}

        {/* Depot Marker (for Multi-stop Tour) */}
        {depot && (
          <CircleMarker
            center={[depot.lat, depot.lon]}
            radius={10}
            pathOptions={{
              color: "#ffffff",
              weight: 2.5,
              fillColor: "#3B82F6",
              fillOpacity: 1,
            }}
          >
            <Tooltip permanent direction="top" offset={[0, -10]}>
              <span className="font-semibold text-blue-700">
                Depósito: {depot.label}
              </span>
            </Tooltip>
          </CircleMarker>
        )}

        {/* Multi-stop Tour Waypoints */}
        {stops.map((stop, idx) => (
          <CircleMarker
            key={`${stop.id}-${idx}`}
            center={[stop.lat, stop.lon]}
            radius={8}
            pathOptions={{
              color: "#ffffff",
              weight: 2,
              fillColor: "#F59E0B",
              fillOpacity: 1,
            }}
          >
            <Tooltip permanent direction="top" offset={[0, -8]}>
              <span className="font-semibold text-amber-800">
                #{idx + 1} · {stop.label}
              </span>
            </Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>

      {/* Top-right HUD: Progressive LOD & Traffic Legend */}
      <div className="pointer-events-auto absolute right-4 top-4 z-[500] flex flex-col gap-2 rounded-xl border border-slate-800/90 bg-slate-900/90 p-3.5 text-xs text-slate-200 shadow-2xl backdrop-blur-md">
        <div className="flex items-center justify-between gap-4">
          <span className="font-semibold tracking-wide text-slate-100">
            Rosario Graph LOD (Zoom {zoom})
          </span>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${
              loading || snapping
                ? "bg-amber-500/20 text-amber-300"
                : "bg-emerald-500/20 text-emerald-300"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                loading || snapping ? "animate-ping bg-amber-400" : "bg-emerald-400"
              }`}
            />
            {snapping
              ? "Snap esquina..."
              : loading
              ? "Actualizando ML..."
              : `${stats.totalEdges.toLocaleString()} aristas (${stats.executionTimeMs.toFixed(0)} ms)`}
          </span>
        </div>

        <div className="text-[11px] text-slate-400">{getLodBadgeLabel(zoom)}</div>

        <div className="mt-1 grid grid-cols-3 gap-2 border-t border-slate-800 pt-2 text-[11px]">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            <span>Fluido (&lt;1.25x)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
            <span>Moderado</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
            <span>Congestionado</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MapViewer;
