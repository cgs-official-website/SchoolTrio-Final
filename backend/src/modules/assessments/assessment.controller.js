import * as assessmentService from './assessment.service.js';
import { ApiResponse } from '../../utils/api-response.js';
import { HTTP_STATUS } from '../../config/constants.js';

/**
 * Assessment Controller Handlers
 */

/**
 * Lists all assessments for a tenant with pagination, searching, and filtering.
 * GET /api/v1/assessments
 */
export async function listAssessments(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const actor = req.user || req.auth;
    const { assessments, pagination } = await assessmentService.listAssessments(schoolId, req.query, actor);
    return ApiResponse.paginated(res, assessments, pagination, 'Assessments retrieved successfully');
  } catch (error) {
    return next(error);
  }
}

/**
 * Retrieves a single assessment by ID.
 * GET /api/v1/assessments/:id
 */
export async function getAssessment(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const actor = req.user || req.auth;
    const assessment = await assessmentService.getAssessmentById(schoolId, req.params.id, actor);
    return ApiResponse.success(res, assessment, 'Assessment retrieved successfully');
  } catch (error) {
    return next(error);
  }
}

/**
 * Creates a new assessment.
 * POST /api/v1/assessments
 */
export async function createAssessment(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const actor = req.user || req.auth;
    const assessment = await assessmentService.createAssessment(schoolId, req.body, actor);
    return ApiResponse.success(res, assessment, 'Assessment created successfully', HTTP_STATUS.CREATED);
  } catch (error) {
    return next(error);
  }
}

/**
 * Updates an existing assessment.
 * PATCH /api/v1/assessments/:id
 */
export async function updateAssessment(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const actor = req.user || req.auth;
    const updatedAssessment = await assessmentService.updateAssessment(schoolId, req.params.id, req.body, actor);
    return ApiResponse.success(res, updatedAssessment, 'Assessment updated successfully');
  } catch (error) {
    return next(error);
  }
}

/**
 * Deletes an assessment.
 * DELETE /api/v1/assessments/:id
 */
export async function deleteAssessment(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const actor = req.user || req.auth;
    const result = await assessmentService.deleteAssessment(schoolId, req.params.id, actor);
    return ApiResponse.success(res, result, 'Assessment deleted successfully');
  } catch (error) {
    return next(error);
  }
}
