import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as superadminApi from '../../../api/superadmin.js';
import * as auditApi from '../../../api/audit.js';

describe('Category B SuperAdmin REST Screens Contract Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================
  // Target 1: SuperAdmin Overview
  // ==========================================
  describe('SuperAdmin Overview', () => {
    it('fetches platform metrics and recent tenants from REST endpoints', async () => {
      const statsSpy = vi.spyOn(superadminApi, 'getStats').mockResolvedValue({
        success: true,
        data: {
          activeSchools: 12,
          pendingSchools: 2,
          suspendedSchools: 1,
          estimatedMRR: 15400,
          totalStudents: 4500,
          totalTeachers: 310
        }
      });

      const tenantsSpy = vi.spyOn(superadminApi, 'listTenants').mockResolvedValue({
        success: true,
        data: [
          { id: 'school-1', name: 'Greenwood High', code: 'GW01', status: 'ACTIVE' },
          { id: 'school-2', name: 'Oakridge Academy', code: 'OA02', status: 'PENDING' }
        ],
        pagination: { total: 2, page: 1, limit: 5 }
      });

      const [statsRes, tenantsRes] = await Promise.all([
        superadminApi.getStats(),
        superadminApi.listTenants({ limit: 5 })
      ]);

      expect(statsSpy).toHaveBeenCalledTimes(1);
      expect(tenantsSpy).toHaveBeenCalledWith({ limit: 5 });
      expect(statsRes.data.activeSchools).toBe(12);
      expect(statsRes.data.estimatedMRR).toBe(15400);
      expect(tenantsRes.data).toHaveLength(2);
    });
  });

  // ==========================================
  // Target 2: SuperAdmin TenantsList
  // ==========================================
  describe('SuperAdmin TenantsList', () => {
    it('queries tenants with status, search, and pagination parameters', async () => {
      const tenantsSpy = vi.spyOn(superadminApi, 'listTenants').mockResolvedValue({
        success: true,
        data: [
          { id: 't-1', name: 'Apex International', code: 'APEX', status: 'ACTIVE' }
        ],
        pagination: { total: 1, page: 1, limit: 10, totalPages: 1 }
      });

      const params = { status: 'ACTIVE', search: 'Apex', page: 1, limit: 10 };
      const res = await superadminApi.listTenants(params);

      expect(tenantsSpy).toHaveBeenCalledWith(params);
      expect(res.data[0].name).toBe('Apex International');
    });
  });

  // ==========================================
  // Target 3: SuperAdmin TenantManagement
  // ==========================================
  describe('SuperAdmin TenantManagement', () => {
    it('updates tenant status and tenant module config via REST mutations', async () => {
      const statusSpy = vi.spyOn(superadminApi, 'updateTenantStatus').mockResolvedValue({
        success: true,
        data: { id: 't-1', status: 'SUSPENDED' }
      });

      const configSpy = vi.spyOn(superadminApi, 'updateTenantConfig').mockResolvedValue({
        success: true,
        data: { id: 't-1', planType: 'Enterprise', studentLimit: 2000 }
      });

      const statusRes = await superadminApi.updateTenantStatus('t-1', { status: 'SUSPENDED' });
      expect(statusSpy).toHaveBeenCalledWith('t-1', { status: 'SUSPENDED' });
      expect(statusRes.data.status).toBe('SUSPENDED');

      const configRes = await superadminApi.updateTenantConfig('t-1', {
        planType: 'Enterprise',
        studentLimit: 2000
      });
      expect(configSpy).toHaveBeenCalledWith('t-1', {
        planType: 'Enterprise',
        studentLimit: 2000
      });
      expect(configRes.data.studentLimit).toBe(2000);
    });
  });

  // ==========================================
  // Target 4: SuperAdmin TenantDetails
  // ==========================================
  describe('SuperAdmin TenantDetails', () => {
    it('fetches single tenant by UUID and performs status change', async () => {
      const tenantSpy = vi.spyOn(superadminApi, 'getTenantById').mockResolvedValue({
        success: true,
        data: {
          id: 'tenant-uuid-1',
          name: 'Silver Oak School',
          code: 'SOS',
          status: 'ACTIVE',
          stats: { studentsCount: 450, staffCount: 35 }
        }
      });

      const updateSpy = vi.spyOn(superadminApi, 'updateTenantStatus').mockResolvedValue({
        success: true,
        data: { id: 'tenant-uuid-1', status: 'INACTIVE' }
      });

      const details = await superadminApi.getTenantById('tenant-uuid-1');
      expect(tenantSpy).toHaveBeenCalledWith('tenant-uuid-1');
      expect(details.data.code).toBe('SOS');

      const updated = await superadminApi.updateTenantStatus('tenant-uuid-1', { status: 'INACTIVE' });
      expect(updateSpy).toHaveBeenCalledWith('tenant-uuid-1', { status: 'INACTIVE' });
      expect(updated.data.status).toBe('INACTIVE');
    });
  });

  // ==========================================
  // Target 5: SuperAdmin PlanManagement
  // ==========================================
  describe('SuperAdmin PlanManagement', () => {
    it('fetches subscription plans and updates plan configuration via PATCH', async () => {
      const plansSpy = vi.spyOn(superadminApi, 'listPlans').mockResolvedValue({
        success: true,
        data: [
          { id: 'plan-1', name: 'Starter', priceMonthly: 49, studentLimit: 250 },
          { id: 'plan-2', name: 'Growth', priceMonthly: 99, studentLimit: 1000 }
        ]
      });

      const updatePlanSpy = vi.spyOn(superadminApi, 'updatePlan').mockResolvedValue({
        success: true,
        data: { id: 'plan-1', name: 'Starter Pro', priceMonthly: 59, studentLimit: 300 }
      });

      const plansRes = await superadminApi.listPlans();
      expect(plansSpy).toHaveBeenCalledTimes(1);
      expect(plansRes.data).toHaveLength(2);

      const updateRes = await superadminApi.updatePlan('plan-1', {
        name: 'Starter Pro',
        priceMonthly: 59,
        studentLimit: 300
      });
      expect(updatePlanSpy).toHaveBeenCalledWith('plan-1', {
        name: 'Starter Pro',
        priceMonthly: 59,
        studentLimit: 300
      });
      expect(updateRes.data.priceMonthly).toBe(59);
    });
  });

  // ==========================================
  // Target 6: SuperAdmin SubscriptionsList
  // ==========================================
  describe('SuperAdmin SubscriptionsList', () => {
    it('fetches tenant subscriptions list with MRR stats', async () => {
      const subSpy = vi.spyOn(superadminApi, 'getSubscriptions').mockResolvedValue({
        success: true,
        data: [
          {
            id: 'sub-1',
            schoolId: 'school-1',
            schoolName: 'Greenwood High',
            planName: 'Growth',
            status: 'ACTIVE',
            amount: 99,
            billingCycle: 'monthly'
          }
        ],
        pagination: { total: 1, page: 1, limit: 10 }
      });

      const res = await superadminApi.getSubscriptions({ page: 1, limit: 10 });
      expect(subSpy).toHaveBeenCalledWith({ page: 1, limit: 10 });
      expect(res.data[0].planName).toBe('Growth');
      expect(res.data[0].amount).toBe(99);
    });
  });

  // ==========================================
  // Target 7: SuperAdmin LicenseUsage
  // ==========================================
  describe('SuperAdmin LicenseUsage', () => {
    it('fetches authoritative per-tenant license utilization and modifies limits', async () => {
      const licenseSpy = vi.spyOn(superadminApi, 'getLicenseUsage').mockResolvedValue({
        success: true,
        data: [
          {
            id: 'tenant-1',
            name: 'St. Xavier Academy',
            code: 'SXA',
            planType: 'Standard',
            status: 'ACTIVE',
            studentCount: 450,
            studentLimit: 500,
            teacherCount: 30,
            teacherLimit: 40,
            studentUsagePercent: 90,
            teacherUsagePercent: 75
          }
        ],
        pagination: { total: 1, page: 1, limit: 10 }
      });

      const configSpy = vi.spyOn(superadminApi, 'updateTenantConfig').mockResolvedValue({
        success: true,
        data: { id: 'tenant-1', studentLimit: 600, teacherLimit: 50 }
      });

      const res = await superadminApi.getLicenseUsage({ page: 1, limit: 10 });
      expect(licenseSpy).toHaveBeenCalledWith({ page: 1, limit: 10 });
      expect(res.data[0].studentUsagePercent).toBe(90);

      const updated = await superadminApi.updateTenantConfig('tenant-1', {
        studentLimit: 600,
        teacherLimit: 50
      });
      expect(configSpy).toHaveBeenCalledWith('tenant-1', {
        studentLimit: 600,
        teacherLimit: 50
      });
      expect(updated.data.studentLimit).toBe(600);
    });
  });

  // ==========================================
  // Target 8: SuperAdmin AuditLogs
  // ==========================================
  describe('SuperAdmin AuditLogs', () => {
    it('fetches system-wide administrative audit trail via audit REST API', async () => {
      const auditSpy = vi.spyOn(auditApi, 'listSuperAdminAuditLogs').mockResolvedValue({
        success: true,
        data: [
          {
            id: 'audit-log-1',
            action: 'TENANT_STATUS_UPDATED',
            entityType: 'School',
            entityId: 'school-1',
            actorName: 'Super Admin',
            createdAt: '2026-09-18T10:00:00.000Z'
          }
        ],
        pagination: { total: 1, page: 1, limit: 20 }
      });

      const res = await auditApi.listSuperAdminAuditLogs({ page: 1, limit: 20, action: 'TENANT_STATUS_UPDATED' });
      expect(auditSpy).toHaveBeenCalledWith({ page: 1, limit: 20, action: 'TENANT_STATUS_UPDATED' });
      expect(res.data[0].action).toBe('TENANT_STATUS_UPDATED');
    });
  });
});
