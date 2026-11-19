import * as service from './bank.service.js';
import { ApiResponse } from '../../utils/api-response.js';
import { HTTP_STATUS } from '../../config/constants.js';

export async function listBanks(req, res, next) {
  try {
    const { banks, pagination } = await service.listBanks(req.tenant.schoolId, req.query);
    return ApiResponse.paginated(res, banks, pagination, 'Banks retrieved successfully');
  } catch (error) {
    return next(error);
  }
}

export async function getBank(req, res, next) {
  try {
    const bank = await service.getBankById(req.tenant.schoolId, req.params.id);
    return ApiResponse.success(res, bank, 'Bank retrieved successfully');
  } catch (error) {
    return next(error);
  }
}

export async function createBank(req, res, next) {
  try {
    const actor = req.user || req.auth;
    const created = await service.createBank(req.tenant.schoolId, req.body, actor);
    return ApiResponse.success(res, created, 'Bank created successfully', HTTP_STATUS.CREATED);
  } catch (error) {
    return next(error);
  }
}

export async function updateBank(req, res, next) {
  try {
    const actor = req.user || req.auth;
    const updated = await service.updateBank(req.tenant.schoolId, req.params.id, req.body, actor);
    return ApiResponse.success(res, updated, 'Bank updated successfully');
  } catch (error) {
    return next(error);
  }
}

export async function deleteBank(req, res, next) {
  try {
    const actor = req.user || req.auth;
    const result = await service.deleteBank(req.tenant.schoolId, req.params.id, actor);
    return ApiResponse.success(res, result, 'Bank deleted successfully');
  } catch (error) {
    return next(error);
  }
}