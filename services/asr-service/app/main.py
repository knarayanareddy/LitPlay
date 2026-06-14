"""
LitPlay ASR Service — FastAPI application (§10.5, §11.5, §12).

Endpoints:
  POST /api/v1/asr/validate   — validate a reading-aloud attempt
  POST /api/v1/asr/calibrate  — measure ambient noise floor + gain
  GET  /api/v1/asr/health      — liveness + active provider
  GET  /health                 — liveness (§10.1 rule 5)
  GET  /ready                  — readiness
  GET  /metrics                — Prometheus metrics
"""

from __future__ import annotations

import base64
import logging
import math
import struct
import time
from contextlib import asynccontextmanager
from typing import Literal

import structlog
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.responses import PlainTextResponse
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest
from pydantic import BaseModel, Field

from . import providers
from .config import MAX_AUDIO_DURATION_MS, settings
from .scoring import (
    classify,
    compute_scores,
    phoneme_breakdown,
    retries_remaining,
)

structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer(),
    ],
    wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
)
log = structlog.get_logger()

# Prometheus metrics (§20)
ASR_REQUESTS = Counter(
    "asr_validate_requests_total", "ASR validate requests", ["provider", "result"]
)
ASR_LATENCY = Histogram(
    "asr_validate_latency_ms", "ASR validate latency (ms)", ["provider"]
)


# --- Request/Response models (mirror @litplay/contracts §11.5) ---


class AudioMetadata(BaseModel):
    durationMs: int = Field(..., gt=0, le=MAX_AUDIO_DURATION_MS)
    noiseFloorDb: float
    vadResult: bool


class ValidateRequest(BaseModel):
    gateId: str
    studentId: str
    passageText: str
    difficulty: Literal["Easy", "Medium", "Hard"]
    audioBase64: str
    audioMetadata: AudioMetadata
    attemptNumber: int = Field(..., ge=1)
    provider: Literal["auto", "whisper_gpu", "azure", "whisper_cpp"] = "auto"


class PhonemeItem(BaseModel):
    word: str
    score: float
    phonetic: str


class ValidateResponse(BaseModel):
    gateId: str
    transcript: str
    score: float
    result: Literal["PASS", "PARTIAL", "FAIL"]
    retriesRemaining: int
    latencyMs: int
    provider: str  # 'whisper_gpu' | 'azure' | 'whisper_cpp' | 'test'
    phonemeBreakdown: list[PhonemeItem]


class CalibrateRequest(BaseModel):
    studentId: str
    audioBase64: str
    deviceModel: str


class CalibrateResponse(BaseModel):
    noiseFloorDb: float
    gainRecommendationDb: float
    calibrationId: str
    validUntil: str


# --- Lifespan ---


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("asr_service.starting", port=settings.port)
    yield
    log.info("asr_service.stopping")


app = FastAPI(
    title="LitPlay ASR Service",
    version="2.0.0",
    lifespan=lifespan,
    docs_url="/docs",
)


@app.middleware("http")
async def request_logging(request: Request, call_next):
    start = time.monotonic()
    response = await call_next(request)
    duration_ms = int((time.monotonic() - start) * 1000)
    log.info(
        "http.request",
        method=request.method,
        path=request.url.path,
        status=response.status_code,
        duration_ms=duration_ms,
    )
    return response


# --- Health / readiness / metrics (§10.1) ---


@app.get("/health", response_class=PlainTextResponse)
async def health():
    return "ok"


@app.get("/ready")
async def ready():
    active_provider = _active_provider()
    return {"status": "ready", "activeProvider": active_provider}


@app.get("/metrics", response_class=PlainTextResponse)
async def metrics():
    return PlainTextResponse(generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.get("/api/v1/asr/health")
async def asr_health():
    """§11.5 — ASR service health + active provider."""
    return {"status": "healthy", "activeProvider": _active_provider()}


def _active_provider() -> str:
    if settings.test_mode:
        return "test"
    if settings.whisper_gpu_enabled:
        return "whisper_gpu"
    if settings.azure_speech_key:
        return "azure"
    return "none"


# --- POST /api/v1/asr/validate (§12) ---


@app.post("/api/v1/asr/validate", response_model=ValidateResponse)
async def validate(body: ValidateRequest, request: Request):
    """
    Validate a reading-aloud attempt.

    Pipeline (§12.1):
      5. Validate schema + audio length
      6. Route to provider → transcribe
      10–14. Normalize, fuzzy+phonetic score, classify
      15. Return (NEVER persist audio)
    """
    request_id = request.headers.get("x-request-id", "")
    structlog.contextvars.bind_contextvars(
        request_id=request_id, gate_id=body.gateId, student_id=body.studentId
    )

    if body.audioMetadata.durationMs > MAX_AUDIO_DURATION_MS:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Audio exceeds max duration of {MAX_AUDIO_DURATION_MS}ms",
        )

    # --- Transcription ---
    try:
        transcription = providers.route_and_transcribe(
            body.audioBase64, provider_hint=body.provider
        )
    except providers.ProviderUnavailableError:
        log.warning("asr.no_provider_available", requested=body.provider)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="No ASR provider available. Client should use whisper.cpp offline.",
        )

    transcript = transcription.transcript
    used_provider = transcription.provider
    asr_latency = transcription.latency_ms

    # --- Scoring (§12.1 steps 10–14) ---
    scores = compute_scores(body.passageText, transcript)
    result = classify(scores.final_score, body.difficulty)

    # maxRetries default = 3 (FR-005); per-content overrides happen client-side.
    max_retries = 3
    remaining = retries_remaining(body.attemptNumber, max_retries, result)

    breakdown = phoneme_breakdown(body.passageText, transcript)

    # --- Metrics ---
    ASR_REQUESTS.labels(provider=used_provider, result=result).inc()
    ASR_LATENCY.labels(provider=used_provider).observe(asr_latency)

    # §12.1 step 15 + FR-017: audio is never persisted. The base64 is already
    # out of scope here; nothing is written to disk or DB.
    log.info(
        "asr.validate.complete",
        result=result,
        score=scores.final_score,
        provider=used_provider,
        latency_ms=asr_latency,
    )

    structlog.contextvars.clear_contextvars()

    return ValidateResponse(
        gateId=body.gateId,
        transcript=transcript,
        score=scores.final_score,
        result=result,
        retriesRemaining=remaining,
        latencyMs=asr_latency,
        provider=used_provider,
        phonemeBreakdown=[PhonemeItem(**p) for p in breakdown],
    )


# --- POST /api/v1/asr/calibrate (§11.7) ---


@app.post("/api/v1/asr/calibrate", response_model=CalibrateResponse)
async def calibrate(body: CalibrateRequest):
    """
    Measure ambient noise floor and recommend mic gain (§18 calibration, §11.7).

    Computes the RMS (root-mean-square) energy of the raw 16-bit PCM audio
    samples to estimate the ambient noise floor in dBFS. The gain recommendation
    brings the signal up to a target of -40 dBFS.

    Calibration profiles are stored CLIENT-SIDE only (MMKV). This endpoint
    computes the values; the client persists them under
    `asr:calibration:{studentId}`.
    """
    import uuid
    from datetime import datetime, timedelta, timezone

    try:
        raw = base64.b64decode(body.audioBase64)
    except Exception:
        raw = b""

    # Parse 16-bit PCM samples (mono) to compute RMS energy
    # If the data has a WAV header, skip it
    pcm_start = 0
    if len(raw) > 44 and raw[:4] == b"RIFF":
        pcm_start = 44

    pcm_data = raw[pcm_start:]
    num_samples = len(pcm_data) // 2  # 16-bit = 2 bytes per sample

    if num_samples > 0:
        # Unpack 16-bit signed samples
        try:
            samples = struct.unpack(f"<{num_samples}h", pcm_data[: num_samples * 2])
        except struct.error:
            samples = []
        if samples:
            # Compute RMS (root-mean-square) energy
            sum_sq = sum(s * s for s in samples)
            rms = math.sqrt(sum_sq / num_samples) if sum_sq > 0 else 1.0
            # Convert RMS to dBFS (relative to full-scale 16-bit: 32767)
            rms_normalized = max(rms / 32767.0, 1e-10)
            noise_floor_db = 20 * math.log10(rms_normalized)
        else:
            noise_floor_db = -60.0
    else:
        noise_floor_db = -60.0  # silence if no valid samples

    # Recommend gain to bring noise floor to target of -40 dBFS
    target_dbfs = -40.0
    gain = max(0.0, min(12.0, target_dbfs - noise_floor_db))

    return CalibrateResponse(
        noiseFloorDb=round(noise_floor_db, 1),
        gainRecommendationDb=round(gain, 1),
        calibrationId=str(uuid.uuid4()),
        validUntil=(datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
    )
