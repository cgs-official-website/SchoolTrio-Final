import { redis } from '../database/redis.client.js';
import { logger } from '../utils/logger.js';

// In-memory fallback cache when Redis is offline
const memoryStore = new Map();
const MAX_MEMORY_ITEMS = 5000;

export const clearMemoryCache = () => memoryStore.clear();

const getFromMemory = (key) => {
  const item = memoryStore.get(key);
  if (!item) return null;
  if (item.expiresAt && Date.now() > item.expiresAt) {
    memoryStore.delete(key);
    return null;
  }
  return item.value;
};

const setToMemory = (key, value, ttlSeconds) => {
  if (memoryStore.size >= MAX_MEMORY_ITEMS) {
    const oldestKey = memoryStore.keys().next().value;
    if (oldestKey) memoryStore.delete(oldestKey);
  }
  memoryStore.set(key, {
    value,
    expiresAt: ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : null
  });
};

const delFromMemory = (key) => {
  return memoryStore.delete(key);
};

const delPatternFromMemory = (pattern) => {
  const regex = new RegExp('^' + pattern.replace(/[-[\]{}()+?.,\\^$|#\s]/g, '\\$&').replace(/\*/g, '.*') + '$');
  let count = 0;
  for (const k of memoryStore.keys()) {
    if (regex.test(k)) {
      memoryStore.delete(k);
      count++;
    }
  }
  return count;
};

/**
 * Robust Redis Caching Service with Fail-Open Semantics and In-Memory Fallback
 */
export class RedisCacheService {
  /**
   * Retrieves and deserializes a value from Redis or in-memory fallback.
   *
   * @param {string} key - Cache key
   * @returns {Promise<any|null>} Deserialized value or null
   */
  static async get(key) {
    try {
      if (redis.status !== 'ready' && redis.status !== 'connect') {
        return getFromMemory(key);
      }
      const raw = await redis.get(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (err) {
      logger.warn({ msg: '[CACHE GET ERROR] Failing open', key, error: err.message });
      return null;
    }
  }

  /**
   * Serializes and sets a value in Redis with TTL or in-memory fallback.
   *
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} [ttlSeconds=300] - Expiration time in seconds (default 5 min)
   * @returns {Promise<boolean>} True if successful
   */
  static async set(key, value, ttlSeconds = 300) {
    try {
      if (redis.status !== 'ready' && redis.status !== 'connect') {
        setToMemory(key, value, ttlSeconds);
        return true;
      }
      const serialized = JSON.stringify(value);
      if (ttlSeconds > 0) {
        await redis.set(key, serialized, 'EX', ttlSeconds);
      } else {
        await redis.set(key, serialized);
      }
      setToMemory(key, value, ttlSeconds);
      return true;
    } catch (err) {
      logger.warn({ msg: '[CACHE SET ERROR] Failing open', key, error: err.message });
      return false;
    }
  }

  /**
   * Deletes a key from Redis and in-memory fallback.
   *
   * @param {string} key - Cache key
   * @returns {Promise<boolean>} True if key was deleted
   */
  static async del(key) {
    delFromMemory(key);
    try {
      if (redis.status !== 'ready' && redis.status !== 'connect') {
        return true;
      }
      const result = await redis.del(key);
      return result > 0;
    } catch (err) {
      logger.warn({ msg: '[CACHE DEL ERROR] Failing open', key, error: err.message });
      return false;
    }
  }

  /**
   * Deletes all keys matching a glob-style pattern using SCAN or in-memory fallback.
   *
   * @param {string} pattern - Key pattern (e.g. 'school:123:*')
   * @returns {Promise<number>} Number of keys deleted
   */
  static async delPattern(pattern) {
    const memoryDeleted = delPatternFromMemory(pattern);
    try {
      if (redis.status !== 'ready' && redis.status !== 'connect') {
        return memoryDeleted;
      }

      let cursor = '0';
      let totalDeleted = 0;

      do {
        const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = nextCursor;

        if (keys.length > 0) {
          const deleted = await redis.del(...keys);
          totalDeleted += deleted;
        }
      } while (cursor !== '0');

      return totalDeleted;
    } catch (err) {
      logger.warn({ msg: '[CACHE DEL_PATTERN ERROR] Failing open', pattern, error: err.message });
      return 0;
    }
  }

  /**
   * Checks if a key exists in Redis or in-memory fallback.
   *
   * @param {string} key - Cache key
   * @returns {Promise<boolean>}
   */
  static async has(key) {
    try {
      if (redis.status !== 'ready' && redis.status !== 'connect') {
        return getFromMemory(key) !== null;
      }
      const exists = await redis.exists(key);
      return exists === 1;
    } catch (err) {
      logger.warn({ msg: '[CACHE HAS ERROR] Failing open', key, error: err.message });
      return false;
    }
  }

  /**
   * Cache-aside pattern helper: retrieves from cache, or invokes fetchFn and caches result.
   *
   * @param {string} key - Cache key
   * @param {number} ttlSeconds - Expiration time in seconds
   * @param {Function} fetchFn - Async function returning fresh data
   * @returns {Promise<any>}
   */
  static async wrap(key, ttlSeconds, fetchFn) {
    const cached = await this.get(key);
    if (cached !== null) {
      return cached;
    }

    const fresh = await fetchFn();
    if (fresh !== undefined && fresh !== null) {
      await this.set(key, fresh, ttlSeconds);
    }
    return fresh;
  }
}
