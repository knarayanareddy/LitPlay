/**
 * Minimal API helpers for the mobile shell.
 */

import { setRefreshToken } from './mmkv';
import { useAppStore } from '../stores/app-store';

export async function refreshTokens(refreshToken: string): Promise<void> {
  const apiBaseUrl = process.env.API_BASE_URL ?? 'http://localhost:8080';
  const response = await fetch(`${apiBaseUrl}/api/v1/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  if (!response.ok) {
    useAppStore.getState().clearAuth();
    return;
  }

  const body = await response.json() as {
    tokens?: { accessToken: string; refreshToken: string };
    user?: { id: string; email: string; role: 'student' | 'parent' | 'teacher' | 'admin' };
  };

  if (body.tokens?.refreshToken) setRefreshToken(body.tokens.refreshToken);
  if (body.tokens?.accessToken && body.user) {
    useAppStore.getState().setAuth(body.tokens.accessToken, body.user);
  }
}
