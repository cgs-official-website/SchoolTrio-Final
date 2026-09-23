import { Redis } from 'ioredis';
import { redisConfig } from '../config/redis.config.js';

/**
 * Redis client initialization for School Management System backend.
 * Phase 1B: Connection and infrastructure foundation only.
 * Domain caching, locks, and rate limiters will be bound in later phases.
 */
export const redis = new Redis(redisConfig.url, {
  maxRetriesPerRequest: redisConfig.maxRetriesPerRequest,
  retryStrategy: redisConfig.retryStrategy,
  connectTimeout: redisConfig.connectTimeout,
  lazyConnect: redisConfig.lazyConnect
});

redis.on('connect', () => {
  // Connected to Redis server
});

redis.on('error', (err) => {
  // Log error without crashing process to support fail-open and degrade-to-DB policies
  console.warn('[REDIS WARNING] Connection error:', err.message);
});

/**
 * Probes active Redis connectivity using PING command.
 * @returns {Promise<boolean>} True if reachable, false otherwise
 */
export const checkRedisHealth = async () => {
  try {
    if (redis.status === 'wait') {
      await redis.connect();
    }
    const pong = await redis.ping();
    return pong === 'PONG';
  } catch (_error) {
    return false;
  }
};

/**
 * Gracefully disconnects the Redis client.
 */
export const disconnectRedis = async () => {
  try {
    if (redis.status !== 'end') {
      await redis.quit();
    }
  } catch (error) {
    console.error('Error disconnecting Redis client:', error);
  }
};
