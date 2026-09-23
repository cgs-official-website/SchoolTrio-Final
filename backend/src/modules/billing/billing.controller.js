import * as billingService from './billing.service.js';
import { ApiResponse } from '../../utils/api-response.js';

/**
 * Tenant Billing Controller Layer
 * Handles incoming HTTP requests for plans, tenant current billing, and plan upgrades.
 */

export async function getPlans(_req, res, next) {
  try {
    const plans = await billingService.getPlans();
    return ApiResponse.success(res, plans, 'Subscription plans retrieved successfully');
  } catch (error) {
    return next(error);
  }
}

export async function getPublicPlans(_req, res, next) {
  try {
    const plans = await billingService.getPublicPlans();
    return ApiResponse.success(res, plans, 'Public subscription plans retrieved successfully');
  } catch (error) {
    return next(error);
  }
}

export async function getCurrentBilling(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const currentBilling = await billingService.getCurrentBilling(schoolId);
    return ApiResponse.success(res, currentBilling, 'Current tenant billing details retrieved successfully');
  } catch (error) {
    return next(error);
  }
}

export async function upgradePlan(req, res, next) {
  try {
    const schoolId = req.tenant.schoolId;
    const updatedBilling = await billingService.upgradePlan(schoolId, req.user, req.body);
    return ApiResponse.success(res, updatedBilling, 'Subscription plan changed successfully');
  } catch (error) {
    return next(error);
  }
}
