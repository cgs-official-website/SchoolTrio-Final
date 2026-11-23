import * as service from './fee-deletion.service.js';
import { ApiResponse } from '../../utils/api-response.js';
import { HTTP_STATUS } from '../../config/constants.js';

export async function listFeeDeletions(req, res, next) {
  try {
    const { deletions, pagination } = await service.listFeeDeletions(req.tenant.schoolId, req.query);
    return ApiResponse.paginated(res, deletions, pagination, 'Fee deletions retrieved successfully');
  } catch (error) {
    return next(error);
  }
}

export async function getStudentFees(req, res, next) {
  try {
    const fees = await service.getStudentFees(req.tenant.schoolId, req.query.studentId);
    return ApiResponse.success(res, fees, 'Student fees retrieved successfully');
  } catch (error) {
    return next(error);
  }
}

export async function createFeeDeletion(req, res, next) {
  try {
    const actor = req.user || req.auth;
    const result = await service.createFeeDeletion(req.tenant.schoolId, req.body, actor);
    return ApiResponse.success(res, result, 'Student fees deleted successfully', HTTP_STATUS.CREATED);
  } catch (error) {
    return next(error);
  }
}