/**
 * @litplay/server-kit — common Fastify server factory, error helpers,
 * JWT auth, and pagination (§11.1, §16, §27).
 *
 * Every Node.js service uses `createService(name)` to get a pre-configured
 * Fastify instance with CORS, structured logging, and health endpoints.
 */

import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import pino from 'pino';

export interface ServiceConfig {
  name: string;
  port?: number;
  corsOrigins?: string[];
  logger?: boolean;
  rateLimit?: boolean;
}

/** §11.1 standard error envelope */
export interface ApiError {
  error: {
    code: string;
    message: string;
    requestId: string;
  };
}

export function apiError(
  reply: FastifyReply,
  statusCode: number,
  code: string,
  message: string,
): FastifyReply {
  // §30 — guard against double-send
  if (reply.sent) return reply;
  return reply.status(statusCode).send({
    error: { code, message, requestId: crypto.randomUUID() },
  } satisfies ApiError);
}

/** §11.1 pagination */
export interface PaginatedResult<T> {
  data: T[];
  meta: { page: number; limit: number; total: number };
}

export function paginate<T>(
  items: T[],
  page: number,
  limit: number,
): PaginatedResult<T> {
  const start = (page - 1) * limit;
  return {
    data: items.slice(start, start + limit),
    meta: { page, limit, total: items.length },
  };
}

export function createService(config: ServiceConfig): FastifyInstance {
  const logger = config.logger === false ? false : pino({ name: config.name, level: process.env.LOG_LEVEL ?? 'info' });

  const app = Fastify({
    logger: logger as any,
    genReqId: () => crypto.randomUUID(),
  });

  // §27.3 — CORS whitelist only
  app.register(cors, {
    origin: config.corsOrigins ?? [
      'https://app.litplay.app',
      'https://admin.litplay.app',
    ],
    credentials: true,
  });

  // §10.1 rule 5 — liveness + readiness
  app.get('/health', async () => 'ok');
  app.get('/ready', async () => ({ status: 'ready', service: config.name }));

  // §27.3 — optional rate limiting (default: enabled, disabled in tests)
  if (config.rateLimit !== false) {
    // Inline import to avoid circular dependency with rate-limit.ts → server.ts
    const { registerRateLimit } = require('./rate-limit.js') as typeof import('./rate-limit.js');
    registerRateLimit(app);
  }

  // Central error normalizer (§11.1) — guards against double-send (§30)
  app.setErrorHandler((err, _req, reply) => {
    if (reply.sent) return;
    const reqId = reply.request.id;
    if (err.validation) {
      return apiError(reply, 400, 'VALIDATION_ERROR', err.message);
    }
    const statusCode = err.statusCode ?? 500;
    if (statusCode >= 500) {
      app.log.error({ err, reqId }, 'unhandled_error');
    }
    return apiError(
      reply,
      statusCode,
      err.code ?? 'INTERNAL_ERROR',
      statusCode >= 500 ? 'An internal error occurred' : err.message,
    );
  });

  return app;
}

/** Start a service, with graceful shutdown. */
export async function startService(app: FastifyInstance, port: number): Promise<void> {
  try {
    await app.listen({ port, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down');
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}
