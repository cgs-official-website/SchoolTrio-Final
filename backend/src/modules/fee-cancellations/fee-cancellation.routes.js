import { Router } from 'express';
import * as controller from './fee-cancellation.controller.js';
import * as schemas from './fee-cancellation.schemas.js';
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
  validate(schemas.listFeeCancellationsSchema),
  controller.listFeeCancellations
);

router.get(
  '/student-payments',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('fees', 'read'),
  validate(schemas.studentPaymentsSchema),
  controller.getStudentPayments
);

// Cancelling a payment is sensitive, so it needs the delete permission, not create
router.post(
  '/',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('fees', 'delete'),
  validate(schemas.createFeeCancellationSchema),
  controller.createFeeCancellation
);

export default router;