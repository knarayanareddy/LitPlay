/**
 * progress-service — Fastify application factory.
 */

import { createEventBus, createService, type EventBus } from '@litplay/server-kit';
import { ProgressService } from './progress-service.js';
import { InMemoryProgressRepository, PostgresProgressRepository, type ProgressRepository } from './repo/progress-repo.js';
import { registerProgressRoutes } from './routes/progress-routes.js';

export interface BuildAppOptions {
  eventBus?: EventBus;
  repo?: ProgressRepository;
}

export function buildApp(opts: BuildAppOptions = {}) {
  const repo = opts.repo ?? (process.env.DATABASE_URL ? new PostgresProgressRepository() : new InMemoryProgressRepository());
  const eventBus = opts.eventBus ?? createEventBus();
  const service = new ProgressService({ repo, eventBus });

  const app = createService({ name: 'progress-service', port: 3002, logger: false, rateLimit: process.env.NODE_ENV === 'test' ? false : true });
  registerProgressRoutes(app, service);
  return { app, service, repo, eventBus };
}
