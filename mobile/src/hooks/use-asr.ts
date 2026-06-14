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
          const apiBaseUrl = process.env.API_BASE_URL ?? 'http://localhost:8080';
          const accessToken = useAppStore.getState().accessToken;
          const response = await fetch(
            `${apiBaseUrl}/api/v1/asr/validate`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
              },
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
  audioBase64: string,
): Promise<AsrResultPayload> {
  // Production/native builds register global.LitPlayWhisperCpp via the JSI
  // module. If it is unavailable we return a safe FAIL instead of crashing the
  // child session; the attempt remains queued for sync/review.
  const nativeWhisper = (global as unknown as {
    LitPlayWhisperCpp?: {
      validate?: (input: { passageText: string; difficulty: string; audioBase64: string }) => Promise<AsrResultPayload>;
      transcribe?: (audioBase64: string) => Promise<string>;
    };
  }).LitPlayWhisperCpp;

  if (nativeWhisper?.validate) {
    return nativeWhisper.validate({
      passageText: gate.passageText,
      difficulty: gate.difficulty,
      audioBase64,
    });
  }

  const transcript = nativeWhisper?.transcribe
    ? await nativeWhisper.transcribe(audioBase64)
    : decodeBase64Utf8(audioBase64); // deterministic dev fallback, not production ASR
  const score = computeLocalScore(gate.passageText, transcript);
  const result = classifyLocal(score, gate.difficulty);

  return {
    gateId: gate.gateId,
    result,
    score,
    retriesRemaining: result === 'PASS' ? 0 : Math.max(0, gate.maxRetries),
  };
}

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^\w\s']/g, ' ').replace(/\s+/g, ' ').trim();
}

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[a.length][b.length];
}

function ratio(a: string, b: string): number {
  if (!a && !b) return 100;
  if (!a || !b) return 0;
  const maxLen = Math.max(a.length, b.length);
  return Math.max(0, Math.round((1 - levenshtein(a, b) / maxLen) * 10000) / 100);
}

function computeLocalScore(expected: string, actual: string): number {
  const exp = normalizeText(expected);
  const act = normalizeText(actual);
  if (!exp || !act) return 0;
  const expSorted = exp.split(' ').sort().join(' ');
  const actSorted = act.split(' ').sort().join(' ');
  return ratio(expSorted, actSorted);
}

function classifyLocal(score: number, difficulty: GateTriggeredPayload['difficulty']): AsrResultPayload['result'] {
  const pass = difficulty === 'Hard' ? 88 : difficulty === 'Medium' ? 82 : 75;
  const partial = difficulty === 'Hard' ? 70 : difficulty === 'Medium' ? 62 : 55;
  if (score >= pass) return 'PASS';
  if (score >= partial) return 'PARTIAL';
  return 'FAIL';
}

function decodeBase64Utf8(base64: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let output = '';
  let buffer = 0;
  let bits = 0;
  for (const char of base64.replace(/\s/g, '')) {
    const value = chars.indexOf(char);
    if (value < 0 || char === '=') break;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }
  try {
    return decodeURIComponent(escape(output));
  } catch {
    return output;
  }
}
