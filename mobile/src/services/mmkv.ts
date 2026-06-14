/**
 * MMKV storage layer (§13.1).
 *
 * Encrypted key-value store for: auth tokens, calibration profiles,
 * feature flags, sync queue metadata, small UI state.
 *
 * §13.1 RULE: If you need to query it (filter/sort/count) → SQLite (op-sqlite).
 *             If it's a single value looked up by key → MMKV.
 */

import { MMKV } from 'react-native-mmkv';

export const mmkvStorage = new MMKV({
  id: 'litplay-encrypted',
  encryptionKey: process.env.MMKV_ENCRYPTION_KEY ?? 'dev-encryption-key',
});

// --- Key conventions (§13.2, §16.3) ---

export const MMKV_KEYS = {
  REFRESH_TOKEN: 'auth:refreshToken',
  SYNC_QUEUE_PENDING: 'syncQueue:pending',
  SYNC_QUEUE_DEAD: 'syncQueue:dead',
  LAST_SYNC_AT: 'sync:lastSyncAt',
  // §11.7 — calibration stored CLIENT-SIDE only
  CALIBRATION_PREFIX: 'asr:calibration',
  FEATURE_FLAGS: 'featureFlags',
  SELECTED_STUDENT_ID: 'selectedStudentId',
} as const;

// --- Helpers ---

export function getRefreshToken(): string | null {
  return mmkvStorage.getString(MMKV_KEYS.REFRESH_TOKEN) ?? null;
}

export function setRefreshToken(token: string): void {
  mmkvStorage.set(MMKV_KEYS.REFRESH_TOKEN, token);
}

export function clearRefreshToken(): void {
  mmkvStorage.delete(MMKV_KEYS.REFRESH_TOKEN);
}

export function getCalibration(studentId: string): {
  noiseFloorDb: number;
  gainDb: number;
} | null {
  const raw = mmkvStorage.getString(`${MMKV_KEYS.CALIBRATION_PREFIX}:${studentId}`);
  return raw ? JSON.parse(raw) : null;
}

export function setCalibration(
  studentId: string,
  calibration: { noiseFloorDb: number; gainDb: number },
): void {
  mmkvStorage.set(
    `${MMKV_KEYS.CALIBRATION_PREFIX}:${studentId}`,
    JSON.stringify(calibration),
  );
}
