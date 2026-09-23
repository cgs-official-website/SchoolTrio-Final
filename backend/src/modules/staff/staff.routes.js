import { Router } from 'express';
import * as staffController from './staff.controller.js';
import * as staffSchemas from './staff.schemas.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { tenantContext } from '../../middleware/tenant.middleware.js';
import { requirePermission } from '../../middleware/rbac.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';

const router = Router();

/**
 * Staff Management REST API Endpoints
 * Mounted under /api/v1/staff
 */

// 1. Self-Service: Staff member views own profile (must precede /:id)
router.get(
  '/me',
  authenticate,
  tenantContext({ requireTenant: true }),
  staffController.getStaffMe
);

// 2. Self-Service: Staff member updates own profile (must precede /:id)
router.patch(
  '/me',
  authenticate,
  tenantContext({ requireTenant: true }),
  validate(staffSchemas.updateStaffSelfSchema),
  staffController.updateStaffSelf
);

// 3. List staff members
router.get(
  '/',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('staff', 'read'),
  validate(staffSchemas.listStaffSchema),
  staffController.listStaff
);

// 4. Get single staff member by ID
router.get(
  '/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('staff', 'read'),
  validate(staffSchemas.staffParamsSchema),
  staffController.getStaff
);

// 5. Create staff member
router.post(
  '/',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('staff', 'create'),
  validate(staffSchemas.createStaffSchema),
  staffController.createStaff
);

// 6. Update staff assignments (class teacher and subjects)
router.patch(
  '/:id/assignment',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('staff', 'edit'),
  validate(staffSchemas.assignStaffSchema),
  staffController.assignStaff
);

// 7. Update staff member
router.patch(
  '/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('staff', 'edit'),
  validate(staffSchemas.updateStaffSchema),
  staffController.updateStaff
);

// 8. Delete staff member
router.delete(
  '/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('staff', 'delete'),
  validate(staffSchemas.staffParamsSchema),
  staffController.deleteStaff
);

export default router;
