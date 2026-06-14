/**
 * Progress repository interface + in-memory implementation (§10.3, §14.3).
 */

import type {
  GateResult,
  AsrProvider,
  SessionStatus,
} from '@litplay/contracts';

export interface SessionRecord {
  id: string;
  studentId: string;
  contentId: string;
  status: SessionStatus;
  startedAt: string;
  endedAt: string | null;
  wordsRead: number;
  wpm: number | null;
  syncedFromOffline: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GateAttemptRecord {
  id: string;
  sessionId: string;
  gateId: string;
  attemptNumber: number;
  transcript: string | null;
  score: number | null;
  result: GateResult;
  asrProvider: AsrProvider;
  latencyMs: number | null;
  audioDurationMs: number | null;
  audioNoiseFloorDb: number | null;
  audioVadResult: boolean | null;
  attemptedAt: string;
  createdAt: string;
}

export interface FluencyRecord {
  studentId: string;
  currentWpm: number;
  totalWordsRead: number;
  totalSessions: number;
  gateAttemptsTotal: number;
  gateAttemptsPassed: number;
  computedAt: string;
  updatedAt: string;
}

export interface WpmTrendPoint {
  studentId: string;
  recordedOn: string; // ISO date
  avgWpm: number;
}

export interface ProgressRepository {
  /** Upsert session by ID — idempotent for offline sync (§13.3). */
  upsertSession(s: SessionRecord): Promise<SessionRecord>;
  createSession(s: SessionRecord): Promise<SessionRecord>;
  updateSession(id: string, patch: Partial<SessionRecord>): Promise<SessionRecord>;
  getSession(id: string): Promise<SessionRecord | null>;
  listSessions(studentId: string, page: number, limit: number): Promise<SessionRecord[]>;
  addGateAttempt(a: GateAttemptRecord): Promise<GateAttemptRecord>;
  /** Get all gate attempts for a specific session. */
  getAttemptsBySession(sessionId: string): Promise<GateAttemptRecord[]>;
  getFluency(studentId: string): Promise<FluencyRecord | null>;
  upsertFluency(f: FluencyRecord): Promise<FluencyRecord>;
  /** §14.3 wpm_trends — store a daily WPM data point. */
  upsertWpmTrend(point: WpmTrendPoint): Promise<void>;
  /** §14.3 wpm_trends — get the WPM trendline for a student. */
  getWpmTrend(studentId: string, limit: number): Promise<WpmTrendPoint[]>;
  purgeStudentData(studentId: string): Promise<void>;
  getGateStats(studentId: string): Promise<{ total: number; passed: number }>;
}

export class InMemoryProgressRepository implements ProgressRepository {
  sessions = new Map<string, SessionRecord>();
  attempts = new Map<string, GateAttemptRecord>();
  fluency = new Map<string, FluencyRecord>();
  wpmTrends = new Map<string, WpmTrendPoint>(); // key: studentId:date

  async upsertSession(s: SessionRecord): Promise<SessionRecord> {
    this.sessions.set(s.id, s);
    return s;
  }

  async createSession(s: SessionRecord): Promise<SessionRecord> {
    this.sessions.set(s.id, s);
    return s;
  }

  async updateSession(id: string, patch: Partial<SessionRecord>): Promise<SessionRecord> {
    const s = this.sessions.get(id);
    if (!s) throw new Error(`Session ${id} not found`);
    Object.assign(s, patch, { updatedAt: new Date().toISOString() });
    return s;
  }

  async getSession(id: string): Promise<SessionRecord | null> {
    return this.sessions.get(id) ?? null;
  }

  async listSessions(studentId: string, _page: number, _limit: number): Promise<SessionRecord[]> {
    return [...this.sessions.values()]
      .filter((s) => s.studentId === studentId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  async addGateAttempt(a: GateAttemptRecord): Promise<GateAttemptRecord> {
    this.attempts.set(a.id, a);
    return a;
  }

  async getAttemptsBySession(sessionId: string): Promise<GateAttemptRecord[]> {
    return [...this.attempts.values()]
      .filter((a) => a.sessionId === sessionId)
      .sort((a, b) => a.attemptNumber - b.attemptNumber);
  }

  async getFluency(studentId: string): Promise<FluencyRecord | null> {
    return this.fluency.get(studentId) ?? null;
  }

  async upsertFluency(f: FluencyRecord): Promise<FluencyRecord> {
    this.fluency.set(f.studentId, f);
    return f;
  }

  async upsertWpmTrend(point: WpmTrendPoint): Promise<void> {
    this.wpmTrends.set(`${point.studentId}:${point.recordedOn}`, point);
  }

  async getWpmTrend(studentId: string, limit: number): Promise<WpmTrendPoint[]> {
    return [...this.wpmTrends.values()]
      .filter((t) => t.studentId === studentId)
      .sort((a, b) => a.recordedOn.localeCompare(b.recordedOn))
      .slice(-limit);
  }

  async purgeStudentData(studentId: string): Promise<void> {
    const sessionIds = new Set<string>();
    for (const [id, s] of this.sessions) {
      if (s.studentId === studentId) {
        sessionIds.add(id);
        this.sessions.delete(id);
      }
    }
    for (const [id, a] of this.attempts) {
      if (sessionIds.has(a.sessionId)) this.attempts.delete(id);
    }
    this.fluency.delete(studentId);
    for (const [key] of this.wpmTrends) {
      if (key.startsWith(studentId + ':')) this.wpmTrends.delete(key);
    }
  }

  async getGateStats(studentId: string): Promise<{ total: number; passed: number }> {
    const studentSessionIds = new Set(
      [...this.sessions.values()]
        .filter((s) => s.studentId === studentId)
        .map((s) => s.id),
    );
    let total = 0;
    let passed = 0;
    for (const a of this.attempts.values()) {
      if (studentSessionIds.has(a.sessionId)) {
        total++;
        if (a.result === 'PASS') passed++;
      }
    }
    return { total, passed };
  }
}
