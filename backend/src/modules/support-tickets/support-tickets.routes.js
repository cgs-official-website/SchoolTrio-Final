import { Router } from 'express';
import * as supportTicketsController from './support-tickets.controller.js';
import * as supportTicketsSchemas from './support-tickets.schemas.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { tenantContext } from '../../middleware/tenant.middleware.js';
import { requireRole } from '../../middleware/rbac.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { SYSTEM_ROLES } from '../../config/constants.js';

/**
 * 1. Tenant Support Tickets Router (Mounted under /api/v1/support-tickets)
 */
export const supportTicketsRouter = Router();

// List tickets for authenticated tenant
supportTicketsRouter.get(
  '/',
  authenticate,
  tenantContext({ requireTenant: true }),
  requireRole(
    SYSTEM_ROLES.SUPER_ADMIN,
    SYSTEM_ROLES.SCHOOL_ADMIN,
    SYSTEM_ROLES.PRINCIPAL,
    SYSTEM_ROLES.STAFF,
    SYSTEM_ROLES.TEACHER
  ),
  validate(supportTicketsSchemas.listTicketsSchema),
  supportTicketsController.listTickets
);

// Create ticket for authenticated tenant
supportTicketsRouter.post(
  '/',
  authenticate,
  tenantContext({ requireTenant: true }),
  requireRole(
    SYSTEM_ROLES.SUPER_ADMIN,
    SYSTEM_ROLES.SCHOOL_ADMIN,
    SYSTEM_ROLES.PRINCIPAL,
    SYSTEM_ROLES.STAFF,
    SYSTEM_ROLES.TEACHER
  ),
  validate(supportTicketsSchemas.createTicketSchema),
  supportTicketsController.createTicket
);

// Get single ticket and message thread
supportTicketsRouter.get(
  '/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requireRole(
    SYSTEM_ROLES.SUPER_ADMIN,
    SYSTEM_ROLES.SCHOOL_ADMIN,
    SYSTEM_ROLES.PRINCIPAL,
    SYSTEM_ROLES.STAFF,
    SYSTEM_ROLES.TEACHER
  ),
  validate(supportTicketsSchemas.ticketParamsSchema),
  supportTicketsController.getTicket
);

// Add message reply to ticket
supportTicketsRouter.post(
  '/:id/messages',
  authenticate,
  tenantContext({ requireTenant: true }),
  requireRole(
    SYSTEM_ROLES.SUPER_ADMIN,
    SYSTEM_ROLES.SCHOOL_ADMIN,
    SYSTEM_ROLES.PRINCIPAL,
    SYSTEM_ROLES.STAFF,
    SYSTEM_ROLES.TEACHER
  ),
  validate(supportTicketsSchemas.addMessageSchema),
  supportTicketsController.addMessage
);

/**
 * 2. SuperAdmin Support Tickets Router (Mounted under /api/v1/superadmin/support-tickets)
 */
export const superAdminSupportTicketsRouter = Router();

// List all support tickets globally across all tenants
superAdminSupportTicketsRouter.get(
  '/',
  authenticate,
  requireRole(SYSTEM_ROLES.SUPER_ADMIN),
  validate(supportTicketsSchemas.superAdminListTicketsSchema),
  supportTicketsController.superAdminListTickets
);

// Update support ticket resolution status
superAdminSupportTicketsRouter.patch(
  '/:id/status',
  authenticate,
  requireRole(SYSTEM_ROLES.SUPER_ADMIN),
  validate(supportTicketsSchemas.superAdminUpdateStatusSchema),
  supportTicketsController.superAdminUpdateStatus
);

// SuperAdmin post reply or internal note
superAdminSupportTicketsRouter.post(
  '/:id/messages',
  authenticate,
  requireRole(SYSTEM_ROLES.SUPER_ADMIN),
  validate(supportTicketsSchemas.superAdminAddMessageSchema),
  supportTicketsController.superAdminAddMessage
);

export default supportTicketsRouter;
