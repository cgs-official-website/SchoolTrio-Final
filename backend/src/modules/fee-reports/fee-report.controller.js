import * as service from './fee-report.service.js';
import { ApiResponse } from '../../utils/api-response.js';

export async function getDayReport(req, res, next) {
  try {
    const report = await service.getDayReport(req.tenant.schoolId, req.query);
    return ApiResponse.success(res, report, 'Day report retrieved successfully');
  } catch (error) {
    return next(error);
  }
}

export async function getDailyCollection(req, res, next) {
  try {
    const { rows, pagination } = await service.getDailyCollection(req.tenant.schoolId, req.query);
    return ApiResponse.paginated(res, rows, pagination, 'Daily collection retrieved successfully');
  } catch (error) {
    return next(error);
  }
}

export async function getDailyCollectionSummary(req, res, next) {
  try {
    const summary = await service.getDailyCollectionSummary(req.tenant.schoolId, req.query);
    return ApiResponse.success(res, summary, 'Daily collection summary retrieved successfully');
  } catch (error) {
    return next(error);
  }
}

export async function getStudentLedger(req, res, next) {
  try {
    const ledger = await service.getStudentLedger(req.tenant.schoolId, req.params.studentId, req.query);
    return ApiResponse.success(res, ledger, 'Student ledger retrieved successfully');
  } catch (error) {
    return next(error);
  }
}