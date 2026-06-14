/**
 * App store (Zustand) — §7.3
 *
 * Global client state: auth, offline status, feature flags.
 * Access tokens are MEMORY ONLY (§16.3 rule 1) — never persisted to disk.
 * Refresh tokens go in MMKV (encrypted).
 */

import { create } from 'zustand';
import type { UserRole } from '@litplay/contracts';
import { mmkvStorage } from '../services/mmkv';

interface AuthState {
  // Access token lives in memory only (§16.3 rule 1)
  accessToken: string | null;
  user: { id: string; email: string; role: UserRole } | null;
  isAuthenticated: boolean;
}

interface OfflineState {
  isOnline: boolean;
  syncQueueLength: number;
  lastSyncAt: string | null;
}

interface FeatureFlagState {
  flags: Record<string, boolean | string | number>;
}

interface AppStore extends AuthState, OfflineState, FeatureFlagState {
  setAuth: (token: string, user: AuthState['user']) => void;
  clearAuth: () => void;
  setOnline: (online: boolean) => void;
  setSyncQueueLength: (len: number) => void;
  setLastSyncAt: (iso: string) => void;
  setFlag: (key: string, value: boolean | string | number) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  accessToken: null,
  user: null,
  isAuthenticated: false,

  isOnline: true,
  syncQueueLength: 0,
  lastSyncAt: null,

  flags: {
    'asr.azure_fallback_enabled': true,
    'asr.offline_whisper_enabled': true,
    'game.gate_bypass_timeout_ms': 30000,
    'classroom.weekly_digest_enabled': false,
  },

  setAuth: (token, user) =>
    set({ accessToken: token, user, isAuthenticated: true }),

  clearAuth: () =>
    set({ accessToken: null, user: null, isAuthenticated: false }),

  setOnline: (online) => set({ isOnline: online }),

  setSyncQueueLength: (len) => set({ syncQueueLength: len }),

  setLastSyncAt: (iso) => set({ lastSyncAt: iso }),

  setFlag: (key, value) =>
    set((state) => ({ flags: { ...state.flags, [key]: value } })),
}));

/**
 * §16.3 rule 3 — On app background > 30 minutes, access token is cleared
 * from memory; refreshed on next foreground.
 */
export const BACKGROUND_TIMEOUT_MS = 30 * 60 * 1000;

let backgroundTimer: ReturnType<typeof setTimeout> | null = null;

export function onAppBackground() {
  backgroundTimer = setTimeout(() => {
    useAppStore.getState().clearAuth();
    // Refresh token is still in MMKV, so we can re-auth silently
  }, BACKGROUND_TIMEOUT_MS);
}

export function onAppForeground() {
  if (backgroundTimer) {
    clearTimeout(backgroundTimer);
    backgroundTimer = null;
  }
  // Re-auth using stored refresh token
  const refreshToken = mmkvStorage.getString('auth:refreshToken');
  if (refreshToken && !useAppStore.getState().isAuthenticated) {
    // Trigger silent refresh
    void import('../services/api').then(({ refreshTokens }) => refreshTokens(refreshToken));
  }
}
