import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as clientModule from '../client.js';
import {
  getStats,
  listTenants,
  createTenant,
  getTenantById,
  updateTenantStatus,
  updateTenantConfig,
  deleteTenant,
  listPlans,
  createPlan,
  updatePlan,
  deletePlan,
  getSubscriptions,
  getLicenseUsage,
  superadminApi
} from '../superadmin.js';

describe('SuperAdmin API Client Module', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Platform Overview & Statistics', () => {
    it('calls GET /api/v1/superadmin/stats', async () => {
      const mockStats = {
        success: true,
        data: {
          metrics: { totalSchools: 5, activeSchools: 4, totalStudents: 1200, totalStaff: 80, activeSubscriptions: 4 },
          recentSchools: []
        }
      };
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue(mockStats);

      const res = await getStats();

      expect(apiSpy).toHaveBeenCalledWith('/api/v1/superadmin/stats', { method: 'GET' });
      expect(res.data.metrics.totalSchools).toBe(5);
    });
  });

  describe('2. Tenant Management', () => {
    it('listTenants calls GET /api/v1/superadmin/tenants with query parameters', async () => {
      const mockTenants = {
        success: true,
        data: [{ id: 'school-1', name: 'Springfield Academy', status: 'approved' }],
        pagination: { total: 1, page: 1, limit: 10, totalPages: 1 }
      };
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue(mockTenants);

      const res = await listTenants({ status: 'approved', search: 'Springfield', page: 1, limit: 10 });

      expect(apiSpy).toHaveBeenCalledWith(
        '/api/v1/superadmin/tenants?status=approved&search=Springfield&page=1&limit=10',
        { method: 'GET' }
      );
      expect(res.data[0].name).toBe('Springfield Academy');
    });

    it('createTenant calls POST /api/v1/superadmin/tenants with payload', async () => {
      const payload = {
        name: 'New School',
        code: 'NEWSCH',
        email: 'admin@newschool.edu',
        adminEmail: 'principal@newschool.edu',
        adminPassword: 'Password123!'
      };
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { id: 'school-new', ...payload }
      });

      const res = await createTenant(payload);

      expect(apiSpy).toHaveBeenCalledWith('/api/v1/superadmin/tenants', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      expect(res.data.id).toBe('school-new');
    });

    it('getTenantById calls GET /api/v1/superadmin/tenants/:id', async () => {
      const mockTenant = { id: 'school-uuid-1', name: 'West High' };
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: mockTenant
      });

      const res = await getTenantById('school-uuid-1');

      expect(apiSpy).toHaveBeenCalledWith('/api/v1/superadmin/tenants/school-uuid-1', {
        method: 'GET'
      });
      expect(res.data.name).toBe('West High');
    });

    it('updateTenantStatus calls PATCH /api/v1/superadmin/tenants/:id/status', async () => {
      const payload = { status: 'suspended', reason: 'Billing overdue' };
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { id: 'school-1', ...payload }
      });

      const res = await updateTenantStatus('school-1', payload);

      expect(apiSpy).toHaveBeenCalledWith('/api/v1/superadmin/tenants/school-1/status', {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      expect(res.data.status).toBe('suspended');
    });

    it('updateTenantConfig calls PATCH /api/v1/superadmin/tenants/:id/config', async () => {
      const payload = { seatLimit: 1000, teacherLimit: 100 };
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { id: 'school-1', ...payload }
      });

      const res = await updateTenantConfig('school-1', payload);

      expect(apiSpy).toHaveBeenCalledWith('/api/v1/superadmin/tenants/school-1/config', {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      expect(res.data.seatLimit).toBe(1000);
    });

    it('deleteTenant calls DELETE /api/v1/superadmin/tenants/:id', async () => {
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: null
      });

      const res = await deleteTenant('school-1');

      expect(apiSpy).toHaveBeenCalledWith('/api/v1/superadmin/tenants/school-1', {
        method: 'DELETE'
      });
      expect(res.data).toBeNull();
    });
  });

  describe('3. Subscription Plans Management', () => {
    it('listPlans calls GET /api/v1/superadmin/plans', async () => {
      const mockPlans = {
        success: true,
        data: [{ id: 'plan-1', name: 'Standard Plan', userLimit: 500 }]
      };
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue(mockPlans);

      const res = await listPlans({ isActive: 'true', limit: 20 });

      expect(apiSpy).toHaveBeenCalledWith('/api/v1/superadmin/plans?isActive=true&limit=20', {
        method: 'GET'
      });
      expect(res.data).toHaveLength(1);
    });

    it('createPlan calls POST /api/v1/superadmin/plans with payload', async () => {
      const payload = {
        name: 'Enterprise Plan',
        userLimit: 2000,
        pricePerUserPerYear: 50,
        cloudStorageGB: 20
      };
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { id: 'plan-new', ...payload }
      });

      const res = await createPlan(payload);

      expect(apiSpy).toHaveBeenCalledWith('/api/v1/superadmin/plans', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      expect(res.data.id).toBe('plan-new');
    });

    it('updatePlan strictly uses PATCH (not PUT) /api/v1/superadmin/plans/:id', async () => {
      const payload = { pricePerUserPerYear: 60 };
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { id: 'plan-1', ...payload }
      });

      const res = await updatePlan('plan-1', payload);

      expect(apiSpy).toHaveBeenCalledWith('/api/v1/superadmin/plans/plan-1', {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      expect(res.data.pricePerUserPerYear).toBe(60);
    });

    it('deletePlan calls DELETE /api/v1/superadmin/plans/:id', async () => {
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: null
      });

      const res = await deletePlan('plan-1');

      expect(apiSpy).toHaveBeenCalledWith('/api/v1/superadmin/plans/plan-1', {
        method: 'DELETE'
      });
      expect(res.data).toBeNull();
    });
  });

  describe('4. Subscriptions Overview', () => {
    it('getSubscriptions calls GET /api/v1/superadmin/subscriptions', async () => {
      const mockSubscriptions = {
        success: true,
        data: [{ id: 'sub-1', schoolName: 'Springfield Academy', status: 'active' }]
      };
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue(mockSubscriptions);

      const res = await getSubscriptions({ status: 'approved', page: 1, limit: 10 });

      expect(apiSpy).toHaveBeenCalledWith(
        '/api/v1/superadmin/subscriptions?status=approved&page=1&limit=10',
        { method: 'GET' }
      );
      expect(res.data[0].status).toBe('active');
    });
  });

  describe('5. License & Quota Usage', () => {
    it('getLicenseUsage calls GET /api/v1/superadmin/license-usage (not /licenses)', async () => {
      const mockUsage = {
        success: true,
        data: [{ schoolId: 's-1', schoolName: 'Springfield', studentQuota: 500, studentsUsed: 350 }]
      };
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue(mockUsage);

      const res = await getLicenseUsage({ status: 'healthy', limit: 20 });

      expect(apiSpy).toHaveBeenCalledWith(
        '/api/v1/superadmin/license-usage?status=healthy&limit=20',
        { method: 'GET' }
      );
      expect(res.data[0].studentsUsed).toBe(350);
    });
  });

  describe('6. Client Object Integrity', () => {
    it('exports all methods on default superadminApi object', () => {
      expect(superadminApi.getStats).toBe(getStats);
      expect(superadminApi.listTenants).toBe(listTenants);
      expect(superadminApi.createTenant).toBe(createTenant);
      expect(superadminApi.getTenantById).toBe(getTenantById);
      expect(superadminApi.updateTenantStatus).toBe(updateTenantStatus);
      expect(superadminApi.updateTenantConfig).toBe(updateTenantConfig);
      expect(superadminApi.deleteTenant).toBe(deleteTenant);
      expect(superadminApi.listPlans).toBe(listPlans);
      expect(superadminApi.createPlan).toBe(createPlan);
      expect(superadminApi.updatePlan).toBe(updatePlan);
      expect(superadminApi.deletePlan).toBe(deletePlan);
      expect(superadminApi.getSubscriptions).toBe(getSubscriptions);
      expect(superadminApi.getLicenseUsage).toBe(getLicenseUsage);
    });
  });
});
