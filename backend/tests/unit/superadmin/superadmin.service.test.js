import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as superAdminService from '../../../src/modules/superadmin/superadmin.service.js';
import * as superAdminRepository from '../../../src/modules/superadmin/superadmin.repository.js';
import * as auditRepository from '../../../src/modules/audit/audit.repository.js';
import { NotFoundError, ConflictError } from '../../../src/utils/app-error.js';

vi.mock('../../../src/modules/superadmin/superadmin.repository.js');
vi.mock('../../../src/modules/audit/audit.repository.js');
vi.mock('../../../src/modules/auth/password.service.js', () => ({
  hashPassword: vi.fn().mockResolvedValue('argon2id$hashed_password')
}));
vi.mock('../../../src/database/prisma.client.js', () => ({
  prisma: {
    $transaction: vi.fn(async (cb) => cb({}))
  }
}));

describe('SuperAdmin Service Unit Tests', () => {
  const actor = {
    userId: '00000000-0000-4000-8000-000000000001',
    email: 'superadmin@system.local',
    systemRole: 'SUPER_ADMIN'
  };

  const mockSchool = {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Springfield High',
    code: 'SPFLD',
    type: 'K12',
    status: 'approved',
    email: 'contact@spfield.edu',
    phone: '1234567890',
    address: '123 Fake Street',
    seatLimit: 500,
    teacherLimit: 50,
    plan: {
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Pro Tier',
      userLimit: 1000,
      pricePerUserPerYear: 1200
    },
    _count: {
      students: 450,
      staffProfiles: 30,
      users: 500
    },
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z')
  };

  const mockPlan = {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Pro Tier',
    userLimit: 1000,
    pricePerUserPerYear: 1200,
    cloudStorageGB: 20,
    modules: { attendance: true, fees: true },
    isActive: true,
    _count: { schools: 5 },
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z')
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getStats()', () => {
    it('returns aggregated platform statistics', async () => {
      const stats = {
        totalSchools: 10,
        activeSchools: 8,
        pendingSchools: 1,
        suspendedSchools: 1,
        rejectedSchools: 0,
        totalUsers: 2500,
        totalStudents: 2000,
        totalStaff: 200,
        estimatedMRR: 50000
      };
      vi.spyOn(superAdminRepository, 'getPlatformStats').mockResolvedValue(stats);

      const result = await superAdminService.getStats();
      expect(result).toEqual(stats);
      expect(superAdminRepository.getPlatformStats).toHaveBeenCalledTimes(1);
    });
  });

  describe('listTenants()', () => {
    it('returns paginated and formatted tenant summaries', async () => {
      vi.spyOn(superAdminRepository, 'findTenants').mockResolvedValue([mockSchool]);
      vi.spyOn(superAdminRepository, 'countTenants').mockResolvedValue(1);

      const result = await superAdminService.listTenants({ page: 1, limit: 10 });
      expect(result.tenants).toHaveLength(1);
      expect(result.tenants[0].name).toBe('Springfield High');
      expect(result.tenants[0].counts.students).toBe(450);
      expect(result.pagination.total).toBe(1);
    });
  });

  describe('getTenantById()', () => {
    it('returns deep tenant details when found', async () => {
      vi.spyOn(superAdminRepository, 'findTenantById').mockResolvedValue({
        ...mockSchool,
        settings: [{ category: 'modulesConfig', data: { fees: true } }],
        users: [{ id: 'user-1', email: 'admin@spfield.edu', createdAt: new Date() }]
      });

      const result = await superAdminService.getTenantById(mockSchool.id);
      expect(result.id).toBe(mockSchool.id);
      expect(result.modules).toEqual({ fees: true });
      expect(result.admins).toHaveLength(1);
    });

    it('throws NotFoundError if tenant does not exist', async () => {
      vi.spyOn(superAdminRepository, 'findTenantById').mockResolvedValue(null);

      await expect(superAdminService.getTenantById('unknown-id')).rejects.toThrow(NotFoundError);
    });
  });

  describe('createTenant()', () => {
    it('successfully provisions school and admin, writing audit log', async () => {
      vi.spyOn(superAdminRepository, 'findSchoolByCodeOrEmail').mockResolvedValue(null);
      vi.spyOn(superAdminRepository, 'findPlanById').mockResolvedValue(mockPlan);
      vi.spyOn(superAdminRepository, 'createTenantWithAdmin').mockResolvedValue({
        school: mockSchool,
        adminUser: { id: 'admin-1', email: 'admin@spfield.edu' }
      });
      vi.spyOn(auditRepository, 'createAuditLog').mockResolvedValue({});

      const result = await superAdminService.createTenant(
        {
          name: 'Springfield High',
          code: 'SPFLD',
          email: 'contact@spfield.edu',
          adminEmail: 'admin@spfield.edu',
          adminPassword: 'Password123!',
          planId: mockPlan.id
        },
        actor
      );

      expect(result.name).toBe('Springfield High');
      expect(auditRepository.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actionPerformed: 'PROVISION_TENANT',
          entityType: 'School'
        }),
        expect.anything()
      );
    });

    it('throws ConflictError if code or email already exists', async () => {
      vi.spyOn(superAdminRepository, 'findSchoolByCodeOrEmail').mockResolvedValue({
        code: 'SPFLD',
        email: 'other@school.edu'
      });

      await expect(
        superAdminService.createTenant(
          {
            name: 'Springfield High',
            code: 'SPFLD',
            email: 'contact@spfield.edu',
            adminEmail: 'admin@spfield.edu',
            adminPassword: 'Password123!'
          },
          actor
        )
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('updateTenantStatus()', () => {
    it('updates status and records audit log', async () => {
      vi.spyOn(superAdminRepository, 'findTenantById').mockResolvedValue(mockSchool);
      vi.spyOn(superAdminRepository, 'updateTenantStatus').mockResolvedValue({
        ...mockSchool,
        status: 'suspended'
      });
      vi.spyOn(auditRepository, 'createAuditLog').mockResolvedValue({});

      const result = await superAdminService.updateTenantStatus(
        mockSchool.id,
        { status: 'suspended', reason: 'Non-payment' },
        actor
      );

      expect(result.status).toBe('suspended');
      expect(auditRepository.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actionPerformed: 'UPDATE_TENANT_STATUS',
          modifiedFields: expect.objectContaining({
            previousStatus: 'approved',
            newStatus: 'suspended'
          })
        }),
        expect.anything()
      );
    });
  });

  describe('deleteTenant()', () => {
    it('deletes tenant with pre-audit logging', async () => {
      vi.spyOn(superAdminRepository, 'findTenantById').mockResolvedValue(mockSchool);
      vi.spyOn(superAdminRepository, 'deleteTenant').mockResolvedValue(mockSchool);
      vi.spyOn(auditRepository, 'createAuditLog').mockResolvedValue({});

      const result = await superAdminService.deleteTenant(mockSchool.id, actor);
      expect(result.message).toContain('successfully deleted');
      expect(auditRepository.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actionPerformed: 'DELETE_TENANT',
          entityId: mockSchool.id
        }),
        expect.anything()
      );
    });
  });

  describe('Plan Management (createPlan, deletePlan)', () => {
    it('creates new plan when name is unique', async () => {
      vi.spyOn(superAdminRepository, 'findPlanByName').mockResolvedValue(null);
      vi.spyOn(superAdminRepository, 'createPlan').mockResolvedValue(mockPlan);

      const result = await superAdminService.createPlan(
        {
          name: 'Pro Tier',
          userLimit: 1000,
          pricePerUserPerYear: 1200
        },
        actor
      );

      expect(result.name).toBe('Pro Tier');
    });

    it('safely deactivates plan if assigned to existing schools instead of deleting', async () => {
      vi.spyOn(superAdminRepository, 'findPlanById').mockResolvedValue(mockPlan);
      vi.spyOn(superAdminRepository, 'countSchoolsWithPlan').mockResolvedValue(3);
      vi.spyOn(superAdminRepository, 'updatePlan').mockResolvedValue({ ...mockPlan, isActive: false });

      const result = await superAdminService.deletePlan(mockPlan.id, actor);
      expect(result.message).toContain('deactivated rather than deleted');
      expect(superAdminRepository.updatePlan).toHaveBeenCalledWith(mockPlan.id, { isActive: false });
    });
  });

  describe('getLicenseUsage()', () => {
    it('calculates license usage ratios and health statuses', async () => {
      vi.spyOn(superAdminRepository, 'findTenants').mockResolvedValue([
        {
          ...mockSchool,
          seatLimit: 500,
          teacherLimit: 50,
          _count: { students: 480, staffProfiles: 48 } // 96% -> warning / exceeded
        }
      ]);
      vi.spyOn(superAdminRepository, 'countTenants').mockResolvedValue(1);

      const result = await superAdminService.getLicenseUsage({});
      expect(result.licenses).toHaveLength(1);
      expect(result.licenses[0].status).toBe('warning');
      expect(result.licenses[0].students.usagePercentage).toBe(96);
    });
  });
});
