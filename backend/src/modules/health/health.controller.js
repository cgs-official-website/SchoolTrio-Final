import { prisma } from '../../database/prisma.client.js';
import * as redisModule from '../../database/redis.client.js';

/**
 * Health controller for liveness and readiness observability probes.
 */

export const liveCheck = (_req, res) => {
  res.status(200).json({
    status: 'ok'
  });
};

export const readyCheck = async (_req, res) => {
  const services = {
    postgres: 'down',
    redis: 'down'
  };

  // 1. Probe PostgreSQL connectivity
  try {
    const result = await Promise.race([
      prisma.$queryRaw`SELECT 1 as health`,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Postgres query timeout')), 10000))
    ]);
    if (result) {
      services.postgres = 'up';
    }
  } catch (_err) {
    services.postgres = 'down';
  }

  // 2. Probe Redis connectivity
  try {
    const isRedisReachable = await Promise.race([
      redisModule.checkRedisHealth(),
      new Promise((resolve) => setTimeout(() => resolve(false), 3000))
    ]);
    if (isRedisReachable) {
      services.redis = 'up';
    }
  } catch (_err) {
    services.redis = 'down';
  }

  const isAllReady = services.postgres === 'up' && services.redis === 'up';

  res.status(isAllReady ? 200 : 503).json({
    status: isAllReady ? 'ready' : 'unavailable',
    services,
    timestamp: new Date().toISOString()
  });
};
