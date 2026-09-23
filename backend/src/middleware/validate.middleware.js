import { ValidationError } from '../utils/app-error.js';

/**
 * Request Validation Middleware Factory
 * Validates request body, params, and query against provided Zod schemas.
 *
 * @param {Object} schemas - Validation schemas
 * @param {import('zod').ZodTypeAny} [schemas.body] - Schema for req.body
 * @param {import('zod').ZodTypeAny} [schemas.params] - Schema for req.params
 * @param {import('zod').ZodTypeAny} [schemas.query] - Schema for req.query
 * @returns {import('express').RequestHandler}
 */
export const validate = (schemas = {}) => {
  return async (req, _res, next) => {
    try {
      if (schemas.params) {
        const result = await schemas.params.safeParseAsync(req.params);
        if (!result.success) {
          const details = result.error.errors.map(e => ({
            location: 'params',
            field: e.path.join('.'),
            message: e.message
          }));
          return next(new ValidationError('URL parameter validation failed', details));
        }
        req.params = result.data;
      }

      if (schemas.query) {
        const result = await schemas.query.safeParseAsync(req.query);
        if (!result.success) {
          const details = result.error.errors.map(e => ({
            location: 'query',
            field: e.path.join('.'),
            message: e.message
          }));
          return next(new ValidationError('Query parameter validation failed', details));
        }
        req.query = result.data;
      }

      if (schemas.body) {
        const result = await schemas.body.safeParseAsync(req.body);
        if (!result.success) {
          const details = result.error.errors.map(e => ({
            location: 'body',
            field: e.path.join('.'),
            message: e.message
          }));
          return next(new ValidationError('Request body validation failed', details));
        }
        req.body = result.data;
      }

      next();
    } catch (err) {
      next(err);
    }
  };
};
