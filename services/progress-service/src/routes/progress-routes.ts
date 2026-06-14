/**
 * Progress-service REST routes (§11.3).
 *
 * All student-scoped endpoints enforce §16.2 RBAC via requireStudentAccess.
 */

import type { FastifyInstance } from 'fastify';
import {
  BatchSyncSchema,
  CreateGateAttemptSchema,
  CreateSessionSchema,
  UpdateSessionSchema,
} from '@litplay/contracts';
import { z } from 'zod';
import { apiError, canAccessStudent, paginate, requireAuth, requireStudentAccess } from '@litplay/server-kit';
import type { ProgressService } from '../progress-service.js';

const BatchFluencySchema = z.object({
  studentIds: z.array(z.string().uuid()).max(100),
});

export function registerProgressRoutes(app: FastifyInstance, service: ProgressService) {
  const BASE = '/api/v1/progress';

  // POST /progress/sessions
  app.post(`${BASE}/sessions`, { preHandler: requireAuth }, async (req, reply) => {
    const parsed = CreateSessionSchema.safeParse(req.body);
    if (!parsed.success) return apiError(reply, 400, 'VALIDATION_ERROR', parsed.error.message);

    // §16.2 — only callers explicitly scoped to this student may create sessions
    const user = req.user!;
    if (!canAccessStudent(user, parsed.data.studentId)) {
      return apiError(reply, 403, 'FORBIDDEN', 'Cannot create sessions for another student');
    }

    const session = await service.createSession(parsed.data);
    reply.status(201).send(session);
  });

  // PATCH /progress/sessions/:sessionId
  app.patch(`${BASE}/sessions/:sessionId`, { preHandler: requireAuth }, async (req, reply) => {
    const { sessionId } = req.params as { sessionId: string };
    const parsed = UpdateSessionSchema.safeParse(req.body);
    if (!parsed.success) return apiError(reply, 400, 'VALIDATION_ERROR', parsed.error.message);
    try {
      const existing = await service.getSession(sessionId);
      if (!canAccessStudent(req.user!, existing.studentId)) {
        return apiError(reply, 403, 'FORBIDDEN', 'Cannot update another student\'s session');
      }
      const session = await service.updateSession(sessionId, parsed.data);
      reply.send(session);
    } catch (e) {
      const err = e as Error & { statusCode?: number; code?: string };
      return apiError(reply, err.statusCode ?? 500, err.code ?? 'ERROR', err.message);
    }
  });

  // GET /progress/sessions/:sessionId
  app.get(`${BASE}/sessions/:sessionId`, { preHandler: requireAuth }, async (req, reply) => {
    const { sessionId } = req.params as { sessionId: string };
    try {
      const session = await service.getSession(sessionId);
      // §16.2 — verify the caller has access to this session's student
      if (!canAccessStudent(req.user!, session.studentId)) {
        return apiError(reply, 403, 'FORBIDDEN', 'Cannot access another student\'s session');
      }
      reply.send(session);
    } catch (e) {
      const err = e as Error & { statusCode?: number; code?: string };
      return apiError(reply, err.statusCode ?? 500, err.code ?? 'ERROR', err.message);
    }
  });

  // GET /progress/students/:studentId/sessions — RBAC scoped (§16.2)
  app.get(
    `${BASE}/students/:studentId/sessions`,
    { preHandler: [requireAuth, requireStudentAccess] },
    async (req, reply) => {
      const { studentId } = req.params as { studentId: string };
      const page = parseInt((req.query as { page?: string }).page ?? '1', 10);
      const limit = parseInt((req.query as { limit?: string }).limit ?? '20', 10);
      const sessions = await service.listSessions(studentId, page, limit);
      reply.send(paginate(sessions, page, limit));
    },
  );

  // POST /progress/sessions/:sessionId/gate-attempts
  app.post(`${BASE}/sessions/:sessionId/gate-attempts`, { preHandler: requireAuth }, async (req, reply) => {
    const { sessionId } = req.params as { sessionId: string };
    const parsed = CreateGateAttemptSchema.safeParse(req.body);
    if (!parsed.success) return apiError(reply, 400, 'VALIDATION_ERROR', parsed.error.message);
    try {
      const session = await service.getSession(sessionId);
      if (!canAccessStudent(req.user!, session.studentId)) {
        return apiError(reply, 403, 'FORBIDDEN', 'Cannot write attempts for another student\'s session');
      }
      const attempt = await service.recordGateAttempt(sessionId, parsed.data);
      reply.status(201).send(attempt);
    } catch (e) {
      const err = e as Error & { statusCode?: number; code?: string };
      return apiError(reply, err.statusCode ?? 500, err.code ?? 'ERROR', err.message);
    }
  });

  // POST /progress/students/fluency/batch — classroom dashboard batch lookup
  app.post(`${BASE}/students/fluency/batch`, { preHandler: requireAuth }, async (req, reply) => {
    const parsed = BatchFluencySchema.safeParse(req.body);
    if (!parsed.success) return apiError(reply, 400, 'VALIDATION_ERROR', parsed.error.message);
    const result: Record<string, unknown> = {};
    for (const studentId of parsed.data.studentIds) {
      if (!canAccessStudent(req.user!, studentId)) {
        return apiError(reply, 403, 'FORBIDDEN', 'Batch contains an unauthorized student');
      }
      result[studentId] = await service.getFluency(studentId);
    }
    reply.send(result);
  });

  // GET /progress/students/:studentId/fluency — RBAC scoped (§16.2)
  app.get(
    `${BASE}/students/:studentId/fluency`,
    { preHandler: [requireAuth, requireStudentAccess] },
    async (req, reply) => {
      const { studentId } = req.params as { studentId: string };
      const fluency = await service.getFluency(studentId);
      reply.send(fluency);
    },
  );

  // GET /progress/students/:studentId/summary — RBAC scoped (§16.2)
  app.get(
    `${BASE}/students/:studentId/summary`,
    { preHandler: [requireAuth, requireStudentAccess] },
    async (req, reply) => {
      const { studentId } = req.params as { studentId: string };
      const fluency = await service.getFluency(studentId);
      reply.send(fluency);
    },
  );

  // POST /progress/sessions/batch-sync  (§13.2)
  app.post(`${BASE}/sessions/batch-sync`, { preHandler: requireAuth }, async (req, reply) => {
    const parsed = BatchSyncSchema.safeParse(req.body);
    if (!parsed.success) return apiError(reply, 400, 'VALIDATION_ERROR', parsed.error.message);
    for (const session of parsed.data.sessions) {
      if (!canAccessStudent(req.user!, session.studentId)) {
        return apiError(reply, 403, 'FORBIDDEN', 'Batch contains a session for an unauthorized student');
      }
    }
    const result = await service.batchSync(parsed.data);
    reply.send(result);
  });
}
