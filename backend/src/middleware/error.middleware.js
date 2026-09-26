import { AppError } from '../utils/app-error.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { HTTP_STATUS, ERROR_CODES } from '../config/constants.js';

/**
 * Maps Prisma database errors to safe HTTP application errors.
 * Logs internal details for diagnosis without exposing schema metadata to clients.
 *
 * @param {Error} err - Error caught by Express
 * @returns {{ statusCode: number, code: string, message: string, details: any } | null}
 */
const mapPrismaError = (err) => {
  if (err.name === 'PrismaClientInitializationError' || err.message?.includes('connection pool')) {
    logger.error({
      msg: '[PRISMA CONNECTION POOL TIMEOUT] Database connection pool exhausted',
      errorMessage: err.message
    });
    return {
      statusCode: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      code: ERROR_CODES.INTERNAL_SERVER_ERROR,
      message: 'Database connection pool busy. Please retry.',
      details: null
    };
  }

  // Prisma Known Request Error (e.g. P2002, P2025, P2003)
  if (typeof err.code === 'string' && /^P\d{4}$/.test(err.code)) {
    switch (err.code) {
      // P2002: Unique constraint failed
      case 'P2002': {
        const target = Array.isArray(err.meta?.target) ? err.meta.target.join(', ') : 'field';
        return {
          statusCode: HTTP_STATUS.CONFLICT,
          code: ERROR_CODES.CONFLICT,
          message: `A record with this ${target} already exists`,
          details: null
        };
      }

      // P2025: Record to update/delete/find not found
      case 'P2025': {
        return {
          statusCode: HTTP_STATUS.NOT_FOUND,
          code: ERROR_CODES.NOT_FOUND,
          message: 'Requested record was not found',
          details: null
        };
      }

      // P2003: Foreign key constraint failed
      case 'P2003': {
        logger.warn({
          msg: '[PRISMA P2003 DIAGNOSTIC] Foreign key constraint failure',
          field_name: err.meta?.field_name,
          modelName: err.meta?.modelName
        });
        return {
          statusCode: HTTP_STATUS.CONFLICT,
          code: ERROR_CODES.RELATIONSHIP_CONFLICT,
          message: 'Invalid reference: referenced entity does not exist or has dependent records',
          details: null
        };
      }

      // P2000: Value out of range
      case 'P2000': {
        return {
          statusCode: HTTP_STATUS.BAD_REQUEST,
          code: ERROR_CODES.VALIDATION_ERROR,
          message: 'Input value exceeds allowable column length or range',
          details: null
        };
      }

      default: {
        logger.error({
          msg: `[PRISMA UNHANDLED ERROR] Code: ${err.code}`,
          meta: err.meta,
          errorMessage: err.message
        });
        return {
          statusCode: HTTP_STATUS.INTERNAL_SERVER_ERROR,
          code: ERROR_CODES.INTERNAL_SERVER_ERROR,
          message: 'Database operation failed',
          details: null
        };
      }
    }
  }

  return null;
};

/**
 * Global Centralized Express Error Handling Middleware.
 * Intercepts all operational and unexpected errors, maps them, and returns a uniform JSON contract.
 */
export const errorMiddleware = (err, req, res, _next) => {
  let statusCode = err.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
  let code = err.code || ERROR_CODES.INTERNAL_SERVER_ERROR;
  let message = err.message || 'An unexpected error occurred';
  let details = err.details || null;

  // 1. Handle JSON parse error (SyntaxError from express.json)
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    statusCode = HTTP_STATUS.BAD_REQUEST;
    code = ERROR_CODES.INVALID_JSON;
    message = 'Malformed JSON payload in request body';
    details = null;
  }

  // 2. Handle Zod validation error
  if (err.name === 'ZodError') {
    statusCode = HTTP_STATUS.BAD_REQUEST;
    code = ERROR_CODES.VALIDATION_ERROR;
    message = 'Input validation failed';
    details = err.errors?.map(e => ({
      field: e.path.join('.'),
      message: e.message
    })) || null;
  }

  // 3. Handle TenantAccessError
  if (err.name === 'TenantAccessError') {
    statusCode = err.statusCode || HTTP_STATUS.FORBIDDEN;
    code = ERROR_CODES.TENANT_ACCESS_ERROR;
    message = err.message;
    details = null;
  }

  // 4. Handle Prisma database errors
  const prismaMapped = mapPrismaError(err);
  if (prismaMapped) {
    statusCode = prismaMapped.statusCode;
    code = prismaMapped.code;
    message = prismaMapped.message;
    details = prismaMapped.details;
  }

  // 5. In production mode, redact unexpected 500 error messages
  if (env.isProduction && statusCode === HTTP_STATUS.INTERNAL_SERVER_ERROR) {
    message = 'An unexpected internal server error occurred';
    details = null;
  }

  // 6. Assemble standardized response envelope
  const responsePayload = {
    success: false,
    error: {
      code,
      message,
      details,
      requestId: req.id || null,
      timestamp: new Date().toISOString()
    }
  };

  // Include stack trace only in non-production environments for debugging
  if (!env.isProduction && err.stack) {
    responsePayload.error.stack = err.stack;
  }

  // Set Retry-After header if rate limit error
  if (statusCode === HTTP_STATUS.TOO_MANY_REQUESTS && details?.retryAfter) {
    res.setHeader('Retry-After', String(details.retryAfter));
  }

  res.status(statusCode).json(responsePayload);
};

/**
 * 404 Route Not Found Handler
 */
export const notFoundHandler = (req, _res, next) => {
  const error = new AppError(
    `Route ${req.method} ${req.originalUrl} not found`,
    HTTP_STATUS.NOT_FOUND,
    ERROR_CODES.NOT_FOUND
  );
  next(error);
};
