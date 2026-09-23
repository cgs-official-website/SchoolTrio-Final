import { Router } from 'express';
import * as invoiceController from './invoice.controller.js';
import * as invoiceSchemas from './invoice.schemas.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { tenantContext } from '../../middleware/tenant.middleware.js';
import { requirePermission } from '../../middleware/rbac.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { SYSTEM_ROLES } from '../../config/constants.js';

/**
 * Custom Authorization Gate:
 * Allows institutional staff with 'fees.read' OR authenticated parents (child-scoped downstream in service).
 */
export const requireFeesReadOrParent = (req, res, next) => {
  const user = req.auth || req.user;
  const role = user?.systemRole || user?.role;
  if (role === SYSTEM_ROLES.PARENT) {
    return next();
  }
  return requirePermission('fees', 'read')(req, res, next);
};

/**
 * Custom Authorization Gate for Payment Settlement:
 * Allows institutional staff with 'fees.edit' OR authenticated parents (child-scoped downstream in service).
 */
export const requireFeesEditOrParent = (req, res, next) => {
  const user = req.auth || req.user;
  const role = user?.systemRole || user?.role;
  if (role === SYSTEM_ROLES.PARENT) {
    return next();
  }
  return requirePermission('fees', 'edit')(req, res, next);
};

// ============================================================
// INVOICE CORE ROUTES (Mounted under /api/v1/invoices)
// ============================================================
const invoiceRouter = Router();

/**
 * List / Query Invoices
 * GET /api/v1/invoices
 */
invoiceRouter.get(
  '/',
  authenticate,
  tenantContext({ requireTenant: true }),
  requireFeesReadOrParent,
  validate(invoiceSchemas.listInvoicesSchema),
  invoiceController.listInvoices
);

/**
 * Institutional Financial Statistics
 * GET /api/v1/invoices/stats
 * CRITICAL: Must be registered BEFORE /:id to prevent Express route shadowing.
 * Strictly requires institutional 'fees.read' (parents denied).
 */
invoiceRouter.get(
  '/stats',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('fees', 'read'),
  validate(invoiceSchemas.invoiceStatsSchema),
  invoiceController.getInvoiceStats
);

/**
 * Class-Wise Fee Reports
 * GET /api/v1/invoices/reports/class-wise
 * CRITICAL: Must be registered BEFORE /:id to prevent Express route shadowing.
 * Strictly requires institutional 'fees.read' (parents/students denied).
 */
invoiceRouter.get(
  '/reports/class-wise',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('fees', 'read'),
  validate(invoiceSchemas.classWiseReportSchema),
  invoiceController.getClassWiseReports
);

/**
 * Collection-Period-Wise Fee Reports
 * GET /api/v1/invoices/reports/period-wise
 * CRITICAL: Must be registered BEFORE /:id to prevent Express route shadowing.
 * Strictly requires institutional 'fees.read' (parents/students denied).
 */
invoiceRouter.get(
  '/reports/period-wise',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('fees', 'read'),
  validate(invoiceSchemas.periodWiseReportSchema),
  invoiceController.getPeriodWiseReports
);

/**
 * Monthly Revenue Report
 * GET /api/v1/invoices/reports/monthly-revenue
 * CRITICAL: Must be registered BEFORE /:id to prevent Express route shadowing.
 * Strictly requires institutional 'fees.read' (parents/students denied).
 */
invoiceRouter.get(
  '/reports/monthly-revenue',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('fees', 'read'),
  validate(invoiceSchemas.monthlyRevenueReportSchema),
  invoiceController.getMonthlyRevenueReports
);

/**
 * Single Invoice Detail
 * GET /api/v1/invoices/:id
 */
invoiceRouter.get(
  '/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requireFeesReadOrParent,
  validate(invoiceSchemas.invoiceParamsSchema),
  invoiceController.getInvoice
);

/**
 * Cancel Pending Invoice
 * PATCH /api/v1/invoices/:id/cancel
 * Strictly requires institutional 'fees.edit' permission.
 * Parents and Students are strictly forbidden (403).
 */
invoiceRouter.patch(
  '/:id/cancel',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('fees', 'edit'),
  validate(invoiceSchemas.cancelInvoiceSchema),
  invoiceController.cancelInvoice
);

/**
 * Settle Invoice Payment
 * POST /api/v1/invoices/:id/pay
 * Allows institutional staff with 'fees.edit' OR authenticated linked parents.
 * Students are strictly forbidden (403).
 */
invoiceRouter.post(
  '/:id/pay',
  authenticate,
  tenantContext({ requireTenant: true }),
  requireFeesEditOrParent,
  validate(invoiceSchemas.payInvoiceSchema),
  invoiceController.payInvoice
);


// ============================================================
// STUDENT INVOICE HISTORY ROUTES (Mounted under /api/v1/students)
// ============================================================
const studentInvoiceRouter = Router();

/**
 * Student Invoice History and Balance Summary
 * GET /api/v1/students/:studentId/invoices
 */
studentInvoiceRouter.get(
  '/:studentId/invoices',
  authenticate,
  tenantContext({ requireTenant: true }),
  requireFeesReadOrParent,
  validate(invoiceSchemas.studentInvoiceParamsSchema),
  invoiceController.getStudentInvoices
);

export { invoiceRouter as invoiceRoutes, studentInvoiceRouter as studentInvoiceRoutes };
export default invoiceRouter;
