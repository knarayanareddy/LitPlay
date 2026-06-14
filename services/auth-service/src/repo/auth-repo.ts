/**
 * Auth repository interface + in-memory implementation (§10.2, §16, §17).
 *
 * The interface mirrors the production Prisma-backed repository. Tests use
 * the in-memory implementation so they run without a database.
 */

import type { ConsentStatus, UserRole } from '@litplay/contracts';

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string | null;
  role: UserRole;
  displayName?: string;
  dateOfBirth?: string;
  locale: string;
  requiresParentalConsent: boolean;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface RefreshTokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  family: string;
  issuedAt: string;
  expiresAt: string;
  revokedAt: string | null;
  deviceId?: string;
}

export interface ConsentRecord {
  id: string;
  childId: string;
  parentId: string | null;
  status: ConsentStatus;
  consentMethod: string | null;
  consentedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OAuthConnectionRecord {
  id: string;
  userId: string;
  provider: string;
  providerSubject: string;
  createdAt: string;
  updatedAt: string;
}

export interface PasswordResetTokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
}

export interface AuthRepository {
  createUser(user: UserRecord): Promise<UserRecord>;
  findUserByEmail(email: string): Promise<UserRecord | null>;
  findUserById(id: string): Promise<UserRecord | null>;
  updateUser(id: string, patch: Partial<UserRecord>): Promise<UserRecord>;
  updateUserPassword(id: string, passwordHash: string): Promise<void>;
  softDeleteUser(id: string): Promise<void>;

  storeRefreshToken(token: RefreshTokenRecord): Promise<void>;
  findRefreshTokenByHash(hash: string): Promise<RefreshTokenRecord | null>;
  revokeRefreshToken(id: string): Promise<void>;
  revokeTokenFamily(family: string): Promise<void>;
  revokeAllUserTokens(userId: string): Promise<void>;

  createConsent(consent: ConsentRecord): Promise<ConsentRecord>;
  findConsentByChild(childId: string): Promise<ConsentRecord | null>;
  updateConsentStatus(
    childId: string,
    status: ConsentStatus,
    consentMethod?: string,
    parentId?: string,
  ): Promise<ConsentRecord>;
  linkParentToChild(childId: string, parentId: string): Promise<void>;

  createOAuthConnection(conn: OAuthConnectionRecord): Promise<void>;

  storePasswordResetToken(userId: string, tokenHash: string, expiresAt: string): Promise<void>;
  findPasswordResetToken(tokenHash: string): Promise<PasswordResetTokenRecord | null>;
  markPasswordResetUsed(id: string): Promise<void>;
}

/** In-memory implementation — used by unit tests and local dev. */
export class InMemoryAuthRepository implements AuthRepository {
  users = new Map<string, UserRecord>();
  refreshTokens = new Map<string, RefreshTokenRecord>();
  consents = new Map<string, ConsentRecord>();
  oauthConnections = new Map<string, OAuthConnectionRecord>();
  passwordResetTokens = new Map<string, PasswordResetTokenRecord>();

  async createUser(user: UserRecord): Promise<UserRecord> {
    this.users.set(user.id, user);
    return user;
  }

  async findUserByEmail(email: string): Promise<UserRecord | null> {
    for (const u of this.users.values()) {
      if (u.email.toLowerCase() === email.toLowerCase() && !u.deletedAt) return u;
    }
    return null;
  }

  async findUserById(id: string): Promise<UserRecord | null> {
    return this.users.get(id) ?? null;
  }

  async updateUser(id: string, patch: Partial<UserRecord>): Promise<UserRecord> {
    const u = this.users.get(id);
    if (!u) throw new Error(`User ${id} not found`);
    Object.assign(u, patch);
    return u;
  }

  async updateUserPassword(id: string, passwordHash: string): Promise<void> {
    const u = this.users.get(id);
    if (u) u.passwordHash = passwordHash;
  }

  async softDeleteUser(id: string): Promise<void> {
    const u = this.users.get(id);
    if (u) {
      u.deletedAt = new Date().toISOString();
      u.updatedAt = new Date().toISOString();
    }
  }

  async storeRefreshToken(token: RefreshTokenRecord): Promise<void> {
    this.refreshTokens.set(token.id, token);
  }

  async findRefreshTokenByHash(hash: string): Promise<RefreshTokenRecord | null> {
    for (const t of this.refreshTokens.values()) {
      if (t.tokenHash === hash) return t;
    }
    return null;
  }

  async revokeRefreshToken(id: string): Promise<void> {
    const t = this.refreshTokens.get(id);
    if (t) t.revokedAt = new Date().toISOString();
  }

  async revokeTokenFamily(family: string): Promise<void> {
    for (const t of this.refreshTokens.values()) {
      if (t.family === family) t.revokedAt = new Date().toISOString();
    }
  }

  async revokeAllUserTokens(userId: string): Promise<void> {
    for (const t of this.refreshTokens.values()) {
      if (t.userId === userId) t.revokedAt = new Date().toISOString();
    }
  }

  async createConsent(consent: ConsentRecord): Promise<ConsentRecord> {
    this.consents.set(consent.childId, consent);
    return consent;
  }

  async findConsentByChild(childId: string): Promise<ConsentRecord | null> {
    return this.consents.get(childId) ?? null;
  }

  async updateConsentStatus(
    childId: string,
    status: ConsentStatus,
    consentMethod?: string,
    parentId?: string,
  ): Promise<ConsentRecord> {
    const c = this.consents.get(childId);
    if (!c) throw new Error(`Consent not found for child ${childId}`);
    c.status = status;
    if (consentMethod) c.consentMethod = consentMethod;
    if (parentId) c.parentId = parentId;
    c.consentedAt = status === 'verified' ? new Date().toISOString() : c.consentedAt;
    c.updatedAt = new Date().toISOString();
    return c;
  }

  async linkParentToChild(childId: string, parentId: string): Promise<void> {
    const c = this.consents.get(childId);
    if (c) c.parentId = parentId;
    const u = this.users.get(childId);
    if (u) u.parentId = parentId;
  }

  async createOAuthConnection(conn: OAuthConnectionRecord): Promise<void> {
    this.oauthConnections.set(conn.id, conn);
  }

  async storePasswordResetToken(userId: string, tokenHash: string, expiresAt: string): Promise<void> {
    const record: PasswordResetTokenRecord = {
      id: crypto.randomUUID(),
      userId,
      tokenHash,
      expiresAt,
      usedAt: null,
      createdAt: new Date().toISOString(),
    };
    this.passwordResetTokens.set(tokenHash, record);
  }

  async findPasswordResetToken(tokenHash: string): Promise<PasswordResetTokenRecord | null> {
    return this.passwordResetTokens.get(tokenHash) ?? null;
  }

  async markPasswordResetUsed(id: string): Promise<void> {
    for (const t of this.passwordResetTokens.values()) {
      if (t.id === id) t.usedAt = new Date().toISOString();
    }
  }
}
