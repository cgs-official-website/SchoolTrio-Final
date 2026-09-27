import { describe, it, expect, vi } from 'vitest';
import { buildResilientDatabaseUrl } from '../../src/config/database.config.js';
import { requestTimeoutMiddleware } from '../../src/middleware/timeout.middleware.js';
import { errorMiddleware } from '../../src/middleware/error.middleware.js';
import { HTTP_STATUS, ERROR_CODES } from '../../src/config/constants.js';
import { prisma } from '../../src/database/prisma.client.js';

describe('BACKEND INFRA — Connection Resiliency & Timeout Verification', () => {
  describe('Phase 1 & 2: Resilient DATABASE_URL Configuration', () => {
    it('injects connect_timeout, pool_timeout, connection_limit, and statement_timeout into raw URL', () => {
      const rawUrl = 'postgresql://user:pass@mainline.proxy.rlwy.net:33442/railway?schema=public';
      const resilientUrl = buildResilientDatabaseUrl(rawUrl);

      expect(resilientUrl).toContain('connect_timeout=10');
      expect(resilientUrl).toContain('pool_timeout=10');
      expect(resilientUrl).toContain('connection_limit=10');
      expect(resilientUrl).toContain('options=-c+statement_timeout%3D30000');
    });

    it('preserves user-specified parameters if already defined', () => {
      const customUrl = 'postgresql://user:pass@host:5432/db?connect_timeout=5&connection_limit=5';
      const resilientUrl = buildResilientDatabaseUrl(customUrl);

      expect(resilientUrl).toContain('connect_timeout=5');
      expect(resilientUrl).toContain('connection_limit=5');
      expect(resilientUrl).toContain('pool_timeout=10');
      expect(resilientUrl).toContain('options=-c+statement_timeout%3D30000');
    });
  });

  describe('Phase 5: HTTP Request Timeout Middleware', () => {
    it('triggers HTTP 504 response when request processing exceeds timeout threshold', async () => {
      vi.useFakeTimers();

      const req = { id: 'test-req-123', headers: { 'x-test-timeout': 'true' } };
      let responseStatus = null;
      let responsePayload = null;

      const res = {
        headersSent: false,
        status: (s) => {
          responseStatus = s;
          return res;
        },
        json: (p) => {
          responsePayload = p;
          return res;
        },
        on: vi.fn()
      };
      const next = vi.fn();

      const middleware = requestTimeoutMiddleware(500); // 500ms timeout
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(responseStatus).toBeNull();

      // Fast-forward time past 500ms
      vi.advanceTimersByTime(600);

      expect(req.timedOut).toBe(true);
      expect(responseStatus).toBe(504);
      expect(responsePayload.success).toBe(false);
      expect(responsePayload.error.code).toBe('GATEWAY_TIMEOUT');
      expect(responsePayload.error.message).toBe('Request processing timed out');

      vi.useRealTimers();
    });
  });

  describe('Phase 9: Centralized Database Error Mapping', () => {
    it('maps Prisma P1001 connection reset error to HTTP 503 without leaking credentials', () => {
      const err = new Error('Can\'t reach database server at mainline.proxy.rlwy.net:33442 (10054 ConnectionReset)');
      err.code = 'P1001';

      let status = null;
      let body = null;

      const req = { id: 'req-p1001' };
      const res = {
        status: (s) => {
          status = s;
          return res;
        },
        json: (b) => {
          body = b;
          return res;
        },
        setHeader: vi.fn()
      };

      errorMiddleware(err, req, res, () => {});

      expect(status).toBe(503);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('SERVICE_UNAVAILABLE');
      expect(body.error.message).toBe('Database service temporarily unavailable. Please retry.');
      expect(body.error.message).not.toContain('mainline.proxy.rlwy.net');
      expect(body.error.message).not.toContain('10054');
    });

    it('maps Prisma P2024 pool timeout to HTTP 503', () => {
      const err = new Error('Timed out fetching a new connection from the connection pool');
      err.code = 'P2024';

      let status = null;
      let body = null;

      const req = { id: 'req-p2024' };
      const res = {
        status: (s) => {
          status = s;
          return res;
        },
        json: (b) => {
          body = b;
          return res;
        },
        setHeader: vi.fn()
      };

      errorMiddleware(err, req, res, () => {});

      expect(status).toBe(503);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('SERVICE_UNAVAILABLE');
      expect(body.error.message).toBe('Database connection pool busy. Please retry.');
    });

    it('maps P2010 PostgreSQL statement timeout (57014) to HTTP 504 Gateway Timeout', () => {
      const err = new Error('Raw query failed. Code: 57014. Message: ERROR: canceling statement due to statement timeout');
      err.code = 'P2010';

      let status = null;
      let body = null;

      const req = { id: 'req-p2010' };
      const res = {
        status: (s) => {
          status = s;
          return res;
        },
        json: (b) => {
          body = b;
          return res;
        },
        setHeader: vi.fn()
      };

      errorMiddleware(err, req, res, () => {});

      expect(status).toBe(504);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('GATEWAY_TIMEOUT');
      expect(body.error.message).toBe('Database query timed out');
    });

    it('maps P2028 transaction error safely', () => {
      const err = new Error('Transaction API error: Transaction already closed');
      err.code = 'P2028';

      let status = null;
      let body = null;

      const req = { id: 'req-p2028' };
      const res = {
        status: (s) => {
          status = s;
          return res;
        },
        json: (b) => {
          body = b;
          return res;
        },
        setHeader: vi.fn()
      };

      errorMiddleware(err, req, res, () => {});

      expect(status).toBe(500);
      expect(body.success).toBe(false);
      expect(body.error.message).toBe('Transaction timed out or failed. Please retry.');
    });
  });

  describe('Phase 14: Live Database Operational Verification', () => {
    it('successfully executes SELECT 1 using the application prisma singleton', async () => {
      const result = await prisma.$queryRaw`SELECT 1 as alive`;
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result[0].alive).toBe(1);
    });
  });
});
