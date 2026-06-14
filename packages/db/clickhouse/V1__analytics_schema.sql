-- ============================================================
-- ClickHouse analytics schema (§14.4)
-- Partitioned by month for efficient time-range queries.
-- ============================================================

CREATE DATABASE IF NOT EXISTS litplay_analytics;

CREATE TABLE IF NOT EXISTS litplay_analytics.gate_events (
    event_id      UUID,
    student_id    UUID,
    content_id    UUID,
    gate_id       UUID,
    result        LowCardinality(String),  -- PASS | PARTIAL | FAIL
    score         Float32,
    latency_ms    UInt32,
    asr_provider  LowCardinality(String),   -- whisper_gpu | azure | whisper_cpp
    is_offline    UInt8,
    event_time    DateTime
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(event_time)
ORDER BY (student_id, event_time);

CREATE TABLE IF NOT EXISTS litplay_analytics.session_summary (
    session_id    UUID,
    student_id    UUID,
    content_id    UUID,
    grade_level   LowCardinality(String),
    words_read    UInt32,
    wpm           Float32,
    gates_passed  UInt16,
    gates_total   UInt16,
    duration_sec  UInt32,
    session_date  Date
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(session_date)
ORDER BY (student_id, session_date);
