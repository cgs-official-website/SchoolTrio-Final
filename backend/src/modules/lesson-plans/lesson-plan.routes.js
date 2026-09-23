import { Router } from 'express';
import * as lessonPlanController from './lesson-plan.controller.js';
import * as lessonPlanSchemas from './lesson-plan.schemas.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { tenantContext } from '../../middleware/tenant.middleware.js';
import { requirePermission } from '../../middleware/rbac.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';

const lessonPlanRouter = Router();

/**
 * 1. List Lesson Plans Endpoint
 * GET /api/v1/lesson-plans
 */
lessonPlanRouter.get(
  '/',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('lesson_plans', 'read'),
  validate(lessonPlanSchemas.listLessonPlansSchema),
  lessonPlanController.listLessonPlans
);

/**
 * 2. Get Single Lesson Plan Endpoint
 * GET /api/v1/lesson-plans/:id
 */
lessonPlanRouter.get(
  '/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('lesson_plans', 'read'),
  validate(lessonPlanSchemas.lessonPlanIdParamSchema),
  lessonPlanController.getLessonPlanById
);

/**
 * 3. Create Lesson Plan Endpoint
 * POST /api/v1/lesson-plans
 */
lessonPlanRouter.post(
  '/',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('lesson_plans', 'create'),
  validate(lessonPlanSchemas.createLessonPlanSchema),
  lessonPlanController.createLessonPlan
);

/**
 * 4. Update Lesson Plan Endpoint
 * PATCH /api/v1/lesson-plans/:id
 */
lessonPlanRouter.patch(
  '/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('lesson_plans', 'edit'),
  validate(lessonPlanSchemas.updateLessonPlanSchema),
  lessonPlanController.updateLessonPlan
);

/**
 * 5. Delete Lesson Plan Endpoint
 * DELETE /api/v1/lesson-plans/:id
 */
lessonPlanRouter.delete(
  '/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('lesson_plans', 'delete'),
  validate(lessonPlanSchemas.lessonPlanIdParamSchema),
  lessonPlanController.deleteLessonPlan
);

export { lessonPlanRouter as lessonPlanRoutes };
export default lessonPlanRouter;
