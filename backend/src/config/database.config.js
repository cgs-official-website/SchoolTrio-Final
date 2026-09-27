import { env } from './env.js';

/**
 * Enforces evidence-based connection resilience parameters on DATABASE_URL.
 * - connect_timeout=10: Prevents TCP/TLS handshake hanging.
 * - pool_timeout=10: Prevents waiting indefinitely for pool slots.
 * - connection_limit=10: Prevents Railway proxy connection exhaustion.
 * - options=-c statement_timeout=30000: Cancels long-running queries at 30 seconds.
 *
 * @param {string} rawUrl - Raw DATABASE_URL environment variable
 * @returns {string} Resilient DATABASE_URL string
 */
export const buildResilientDatabaseUrl = (rawUrl) => {
  if (!rawUrl) return rawUrl;
  try {
    const urlObj = new URL(rawUrl);

    if (!urlObj.searchParams.has('connect_timeout')) {
      urlObj.searchParams.set('connect_timeout', '10');
    }
    if (!urlObj.searchParams.has('pool_timeout')) {
      urlObj.searchParams.set('pool_timeout', '10');
    }
    if (!urlObj.searchParams.has('connection_limit')) {
      urlObj.searchParams.set('connection_limit', '10');
    }
    if (!urlObj.searchParams.has('options')) {
      urlObj.searchParams.set('options', '-c statement_timeout=30000');
    }

    return urlObj.toString();
  } catch (err) {
    return rawUrl;
  }
};

export const databaseConfig = {
  url: buildResilientDatabaseUrl(env.DATABASE_URL),
  logLevels: env.isDevelopment ? ['warn', 'error'] : ['error']
};

