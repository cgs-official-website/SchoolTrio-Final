import { Router } from 'express';
import * as controller from './zuna-support.controller.js';
import * as schemas from './zuna-support.schemas.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { tenantContext } from '../../middleware/tenant.middleware.js';
import { requireRole } from '../../middleware/rbac.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { SYSTEM_ROLES } from '../../config/constants.js';

/**
 * Zuna Central Support Desk bridge (mounted under /api/v1/zuna-support).
 * School admins raise tickets to Zuna and follow their status / replies here.
 */
const router = Router();

const guard = [
  authenticate,
  tenantContext({ requireTenant: true }),
  requireRole(SYSTEM_ROLES.SUPER_ADMIN, SYSTEM_ROLES.SCHOOL_ADMIN, SYSTEM_ROLES.PRINCIPAL)
];

router.get('/tickets', ...guard, validate(schemas.listZunaTicketsSchema), controller.listTickets);
router.post('/tickets', ...guard, validate(schemas.createZunaTicketSchema), controller.createTicket);
router.get('/tickets/:id', ...guard, validate(schemas.zunaTicketParamsSchema), controller.getTicket);
router.post('/tickets/:id/messages', ...guard, validate(schemas.addZunaMessageSchema), controller.addMessage);

export default router;
