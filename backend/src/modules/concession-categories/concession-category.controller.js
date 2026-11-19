import * as service from './concession-category.service.js';
import { ApiResponse } from '../../utils/api-response.js';
import { HTTP_STATUS } from '../../config/constants.js';

export async function listConcessionCategories(req, res, next) {
  try {
    const { concessionCategories, pagination } = await service.listConcessionCategories(req.tenant.schoolId, req.query);
    return ApiResponse.paginated(res, concessionCategories, pagination, 'Concession categories retrieved successfully');
  } catch (error) {
    return next(error);
  }
}

export async function getConcessionCategory(req, res, next) {
  try {
    const category = await service.getConcessionCategoryById(req.tenant.schoolId, req.params.id);
    return ApiResponse.success(res, category, 'Concession category retrieved successfully');
  } catch (error) {
    return next(error);
  }
}

export async function createConcessionCategory(req, res, next) {
  try {
    const actor = req.user || req.auth;
    const created = await service.createConcessionCategory(req.tenant.schoolId, req.body, actor);
    return ApiResponse.success(res, created, 'Concession category created successfully', HTTP_STATUS.CREATED);
  } catch (error) {
    return next(error);
  }
}

export async function updateConcessionCategory(req, res, next) {
  try {
    const actor = req.user || req.auth;
    const updated = await service.updateConcessionCategory(req.tenant.schoolId, req.params.id, req.body, actor);
    return ApiResponse.success(res, updated, 'Concession category updated successfully');
  } catch (error) {
    return next(error);
  }
}

export async function deleteConcessionCategory(req, res, next) {
  try {
    const actor = req.user || req.auth;
    const result = await service.deleteConcessionCategory(req.tenant.schoolId, req.params.id, actor);
    return ApiResponse.success(res, result, 'Concession category deleted successfully');
  } catch (error) {
    return next(error);
  }
}