import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import { z } from 'zod';
import { validate } from '../../src/middleware/validate.middleware.js';
import { errorMiddleware } from '../../src/middleware/error.middleware.js';
import { uuidSchema, paginationQuerySchema } from '../../src/utils/validators.js';

describe('Integration: Validation Middleware', () => {
  const createTestApp = () => {
    const app = express();
    app.use(express.json());

    // Test route with body and query validation
    const testBodySchema = z.object({
      name: z.string().min(3),
      age: z.number().int().positive()
    });

    const testParamSchema = z.object({
      id: uuidSchema
    });

    app.post(
      '/test-validation/:id',
      validate({
        params: testParamSchema,
        query: paginationQuerySchema,
        body: testBodySchema
      }),
      (req, res) => {
        res.json({
          success: true,
          params: req.params,
          query: req.query,
          body: req.body
        });
      }
    );

    app.use(errorMiddleware);
    return app;
  };

  const app = createTestApp();

  it('Passes with valid body, params, and query, applying coercions', async () => {
    const validUuid = '25e9637a-7fa4-4ac2-b43d-b4c0edcf2932';
    const res = await request(app)
      .post(`/test-validation/${validUuid}?page=2&limit=10`)
      .send({ name: 'Alice Smith', age: 25 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.params.id).toBe(validUuid);
    expect(res.body.query.page).toBe(2);
    expect(res.body.query.limit).toBe(10);
    expect(res.body.body).toEqual({ name: 'Alice Smith', age: 25 });
  });

  it('Returns 400 VALIDATION_ERROR on invalid body', async () => {
    const validUuid = '25e9637a-7fa4-4ac2-b43d-b4c0edcf2932';
    const res = await request(app)
      .post(`/test-validation/${validUuid}`)
      .send({ name: 'Al', age: -5 }); // name too short, age negative

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(res.body.error.details)).toBe(true);
    expect(res.body.error.details.length).toBeGreaterThanOrEqual(1);
  });

  it('Returns 400 VALIDATION_ERROR on invalid UUID param', async () => {
    const res = await request(app)
      .post('/test-validation/invalid-id')
      .send({ name: 'Alice', age: 25 });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details[0].location).toBe('params');
  });
});
