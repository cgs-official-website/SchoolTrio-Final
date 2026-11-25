import * as service from './cancellation-report.service.js';
import { ApiResponse } from '../../utils/api-response.js';

export async function getInvoiceCancellationReport(req, res, next) {
  try {
    const { rows, pagination } = await service.getInvoiceCancellationReport(req.tenant.schoolId, req.query);
    return ApiResponse.paginated(res, rows, pagination, 'Invoice cancellation report retrieved successfully');
  } catch (error) {
    return next(error);
  }
}

export async function getInvoiceCancellationSummary(req, res, next) {
  try {
    const summary = await service.getInvoiceCancellationSummary(req.tenant.schoolId, req.query);
    return ApiResponse.success(res, summary, 'Invoice cancellation summary retrieved successfully');
  } catch (error) {
    return next(error);
  }
}

export async function getCategoryCancellationReport(req, res, next) {
  try {
    const { rows, pagination } = await service.getCategoryCancellationReport(req.tenant.schoolId, req.query);
    return ApiResponse.paginated(res, rows, pagination, 'Category cancellation report retrieved successfully');
  } catch (error) {
    return next(error);
  }
}

export async function getCategoryCancellationSummary(req, res, next) {
  try {
    const summary = await service.getCategoryCancellationSummary(req.tenant.schoolId, req.query);
    return ApiResponse.success(res, summary, 'Category cancellation summary retrieved successfully');
  } catch (error) {
    return next(error);
  }
}