"""
Analytics service FastAPI app (§10.7).

Provides health/readiness endpoints and a query API for analytics dashboards.
When KAFKA_BROKERS is configured, a background aiokafka consumer ingests
progress events and writes analytics rows.
"""

from __future__ import annotations

import asyncio
import json
import os
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.responses import PlainTextResponse
from prometheus_client import CONTENT_TYPE_LATEST, Counter, generate_latest

from . import AnalyticsService, ClickHouseAnalyticsRepository, InMemoryAnalyticsRepository

log = structlog.get_logger()

EVENTS_CONSUMED = Counter(
    "analytics_events_consumed_total", "Analytics events consumed", ["topic"]
)

if os.getenv("CLICKHOUSE_HOST"):
    analytics_repo = ClickHouseAnalyticsRepository(
        host=os.getenv("CLICKHOUSE_HOST", "localhost"),
        port=int(os.getenv("CLICKHOUSE_PORT", "8123")),
    )
else:
    analytics_repo = InMemoryAnalyticsRepository()
analytics_service = AnalyticsService(analytics_repo)

_kafka_task: asyncio.Task | None = None


async def consume_kafka() -> None:
    brokers = os.getenv("KAFKA_BROKERS")
    if not brokers:
        return
    from aiokafka import AIOKafkaConsumer

    topics = [
        "litplay.progress.gate_attempt.recorded",
        "litplay.progress.session.completed",
    ]
    consumer = AIOKafkaConsumer(
        *topics,
        bootstrap_servers=brokers.split(","),
        group_id="analytics-service",
        enable_auto_commit=True,
        auto_offset_reset="latest",
    )
    await consumer.start()
    log.info("analytics.kafka_consumer.started", topics=topics)
    try:
        async for message in consumer:
            envelope = json.loads(message.value.decode("utf-8"))
            topic = envelope.get("topic", message.topic)
            await analytics_service.handleEvent(envelope)
            EVENTS_CONSUMED.labels(topic=topic).inc()
    finally:
        await consumer.stop()
        log.info("analytics.kafka_consumer.stopped")


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _kafka_task
    log.info("analytics_service.starting")
    if os.getenv("KAFKA_BROKERS"):
      _kafka_task = asyncio.create_task(consume_kafka())
    yield
    if _kafka_task:
        _kafka_task.cancel()
        try:
            await _kafka_task
        except asyncio.CancelledError:
            pass
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
    session_count = len(getattr(analytics_repo, "session_summaries", []))
    return {"gateEvents": count, "sessionSummaries": session_count}


@app.post("/internal/analytics/event")
async def ingest_event(envelope: dict):
    """Internal endpoint for direct event ingestion (dev/test bypass of Kafka)."""
    topic = envelope.get("topic", "")
    await analytics_service.handleEvent(envelope)
    EVENTS_CONSUMED.labels(topic=topic).inc()
    return {"status": "ingested"}
