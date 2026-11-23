import { Router } from 'express';
import * as controller from './fee-deletion.controller.js';
import * as schemas from './fee-deletion.schemas.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { tenantContext } from '../../middleware/tenant.middleware.js';
import { requirePermission } from '../../middleware/rbac.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';

const router = Router();

router.get(
  '/',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('fees', 'read'),
  validate(schemas.listFeeDeletionsSchema),
  controller.listFeeDeletions
);

router.get(
  '/student-fees',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('fees', 'read'),
  validate(schemas.studentFeesSchema),
  controller.getStudentFees
);

router.post(
  '/',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('fees', 'delete'),
  validate(schemas.createFeeDeletionSchema),
  controller.createFeeDeletion
);

export default router;