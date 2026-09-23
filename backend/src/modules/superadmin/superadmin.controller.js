import * as superAdminService from './superadmin.service.js';
import { ApiResponse } from '../../utils/api-response.js';
import { HTTP_STATUS } from '../../config/constants.js';

/**
 * SuperAdmin Platform Controller
 */

export const getStats = async (req, res, next) => {
  try {
    const stats = await superAdminService.getStats();
    return ApiResponse.success(res, stats, 'Platform statistics retrieved successfully');
  } catch (err) {
    next(err);
  }
};

export const listTenants = async (req, res, next) => {
  try {
    const result = await superAdminService.listTenants(req.query);
    return ApiResponse.paginated(res, result.tenants, result.pagination);
  } catch (err) {
    next(err);
  }
};

export const getTenantById = async (req, res, next) => {
  try {
    const tenant = await superAdminService.getTenantById(req.params.id);
    return ApiResponse.success(res, tenant, 'Tenant details retrieved successfully');
  } catch (err) {
    next(err);
  }
};

export const createTenant = async (req, res, next) => {
  try {
    const actor = req.auth || req.user || {};
    const created = await superAdminService.createTenant(req.body, actor);
    return ApiResponse.success(res, created, 'Tenant school provisioned successfully', HTTP_STATUS.CREATED);
  } catch (err) {
    next(err);
  }
};

export const updateTenantStatus = async (req, res, next) => {
  try {
    const actor = req.auth || req.user || {};
    const updated = await superAdminService.updateTenantStatus(req.params.id, req.body, actor);
    return ApiResponse.success(res, updated, 'Tenant status updated successfully');
  } catch (err) {
    next(err);
  }
};

export const updateTenantConfig = async (req, res, next) => {
  try {
    const actor = req.auth || req.user || {};
    const updated = await superAdminService.updateTenantConfig(req.params.id, req.body, actor);
    return ApiResponse.success(res, updated, 'Tenant configuration updated successfully');
  } catch (err) {
    next(err);
  }
};

export const deleteTenant = async (req, res, next) => {
  try {
    const actor = req.auth || req.user || {};
    const result = await superAdminService.deleteTenant(req.params.id, actor);
    return ApiResponse.success(res, result, 'Tenant deleted successfully');
  } catch (err) {
    next(err);
  }
};

export const listPlans = async (req, res, next) => {
  try {
    const result = await superAdminService.listPlans(req.query);
    return ApiResponse.paginated(res, result.plans, result.pagination);
  } catch (err) {
    next(err);
  }
};

export const createPlan = async (req, res, next) => {
  try {
    const actor = req.auth || req.user || {};
    const created = await superAdminService.createPlan(req.body, actor);
    return ApiResponse.success(res, created, 'Subscription plan created successfully', HTTP_STATUS.CREATED);
  } catch (err) {
    next(err);
  }
};

export const updatePlan = async (req, res, next) => {
  try {
    const actor = req.auth || req.user || {};
    const updated = await superAdminService.updatePlan(req.params.id, req.body, actor);
    return ApiResponse.success(res, updated, 'Subscription plan updated successfully');
  } catch (err) {
    next(err);
  }
};

export const deletePlan = async (req, res, next) => {
  try {
    const actor = req.auth || req.user || {};
    const result = await superAdminService.deletePlan(req.params.id, actor);
    return ApiResponse.success(res, result, 'Subscription plan deleted or deactivated successfully');
  } catch (err) {
    next(err);
  }
};

export const getSubscriptions = async (req, res, next) => {
  try {
    const result = await superAdminService.getSubscriptions(req.query);
    return ApiResponse.paginated(res, result.subscriptions, result.pagination);
  } catch (err) {
    next(err);
  }
};

export const getLicenseUsage = async (req, res, next) => {
  try {
    const result = await superAdminService.getLicenseUsage(req.query);
    return ApiResponse.paginated(res, result.licenses, result.pagination);
  } catch (err) {
    next(err);
  }
};
