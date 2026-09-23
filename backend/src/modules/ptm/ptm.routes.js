import { Router } from 'express';
import * as ptmController from './ptm.controller.js';
import * as ptmSchemas from './ptm.schema.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { tenantContext } from '../../middleware/tenant.middleware.js';
import { requirePermission } from '../../middleware/rbac.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { SYSTEM_ROLES } from '../../config/constants.js';

/**
 * Custom Authorization Gate for Reading PTM:
 * Allows institutional staff with 'ptm.read' OR authenticated parents (child-scoped in service).
 */
export const requirePtmReadOrParent = (req, res, next) => {
  const user = req.auth || req.user;
  const role = (user?.systemRole || user?.role || '').toUpperCase();
  if (role === SYSTEM_ROLES.PARENT || role === 'PARENT') {
    return next();
  }
  return requirePermission('ptm', 'read')(req, res, next);
};

/**
 * Custom Authorization Gate for Updating PTM Status / Cancellation:
 * Allows institutional staff with 'ptm.edit' OR authenticated parents (child-scoped in service).
 */
export const requirePtmStatusOrParent = (req, res, next) => {
  const user = req.auth || req.user;
  const role = (user?.systemRole || user?.role || '').toUpperCase();
  if (role === SYSTEM_ROLES.PARENT || role === 'PARENT') {
    return next();
  }
  return requirePermission('ptm', 'edit')(req, res, next);
};

/**
 * Custom Authorization Gate for Cancelling PTM:
 * Allows institutional staff with 'ptm.delete' / 'ptm.edit' OR authenticated parents (child-scoped in service).
 */
export const requirePtmCancelOrParent = (req, res, next) => {
  const user = req.auth || req.user;
  const role = (user?.systemRole || user?.role || '').toUpperCase();
  if (role === SYSTEM_ROLES.PARENT || role === 'PARENT') {
    return next();
  }
  return requirePermission('ptm', 'delete')(req, res, next);
};

const router = Router();

/**
 * List Teacher / Class PTM Appointments
 * GET /api/v1/ptm/teacher
 */
router.get(
  '/teacher',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('ptm', 'read'),
  validate(ptmSchemas.listTeacherPtmsSchema),
  ptmController.listTeacherPtms
);

/**
 * List Student PTM Appointments (Parent or Staff)
 * GET /api/v1/ptm/student/:studentId
 */
router.get(
  '/student/:studentId',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePtmReadOrParent,
  validate(ptmSchemas.listStudentPtmsSchema),
  ptmController.listStudentPtms
);

/**
 * Create a PTM Appointment
 * POST /api/v1/ptm
 */
router.post(
  '/',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('ptm', 'create'),
  validate(ptmSchemas.createPtmSchema),
  ptmController.createPtm
);

/**
 * Get a Single PTM Appointment by ID
 * GET /api/v1/ptm/:id
 */
router.get(
  '/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePtmReadOrParent,
  validate(ptmSchemas.getPtmByIdSchema),
  ptmController.getPtmById
);

/**
 * Update PTM Appointment Status
 * PATCH /api/v1/ptm/:id/status
 */
router.patch(
  '/:id/status',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePtmStatusOrParent,
  validate(ptmSchemas.updatePtmStatusSchema),
  ptmController.updatePtmStatus
);

/**
 * Cancel PTM Appointment
 * DELETE /api/v1/ptm/:id
 */
router.delete(
  '/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePtmCancelOrParent,
  validate(ptmSchemas.deletePtmSchema),
  ptmController.cancelPtm
);

export default router;
