/**
 * notification-service — Fastify application factory (§10.8).
 *
 * Wires the event-bus subscription so events are consumed and dispatched.
 * In dev/test this uses InMemoryEventBus; in production the Kafka consumer
 * calls service.handleEvent() on each message.
 */

import { createService, InMemoryEventBus, type EventBus } from '@litplay/server-kit';
import { TOPICS } from '@litplay/contracts';
import { NotificationService } from './notification-service.js';
import {
  InMemoryNotificationRepository,
  type NotificationRepository,
} from './notification-service.js';
import { registerNotificationRoutes } from './routes/notification-routes.js';

export interface BuildAppOptions {
  eventBus?: EventBus;
  repo?: NotificationRepository;
}

export function buildApp(opts: BuildAppOptions = {}) {
  const repo = opts.repo ?? new InMemoryNotificationRepository();
  const eventBus = opts.eventBus ?? new InMemoryEventBus();
  const service = new NotificationService({ repo });

  // §15.3 — subscribe to all relevant topics so events are dispatched
  // In production, a Kafka consumer group handles this.
  const inMemoryBus = eventBus as InMemoryEventBus;
  if (inMemoryBus.subscribe) {
    for (const topic of Object.values(TOPICS)) {
      inMemoryBus.subscribe(topic, async (envelope) => {
        await service.handleEvent(envelope);
      });
    }
  }

  const app = createService({ name: 'notification-service', port: 3005, logger: false, rateLimit: false });
  registerNotificationRoutes(app, service);
  return { app, service, repo, eventBus };
}
