import { Router } from 'express';
import * as attendanceController from './attendance.controller.js';
import * as attendanceSchemas from './attendance.schemas.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { tenantContext } from '../../middleware/tenant.middleware.js';
import { requirePermission } from '../../middleware/rbac.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { SYSTEM_ROLES } from '../../config/constants.js';

const router = Router();

/**
 * Helper middleware allowing either institutional users with attendance.read
 * or linked Parent users (whose child authorization is authoritatively verified in the service).
 */
const requireAttendanceReadOrParent = (req, res, next) => {
  const user = req.auth || req.user;
  const role = user?.systemRole || user?.role;
  if (role === SYSTEM_ROLES.PARENT) {
    return next();
  }
  return requirePermission('attendance', 'read')(req, res, next);
};

/**
 * Attendance & Daily Operations REST API Endpoints
 * Mounted under /api/v1/attendance
 */

// 1. Daily Dashboard Attendance Metrics
router.get(
  '/dashboard-stats',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('attendance', 'read'),
  validate(attendanceSchemas.dashboardStatsQuerySchema),
  attendanceController.getDashboardStats
);

// 2. Absentee Flags List
router.get(
  '/absentee-flags',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('attendance', 'read'),
  validate(attendanceSchemas.absenteeFlagsQuerySchema),
  attendanceController.listAbsenteeFlags
);

// 3. Resolve Absentee Flag
router.patch(
  '/absentee-flags/:id/resolve',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('attendance', 'edit'),
  validate(attendanceSchemas.resolveAbsenteeFlagSchema),
  attendanceController.resolveAbsenteeFlag
);

// 4. Student Attendance Timeline & Cumulative Statistics
router.get(
  '/students/:studentId',
  authenticate,
  tenantContext({ requireTenant: true }),
  requireAttendanceReadOrParent,
  validate(attendanceSchemas.studentAttendanceParamsSchema),
  attendanceController.getStudentAttendance
);

// 5. List Attendance Sessions
router.get(
  '/sessions',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('attendance', 'read'),
  validate(attendanceSchemas.listAttendanceSessionsSchema),
  attendanceController.listSessions
);

// 6. Get Single Attendance Session
router.get(
  '/sessions/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('attendance', 'read'),
  validate(attendanceSchemas.attendanceParamsSchema),
  attendanceController.getSession
);

// 7. Create or Upsert Attendance Session
router.post(
  '/sessions',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('attendance', 'create'),
  validate(attendanceSchemas.createAttendanceSessionSchema),
  attendanceController.createSession
);

// 8. Update Attendance Session Records
router.patch(
  '/sessions/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('attendance', 'edit'),
  validate(attendanceSchemas.updateAttendanceSessionSchema),
  attendanceController.updateSession
);

// 9. Void / Delete Attendance Session (Restricted to Authorized Admins)
router.delete(
  '/sessions/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('attendance', 'delete'),
  validate(attendanceSchemas.attendanceParamsSchema),
  attendanceController.deleteSession
);

// 10. Get Attendance Settings
router.get(
  '/settings',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('attendance', 'read'),
  attendanceController.getSettings
);

// 11. Update Attendance Settings
router.patch(
  '/settings',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('attendance', 'edit'),
  validate(attendanceSchemas.updateAttendanceSettingsSchema),
  attendanceController.updateSettings
);

export default router;

