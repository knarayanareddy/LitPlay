/**
 * useASR hook — orchestrates ASR validation (§12).
 *
 * Routing (FR-013): online → whisper GPU; if latency > 1800ms/error → Azure;
 * if offline → whisper.cpp.
 */

import { useCallback } from 'react';
import { useAppStore } from '../stores/app-store';
import type { AsrResultPayload, GateTriggeredPayload } from '@litplay/contracts';
import { posthog } from '../services/analytics';

export function useASR() {
  const isOnline = useAppStore((s) => s.isOnline);

  const validate = useCallback(
    async (
      gate: GateTriggeredPayload,
      audioBase64: string,
      audioMetadata: { durationMs: number; noiseFloorDb: number; vadResult: boolean },
    ): Promise<AsrResultPayload> => {
      const startTime = Date.now();

      // FR-013 routing
      if (isOnline) {
        try {
          const response = await fetch(
            `${process.env.API_BASE_URL}/api/v1/asr/validate`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                gateId: gate.gateId,
                studentId: useAppStore.getState().user?.id,
                passageText: gate.passageText,
                difficulty: gate.difficulty,
                audioBase64,
                audioMetadata,
                attemptNumber: 1,
                provider: 'auto',
              }),
            },
          );
          if (!response.ok) throw new Error(`ASR request failed: ${response.status}`);
          const result = await response.json();

          // FR-017 — clear audio from memory immediately after response
          // (audioBase64 goes out of scope here)

          posthog.capture('asr_provider_used', {
            provider: result.provider,
            latencyMs: result.latencyMs,
            isOffline: false,
          });

          return result;
        } catch (err) {
          console.warn('[ASR] Online validation failed, falling back to offline', err);
        }
      }

      // Offline path: whisper.cpp on-device (§12.1 path 7c–9c)
      const offlineResult = await validateOffline(gate, audioBase64);
      posthog.capture('asr_provider_used', {
        provider: 'whisper_cpp',
        latencyMs: Date.now() - startTime,
        isOffline: true,
      });
      return offlineResult;
    },
    [isOnline],
  );

  return { validate };
}

/**
 * Offline ASR via whisper.cpp JSI bridge (§12.1 step 7c).
 * The scoring logic (RapidFuzz + Metaphone) is ported to JS and runs locally.
 */
async function validateOffline(
  gate: GateTriggeredPayload,
  _audioBase64: string,
): Promise<AsrResultPayload> {
  // Production: call whisper.cpp via JSI → get transcript → run JS scoring
  // This is a stub showing the expected interface.
  throw new Error('whisper.cpp offline ASR not yet initialized');
}
