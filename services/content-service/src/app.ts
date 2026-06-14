/** content-service — Fastify application factory (§10.4). */

import { createEventBus, createService, type EventBus } from '@litplay/server-kit';
import { ContentService } from './content-service.js';
import { InMemoryContentRepository, PostgresContentRepository, type ContentRepository } from './repo/content-repo.js';
import { registerContentRoutes } from './routes/content-routes.js';

export interface BuildAppOptions {
  eventBus?: EventBus;
  repo?: ContentRepository;
}

export function buildApp(opts: BuildAppOptions = {}) {
  const repo = opts.repo ?? (process.env.DATABASE_URL ? new PostgresContentRepository() : new InMemoryContentRepository());
  const eventBus = opts.eventBus ?? createEventBus();
  const service = new ContentService({ repo, eventBus });

  const app = createService({ name: 'content-service', port: 3003, logger: false, rateLimit: process.env.NODE_ENV === 'test' ? false : true });
  registerContentRoutes(app, service);
  return { app, service, repo, eventBus };
}
