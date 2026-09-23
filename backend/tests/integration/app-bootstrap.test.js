import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';

describe('Integration: App Bootstrap & Security Headers', () => {
  const app = createApp();

  it('App includes Helmet security headers', async () => {
    const res = await request(app).get('/health/live');

    expect(res.status).toBe(200);
    expect(res.headers).toHaveProperty('x-dns-prefetch-control', 'off');
    expect(res.headers).toHaveProperty('x-frame-options', 'SAMEORIGIN');
    expect(res.headers).toHaveProperty('strict-transport-security');
  });

  it('App attaches unique X-Request-Id to response', async () => {
    const res = await request(app).get('/health/live');

    expect(res.headers).toHaveProperty('x-request-id');
    expect(typeof res.headers['x-request-id']).toBe('string');
    expect(res.headers['x-request-id'].length).toBeGreaterThan(10);
  });

  it('App respects client-provided X-Request-Id header', async () => {
    const customId = 'client-custom-req-id-12345';
    const res = await request(app)
      .get('/health/live')
      .set('X-Request-Id', customId);

    expect(res.headers['x-request-id']).toBe(customId);
  });

  it('Returns structured 404 for non-existent routes', async () => {
    const res = await request(app).get('/api/v1/unknown-endpoint');

    expect(res.status).toBe(404);
    expect(res.body).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'NOT_FOUND',
          message: expect.stringContaining('/api/v1/unknown-endpoint')
        })
      })
    );
  });
});
