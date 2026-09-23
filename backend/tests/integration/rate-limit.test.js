import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import { rateLimit } from '../../src/middleware/rate-limit.middleware.js';
import { errorMiddleware } from '../../src/middleware/error.middleware.js';

describe('Integration: Rate Limiting Middleware', () => {
  const createTestApp = (max = 3, windowMs = 5000) => {
    const app = express();

    app.get(
      '/limited',
      rateLimit({ max, windowMs, keyPrefix: 'test-rl:' }),
      (_req, res) => {
        res.json({ success: true, message: 'allowed' });
      }
    );

    app.use(errorMiddleware);
    return app;
  };

  it('Allows requests under the rate limit threshold and attaches headers', async () => {
    const app = createTestApp(3, 5000);

    const res1 = await request(app).get('/limited');
    expect(res1.status).toBe(200);
    expect(res1.headers).toHaveProperty('x-ratelimit-limit', '3');
    expect(res1.headers).toHaveProperty('x-ratelimit-remaining', '2');

    const res2 = await request(app).get('/limited');
    expect(res2.status).toBe(200);
    expect(res2.headers).toHaveProperty('x-ratelimit-remaining', '1');
  });

  it('Rejects requests exceeding the limit with 429 and Retry-After header', async () => {
    const app = createTestApp(2, 5000);

    await request(app).get('/limited');
    await request(app).get('/limited');

    const res3 = await request(app).get('/limited');
    expect(res3.status).toBe(429);
    expect(res3.body.success).toBe(false);
    expect(res3.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(res3.headers).toHaveProperty('retry-after');
  });
});
