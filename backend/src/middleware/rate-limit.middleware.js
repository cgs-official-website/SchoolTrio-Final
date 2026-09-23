import { redis } from '../database/redis.client.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { RateLimitError } from '../utils/app-error.js';

// In-memory fallback map when Redis is offline
const memoryStore = new Map();

/**
 * Creates a rate limiting middleware.
 *
 * @param {Object} [options]
 * @param {number} [options.windowMs=60000] - Window size in milliseconds
 * @param {number} [options.max=100] - Max requests allowed per window
 * @param {string} [options.keyPrefix='rl:'] - Key prefix for Redis/memory
 * @param {Function} [options.keyGenerator] - Custom key generator function (default: IP address)
 * @returns {import('express').RequestHandler}
 */
export const rateLimit = (options = {}) => {
  const windowMs = options.windowMs || env.RATE_LIMIT_WINDOW_MS || 60000;
  const max = options.max || env.RATE_LIMIT_MAX_REQUESTS || 100;
  const keyPrefix = options.keyPrefix || 'rl:';
  const keyGenerator = options.keyGenerator || ((req) => {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      return Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0].trim();
    }
    return req.ip || '127.0.0.1';
  });

  return async (req, res, next) => {
    const clientKey = `${keyPrefix}${keyGenerator(req)}`;
    const now = Date.now();
    const windowSeconds = Math.ceil(windowMs / 1000);

    // Try Redis first
    try {
      if (redis.status === 'ready' || redis.status === 'connect') {
        const multi = redis.multi();
        multi.incr(clientKey);
        multi.ttl(clientKey);
        const results = await multi.exec();

        if (results && results[0] && results[1]) {
          const currentCount = results[0][1];
          let ttl = results[1][1];

          // Set TTL on first request in window
          if (ttl === -1 || currentCount === 1) {
            await redis.expire(clientKey, windowSeconds);
            ttl = windowSeconds;
          }

          res.setHeader('X-RateLimit-Limit', String(max));
          res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - currentCount)));

          if (currentCount > max) {
            return next(new RateLimitError('Too many requests, please try again later', ttl > 0 ? ttl : windowSeconds));
          }

          return next();
        }
      }
    } catch (redisErr) {
      // Log warning and fail-open to memory fallback
      logger.warn({
        msg: '[RATE LIMITER] Redis unavailable, falling back to memory rate limiting',
        error: redisErr.message
      });
    }

    // In-memory Fallback
    try {
      const record = memoryStore.get(clientKey);

      if (!record || now > record.resetTime) {
        memoryStore.set(clientKey, {
          count: 1,
          resetTime: now + windowMs
        });
        res.setHeader('X-RateLimit-Limit', String(max));
        res.setHeader('X-RateLimit-Remaining', String(max - 1));
        return next();
      }

      record.count += 1;
      const remainingTimeSeconds = Math.ceil((record.resetTime - now) / 1000);

      res.setHeader('X-RateLimit-Limit', String(max));
      res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - record.count)));

      if (record.count > max) {
        return next(new RateLimitError('Too many requests, please try again later', remainingTimeSeconds));
      }

      return next();
    } catch (_memErr) {
      // Absolute fail-open: never block request if rate-limiter itself throws
      return next();
    }
  };
};
