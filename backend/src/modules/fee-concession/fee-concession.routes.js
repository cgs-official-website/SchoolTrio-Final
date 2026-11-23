import { Router } from 'express';
import * as controller from './fee-concession.controller.js';
import * as schemas from './fee-concession.schemas.js';
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
  validate(schemas.listFeeConcessionsSchema),
  controller.listFeeConcessions
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
  requirePermission('fees', 'create'),
  validate(schemas.createFeeConcessionSchema),
  controller.createFeeConcession
);

router.delete(
  '/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('fees', 'delete'),
  validate(schemas.concessionParamsSchema),
  controller.deleteFeeConcession
);

export default router;