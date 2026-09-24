import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { disconnectPrisma } from './database/prisma.client.js';
import { disconnectRedis } from './database/redis.client.js';

// Initialize Express application
const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info(`[SMS BACKEND] Server running on port ${env.PORT} in ${env.NODE_ENV} mode`);
  logger.info(`[SMS BACKEND] Health live endpoint: http://localhost:${env.PORT}/health/live`);
  logger.info(`[SMS BACKEND] Health ready endpoint: http://localhost:${env.PORT}/health/ready`);
  logger.info(`[SMS BACKEND] API v1 base: http://localhost:${env.PORT}/api/v1`);
});

/**
 * Handles graceful process termination.
 * Closes HTTP server, disconnects Prisma and Redis clients, and terminates process.
 *
 * @param {string} signal - The termination signal received (SIGTERM | SIGINT)
 */
export const gracefulShutdown = async (signal) => {
  logger.info(`[SMS BACKEND] ${signal} signal received. Initiating graceful shutdown...`);

  server.close(async () => {
    logger.info('[SMS BACKEND] HTTP server closed.');

    try {
      await disconnectPrisma();
      logger.info('[SMS BACKEND] Prisma client disconnected.');
    } catch (err) {
      logger.error({ msg: '[SMS BACKEND] Error during Prisma disconnect', error: err.message });
    }

    try {
      await disconnectRedis();
      logger.info('[SMS BACKEND] Redis client disconnected.');
    } catch (err) {
      logger.error({ msg: '[SMS BACKEND] Error during Redis disconnect', error: err.message });
    }

    logger.info('[SMS BACKEND] Graceful shutdown complete. Process exiting.');
    process.exit(0);
  });

  // Force shutdown if cleanup hangs past 10 seconds
  setTimeout(() => {
    logger.error('[SMS BACKEND] Forcefully shutting down after 10-second timeout.');
    process.exit(1);
  }, 10000).unref();
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export { server };
