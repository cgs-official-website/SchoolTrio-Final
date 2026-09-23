import * as settingsService from './settings.service.js';
import { ApiResponse } from '../../utils/api-response.js';
import { HTTP_STATUS } from '../../config/constants.js';

/**
 * Settings Controller Layer
 * Handles incoming Express HTTP requests and dispatches to settings service.
 */

export async function getSchoolSettings(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const data = await settingsService.getSchoolSettings(schoolId);
    return ApiResponse.success(res, data, 'School settings retrieved successfully');
  } catch (err) {
    next(err);
  }
}

export async function updateSchoolSettings(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const actor = req.auth || req.user || {};
    const data = await settingsService.updateSchoolSettings(schoolId, req.body, actor);
    return ApiResponse.success(res, data, 'School settings updated successfully');
  } catch (err) {
    next(err);
  }
}

export async function getIntegrationsSettings(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const data = await settingsService.getIntegrationsSettings(schoolId);
    return ApiResponse.success(res, data, 'Integration settings retrieved successfully');
  } catch (err) {
    next(err);
  }
}

export async function updateIntegrationsSettings(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const actor = req.auth || req.user || {};
    const data = await settingsService.updateIntegrationsSettings(schoolId, req.body, actor);
    return ApiResponse.success(res, data, 'Integration settings updated successfully');
  } catch (err) {
    next(err);
  }
}

export async function getSidebarSettings(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const data = await settingsService.getSidebarSettings(schoolId);
    return ApiResponse.success(res, data, 'Sidebar configuration retrieved successfully');
  } catch (err) {
    next(err);
  }
}

export async function updateSidebarSettings(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const actor = req.auth || req.user || {};
    const data = await settingsService.updateSidebarSettings(schoolId, req.body.order, actor);
    return ApiResponse.success(res, data, 'Sidebar configuration updated successfully');
  } catch (err) {
    next(err);
  }
}

export async function getPublicSchoolMeta(req, res, next) {
  try {
    const { schoolId } = req.params;
    const data = await settingsService.getPublicSchoolMeta(schoolId);
    return ApiResponse.success(res, data, 'School public metadata retrieved successfully');
  } catch (err) {
    next(err);
  }
}
