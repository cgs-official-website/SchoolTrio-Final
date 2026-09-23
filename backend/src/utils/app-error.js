import { HTTP_STATUS, ERROR_CODES } from '../config/constants.js';

/**
 * Base Application Error
 */
export class AppError extends Error {
  /**
   * @param {string} message - Human-readable error message
   * @param {number} statusCode - HTTP status code
   * @param {string} code - Application error code
   * @param {any} details - Additional structured error details
   */
  constructor(
    message = 'An internal server error occurred',
    statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR,
    code = ERROR_CODES.INTERNAL_SERVER_ERROR,
    details = null
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details = null) {
    super(message, HTTP_STATUS.BAD_REQUEST, ERROR_CODES.VALIDATION_ERROR, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required', code = ERROR_CODES.UNAUTHORIZED, details = null) {
    super(message, HTTP_STATUS.UNAUTHORIZED, code, details);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action', code = ERROR_CODES.FORBIDDEN, details = null) {
    super(message, HTTP_STATUS.FORBIDDEN, code, details);
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, HTTP_STATUS.NOT_FOUND, ERROR_CODES.NOT_FOUND);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource already exists') {
    super(message, HTTP_STATUS.CONFLICT, ERROR_CODES.CONFLICT);
  }
}

export class RelationshipConflictError extends AppError {
  constructor(message = 'Invalid reference: referenced entity does not exist or has dependent records', details = null) {
    super(message, HTTP_STATUS.CONFLICT, ERROR_CODES.RELATIONSHIP_CONFLICT, details);
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests, please try again later', retryAfterSeconds = null) {
    super(
      message,
      HTTP_STATUS.TOO_MANY_REQUESTS,
      ERROR_CODES.RATE_LIMIT_EXCEEDED,
      retryAfterSeconds ? { retryAfter: retryAfterSeconds } : null
    );
  }
}

export class TenantAccessError extends AppError {
  constructor(message = 'Tenant access violation: unauthorized or invalid tenant context') {
    super(message, HTTP_STATUS.FORBIDDEN, ERROR_CODES.TENANT_ACCESS_ERROR);
  }
}
