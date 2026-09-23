import { Router } from 'express';
import * as complaintController from './complaint.controller.js';
import * as complaintSchemas from './complaint.schemas.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { tenantContext } from '../../middleware/tenant.middleware.js';
import { requireRole } from '../../middleware/rbac.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { SYSTEM_ROLES } from '../../config/constants.js';

const complaintRouter = Router();

/**
 * 1. Institutional Pending Complaint Count Endpoint
 * GET /api/v1/complaints/pending-count
 * Accessible strictly to School Admin and Principal (+ SuperAdmin bypass)
 */
complaintRouter.get(
  '/pending-count',
  authenticate,
  tenantContext({ requireTenant: true }),
  requireRole(
    SYSTEM_ROLES.SCHOOL_ADMIN,
    SYSTEM_ROLES.PRINCIPAL
  ),
  complaintController.getPendingComplaintsCount
);

/**
 * 2. List Complaints Endpoint
 * GET /api/v1/complaints
 * Accessible strictly to School Admin and Principal (+ SuperAdmin bypass)
 */
complaintRouter.get(
  '/',
  authenticate,
  tenantContext({ requireTenant: true }),
  requireRole(
    SYSTEM_ROLES.SCHOOL_ADMIN,
    SYSTEM_ROLES.PRINCIPAL
  ),
  validate(complaintSchemas.listComplaintsSchema),
  complaintController.listComplaints
);

/**
 * 3. Get Complaint Detail Endpoint
 * GET /api/v1/complaints/:id
 * Accessible strictly to School Admin and Principal (+ SuperAdmin bypass)
 */
complaintRouter.get(
  '/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requireRole(
    SYSTEM_ROLES.SCHOOL_ADMIN,
    SYSTEM_ROLES.PRINCIPAL
  ),
  validate(complaintSchemas.complaintIdParamSchema),
  complaintController.getComplaintById
);

/**
 * 4. Create Complaint Endpoint
 * POST /api/v1/complaints
 * Accessible strictly to School Admin and Principal (+ SuperAdmin bypass)
 */
complaintRouter.post(
  '/',
  authenticate,
  tenantContext({ requireTenant: true }),
  requireRole(
    SYSTEM_ROLES.SCHOOL_ADMIN,
    SYSTEM_ROLES.PRINCIPAL
  ),
  validate(complaintSchemas.createComplaintSchema),
  complaintController.createComplaint
);

/**
 * 5. Update Complaint Status Endpoint (Resolve / Reject)
 * PATCH /api/v1/complaints/:id/status
 * Accessible strictly to School Admin and Principal (+ SuperAdmin bypass)
 */
complaintRouter.patch(
  '/:id/status',
  authenticate,
  tenantContext({ requireTenant: true }),
  requireRole(
    SYSTEM_ROLES.SCHOOL_ADMIN,
    SYSTEM_ROLES.PRINCIPAL
  ),
  validate(complaintSchemas.updateComplaintStatusSchema),
  complaintController.updateComplaintStatus
);

export { complaintRouter as complaintRoutes };
export default complaintRouter;
