/**
 * src/api/billing.js
 *
 * Centralized Tenant Billing & Subscription Plans API client.
 * Connects frontend components to the PostgreSQL REST backend:
 * - Available subscription plans (GET /api/v1/billing/plans)
 * - Current tenant subscription & usage details (GET /api/v1/billing/current)
 * - Subscription plan upgrade & billing cycle switch (PATCH /api/v1/billing/upgrade)
 * - Public subscription plans (GET /api/v1/public/plans)
 */

import { apiClient } from './client.js';

/**
 * Fetches all available active subscription plans for the authenticated tenant.
 * Calls GET /api/v1/billing/plans.
 *
 * @returns {Promise<{ success: boolean, data: Array<Object> }>}
 */
export async function getPlans() {
  return apiClient('/api/v1/billing/plans', {
    method: 'GET'
  });
}

/**
 * Fetches active subscription plans for public display.
 * Calls GET /api/v1/public/plans.
 *
 * @returns {Promise<{ success: boolean, data: Array<Object> }>}
 */
export async function getPublicPlans() {
  return apiClient('/api/v1/public/plans', {
    method: 'GET'
  });
}

/**
 * Fetches current tenant subscription, plan details, usage metrics, and derived total.
 * Calls GET /api/v1/billing/current.
 *
 * @returns {Promise<{ success: boolean, data: Object }>}
 */
export async function getCurrentBilling() {
  return apiClient('/api/v1/billing/current', {
    method: 'GET'
  });
}

/**
 * Upgrades or modifies the tenant's subscription plan and billing cycle.
 * Calls PATCH /api/v1/billing/upgrade.
 *
 * @param {Object} payload - { planId: string, billingCycle?: 'monthly' | 'yearly' }
 * @returns {Promise<{ success: boolean, data: Object }>}
 */
export async function upgradePlan(payload = {}) {
  return apiClient('/api/v1/billing/upgrade', {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}
