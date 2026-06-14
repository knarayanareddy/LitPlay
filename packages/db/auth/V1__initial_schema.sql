-- ============================================================
-- auth_db migrations (§14.2 of the SSOT)
-- Flyway-style versioned migration.
-- ============================================================

CREATE TYPE user_role AS ENUM ('student', 'parent', 'teacher', 'admin');
CREATE TYPE consent_status AS ENUM ('pending', 'verified', 'rejected', 'revoked');

CREATE TABLE users (
    id            UUID PRIMARY KEY,
    email         VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255),          -- NULL for OAuth-only users
    role          user_role NOT NULL,
    display_name  VARCHAR(100),
    date_of_birth DATE,                   -- required for students (COPPA)
    locale        VARCHAR(10) DEFAULT 'en-US',
    requires_parental_consent BOOLEAN NOT NULL DEFAULT FALSE,
    parent_id     UUID REFERENCES users(id),
    created_at    TIMESTAMPTZ NOT NULL,
    updated_at    TIMESTAMPTZ NOT NULL,
    deleted_at    TIMESTAMPTZ
);

CREATE TABLE refresh_tokens (
    id          UUID PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  VARCHAR(255) UNIQUE NOT NULL,
    token_family UUID NOT NULL,           -- for family-level revocation (§16.3)
    issued_at   TIMESTAMPTZ NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked_at  TIMESTAMPTZ,
    device_id   VARCHAR(255),
    created_at  TIMESTAMPTZ NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL
);

CREATE TABLE oauth_connections (
    id            UUID PRIMARY KEY,
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider      VARCHAR(50) NOT NULL,   -- 'google'
    provider_subject VARCHAR(255) NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL,
    updated_at    TIMESTAMPTZ NOT NULL,
    UNIQUE (provider, provider_subject)
);

CREATE TABLE parental_consents (
    id              UUID PRIMARY KEY,
    child_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_id       UUID REFERENCES users(id),
    status          consent_status NOT NULL DEFAULT 'pending',
    consent_method  VARCHAR(50),          -- 'email', 'credit_card', 'form'
    consented_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL,
    updated_at      TIMESTAMPTZ NOT NULL
);

CREATE TABLE password_reset_tokens (
    id          UUID PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  VARCHAR(255) UNIQUE NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL
);

CREATE TABLE deletion_requests (
    id          UUID PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    requested_at TIMESTAMPTZ NOT NULL,
    purged_at   TIMESTAMPTZ,              -- NULL until purge completes
    status      VARCHAR(30) NOT NULL DEFAULT 'pending', -- pending, purged, failed
    created_at  TIMESTAMPTZ NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL
);

-- COPPA: consent records retained 7 years (§17.1)
-- The updated_at trigger keeps this table from being auto-pruned.

-- Indexes
CREATE UNIQUE INDEX idx_users_email_active_unique ON users (lower(email)) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_role  ON users (role);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens (user_id);
CREATE INDEX idx_refresh_tokens_family ON refresh_tokens (token_family);
CREATE INDEX idx_consents_child ON parental_consents (child_id);
CREATE INDEX idx_deletion_status ON deletion_requests (status) WHERE purged_at IS NULL;
