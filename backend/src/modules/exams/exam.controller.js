import * as examService from './exam.service.js';
import { ApiResponse } from '../../utils/api-response.js';
import { HTTP_STATUS } from '../../config/constants.js';

/**
 * Examination Controller Handlers
 */

/**
 * Lists all examinations for a tenant with pagination, searching, and filtering.
 * GET /api/v1/exams
 */
export async function listExams(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const { exams, pagination } = await examService.listExams(schoolId, req.query);
    return ApiResponse.paginated(res, exams, pagination, 'Examinations retrieved successfully');
  } catch (error) {
    return next(error);
  }
}

/**
 * Retrieves a single examination by ID.
 * GET /api/v1/exams/:id
 */
export async function getExam(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const exam = await examService.getExamById(schoolId, req.params.id);
    return ApiResponse.success(res, exam, 'Examination retrieved successfully');
  } catch (error) {
    return next(error);
  }
}

/**
 * Creates a new examination.
 * POST /api/v1/exams
 */
export async function createExam(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const userId = req.auth?.userId || req.user?.id || null;
    const exam = await examService.createExam(schoolId, req.body, userId);
    return ApiResponse.success(res, exam, 'Examination created successfully', HTTP_STATUS.CREATED);
  } catch (error) {
    return next(error);
  }
}

/**
 * Updates an existing examination.
 * PATCH /api/v1/exams/:id
 */
export async function updateExam(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const userId = req.auth?.userId || req.user?.id || null;
    const updatedExam = await examService.updateExam(schoolId, req.params.id, req.body, userId);
    return ApiResponse.success(res, updatedExam, 'Examination updated successfully');
  } catch (error) {
    return next(error);
  }
}

/**
 * Deletes an examination.
 * DELETE /api/v1/exams/:id
 */
export async function deleteExam(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const userId = req.auth?.userId || req.user?.id || null;
    const result = await examService.deleteExam(schoolId, req.params.id, userId);
    return ApiResponse.success(res, result, 'Examination deleted successfully');
  } catch (error) {
    return next(error);
  }
}
