/** classroom-service — Fastify application factory (§10.6). */

import {
  createService,
  InMemoryEventBus,
  type EventBus,
  InterServiceClient,
} from '@litplay/server-kit';
import { ClassroomService } from './classroom-service.js';
import { InMemoryClassroomRepository, type ClassroomRepository } from './repo/classroom-repo.js';
import { registerClassroomRoutes } from './routes/classroom-routes.js';

export interface BuildAppOptions {
  eventBus?: EventBus;
  repo?: ClassroomRepository;
  interService?: InterServiceClient;
}

export function buildApp(opts: BuildAppOptions = {}) {
  const repo = opts.repo ?? new InMemoryClassroomRepository();
  const eventBus = opts.eventBus ?? new InMemoryEventBus();
  const service = new ClassroomService({ repo, eventBus, interService: opts.interService });

  const app = createService({ name: 'classroom-service', port: 3004, logger: false, rateLimit: false });
  registerClassroomRoutes(app, service);
  return { app, service, repo, eventBus };
}
