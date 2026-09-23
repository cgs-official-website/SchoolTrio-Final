import * as emailTemplatesService from './email-templates.service.js';
import { ApiResponse } from '../../utils/api-response.js';
import { HTTP_STATUS } from '../../config/constants.js';

/**
 * Controller Layer for Email Templates
 */

export async function listTemplates(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const result = await emailTemplatesService.listTemplates(schoolId, req.query);
    return ApiResponse.success(res, result, 'Email templates retrieved successfully');
  } catch (err) {
    next(err);
  }
}

export async function getTemplateById(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const { id } = req.params;
    const template = await emailTemplatesService.getTemplateById(schoolId, id);
    return ApiResponse.success(res, template, 'Email template retrieved successfully');
  } catch (err) {
    next(err);
  }
}

export async function createCustomTemplate(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const actor = req.user || req.auth || {};
    const created = await emailTemplatesService.createCustomTemplate(schoolId, req.body, actor);
    return ApiResponse.success(res, created, 'Email template created successfully', HTTP_STATUS.CREATED);
  } catch (err) {
    next(err);
  }
}

export async function updateTemplate(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const { id } = req.params;
    const actor = req.user || req.auth || {};
    const updated = await emailTemplatesService.updateTemplate(schoolId, id, req.body, actor);
    return ApiResponse.success(res, updated, 'Email template updated successfully');
  } catch (err) {
    next(err);
  }
}

export async function resetTemplate(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const { id } = req.params;
    const actor = req.user || req.auth || {};
    const reset = await emailTemplatesService.resetTemplate(schoolId, id, actor);
    return ApiResponse.success(res, reset, 'Email template reset to defaults successfully');
  } catch (err) {
    next(err);
  }
}

export async function bulkUpdateTemplates(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const actor = req.user || req.auth || {};
    const result = await emailTemplatesService.bulkUpdateTemplates(schoolId, req.body, actor);
    return ApiResponse.success(res, result, 'Email templates updated successfully');
  } catch (err) {
    next(err);
  }
}

export async function deleteTemplate(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const { id } = req.params;
    const actor = req.user || req.auth || {};
    const result = await emailTemplatesService.deleteTemplate(schoolId, id, actor);
    return ApiResponse.success(res, result, 'Email template deleted successfully');
  } catch (err) {
    next(err);
  }
}
