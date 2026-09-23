import { Router } from 'express';
import * as canteenController from './canteen.controller.js';
import * as canteenSchemas from './canteen.schemas.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { tenantContext } from '../../middleware/tenant.middleware.js';
import { requireRole } from '../../middleware/rbac.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { SYSTEM_ROLES } from '../../config/constants.js';

const canteenRouter = Router();

/**
 * 1. Institutional Pending Canteen Request Count Endpoint
 * GET /api/v1/canteen/pending-count
 */
canteenRouter.get(
  '/pending-count',
  authenticate,
  tenantContext({ requireTenant: true }),
  requireRole(
    SYSTEM_ROLES.SCHOOL_ADMIN,
    SYSTEM_ROLES.PRINCIPAL,
    SYSTEM_ROLES.TEACHER,
    SYSTEM_ROLES.STAFF
  ),
  canteenController.getPendingCanteenCount
);

/**
 * 2. List Canteen Requests Endpoint
 * GET /api/v1/canteen/requests
 */
canteenRouter.get(
  '/requests',
  authenticate,
  tenantContext({ requireTenant: true }),
  requireRole(
    SYSTEM_ROLES.SCHOOL_ADMIN,
    SYSTEM_ROLES.PRINCIPAL,
    SYSTEM_ROLES.STAFF,
    SYSTEM_ROLES.TEACHER,
    SYSTEM_ROLES.PARENT
  ),
  validate(canteenSchemas.listCanteenRequestsSchema),
  canteenController.listCanteenRequests
);

/**
 * 3. Create Canteen Meal Request Endpoint
 * POST /api/v1/canteen/requests
 */
canteenRouter.post(
  '/requests',
  authenticate,
  tenantContext({ requireTenant: true }),
  requireRole(
    SYSTEM_ROLES.SCHOOL_ADMIN,
    SYSTEM_ROLES.PRINCIPAL,
    SYSTEM_ROLES.STAFF,
    SYSTEM_ROLES.PARENT
  ),
  validate(canteenSchemas.createCanteenRequestSchema),
  canteenController.createCanteenRequest
);

/**
 * 4. Update Canteen Request Status Endpoint
 * PATCH /api/v1/canteen/requests/:id/status
 */
canteenRouter.patch(
  '/requests/:id/status',
  authenticate,
  tenantContext({ requireTenant: true }),
  requireRole(
    SYSTEM_ROLES.SCHOOL_ADMIN,
    SYSTEM_ROLES.PRINCIPAL,
    SYSTEM_ROLES.STAFF,
    SYSTEM_ROLES.PARENT
  ),
  validate(canteenSchemas.updateCanteenRequestStatusSchema),
  canteenController.updateCanteenRequestStatus
);

export { canteenRouter as canteenRoutes };
export default canteenRouter;
