/** content-service — Fastify application factory (§10.4). */

import { createService, InMemoryEventBus, type EventBus } from '@litplay/server-kit';
import { ContentService } from './content-service.js';
import { InMemoryContentRepository, type ContentRepository } from './repo/content-repo.js';
import { registerContentRoutes } from './routes/content-routes.js';

export interface BuildAppOptions {
  eventBus?: EventBus;
  repo?: ContentRepository;
}

export function buildApp(opts: BuildAppOptions = {}) {
  const repo = opts.repo ?? new InMemoryContentRepository();
  const eventBus = opts.eventBus ?? new InMemoryEventBus();
  const service = new ContentService({ repo, eventBus });

  const app = createService({ name: 'content-service', port: 3003, logger: false, rateLimit: false });
  registerContentRoutes(app, service);
  return { app, service, repo, eventBus };
}
