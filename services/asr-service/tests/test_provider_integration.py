"""
ASR test-provider integration test (§12, fix for issue #10).

With ASR_TEST_MODE=true, the TestProvider echoes the base64-decoded audio
as the transcript, allowing the full validate pipeline to succeed end-to-end.
"""

import base64
import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def test_client(monkeypatch):
    """Client with test mode enabled so /validate can succeed."""
    from app.config import settings
    monkeypatch.setattr(settings, "test_mode", True)
    from app.main import app
    return TestClient(app)


def test_validate_succeeds_in_test_mode(test_client):
    """Full validate pipeline returns PASS when transcript matches passage."""
    passage = "the cat sat on the mat"
    audio_b64 = base64.b64encode(passage.encode()).decode()

    body = {
        "gateId": "00000000-0000-0000-0000-000000000001",
        "studentId": "00000000-0000-0000-0000-000000000002",
        "passageText": passage,
        "difficulty": "Easy",
        "audioBase64": audio_b64,
        "audioMetadata": {"durationMs": 2000, "noiseFloorDb": -40.0, "vadResult": True},
        "attemptNumber": 1,
        "provider": "auto",
    }
    r = test_client.post("/api/v1/asr/validate", json=body)
    assert r.status_code == 200
    data = r.json()
    assert data["result"] == "PASS"
    assert data["score"] == 100.0
    assert data["provider"] == "test"
    assert data["transcript"] == passage


def test_validate_partial_in_test_mode(test_client):
    """A partially-correct transcript yields PARTIAL or FAIL."""
    passage = "the cat sat on the mat"
    transcript = "the cat sat"  # missing words
    audio_b64 = base64.b64encode(transcript.encode()).decode()

    body = {
        "gateId": "00000000-0000-0000-0000-000000000001",
        "studentId": "00000000-0000-0000-0000-000000000002",
        "passageText": passage,
        "difficulty": "Easy",
        "audioBase64": audio_b64,
        "audioMetadata": {"durationMs": 2000, "noiseFloorDb": -40.0, "vadResult": True},
        "attemptNumber": 1,
    }
    r = test_client.post("/api/v1/asr/validate", json=body)
    assert r.status_code == 200
    data = r.json()
    assert data["result"] in ("PARTIAL", "FAIL")
    assert data["score"] < 75.0  # below Easy pass threshold


def test_validate_fail_on_empty_transcript(test_client):
    """Empty transcript yields FAIL."""
    passage = "the cat sat on the mat"
    audio_b64 = base64.b64encode(b"").decode()

    body = {
        "gateId": "00000000-0000-0000-0000-000000000001",
        "studentId": "00000000-0000-0000-0000-000000000002",
        "passageText": passage,
        "difficulty": "Easy",
        "audioBase64": audio_b64,
        "audioMetadata": {"durationMs": 2000, "noiseFloorDb": -40.0, "vadResult": True},
        "attemptNumber": 1,
    }
    r = test_client.post("/api/v1/asr/validate", json=body)
    assert r.status_code == 200
    data = r.json()
    assert data["result"] == "FAIL"
    assert data["score"] == 0.0


def test_calibrate_measures_silence():
    """Calibration on silence (all-zero PCM) returns very low noise floor."""
    import struct
    from fastapi.testclient import TestClient
    from app.main import app

    # 1 second of silence at 16kHz, 16-bit mono = 32000 zero bytes
    silence = struct.pack("<16000h", *([0] * 16000))
    audio_b64 = base64.b64encode(silence).decode()

    client = TestClient(app)
    r = client.post("/api/v1/asr/calibrate", json={
        "studentId": "00000000-0000-0000-0000-000000000002",
        "audioBase64": audio_b64,
        "deviceModel": "Test Device",
    })
    assert r.status_code == 200
    data = r.json()
    # Silence should produce a very low noise floor (near -60 dBFS)
    assert data["noiseFloorDb"] <= -59.0
    # Gain should be maxed (12 dB) for very quiet input
    assert data["gainRecommendationDb"] == 12.0


def test_calibrate_measures_loud_signal():
    """Calibration on loud signal returns higher noise floor."""
    import struct
    from fastapi.testclient import TestClient
    from app.main import app

    # Loud signal: max-amplitude 16-bit samples
    loud = struct.pack("<16000h", *([30000] * 16000))
    audio_b64 = base64.b64encode(loud).decode()

    client = TestClient(app)
    r = client.post("/api/v1/asr/calibrate", json={
        "studentId": "00000000-0000-0000-0000-000000000002",
        "audioBase64": audio_b64,
        "deviceModel": "Test Device",
    })
    assert r.status_code == 200
    data = r.json()
    # Loud signal should produce a high noise floor (near 0 dBFS)
    assert data["noiseFloorDb"] > -1.0
    # Gain should be 0 for already-loud input
    assert data["gainRecommendationDb"] == 0.0
