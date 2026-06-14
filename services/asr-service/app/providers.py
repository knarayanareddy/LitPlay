"""
ASR provider abstraction (§12.1 routing).

Routing logic (FR-013):
  online → whisper GPU; if latency > 1800ms or error → Azure; if offline → whisper.cpp

This module defines the provider interface, a stub Whisper implementation,
and a TestProvider for integration testing (so /validate can return success
without a GPU).
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Protocol

from .config import settings


@dataclass
class TranscriptionResult:
    transcript: str
    latency_ms: int
    provider: str  # 'whisper_gpu' | 'azure' | 'whisper_cpp' | 'test'
    confidence: float | None = None


class AsrProvider(Protocol):
    name: str

    def is_available(self) -> bool: ...
    def transcribe(self, audio_base64: str) -> TranscriptionResult: ...


class WhisperGpuProvider:
    """Whisper large-v3 on NVIDIA T4 (§12.1 path 7a–9a)."""

    name = "whisper_gpu"

    def is_available(self) -> bool:
        return settings.whisper_gpu_enabled

    def transcribe(self, audio_base64: str) -> TranscriptionResult:
        start = time.monotonic()
        # Production: decode base64 → numpy → faster_whisper.decode_model()
        # The real model import is deferred so the service boots without torch.
        try:
            from faster_whisper import WhisperModel  # type: ignore

            model = WhisperModel("large-v3", device="cuda", compute_type="float16")
            segments, _info = model.transcribe(_decode_to_path(audio_base64))
            transcript = " ".join(s.text for s in segments).strip()
        except Exception:
            # In environments without GPU/torch, surface as unavailable.
            raise ProviderUnavailableError(self.name)

        latency = int((time.monotonic() - start) * 1000)
        return TranscriptionResult(
            transcript=transcript, latency_ms=latency, provider=self.name
        )


class AzureProvider:
    """Azure Cognitive Services Speech-to-Text fallback (§12.1 path 7b–8b)."""

    name = "azure"

    def is_available(self) -> bool:
        return bool(settings.azure_speech_key and settings.azure_speech_region)

    def transcribe(self, audio_base64: str) -> TranscriptionResult:
        start = time.monotonic()
        # Production: azure.cognitiveservices.speech.SpeechRecognizer
        raise ProviderUnavailableError(self.name)


class WhisperCppProvider:
    """
    On-device whisper.cpp (§12.1 path 7c–9c).

    This normally runs client-side in RN via JSI. On the server it is only used
    for audit/validation of offline results. Here we stub it.
    """

    name = "whisper_cpp"

    def is_available(self) -> bool:
        return True  # always returns the client-provided transcript

    def transcribe(self, audio_base64: str) -> TranscriptionResult:
        raise ProviderUnavailableError(self.name)


class TestProvider:
    """
    Test/stub provider for integration testing and local development.

    When ASR_TEST_MODE=true, this provider echoes the passage text as the
    transcript, allowing the full scoring pipeline to be exercised end-to-end
    without a GPU or external API. Never enabled in production.
    """

    name = "test"

    def is_available(self) -> bool:
        return settings.test_mode

    def transcribe(self, audio_base64: str) -> TranscriptionResult:
        # The test provider decodes the audio to get the embedded passage hint.
        # In test mode, the client sends the expected transcript base64-encoded
        # as the "audio" — this simulates a perfect transcription.
        import base64

        try:
            transcript = base64.b64decode(audio_base64).decode("utf-8")
        except Exception:
            transcript = ""

        return TranscriptionResult(
            transcript=transcript,
            latency_ms=50,
            provider=self.name,
            confidence=1.0,
        )


class ProviderUnavailableError(RuntimeError):
    def __init__(self, provider: str):
        self.provider = provider
        super().__init__(f"ASR provider '{provider}' is unavailable")


def _decode_to_path(audio_base64: str) -> str:
    """Decode base64 audio to a temp WAV file path (production helper)."""
    import base64
    import tempfile

    data = base64.b64decode(audio_base64)
    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    tmp.write(data)
    tmp.close()
    return tmp.name


def route_and_transcribe(
    audio_base64: str,
    provider_hint: str = "auto",
) -> TranscriptionResult:
    """
    Implement FR-013 routing: online → whisper GPU → Azure fallback.
    In test mode, the TestProvider is tried first.
    Raises if no provider can satisfy the request.
    """
    providers: list[AsrProvider] = []

    # Test mode gets priority — never reaches production
    if settings.test_mode:
        providers.append(TestProvider())

    if provider_hint in ("auto", "whisper_gpu"):
        providers.append(WhisperGpuProvider())
    if provider_hint in ("auto", "azure"):
        providers.append(AzureProvider())
    if provider_hint == "whisper_cpp":
        providers.append(WhisperCppProvider())

    last_error: Exception | None = None
    for provider in providers:
        if not provider.is_available():
            continue
        try:
            result = provider.transcribe(audio_base64)
            # §12.1 step 9a: failover to Azure if Whisper too slow
            if (
                provider.name == "whisper_gpu"
                and result.latency_ms > settings.WHISPER_FAILOVER_LATENCY_MS
            ):
                azure = AzureProvider()
                if azure.is_available():
                    return azure.transcribe(audio_base64)
            return result
        except ProviderUnavailableError as e:
            last_error = e
            continue

    raise ProviderUnavailableError(last_error.provider if last_error else "none")
