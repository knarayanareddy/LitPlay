/** notification-service REST routes (§11, §21). */

import type { FastifyInstance } from 'fastify';
import { apiError, paginate, requireAuth, requireRole } from '@litplay/server-kit';
import type { NotificationService } from '../notification-service.js';

export function registerNotificationRoutes(app: FastifyInstance, service: NotificationService) {
  const BASE = '/api/v1/notifications';

  // GET /notifications — list notifications for current user
  app.get(BASE, { preHandler: requireAuth }, async (req, reply) => {
    const query = req.query as { page?: string; limit?: string };
    const page = parseInt(query.page ?? '1', 10);
    const limit = parseInt(query.limit ?? '20', 10);
    const notifications = await service.getNotifications(req.user!.sub);
    reply.send(paginate(notifications, page, limit));
  });

  // POST /notifications/weekly-digest — internal/admin endpoint (cron-triggered)
  app.post(`${BASE}/weekly-digest`, { preHandler: requireRole('admin') }, async (req, reply) => {
    const body = req.body as {
      userId?: string;
      totalWordsRead?: number;
      wpm?: number;
      sessionsCount?: number;
    };
    if (!body.userId) return apiError(reply, 400, 'VALIDATION_ERROR', 'userId is required');
    await service.sendWeeklyDigest(body.userId, {
      totalWordsRead: body.totalWordsRead ?? 0,
      wpm: body.wpm ?? 0,
      sessionsCount: body.sessionsCount ?? 0,
    });
    reply.status(202).send({ message: 'Digest queued' });
  });
}
