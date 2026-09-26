import * as subjectService from './subject.service.js';
import { ApiResponse } from '../../utils/api-response.js';
import { HTTP_STATUS } from '../../config/constants.js';

/**
 * Subject HTTP Controller Handlers
 */

/**
 * Lists all subjects for a tenant with pagination, searching, and sorting.
 * GET /api/v1/subjects
 */
export async function listSubjects(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const { subjects, pagination } = await subjectService.listSubjects(schoolId, req.query);
    return ApiResponse.paginated(res, subjects, pagination, 'Subjects retrieved successfully');
  } catch (error) {
    return next(error);
  }
}

/**
 * Retrieves a single subject by ID.
 * GET /api/v1/subjects/:id
 */
export async function getSubject(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const subject = await subjectService.getSubjectById(schoolId, req.params.id);
    return ApiResponse.success(res, subject, 'Subject retrieved successfully');
  } catch (error) {
    return next(error);
  }
}

/**
 * Creates a new subject.
 * POST /api/v1/subjects
 */
export async function createSubject(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const actor = req.user || req.auth;
    const createdSubject = await subjectService.createSubject(schoolId, req.body, actor);
    return ApiResponse.success(res, createdSubject, 'Subject created successfully', HTTP_STATUS.CREATED);
  } catch (error) {
    return next(error);
  }
}

/**
 * Updates a subject.
 * PATCH /api/v1/subjects/:id
 */
export async function updateSubject(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const actor = req.user || req.auth;
    const updatedSubject = await subjectService.updateSubject(schoolId, req.params.id, req.body, actor);
    return ApiResponse.success(res, updatedSubject, 'Subject updated successfully');
  } catch (error) {
    return next(error);
  }
}

/**
 * Deletes a subject.
 * DELETE /api/v1/subjects/:id
 */
export async function deleteSubject(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const actor = req.user || req.auth;
    await subjectService.deleteSubject(schoolId, req.params.id, actor);
    return ApiResponse.success(res, null, 'Subject deleted successfully');
  } catch (error) {
    return next(error);
  }
}

/**
 * Bulk imports subjects.
 * POST /api/v1/subjects/bulk-import
 */
export async function bulkImportSubjects(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const actor = req.user || req.auth;
    const result = await subjectService.bulkImportSubjects(schoolId, req.body.rows, actor);
    return ApiResponse.success(res, result, 'Subjects bulk import completed successfully', HTTP_STATUS.CREATED);
  } catch (error) {
    return next(error);
  }
}

