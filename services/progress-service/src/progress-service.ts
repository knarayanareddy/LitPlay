/**
 * Progress business logic (§10.3, FR-020–024, §13 offline sync).
 *
 * Key responsibilities:
 *  - Session CRUD
 *  - Gate-attempt recording
 *  - WPM / fluency computation (server-side authoritative, §13.3)
 *  - Offline batch-sync (FR-022, §13.2) with idempotency (§13.3)
 */

import {
  TOPICS,
  buildEvent,
  type BatchSyncRequest,
  type CreateGateAttemptRequest,
  type CreateSessionRequest,
  type FluencyResponse,
  type OfflineSession,
  type SessionStatus,
} from '@litplay/contracts';
import type { EventBus } from '@litplay/server-kit';
import {
  type FluencyRecord,
  type GateAttemptRecord,
  type ProgressRepository,
  type SessionRecord,
} from './repo/progress-repo.js';

export class NotFoundError extends Error {
  statusCode = 404;
  code = 'NOT_FOUND';
}

export interface ProgressServiceDeps {
  repo: ProgressRepository;
  eventBus: EventBus;
}

export class ProgressService {
  constructor(private deps: ProgressServiceDeps) {}

  // --- Session lifecycle (FR-020, FR-021) ---

  async createSession(req: CreateSessionRequest): Promise<SessionRecord> {
    const now = new Date().toISOString();
    const session: SessionRecord = {
      id: crypto.randomUUID(),
      studentId: req.studentId,
      contentId: req.contentId,
      status: 'active',
      startedAt: now,
      endedAt: null,
      wordsRead: 0,
      wpm: null,
      syncedFromOffline: false,
      createdAt: now,
      updatedAt: now,
    };
    return this.deps.repo.createSession(session);
  }

  async updateSession(
    id: string,
    patch: { status?: SessionStatus; endedAt?: string; wordsRead?: number; wpm?: number },
  ): Promise<SessionRecord> {
    const session = await this.deps.repo.updateSession(id, patch);

    // FR-024 + §15.3 — on completion, recompute fluency + emit event
    if (patch.status === 'completed') {
      await this.recomputeFluency(session.studentId);

      // Compute actual gate stats for this session (was hardcoded 0)
      const attempts = await this.deps.repo.getAttemptsBySession(id);
      const gateIds = new Set(attempts.map((a) => a.gateId));
      const gatesPassed = new Set(
        attempts.filter((a) => a.result === 'PASS').map((a) => a.gateId),
      ).size;

      await this.deps.eventBus.publish(
        buildEvent(
          TOPICS.PROGRESS_SESSION_COMPLETED,
          'progress-service',
          {
            sessionId: session.id,
            studentId: session.studentId,
            contentId: session.contentId,
            status: session.status,
            wordsRead: session.wordsRead,
            wpm: session.wpm ?? 0,
            durationSec: session.endedAt
              ? Math.round(
                  (new Date(session.endedAt).getTime() -
                    new Date(session.startedAt).getTime()) /
                    1000,
                )
              : 0,
            gatesPassed,
            gatesTotal: gateIds.size,
          },
          session.id,
        ),
      );
    }
    return session;
  }

  async getSession(id: string): Promise<SessionRecord> {
    const s = await this.deps.repo.getSession(id);
    if (!s) throw new NotFoundError('Session not found');
    return s;
  }

  async listSessions(studentId: string, page = 1, limit = 20) {
    return this.deps.repo.listSessions(studentId, page, limit);
  }

  // --- Gate attempts (FR-008) ---

  async recordGateAttempt(
    sessionId: string,
    req: CreateGateAttemptRequest,
  ): Promise<GateAttemptRecord> {
    if (req.id) {
      const existing = await this.deps.repo.getGateAttempt(req.id);
      if (existing) return existing;
    }

    const now = new Date().toISOString();
    const attempt: GateAttemptRecord = {
      id: req.id ?? crypto.randomUUID(),
      sessionId,
      gateId: req.gateId,
      attemptNumber: req.attemptNumber,
      transcript: req.transcript ?? null,
      score: req.score ?? null,
      result: req.result,
      asrProvider: req.asrProvider,
      latencyMs: req.latencyMs ?? null,
      audioDurationMs: req.audioMetadata?.durationMs ?? null,
      audioNoiseFloorDb: req.audioMetadata?.noiseFloorDb ?? null,
      audioVadResult: req.audioMetadata?.vadResult ?? null,
      attemptedAt: req.attemptedAt,
      createdAt: now,
    };
    const saved = await this.deps.repo.addGateAttempt(attempt);

    // §15.3 — emit gate_attempt.recorded for analytics
    const session = await this.deps.repo.getSession(sessionId);
    await this.deps.eventBus.publish(
      buildEvent(
        TOPICS.PROGRESS_GATE_ATTEMPT_RECORDED,
        'progress-service',
        {
          gateAttemptId: saved.id,
          studentId: session?.studentId ?? '',
          contentId: session?.contentId ?? '',
          gateId: saved.gateId,
          result: saved.result,
          score: saved.score ?? 0,
          latencyMs: saved.latencyMs ?? 0,
          asrProvider: saved.asrProvider,
          isOffline: session?.syncedFromOffline ?? false,
        },
        saved.id,
      ),
    );
    return saved;
  }

  // --- Offline batch-sync (FR-022, §13.2) ---

  /**
   * Sync a batch of offline sessions (max 20 per §13.2).
   * Uses upsert for idempotency — re-syncing a duplicate UUID is safe (§13.3).
   */
  async batchSync(req: BatchSyncRequest): Promise<{ synced: number; failed: string[] }> {
    const failed: string[] = [];
    let synced = 0;

    for (const offlineSession of req.sessions) {
      try {
        await this.syncOneOfflineSession(offlineSession);
        synced++;
      } catch (err) {
        failed.push(offlineSession.id);
      }
    }
    return { synced, failed };
  }

  private async syncOneOfflineSession(os: OfflineSession): Promise<void> {
    const now = new Date().toISOString();
    const session: SessionRecord = {
      id: os.id, // client-generated UUID (§13.3 — append-only, no conflicts)
      studentId: os.studentId,
      contentId: os.contentId,
      status: os.status,
      startedAt: os.startedAt,
      endedAt: os.endedAt ?? null,
      wordsRead: os.wordsRead,
      wpm: os.wpm ?? null,
      syncedFromOffline: true,
      createdAt: now,
      updatedAt: now,
    };
    // §13.3 — idempotent upsert: re-syncing a duplicate UUID is a no-op,
    // not a constraint violation
    await this.deps.repo.upsertSession(session);

    for (const ga of os.gateAttempts) {
      await this.recordGateAttempt(os.id, ga);
    }

    if (os.status === 'completed') {
      await this.recomputeFluency(os.studentId);
    }
  }

  // --- Fluency / WPM (FR-024) ---

  /**
   * Server-side WPM computation from synced sessions (§13.3 rule 3 — server is
   * authoritative; local estimates are display-only).
   */
  async recomputeFluency(studentId: string): Promise<FluencyRecord> {
    const sessions = await this.deps.repo.listSessions(studentId, 1, 10_000);

    const completed = sessions.filter((s) => s.status === 'completed');
    const totalWords = completed.reduce((sum, s) => sum + s.wordsRead, 0);
    const wpms = completed
      .filter((s) => s.wpm != null)
      .map((s) => s.wpm as number);
    const currentWpm =
      wpms.length > 0
        ? Math.round((wpms.slice(-5).reduce((a, b) => a + b, 0) / Math.min(5, wpms.length)) * 100) / 100
        : 0;

    const gateStats = await this.deps.repo.getGateStats(studentId);

    // §14.3 wpm_trends — store daily WPM data point for trendline
    if (currentWpm > 0) {
      const today = new Date().toISOString().slice(0, 10);
      await this.deps.repo.upsertWpmTrend({
        studentId,
        recordedOn: today,
        avgWpm: currentWpm,
      });
    }

    const now = new Date().toISOString();
    const fluency: FluencyRecord = {
      studentId,
      currentWpm,
      totalWordsRead: totalWords,
      totalSessions: completed.length,
      gateAttemptsTotal: gateStats.total,
      gateAttemptsPassed: gateStats.passed,
      computedAt: now,
      updatedAt: now,
    };
    return this.deps.repo.upsertFluency(fluency);
  }

  async getFluency(studentId: string): Promise<FluencyResponse> {
    const f = await this.deps.repo.getFluency(studentId);

    // FR-024 — fetch the WPM trendline from wpm_trends
    const trend = await this.deps.repo.getWpmTrend(studentId, 30);
    const trendWpm = trend.map((t) => t.avgWpm);

    if (!f) {
      return {
        studentId,
        currentWpm: 0,
        trendWpm,
        totalWordsRead: 0,
        totalSessions: 0,
        gatePassRate: 0,
      };
    }
    const passRate = f.gateAttemptsTotal > 0
      ? f.gateAttemptsPassed / f.gateAttemptsTotal
      : 0;
    return {
      studentId: f.studentId,
      currentWpm: f.currentWpm,
      trendWpm,
      totalWordsRead: f.totalWordsRead,
      totalSessions: f.totalSessions,
      gatePassRate: passRate,
    };
  }

  /** §17.3 — purge all progress data for a deleted student. */
  async purgeStudentData(studentId: string): Promise<void> {
    await this.deps.repo.purgeStudentData(studentId);
  }
}
