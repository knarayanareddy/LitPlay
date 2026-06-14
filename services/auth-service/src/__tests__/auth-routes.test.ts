/**
 * auth-service HTTP integration tests (§11.2).
 * Uses Fastify.inject() — no real port binding.
 */

import { buildApp } from '../app.js';

function childDob(ageYears: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - ageYears);
  return d.toISOString().slice(0, 10);
}

describe('auth-service routes', () => {
  it('registers and logs in a parent', async () => {
    const { app } = buildApp();
    await app.ready();

    const reg = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'parent@test.com',
        password: 'securePass1!',
        role: 'parent',
      },
    });
    expect(reg.statusCode).toBe(201);

    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'parent@test.com', password: 'securePass1!' },
    });
    expect(login.statusCode).toBe(200);
    const body = JSON.parse(login.body);
    expect(body.tokens.accessToken).toBeTruthy();
    await app.close();
  });

  it('returns 409 on duplicate registration', async () => {
    const { app } = buildApp();
    await app.ready();
    const payload = {
      email: 'dup@test.com',
      password: 'securePass1!',
      role: 'parent',
    };
    await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload });
    const dup = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload,
    });
    expect(dup.statusCode).toBe(409);
    await app.close();
  });

  it('validates request body (400 on bad input)', async () => {
    const { app } = buildApp();
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'not-an-email', password: 'x', role: 'parent' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('GET /health returns ok', async () => {
    const { app } = buildApp();
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('ok');
    await app.close();
  });

  it('blocks child login without consent via HTTP', async () => {
    const { app, service } = buildApp();
    await app.ready();
    await service.register({
      email: 'child@test.com',
      password: 'securePass1!',
      role: 'student',
      dateOfBirth: childDob(8),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'child@test.com', password: 'securePass1!' },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('CONSENT_PENDING');
    await app.close();
  });

  it('COPPA consent endpoint requires auth', async () => {
    const { app } = buildApp();
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/coppa/consent',
      payload: {
        childId: '00000000-0000-0000-0000-000000000001',
        parentId: '00000000-0000-0000-0000-000000000002',
        consentMethod: 'email',
      },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('GET /auth/me requires auth', async () => {
    const { app } = buildApp();
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/api/v1/auth/me' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});
