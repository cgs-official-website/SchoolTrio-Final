import { Router } from 'express';
import * as hrPayrollController from './hr-payroll.controller.js';
import * as hrPayrollSchemas from './hr-payroll.schemas.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { tenantContext } from '../../middleware/tenant.middleware.js';
import { requirePermission } from '../../middleware/rbac.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';

const router = Router();

/**
 * HR & Payroll REST API Endpoints
 * Mounted under /api/v1/hr-payroll
 */

// 1. Staff Self-Service: view own salary/payroll history (must precede /:id)
router.get(
  '/my-salary',
  authenticate,
  tenantContext({ requireTenant: true }),
  validate(hrPayrollSchemas.mySalaryQuerySchema),
  hrPayrollController.getMySalary
);

// 2. HR Configuration: Get authorized signature (must precede /:id)
router.get(
  '/config',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('hr-payroll', 'read'),
  hrPayrollController.getHRConfig
);

// 3. HR Configuration: Update authorized signature (must precede /:id)
router.patch(
  '/config',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('hr-payroll', 'edit'),
  validate(hrPayrollSchemas.updateConfigSchema),
  hrPayrollController.updateHRConfig
);

// 4. Admin: Generate monthly payroll (bulk or specific staff) (must precede /:id)
router.post(
  '/generate',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('hr-payroll', 'create'),
  validate(hrPayrollSchemas.generatePayrollSchema),
  hrPayrollController.generatePayroll
);

// 5. Admin: List paginated payroll records
router.get(
  '/',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('hr-payroll', 'read'),
  validate(hrPayrollSchemas.listPayrollQuerySchema),
  hrPayrollController.listPayrolls
);

// 6. Admin: Update payroll status (Pending -> Paid -> Payslip Released)
router.patch(
  '/:id/status',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('hr-payroll', 'edit'),
  validate(hrPayrollSchemas.updateStatusSchema),
  hrPayrollController.updatePayrollStatus
);

// 7. Admin: Delete draft payroll record (Pending only)
router.delete(
  '/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('hr-payroll', 'delete'),
  validate(hrPayrollSchemas.idParamSchema),
  hrPayrollController.deletePayroll
);

export default router;
