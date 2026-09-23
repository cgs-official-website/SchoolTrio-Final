import { Router } from 'express';
import * as academicResourceController from './academic-resource.controller.js';
import * as academicResourceSchemas from './academic-resource.schemas.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { tenantContext } from '../../middleware/tenant.middleware.js';
import { requirePermission } from '../../middleware/rbac.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';

const academicResourceRouter = Router();

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
