import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RedisCacheService } from '../../src/services/redis-cache.service.js';
import { redis } from '../../src/database/redis.client.js';

describe('Unit: RedisCacheService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('get deserializes valid JSON from Redis', async () => {
    redis.status = 'ready';
    vi.spyOn(redis, 'get').mockResolvedValue(JSON.stringify({ key: 'val' }));

    const result = await RedisCacheService.get('test-key');
    expect(result).toEqual({ key: 'val' });
  });

  it('get returns null and fails open when Redis throws an error', async () => {
    redis.status = 'ready';
    vi.spyOn(redis, 'get').mockRejectedValue(new Error('Connection lost'));

    const result = await RedisCacheService.get('error-key');
    expect(result).toBeNull();
  });

  it('set serializes data and saves to Redis with TTL', async () => {
    redis.status = 'ready';
    const setSpy = vi.spyOn(redis, 'set').mockResolvedValue('OK');

    const success = await RedisCacheService.set('user:1', { name: 'Alice' }, 120);
    expect(success).toBe(true);
    expect(setSpy).toHaveBeenCalledWith('user:1', JSON.stringify({ name: 'Alice' }), 'EX', 120);
  });

  it('set returns false and fails open when Redis throws', async () => {
    redis.status = 'ready';
    vi.spyOn(redis, 'set').mockRejectedValue(new Error('Write error'));

    const success = await RedisCacheService.set('user:1', { name: 'Alice' });
    expect(success).toBe(false);
  });

  it('del successfully deletes key', async () => {
    redis.status = 'ready';
    vi.spyOn(redis, 'del').mockResolvedValue(1);

    const success = await RedisCacheService.del('user:1');
    expect(success).toBe(true);
  });

  it('wrap fetches fresh data when cache misses and caches result', async () => {
    redis.status = 'ready';
    vi.spyOn(redis, 'get').mockResolvedValue(null);
    const setSpy = vi.spyOn(redis, 'set').mockResolvedValue('OK');
    const fetchFn = vi.fn().mockResolvedValue({ fresh: true });

    const result = await RedisCacheService.wrap('fresh-key', 300, fetchFn);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(setSpy).toHaveBeenCalledWith('fresh-key', JSON.stringify({ fresh: true }), 'EX', 300);
    expect(result).toEqual({ fresh: true });
  });

  it('wrap returns cached data without calling fetchFn on cache hit', async () => {
    redis.status = 'ready';
    vi.spyOn(redis, 'get').mockResolvedValue(JSON.stringify({ cached: true }));
    const fetchFn = vi.fn();

    const result = await RedisCacheService.wrap('cached-key', 300, fetchFn);

    expect(fetchFn).not.toHaveBeenCalled();
    expect(result).toEqual({ cached: true });
  });
});
