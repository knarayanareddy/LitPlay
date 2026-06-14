/**
 * auth-service — Fastify application factory.
 *
 * Wires the repository, event bus, and routes. Exported so tests can build
 * an app with the in-memory repository.
 */

import { createEventBus, createService, type EventBus } from '@litplay/server-kit';
import { AuthService } from './auth-service.js';
import { InMemoryAuthRepository, PostgresAuthRepository, type AuthRepository } from './repo/auth-repo.js';
import { registerAuthRoutes } from './routes/auth-routes.js';

export interface BuildAppOptions {
  eventBus?: EventBus;
  repo?: AuthRepository;
}

export function buildApp(opts: BuildAppOptions = {}) {
  const repo = opts.repo ?? (process.env.DATABASE_URL ? new PostgresAuthRepository() : new InMemoryAuthRepository());
  const eventBus = opts.eventBus ?? createEventBus();
  const service = new AuthService({ repo, eventBus });

  const app = createService({ name: 'auth-service', port: 3001, logger: false, rateLimit: process.env.NODE_ENV === 'test' ? false : true });
  registerAuthRoutes(app, service);
  return { app, service, repo, eventBus };
}
