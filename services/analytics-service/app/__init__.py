"""
Analytics service — consumes Kafka events and writes to ClickHouse (§10.7, §20).

In production this runs as an async Kafka consumer. In dev/test it accepts
events directly via the EventBus interface, making it testable without Kafka.

ClickHouse schema (§14.4):
  - litplay_analytics.gate_events
  - litplay_analytics.session_summary
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone

import structlog

structlog.configure(
    processors=[
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer(),
    ],
    wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
)
log = structlog.get_logger()


@dataclass
class GateEventRow:
    event_id: str
    student_id: str
    content_id: str
    gate_id: str
    result: str  # PASS | PARTIAL | FAIL
    score: float
    latency_ms: int
    asr_provider: str
    is_offline: int  # UInt8 in ClickHouse
    event_time: str


@dataclass
class SessionSummaryRow:
    session_id: str
    student_id: str
    content_id: str
    grade_level: str
    words_read: int
    wpm: float
    gates_passed: int
    gates_total: int
    duration_sec: int
    session_date: str


@dataclass
class AnalyticsRepository:
    """Interface for persisting analytics rows (ClickHouse or in-memory)."""

    async def insert_gate_event(self, row: GateEventRow) -> None: ...
    async def insert_session_summary(self, row: SessionSummaryRow) -> None: ...
    async def get_event_count(self) -> int: ...


class InMemoryAnalyticsRepository:
    """In-memory store for testing — mirrors the ClickHouse schema."""

    def __init__(self):
        self.gate_events: list[GateEventRow] = []
        self.session_summaries: list[SessionSummaryRow] = []

    async def insert_gate_event(self, row: GateEventRow) -> None:
        self.gate_events.append(row)

    async def insert_session_summary(self, row: SessionSummaryRow) -> None:
        self.session_summaries.append(row)

    async def get_event_count(self) -> int:
        return len(self.gate_events)


class ClickHouseAnalyticsRepository:
    """
    Production repository backed by ClickHouse (§14.4).

    Uses clickhouse-connect for batch inserts. The connection is lazy so the
    service boots without a ClickHouse instance in dev/test.
    """

    def __init__(self, host: str = "localhost", port: int = 8123):
        self._host = host
        self._port = port
        self._client = None
        self._buffer: list[GateEventRow] = []
        self._session_buffer: list[SessionSummaryRow] = []

    def _get_client(self):
        if self._client is None:
            import clickhouse_connect  # type: ignore

            self._client = clickhouse_connect.get_client(
                host=self._host, port=self._port, database="litplay_analytics"
            )
        return self._client

    async def insert_gate_event(self, row: GateEventRow) -> None:
        self._buffer.append(row)
        if len(self._buffer) >= 100:
            await self._flush_gate_events()

    async def insert_session_summary(self, row: SessionSummaryRow) -> None:
        self._session_buffer.append(row)
        if len(self._session_buffer) >= 50:
            await self._flush_session_summaries()

    async def _flush_gate_events(self):
        if not self._buffer:
            return
        client = self._get_client()
        client.insert(
            "gate_events",
            [
                [
                    r.event_id, r.student_id, r.content_id, r.gate_id,
                    r.result, r.score, r.latency_ms, r.asr_provider,
                    r.is_offline, r.event_time,
                ]
                for r in self._buffer
            ],
            column_names=[
                "event_id", "student_id", "content_id", "gate_id",
                "result", "score", "latency_ms", "asr_provider",
                "is_offline", "event_time",
            ],
        )
        log.info("analytics.gate_events_flushed", count=len(self._buffer))
        self._buffer.clear()

    async def _flush_session_summaries(self):
        if not self._session_buffer:
            return
        client = self._get_client()
        client.insert(
            "session_summary",
            [
                [
                    r.session_id, r.student_id, r.content_id, r.grade_level,
                    r.words_read, r.wpm, r.gates_passed, r.gates_total,
                    r.duration_sec, r.session_date,
                ]
                for r in self._session_buffer
            ],
            column_names=[
                "session_id", "student_id", "content_id", "grade_level",
                "words_read", "wpm", "gates_passed", "gates_total",
                "duration_sec", "session_date",
            ],
        )
        log.info("analytics.session_summaries_flushed", count=len(self._session_buffer))
        self._session_buffer.clear()

    async def get_event_count(self) -> int:
        client = self._get_client()
        result = client.query("SELECT count() FROM gate_events")
        return result.result_rows[0][0] if result.result_rows else 0


class AnalyticsService:
    """
    Consumes events from the event bus and persists them to the analytics store.

    §15.3 — this service is a consumer of:
      - litplay.progress.gate_attempt.recorded
      - litplay.progress.session.completed
    """

    def __init__(self, repo: AnalyticsRepository):
        self.repo = repo

    async def handleEvent(self, envelope) -> None:
        """Process an event envelope from the bus."""
        topic = envelope.get("topic", "") if isinstance(envelope, dict) else envelope.topic
        data = envelope.get("data", {}) if isinstance(envelope, dict) else envelope.data
        event_id = envelope.get("eventId", "") if isinstance(envelope, dict) else envelope.eventId
        timestamp = envelope.get("timestamp", datetime.now(timezone.utc).isoformat()) if isinstance(envelope, dict) else envelope.timestamp

        if topic == "litplay.progress.gate_attempt.recorded":
            await self.on_gate_attempt_recorded(data, event_id, timestamp)
        elif topic == "litplay.progress.session.completed":
            await self.on_session_completed(data, event_id, timestamp)

    async def on_gate_attempt_recorded(self, data: dict, event_id: str, timestamp: str) -> None:
        row = GateEventRow(
            event_id=event_id,
            student_id=data.get("studentId", ""),
            content_id=data.get("contentId", ""),
            gate_id=data.get("gateId", ""),
            result=data.get("result", "FAIL"),
            score=float(data.get("score", 0)),
            latency_ms=int(data.get("latencyMs", 0)),
            asr_provider=data.get("asrProvider", "unknown"),
            is_offline=1 if data.get("isOffline") else 0,
            event_time=timestamp,
        )
        await self.repo.insert_gate_event(row)
        log.info("analytics.gate_event_recorded", event_id=event_id, result=row.result)

    async def on_session_completed(self, data: dict, event_id: str, timestamp: str) -> None:
        row = SessionSummaryRow(
            session_id=data.get("sessionId", ""),
            student_id=data.get("studentId", ""),
            content_id=data.get("contentId", ""),
            grade_level=data.get("gradeLevel", ""),
            words_read=int(data.get("wordsRead", 0)),
            wpm=float(data.get("wpm", 0)),
            gates_passed=int(data.get("gatesPassed", 0)),
            gates_total=int(data.get("gatesTotal", 0)),
            duration_sec=int(data.get("durationSec", 0)),
            session_date=timestamp[:10],
        )
        await self.repo.insert_session_summary(row)
        log.info("analytics.session_summary_recorded", session_id=row.session_id)
