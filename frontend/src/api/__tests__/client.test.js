import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { apiClient, ApiError } from '../client.js';
import { setAccessToken, clearAccessToken, getAccessToken } from '../../services/tokenService.js';

describe('apiClient', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    clearAccessToken();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('performs standard GET request with credentials include', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { message: 'hello' } })
    });

    const res = await apiClient('/api/v1/test');

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('/api/v1/test');
    expect(options.credentials).toBe('include');
    expect(options.headers['Authorization']).toBeUndefined();
    expect(res).toEqual({ success: true, data: { message: 'hello' } });
  });

  it('injects Bearer token when in-memory access token is set', async () => {
    setAccessToken('test-access-token-123');

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { ok: true } })
    });

    await apiClient('/api/v1/protected');

    const [, options] = global.fetch.mock.calls[0];
    expect(options.headers['Authorization']).toBe('Bearer test-access-token-123');
  });

  it('handles single-flight concurrent 401 refresh correctly', async () => {
    setAccessToken('stale-token');

    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(async (url, opts) => {
      callCount++;
      // Refresh endpoint
      if (url.includes('/api/v1/auth/refresh')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: { accessToken: 'fresh-token-456' }
          })
        };
      }

      // Initial protected calls return 401 if stale-token is passed
      if (opts?.headers?.Authorization === 'Bearer stale-token') {
        return {
          ok: false,
          status: 401,
          json: async () => ({ error: { code: 'TOKEN_EXPIRED', message: 'Token expired' } })
        };
      }

      // Retried protected calls with fresh token succeed
      if (opts?.headers?.Authorization === 'Bearer fresh-token-456') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: { resource: url } })
        };
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true })
      };
    });

    // Fire 3 concurrent protected requests
    const [res1, res2, res3] = await Promise.all([
      apiClient('/api/v1/resource-a'),
      apiClient('/api/v1/resource-b'),
      apiClient('/api/v1/resource-c')
    ]);

    expect(res1.data.resource).toBe('/api/v1/resource-a');
    expect(res2.data.resource).toBe('/api/v1/resource-b');
    expect(res3.data.resource).toBe('/api/v1/resource-c');

    // Verify only ONE refresh request was made across all 3 concurrent 401s
    const refreshCalls = global.fetch.mock.calls.filter(([url]) => url.includes('/api/v1/auth/refresh'));
    expect(refreshCalls.length).toBe(1);

    // Verify new access token is stored in memory
    expect(getAccessToken()).toBe('fresh-token-456');
  });

  it('clears access token and fails if refresh request fails with 401', async () => {
    setAccessToken('invalid-token');

    global.fetch = vi.fn().mockImplementation(async (url) => {
      if (url.includes('/api/v1/auth/refresh')) {
        return {
          ok: false,
          status: 401,
          json: async () => ({ error: { code: 'INVALID_REFRESH_TOKEN', message: 'Session expired' } })
        };
      }
      return {
        ok: false,
        status: 401,
        json: async () => ({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } })
      };
    });

    await expect(apiClient('/api/v1/protected')).rejects.toThrow(ApiError);
    expect(getAccessToken()).toBeNull();
  });

  it('bypasses 401 interceptor for auth endpoints to prevent infinite refresh loops', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { code: 'INVALID_CREDENTIALS', message: 'Bad password' } })
    });

    await expect(apiClient('/api/v1/auth/login', { method: 'POST' })).rejects.toThrow(ApiError);

    // Should NOT have called /api/v1/auth/refresh
    const refreshCalls = global.fetch.mock.calls.filter(([url]) => url.includes('/api/v1/auth/refresh'));
    expect(refreshCalls.length).toBe(0);
  });
});
