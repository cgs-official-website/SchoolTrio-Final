import { Router } from 'express';
import * as timetableController from './timetable.controller.js';
import * as timetableSchemas from './timetable.schemas.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { tenantContext } from '../../middleware/tenant.middleware.js';
import { requirePermission } from '../../middleware/rbac.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { SYSTEM_ROLES } from '../../config/constants.js';

/**
 * Custom Authorization Gate for Reading Timetables:
 * Allows institutional staff with 'timetables.read' OR authenticated teachers/parents/students (scoped in service).
 */
export const requireTimetableReadOrCustody = (req, res, next) => {
  const user = req.auth || req.user;
  const role = (user?.systemRole || user?.role || '').toUpperCase();
  if (
    role === SYSTEM_ROLES.PARENT ||
    role === 'PARENT' ||
    role === SYSTEM_ROLES.STUDENT ||
    role === 'STUDENT' ||
    role === SYSTEM_ROLES.TEACHER ||
    role === 'TEACHER' ||
    user?.loginPanel === 'teacher'
  ) {
    return next();
  }
  return requirePermission('timetables', 'read')(req, res, next);
};

const router = Router();

/**
 * Teacher Self-Schedule View
 * GET /api/v1/timetables/my-schedule
 */
router.get(
  '/my-schedule',
  authenticate,
  tenantContext({ requireTenant: true }),
  timetableController.getMySchedule
);

/**
 * Structured Weekly Class Timetable
 * GET /api/v1/timetables/classes/:classId
 */
router.get(
  '/classes/:classId',
  authenticate,
  tenantContext({ requireTenant: true }),
  requireTimetableReadOrCustody,
  validate(timetableSchemas.classIdParamSchema),
  timetableController.getClassTimetable
);

/**
 * Replace entire weekly timetable for a class atomically
 * PUT /api/v1/timetables/classes/:classId
 */
router.put(
  '/classes/:classId',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('timetables', 'edit'),
  validate(timetableSchemas.putClassTimetableSchema),
  timetableController.replaceClassTimetable
);

/**
 * List / Query Timetable Periods
 * GET /api/v1/timetables
 */
router.get(
  '/',
  authenticate,
  tenantContext({ requireTenant: true }),
  requireTimetableReadOrCustody,
  validate(timetableSchemas.listTimetablesSchema),
  timetableController.listTimetables
);

/**
 * Create a single Timetable Period
 * POST /api/v1/timetables
 */
router.post(
  '/',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('timetables', 'create'),
  validate(timetableSchemas.createTimetablePeriodSchema),
  timetableController.createTimetablePeriod
);

/**
 * Update a single Timetable Period
 * PATCH /api/v1/timetables/:id
 */
router.patch(
  '/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('timetables', 'edit'),
  validate(timetableSchemas.updateTimetablePeriodSchema),
  timetableController.updateTimetablePeriod
);

/**
 * Delete a single Timetable Period
 * DELETE /api/v1/timetables/:id
 */
router.delete(
  '/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('timetables', 'delete'),
  validate(timetableSchemas.timetableIdParamSchema),
  timetableController.deleteTimetablePeriod
);

export default router;
