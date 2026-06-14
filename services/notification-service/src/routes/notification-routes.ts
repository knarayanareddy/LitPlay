/** notification-service REST routes (§11, §21). */

import type { FastifyInstance } from 'fastify';
import { apiError, requireAuth } from '@litplay/server-kit';
import type { NotificationService } from '../notification-service.js';

export function registerNotificationRoutes(app: FastifyInstance, service: NotificationService) {
  const BASE = '/api/v1/notifications';

  // GET /notifications — list notifications for current user
  app.get(BASE, { preHandler: requireAuth }, async (_req, reply) => {
    // Would normally call service.getNotifications(req.user!.sub)
    reply.send({ data: [], meta: { page: 1, limit: 20, total: 0 } });
  });

  // POST /notifications/weekly-digest — internal endpoint (cron-triggered)
  app.post(`${BASE}/weekly-digest`, { preHandler: requireAuth }, async (req, reply) => {
    const body = req.body as {
      userId: string;
      totalWordsRead: number;
      wpm: number;
      sessionsCount: number;
    };
    if (!body.userId) return apiError(reply, 400, 'VALIDATION_ERROR', 'userId is required');
    await service.sendWeeklyDigest(body.userId, {
      totalWordsRead: body.totalWordsRead,
      wpm: body.wpm,
      sessionsCount: body.sessionsCount,
    });
    reply.status(202).send({ message: 'Digest queued' });
  });
}
