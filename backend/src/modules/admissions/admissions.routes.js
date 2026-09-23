import { Router } from 'express';
import * as admissionsController from './admissions.controller.js';
import * as admissionsSchemas from './admissions.schemas.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { tenantContext } from '../../middleware/tenant.middleware.js';
import { requirePermission } from '../../middleware/rbac.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { rateLimit } from '../../middleware/rate-limit.middleware.js';

/**
 * 1. Authenticated Admin Router (/api/v1/admissions)
 */
export const admissionsRouter = Router();

// --- Leads Endpoints ---
admissionsRouter.get(
  '/leads',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('leads', 'read'),
  validate(admissionsSchemas.listLeadsQuerySchema),
  admissionsController.listLeads
);

admissionsRouter.get(
  '/leads/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('leads', 'read'),
  validate(admissionsSchemas.leadParamsSchema),
  admissionsController.getLead
);

admissionsRouter.patch(
  '/leads/:id/status',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('leads', 'edit'),
  validate(admissionsSchemas.updateLeadStatusSchema),
  admissionsController.updateLeadStatus
);

admissionsRouter.delete(
  '/leads/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('leads', 'delete'),
  validate(admissionsSchemas.leadParamsSchema),
  admissionsController.deleteLead
);

// --- Lead Forms Endpoints ---
admissionsRouter.get(
  '/forms',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('leads', 'read'),
  validate(admissionsSchemas.listFormsQuerySchema),
  admissionsController.listLeadForms
);

admissionsRouter.post(
  '/forms',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('leads', 'create'),
  validate(admissionsSchemas.createLeadFormSchema),
  admissionsController.createLeadForm
);

admissionsRouter.get(
  '/forms/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('leads', 'read'),
  validate(admissionsSchemas.formParamsSchema),
  admissionsController.getLeadForm
);

admissionsRouter.patch(
  '/forms/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('leads', 'edit'),
  validate(admissionsSchemas.updateLeadFormSchema),
  admissionsController.updateLeadForm
);

admissionsRouter.delete(
  '/forms/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('leads', 'delete'),
  validate(admissionsSchemas.formParamsSchema),
  admissionsController.deleteLeadForm
);

// --- Admission Applications Endpoints ---
admissionsRouter.get(
  '/applications',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('leads', 'read'),
  validate(admissionsSchemas.listApplicationsQuerySchema),
  admissionsController.listApplications
);

admissionsRouter.get(
  '/applications/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('leads', 'read'),
  validate(admissionsSchemas.applicationParamsSchema),
  admissionsController.getApplication
);

admissionsRouter.patch(
  '/applications/:id/status',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('leads', 'edit'),
  validate(admissionsSchemas.updateApplicationStatusSchema),
  admissionsController.updateApplicationStatus
);

admissionsRouter.delete(
  '/applications/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('leads', 'delete'),
  validate(admissionsSchemas.applicationParamsSchema),
  admissionsController.deleteApplication
);

admissionsRouter.post(
  '/applications/:id/enroll',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('leads', 'edit'),
  validate(admissionsSchemas.enrollApplicationSchema),
  admissionsController.enrollApplication
);

/**
 * 2. Public Admissions Router (/api/v1/public/admissions)
 */
export const publicAdmissionsRouter = Router();

publicAdmissionsRouter.get(
  '/schools/:schoolId/meta',
  validate(admissionsSchemas.publicAdmissionMetaParamsSchema),
  admissionsController.getPublicSchoolAdmissionMeta
);

publicAdmissionsRouter.post(
  '/:schoolId',
  rateLimit({ max: 20, windowMs: 60000, keyPrefix: 'rl:pub-adm:' }),
  validate(admissionsSchemas.publicAdmissionSubmitSchema),
  admissionsController.submitPublicAdmission
);

/**
 * 3. Public Leads Router (/api/v1/public/leads)
 */
export const publicLeadsRouter = Router();

publicLeadsRouter.get(
  '/forms/:schoolId/:formId',
  validate(admissionsSchemas.publicFormLookupParamsSchema),
  admissionsController.getPublicLeadForm
);

publicLeadsRouter.post(
  '/:schoolId/:formId',
  rateLimit({ max: 30, windowMs: 60000, keyPrefix: 'rl:pub-lead:' }),
  validate(admissionsSchemas.publicLeadSubmitSchema),
  admissionsController.submitPublicLead
);

export default admissionsRouter;
