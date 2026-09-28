import cors from 'cors';
import { env } from '../config/env.js';

/**
 * Configured CORS middleware using validated origins from environment.
 * Supports exact origin matching, wildcard subdomains (*.vercel.app), Vercel previews, and development fallbacks.
 */
export const corsMiddleware = cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. mobile apps, curl, server-to-server, health checks)
    if (!origin) {
      return callback(null, true);
    }

    const cleanOrigin = origin.replace(/\/+$/, '').toLowerCase();

    // Dynamically allow Vercel domains (*.vercel.app)
    const isVercelDomain = cleanOrigin.endsWith('.vercel.app') || cleanOrigin.includes('vercel.app');

    const isAllowed =
      isVercelDomain ||
      env.parsedCorsOrigins.some(allowedOrigin => {
        const cleanAllowed = allowedOrigin.toLowerCase();
        if (cleanAllowed === '*') return true;
        if (cleanAllowed.startsWith('*.')) {
          const domainSuffix = cleanAllowed.slice(1); // e.g. .vercel.app
          return cleanOrigin.endsWith(domainSuffix);
        }
        return cleanAllowed === cleanOrigin;
      });

    if (isAllowed || env.isDevelopment) {
      return callback(null, true);
    }

    console.warn(`[CORS REJECTED] Origin: "${origin}". Allowed origins:`, env.parsedCorsOrigins);
    return callback(new Error(`CORS policy rejection: Origin '${origin}' is not allowed.`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Request-Id',
    'X-Tenant-Id',
    'Accept',
    'Origin',
    'Cache-Control',
    'Pragma',
    'X-Requested-With'
  ],
  exposedHeaders: ['X-Request-Id', 'Content-Disposition'],
  optionsSuccessStatus: 204
});

