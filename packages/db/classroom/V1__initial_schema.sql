-- ============================================================
-- classroom_db migrations (§10.6 of the SSOT)
-- ============================================================

CREATE TYPE classroom_member_role AS ENUM ('student', 'teacher');

CREATE TABLE classrooms (
    id          UUID PRIMARY KEY,
    name        VARCHAR(255) NOT NULL,
    teacher_id  UUID NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL,
    deleted_at  TIMESTAMPTZ
);

CREATE TABLE join_codes (
    classroom_id UUID PRIMARY KEY REFERENCES classrooms(id) ON DELETE CASCADE,
    code         VARCHAR(6) UNIQUE NOT NULL,
    expires_at   TIMESTAMPTZ NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL,
    CONSTRAINT chk_code_format CHECK (code ~ '^[A-Z0-9]{6}$')
);

CREATE TABLE classroom_members (
    classroom_id UUID NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
    user_id      UUID NOT NULL,
    role         classroom_member_role NOT NULL,
    joined_at    TIMESTAMPTZ NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL,
    updated_at   TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (classroom_id, user_id)
);

CREATE TABLE student_goals (
    student_id        UUID NOT NULL,
    classroom_id      UUID NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
    target_wpm        INTEGER NOT NULL DEFAULT 60,
    minutes_per_week  INTEGER NOT NULL DEFAULT 60,
    created_at        TIMESTAMPTZ NOT NULL,
    updated_at        TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (student_id, classroom_id)
);

CREATE INDEX idx_members_user ON classroom_members (user_id);
CREATE INDEX idx_members_role ON classroom_members (classroom_id, role);
