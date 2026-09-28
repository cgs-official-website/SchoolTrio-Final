import { describe, it, expect } from 'vitest';
import { corsMiddleware } from '../../../src/middleware/cors.middleware.js';

describe('corsMiddleware', () => {
  it('is a valid Express middleware function', () => {
    expect(typeof corsMiddleware).toBe('function');
  });
});
