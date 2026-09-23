import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/database/prisma.client.js';
import * as redisModule from '../src/database/redis.client.js';

describe('Health & Observability Endpoints', () => {
  const app = createApp();

  it('GET /health/live returns HTTP 200 with status "ok"', async () => {
    const res = await request(app).get('/health/live');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /health/ready returns 200 when both PostgreSQL and Redis are up', async () => {
    const prismaSpy = vi.spyOn(prisma, '$queryRaw').mockResolvedValue([{ health: 1 }]);
    const redisSpy = vi.spyOn(redisModule, 'checkRedisHealth').mockResolvedValue(true);

    const res = await request(app).get('/health/ready');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ready');
    expect(res.body.services.postgres).toBe('up');
    expect(res.body.services.redis).toBe('up');

    prismaSpy.mockRestore();
    redisSpy.mockRestore();
  });

  it('GET /health/ready returns 503 when PostgreSQL is down', async () => {
    const prismaSpy = vi.spyOn(prisma, '$queryRaw').mockRejectedValue(new Error('Connection failed'));
    const redisSpy = vi.spyOn(redisModule, 'checkRedisHealth').mockResolvedValue(true);

    const res = await request(app).get('/health/ready');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('unavailable');
    expect(res.body.services.postgres).toBe('down');
    expect(res.body.services.redis).toBe('up');

    prismaSpy.mockRestore();
    redisSpy.mockRestore();
  });

  it('GET /health/ready returns 503 when Redis is down', async () => {
    const prismaSpy = vi.spyOn(prisma, '$queryRaw').mockResolvedValue([{ health: 1 }]);
    const redisSpy = vi.spyOn(redisModule, 'checkRedisHealth').mockResolvedValue(false);

    const res = await request(app).get('/health/ready');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('unavailable');
    expect(res.body.services.postgres).toBe('up');
    expect(res.body.services.redis).toBe('down');

    prismaSpy.mockRestore();
    redisSpy.mockRestore();
  });

  it('GET /health/ready returns 503 when both PostgreSQL and Redis are down', async () => {
    const prismaSpy = vi.spyOn(prisma, '$queryRaw').mockRejectedValue(new Error('DB down'));
    const redisSpy = vi.spyOn(redisModule, 'checkRedisHealth').mockResolvedValue(false);

    const res = await request(app).get('/health/ready');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('unavailable');
    expect(res.body.services.postgres).toBe('down');
    expect(res.body.services.redis).toBe('down');

    prismaSpy.mockRestore();
    redisSpy.mockRestore();
  });

  it('Response includes X-Request-Id correlation header', async () => {
    const res = await request(app).get('/health/live');

    expect(res.headers).toHaveProperty('x-request-id');
    expect(typeof res.headers['x-request-id']).toBe('string');
    expect(res.headers['x-request-id'].length).toBeGreaterThan(10);
  });
});
