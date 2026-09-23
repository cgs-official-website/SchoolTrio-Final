import { Router } from 'express';
import * as noticeController from './notice.controller.js';
import * as noticeSchemas from './notice.schemas.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { tenantContext } from '../../middleware/tenant.middleware.js';
import { requirePermission } from '../../middleware/rbac.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { SYSTEM_ROLES } from '../../config/constants.js';

/**
 * Custom Authorization Gate for Creating Notices:
 * Allows institutional staff with 'noticeboard.create' OR authenticated teachers.
 * (Class assignment validation is enforced in NoticeService).
 */
export const requireNoticeCreateOrTeacher = (req, res, next) => {
  const user = req.auth || req.user;
  const role = (user?.systemRole || user?.role || '').toUpperCase();
  if (role === SYSTEM_ROLES.TEACHER || role === 'TEACHER') {
    return next();
  }
  return requirePermission('noticeboard', 'create')(req, res, next);
};

/**
 * Custom Authorization Gate for Editing Notices:
 * Allows institutional staff with 'noticeboard.edit' OR authenticated teachers.
 * (Author ownership validation is enforced in NoticeService).
 */
export const requireNoticeEditOrTeacher = (req, res, next) => {
  const user = req.auth || req.user;
  const role = (user?.systemRole || user?.role || '').toUpperCase();
  if (role === SYSTEM_ROLES.TEACHER || role === 'TEACHER') {
    return next();
  }
  return requirePermission('noticeboard', 'edit')(req, res, next);
};

/**
 * Custom Authorization Gate for Deleting Notices:
 * Allows institutional staff with 'noticeboard.delete' OR authenticated teachers.
 * (Author ownership validation is enforced in NoticeService).
 */
export const requireNoticeDeleteOrTeacher = (req, res, next) => {
  const user = req.auth || req.user;
  const role = (user?.systemRole || user?.role || '').toUpperCase();
  if (role === SYSTEM_ROLES.TEACHER || role === 'TEACHER') {
    return next();
  }
  return requirePermission('noticeboard', 'delete')(req, res, next);
};

const router = Router();

/**
 * List / Query Notices
 * GET /api/v1/notices
 */
router.get(
  '/',
  authenticate,
  tenantContext({ requireTenant: true }),
  validate(noticeSchemas.listNoticesSchema),
  noticeController.listNotices
);

/**
 * Create a Notice
 * POST /api/v1/notices
 */
router.post(
  '/',
  authenticate,
  tenantContext({ requireTenant: true }),
  requireNoticeCreateOrTeacher,
  validate(noticeSchemas.createNoticeSchema),
  noticeController.createNotice
);

/**
 * Get Notice by ID
 * GET /api/v1/notices/:id
 */
router.get(
  '/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  validate(noticeSchemas.getNoticeByIdSchema),
  noticeController.getNoticeById
);

/**
 * Update Notice (PUT)
 * PUT /api/v1/notices/:id
 */
router.put(
  '/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requireNoticeEditOrTeacher,
  validate(noticeSchemas.updateNoticeSchema),
  noticeController.updateNotice
);

/**
 * Update Notice (PATCH)
 * PATCH /api/v1/notices/:id
 */
router.patch(
  '/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requireNoticeEditOrTeacher,
  validate(noticeSchemas.updateNoticeSchema),
  noticeController.updateNotice
);

/**
 * Delete Notice
 * DELETE /api/v1/notices/:id
 */
router.delete(
  '/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requireNoticeDeleteOrTeacher,
  validate(noticeSchemas.deleteNoticeSchema),
  noticeController.deleteNotice
);

/**
 * Record Notice Read Receipt (POST)
 * POST /api/v1/notices/:id/view
 */
router.post(
  '/:id/view',
  authenticate,
  tenantContext({ requireTenant: true }),
  validate(noticeSchemas.markNoticeViewedSchema),
  noticeController.markNoticeViewed
);

/**
 * Record Notice Read Receipt (PATCH)
 * PATCH /api/v1/notices/:id/view
 */
router.patch(
  '/:id/view',
  authenticate,
  tenantContext({ requireTenant: true }),
  validate(noticeSchemas.markNoticeViewedSchema),
  noticeController.markNoticeViewed
);

export { router as noticeRoutes };
export default router;
