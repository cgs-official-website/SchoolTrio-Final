import * as classService from './class.service.js';
import { ApiResponse } from '../../utils/api-response.js';
import { HTTP_STATUS } from '../../config/constants.js';

/**
 * Class & Section HTTP Request Controller Layer
 */

/**
 * GET /api/v1/classes
 * Lists all classes for the active tenant.
 */
export async function listClasses(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const { classes, pagination } = await classService.listClasses(schoolId, req.query);
    return ApiResponse.paginated(res, classes, pagination, 'Classes retrieved successfully');
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/classes/:id
 * Retrieves a single class by ID within the active tenant.
 */
export async function getClass(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const classRecord = await classService.getClassById(schoolId, req.params.id);
    return ApiResponse.success(res, classRecord, 'Class retrieved successfully');
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/classes
 * Creates a new class within the active tenant.
 */
export async function createClass(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const created = await classService.createClass(schoolId, req.body, req.user || req.auth);
    return ApiResponse.success(res, created, 'Class created successfully', HTTP_STATUS.CREATED);
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/v1/classes/:id
 * Updates a class within the active tenant.
 */
export async function updateClass(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const updated = await classService.updateClass(schoolId, req.params.id, req.body, req.user || req.auth);
    return ApiResponse.success(res, updated, 'Class updated successfully');
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/v1/classes/:id
 * Deletes a class within the active tenant.
 */
export async function deleteClass(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    await classService.deleteClass(schoolId, req.params.id, req.user || req.auth);
    return ApiResponse.success(res, null, 'Class deleted successfully');
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/classes/:classId/sections
 * Lists all sections for a class within the active tenant.
 */
export async function listSections(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const sections = await classService.listSections(schoolId, req.params.classId);
    return ApiResponse.success(res, sections, 'Sections retrieved successfully');
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/classes/:classId/sections
 * Creates a new section within a class for the active tenant.
 */
export async function createSection(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const created = await classService.createSection(schoolId, req.params.classId, req.body, req.user || req.auth);
    return ApiResponse.success(res, created, 'Section created successfully', HTTP_STATUS.CREATED);
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/v1/classes/:classId/sections/:sectionId
 * Updates a section within a class for the active tenant.
 */
export async function updateSection(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const updated = await classService.updateSection(
      schoolId,
      req.params.classId,
      req.params.sectionId,
      req.body,
      req.user || req.auth
    );
    return ApiResponse.success(res, updated, 'Section updated successfully');
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/v1/classes/:classId/sections/:sectionId
 * Deletes a section within a class for the active tenant.
 */
export async function deleteSection(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    await classService.deleteSection(schoolId, req.params.classId, req.params.sectionId, req.user || req.auth);
    return ApiResponse.success(res, null, 'Section deleted successfully');
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/classes/bulk-import
 * Bulk imports classes, sections, and categories for the active tenant.
 */
export async function bulkImportClasses(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const result = await classService.bulkImportClasses(schoolId, req.body.rows, req.user || req.auth);
    return ApiResponse.success(res, result, 'Classes bulk import completed successfully', HTTP_STATUS.CREATED);
  } catch (err) {
    next(err);
  }
}

