import * as service from './fee-cancellation.service.js';
import { ApiResponse } from '../../utils/api-response.js';
import { HTTP_STATUS } from '../../config/constants.js';

export async function listFeeCancellations(req, res, next) {
  try {
    const { cancellations, pagination } = await service.listFeeCancellations(req.tenant.schoolId, req.query);
    return ApiResponse.paginated(res, cancellations, pagination, 'Fee cancellations retrieved successfully');
  } catch (error) {
    return next(error);
  }
}

export async function getStudentPayments(req, res, next) {
  try {
    const payments = await service.getStudentPayments(req.tenant.schoolId, req.query.studentId);
    return ApiResponse.success(res, payments, 'Student payments retrieved successfully');
  } catch (error) {
    return next(error);
  }
}

export async function createFeeCancellation(req, res, next) {
  try {
    const actor = req.user || req.auth;
    const result = await service.createFeeCancellation(req.tenant.schoolId, req.body, actor);
    return ApiResponse.success(res, result, 'Payment cancelled successfully', HTTP_STATUS.CREATED);
  } catch (error) {
    return next(error);
  }
}