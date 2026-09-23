import { ApiResponse } from '../../utils/api-response.js';
import * as lessonPlanService from './lesson-plan.service.js';

/**
 * Lists lesson plans with filtering, pagination, and ownership custody enforcement.
 * GET /api/v1/lesson-plans
 */
export async function listLessonPlans(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId;
    const actor = req.auth || req.user;

    const result = await lessonPlanService.listLessonPlans(schoolId, actor, req.query);

    return ApiResponse.paginated(
      res,
      result.data,
      result.pagination,
      'Lesson plans retrieved successfully',
      200
    );
  } catch (err) {
    next(err);
  }
}

/**
 * Retrieves a single lesson plan by ID.
 * GET /api/v1/lesson-plans/:id
 */
export async function getLessonPlanById(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId;
    const { id } = req.params;
    const actor = req.auth || req.user;

    const result = await lessonPlanService.getLessonPlanById(schoolId, actor, id);

    return ApiResponse.success(
      res,
      result,
      'Lesson plan retrieved successfully',
      200
    );
  } catch (err) {
    next(err);
  }
}

/**
 * Creates a new lesson plan.
 * POST /api/v1/lesson-plans
 */
export async function createLessonPlan(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId;
    const actor = req.auth || req.user;

    const result = await lessonPlanService.createLessonPlan(schoolId, actor, req.body);

    return ApiResponse.success(
      res,
      result,
      'Lesson plan created successfully',
      201
    );
  } catch (err) {
    next(err);
  }
}

/**
 * Updates an existing lesson plan.
 * PATCH /api/v1/lesson-plans/:id
 */
export async function updateLessonPlan(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId;
    const { id } = req.params;
    const actor = req.auth || req.user;

    const result = await lessonPlanService.updateLessonPlan(schoolId, actor, id, req.body);

    return ApiResponse.success(
      res,
      result,
      'Lesson plan updated successfully',
      200
    );
  } catch (err) {
    next(err);
  }
}

/**
 * Deletes a lesson plan.
 * DELETE /api/v1/lesson-plans/:id
 */
export async function deleteLessonPlan(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId;
    const { id } = req.params;
    const actor = req.auth || req.user;

    const result = await lessonPlanService.deleteLessonPlan(schoolId, actor, id);

    return ApiResponse.success(
      res,
      null,
      result.message || 'Lesson plan deleted successfully',
      200
    );
  } catch (err) {
    next(err);
  }
}

export const lessonPlanController = {
  listLessonPlans,
  getLessonPlanById,
  createLessonPlan,
  updateLessonPlan,
  deleteLessonPlan
};

export default lessonPlanController;
