import { Router } from 'express';
import * as studentHealthController from './student-health.controller.js';
import * as studentHealthSchemas from './student-health.schemas.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { tenantContext } from '../../middleware/tenant.middleware.js';
import { requirePermission } from '../../middleware/rbac.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { rateLimit } from '../../middleware/rate-limit.middleware.js';
import { SYSTEM_ROLES, ERROR_CODES } from '../../config/constants.js';
import { ForbiddenError } from '../../utils/app-error.js';

export const studentHealthRouter = Router();

const healthMutationRateLimiter = rateLimit({ max: 30, windowMs: 60000 });

/**
 * Custom Authorization Gate for Health Read:
 * - SUPER_ADMIN & SCHOOL_ADMIN: universal institutional access
 * - PARENT & STUDENT: permitted through to service layer (for child-linking / self-scoping verification)
 * - Staff/Teachers: require 'students:read' permission
 */
export const requireHealthRead = (req, res, next) => {
  const user = req.auth || req.user;
  const role = user?.systemRole || user?.role;

  if (
    role === SYSTEM_ROLES.SUPER_ADMIN ||
    role === SYSTEM_ROLES.SCHOOL_ADMIN ||
    role === SYSTEM_ROLES.PARENT ||
    role === SYSTEM_ROLES.STUDENT
  ) {
    return next();
  }

  return requirePermission('students', 'read')(req, res, next);
};

/**
 * Custom Authorization Gate for Health Edit:
 * - SUPER_ADMIN & SCHOOL_ADMIN: universal institutional edit
 * - PARENT & STUDENT: explicitly blocked with 403 Forbidden
 * - Staff/Teachers: require 'students:edit' permission
 */
export const requireHealthEdit = (req, res, next) => {
  const user = req.auth || req.user;
  const role = user?.systemRole || user?.role;

  if (role === SYSTEM_ROLES.SUPER_ADMIN || role === SYSTEM_ROLES.SCHOOL_ADMIN) {
    return next();
  }

  if (role === SYSTEM_ROLES.PARENT || role === SYSTEM_ROLES.STUDENT) {
    return next(
      new ForbiddenError('Access denied: parents and students cannot edit health records', ERROR_CODES.FORBIDDEN)
    );
  }

  return requirePermission('students', 'edit')(req, res, next);
};

/**
 * GET /api/v1/students/:id/health
 */
studentHealthRouter.get(
  '/:id/health',
  authenticate,
  tenantContext({ requireTenant: true }),
  requireHealthRead,
  validate(studentHealthSchemas.studentHealthParamsSchema),
  studentHealthController.getStudentHealth
);

/**
 * PATCH /api/v1/students/:id/health
 */
studentHealthRouter.patch(
  '/:id/health',
  authenticate,
  tenantContext({ requireTenant: true }),
  requireHealthEdit,
  healthMutationRateLimiter,
  validate(studentHealthSchemas.updateStudentHealthSchema),
  studentHealthController.updateStudentHealth
);

export default studentHealthRouter;
