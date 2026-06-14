/**
 * Fastify auth plugin — JWT verification + RBAC (§16.2).
 *
 * Usage in a route:
 *   app.get('/me', { preHandler: requireAuth }, handler)
 *   app.get('/admin', { preHandler: requireRole('admin') }, handler)
 *   app.get('/students/:id', { preHandler: requireStudentAccess }, handler)
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { verifyToken, type LitPlayJwtPayload } from './auth.js';
import { apiError } from './server.js';

export async function requireAuth(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    apiError(reply, 401, 'UNAUTHORIZED', 'Missing or malformed Authorization header');
    return;
  }
  const token = header.slice(7);
  const secret = process.env.JWT_ACCESS_SECRET ?? 'dev-secret-change-me';
  try {
    const payload = verifyToken<LitPlayJwtPayload>(token, secret);
    req.user = payload;
  } catch {
    apiError(reply, 401, 'TOKEN_EXPIRED', 'Access token is invalid or expired');
  }
}

/** RBAC: require one of the given roles (§16.2). */
export function requireRole(...roles: string[]) {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    await requireAuth(req, reply);
    if (reply.sent) return;
    if (!req.user || !roles.includes(req.user.role)) {
      apiError(reply, 403, 'FORBIDDEN', 'Insufficient permissions');
    }
  };
}

/**
 * §16.2 — Enforce student-data scoping.
 *
 * Students see only their own data.
 * Parents see their children's data (parentId claim in JWT).
 * Teachers see their classroom members' data (classroomIds claim).
 * Admins see everything.
 *
 * This preHandler extracts `studentId` from URL params, query, or body and
 * validates access. It must be used AFTER requireAuth.
 */
export async function requireStudentAccess(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  await requireAuth(req, reply);
  if (reply.sent) return;

  const user = req.user!;
  if (user.role === 'admin') return; // admins see everything

  // Try to extract studentId from params, query, or body
  const params = req.params as Record<string, string>;
  const query = req.query as Record<string, string>;
  const body = (req.body as Record<string, unknown>) ?? {};
  const studentId =
    params.studentId ?? params.id ?? query.studentId ?? (body.studentId as string);

  // If we can't find a studentId, fall through (the route may handle its own scoping)
  if (!studentId) return;

  if (!canAccessStudent(user, studentId)) {
    apiError(reply, 403, 'FORBIDDEN', 'You do not have access to this student\'s data');
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: LitPlayJwtPayload;
  }
}

/**
 * Scope-check helper (§16.2): students see only their own data, parents see
 * their children, teachers see their classrooms, admins see everything.
 */
export function canAccessStudent(
  user: LitPlayJwtPayload & { childIds?: string[]; studentIds?: string[] },
  studentId: string,
): boolean {
  if (user.role === 'admin') return true;
  if (user.role === 'student') return user.sub === studentId;

  if (user.role === 'parent') {
    // Parent access must be explicitly represented in the token. We do not infer
    // parent-child links from parentId (that claim belongs on student tokens).
    return (user.childIds ?? []).includes(studentId);
  }

  if (user.role === 'teacher') {
    // Teacher access must be constrained to classroom membership by the caller
    // or encoded into the service token as studentIds. Never allow all students.
    return (user.studentIds ?? []).includes(studentId);
  }

  return false;
}
