import pino from 'pino';
import { env } from '../config/env.js';

/**
 * List of sensitive key paths that must be automatically redacted in log output.
 */
const SENSITIVE_REDACT_PATHS = [
  'password',
  'passwordHash',
  'password_hash',
  'token',
  'refreshToken',
  'refresh_token',
  'accessToken',
  'access_token',
  'secret',
  'jwtSecret',
  'apiKey',
  'api_key',
  'apiKeysEncrypted',
  'api_keys_encrypted',
  'authorization',
  'cookie',
  '*.password',
  '*.passwordHash',
  '*.token',
  '*.secret',
  '*.apiKey',
  '*.apiKeysEncrypted',
  'req.headers.authorization',
  'req.headers.cookie'
];

/**
 * Centralized Structured Pino Logger
 */
export const logger = pino({
  level: env.isProduction ? 'info' : 'debug',
  redact: {
    paths: SENSITIVE_REDACT_PATHS,
    censor: '[REDACTED]'
  },
  ...(env.isDevelopment && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
        ignore: 'pid,hostname'
      }
    }
  })
});
