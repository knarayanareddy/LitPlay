"""
Analytics service FastAPI app (§10.7).

Provides health/readiness endpoints and a query API for analytics dashboards.
The Kafka consumer runs as a background task; in dev/test the InMemoryEventBus
delivers events directly.
"""

from __future__ import annotations

from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.responses import PlainTextResponse
from prometheus_client import CONTENT_TYPE_LATEST, Counter, generate_latest

from . import AnalyticsService, InMemoryAnalyticsRepository

log = structlog.get_logger()

EVENTS_CONSUMED = Counter(
    "analytics_events_consumed_total", "Analytics events consumed", ["topic"]
)

analytics_repo = InMemoryAnalyticsRepository()
analytics_service = AnalyticsService(analytics_repo)


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("analytics_service.starting")
    # In production: start Kafka consumer here, calling analytics_service.handleEvent
    # for each message in the litplay.progress.* topics.
    yield
    log.info("analytics_service.stopping")


app = FastAPI(title="LitPlay Analytics Service", version="2.0.0", lifespan=lifespan)


@app.get("/health", response_class=PlainTextResponse)
async def health():
    return "ok"


@app.get("/ready")
async def ready():
    return {"status": "ready", "service": "analytics-service"}


@app.get("/metrics", response_class=PlainTextResponse)
async def metrics():
    return PlainTextResponse(generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.get("/api/v1/analytics/events/count")
async def get_event_count():
    """Total gate events recorded (dashboard metric)."""
    count = await analytics_repo.get_event_count()
    return {"gateEvents": count, "sessionSummaries": len(analytics_repo.session_summaries)}


@app.post("/internal/analytics/event")
async def ingest_event(envelope: dict):
    """Internal endpoint for direct event ingestion (dev/test bypass of Kafka)."""
    topic = envelope.get("topic", "")
    await analytics_service.handleEvent(envelope)
    EVENTS_CONSUMED.labels(topic=topic).inc()
    return {"status": "ingested"}
