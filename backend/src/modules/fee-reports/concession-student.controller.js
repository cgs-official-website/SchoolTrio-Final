import * as service from './concession-student.service.js';
import { ApiResponse } from '../../utils/api-response.js';

export async function getStudentConcessionReport(req, res, next) {
  try {
    const { rows, pagination } = await service.getStudentConcessionReport(req.tenant.schoolId, req.query);
    return ApiResponse.paginated(res, rows, pagination, 'Student concession report retrieved successfully');
  } catch (error) {
    return next(error);
  }
}

export async function getConsolidatedConcessionReport(req, res, next) {
  try {
    const { rows, pagination } = await service.getConsolidatedConcessionReport(req.tenant.schoolId, req.query);
    return ApiResponse.paginated(res, rows, pagination, 'Consolidated concession report retrieved successfully');
  } catch (error) {
    return next(error);
  }
}

// Both reports share the same totals
export async function getStudentConcessionSummary(req, res, next) {
  try {
    const summary = await service.getStudentConcessionSummary(req.tenant.schoolId, req.query);
    return ApiResponse.success(res, summary, 'Concession summary retrieved successfully');
  } catch (error) {
    return next(error);
  }
}