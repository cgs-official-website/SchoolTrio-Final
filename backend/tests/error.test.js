import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { errorMiddleware } from '../src/common/middlewares/error.middleware.js';
import { ValidationError } from '../src/common/errors/app.error.js';
import { env } from '../src/config/env.config.js';

describe('Centralized Error Handling & 404 Behavior', () => {
  const app = createApp();

  it('Returns structured 404 error envelope for undefined routes', async () => {
    const res = await request(app).get('/api/v1/non-existent-endpoint');

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('success', false);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toHaveProperty('code', 'NOT_FOUND');
    expect(res.body.error).toHaveProperty('message');
    expect(res.body.error).toHaveProperty('requestId');
    expect(res.body.error).toHaveProperty('timestamp');
  });

  it('Returns structured API v1 foundation greeting', async () => {
    const res = await request(app).get('/api/v1');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'operational');
    expect(res.body).toHaveProperty('phase', 'Phase 1B Bootstrap');
  });

  it('Errors do not expose stack traces in production mode', () => {
    // Temporarily set isProduction to true to test production redaction
    const originalIsProduction = env.isProduction;
    env.isProduction = true;

    let capturedStatus = null;
    let capturedBody = null;

    const mockReq = { id: 'test-req-prod-123' };
    const mockRes = {
      status: (code) => {
        capturedStatus = code;
        return {
          json: (body) => {
            capturedBody = body;
          }
        };
      }
    };

    const sensitiveError = new Error('Database password was incorrect in connection string');
    errorMiddleware(sensitiveError, mockReq, mockRes, () => {});

    expect(capturedStatus).toBe(500);
    expect(capturedBody.success).toBe(false);
    expect(capturedBody.error.stack).toBeUndefined();
    expect(capturedBody.error.message).toBe('An unexpected internal server error occurred');
    expect(capturedBody.error.requestId).toBe('test-req-prod-123');

    // Restore original state
    env.isProduction = originalIsProduction;
  });

  it('Formats operational AppError subclasses with status and details', () => {
    let capturedStatus = null;
    let capturedBody = null;

    const mockReq = { id: 'test-val-456' };
    const mockRes = {
      status: (code) => {
        capturedStatus = code;
        return {
          json: (body) => {
            capturedBody = body;
          }
        };
      }
    };

    const validationErr = new ValidationError('Invalid student data', [{ field: 'name', message: 'Name is required' }]);
    errorMiddleware(validationErr, mockReq, mockRes, () => {});

    expect(capturedStatus).toBe(400);
    expect(capturedBody.success).toBe(false);
    expect(capturedBody.error.code).toBe('VALIDATION_ERROR');
    expect(capturedBody.error.message).toBe('Invalid student data');
    expect(capturedBody.error.details).toEqual([{ field: 'name', message: 'Name is required' }]);
  });
});
