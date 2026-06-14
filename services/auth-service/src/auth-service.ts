/**
 * Auth business logic (§16, §17 COPPA, §16.3 token rotation).
 *
 * This module is pure with respect to HTTP — it takes a repository + event bus
 * and exposes domain operations. Routes are a thin wrapper.
 */

import {
  TOPICS,
  buildEvent,
  type AuthTokens,
  type ConsentRequest,
} from '@litplay/contracts';
import {
  type AuthRepository,
  type ConsentRecord,
  type RefreshTokenRecord,
  type UserRecord,
} from './repo/auth-repo.js';
import {
  hashPassword,
  hashToken,
  requiresParentalConsent,
  signAccessToken,
  signRefreshToken,
  verifyPassword,
  verifyToken,
  REFRESH_TOKEN_TTL_SEC,
  type LitPlayJwtPayload,
} from '@litplay/server-kit';
import type { EventBus } from '@litplay/server-kit';

export class DuplicateEmailError extends Error {
  statusCode = 409;
  code = 'EMAIL_EXISTS';
}
export class InvalidCredentialsError extends Error {
  statusCode = 401;
  code = 'INVALID_CREDENTIALS';
}
export class ConsentPendingError extends Error {
  statusCode = 403;
  code = 'CONSENT_PENDING';
}
export class InvalidRefreshTokenError extends Error {
  statusCode = 401;
  code = 'INVALID_REFRESH_TOKEN';
}
export class TokenReuseError extends Error {
  statusCode = 401;
  code = 'TOKEN_REUSE_DETECTED';
}
export class NotFoundError extends Error {
  statusCode = 404;
  code = 'NOT_FOUND';
}
export class ForbiddenError extends Error {
  statusCode = 403;
  code = 'FORBIDDEN';
}
export class InvalidTokenError extends Error {
  statusCode = 400;
  code = 'INVALID_TOKEN';
}

const JWT_SECRET = () => process.env.JWT_ACCESS_SECRET ?? 'dev-secret-change-me';
const JWT_REFRESH_SECRET = () =>
  process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret-change-me';

export interface AuthServiceDeps {
  repo: AuthRepository;
  eventBus: EventBus;
}

export class AuthService {
  constructor(private deps: AuthServiceDeps) {}

  // --- Registration (FR-050, FR-051, §17.1) ---

  async register(input: {
    email: string;
    password: string;
    role: 'student' | 'parent' | 'teacher';
    displayName?: string;
    dateOfBirth?: string;
    locale?: string;
    parentId?: string;
  }): Promise<{ user: UserRecord; requiresConsent: boolean }> {
    const existing = await this.deps.repo.findUserByEmail(input.email);
    if (existing) throw new DuplicateEmailError('Email already registered');

    const needsConsent = requiresParentalConsent(input.role, input.dateOfBirth);
    const now = new Date().toISOString();

    const user: UserRecord = {
      id: crypto.randomUUID(),
      email: input.email,
      passwordHash: await hashPassword(input.password),
      role: input.role,
      displayName: input.displayName,
      dateOfBirth: input.dateOfBirth,
      locale: input.locale ?? 'en-US',
      requiresParentalConsent: needsConsent,
      parentId: input.parentId ?? null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    await this.deps.repo.createUser(user);

    // §17.1 — create pending consent record for under-13 students
    if (needsConsent) {
      const consent: ConsentRecord = {
        id: crypto.randomUUID(),
        childId: user.id,
        parentId: input.parentId ?? null,
        status: 'pending',
        consentMethod: null,
        consentedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      await this.deps.repo.createConsent(consent);
    }

    // Emit user.created (§15.3) — notification-service sends welcome/consent email
    await this.deps.eventBus.publish(
      buildEvent(
        TOPICS.AUTH_USER_CREATED,
        'auth-service',
        {
          userId: user.id,
          email: user.email,
          role: user.role,
          requiresParentalConsent: needsConsent,
        },
        user.id,
      ),
    );

    return { user, requiresConsent: needsConsent };
  }

  // --- Login (FR-050, §16) ---

  async login(
    email: string,
    password: string,
    deviceId?: string,
  ): Promise<{ tokens: AuthTokens; user: UserRecord }> {
    const user = await this.deps.repo.findUserByEmail(email);
    if (!user || !user.passwordHash) {
      throw new InvalidCredentialsError('Invalid email or password');
    }
    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) throw new InvalidCredentialsError('Invalid email or password');

    // §17.1 rule 3 — block login until consent verified
    if (user.requiresParentalConsent) {
      const consent = await this.deps.repo.findConsentByChild(user.id);
      if (!consent || consent.status !== 'verified') {
        throw new ConsentPendingError(
          'Waiting for parental consent. Ask a parent to check their email.',
        );
      }
    }

    const tokens = await this.issueTokens(user, deviceId);
    return { tokens, user };
  }

  // --- Google OAuth (FR-050, §11.2) ---

  /**
   * Exchange a Google ID token for LitPlay tokens.
   * In production, verifies the Google ID token via Google's tokeninfo endpoint.
   * Creates a new user if the email doesn't exist, or links to existing.
   */
  async googleOAuth(idToken: string, deviceId?: string): Promise<{ tokens: AuthTokens; user: UserRecord }> {
    const payload = await this.verifyGoogleIdToken(idToken);
    const email = payload.email as string;
    if (!email || payload.email_verified === false) {
      throw new InvalidTokenError('Google ID token missing a verified email');
    }

    // Check if user exists
    let user = await this.deps.repo.findUserByEmail(email);
    if (!user) {
      // Create OAuth-only account (no password)
      const now = new Date().toISOString();
      user = {
        id: crypto.randomUUID(),
        email,
        passwordHash: null,
        role: 'parent', // default; OAuth users are typically parents/teachers
        displayName: payload.name as string | undefined,
        locale: (payload.locale as string) ?? 'en-US',
        requiresParentalConsent: false,
        parentId: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      await this.deps.repo.createUser(user);

      // Store OAuth connection
      await this.deps.repo.createOAuthConnection({
        id: crypto.randomUUID(),
        userId: user.id,
        provider: 'google',
        providerSubject: payload.sub as string,
        createdAt: now,
        updatedAt: now,
      });

      await this.deps.eventBus.publish(
        buildEvent(
          TOPICS.AUTH_USER_CREATED,
          'auth-service',
          { userId: user.id, email, role: user.role, requiresParentalConsent: false },
          user.id,
        ),
      );
    }

    const tokens = await this.issueTokens(user, deviceId);
    return { tokens, user };
  }

  private async verifyGoogleIdToken(idToken: string): Promise<Record<string, unknown>> {
    // Unit tests use unsigned fixture JWTs. Production and non-test environments
    // must delegate verification to Google and validate the OAuth client audience.
    if (process.env.NODE_ENV === 'test' || process.env.AUTH_ALLOW_UNVERIFIED_OAUTH_FOR_TESTS === 'true') {
      return this.decodeJwtPayload(idToken);
    }

    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    if (!clientId) {
      throw new InvalidTokenError('GOOGLE_OAUTH_CLIENT_ID is required for Google OAuth');
    }

    const response = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
    );
    if (!response.ok) throw new InvalidTokenError('Google ID token verification failed');
    const payload = await response.json() as Record<string, unknown>;

    if (payload.aud !== clientId) throw new InvalidTokenError('Google ID token audience mismatch');
    if (payload.iss !== 'accounts.google.com' && payload.iss !== 'https://accounts.google.com') {
      throw new InvalidTokenError('Google ID token issuer mismatch');
    }
    const exp = Number(payload.exp ?? 0);
    if (!exp || exp * 1000 <= Date.now()) throw new InvalidTokenError('Google ID token expired');
    return payload;
  }

  private decodeJwtPayload(jwt: string): Record<string, unknown> {
    const parts = jwt.split('.');
    if (parts.length !== 3) throw new InvalidTokenError('Malformed JWT');
    const payload = Buffer.from(parts[1], 'base64url').toString('utf-8');
    return JSON.parse(payload);
  }

  // --- Password reset (§11.2) ---

  async requestPasswordReset(email: string): Promise<{ resetToken: string }> {
    const user = await this.deps.repo.findUserByEmail(email);
    if (!user) {
      // Don't reveal whether email exists (security best practice)
      return { resetToken: '' };
    }

    // Generate a single-use reset token (expires in 1 hour)
    const resetToken = crypto.randomUUID() + crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await this.deps.repo.storePasswordResetToken(user.id, hashToken(resetToken), expiresAt);

    // In production: send email with reset link containing the token
    // notification-service would handle this via an event
    return { resetToken };
  }

  async confirmPasswordReset(token: string, newPassword: string): Promise<void> {
    const hashedToken = hashToken(token);
    const record = await this.deps.repo.findPasswordResetToken(hashedToken);
    if (!record || record.expiresAt < new Date().toISOString() || record.usedAt) {
      throw new InvalidTokenError('Password reset token is invalid or expired');
    }

    const user = await this.deps.repo.findUserById(record.userId);
    if (!user || user.deletedAt) throw new NotFoundError('User not found');

    const passwordHash = await hashPassword(newPassword);
    await this.deps.repo.updateUserPassword(user.id, passwordHash);
    await this.deps.repo.markPasswordResetUsed(record.id);

    // Revoke all refresh tokens for this user (force re-login everywhere)
    await this.deps.repo.revokeAllUserTokens(user.id);
  }

  // --- Refresh rotation (§16.3 rules 4–5: single-use + reuse detection) ---

  async refresh(refreshToken: string, deviceId?: string): Promise<AuthTokens> {
    return (await this.refreshSession(refreshToken, deviceId)).tokens;
  }

  async refreshSession(
    refreshToken: string,
    deviceId?: string,
  ): Promise<{ tokens: AuthTokens; user: UserRecord }> {
    let payload: { sub: string; family: string };
    try {
      payload = verifyToken(refreshToken, JWT_REFRESH_SECRET());
    } catch {
      throw new InvalidRefreshTokenError('Refresh token is invalid or expired');
    }

    const hash = hashToken(refreshToken);
    const record = await this.deps.repo.findRefreshTokenByHash(hash);

    if (!record) {
      // Token is valid JWT but not in our store → potential reuse. Revoke family.
      await this.deps.repo.revokeTokenFamily(payload.family);
      throw new TokenReuseError(
        'Refresh token not recognised — token family revoked for security.',
      );
    }

    if (record.revokedAt) {
      // Reuse of an already-revoked token → revoke entire family (§16.3 rule 5)
      await this.deps.repo.revokeTokenFamily(record.family);
      throw new TokenReuseError(
        'Refresh token already used — token family revoked for security.',
      );
    }

    // Rotate: revoke old, issue new in same family
    await this.deps.repo.revokeRefreshToken(record.id);

    const user = await this.deps.repo.findUserById(payload.sub);
    if (!user || user.deletedAt) throw new InvalidRefreshTokenError('User not found');

    const tokens = await this.issueTokens(user, deviceId, payload.family);
    return { tokens, user };
  }

  // --- Logout (FR) ---

  async logout(refreshToken: string): Promise<void> {
    const hash = hashToken(refreshToken);
    const record = await this.deps.repo.findRefreshTokenByHash(hash);
    if (record) await this.deps.repo.revokeRefreshToken(record.id);
  }

  // --- COPPA consent (§17) ---

  /**
   * Submit parental consent. §17.1 requires verifiable parental consent.
   * The caller MUST be authenticated as a parent, and must be linked to the child.
   */
  async submitConsent(
    req: ConsentRequest,
    authenticatedUserId: string,
    authenticatedUserRole: string,
  ): Promise<ConsentRecord> {
    // §17.1 — only parents (or admins) can submit consent
    if (authenticatedUserRole !== 'parent' && authenticatedUserRole !== 'admin') {
      throw new ForbiddenError('Only parents can provide parental consent');
    }

    // Verify the child exists
    const child = await this.deps.repo.findUserById(req.childId);
    if (!child) throw new NotFoundError('Child account not found');

    if (!child.requiresParentalConsent) {
      throw new ForbiddenError('This account does not require parental consent');
    }

    // §17.1 — verify the authenticated parent is linked to this child.
    // In admin mode, skip the parent-child link check.
    if (authenticatedUserRole === 'parent') {
      const consent = await this.deps.repo.findConsentByChild(req.childId);
      if (consent?.parentId && consent.parentId !== authenticatedUserId) {
        throw new ForbiddenError('You are not the designated parent for this child');
      }
      // Link parent to child if not already linked
      if (!consent?.parentId) {
        await this.deps.repo.linkParentToChild(req.childId, authenticatedUserId);
      }
    }

    return this.deps.repo.updateConsentStatus(
      req.childId,
      'verified',
      req.consentMethod,
      authenticatedUserRole === 'admin' ? undefined : authenticatedUserId,
    );
  }

  async getConsentStatus(childId: string): Promise<ConsentRecord | null> {
    return this.deps.repo.findConsentByChild(childId);
  }

  // --- Profile (§11.2 GET/PATCH /auth/me) ---

  async getUserProfile(userId: string): Promise<UserRecord> {
    const user = await this.deps.repo.findUserById(userId);
    if (!user) throw new NotFoundError('User not found');
    return user;
  }

  async updateProfile(
    userId: string,
    updates: { displayName?: string; locale?: string },
  ): Promise<UserRecord> {
    const user = await this.deps.repo.findUserById(userId);
    if (!user) throw new NotFoundError('User not found');

    const patch: Partial<UserRecord> = { updatedAt: new Date().toISOString() };
    if (updates.displayName !== undefined) patch.displayName = updates.displayName;
    if (updates.locale !== undefined) patch.locale = updates.locale;

    return this.deps.repo.updateUser(userId, patch);
  }

  // --- Account deletion (FR-053, §17.3) ---

  async deleteAccount(userId: string): Promise<void> {
    await this.deps.repo.revokeAllUserTokens(userId);
    await this.deps.repo.softDeleteUser(userId);
    // §17.3 — publish deletion event; all services purge within 72h
    await this.deps.eventBus.publish(
      buildEvent(
        TOPICS.AUTH_USER_DELETED,
        'auth-service',
        { userId },
        userId,
      ),
    );
  }

  // --- Internal helpers ---

  private async issueTokens(
    user: UserRecord,
    deviceId: string | undefined,
    existingFamily?: string,
  ): Promise<AuthTokens> {
    const childIds = user.role === 'parent'
      ? (await this.deps.repo.listChildrenForParent(user.id)).map((child) => child.id)
      : undefined;

    const jwtPayload: Omit<LitPlayJwtPayload, 'iat' | 'exp'> = {
      sub: user.id,
      email: user.email,
      role: user.role,
      parentId: user.parentId ?? undefined,
      childIds,
      // Teacher student scoping is supplied by classroom-aware service tokens or
      // checked in classroom-service routes. Do not grant broad access here.
      studentIds: user.role === 'teacher' ? [] : undefined,
    };

    const accessToken = signAccessToken(jwtPayload, JWT_SECRET());
    const family = existingFamily ?? crypto.randomUUID();
    const refreshToken = signRefreshToken({ sub: user.id, family }, JWT_REFRESH_SECRET());

    // Store the refresh-token hash (never the raw token)
    const now = new Date();
    const record: RefreshTokenRecord = {
      id: crypto.randomUUID(),
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      family,
      issuedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_SEC * 1000).toISOString(),
      revokedAt: null,
      deviceId,
    };
    await this.deps.repo.storeRefreshToken(record);

    return {
      accessToken,
      refreshToken,
      expiresIn: 15 * 60,
    };
  }
}
