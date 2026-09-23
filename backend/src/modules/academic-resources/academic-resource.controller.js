import { ApiResponse } from '../../utils/api-response.js';
import * as academicResourceService from './academic-resource.service.js';

/**
 * Lists academic resources with filtering, pagination, and tenant isolation.
 * GET /api/v1/academic-resources
 */
export async function listAcademicResources(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId;
    const result = await academicResourceService.listAcademicResources(schoolId, req.query);

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
 * Retrieves a single academic resource by ID.
 * GET /api/v1/academic-resources/:id
 */
export async function getAcademicResourceById(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId;
    const { id } = req.params;

    const result = await academicResourceService.getAcademicResourceById(schoolId, id);

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
  listAcademicResources,
  getAcademicResourceById,
  createAcademicResource,
  updateAcademicResource,
  deleteAcademicResource
};

export default academicResourceController;
