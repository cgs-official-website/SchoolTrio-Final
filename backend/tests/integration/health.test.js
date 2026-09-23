import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/database/prisma.client.js';
import * as redisModule from '../../src/database/redis.client.js';

describe('Integration: Health Observability Probes', () => {
  const app = createApp();

  it('GET /health returns 200 with status ok', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /health/live returns 200 with status ok', async () => {
    const res = await request(app).get('/health/live');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /api/v1/health returns 200 with status ok', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /health/ready returns 200 when Postgres and Redis are healthy', async () => {
    const prismaSpy = vi.spyOn(prisma, '$queryRaw').mockResolvedValue([{ health: 1 }]);
    const redisSpy = vi.spyOn(redisModule, 'checkRedisHealth').mockResolvedValue(true);

    const res = await request(app).get('/health/ready');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ready');
    expect(res.body.services).toEqual({
      postgres: 'up',
      redis: 'up'
    });

    prismaSpy.mockRestore();
    redisSpy.mockRestore();
  });

  it('GET /health/ready returns 503 when Postgres is down', async () => {
    const prismaSpy = vi.spyOn(prisma, '$queryRaw').mockRejectedValue(new Error('Connection lost'));
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
});
