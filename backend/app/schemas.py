"""
Pydantic schemas for the Rosario Routing API (Ticket 15 - MACHI-22).

Defines strongly-typed request and response structures for:
- Viewport edge filtering with level of detail (LOD) and congestion indicators.
- Origin-destination routing comparing distance-optimal vs time-optimal routes.
- Multi-stop TSP tour optimization with 2-opt.
- Node spatial search and snapping.
- Benchmark metrics and scenario presets.
"""

from __future__ import annotations

from typing import Any, Literal
from pydantic import BaseModel, Field, field_validator


class ContextParams(BaseModel):
    """Contexto urbano para la inferencia de tiempos de viaje con Machine Learning."""

    hora_dia: float = Field(
        default=8.0,
        ge=0.0,
        le=24.0,
        description="Hora del día en formato continuo (ej: 8.5 = 08:30 hs)",
    )
    dia_semana: str = Field(
        default="miercoles",
        description="Día de la semana: lunes, martes, miercoles, jueves, viernes, sabado, domingo",
    )
    clima: str = Field(
        default="despejado",
        description="Condición climática: despejado, nublado, lluvia, tormenta",
    )
    es_feriado: bool = Field(
        default=False,
        description="Si el día es feriado o no laborable",
    )

    @field_validator("dia_semana")
    @classmethod
    def validate_dia_semana(cls, v: str) -> str:
        valid = {
            "lunes",
            "martes",
            "miercoles",
            "miércoles",
            "jueves",
            "viernes",
            "sabado",
            "sábado",
            "domingo",
        }
        val = v.strip().lower()
        if val not in valid:
            raise ValueError(f"Día de la semana '{v}' inválido. Valores: lunes a domingo.")
        if val == "miércoles":
            return "miercoles"
        if val == "sábado":
            return "sabado"
        return val

    @field_validator("clima")
    @classmethod
    def validate_clima(cls, v: str) -> str:
        valid = {"despejado", "nublado", "lluvia", "tormenta"}
        val = v.strip().lower()
        if val not in valid:
            raise ValueError(f"Clima '{v}' inválido. Valores: despejado, nublado, lluvia, tormenta.")
        return val


class ViewportRequest(ContextParams):
    """Solicitud de aristas visibles dentro de un Bounding Box y nivel de zoom."""

    min_lat: float = Field(default=-33.05, ge=-34.0, le=-32.0)
    min_lon: float = Field(default=-60.80, ge=-61.5, le=-60.0)
    max_lat: float = Field(default=-32.85, ge=-34.0, le=-32.0)
    max_lon: float = Field(default=-60.55, ge=-61.5, le=-60.0)
    zoom: int = Field(default=13, ge=10, le=20, description="Nivel de zoom de Leaflet")
    max_edges: int = Field(default=4500, ge=100, le=35000)


class ViewportEdge(BaseModel):
    """Arista para renderizado vectorizado en Leaflet Canvas."""

    tramo_id: str
    u: int
    v: int
    u_lat: float
    u_lon: float
    v_lat: float
    v_lon: float
    tipo_calle: str
    jerarquia: int
    longitud_m: float
    tiempo_seg: float
    congestion_ratio: float
    level: Literal["fluido", "moderado", "congestionado"]
    color: str


class ViewportResponse(BaseModel):
    """Respuesta con las aristas filtradas y métricas de viewport."""

    total_edges: int
    max_hierarchy_visible: int
    context: dict[str, Any]
    edges: list[ViewportEdge]
    execution_time_ms: float


class NodeInfo(BaseModel):
    """Información de una esquina / nodo del grafo."""

    id: int
    lat: float
    lon: float
    label: str
    distance_m: float | None = None


class RouteRequest(ContextParams):
    """Solicitud de cálculo de ruta origen-destino comparativa."""

    origin_lat: float | None = Field(default=None, ge=-34.0, le=-32.0)
    origin_lon: float | None = Field(default=None, ge=-61.5, le=-60.0)
    origin_id: int | None = Field(default=None)

    destination_lat: float | None = Field(default=None, ge=-34.0, le=-32.0)
    destination_lon: float | None = Field(default=None, ge=-61.5, le=-60.0)
    destination_id: int | None = Field(default=None)


class RouteDetail(BaseModel):
    """Detalle de una ruta calculada (estática o dinámica)."""

    found: bool
    mode: str
    distance_m: float
    distance_km: float
    time_sec: float
    time_min: float
    nodes: list[int]
    coordinates: list[list[float]]  # [[lat, lon], ...]
    tramos: list[str]
    execution_time_ms: float


class RouteComparison(BaseModel):
    """Comparación cuantitativa entre la ruta estática y la dinámica por IA."""

    time_saved_sec: float
    time_saved_min: float
    time_saved_pct: float
    distance_diff_m: float
    is_dynamic_faster: bool


class RouteResponse(BaseModel):
    """Respuesta completa del ruteo comparativo."""

    origin: NodeInfo
    destination: NodeInfo
    static_route: RouteDetail
    dynamic_route: RouteDetail
    comparison: RouteComparison
    context: dict[str, Any]
    total_execution_time_ms: float


class TourStopInput(BaseModel):
    """Punto de parada para la ronda de entregas TSP."""

    lat: float | None = Field(default=None, ge=-34.0, le=-32.0)
    lon: float | None = Field(default=None, ge=-61.5, le=-60.0)
    node_id: int | None = None
    label: str | None = None


class TourRequest(ContextParams):
    """Solicitud de optimización de ronda de entregas (TSP)."""

    depot: TourStopInput
    stops: list[TourStopInput]
    return_to_depot: bool = Field(default=True)


class TourStopResponse(BaseModel):
    """Parada con su orden secuencial asignado por el optimizador."""

    visit_order: int
    node_id: int
    label: str
    lat: float
    lon: float


class TourLeg(BaseModel):
    """Tramo individual entre dos paradas sucesivas del tour."""

    leg_order: int
    from_node: int
    to_node: int
    distance_m: float
    time_sec: float
    nodes: list[int]
    coordinates: list[list[float]]


class TourDetail(BaseModel):
    """Detalle de una ronda calculada."""

    mode: str
    ordered_sequence: list[int]
    numbered_stops: list[TourStopResponse]
    legs: list[TourLeg]
    coordinates: list[list[float]]
    total_distance_km: float
    total_time_min: float
    execution_time_ms: float


class TourResponse(BaseModel):
    """Respuesta de la ronda de entregas comparativa."""

    dynamic_tour: TourDetail
    static_tour: TourDetail
    time_saved_sec: float
    time_saved_min: float
    time_saved_pct: float
    context: dict[str, Any]
    total_execution_time_ms: float


class HealthResponse(BaseModel):
    """Estado y diagnóstico general del backend."""

    status: str
    city: str
    nodes_count: int
    edges_count: int
    scc_strictly_connected: bool
    ml_model_loaded: bool
    lru_cache_entries: int
    uptime_seconds: float


class CongestedCorridor(BaseModel):
    """Corredor vial con su nivel de congestión agregado y métricas de velocidad."""

    name: str = Field(..., description="Nombre de la arteria vial")
    tipo_calle: str = Field(..., description="Tipo de calle (avenida, circunvalacion, comercial, residencial)")
    congestion_ratio: float = Field(..., description="Ratio de congestión respecto al tiempo base")
    delay_pct: float = Field(..., description="Porcentaje de demora adicional debido a congestión")
    average_speed_kmh: float = Field(..., description="Velocidad actual estimada en km/h")
    nominal_speed_kmh: float = Field(..., description="Velocidad máxima reglamentaria nominal en km/h")
    lat: float = Field(..., description="Latitud del centroide de la arteria")
    lon: float = Field(..., description="Longitud del centroide de la arteria")
    sample_tramo_id: str = Field(..., description="ID de un tramo representativo")


class CongestedCorridorsResponse(BaseModel):
    """Respuesta del Top de arterias más congestionadas en tiempo real."""

    total_corridors: int
    context: dict[str, Any]
    corridors: list[CongestedCorridor]
    execution_time_ms: float
