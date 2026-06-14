/**
 * JWT utilities (§16).
 *
 * Access token:  15m TTL, stored in memory only on the client.
 * Refresh token: 30d TTL, single-use rotation, stored in MMKV.
 * Refresh token reuse → revoke entire family (§16.3 rule 5).
 */

import jwt, { type JwtPayload } from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { createHash, timingSafeEqual } from 'node:crypto';

export const ACCESS_TOKEN_TTL = '15m';
export const REFRESH_TOKEN_TTL_DAYS = 30;
export const REFRESH_TOKEN_TTL_SEC = REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60;

/** §16.1 JWT structure */
export interface LitPlayJwtPayload extends JwtPayload {
  sub: string; // user-uuid
  email: string;
  role: 'student' | 'parent' | 'teacher' | 'admin';
  classroomIds?: string[];
  parentId?: string;
}

export function signAccessToken(
  payload: Omit<LitPlayJwtPayload, 'iat' | 'exp'>,
  secret: string,
): string {
  return jwt.sign(payload, secret, { expiresIn: ACCESS_TOKEN_TTL });
}

export function signRefreshToken(
  payload: { sub: string; family: string },
  secret: string,
): string {
  // jti (JWT ID) guarantees uniqueness even when two tokens in the same family
  // are minted within the same second (rotation produces a different string).
  return jwt.sign({ ...payload, jti: crypto.randomUUID() }, secret, {
    expiresIn: `${REFRESH_TOKEN_TTL_DAYS}d`,
  });
}

export function verifyToken<T = LitPlayJwtPayload>(token: string, secret: string): T {
  return jwt.verify(token, secret) as T;
}

/**
 * Hash a refresh token for storage (never store raw tokens).
 * Uses deterministic SHA-256 so we can look up the record on rotation.
 * (bcrypt is for *passwords* — verified by compare, not lookup.)
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function compareToken(token: string, hash: string): Promise<boolean> {
  const a = Buffer.from(hashToken(token), 'hex');
  const b = Buffer.from(hash, 'hex');
  return Promise.resolve(a.length === b.length && timingSafeEqual(a, b));
}

/** Hash a password (bcrypt). */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * COPPA check (§17.1): determine whether a user requires parental consent.
 * Any student under 13 at registration requires consent before data collection.
 */
export function requiresParentalConsent(
  role: string,
  dateOfBirth?: string,
): boolean {
  if (role !== 'student' || !dateOfBirth) return false;
  const dob = new Date(dateOfBirth);
  const ageMs = Date.now() - dob.getTime();
  const ageYears = ageMs / (365.25 * 24 * 60 * 60 * 1000);
  return ageYears < 13;
}

/**
 * Join-code generator (§19.1): 6-char alphanumeric.
 */
export function generateJoinCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusing chars
  let code = '';
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  for (let i = 0; i < 6; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}
