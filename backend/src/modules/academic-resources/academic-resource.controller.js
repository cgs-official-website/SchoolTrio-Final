import { ApiResponse } from '../../utils/api-response.js';
import * as academicResourceService from './academic-resource.service.js';
import { storeResourceFile, MAX_RESOURCE_FILE_SIZE, MAX_RESOURCE_FILE_MB } from './academic-resource.upload.js';
import { ValidationError } from '../../utils/app-error.js';

/**
 * Returns upload constraints so the UI never hard-codes them.
 * GET /api/v1/academic-resources/upload-config
 */
export async function getUploadConfig(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId;
    const allowedTargets = await academicResourceService.getAllowedTargets(schoolId, req.auth || req.user);
    return ApiResponse.success(res, {
      maxFileSizeBytes: MAX_RESOURCE_FILE_SIZE,
      maxFileSizeMb: MAX_RESOURCE_FILE_MB,
      // null = every class/section/subject (admin); array = only these targets (teacher/staff)
      allowedTargets,
      allowedClassIds: allowedTargets ? Array.from(new Set(allowedTargets.map(t => t.classId))) : null
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Uploads a resource file and returns its URL.
 * POST /api/v1/academic-resources/upload
 */
export async function uploadAcademicResourceFile(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId;
    if (!req.file) throw new ValidationError('No file provided');
    const fileUrl = await storeResourceFile(req.file, schoolId, req);
    return ApiResponse.success(
      res,
      { fileUrl, fileName: req.file.originalname, size: req.file.size },
      'File uploaded successfully',
      201
    );
  } catch (err) {
    next(err);
  }
}

/**
 * Lists academic resources with filtering, pagination, and tenant isolation.
 * GET /api/v1/academic-resources
 */
export async function listAcademicResources(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId;
    const result = await academicResourceService.listAcademicResources(schoolId, req.query, req.auth || req.user);

    return ApiResponse.paginated(
      res,
      result.data,
      result.pagination,
      'Academic resources retrieved successfully',
      200
    );
  } catch (err) {
    next(err);
  }
}

/**
 * Resources shared with a student (parent / student self-service view).
 * GET /api/v1/academic-resources/student/:studentId
 */
export async function listStudentAcademicResources(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId;
    const result = await academicResourceService.listAcademicResourcesForStudent(
      schoolId,
      req.auth || req.user,
      req.params.studentId,
      req.query
    );
    return ApiResponse.paginated(res, result.data, result.pagination, 'Academic resources retrieved successfully', 200);
  } catch (err) {
    next(err);
  }
}

/**
 * Retrieves a single academic resource by ID.
 * GET /api/v1/academic-resources/:id
 */
export async function getAcademicResourceById(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId;
    const { id } = req.params;

    const result = await academicResourceService.getAcademicResourceById(schoolId, id, req.auth || req.user);

    return ApiResponse.success(
      res,
      result,
      'Academic resource retrieved successfully',
      200
    );
  } catch (err) {
    next(err);
  }
}

/**
 * Creates a new academic resource.
 * POST /api/v1/academic-resources
 */
export async function createAcademicResource(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId;
    const actor = req.auth || req.user;

    const result = await academicResourceService.createAcademicResource(schoolId, actor, req.body);

    return ApiResponse.success(
      res,
      result,
      'Academic resource created successfully',
      201
    );
  } catch (err) {
    next(err);
  }
}

/**
 * Updates an existing academic resource.
 * PATCH /api/v1/academic-resources/:id
 */
export async function updateAcademicResource(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId;
    const { id } = req.params;
    const actor = req.auth || req.user;

    const result = await academicResourceService.updateAcademicResource(schoolId, actor, id, req.body);

    return ApiResponse.success(
      res,
      result,
      'Academic resource updated successfully',
      200
    );
  } catch (err) {
    next(err);
  }
}

/**
 * Deletes an academic resource.
 * DELETE /api/v1/academic-resources/:id
 */
export async function deleteAcademicResource(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId;
    const { id } = req.params;
    const actor = req.auth || req.user;

    const result = await academicResourceService.deleteAcademicResource(schoolId, actor, id);

    return ApiResponse.success(
      res,
      null,
      result.message || 'Academic resource deleted successfully',
      200
    );
  } catch (err) {
    next(err);
  }
}

export const academicResourceController = {
  listStudentAcademicResources,
  getUploadConfig,
  uploadAcademicResourceFile,
  listAcademicResources,
  getAcademicResourceById,
  createAcademicResource,
  updateAcademicResource,
  deleteAcademicResource
};

export default academicResourceController;
