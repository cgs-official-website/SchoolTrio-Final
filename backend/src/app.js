import express from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { corsMiddleware } from './middleware/cors.middleware.js';
import { requestIdMiddleware } from './middleware/request-id.middleware.js';
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
  app.use(helmet());
  app.use(corsMiddleware);
  app.use(requestIdMiddleware);

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

  // 5. Mount Versioned API v1 Router
  app.use('/api/v1', apiV1Router);

  // 6. Undefined Route 404 Handler
  app.use(notFoundHandler);

  // 7. Global Centralized Error Handler
  app.use(errorMiddleware);

  return app;
};
