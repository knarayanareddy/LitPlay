/**
 * Classroom-service REST routes (§11.6).
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  CreateClassroomSchema,
  JoinClassroomSchema,
  SetGoalSchema,
  UpdateClassroomSchema,
} from '@litplay/contracts';
import { apiError, requireAuth, requireRole } from '@litplay/server-kit';
import type { ClassroomService } from '../classroom-service.js';

function sendOrError(reply: FastifyReply, fn: () => Promise<unknown>) {
  return fn().catch((e: unknown) => {
    const err = e as Error & { statusCode?: number; code?: string };
    return apiError(reply, err.statusCode ?? 500, err.code ?? 'ERROR', err.message);
  });
}

async function ensureClassroomMember(
  req: FastifyRequest,
  reply: FastifyReply,
  service: ClassroomService,
  classroomId: string,
): Promise<boolean> {
  const user = req.user!;
  if (user.role === 'admin') return true;
  const classroom = await service.getClassroom(classroomId);
  if (classroom.teacherId === user.sub) return true;
  const members = await service.listMembers(classroomId);
  const allowed = members.some((m) => m.userId === user.sub);
  if (!allowed) apiError(reply, 403, 'FORBIDDEN', 'You are not a member of this classroom');
  return allowed;
}

async function ensureClassroomTeacher(
  req: FastifyRequest,
  reply: FastifyReply,
  service: ClassroomService,
  classroomId: string,
): Promise<boolean> {
  const user = req.user!;
  if (user.role === 'admin') return true;
  const classroom = await service.getClassroom(classroomId);
  const allowed = user.role === 'teacher' && classroom.teacherId === user.sub;
  if (!allowed) apiError(reply, 403, 'FORBIDDEN', 'Only the classroom teacher can modify this classroom');
  return allowed;
}

export function registerClassroomRoutes(app: FastifyInstance, service: ClassroomService) {
  const BASE = '/api/v1/classrooms';

  // POST /classrooms
  app.post(BASE, { preHandler: requireRole('teacher', 'admin') }, async (req, reply) => {
    const parsed = CreateClassroomSchema.safeParse(req.body);
    if (!parsed.success) return apiError(reply, 400, 'VALIDATION_ERROR', parsed.error.message);
    const user = req.user!;
    if (user.role !== 'admin' && parsed.data.teacherId !== user.sub) {
      return apiError(reply, 403, 'FORBIDDEN', 'Teachers can only create their own classrooms');
    }
    const classroom = await service.createClassroom(parsed.data);
    reply.status(201).send(classroom);
  });

  // POST /classrooms/join-code/generate
  app.post(`${BASE}/join-code/generate`, { preHandler: requireRole('teacher', 'admin') }, async (req, reply) => {
    const { classroomId } = req.body as { classroomId?: string };
    if (!classroomId) return apiError(reply, 400, 'VALIDATION_ERROR', 'classroomId is required');
    await sendOrError(reply, async () => {
      if (!(await ensureClassroomTeacher(req, reply, service, classroomId))) return;
      reply.send(await service.generateJoinCode(classroomId));
    });
  });

  // GET /classrooms/:classroomId
  app.get(`${BASE}/:classroomId`, { preHandler: requireAuth }, async (req, reply) => {
    const { classroomId } = req.params as { classroomId: string };
    await sendOrError(reply, async () => {
      if (!(await ensureClassroomMember(req, reply, service, classroomId))) return;
      reply.send(await service.getClassroom(classroomId));
    });
  });

  // GET /classrooms/:classroomId/progress (§11.6, §19.2)
  app.get(
    `${BASE}/:classroomId/progress`,
    { preHandler: requireRole('teacher', 'admin') },
    async (req, reply) => {
      const { classroomId } = req.params as { classroomId: string };
      await sendOrError(reply, async () => {
        if (!(await ensureClassroomTeacher(req, reply, service, classroomId))) return;
        const progress = await service.getClassroomProgress(classroomId);
        reply.send(progress);
      });
    },
  );

  // PATCH /classrooms/:classroomId
  app.patch(`${BASE}/:classroomId`, { preHandler: requireRole('teacher', 'admin') }, async (req, reply) => {
    const { classroomId } = req.params as { classroomId: string };
    const parsed = UpdateClassroomSchema.safeParse(req.body);
    if (!parsed.success) return apiError(reply, 400, 'VALIDATION_ERROR', parsed.error.message);
    await sendOrError(reply, async () => {
      if (!(await ensureClassroomTeacher(req, reply, service, classroomId))) return;
      reply.send(await service.updateClassroom(classroomId, parsed.data));
    });
  });

  // DELETE /classrooms/:classroomId
  app.delete(`${BASE}/:classroomId`, { preHandler: requireRole('teacher', 'admin') }, async (req, reply) => {
    const { classroomId } = req.params as { classroomId: string };
    await sendOrError(reply, async () => {
      if (!(await ensureClassroomTeacher(req, reply, service, classroomId))) return;
      await service.deleteClassroom(classroomId);
      reply.status(204).send();
    });
  });

  // POST /classrooms/:classroomId/join
  app.post(`${BASE}/:classroomId/join`, { preHandler: requireAuth }, async (req, reply) => {
    const { classroomId } = req.params as { classroomId: string };
    const parsed = JoinClassroomSchema.safeParse(req.body);
    if (!parsed.success) return apiError(reply, 400, 'VALIDATION_ERROR', parsed.error.message);
    if (req.user!.role !== 'admin' && parsed.data.studentId !== req.user!.sub) {
      return apiError(reply, 403, 'FORBIDDEN', 'Students can only join as themselves');
    }
    await sendOrError(reply, async () => {
      const joinCode = await service.getJoinCodeByClassroom(classroomId);
      if (!joinCode || joinCode.code !== parsed.data.joinCode.toUpperCase()) {
        return apiError(reply, 400, 'VALIDATION_ERROR', 'Join code does not match classroom');
      }
      const member = await service.joinClassroom(parsed.data);
      reply.status(201).send(member);
    });
  });

  // GET /classrooms/:classroomId/members
  app.get(`${BASE}/:classroomId/members`, { preHandler: requireAuth }, async (req, reply) => {
    const { classroomId } = req.params as { classroomId: string };
    await sendOrError(reply, async () => {
      if (!(await ensureClassroomMember(req, reply, service, classroomId))) return;
      reply.send(await service.listMembers(classroomId));
    });
  });

  // DELETE /classrooms/:classroomId/members/:userId
  app.delete(`${BASE}/:classroomId/members/:userId`, { preHandler: requireRole('teacher', 'admin') }, async (req, reply) => {
    const { classroomId, userId } = req.params as { classroomId: string; userId: string };
    await sendOrError(reply, async () => {
      if (!(await ensureClassroomTeacher(req, reply, service, classroomId))) return;
      await service.removeMember(classroomId, userId);
      reply.status(204).send();
    });
  });

  // POST /classrooms/:classroomId/goals/:studentId
  app.post(`${BASE}/:classroomId/goals/:studentId`, { preHandler: requireRole('teacher', 'admin') }, async (req, reply) => {
    const { classroomId, studentId } = req.params as { classroomId: string; studentId: string };
    const parsed = SetGoalSchema.safeParse(req.body);
    if (!parsed.success) return apiError(reply, 400, 'VALIDATION_ERROR', parsed.error.message);
    await sendOrError(reply, async () => {
      if (!(await ensureClassroomTeacher(req, reply, service, classroomId))) return;
      reply.send(await service.setGoal(classroomId, studentId, parsed.data));
    });
  });

  // GET /classrooms/:classroomId/goals/:studentId
  app.get(`${BASE}/:classroomId/goals/:studentId`, { preHandler: requireAuth }, async (req, reply) => {
    const { classroomId, studentId } = req.params as { classroomId: string; studentId: string };
    await sendOrError(reply, async () => {
      if (!(await ensureClassroomMember(req, reply, service, classroomId))) return;
      if (req.user!.role === 'student' && req.user!.sub !== studentId) {
        return apiError(reply, 403, 'FORBIDDEN', 'Cannot view another student\'s goal');
      }
      const goal = await service.getGoal(studentId, classroomId);
      reply.send(goal ?? { message: 'No goal set' });
    });
  });
}
