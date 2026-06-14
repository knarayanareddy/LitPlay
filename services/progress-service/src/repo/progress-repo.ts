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
  getGateAttempt(id: string): Promise<GateAttemptRecord | null>;
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

  async getGateAttempt(id: string): Promise<GateAttemptRecord | null> {
    return this.attempts.get(id) ?? null;
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

// --- PostgreSQL implementation (production) ---------------------------------

import { Pool } from 'pg';

type SessionRow = { id:string; student_id:string; content_id:string; status:SessionStatus; started_at:Date|string; ended_at:Date|string|null; words_read:number; wpm:string|number|null; synced_from_offline:boolean; created_at:Date|string; updated_at:Date|string };
type AttemptRow = { id:string; session_id:string; gate_id:string; attempt_number:number; transcript:string|null; score:string|number|null; result:GateResult; asr_provider:AsrProvider; latency_ms:number|null; audio_duration_ms:number|null; audio_noise_floor_db:string|number|null; audio_vad_result:boolean|null; attempted_at:Date|string; created_at:Date|string };
type FluencyRow = { student_id:string; current_wpm:string|number; total_words_read:string|number; total_sessions:number; gate_attempts_total:number; gate_attempts_passed:number; computed_at:Date|string; updated_at:Date|string };
type TrendRow = { student_id:string; recorded_on:Date|string; avg_wpm:string|number };
function toIso(v: Date|string|null|undefined): string|null { return v == null ? null : (v instanceof Date ? v.toISOString() : new Date(v).toISOString()); }
function toDateOnly(v: Date|string): string { return v instanceof Date ? v.toISOString().slice(0,10) : String(v).slice(0,10); }
function mapSession(r: SessionRow): SessionRecord { return { id:r.id, studentId:r.student_id, contentId:r.content_id, status:r.status, startedAt:toIso(r.started_at)!, endedAt:toIso(r.ended_at), wordsRead:Number(r.words_read), wpm:r.wpm==null?null:Number(r.wpm), syncedFromOffline:r.synced_from_offline, createdAt:toIso(r.created_at)!, updatedAt:toIso(r.updated_at)! }; }
function mapAttempt(r: AttemptRow): GateAttemptRecord { return { id:r.id, sessionId:r.session_id, gateId:r.gate_id, attemptNumber:Number(r.attempt_number), transcript:r.transcript, score:r.score==null?null:Number(r.score), result:r.result, asrProvider:r.asr_provider, latencyMs:r.latency_ms, audioDurationMs:r.audio_duration_ms, audioNoiseFloorDb:r.audio_noise_floor_db==null?null:Number(r.audio_noise_floor_db), audioVadResult:r.audio_vad_result, attemptedAt:toIso(r.attempted_at)!, createdAt:toIso(r.created_at)! }; }
function mapFluency(r: FluencyRow): FluencyRecord { return { studentId:r.student_id, currentWpm:Number(r.current_wpm), totalWordsRead:Number(r.total_words_read), totalSessions:Number(r.total_sessions), gateAttemptsTotal:Number(r.gate_attempts_total), gateAttemptsPassed:Number(r.gate_attempts_passed), computedAt:toIso(r.computed_at)!, updatedAt:toIso(r.updated_at)! }; }

export class PostgresProgressRepository implements ProgressRepository {
  private pool: Pool;
  constructor(connectionString = process.env.DATABASE_URL) { if (!connectionString) throw new Error('DATABASE_URL is required for PostgresProgressRepository'); this.pool = new Pool({ connectionString }); }
  async upsertSession(s: SessionRecord): Promise<SessionRecord> {
    const { rows } = await this.pool.query<SessionRow>(`INSERT INTO sessions (id,student_id,content_id,status,started_at,ended_at,words_read,wpm,synced_from_offline,created_at,updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status, ended_at=EXCLUDED.ended_at, words_read=EXCLUDED.words_read, wpm=EXCLUDED.wpm, synced_from_offline=EXCLUDED.synced_from_offline, updated_at=now()
      RETURNING *`, [s.id,s.studentId,s.contentId,s.status,s.startedAt,s.endedAt,s.wordsRead,s.wpm,s.syncedFromOffline,s.createdAt,s.updatedAt]);
    return mapSession(rows[0]);
  }
  async createSession(s: SessionRecord): Promise<SessionRecord> { return this.upsertSession(s); }
  async updateSession(id: string, patch: Partial<SessionRecord>): Promise<SessionRecord> {
    const current = await this.getSession(id); if (!current) throw new Error(`Session ${id} not found`); const n={...current,...patch,updatedAt:new Date().toISOString()};
    const { rows } = await this.pool.query<SessionRow>('UPDATE sessions SET status=$2, ended_at=$3, words_read=$4, wpm=$5, updated_at=$6 WHERE id=$1 RETURNING *',[id,n.status,n.endedAt,n.wordsRead,n.wpm,n.updatedAt]); return mapSession(rows[0]);
  }
  async getSession(id: string): Promise<SessionRecord|null> { const { rows } = await this.pool.query<SessionRow>('SELECT * FROM sessions WHERE id=$1',[id]); return rows[0]?mapSession(rows[0]):null; }
  async listSessions(studentId: string, page: number, limit: number): Promise<SessionRecord[]> { const offset=(page-1)*limit; const { rows } = await this.pool.query<SessionRow>('SELECT * FROM sessions WHERE student_id=$1 ORDER BY started_at DESC LIMIT $2 OFFSET $3',[studentId,limit,offset]); return rows.map(mapSession); }
  async addGateAttempt(a: GateAttemptRecord): Promise<GateAttemptRecord> { const { rows } = await this.pool.query<AttemptRow>(`INSERT INTO gate_attempts (id,session_id,gate_id,attempt_number,transcript,score,result,asr_provider,latency_ms,audio_duration_ms,audio_noise_floor_db,audio_vad_result,attempted_at,created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT (id) DO NOTHING RETURNING *`, [a.id,a.sessionId,a.gateId,a.attemptNumber,a.transcript,a.score,a.result,a.asrProvider,a.latencyMs,a.audioDurationMs,a.audioNoiseFloorDb,a.audioVadResult,a.attemptedAt,a.createdAt]); return rows[0]?mapAttempt(rows[0]):(await this.getGateAttempt(a.id)) ?? a; }
  async getGateAttempt(id: string): Promise<GateAttemptRecord|null> { const { rows } = await this.pool.query<AttemptRow>('SELECT * FROM gate_attempts WHERE id=$1',[id]); return rows[0]?mapAttempt(rows[0]):null; }
  async getAttemptsBySession(sessionId: string): Promise<GateAttemptRecord[]> { const { rows } = await this.pool.query<AttemptRow>('SELECT * FROM gate_attempts WHERE session_id=$1 ORDER BY attempt_number ASC',[sessionId]); return rows.map(mapAttempt); }
  async getFluency(studentId: string): Promise<FluencyRecord|null> { const { rows } = await this.pool.query<FluencyRow>('SELECT * FROM fluency_scores WHERE student_id=$1',[studentId]); return rows[0]?mapFluency(rows[0]):null; }
  async upsertFluency(f: FluencyRecord): Promise<FluencyRecord> { const { rows } = await this.pool.query<FluencyRow>(`INSERT INTO fluency_scores (student_id,current_wpm,total_words_read,total_sessions,gate_attempts_total,gate_attempts_passed,computed_at,updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (student_id) DO UPDATE SET current_wpm=EXCLUDED.current_wpm,total_words_read=EXCLUDED.total_words_read,total_sessions=EXCLUDED.total_sessions,gate_attempts_total=EXCLUDED.gate_attempts_total,gate_attempts_passed=EXCLUDED.gate_attempts_passed,computed_at=EXCLUDED.computed_at,updated_at=EXCLUDED.updated_at RETURNING *`, [f.studentId,f.currentWpm,f.totalWordsRead,f.totalSessions,f.gateAttemptsTotal,f.gateAttemptsPassed,f.computedAt,f.updatedAt]); return mapFluency(rows[0]); }
  async upsertWpmTrend(p: WpmTrendPoint): Promise<void> { await this.pool.query('INSERT INTO wpm_trends (student_id,recorded_on,avg_wpm) VALUES ($1,$2,$3) ON CONFLICT (student_id,recorded_on) DO UPDATE SET avg_wpm=EXCLUDED.avg_wpm',[p.studentId,p.recordedOn,p.avgWpm]); }
  async getWpmTrend(studentId: string, limit: number): Promise<WpmTrendPoint[]> { const { rows } = await this.pool.query<TrendRow>('SELECT * FROM wpm_trends WHERE student_id=$1 ORDER BY recorded_on DESC LIMIT $2',[studentId,limit]); return rows.reverse().map(r=>({studentId:r.student_id,recordedOn:toDateOnly(r.recorded_on),avgWpm:Number(r.avg_wpm)})); }
  async purgeStudentData(studentId: string): Promise<void> { await this.pool.query('DELETE FROM sessions WHERE student_id=$1',[studentId]); await this.pool.query('DELETE FROM fluency_scores WHERE student_id=$1',[studentId]); await this.pool.query('DELETE FROM wpm_trends WHERE student_id=$1',[studentId]); }
  async getGateStats(studentId: string): Promise<{total:number; passed:number}> { const { rows } = await this.pool.query<{total:string; passed:string}>(`SELECT count(*)::int AS total, count(*) FILTER (WHERE ga.result='PASS')::int AS passed FROM gate_attempts ga JOIN sessions s ON s.id=ga.session_id WHERE s.student_id=$1`,[studentId]); return { total:Number(rows[0]?.total ?? 0), passed:Number(rows[0]?.passed ?? 0) }; }
}
