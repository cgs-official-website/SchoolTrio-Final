import { Router } from 'express';
import * as academicResourceController from './academic-resource.controller.js';
import * as academicResourceSchemas from './academic-resource.schemas.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { tenantContext } from '../../middleware/tenant.middleware.js';
import { requirePermission } from '../../middleware/rbac.middleware.js';
import { handleUpload } from './academic-resource.upload.js';
import { validate } from '../../middleware/validate.middleware.js';
import { ForbiddenError } from '../../utils/app-error.js';

const academicResourceRouter = Router();

/**
 * 0. Upload resource file (must be registered before '/:id')
 * POST /api/v1/academic-resources/upload
 */
academicResourceRouter.post(
  '/upload',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('resources', 'create'),
  handleUpload,
  academicResourceController.uploadAcademicResourceFile
);

academicResourceRouter.get(
  '/upload-config',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('resources', 'read'),
  academicResourceController.getUploadConfig
);

/**
 * Sidebar "Resources" unread badge (parent / teacher / staff). Registered before '/:id'.
 * GET /api/v1/academic-resources/unread-count
 */
academicResourceRouter.get(
  '/unread-count',
  authenticate,
  tenantContext({ requireTenant: true }),
  academicResourceController.getUnreadResourceCount
);

/**
 * Parent / student self-service: resources shared with the student's class + section.
 * Registered before '/:id'. Institutional staff use the regular list instead.
 * GET /api/v1/academic-resources/student/:studentId
 */
const requireParentOrStudent = (req, res, next) => {
  const user = req.auth || req.user;
  const role = String(user?.systemRole || user?.role || '').toUpperCase();
  if (role === 'PARENT' || role === 'STUDENT') return next();
  return next(new ForbiddenError('Only parents and students can use this view'));
};

academicResourceRouter.get(
  '/student/:studentId',
  authenticate,
  tenantContext({ requireTenant: true }),
  requireParentOrStudent,
  validate(academicResourceSchemas.listStudentResourcesSchema),
  academicResourceController.listStudentAcademicResources
);

/**
 * 1. List Academic Resources Endpoint
 * GET /api/v1/academic-resources
 */
academicResourceRouter.get(
  '/',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('resources', 'read'),
  validate(academicResourceSchemas.listAcademicResourcesSchema),
  academicResourceController.listAcademicResources
);

/**
 * 2. Get Single Academic Resource Endpoint
 * GET /api/v1/academic-resources/:id
 */
academicResourceRouter.get(
  '/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('resources', 'read'),
  validate(academicResourceSchemas.academicResourceIdParamSchema),
  academicResourceController.getAcademicResourceById
);

/**
 * 3. Create Academic Resource Endpoint
 * POST /api/v1/academic-resources
 */
academicResourceRouter.post(
  '/',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('resources', 'create'),
  validate(academicResourceSchemas.createAcademicResourceSchema),
  academicResourceController.createAcademicResource
);

/**
 * 4. Update Academic Resource Endpoint
 * PATCH /api/v1/academic-resources/:id
 */
academicResourceRouter.patch(
  '/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('resources', 'edit'),
  validate(academicResourceSchemas.updateAcademicResourceSchema),
  academicResourceController.updateAcademicResource
);

/**
 * 5. Delete Academic Resource Endpoint
 * DELETE /api/v1/academic-resources/:id
 */
academicResourceRouter.delete(
  '/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('resources', 'delete'),
  validate(academicResourceSchemas.academicResourceIdParamSchema),
  academicResourceController.deleteAcademicResource
);

export { academicResourceRouter as academicResourceRoutes };
export default academicResourceRouter;
