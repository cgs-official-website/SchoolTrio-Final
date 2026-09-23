import * as reportCardTemplateService from './report-card-template.service.js';
import { ApiResponse } from '../../utils/api-response.js';

/**
 * Report Card Template Controller Handlers
 * Thin controllers delegating template management to report-card-template.service.js.
 */

/**
 * Retrieves the active report card template for the current tenant.
 * GET /api/v1/report-card-templates/:templateType?
 */
export async function getTemplate(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const templateType = req.params.templateType || 'report_card';
    const actor = req.user || req.auth;

    const template = await reportCardTemplateService.getReportCardTemplate(
      schoolId,
      templateType,
      actor
    );

    return ApiResponse.success(res, template, 'Report card template retrieved successfully');
  } catch (error) {
    return next(error);
  }
}

/**
 * Creates or updates the report card template for the current tenant.
 * PUT /api/v1/report-card-templates/:templateType?
 */
export async function saveTemplate(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const templateType = req.params.templateType || 'report_card';
    const actor = req.user || req.auth;

    // Body contains { config: { ... } } validated by saveReportCardTemplateSchema
    const configData = req.body.config || req.body;

    const saved = await reportCardTemplateService.saveReportCardTemplate(
      schoolId,
      templateType,
      configData,
      actor
    );

    return ApiResponse.success(res, saved, 'Report card template saved successfully');
  } catch (error) {
    return next(error);
  }
}

/**
 * Resets a custom report card template back to default configuration.
 * DELETE /api/v1/report-card-templates/:templateType?
 */
export async function deleteTemplate(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const templateType = req.params.templateType || 'report_card';
    const actor = req.user || req.auth;

    const result = await reportCardTemplateService.deleteReportCardTemplate(
      schoolId,
      templateType,
      actor
    );

    return ApiResponse.success(res, result, 'Report card template reset to default successfully');
  } catch (error) {
    return next(error);
  }
}
