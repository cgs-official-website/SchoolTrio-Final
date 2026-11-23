import * as service from './fee-entry.service.js';
import { ApiResponse } from '../../utils/api-response.js';
import { HTTP_STATUS } from '../../config/constants.js';

export async function listFeeEntries(req, res, next) {
  try {
    const { entries, pagination } = await service.listFeeEntries(req.tenant.schoolId, req.query);
    return ApiResponse.paginated(res, entries, pagination, 'Fee entries retrieved successfully');
  } catch (error) {
    return next(error);
  }
}

export async function createFeeEntry(req, res, next) {
  try {
    const actor = req.user || req.auth;
    const result = await service.createFeeEntry(req.tenant.schoolId, req.body, actor);
    return ApiResponse.success(res, result, 'Fee entry created successfully', HTTP_STATUS.CREATED);
  } catch (error) {
    return next(error);
  }
}

export async function updateFeeEntry(req, res, next) {
  try {
    const actor = req.user || req.auth;
    const updated = await service.updateFeeEntry(req.tenant.schoolId, req.params.id, req.body, actor);
    return ApiResponse.success(res, updated, 'Fee entry updated successfully');
  } catch (error) {
    return next(error);
  }
}
