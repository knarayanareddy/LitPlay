"""
Analytics service tests (§10.7, §20).
Tests event consumption and ClickHouse row mapping.
"""

import pytest
from analytics_app import AnalyticsService, InMemoryAnalyticsRepository, GateEventRow


@pytest.fixture
def service():
    repo = InMemoryAnalyticsRepository()
    return AnalyticsService(repo), repo


GATE_EVENT_ENVELOPE = {
    "specVersion": "1.0",
    "topic": "litplay.progress.gate_attempt.recorded",
    "eventId": "evt-001",
    "timestamp": "2026-06-14T10:00:00Z",
    "source": "progress-service",
    "dataVersion": "1",
    "correlationId": "corr-001",
    "data": {
        "gateAttemptId": "ga-001",
        "studentId": "student-001",
        "contentId": "world-001",
        "gateId": "gate-001",
        "result": "PASS",
        "score": 91.4,
        "latencyMs": 843,
        "asrProvider": "whisper_gpu",
        "isOffline": False,
    },
}

SESSION_COMPLETED_ENVELOPE = {
    "specVersion": "1.0",
    "topic": "litplay.progress.session.completed",
    "eventId": "evt-002",
    "timestamp": "2026-06-14T11:00:00Z",
    "source": "progress-service",
    "dataVersion": "1",
    "correlationId": "corr-002",
    "data": {
        "sessionId": "sess-001",
        "studentId": "student-001",
        "contentId": "world-001",
        "status": "completed",
        "wordsRead": 120,
        "wpm": 60.0,
        "durationSec": 180,
        "gatesPassed": 3,
        "gatesTotal": 3,
    },
}


class TestAnalyticsService:
    @pytest.mark.asyncio
    async def test_consumes_gate_attempt_event(self, service):
        svc, repo = service
        await svc.handleEvent(GATE_EVENT_ENVELOPE)
        assert len(repo.gate_events) == 1
        row = repo.gate_events[0]
        assert row.event_id == "evt-001"
        assert row.student_id == "student-001"
        assert row.result == "PASS"
        assert row.score == 91.4
        assert row.is_offline == 0

    @pytest.mark.asyncio
    async def test_consumes_session_completed_event(self, service):
        svc, repo = service
        await svc.handleEvent(SESSION_COMPLETED_ENVELOPE)
        assert len(repo.session_summaries) == 1
        row = repo.session_summaries[0]
        assert row.session_id == "sess-001"
        assert row.words_read == 120
        assert row.wpm == 60.0
        assert row.gates_passed == 3
        assert row.session_date == "2026-06-14"

    @pytest.mark.asyncio
    async def test_ignores_unrelated_topics(self, service):
        svc, repo = service
        await svc.handleEvent({
            "topic": "litplay.auth.user.created",
            "eventId": "evt-003",
            "timestamp": "2026-06-14T12:00:00Z",
            "data": {},
        })
        assert len(repo.gate_events) == 0
        assert len(repo.session_summaries) == 0

    @pytest.mark.asyncio
    async def test_get_event_count(self, service):
        svc, repo = service
        await svc.handleEvent(GATE_EVENT_ENVELOPE)
        await svc.handleEvent(GATE_EVENT_ENVELOPE)
        count = await repo.get_event_count()
        assert count == 2

    @pytest.mark.asyncio
    async def test_offline_flag_mapped_to_uint8(self, service):
        svc, repo = service
        offline_envelope = {**GATE_EVENT_ENVELOPE}
        offline_envelope["data"] = {**GATE_EVENT_ENVELOPE["data"], "isOffline": True}
        await svc.handleEvent(offline_envelope)
        assert repo.gate_events[0].is_offline == 1
