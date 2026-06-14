"""
ASR service configuration (§12.3 thresholds, §10.5 runtime).

Thresholds and weights are the single source for the Python side.
The TypeScript contracts package (@litplay/contracts/src/schemas.ts) holds the
canonical copy; these must stay in sync.
"""

import os
from enum import Enum


class Difficulty(str, Enum):
    EASY = "Easy"
    MEDIUM = "Medium"
    HARD = "Hard"


# §12.3 — Scoring weights
SCORING_WEIGHTS = {"fuzzy": 0.70, "phonetic": 0.30}

# §12.3 — Difficulty-aware thresholds {pass, partial}
DIFFICULTY_THRESHOLDS = {
    Difficulty.EASY: {"pass": 75, "partial": 55},
    Difficulty.MEDIUM: {"pass": 82, "partial": 62},
    Difficulty.HARD: {"pass": 88, "partial": 70},
}

# §12.1 — Failover latency
WHISPER_FAILOVER_LATENCY_MS = 1800

# §11.5 / §12 — max audio
MAX_AUDIO_DURATION_MS = 30_000
SAMPLE_RATE_HZ = 16_000

# Environment-driven config
class Settings:
    port: int = int(os.getenv("PORT", "8080"))
    log_level: str = os.getenv("LOG_LEVEL", "info")

    # Provider config — all optional so the service runs without external deps.
    # In production these come from AWS Secrets Manager.
    azure_speech_key: str | None = os.getenv("AZURE_SPEECH_KEY")
    azure_speech_region: str | None = os.getenv("AZURE_SPEECH_REGION", "eastus")

    # Whether the local GPU/Whisper path is available. In CI we stub it.
    whisper_gpu_enabled: bool = os.getenv("WHISPER_GPU_ENABLED", "false").lower() == "true"

    # Test mode — never enable in production. Lets /validate succeed without
    # a GPU by echoing the base64-decoded audio as the transcript.
    test_mode: bool = os.getenv("ASR_TEST_MODE", "false").lower() == "true"


settings = Settings()
