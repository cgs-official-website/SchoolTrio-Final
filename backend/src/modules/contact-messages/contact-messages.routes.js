import { Router } from 'express';
import * as controller from './contact-messages.controller.js';
import * as schemas from './contact-messages.schemas.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { requireRole } from '../../middleware/rbac.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { SYSTEM_ROLES } from '../../config/constants.js';

/**
 * 1. Public Contact Messages Router (Mounted under /api/v1/public/contact-messages and /api/v1/contact-messages)
 */
export const publicContactMessagesRouter = Router();

publicContactMessagesRouter.post(
  '/',
  validate(schemas.submitContactMessageSchema),
  controller.submitMessage
);

/**
 * 2. SuperAdmin Contact Messages Router (Mounted under /api/v1/superadmin/contact-messages)
 */
export const superAdminContactMessagesRouter = Router();

superAdminContactMessagesRouter.get(
  '/',
  authenticate,
  requireRole(SYSTEM_ROLES.SUPER_ADMIN),
  validate(schemas.listContactMessagesSchema),
  controller.listMessages
);

superAdminContactMessagesRouter.get(
  '/:id',
  authenticate,
  requireRole(SYSTEM_ROLES.SUPER_ADMIN),
  validate(schemas.contactMessageParamsSchema),
  controller.getMessage
);

superAdminContactMessagesRouter.patch(
  '/:id/status',
  authenticate,
  requireRole(SYSTEM_ROLES.SUPER_ADMIN),
  validate(schemas.updateStatusSchema),
  controller.updateStatus
);

superAdminContactMessagesRouter.post(
  '/:id/reply',
  authenticate,
  requireRole(SYSTEM_ROLES.SUPER_ADMIN),
  validate(schemas.replyContactMessageSchema),
  controller.replyToMessage
);

export default publicContactMessagesRouter;

