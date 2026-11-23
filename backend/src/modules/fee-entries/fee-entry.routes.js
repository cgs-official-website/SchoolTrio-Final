import { Router } from 'express';
import * as controller from './fee-entry.controller.js';
import * as schemas from './fee-entry.schemas.js';
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
  validate(schemas.listFeeEntriesSchema),
  controller.listFeeEntries
);

router.post(
  '/',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('fees', 'create'),
  validate(schemas.createFeeEntrySchema),
  controller.createFeeEntry
);

router.patch(
  '/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('fees', 'edit'),
  validate(schemas.updateFeeEntrySchema),
  controller.updateFeeEntry
);

export default router;