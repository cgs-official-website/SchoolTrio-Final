import * as reportCardService from './report-card.service.js';
import { ApiResponse } from '../../utils/api-response.js';

/**
 * Report Card Controller Handlers
 * Thin controllers delegating domain execution and authorization to report-card.service.js.
 */

/**
 * Generates an in-memory preview of report cards for a class without persisting records.
 * POST /api/v1/report-cards/preview
 */
export async function previewReportCards(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const actor = req.user || req.auth;

    const preview = await reportCardService.generateReportCardPreview(
      schoolId,
      req.body,
      actor
    );

    return ApiResponse.success(res, preview, 'Report card preview generated successfully');
  } catch (error) {
    return next(error);
  }
}

/**
 * Publishes and persists historical snapshot report cards for students in a class.
 * POST /api/v1/report-cards/publish
 */
export async function publishReportCards(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const actor = req.user || req.auth;

    const result = await reportCardService.publishReportCards(
      schoolId,
      req.body,
      actor
    );

    return ApiResponse.success(res, result, 'Report cards published successfully');
  } catch (error) {
    return next(error);
  }
}

/**
 * Retrieves a single report card by UUID within tenant scope.
 * GET /api/v1/report-cards/:id
 */
export async function getReportCard(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const { id } = req.params;
    const actor = req.user || req.auth;

    const reportCard = await reportCardService.getReportCard(
      schoolId,
      id,
      actor
    );

    return ApiResponse.success(res, reportCard, 'Report card retrieved successfully');
  } catch (error) {
    return next(error);
  }
}

/**
 * Lists published report cards for a specific student with pagination.
 * GET /api/v1/report-cards/student/:studentId
 */
export async function listStudentReportCards(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const { studentId } = req.params;
    const actor = req.user || req.auth;

    const { reportCards, pagination } = await reportCardService.listStudentReportCards(
      schoolId,
      studentId,
      req.query,
      actor
    );

    return ApiResponse.paginated(res, reportCards, pagination, 'Student report cards retrieved successfully');
  } catch (error) {
    return next(error);
  }
}

/**
 * Lists published report cards for a class with pagination.
 * GET /api/v1/report-cards/class/:classId
 */
export async function listClassReportCards(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const { classId } = req.params;
    const actor = req.user || req.auth;

    const { reportCards, pagination } = await reportCardService.listClassReportCards(
      schoolId,
      classId,
      req.query,
      actor
    );

    return ApiResponse.paginated(res, reportCards, pagination, 'Class report cards retrieved successfully');
  } catch (error) {
    return next(error);
  }
}
