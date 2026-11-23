import * as service from './fee-concession.service.js';
import { ApiResponse } from '../../utils/api-response.js';
import { HTTP_STATUS } from '../../config/constants.js';

export async function listFeeConcessions(req, res, next) {
  try {
    const { concessions, pagination } = await service.listFeeConcessions(req.tenant.schoolId, req.query);
    return ApiResponse.paginated(res, concessions, pagination, 'Fee concessions retrieved successfully');
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

export async function createFeeConcession(req, res, next) {
  try {
    const actor = req.user || req.auth;
    const result = await service.createFeeConcession(req.tenant.schoolId, req.body, actor);
    return ApiResponse.success(res, result, 'Fee concession added successfully', HTTP_STATUS.CREATED);
  } catch (error) {
    return next(error);
  }
}

export async function deleteFeeConcession(req, res, next) {
  try {
    const actor = req.user || req.auth;
    const result = await service.deleteFeeConcession(req.tenant.schoolId, req.params.id, actor);
    return ApiResponse.success(res, result, 'Fee concession deleted successfully');
  } catch (error) {
    return next(error);
  }
}