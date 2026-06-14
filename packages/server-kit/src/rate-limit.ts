/**
 * Rate limiting middleware (§27.3 rule 1).
 *
 * 100 req/min unauthenticated (by IP), 1000 req/min authenticated (by user).
 * Uses Redis when REDIS_URL is configured; otherwise in-memory fallback for
 * local/dev. Redis makes limits shared across ECS tasks.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { apiError } from './server.js';

interface RateBucket {
  count: number;
  windowStart: number;
}

const WINDOW_MS = 60_000;
const UNAUTH_LIMIT = 100;
const AUTH_LIMIT = 1000;

const unauthBuckets = new Map<string, RateBucket>();
const authBuckets = new Map<string, RateBucket>();

let redisClientPromise: Promise<import('redis').RedisClientType> | null = null;
let redisUnavailable = false;

function getKey(req: FastifyRequest, authenticated: boolean): string {
  if (authenticated && req.user) return `user:${req.user.sub}`;
  const forwarded = req.headers['x-forwarded-for'];
  const ip =
    (Array.isArray(forwarded) ? forwarded[0] : forwarded) ??
    req.ip ??
    'unknown';
  return `ip:${ip}`;
}

function checkMemoryBucket(
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

async function getRedisClient(): Promise<import('redis').RedisClientType | null> {
  if (!process.env.REDIS_URL || redisUnavailable) return null;
  if (!redisClientPromise) {
    redisClientPromise = (async () => {
      const { createClient } = await import('redis');
      const client = createClient({ url: process.env.REDIS_URL });
      client.on('error', () => {
        redisUnavailable = true;
      });
      await client.connect();
      return client as import('redis').RedisClientType;
    })();
  }
  try {
    return await redisClientPromise;
  } catch {
    redisUnavailable = true;
    return null;
  }
}

async function checkRedisBucket(key: string, limit: number): Promise<boolean | null> {
  const client = await getRedisClient();
  if (!client) return null;
  const redisKey = `rl:${key}:${Math.floor(Date.now() / WINDOW_MS)}`;
  const count = await client.incr(redisKey);
  if (count === 1) await client.pExpire(redisKey, WINDOW_MS + 1000);
  return count <= limit;
}

async function checkRateLimit(
  req: FastifyRequest,
  authenticated: boolean,
): Promise<boolean> {
  const key = getKey(req, authenticated);
  const limit = authenticated ? AUTH_LIMIT : UNAUTH_LIMIT;
  const redisResult = await checkRedisBucket(key, limit);
  if (redisResult !== null) return redisResult;
  return checkMemoryBucket(authenticated ? authBuckets : unauthBuckets, key, limit);
}

export async function rateLimit(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (!(await checkRateLimit(req, !!req.user))) {
    reply.header('Retry-After', '60');
    apiError(reply, 429, 'RATE_LIMITED', 'Too many requests. Please try again later.');
  }
}

export function registerRateLimit(app: import('fastify').FastifyInstance): void {
  app.addHook('onRequest', async (req, reply) => {
    if (!(await checkRateLimit(req, false))) {
      reply.header('Retry-After', '60');
      apiError(reply, 429, 'RATE_LIMITED', 'Too many requests. Please try again later.');
    }
  });
}
