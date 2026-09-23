/**
 * Backwards compatibility re-export.
 * Canonical AppError hierarchy lives in src/utils/app-error.js.
 */
export {
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  RelationshipConflictError,
  RateLimitError,
  TenantAccessError
} from '../../utils/app-error.js';
