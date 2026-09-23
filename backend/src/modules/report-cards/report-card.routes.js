import { Router } from 'express';
import * as reportCardController from './report-card.controller.js';
import * as reportCardSchemas from './report-card.schemas.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { tenantContext } from '../../middleware/tenant.middleware.js';
import { requirePermission } from '../../middleware/rbac.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { SYSTEM_ROLES } from '../../config/constants.js';

const router = Router();

/**
 * Custom Authorization Gate for Report Card Viewing:
 * Allows institutional staff with 'exams.read' OR authenticated Parents / Students
 * (downstream resource ownership verified by service).
 */
export const requireExamsReadOrParentOrStudent = (req, res, next) => {
  const user = req.auth || req.user;
  const role = user?.systemRole || user?.role;
  if (role === SYSTEM_ROLES.PARENT || role === SYSTEM_ROLES.STUDENT) {
    return next();
  }
  return requirePermission('exams', 'read')(req, res, next);
};

/**
 * Report Card REST API Endpoints
 * Mounted under /api/v1/report-cards
 *
 * CRITICAL ROUTE ORDERING:
 * Static/nested subpaths (/preview, /publish, /student/:studentId, /class/:classId)
 * MUST be registered BEFORE /:id to prevent Express route shadowing.
 */

// 1. Generate in-memory preview of report cards for a class
// POST /api/v1/report-cards/preview
router.post(
  '/preview',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('exams', 'read'),
  validate(reportCardSchemas.generateReportCardPreviewSchema),
  reportCardController.previewReportCards
);

// 2. Publish and persist historical snapshot report cards for a class
// POST /api/v1/report-cards/publish
router.post(
  '/publish',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('exams', 'edit'),
  validate(reportCardSchemas.publishReportCardsSchema),
  reportCardController.publishReportCards
);

// 3. List published report cards for a student
// GET /api/v1/report-cards/student/:studentId
router.get(
  '/student/:studentId',
  authenticate,
  tenantContext({ requireTenant: true }),
  requireExamsReadOrParentOrStudent,
  validate(reportCardSchemas.listStudentReportCardsSchema),
  reportCardController.listStudentReportCards
);

// 4. List published report cards for a class
// GET /api/v1/report-cards/class/:classId
router.get(
  '/class/:classId',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('exams', 'read'),
  validate(reportCardSchemas.listClassReportCardsSchema),
  reportCardController.listClassReportCards
);

// 5. Get single report card by UUID
// GET /api/v1/report-cards/:id
router.get(
  '/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requireExamsReadOrParentOrStudent,
  validate(reportCardSchemas.getReportCardParamsSchema),
  reportCardController.getReportCard
);

export default router;
