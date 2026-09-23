import { describe, it, expect } from 'vitest';
import { envSchema } from '../src/config/env.config.js';

describe('Environment Configuration Schema Validation', () => {
  it('Validates a correct environment payload', () => {
    const validConfig = {
      NODE_ENV: 'development',
      PORT: '5000',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/sms_dev',
      REDIS_URL: 'redis://localhost:6379',
      CORS_ORIGINS: 'http://localhost:5173,http://localhost:3000'
    };

    const result = envSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.PORT).toBe(5000);
      expect(result.data.NODE_ENV).toBe('development');
    }
  });

  it('Rejects missing DATABASE_URL', () => {
    const invalidConfig = {
      NODE_ENV: 'development',
      PORT: '5000',
      REDIS_URL: 'redis://localhost:6379'
    };

    const result = envSchema.safeParse(invalidConfig);
    expect(result.success).toBe(false);
  });

  it('Rejects missing REDIS_URL', () => {
    const invalidConfig = {
      NODE_ENV: 'development',
      PORT: '5000',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/sms_dev'
    };

    const result = envSchema.safeParse(invalidConfig);
    expect(result.success).toBe(false);
  });

  it('Applies default PORT and NODE_ENV when omitted', () => {
    const minimalConfig = {
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/sms_dev',
      REDIS_URL: 'redis://localhost:6379'
    };

    const result = envSchema.safeParse(minimalConfig);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.PORT).toBe(5000);
      expect(result.data.NODE_ENV).toBe('development');
    }
  });
});
