import * as service from './fee-category.service.js';
import { ApiResponse } from '../../utils/api-response.js';
import { HTTP_STATUS } from '../../config/constants.js';

export async function listFeeCategories(req, res, next) {
  try {
    const { feeCategories, pagination } = await service.listFeeCategories(req.tenant.schoolId, req.query);
    return ApiResponse.paginated(res, feeCategories, pagination, 'Fee categories retrieved successfully');
  } catch (error) {
    return next(error);
  }
}

export async function getFeeCategory(req, res, next) {
  try {
    const category = await service.getFeeCategoryById(req.tenant.schoolId, req.params.id);
    return ApiResponse.success(res, category, 'Fee category retrieved successfully');
  } catch (error) {
    return next(error);
  }
}

export async function createFeeCategory(req, res, next) {
  try {
    const actor = req.user || req.auth;
    const created = await service.createFeeCategory(req.tenant.schoolId, req.body, actor);
    return ApiResponse.success(res, created, 'Fee category created successfully', HTTP_STATUS.CREATED);
  } catch (error) {
    return next(error);
  }
}

export async function updateFeeCategory(req, res, next) {
  try {
    const actor = req.user || req.auth;
    const updated = await service.updateFeeCategory(req.tenant.schoolId, req.params.id, req.body, actor);
    return ApiResponse.success(res, updated, 'Fee category updated successfully');
  } catch (error) {
    return next(error);
  }
}

export async function deleteFeeCategory(req, res, next) {
  try {
    const actor = req.user || req.auth;
    const result = await service.deleteFeeCategory(req.tenant.schoolId, req.params.id, actor);
    return ApiResponse.success(res, result, 'Fee category deleted successfully');
  } catch (error) {
    return next(error);
  }
}

export async function listCategoryTypes(req, res, next) {
  try {
    const types = await service.listCategoryTypes(req.tenant.schoolId);
    return ApiResponse.success(res, types, 'Fee category types retrieved successfully');
  } catch (error) {
    return next(error);
  }
}