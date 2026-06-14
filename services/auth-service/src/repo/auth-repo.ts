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
  listChildrenForParent(parentId: string): Promise<UserRecord[]>;

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

  async listChildrenForParent(parentId: string): Promise<UserRecord[]> {
    return [...this.users.values()].filter(
      (u) => u.role === 'student' && u.parentId === parentId && !u.deletedAt,
    );
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

// --- PostgreSQL implementation (production) ---------------------------------

import { Pool } from 'pg';

type UserRow = {
  id: string; email: string; password_hash: string | null; role: UserRole;
  display_name: string | null; date_of_birth: Date | string | null; locale: string;
  requires_parental_consent: boolean; parent_id: string | null;
  created_at: Date | string; updated_at: Date | string; deleted_at: Date | string | null;
};

type RefreshRow = {
  id: string; user_id: string; token_hash: string; token_family: string;
  issued_at: Date | string; expires_at: Date | string; revoked_at: Date | string | null; device_id: string | null;
};

type ConsentRow = {
  id: string; child_id: string; parent_id: string | null; status: ConsentStatus;
  consent_method: string | null; consented_at: Date | string | null; created_at: Date | string; updated_at: Date | string;
};

type PasswordResetRow = {
  id: string; user_id: string; token_hash: string; expires_at: Date | string; used_at: Date | string | null; created_at: Date | string;
};

function iso(v: Date | string | null | undefined): string | null {
  if (v == null) return null;
  return v instanceof Date ? v.toISOString() : new Date(v).toISOString();
}

function mapUser(r: UserRow): UserRecord {
  return {
    id: r.id,
    email: r.email,
    passwordHash: r.password_hash,
    role: r.role,
    displayName: r.display_name ?? undefined,
    dateOfBirth: r.date_of_birth ? String(r.date_of_birth).slice(0, 10) : undefined,
    locale: r.locale,
    requiresParentalConsent: r.requires_parental_consent,
    parentId: r.parent_id,
    createdAt: iso(r.created_at)!,
    updatedAt: iso(r.updated_at)!,
    deletedAt: iso(r.deleted_at),
  };
}

function mapRefresh(r: RefreshRow): RefreshTokenRecord {
  return {
    id: r.id,
    userId: r.user_id,
    tokenHash: r.token_hash,
    family: r.token_family,
    issuedAt: iso(r.issued_at)!,
    expiresAt: iso(r.expires_at)!,
    revokedAt: iso(r.revoked_at),
    deviceId: r.device_id ?? undefined,
  };
}

function mapConsent(r: ConsentRow): ConsentRecord {
  return {
    id: r.id,
    childId: r.child_id,
    parentId: r.parent_id,
    status: r.status,
    consentMethod: r.consent_method,
    consentedAt: iso(r.consented_at),
    createdAt: iso(r.created_at)!,
    updatedAt: iso(r.updated_at)!,
  };
}

export class PostgresAuthRepository implements AuthRepository {
  private pool: Pool;
  constructor(connectionString = process.env.DATABASE_URL) {
    if (!connectionString) throw new Error('DATABASE_URL is required for PostgresAuthRepository');
    this.pool = new Pool({ connectionString });
  }

  async createUser(u: UserRecord): Promise<UserRecord> {
    const { rows } = await this.pool.query<UserRow>(
      `INSERT INTO users (id,email,password_hash,role,display_name,date_of_birth,locale,requires_parental_consent,parent_id,created_at,updated_at,deleted_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [u.id,u.email,u.passwordHash,u.role,u.displayName ?? null,u.dateOfBirth ?? null,u.locale,u.requiresParentalConsent,u.parentId,u.createdAt,u.updatedAt,u.deletedAt],
    );
    return mapUser(rows[0]);
  }

  async findUserByEmail(email: string): Promise<UserRecord | null> {
    const { rows } = await this.pool.query<UserRow>('SELECT * FROM users WHERE lower(email)=lower($1) AND deleted_at IS NULL LIMIT 1', [email]);
    return rows[0] ? mapUser(rows[0]) : null;
  }

  async findUserById(id: string): Promise<UserRecord | null> {
    const { rows } = await this.pool.query<UserRow>('SELECT * FROM users WHERE id=$1 LIMIT 1', [id]);
    return rows[0] ? mapUser(rows[0]) : null;
  }

  async updateUser(id: string, patch: Partial<UserRecord>): Promise<UserRecord> {
    const current = await this.findUserById(id);
    if (!current) throw new Error(`User ${id} not found`);
    const next = { ...current, ...patch };
    const { rows } = await this.pool.query<UserRow>(
      `UPDATE users SET display_name=$2, locale=$3, requires_parental_consent=$4, parent_id=$5, updated_at=$6, deleted_at=$7 WHERE id=$1 RETURNING *`,
      [id,next.displayName ?? null,next.locale,next.requiresParentalConsent,next.parentId,next.updatedAt,next.deletedAt],
    );
    return mapUser(rows[0]);
  }

  async updateUserPassword(id: string, passwordHash: string): Promise<void> {
    await this.pool.query('UPDATE users SET password_hash=$2, updated_at=now() WHERE id=$1', [id, passwordHash]);
  }
  async softDeleteUser(id: string): Promise<void> {
    await this.pool.query('UPDATE users SET deleted_at=now(), updated_at=now() WHERE id=$1', [id]);
  }

  async listChildrenForParent(parentId: string): Promise<UserRecord[]> {
    const { rows } = await this.pool.query<UserRow>(
      "SELECT * FROM users WHERE role='student' AND parent_id=$1 AND deleted_at IS NULL ORDER BY created_at",
      [parentId],
    );
    return rows.map(mapUser);
  }

  async storeRefreshToken(t: RefreshTokenRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO refresh_tokens (id,user_id,token_hash,token_family,issued_at,expires_at,revoked_at,device_id,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now(),now())`,
      [t.id,t.userId,t.tokenHash,t.family,t.issuedAt,t.expiresAt,t.revokedAt,t.deviceId ?? null],
    );
  }
  async findRefreshTokenByHash(hash: string): Promise<RefreshTokenRecord | null> {
    const { rows } = await this.pool.query<RefreshRow>('SELECT * FROM refresh_tokens WHERE token_hash=$1 LIMIT 1', [hash]);
    return rows[0] ? mapRefresh(rows[0]) : null;
  }
  async revokeRefreshToken(id: string): Promise<void> { await this.pool.query('UPDATE refresh_tokens SET revoked_at=COALESCE(revoked_at, now()), updated_at=now() WHERE id=$1', [id]); }
  async revokeTokenFamily(family: string): Promise<void> { await this.pool.query('UPDATE refresh_tokens SET revoked_at=COALESCE(revoked_at, now()), updated_at=now() WHERE token_family=$1', [family]); }
  async revokeAllUserTokens(userId: string): Promise<void> { await this.pool.query('UPDATE refresh_tokens SET revoked_at=COALESCE(revoked_at, now()), updated_at=now() WHERE user_id=$1', [userId]); }

  async createConsent(c: ConsentRecord): Promise<ConsentRecord> {
    const { rows } = await this.pool.query<ConsentRow>(
      `INSERT INTO parental_consents (id,child_id,parent_id,status,consent_method,consented_at,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [c.id,c.childId,c.parentId,c.status,c.consentMethod,c.consentedAt,c.createdAt,c.updatedAt],
    );
    return mapConsent(rows[0]);
  }
  async findConsentByChild(childId: string): Promise<ConsentRecord | null> {
    const { rows } = await this.pool.query<ConsentRow>('SELECT * FROM parental_consents WHERE child_id=$1 LIMIT 1', [childId]);
    return rows[0] ? mapConsent(rows[0]) : null;
  }
  async updateConsentStatus(childId: string, status: ConsentStatus, consentMethod?: string, parentId?: string): Promise<ConsentRecord> {
    const { rows } = await this.pool.query<ConsentRow>(
      `UPDATE parental_consents SET status=$2, consent_method=COALESCE($3, consent_method), parent_id=COALESCE($4, parent_id), consented_at=CASE WHEN $2='verified' THEN now() ELSE consented_at END, updated_at=now() WHERE child_id=$1 RETURNING *`,
      [childId,status,consentMethod ?? null,parentId ?? null],
    );
    if (!rows[0]) throw new Error(`Consent not found for child ${childId}`);
    return mapConsent(rows[0]);
  }
  async linkParentToChild(childId: string, parentId: string): Promise<void> {
    await this.pool.query('UPDATE users SET parent_id=$2, updated_at=now() WHERE id=$1', [childId,parentId]);
    await this.pool.query('UPDATE parental_consents SET parent_id=$2, updated_at=now() WHERE child_id=$1', [childId,parentId]);
  }

  async createOAuthConnection(c: OAuthConnectionRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO oauth_connections (id,user_id,provider,provider_subject,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (provider, provider_subject) DO NOTHING`,
      [c.id,c.userId,c.provider,c.providerSubject,c.createdAt,c.updatedAt],
    );
  }
  async storePasswordResetToken(userId: string, tokenHash: string, expiresAt: string): Promise<void> {
    await this.pool.query(
      'INSERT INTO password_reset_tokens (id,user_id,token_hash,expires_at,used_at,created_at) VALUES ($1,$2,$3,$4,NULL,now())',
      [crypto.randomUUID(), userId, tokenHash, expiresAt],
    );
  }
  async findPasswordResetToken(tokenHash: string): Promise<PasswordResetTokenRecord | null> {
    const { rows } = await this.pool.query<PasswordResetRow>('SELECT * FROM password_reset_tokens WHERE token_hash=$1 LIMIT 1', [tokenHash]);
    const r = rows[0];
    return r ? { id:r.id, userId:r.user_id, tokenHash:r.token_hash, expiresAt:iso(r.expires_at)!, usedAt:iso(r.used_at), createdAt:iso(r.created_at)! } : null;
  }
  async markPasswordResetUsed(id: string): Promise<void> { await this.pool.query('UPDATE password_reset_tokens SET used_at=now() WHERE id=$1', [id]); }
}
