-- ============================================================
-- content_db migrations (§10.4, §18 of the SSOT)
-- ============================================================

CREATE TYPE difficulty AS ENUM ('Easy', 'Medium', 'Hard');

CREATE TABLE worlds (
    id               UUID PRIMARY KEY,
    title            VARCHAR(255) NOT NULL,
    grade_level      VARCHAR(20) NOT NULL,
    lexile_range     VARCHAR(30) NOT NULL,
    language         VARCHAR(10) NOT NULL DEFAULT 'en-US',
    tags             TEXT[] DEFAULT '{}',
    thumbnail_url    TEXT,
    asset_bundle_url TEXT NOT NULL,
    manifest_version VARCHAR(50) NOT NULL DEFAULT '1',
    checksum_sha256  CHAR(64),            -- integrity (§18.2)
    is_published     BOOLEAN DEFAULT FALSE,
    created_at       TIMESTAMPTZ NOT NULL,
    updated_at       TIMESTAMPTZ NOT NULL,
    deleted_at       TIMESTAMPTZ
);

CREATE TABLE scenes (
    id                UUID PRIMARY KEY,
    world_id          UUID NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
    title             VARCHAR(255) NOT NULL,
    scene_index       INTEGER NOT NULL,
    estimated_minutes INTEGER DEFAULT 5,
    created_at        TIMESTAMPTZ NOT NULL,
    updated_at        TIMESTAMPTZ NOT NULL,
    UNIQUE (world_id, scene_index)
);

CREATE TABLE gates (
    id           UUID PRIMARY KEY,
    scene_id     UUID NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
    passage      TEXT NOT NULL,
    difficulty   difficulty NOT NULL DEFAULT 'Easy',
    max_retries  SMALLINT NOT NULL DEFAULT 3,
    order_index  INTEGER NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL,
    updated_at   TIMESTAMPTZ NOT NULL,
    UNIQUE (scene_id, order_index)
);

CREATE TABLE assignments (
    id           UUID PRIMARY KEY,
    content_id   UUID NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
    student_id   UUID,                   -- mutually exclusive with classroom_id
    classroom_id UUID,
    assigned_by  UUID NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL,
    updated_at   TIMESTAMPTZ NOT NULL,
    CONSTRAINT chk_assignment_target CHECK (
        (student_id IS NOT NULL AND classroom_id IS NULL)
        OR (student_id IS NULL AND classroom_id IS NOT NULL)
    )
);

CREATE INDEX idx_scenes_world ON scenes (world_id, scene_index);
CREATE INDEX idx_gates_scene ON gates (scene_id, order_index);
CREATE INDEX idx_assignments_student ON assignments (student_id);
CREATE INDEX idx_assignments_classroom ON assignments (classroom_id);
CREATE INDEX idx_worlds_published ON worlds (is_published) WHERE deleted_at IS NULL;
