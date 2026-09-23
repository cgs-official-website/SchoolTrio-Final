import * as billingRepository from './billing.repository.js';
import { createAuditLog } from '../audit/audit.repository.js';
import {
  NotFoundError,
  ValidationError
} from '../../utils/app-error.js';

/**
 * Tenant Billing Service Layer
 * Authoritative business logic for subscription plans, current tenant billing status, usage metrics, and plan upgrades.
 */

/**
 * List all active subscription plans available for tenant selection.
 * @returns {Promise<Array<Object>>}
 */
export async function getPlans() {
  const plans = await billingRepository.findActivePlans();
  return plans.map(plan => ({
    id: plan.id,
    name: plan.name,
    userLimit: plan.userLimit,
    pricePerUserPerYear: Number(plan.pricePerUserPerYear),
    cloudStorageGB: plan.cloudStorageGB,
    modules: plan.modules,
    isActive: plan.isActive,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt
  }));
}

/**
 * List active subscription plans for public landing page display.
 * @returns {Promise<Array<Object>>}
 */
export async function getPublicPlans() {
  const plans = await billingRepository.findActivePlans();
  return plans.map(plan => ({
    id: plan.id,
    name: plan.name,
    userLimit: plan.userLimit,
    pricePerUserPerYear: Number(plan.pricePerUserPerYear),
    cloudStorageGB: plan.cloudStorageGB,
    modules: plan.modules,
    isActive: plan.isActive
  }));
}

/**
 * Retrieve the current billing & subscription details for a tenant.
 * @param {string} schoolId - Tenant UUID
 * @returns {Promise<Object>}
 */
export async function getCurrentBilling(schoolId) {
  if (!schoolId) {
    throw new ValidationError('Tenant context (schoolId) is required');
  }

  const school = await billingRepository.findSchoolBillingInfo(schoolId);
  if (!school) {
    throw new NotFoundError('School not found');
  }

  const [billingSetting, usageCounts] = await Promise.all([
    billingRepository.findBillingSetting(schoolId),
    billingRepository.getTenantUsageCounts(schoolId)
  ]);

  const plan = school.plan ? {
    id: school.plan.id,
    name: school.plan.name,
    userLimit: school.plan.userLimit,
    pricePerUserPerYear: Number(school.plan.pricePerUserPerYear),
    cloudStorageGB: school.plan.cloudStorageGB,
    modules: school.plan.modules,
    isActive: school.plan.isActive
  } : null;

  const billingData = (billingSetting?.data && typeof billingSetting.data === 'object') ? billingSetting.data : {};
  const billingCycle = billingData.billingCycle || 'monthly';
  const subscriptionStatus = billingData.subscriptionStatus || (school.status === 'approved' ? 'active' : school.status);

  // Authoritative server-derived cost based strictly on SubscriptionPlan.pricePerUserPerYear
  const pricePerYear = plan ? Number(plan.pricePerUserPerYear) : 0;
  const pricePerMonth = Math.round(pricePerYear / 12);
  const calculatedTotalAmount = billingCycle === 'yearly' ? pricePerYear : pricePerMonth;

  return {
    schoolId: school.id,
    schoolName: school.name,
    schoolStatus: school.status,
    plan,
    billingCycle,
    subscriptionStatus,
    calculatedTotalAmount,
    usage: {
      students: usageCounts.studentsCount,
      staff: usageCounts.staffCount,
      seatLimit: school.seatLimit,
      teacherLimit: school.teacherLimit,
      userLimit: plan?.userLimit ?? null,
      cloudStorageGB: plan?.cloudStorageGB ?? null
    }
  };
}

/**
 * Upgrade or change a tenant's subscription plan and billing cycle.
 * Executes atomically in a transaction and creates an audit log.
 * @param {string} schoolId - Tenant UUID
 * @param {Object} user - Authenticated user context
 * @param {Object} payload - Validated request body
 * @param {string} payload.planId - Target plan UUID
 * @param {string} [payload.billingCycle] - 'monthly' | 'yearly'
 * @returns {Promise<Object>}
 */
export async function upgradePlan(schoolId, user, payload) {
  if (!schoolId) {
    throw new ValidationError('Tenant context (schoolId) is required');
  }

  const { planId, billingCycle = 'monthly' } = payload;

  const targetPlan = await billingRepository.findPlanById(planId);
  if (!targetPlan) {
    throw new NotFoundError(`Subscription plan not found with ID: ${planId}`);
  }

  if (!targetPlan.isActive) {
    throw new ValidationError('Cannot select an inactive subscription plan');
  }

  const currentSchool = await billingRepository.findSchoolBillingInfo(schoolId);
  if (!currentSchool) {
    throw new NotFoundError('School not found');
  }

  const currentSetting = await billingRepository.findBillingSetting(schoolId);
  const currentBillingData = (currentSetting?.data && typeof currentSetting.data === 'object') ? currentSetting.data : {};

  // Execute atomic update
  await billingRepository.executeTransaction(async (tx) => {
    // 1. Update School.planId
    await billingRepository.updateSchoolPlan(schoolId, targetPlan.id, tx);

    // 2. Upsert SchoolSetting(category='billing')
    const updatedBillingData = {
      billingCycle,
      subscriptionStatus: 'active',
      lastUpgradedAt: new Date().toISOString()
    };
    await billingRepository.upsertBillingSetting(schoolId, updatedBillingData, tx);

    // 3. Create AuditLog entry
    await createAuditLog({
      schoolId,
      entityType: 'SubscriptionPlan',
      entityId: targetPlan.id,
      actionPerformed: `Changed subscription plan to ${targetPlan.name} (${billingCycle})`,
      userName: user?.name || user?.email || 'Administrator',
      userRole: user?.role || user?.systemRole || 'SCHOOL_ADMIN',
      modifiedFields: {
        previousPlanId: currentSchool.planId,
        newPlanId: targetPlan.id,
        previousPlanName: currentSchool.plan?.name || null,
        newPlanName: targetPlan.name,
        previousBillingCycle: currentBillingData.billingCycle || null,
        newBillingCycle: billingCycle
      }
    }, tx);
  });

  // Return updated current billing snapshot
  return getCurrentBilling(schoolId);
}
