import { Router } from 'express';
import * as auditController from './audit.controller.js';
import * as auditSchemas from './audit.schemas.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { tenantContext } from '../../middleware/tenant.middleware.js';
import { requireRole } from '../../middleware/rbac.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { SYSTEM_ROLES } from '../../config/constants.js';

/**
 * 1. Tenant Audit Logs Router (Mounted under /api/v1/audit)
 */
export const auditRouter = Router();

auditRouter.get(
  '/',
  authenticate,
  tenantContext({ requireTenant: true }),
  requireRole(SYSTEM_ROLES.SUPER_ADMIN, SYSTEM_ROLES.SCHOOL_ADMIN, SYSTEM_ROLES.PRINCIPAL),
  validate(auditSchemas.listTenantAuditLogsSchema),
  auditController.getTenantAuditLogs
);

/**
 * 2. SuperAdmin Global Audit Logs Router (Mounted under /api/v1/superadmin/audit)
 */
export const superAdminAuditRouter = Router();

superAdminAuditRouter.get(
  '/',
  authenticate,
  requireRole(SYSTEM_ROLES.SUPER_ADMIN),
  validate(auditSchemas.listSuperAdminAuditLogsSchema),
  auditController.getSuperAdminAuditLogs
);

export default auditRouter;
