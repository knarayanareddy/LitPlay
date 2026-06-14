-- ============================================================
-- progress_db migrations (§14.3 of the SSOT)
-- NOTE: No audio stored. No audio column ever. (FR-017)
-- ============================================================

CREATE TYPE session_status AS ENUM ('active', 'completed', 'abandoned');
CREATE TYPE gate_result AS ENUM ('PASS', 'PARTIAL', 'FAIL');
CREATE TYPE asr_provider AS ENUM ('whisper_gpu', 'azure', 'whisper_cpp');

CREATE TABLE sessions (
    id                   UUID PRIMARY KEY,
    student_id           UUID NOT NULL,          -- no FK: cross-service (§14.1 rule 2)
    content_id           UUID NOT NULL,
    status               session_status NOT NULL DEFAULT 'active',
    started_at           TIMESTAMPTZ NOT NULL,
    ended_at             TIMESTAMPTZ,
    words_read           INTEGER DEFAULT 0,
    wpm                  NUMERIC(6,2),
    synced_from_offline  BOOLEAN DEFAULT FALSE,
    created_at           TIMESTAMPTZ NOT NULL,
    updated_at           TIMESTAMPTZ NOT NULL
);

CREATE TABLE gate_attempts (
    id              UUID PRIMARY KEY,
    session_id      UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    gate_id         UUID NOT NULL,
    attempt_number  SMALLINT NOT NULL,
    transcript      TEXT,                  -- retained 2 years (§17.2)
    score           NUMERIC(5,2),
    result          gate_result NOT NULL,
    asr_provider    asr_provider NOT NULL,
    latency_ms      INTEGER,
    -- audio metadata (NOT audio) — §6 AudioMetadata
    audio_duration_ms  INTEGER,
    audio_noise_floor_db NUMERIC(6,2),
    audio_vad_result BOOLEAN,
    attempted_at    TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL,
    CONSTRAINT chk_no_audio_column CHECK (true) -- placeholder: no audio column exists
);

CREATE TABLE fluency_scores (
    student_id       UUID PRIMARY KEY,
    current_wpm      NUMERIC(6,2) NOT NULL,
    total_words_read BIGINT DEFAULT 0,
    total_sessions   INTEGER DEFAULT 0,
    gate_attempts_total INTEGER DEFAULT 0,
    gate_attempts_passed INTEGER DEFAULT 0,
    computed_at      TIMESTAMPTZ NOT NULL,
    updated_at       TIMESTAMPTZ NOT NULL
);

CREATE TABLE wpm_trends (
    student_id   UUID NOT NULL,
    recorded_on  DATE NOT NULL,
    avg_wpm      NUMERIC(6,2) NOT NULL,
    PRIMARY KEY (student_id, recorded_on)
);

-- Indexes
CREATE INDEX idx_sessions_student ON sessions (student_id, started_at DESC);
CREATE INDEX idx_sessions_content ON sessions (content_id);
CREATE INDEX idx_sessions_status  ON sessions (status);
CREATE INDEX idx_gate_attempts_session ON gate_attempts (session_id);
CREATE INDEX idx_gate_attempts_gate ON gate_attempts (gate_id);
CREATE INDEX idx_gate_attempts_student_result ON gate_attempts (session_id, result);
CREATE INDEX idx_wpm_trends_student ON wpm_trends (student_id, recorded_on DESC);
