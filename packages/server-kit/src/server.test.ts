import { createService } from './server.js';

describe('createService runtime smoke', () => {
  it('builds with default logger config under Fastify 5', async () => {
    const app = createService({ name: 'smoke-default', rateLimit: false });
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('builds with rate limiting enabled in non-test mode', async () => {
    const app = createService({ name: 'smoke-rate-limit', logger: false, rateLimit: true });
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
