import { describe, it, expect } from 'vitest';
import { errorMiddleware } from '../../src/middleware/error.middleware.js';
import { env } from '../../src/config/env.js';

describe('Security: Error Redaction & Prisma Error Mapping', () => {
  const createMockContext = () => {
    let capturedStatus = null;
    let capturedBody = null;

    const req = { id: 'req-err-123' };
    const res = {
      status: (code) => {
        capturedStatus = code;
        return {
          json: (body) => {
            capturedBody = body;
          }
        };
      },
      setHeader: () => {}
    };

    return {
      req,
      res,
      getResult: () => ({ status: capturedStatus, body: capturedBody })
    };
  };

  it('Maps Prisma P2002 (unique constraint) to HTTP 409 Conflict without raw SQL', () => {
    const { req, res, getResult } = createMockContext();

    const prismaP2002 = new Error('Unique constraint failed on the fields: (`email`)');
    prismaP2002.code = 'P2002';
    prismaP2002.meta = { target: ['email'] };

    errorMiddleware(prismaP2002, req, res, () => {});

    const { status, body } = getResult();
    expect(status).toBe(409);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('CONFLICT');
    expect(body.error.message).toContain('email');
    expect(body.error.requestId).toBe('req-err-123');
  });

  it('Maps Prisma P2025 (not found) to HTTP 404 Not Found', () => {
    const { req, res, getResult } = createMockContext();

    const prismaP2025 = new Error('An operation failed because it depends on one or more records that were required but not found.');
    prismaP2025.code = 'P2025';

    errorMiddleware(prismaP2025, req, res, () => {});

    const { status, body } = getResult();
    expect(status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.message).toBe('Requested record was not found');
  });

  it('Maps Prisma P2003 (foreign key failure) to safe 409 RELATIONSHIP_CONFLICT without exposing database schema internals', () => {
    const { req, res, getResult } = createMockContext();

    const prismaP2003 = new Error('Foreign key constraint failed on the field: `students_school_id_fkey (index)`');
    prismaP2003.code = 'P2003';
    prismaP2003.meta = { field_name: 'school_id' };

    errorMiddleware(prismaP2003, req, res, () => {});

    const { status, body } = getResult();
    expect(status).toBe(409);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('RELATIONSHIP_CONFLICT');
    expect(body.error.message).toBe('Invalid reference: referenced entity does not exist or has dependent records');
    // Ensure raw table/fkey constraint name is NOT exposed in the message or details
    expect(body.error.message).not.toContain('students_school_id_fkey');
    expect(body.error.details).toBeNull();
  });

  it('Redacts 500 error messages and strips stack traces when isProduction is true', () => {
    const originalIsProduction = env.isProduction;
    env.isProduction = true;

    const { req, res, getResult } = createMockContext();

    const internalSecretError = new Error('Failed to connect to postgresql://postgres:SUPER_SECRET_PASS@db:5432');
    errorMiddleware(internalSecretError, req, res, () => {});

    const { status, body } = getResult();
    expect(status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error.message).toBe('An unexpected internal server error occurred');
    expect(body.error.stack).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain('SUPER_SECRET_PASS');

    env.isProduction = originalIsProduction;
  });
});
