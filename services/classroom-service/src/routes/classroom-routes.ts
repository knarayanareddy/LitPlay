/**
 * Classroom-service REST routes (§11.6).
 */

import type { FastifyInstance } from 'fastify';
import {
  CreateClassroomSchema,
  JoinClassroomSchema,
  SetGoalSchema,
} from '@litplay/contracts';
import { apiError, requireAuth, requireRole } from '@litplay/server-kit';
import type { ClassroomService } from '../classroom-service.js';

function sendOrError(reply: any, fn: () => Promise<any>) {
  return fn().catch((e) =>
    apiError(
      reply,
      (e as Error & { statusCode?: number }).statusCode ?? 500,
      (e as Error & { code?: string }).code ?? 'ERROR',
      e.message,
    ),
  );
}

export function registerClassroomRoutes(app: FastifyInstance, service: ClassroomService) {
  const BASE = '/api/v1/classrooms';

  // POST /classrooms
  app.post(BASE, { preHandler: requireRole('teacher', 'admin') }, async (req, reply) => {
    const parsed = CreateClassroomSchema.safeParse(req.body);
    if (!parsed.success) return apiError(reply, 400, 'VALIDATION_ERROR', parsed.error.message);
    const classroom = await service.createClassroom(parsed.data);
    reply.status(201).send(classroom);
  });

  // GET /classrooms/:classroomId
  app.get(`${BASE}/:classroomId`, { preHandler: requireAuth }, async (req, reply) => {
    const { classroomId } = req.params as { classroomId: string };
    await sendOrError(reply, async () => reply.send(await service.getClassroom(classroomId)));
  });

  // GET /classrooms/:classroomId/progress (§11.6, §19.2)
  app.get(
    `${BASE}/:classroomId/progress`,
    { preHandler: requireRole('teacher', 'admin') },
    async (req, reply) => {
      const { classroomId } = req.params as { classroomId: string };
      await sendOrError(reply, async () => {
        const progress = await service.getClassroomProgress(classroomId);
        reply.send(progress);
      });
    },
  );

  // DELETE /classrooms/:classroomId
  app.delete(`${BASE}/:classroomId`, { preHandler: requireRole('teacher', 'admin') }, async (req, reply) => {
    const { classroomId } = req.params as { classroomId: string };
    await service.deleteClassroom(classroomId).catch((e) =>
      apiError(reply, (e as Error & { statusCode?: number }).statusCode ?? 500,
        (e as Error & { code?: string }).code ?? 'ERROR', e.message));
    reply.status(204).send();
  });

  // POST /classrooms/:classroomId/join
  app.post(`${BASE}/:classroomId/join`, { preHandler: requireAuth }, async (req, reply) => {
    const parsed = JoinClassroomSchema.safeParse(req.body);
    if (!parsed.success) return apiError(reply, 400, 'VALIDATION_ERROR', parsed.error.message);
    await sendOrError(reply, async () => {
      const member = await service.joinClassroom(parsed.data);
      reply.status(201).send(member);
    });
  });

  // GET /classrooms/:classroomId/members
  app.get(`${BASE}/:classroomId/members`, { preHandler: requireAuth }, async (req, reply) => {
    const { classroomId } = req.params as { classroomId: string };
    await sendOrError(reply, async () => reply.send(await service.listMembers(classroomId)));
  });

  // DELETE /classrooms/:classroomId/members/:userId
  app.delete(`${BASE}/:classroomId/members/:userId`, { preHandler: requireRole('teacher', 'admin') }, async (req, reply) => {
    const { classroomId, userId } = req.params as { classroomId: string; userId: string };
    await service.removeMember(classroomId, userId);
    reply.status(204).send();
  });

  // POST /classrooms/join-code/generate
  app.post(`${BASE}/join-code/generate`, { preHandler: requireRole('teacher', 'admin') }, async (req, reply) => {
    const { classroomId } = req.body as { classroomId: string };
    await sendOrError(reply, async () => reply.send(await service.generateJoinCode(classroomId)));
  });

  // POST /classrooms/:classroomId/goals/:studentId
  app.post(`${BASE}/:classroomId/goals/:studentId`, { preHandler: requireRole('teacher', 'admin') }, async (req, reply) => {
    const { classroomId, studentId } = req.params as { classroomId: string; studentId: string };
    const parsed = SetGoalSchema.safeParse(req.body);
    if (!parsed.success) return apiError(reply, 400, 'VALIDATION_ERROR', parsed.error.message);
    await sendOrError(reply, async () => reply.send(await service.setGoal(classroomId, studentId, parsed.data)));
  });

  // GET /classrooms/:classroomId/goals/:studentId
  app.get(`${BASE}/:classroomId/goals/:studentId`, { preHandler: requireAuth }, async (req, reply) => {
    const { classroomId, studentId } = req.params as { classroomId: string; studentId: string };
    const goal = await service.getGoal(studentId, classroomId);
    reply.send(goal ?? { message: 'No goal set' });
  });
}
