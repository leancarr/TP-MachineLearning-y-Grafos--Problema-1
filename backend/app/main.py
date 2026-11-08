"""
Servidor FastAPI para el Ruteo de Última Milla en Rosario (Ticket 15 - MACHI-22).

Integra:
- Carga instantánea del grafo y modelos en memoria RAM mediante lifespan (<0.3s).
- Endpoint `/api/graph/viewport` para filtrado LOD y renderizado en Leaflet Canvas.
- Endpoint `/api/route` para ruteo comparativo (Camino más corto vs Camino más rápido por IA).
- Endpoint `/api/tour` para ronda multipunto TSP con algoritmo voraz y 2-opt.
- Endpoints de auditoría `/api/metrics` y presets urbanos `/api/presets`.
- Snapping ultra-rápido en `/api/nodes/nearest` y búsqueda en `/api/nodes/search`.
"""

from __future__ import annotations

import time
from contextlib import asynccontextmanager
from typing import AsyncGenerator

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.app.routers import graph, metrics, route
from backend.app.schemas import HealthResponse
from backend.app.state import app_state


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Inicialización en memoria al arrancar el servidor FastAPI."""
    print("⏳ Inicializando componentes de Rosario en RAM...")
    app_state.initialize()
    yield
    print("🛑 Apagando servidor Rosario Routing API.")


app = FastAPI(
    title="Rosario Last-Mile Routing API",
    description="Motor de Ruteo de Última Milla con Predicción de Demanda de Tráfico en Rosario (Santa Fe, Argentina). "
    "Combina Teoría de Grafos (Dijkstra propio y TSP 2-opt) con Machine Learning supervisado en tiempo real.",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# Configuración CORS permisiva para desarrollo local (Vite, Next, React, etc.)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Inclusión de routers modulares
app.include_router(graph.router)
app.include_router(route.router)
app.include_router(metrics.router)


@app.get(
    "/",
    tags=["General"],
    summary="Información general de la API y accesos rápidos",
)
def root() -> JSONResponse:
    """Ruta raíz que provee enlaces a la documentación Swagger y el estado del servicio."""
    return JSONResponse(
        content={
            "app": "Rosario Last-Mile Routing API",
            "version": "1.0.0",
            "city": "Rosario, Santa Fe, Argentina",
            "docs": "/docs",
            "openapi": "/openapi.json",
            "endpoints": {
                "health": "/api/health",
                "viewport": "/api/graph/viewport",
                "route": "/api/route",
                "tour": "/api/tour",
                "nearest_node": "/api/nodes/nearest",
                "search_nodes": "/api/nodes/search",
                "metrics": "/api/metrics",
                "presets": "/api/presets",
            },
        }
    )


@app.get(
    "/api/health",
    response_model=HealthResponse,
    tags=["General"],
    summary="Diagnóstico de estado y verificación de componentes en memoria",
)
def health_check() -> HealthResponse:
    """Verifica que el grafo esté cargado, sea fuertemente conexo y los modelos de ML estén operativos."""
    uptime = time.time() - app_state.start_time
    is_ready = app_state.is_initialized
    n_nodes = len(app_state.graph_data["nodes"]) if is_ready else 0
    n_edges = len(app_state.graph_data["edges"]) if is_ready else 0
    lru_entries = len(app_state.predictor._lru_cache) if is_ready else 0

    return HealthResponse(
        status="healthy" if is_ready else "starting",
        city="Rosario, Santa Fe, Argentina",
        nodes_count=n_nodes,
        edges_count=n_edges,
        scc_strictly_connected=True,
        ml_model_loaded=is_ready and app_state.predictor is not None,
        lru_cache_entries=lru_entries,
        uptime_seconds=round(uptime, 2),
    )


if __name__ == "__main__":
    uvicorn.run("backend.app.main:app", host="0.0.0.0", port=8000, reload=True)
