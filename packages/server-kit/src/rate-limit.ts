/**
 * Rate limiting middleware (§27.3 rule 1).
 *
 * 100 req/min unauthenticated (by IP), 1000 req/min authenticated (by user).
 * Uses a sliding-window counter in memory. In production this would be Redis.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { apiError } from './server.js';

interface RateBucket {
  count: number;
  windowStart: number;
}

const WINDOW_MS = 60_000; // 1 minute
const UNAUTH_LIMIT = 100;
const AUTH_LIMIT = 1000;

const unauthBuckets = new Map<string, RateBucket>();
const authBuckets = new Map<string, RateBucket>();

function getKey(req: FastifyRequest, authenticated: boolean): string {
  if (authenticated && req.user) return `user:${req.user.sub}`;
  // Fall back to IP address
  const forwarded = req.headers['x-forwarded-for'];
  const ip =
    (Array.isArray(forwarded) ? forwarded[0] : forwarded) ??
    req.ip ??
    'unknown';
  return `ip:${ip}`;
}

function checkBucket(
  buckets: Map<string, RateBucket>,
  key: string,
  limit: number,
): boolean {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart > WINDOW_MS) {
    bucket = { count: 0, windowStart: now };
    buckets.set(key, bucket);
  }
  bucket.count++;
  return bucket.count <= limit;
}

/**
 * Rate limit preHandler. Must run AFTER requireAuth so it can distinguish
 * authenticated vs unauthenticated traffic.
 *
 * Usage:
 *   app.register(rateLimitHook)  — registers as a global preHandler
 * Or per-route:
 *   { preHandler: [requireAuth, rateLimit] }
 */
export async function rateLimit(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const authenticated = !!req.user;
  const key = getKey(req, authenticated);
  const buckets = authenticated ? authBuckets : unauthBuckets;
  const limit = authenticated ? AUTH_LIMIT : UNAUTH_LIMIT;

  if (!checkBucket(buckets, key, limit)) {
    reply.header('Retry-After', '60');
    apiError(reply, 429, 'RATE_LIMITED', 'Too many requests. Please try again later.');
  }
}

/**
 * Register rate limiting as a global onRequest hook on a Fastify instance.
 * This runs BEFORE route handlers and preHandlers, so it checks the raw request.
 * Authenticated users get the higher limit — but since we don't have the user
 * yet at onRequest time, we check by IP and then re-check with the user in the
 * preHandler if needed.
 */
export function registerRateLimit(app: import('fastify').FastifyInstance): void {
  app.addHook('onRequest', async (req, reply) => {
    const key = getKey(req, false); // can't know auth status yet
    if (!checkBucket(unauthBuckets, key, UNAUTH_LIMIT)) {
      reply.header('Retry-After', '60');
      apiError(reply, 429, 'RATE_LIMITED', 'Too many requests. Please try again later.');
    }
  });
}
