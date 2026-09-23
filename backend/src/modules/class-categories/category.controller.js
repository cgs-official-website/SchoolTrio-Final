import * as categoryService from './category.service.js';
import { ApiResponse } from '../../utils/api-response.js';
import { HTTP_STATUS } from '../../config/constants.js';

/**
 * Class Category HTTP Request Controller Layer
 */

/**
 * GET /api/v1/class-categories
 * Lists all class categories for the active tenant.
 */
export async function listCategories(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const categories = await categoryService.listCategories(schoolId);
    return ApiResponse.success(res, categories, 'Categories retrieved successfully');
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/class-categories
 * Creates a new class category within the active tenant.
 */
export async function createCategory(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const created = await categoryService.createCategory(schoolId, req.body, req.user || req.auth);
    return ApiResponse.success(res, created, 'Category created successfully', HTTP_STATUS.CREATED);
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/v1/class-categories/:id
 * Deletes a class category within the active tenant.
 */
export async function deleteCategory(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    await categoryService.deleteCategory(schoolId, req.params.id, req.user || req.auth);
    return ApiResponse.success(res, null, 'Category deleted successfully');
  } catch (err) {
    next(err);
  }
}
