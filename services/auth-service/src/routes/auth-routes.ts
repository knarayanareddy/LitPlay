/**
 * Auth-service REST routes (§11.2).
 *
 * All endpoints enforce proper RBAC (§16.2):
 *  - COPPA consent requires parent/admin auth + parent-child link verification
 *  - Student-scoped data requires the caller to be the student, their parent, or admin
 */

import type { FastifyInstance } from 'fastify';
import {
  LoginSchema,
  RegisterSchema,
  ConsentSchema,
} from '@litplay/contracts';
import {
  apiError,
  requireAuth,
  requireRole,
} from '@litplay/server-kit';
import { z } from 'zod';
import type { AuthService } from '../auth-service.js';

const GoogleOAuthSchema = z.object({
  idToken: z.string().min(1),
});

const PasswordResetRequestSchema = z.object({
  email: z.string().email(),
});

const PasswordConfirmSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

const UpdateProfileSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  locale: z.string().max(10).optional(),
});

export function registerAuthRoutes(app: FastifyInstance, service: AuthService) {
  const BASE = '/api/v1/auth';

  // POST /auth/register
  app.post(`${BASE}/register`, async (req, reply) => {
    const parsed = RegisterSchema.safeParse(req.body);
    if (!parsed.success) {
      return apiError(reply, 400, 'VALIDATION_ERROR', parsed.error.message);
    }
    try {
      const { user, requiresConsent } = await service.register(parsed.data);
      reply.status(201).send({
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          displayName: user.displayName,
          requiresParentalConsent: requiresConsent,
        },
        message: requiresConsent
          ? 'Account created. Waiting for parental consent.'
          : 'Account created successfully.',
      });
    } catch (e) {
      const err = e as Error & { statusCode?: number; code?: string };
      return apiError(reply, err.statusCode ?? 500, err.code ?? 'ERROR', err.message);
    }
  });

  // POST /auth/login
  app.post(`${BASE}/login`, async (req, reply) => {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) {
      return apiError(reply, 400, 'VALIDATION_ERROR', parsed.error.message);
    }
    try {
      const deviceId = (req.headers['x-device-id'] as string) ?? undefined;
      const { tokens, user } = await service.login(
        parsed.data.email,
        parsed.data.password,
        deviceId,
      );
      reply.send({
        tokens,
        user: { id: user.id, email: user.email, role: user.role },
      });
    } catch (e) {
      const err = e as Error & { statusCode?: number; code?: string };
      return apiError(reply, err.statusCode ?? 500, err.code ?? 'ERROR', err.message);
    }
  });

  // POST /auth/oauth/google (§11.2)
  app.post(`${BASE}/oauth/google`, async (req, reply) => {
    const parsed = GoogleOAuthSchema.safeParse(req.body);
    if (!parsed.success) {
      return apiError(reply, 400, 'VALIDATION_ERROR', parsed.error.message);
    }
    try {
      const deviceId = (req.headers['x-device-id'] as string) ?? undefined;
      const { tokens, user } = await service.googleOAuth(parsed.data.idToken, deviceId);
      reply.send({
        tokens,
        user: { id: user.id, email: user.email, role: user.role },
      });
    } catch (e) {
      const err = e as Error & { statusCode?: number; code?: string };
      return apiError(reply, err.statusCode ?? 500, err.code ?? 'ERROR', err.message);
    }
  });

  // POST /auth/refresh
  app.post(`${BASE}/refresh`, async (req, reply) => {
    const body = req.body as { refreshToken?: string };
    if (!body?.refreshToken) {
      return apiError(reply, 400, 'VALIDATION_ERROR', 'refreshToken is required');
    }
    try {
      const deviceId = (req.headers['x-device-id'] as string) ?? undefined;
      const { tokens, user } = await service.refreshSession(body.refreshToken, deviceId);
      reply.send({
        tokens,
        user: { id: user.id, email: user.email, role: user.role },
      });
    } catch (e) {
      const err = e as Error & { statusCode?: number; code?: string };
      return apiError(reply, err.statusCode ?? 500, err.code ?? 'ERROR', err.message);
    }
  });

  // POST /auth/logout
  app.post(`${BASE}/logout`, async (req, reply) => {
    const body = req.body as { refreshToken?: string };
    if (body?.refreshToken) {
      await service.logout(body.refreshToken);
    }
    reply.status(204).send();
  });

  // GET /auth/me (uses service method, no private access)
  app.get(`${BASE}/me`, { preHandler: requireAuth }, async (req, reply) => {
    try {
      const user = await service.getUserProfile(req.user!.sub);
      reply.send({
        id: user.id,
        email: user.email,
        role: user.role,
        displayName: user.displayName,
        locale: user.locale,
        requiresParentalConsent: user.requiresParentalConsent,
      });
    } catch (e) {
      const err = e as Error & { statusCode?: number; code?: string };
      return apiError(reply, err.statusCode ?? 500, err.code ?? 'ERROR', err.message);
    }
  });

  // PATCH /auth/me (§11.2)
  app.patch(`${BASE}/me`, { preHandler: requireAuth }, async (req, reply) => {
    const parsed = UpdateProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      return apiError(reply, 400, 'VALIDATION_ERROR', parsed.error.message);
    }
    try {
      const user = await service.updateProfile(req.user!.sub, parsed.data);
      reply.send({
        id: user.id,
        email: user.email,
        role: user.role,
        displayName: user.displayName,
        locale: user.locale,
        requiresParentalConsent: user.requiresParentalConsent,
      });
    } catch (e) {
      const err = e as Error & { statusCode?: number; code?: string };
      return apiError(reply, err.statusCode ?? 500, err.code ?? 'ERROR', err.message);
    }
  });

  // DELETE /auth/me (§17.3 right to erasure)
  app.delete(`${BASE}/me`, { preHandler: requireAuth }, async (req, reply) => {
    await service.deleteAccount(req.user!.sub);
    reply.status(202).send({
      message: 'Account deletion scheduled. All data will be purged within 72 hours.',
    });
  });

  // POST /auth/password/reset (§11.2)
  app.post(`${BASE}/password/reset`, async (req, reply) => {
    const parsed = PasswordResetRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return apiError(reply, 400, 'VALIDATION_ERROR', parsed.error.message);
    }
    await service.requestPasswordReset(parsed.data.email);
    reply.send({
      message: 'If an account exists for that email, a reset link has been sent.',
    });
  });

  // POST /auth/password/confirm (§11.2)
  app.post(`${BASE}/password/confirm`, async (req, reply) => {
    const parsed = PasswordConfirmSchema.safeParse(req.body);
    if (!parsed.success) {
      return apiError(reply, 400, 'VALIDATION_ERROR', parsed.error.message);
    }
    try {
      await service.confirmPasswordReset(parsed.data.token, parsed.data.newPassword);
      reply.send({ message: 'Password updated successfully.' });
    } catch (e) {
      const err = e as Error & { statusCode?: number; code?: string };
      return apiError(reply, err.statusCode ?? 500, err.code ?? 'ERROR', err.message);
    }
  });

  // POST /auth/coppa/consent — requires parent/admin auth (§17.1)
  app.post(
    `${BASE}/coppa/consent`,
    { preHandler: requireRole('parent', 'admin') },
    async (req, reply) => {
      const parsed = ConsentSchema.safeParse(req.body);
      if (!parsed.success) {
        return apiError(reply, 400, 'VALIDATION_ERROR', parsed.error.message);
      }
      try {
        const consent = await service.submitConsent(
          parsed.data,
          req.user!.sub,
          req.user!.role,
        );
        reply.send(consent);
      } catch (e) {
        const err = e as Error & { statusCode?: number; code?: string };
        return apiError(reply, err.statusCode ?? 500, err.code ?? 'ERROR', err.message);
      }
    },
  );

  // GET /auth/coppa/status/:childId — requires auth + access to child
  app.get(
    `${BASE}/coppa/status/:childId`,
    { preHandler: requireAuth },
    async (req, reply) => {
      const { childId } = req.params as { childId: string };

      // §16.2 RBAC — only the child themselves, their parent, or admin
      const user = req.user!;
      if (user.role === 'student' && user.sub !== childId) {
        return apiError(reply, 403, 'FORBIDDEN', 'Cannot view another student\'s consent status');
      }
      const consent = await service.getConsentStatus(childId);
      if (user.role === 'parent' && user.sub !== childId) {
        // Parents may only view consent for explicitly linked children. A null
        // parentId is not proof of access; it is an unclaimed pending consent.
        if (!consent?.parentId || consent.parentId !== user.sub) {
          return apiError(reply, 403, 'FORBIDDEN', 'Not the designated parent for this child');
        }
      }

      if (!consent) {
        return reply.send({ childId, status: 'not_required' });
      }
      reply.send(consent);
    },
  );
}
