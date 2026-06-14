/**
 * Content-service REST routes (§11.4).
 * All student-scoped endpoints enforce §16.2 RBAC.
 */

import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  CreateAssignmentSchema,
} from '@litplay/contracts';
import { apiError, paginate, requireAuth, requireRole } from '@litplay/server-kit';
import type { ContentService } from '../content-service.js';

/** Map domain errors to HTTP error responses. */
function handleError(e: unknown, reply: FastifyReply) {
  const err = e as Error & { statusCode?: number; code?: string };
  return apiError(
    reply,
    err.statusCode ?? 500,
    err.code ?? 'INTERNAL_ERROR',
    err.message,
  );
}

export function registerContentRoutes(app: FastifyInstance, service: ContentService) {
  const BASE = '/api/v1/content';

  // GET /content — list catalog
  app.get(BASE, { preHandler: requireAuth }, async (req, reply) => {
    const query = req.query as { gradeLevel?: string; page?: string; limit?: string };
    const worlds = await service.listWorlds({
      gradeLevel: query.gradeLevel,
      published: true,
    });
    const page = parseInt(query.page ?? '1', 10);
    const limit = parseInt(query.limit ?? '20', 10);
    reply.send(paginate(worlds, page, limit));
  });

  // GET /content/:contentId
  app.get(`${BASE}/:contentId`, { preHandler: requireAuth }, async (req, reply) => {
    const { contentId } = req.params as { contentId: string };
    try {
      const world = await service.getWorld(contentId);
      reply.send(world);
    } catch (e) {
      return handleError(e, reply);
    }
  });

  // GET /content/:contentId/download-url (§18.2 signed URL)
  app.get(`${BASE}/:contentId/download-url`, { preHandler: requireAuth }, async (req, reply) => {
    const { contentId } = req.params as { contentId: string };
    try {
      const result = await service.getDownloadUrl(contentId);
      reply.send(result);
    } catch (e) {
      return handleError(e, reply);
    }
  });

  // GET /content/:contentId/gates
  app.get(`${BASE}/:contentId/gates`, { preHandler: requireAuth }, async (req, reply) => {
    const { contentId } = req.params as { contentId: string };
    try {
      const gates = await service.listGates(contentId);
      reply.send(gates);
    } catch (e) {
      return handleError(e, reply);
    }
  });

  // POST /content/assignments (teachers/admins only)
  app.post(`${BASE}/assignments`, { preHandler: requireRole('teacher', 'admin') }, async (req, reply) => {
    const parsed = CreateAssignmentSchema.safeParse(req.body);
    if (!parsed.success) return apiError(reply, 400, 'VALIDATION_ERROR', parsed.error.message);
    try {
      const assignment = await service.assignContent(parsed.data, req.user!.sub);
      reply.status(201).send(assignment);
    } catch (e) {
      return handleError(e, reply);
    }
  });

  // GET /content/assignments/:studentId — RBAC scoped (§16.2)
  app.get(`${BASE}/assignments/:studentId`, { preHandler: requireAuth }, async (req, reply) => {
    const { studentId } = req.params as { studentId: string };
    const user = req.user!;

    // §16.2 — students see only their own assignments, parents see children's
    if (user.role === 'student' && user.sub !== studentId) {
      return apiError(reply, 403, 'FORBIDDEN', 'Cannot view another student\'s assignments');
    }
    if (user.role === 'parent' && user.sub !== studentId && user.parentId !== studentId) {
      return apiError(reply, 403, 'FORBIDDEN', 'Cannot view assignments for this student');
    }

    const assignments = await service.getAssignments(studentId);
    reply.send(assignments);
  });

  // DELETE /content/assignments/:assignmentId
  app.delete(`${BASE}/assignments/:assignmentId`, { preHandler: requireRole('teacher', 'admin') }, async (req, reply) => {
    const { assignmentId } = req.params as { assignmentId: string };
    await service.deleteAssignment(assignmentId);
    reply.status(204).send();
  });
}
