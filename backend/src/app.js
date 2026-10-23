import express from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { corsMiddleware } from './middleware/cors.middleware.js';
import { requestIdMiddleware } from './middleware/request-id.middleware.js';
import { requestTimeoutMiddleware } from './middleware/timeout.middleware.js';
import { errorMiddleware, notFoundHandler } from './middleware/error.middleware.js';
import healthRoutes from './modules/health/health.routes.js';
import apiV1Router from './routes/index.js';

/**
 * Creates and configures the Express application.
 * @returns {express.Application} Configured Express application instance
 */
export const createApp = () => {
  const app = express();

  // 1. Global Security Middlewares
  app.use(corsMiddleware);
  app.use(helmet());
  app.use(requestIdMiddleware);
  app.use(requestTimeoutMiddleware());

  // 2. HTTP Request Logging (suppress /health and /health/live to reduce log noise)
  if (!env.isTest) {
    app.use(
      pinoHttp({
        logger,
        autoLogging: {
          ignore: (req) => req.url === '/health' || req.url === '/health/live'
        },
        genReqId: (req) => req.id
      })
    );
  }

  // 3. Request Body Parsers
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // 4. Mount Root Health Endpoints (for load balancers and orchestrators)
  app.use('/health', healthRoutes);

  // 5. Mount Versioned API v1 Router with strict no-cache headers to ensure real-time UI updates
  app.set('etag', false);
  app.use('/api/v1', (req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.set('Surrogate-Control', 'no-store');
    next();
  }, apiV1Router);

  // 6. Undefined Route 404 Handler
  app.use(notFoundHandler);

  // 7. Global Centralized Error Handler
  app.use(errorMiddleware);

  return app;
};
