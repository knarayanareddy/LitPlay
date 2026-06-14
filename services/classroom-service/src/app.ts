/** classroom-service — Fastify application factory (§10.6). */

import {
  createEventBus,
  createService,
  type EventBus,
  InterServiceClient,
} from '@litplay/server-kit';
import { ClassroomService } from './classroom-service.js';
import { InMemoryClassroomRepository, PostgresClassroomRepository, type ClassroomRepository } from './repo/classroom-repo.js';
import { registerClassroomRoutes } from './routes/classroom-routes.js';

export interface BuildAppOptions {
  eventBus?: EventBus;
  repo?: ClassroomRepository;
  interService?: InterServiceClient;
}

export function buildApp(opts: BuildAppOptions = {}) {
  const repo = opts.repo ?? (process.env.DATABASE_URL ? new PostgresClassroomRepository() : new InMemoryClassroomRepository());
  const eventBus = opts.eventBus ?? createEventBus();
  const interService = opts.interService ?? (process.env.INTERNAL_SERVICE_TOKEN ? new InterServiceClient(process.env.INTERNAL_SERVICE_TOKEN) : undefined);
  const service = new ClassroomService({ repo, eventBus, interService });

  const app = createService({ name: 'classroom-service', port: 3004, logger: false, rateLimit: process.env.NODE_ENV === 'test' ? false : true });
  registerClassroomRoutes(app, service);
  return { app, service, repo, eventBus };
}
