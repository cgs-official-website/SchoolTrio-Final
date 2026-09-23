import * as assessmentGradeService from './assessment-grade.service.js';
import { ApiResponse } from '../../utils/api-response.js';

/**
 * Assessment Grade Controller Handlers
 * Thin controllers delegating all domain logic and authorization to the service layer.
 */

/**
 * Lists all student grades recorded for an assessment.
 * GET /api/v1/assessments/:assessmentId/grades
 */
export async function listGrades(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const { assessmentId } = req.params;
    const actor = req.user || req.auth;

    const { grades, pagination } = await assessmentGradeService.listAssessmentGrades(
      schoolId,
      assessmentId,
      req.query,
      actor
    );

    return ApiResponse.paginated(res, grades, pagination, 'Assessment grades retrieved successfully');
  } catch (error) {
    return next(error);
  }
}

/**
 * Retrieves a single student's recorded grade for an assessment.
 * GET /api/v1/assessments/:assessmentId/grades/:studentId
 */
export async function getGrade(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const { assessmentId, studentId } = req.params;
    const actor = req.user || req.auth;

    const grade = await assessmentGradeService.getAssessmentGrade(
      schoolId,
      assessmentId,
      studentId,
      actor
    );

    return ApiResponse.success(res, grade, 'Assessment grade retrieved successfully');
  } catch (error) {
    return next(error);
  }
}

/**
 * Creates or updates a single student's grade for an assessment.
 * PUT /api/v1/assessments/:assessmentId/grades/:studentId
 */
export async function upsertGrade(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const { assessmentId, studentId } = req.params;
    const actor = req.user || req.auth;

    const grade = await assessmentGradeService.upsertSingleGrade(
      schoolId,
      assessmentId,
      studentId,
      req.body,
      actor
    );

    return ApiResponse.success(res, grade, 'Assessment grade saved successfully');
  } catch (error) {
    return next(error);
  }
}

/**
 * Atomically creates/updates multiple student grades for an assessment in bulk.
 * POST /api/v1/assessments/:assessmentId/grades/bulk
 */
export async function bulkUpsertGrades(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const { assessmentId } = req.params;
    const actor = req.user || req.auth;

    const result = await assessmentGradeService.bulkUpsertGrades(
      schoolId,
      assessmentId,
      req.body,
      actor
    );

    return ApiResponse.success(res, result, 'Assessment grades saved successfully');
  } catch (error) {
    return next(error);
  }
}

/**
 * Clears/deletes a single student's recorded grade for an assessment.
 * DELETE /api/v1/assessments/:assessmentId/grades/:studentId
 */
export async function deleteGrade(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const { assessmentId, studentId } = req.params;
    const actor = req.user || req.auth;

    const result = await assessmentGradeService.deleteAssessmentGrade(
      schoolId,
      assessmentId,
      studentId,
      actor
    );

    return ApiResponse.success(res, result, 'Assessment grade cleared successfully');
  } catch (error) {
    return next(error);
  }
}
