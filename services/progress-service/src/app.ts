/**
 * progress-service — Fastify application factory.
 */

import { createService, InMemoryEventBus, type EventBus } from '@litplay/server-kit';
import { ProgressService } from './progress-service.js';
import { InMemoryProgressRepository, type ProgressRepository } from './repo/progress-repo.js';
import { registerProgressRoutes } from './routes/progress-routes.js';

export interface BuildAppOptions {
  eventBus?: EventBus;
  repo?: ProgressRepository;
}

export function buildApp(opts: BuildAppOptions = {}) {
  const repo = opts.repo ?? new InMemoryProgressRepository();
  const eventBus = opts.eventBus ?? new InMemoryEventBus();
  const service = new ProgressService({ repo, eventBus });

  const app = createService({ name: 'progress-service', port: 3002, logger: false, rateLimit: false });
  registerProgressRoutes(app, service);
  return { app, service, repo, eventBus };
}
