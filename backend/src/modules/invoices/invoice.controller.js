import * as invoiceService from './invoice.service.js';
import { ApiResponse } from '../../utils/api-response.js';
import { HTTP_STATUS } from '../../config/constants.js';

/**
 * Invoice Domain Controller Handlers (Phase 4C.6-B1)
 */

/**
 * Lists invoices with pagination, filtering, and search.
 * GET /api/v1/invoices
 */
export async function listInvoices(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const requester = req.user || req.auth;
    const { invoices, pagination } = await invoiceService.listInvoices(schoolId, req.query, requester);
    return ApiResponse.paginated(res, invoices, pagination, 'Invoices retrieved successfully');
  } catch (error) {
    return next(error);
  }
}

/**
 * Retrieves aggregate institutional financial statistics.
 * GET /api/v1/invoices/stats
 */
export async function getInvoiceStats(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const requester = req.user || req.auth;
    const stats = await invoiceService.getInvoiceStats(schoolId, req.query, requester);
    return ApiResponse.success(res, stats, 'Invoice statistics retrieved successfully');
  } catch (error) {
    return next(error);
  }
}

/**
 * Retrieves class-wise fee reports.
 * GET /api/v1/invoices/reports/class-wise
 */
export async function getClassWiseReports(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const requester = req.user || req.auth;
    const reports = await invoiceService.getClassWiseReports(schoolId, req.query, requester);
    return ApiResponse.success(res, reports, 'Class-wise fee reports retrieved successfully');
  } catch (error) {
    return next(error);
  }
}

/**
 * Retrieves collection-period-wise fee reports.
 * GET /api/v1/invoices/reports/period-wise
 */
export async function getPeriodWiseReports(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const requester = req.user || req.auth;
    const reports = await invoiceService.getPeriodWiseReports(schoolId, requester);
    return ApiResponse.success(res, reports, 'Period-wise fee reports retrieved successfully');
  } catch (error) {
    return next(error);
  }
}

/**
 * Retrieves monthly revenue report.
 * GET /api/v1/invoices/reports/monthly-revenue
 */
export async function getMonthlyRevenueReports(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const requester = req.user || req.auth;
    const reports = await invoiceService.getMonthlyRevenueReports(schoolId, req.query, requester);
    return ApiResponse.success(res, reports, 'Monthly revenue reports retrieved successfully');
  } catch (error) {
    return next(error);
  }
}

/**
 * Retrieves a single invoice by ID.
 * GET /api/v1/invoices/:id
 */
export async function getInvoice(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const requester = req.user || req.auth;
    const invoice = await invoiceService.getInvoiceById(schoolId, req.params.id, requester);
    return ApiResponse.success(res, invoice, 'Invoice retrieved successfully');
  } catch (error) {
    return next(error);
  }
}

/**
 * Retrieves student invoice timeline history and balance summary.
 * GET /api/v1/students/:studentId/invoices
 */
export async function getStudentInvoices(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const requester = req.user || req.auth;
    const { invoices, pagination, summary } = await invoiceService.getStudentInvoices(
      schoolId,
      req.params.studentId,
      req.query,
      requester
    );

    return res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Student invoices retrieved successfully',
      data: invoices,
      pagination,
      summary
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Cancels a pending invoice.
 * PATCH /api/v1/invoices/:id/cancel
 */
export async function cancelInvoice(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const actor = req.user || req.auth;
    const cancelled = await invoiceService.cancelInvoice(schoolId, req.params.id, req.body, actor);
    return ApiResponse.success(res, cancelled, 'Invoice cancelled successfully');
  } catch (error) {
    return next(error);
  }
}

/**
 * Settles an invoice payment.
 * POST /api/v1/invoices/:id/pay
 */
export async function payInvoice(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const actor = req.user || req.auth;
    const paid = await invoiceService.payInvoice(schoolId, req.params.id, req.body, actor);
    return ApiResponse.success(res, paid, 'Payment recorded successfully');
  } catch (error) {
    return next(error);
  }
}


