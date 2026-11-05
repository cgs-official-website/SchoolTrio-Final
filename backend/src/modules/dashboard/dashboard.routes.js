import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware.js';
import { tenantContext } from '../../middleware/tenant.middleware.js';
import * as dashboardController from './dashboard.controller.js';

const router = Router();

/**
 * AI Daily Work Briefing Endpoint
 * Scoped to active tenant and authenticated user.
 */
router.post(
  '/ai-briefing',
  authenticate,
  tenantContext({ requireTenant: true }),
  dashboardController.getAiBriefing
);

export default router;

