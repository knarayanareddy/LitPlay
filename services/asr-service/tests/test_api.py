"""Tests for the ASR FastAPI endpoints (§11.5, §12)."""

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client():
    return TestClient(app)


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.text == "ok"


def test_ready(client):
    r = client.get("/ready")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ready"
    assert "activeProvider" in body


def test_asr_health(client):
    r = client.get("/api/v1/asr/health")
    assert r.status_code == 200
    assert "activeProvider" in r.json()


def test_metrics(client):
    r = client.get("/metrics")
    assert r.status_code == 200
    assert "asr_validate" in r.text


def test_validate_no_provider_returns_503(client):
    """With no GPU/Azure configured, validate should 503 and tell client to go offline."""
    body = {
        "gateId": "00000000-0000-0000-0000-000000000001",
        "studentId": "00000000-0000-0000-0000-000000000002",
        "passageText": "the cat sat",
        "difficulty": "Easy",
        "audioBase64": "AAAA",
        "audioMetadata": {"durationMs": 2000, "noiseFloorDb": -40.0, "vadResult": True},
        "attemptNumber": 1,
        "provider": "auto",
    }
    r = client.post("/api/v1/asr/validate", json=body)
    assert r.status_code == 503


def test_validate_rejects_oversized_audio(client):
    body = {
        "gateId": "00000000-0000-0000-0000-000000000001",
        "studentId": "00000000-0000-0000-0000-000000000002",
        "passageText": "the cat sat",
        "difficulty": "Easy",
        "audioBase64": "AAAA",
        "audioMetadata": {"durationMs": 60_000, "noiseFloorDb": -40.0, "vadResult": True},
        "attemptNumber": 1,
    }
    r = client.post("/api/v1/asr/validate", json=body)
    assert r.status_code in (413, 422)  # 422 from pydantic, 413 from our check


def test_validate_rejects_invalid_difficulty(client):
    body = {
        "gateId": "00000000-0000-0000-0000-000000000001",
        "studentId": "00000000-0000-0000-0000-000000000002",
        "passageText": "the cat sat",
        "difficulty": "Impossible",
        "audioBase64": "AAAA",
        "audioMetadata": {"durationMs": 2000, "noiseFloorDb": -40.0, "vadResult": True},
        "attemptNumber": 1,
    }
    r = client.post("/api/v1/asr/validate", json=body)
    assert r.status_code == 422


def test_calibrate_returns_valid_profile(client):
    body = {
        "studentId": "00000000-0000-0000-0000-000000000002",
        "audioBase64": "AAAA",
        "deviceModel": "Pixel 7",
    }
    r = client.post("/api/v1/asr/calibrate", json=body)
    assert r.status_code == 200
    data = r.json()
    assert "noiseFloorDb" in data
    assert "gainRecommendationDb" in data
    assert "calibrationId" in data
    assert "validUntil" in data
