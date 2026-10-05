import dotenv from 'dotenv';
import { z } from 'zod';

// Load .env file into process.env
dotenv.config();

/**
 * Zod schema defining all environment configuration variables.
 * Enforces strict typing, defaults, and validation for the backend.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173,*.vercel.app,https://school-trio-final-frontend.vercel.app,*.teamzuna.in,https://schooltrio.teamzuna.in'),

  // Rate Limiting defaults
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(100),

  // Cloudinary credentials (Optional during foundation phase)
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),

  // Deferred feature secrets for Phase 4B+ (Optional in Phase 4A)
  JWT_SECRET: z.string().default('sms-production-master-jwt-secret-key-32-chars-minimum-safe-default-2026'),
  JWT_REFRESH_SECRET: z.string().default('sms-production-master-jwt-refresh-secret-key-32-chars-minimum-safe-default-2026'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
  ENCRYPTION_MASTER_KEY: z.string().optional(),
  ZUNA_SUPPORT_SERVICE_ACCOUNT: z.string().optional(),

  // Firebase Authentication Bridge (Phase 4B.6)
  FIREBASE_PROJECT_ID: z.string().default('school-management-system-6a2c4'),
  FIREBASE_SERVICE_ACCOUNT_KEY: z.string().optional(),
  FIREBASE_SERVICE_ACCOUNT_PATH: z.string().optional(),

  // SMTP Email Delivery Configuration (Nodemailer)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z
    .enum(['true', 'false', '1', '0'])
    .transform(v => v === 'true' || v === '1')
    .optional()
    .default('false'),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default('School Management System <noreply@schoolmanagement.com>')
});



/**
 * Parses and validates environment variables.
 * @returns {z.infer<typeof envSchema> & { parsedCorsOrigins: string[], isProduction: boolean, isDevelopment: boolean, isTest: boolean }}
 */
const parseEnv = () => {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const errorDetails = result.error.errors
      .map(err => `  - ${err.path.join('.')}: ${err.message}`)
      .join('\n');
    console.error(`\x1b[31m[CONFIG ERROR] Invalid environment variables:\n${errorDetails}\x1b[0m`);
    throw new Error(`Invalid environment configuration:\n${errorDetails}`);
  }

  // Parse CORS origins into clean array (strip quotes, trailing slashes, whitespace)
  const parsedOrigins = result.data.CORS_ORIGINS.split(',')
    .map(origin => origin.trim().replace(/^["']|["']$/g, '').replace(/\/+$/, ''))
    .filter(Boolean);

  const jwtSecret = (result.data.JWT_SECRET && result.data.JWT_SECRET.length >= 32)
    ? result.data.JWT_SECRET
    : 'sms-production-master-jwt-secret-key-32-chars-minimum-safe-default-2026';

  const jwtRefreshSecret = (result.data.JWT_REFRESH_SECRET && result.data.JWT_REFRESH_SECRET.length >= 32)
    ? result.data.JWT_REFRESH_SECRET
    : 'sms-production-master-jwt-refresh-secret-key-32-chars-minimum-safe-default-2026';

  return {
    ...result.data,
    JWT_SECRET: jwtSecret,
    JWT_REFRESH_SECRET: jwtRefreshSecret,
    parsedCorsOrigins: parsedOrigins,
    isProduction: result.data.NODE_ENV === 'production',
    isDevelopment: result.data.NODE_ENV === 'development',
    isTest: result.data.NODE_ENV === 'test'
  };
};

export const env = parseEnv();
