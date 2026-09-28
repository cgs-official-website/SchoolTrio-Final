import cors from 'cors';
import { env } from '../config/env.js';

/**
 * Configured CORS middleware using validated origins from environment.
 * Supports exact origin matching, wildcard subdomains (*.vercel.app), and development fallbacks.
 */
export const corsMiddleware = cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
    if (!origin) {
      return callback(null, true);
    }

    const cleanOrigin = origin.replace(/\/+$/, '');

    // Always allow Vercel frontend deployments and local dev, plus configured origins
    const isVercelDomain = cleanOrigin.endsWith('.vercel.app') || cleanOrigin.includes('vercel.app');

    const isAllowed =
      isVercelDomain ||
      env.parsedCorsOrigins.some(allowedOrigin => {
        if (allowedOrigin === '*') return true;
        if (allowedOrigin.startsWith('*.')) {
          const domainSuffix = allowedOrigin.slice(1); // e.g. .vercel.app
          return cleanOrigin.endsWith(domainSuffix);
        }
        return allowedOrigin === cleanOrigin;
      });

    if (isAllowed || env.isDevelopment) {
      return callback(null, true);
    }

    console.warn(`[CORS REJECTED] Origin: "${origin}". Allowed origins:`, env.parsedCorsOrigins);
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'X-Tenant-Id', 'Accept', 'Origin'],
  optionsSuccessStatus: 204
});
