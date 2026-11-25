import * as service from './concession-report.service.js';
import { ApiResponse } from '../../utils/api-response.js';

export async function getConcessionReport(req, res, next) {
  try {
    const { rows, pagination } = await service.getConcessionReport(req.tenant.schoolId, req.query);
    return ApiResponse.paginated(res, rows, pagination, 'Concession report retrieved successfully');
  } catch (error) {
    return next(error);
  }
}

export async function getConcessionReportSummary(req, res, next) {
  try {
    const summary = await service.getConcessionReportSummary(req.tenant.schoolId, req.query);
    return ApiResponse.success(res, summary, 'Concession report summary retrieved successfully');
  } catch (error) {
    return next(error);
  }
}