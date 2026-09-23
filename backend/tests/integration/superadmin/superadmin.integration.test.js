import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/app.js';
import * as authRepository from '../../../src/modules/auth/auth.repository.js';
import * as tokenService from '../../../src/modules/auth/token.service.js';
import * as superAdminRepository from '../../../src/modules/superadmin/superadmin.repository.js';
import * as auditRepository from '../../../src/modules/audit/audit.repository.js';
import { SYSTEM_ROLES } from '../../../src/config/constants.js';

vi.mock('../../../src/modules/auth/password.service.js', () => ({
  hashPassword: vi.fn().mockResolvedValue('argon2id$hashed_pass')
}));

vi.mock('../../../src/database/prisma.client.js', () => ({
  prisma: {
    $transaction: vi.fn(async (cb) => cb({}))
  },
  runWithTenantContext: (_context, fn) => fn(),
  getTenantContext: () => ({ bypassTenant: true })
}));

describe('SuperAdmin Platform Integration Tests', () => {
  const app = createApp();

  const mockSuperAdminUser = {
    id: '00000000-0000-4000-8000-000000000001',
    schoolId: null,
    email: 'superadmin@platform.com',
    systemRole: SYSTEM_ROLES.SUPER_ADMIN,
    tokenVersion: 1,
    isActive: true,
    school: null
  };

  const getSuperAdminToken = () => {
    return tokenService.issueAccessToken({
      sub: mockSuperAdminUser.id,
      schoolId: mockSuperAdminUser.schoolId,
      systemRole: mockSuperAdminUser.systemRole,
      tokenVersion: mockSuperAdminUser.tokenVersion
    });
  };

  const mockSchoolId = '11111111-1111-4111-8111-111111111111';
  const mockPlanId = '22222222-2222-4222-8222-222222222222';

  const mockSchool = {
    id: mockSchoolId,
    name: 'Springfield Academy',
    code: 'SPRINGFIELD',
    type: 'K12',
    status: 'approved',
    email: 'contact@springfield.edu',
    phone: '1234567890',
    address: '123 Test St',
    seatLimit: 500,
    teacherLimit: 50,
    plan: {
      id: mockPlanId,
      name: 'Standard Tier',
      userLimit: 500,
      pricePerUserPerYear: 1000
    },
    _count: {
      students: 400,
      staffProfiles: 35,
      users: 450
    },
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z')
  };

  const mockPlan = {
    id: mockPlanId,
    name: 'Standard Tier',
    userLimit: 500,
    pricePerUserPerYear: 1000,
    cloudStorageGB: 10,
    modules: { attendance: true },
    isActive: true,
    _count: { schools: 2 },
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z')
  };

  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(authRepository, 'findUserById').mockImplementation(async (id) => {
      if (id === mockSuperAdminUser.id) return mockSuperAdminUser;
      return null;
    });
  });

  describe('1. GET /api/v1/superadmin/stats', () => {
    it('returns platform KPI statistics', async () => {
      const token = getSuperAdminToken();
      vi.spyOn(superAdminRepository, 'getPlatformStats').mockResolvedValue({
        totalSchools: 5,
        activeSchools: 4,
        pendingSchools: 1,
        suspendedSchools: 0,
        rejectedSchools: 0,
        totalUsers: 1500,
        totalStudents: 1200,
        totalStaff: 120,
        estimatedMRR: 35000
      });

      const res = await request(app)
        .get('/api/v1/superadmin/stats')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.totalSchools).toBe(5);
      expect(res.body.data.estimatedMRR).toBe(35000);
    });
  });

  describe('2. GET /api/v1/superadmin/tenants', () => {
    it('returns paginated tenant list', async () => {
      const token = getSuperAdminToken();
      vi.spyOn(superAdminRepository, 'findTenants').mockResolvedValue([mockSchool]);
      vi.spyOn(superAdminRepository, 'countTenants').mockResolvedValue(1);

      const res = await request(app)
        .get('/api/v1/superadmin/tenants?page=1&limit=20')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].code).toBe('SPRINGFIELD');
      expect(res.body.pagination.total).toBe(1);
    });
  });

  describe('3. GET /api/v1/superadmin/tenants/:id', () => {
    it('returns tenant details by ID', async () => {
      const token = getSuperAdminToken();
      vi.spyOn(superAdminRepository, 'findTenantById').mockResolvedValue({
        ...mockSchool,
        settings: [],
        users: [{ id: 'admin-1', email: 'admin@springfield.edu', createdAt: new Date() }]
      });

      const res = await request(app)
        .get(`/api/v1/superadmin/tenants/${mockSchoolId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Springfield Academy');
    });

    it('returns 404 for non-existent tenant', async () => {
      const token = getSuperAdminToken();
      vi.spyOn(superAdminRepository, 'findTenantById').mockResolvedValue(null);

      const res = await request(app)
        .get(`/api/v1/superadmin/tenants/${mockSchoolId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });
  });

  describe('4. POST /api/v1/superadmin/tenants (Provisioning)', () => {
    it('successfully provisions new tenant with initial admin', async () => {
      const token = getSuperAdminToken();
      vi.spyOn(superAdminRepository, 'findSchoolByCodeOrEmail').mockResolvedValue(null);
      vi.spyOn(superAdminRepository, 'createTenantWithAdmin').mockResolvedValue({
        school: mockSchool,
        adminUser: { id: 'admin-1', email: 'admin@new.edu' }
      });
      vi.spyOn(auditRepository, 'createAuditLog').mockResolvedValue({});

      const res = await request(app)
        .post('/api/v1/superadmin/tenants')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Springfield Academy',
          code: 'SPRINGFIELD',
          email: 'contact@springfield.edu',
          adminEmail: 'admin@new.edu',
          adminPassword: 'Password123!',
          seatLimit: 500,
          teacherLimit: 50
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.code).toBe('SPRINGFIELD');
    });
  });

  describe('5. PATCH /api/v1/superadmin/tenants/:id/status', () => {
    it('updates tenant status and returns updated school', async () => {
      const token = getSuperAdminToken();
      vi.spyOn(superAdminRepository, 'findTenantById').mockResolvedValue(mockSchool);
      vi.spyOn(superAdminRepository, 'updateTenantStatus').mockResolvedValue({
        ...mockSchool,
        status: 'suspended'
      });
      vi.spyOn(auditRepository, 'createAuditLog').mockResolvedValue({});

      const res = await request(app)
        .patch(`/api/v1/superadmin/tenants/${mockSchoolId}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'suspended', reason: 'Review pending' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('suspended');
    });
  });

  describe('6. PATCH /api/v1/superadmin/tenants/:id/config', () => {
    it('updates quotas and modules configuration', async () => {
      const token = getSuperAdminToken();
      vi.spyOn(superAdminRepository, 'findTenantById').mockResolvedValue(mockSchool);
      vi.spyOn(superAdminRepository, 'updateTenantConfig').mockResolvedValue({
        ...mockSchool,
        seatLimit: 1000
      });
      vi.spyOn(auditRepository, 'createAuditLog').mockResolvedValue({});

      const res = await request(app)
        .patch(`/api/v1/superadmin/tenants/${mockSchoolId}/config`)
        .set('Authorization', `Bearer ${token}`)
        .send({ seatLimit: 1000 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.seatLimit).toBe(1000);
    });
  });

  describe('7. DELETE /api/v1/superadmin/tenants/:id', () => {
    it('deletes tenant safely', async () => {
      const token = getSuperAdminToken();
      vi.spyOn(superAdminRepository, 'findTenantById').mockResolvedValue(mockSchool);
      vi.spyOn(superAdminRepository, 'deleteTenant').mockResolvedValue(mockSchool);
      vi.spyOn(auditRepository, 'createAuditLog').mockResolvedValue({});

      const res = await request(app)
        .delete(`/api/v1/superadmin/tenants/${mockSchoolId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toContain('successfully deleted');
    });
  });

  describe('8. GET /api/v1/superadmin/plans', () => {
    it('returns subscription plans list', async () => {
      const token = getSuperAdminToken();
      vi.spyOn(superAdminRepository, 'findPlans').mockResolvedValue([mockPlan]);
      vi.spyOn(superAdminRepository, 'countPlans').mockResolvedValue(1);

      const res = await request(app)
        .get('/api/v1/superadmin/plans')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data[0].name).toBe('Standard Tier');
    });
  });

  describe('9. POST /api/v1/superadmin/plans', () => {
    it('creates new subscription plan', async () => {
      const token = getSuperAdminToken();
      vi.spyOn(superAdminRepository, 'findPlanByName').mockResolvedValue(null);
      vi.spyOn(superAdminRepository, 'createPlan').mockResolvedValue(mockPlan);

      const res = await request(app)
        .post('/api/v1/superadmin/plans')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Standard Tier',
          userLimit: 500,
          pricePerUserPerYear: 1000,
          cloudStorageGB: 10
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Standard Tier');
    });
  });

  describe('10. PATCH /api/v1/superadmin/plans/:id', () => {
    it('updates subscription plan', async () => {
      const token = getSuperAdminToken();
      vi.spyOn(superAdminRepository, 'findPlanById').mockResolvedValue(mockPlan);
      vi.spyOn(superAdminRepository, 'updatePlan').mockResolvedValue({
        ...mockPlan,
        pricePerUserPerYear: 1500
      });

      const res = await request(app)
        .patch(`/api/v1/superadmin/plans/${mockPlanId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ pricePerUserPerYear: 1500 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.pricePerUserPerYear).toBe(1500);
    });
  });

  describe('11. DELETE /api/v1/superadmin/plans/:id', () => {
    it('deactivates plan if assigned to existing schools', async () => {
      const token = getSuperAdminToken();
      vi.spyOn(superAdminRepository, 'findPlanById').mockResolvedValue(mockPlan);
      vi.spyOn(superAdminRepository, 'countSchoolsWithPlan').mockResolvedValue(2);
      vi.spyOn(superAdminRepository, 'updatePlan').mockResolvedValue({ ...mockPlan, isActive: false });

      const res = await request(app)
        .delete(`/api/v1/superadmin/plans/${mockPlanId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toContain('deactivated rather than deleted');
    });
  });

  describe('12. GET /api/v1/superadmin/subscriptions', () => {
    it('returns subscription overview for all tenants', async () => {
      const token = getSuperAdminToken();
      vi.spyOn(superAdminRepository, 'findTenants').mockResolvedValue([mockSchool]);
      vi.spyOn(superAdminRepository, 'countTenants').mockResolvedValue(1);

      const res = await request(app)
        .get('/api/v1/superadmin/subscriptions')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data[0].schoolCode).toBe('SPRINGFIELD');
      expect(res.body.data[0].plan.pricePerYear).toBe(1000);
    });
  });

  describe('13. GET /api/v1/superadmin/license-usage', () => {
    it('returns license and quota metrics for tenants', async () => {
      const token = getSuperAdminToken();
      vi.spyOn(superAdminRepository, 'findTenants').mockResolvedValue([mockSchool]);
      vi.spyOn(superAdminRepository, 'countTenants').mockResolvedValue(1);

      const res = await request(app)
        .get('/api/v1/superadmin/license-usage')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data[0].students.current).toBe(400);
      expect(res.body.data[0].students.limit).toBe(500);
      expect(res.body.data[0].students.usagePercentage).toBe(80);
      expect(res.body.data[0].status).toBe('healthy');
    });
  });
});
