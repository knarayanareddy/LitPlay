-- ============================================================
-- notification_db migrations (§10.8 of the SSOT)
-- Delivery log only.
-- ============================================================

CREATE TYPE notification_channel AS ENUM ('email', 'push', 'sms');
CREATE TYPE notification_status AS ENUM ('pending', 'sent', 'delivered', 'failed');

CREATE TABLE device_tokens (
    user_id    UUID NOT NULL,
    token      VARCHAR(500) NOT NULL,
    platform   VARCHAR(20) NOT NULL,          -- 'ios', 'android'
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (user_id, token)
);

CREATE TABLE notification_log (
    id          UUID PRIMARY KEY,
    user_id     UUID NOT NULL,
    channel     notification_channel NOT NULL,
    template    VARCHAR(100) NOT NULL,        -- 'welcome', 'consent_request', 'weekly_digest', etc.
    status      notification_status NOT NULL DEFAULT 'pending',
    subject     VARCHAR(255),
    body        TEXT,
    provider_message_id VARCHAR(255),         -- FCM/APNs/SendGrid id
    error       TEXT,
    sent_at     TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL
);

CREATE TABLE digest_preferences (
    user_id     UUID PRIMARY KEY,
    weekly_digest_enabled BOOLEAN DEFAULT FALSE,
    digest_day_of_week    SMALLINT DEFAULT 0,  -- 0=Sunday
    digest_hour_local     SMALLINT DEFAULT 8,
    timezone              VARCHAR(50) DEFAULT 'America/New_York',
    updated_at            TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_notif_log_user ON notification_log (user_id, created_at DESC);
CREATE INDEX idx_notif_log_status ON notification_log (status) WHERE status IN ('pending', 'failed');
CREATE INDEX idx_device_tokens_user ON device_tokens (user_id);
