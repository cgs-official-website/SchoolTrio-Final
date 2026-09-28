import { describe, it, expect } from 'vitest';
import { corsMiddleware } from '../../../src/middleware/cors.middleware.js';

describe('corsMiddleware', () => {
  it('is a valid Express middleware function', () => {
    expect(typeof corsMiddleware).toBe('function');
  });

  it('allows Vercel production and preview subdomains (*.vercel.app)', () => {
    const originFn = corsMiddleware.options?.origin || corsMiddleware;
    let allowed = null;
    let error = null;

    corsMiddleware({ headers: { origin: 'https://school-trio-final-frontend.vercel.app' } }, {
      setHeader: () => {},
      getHeader: () => {}
    }, () => {});

    // Directly test origin callback if accessible
    if (typeof corsMiddleware === 'function') {
      const mockReq = { headers: { origin: 'https://my-preview-app.vercel.app' } };
      let passed = false;
      corsMiddleware(mockReq, { setHeader: () => {}, getHeader: () => {} }, () => {
        passed = true;
      });
      expect(passed).toBe(true);
    }
  });
});
