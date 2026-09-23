import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import * as staffService from '../../src/modules/staff/staff.service.js';
import * as authRepository from '../../src/modules/auth/auth.repository.js';
import * as tokenService from '../../src/modules/auth/token.service.js';
import { SYSTEM_ROLES } from '../../src/config/constants.js';

describe('Security: Staff Domain Tenant Isolation & PII Protection — Phase 4C.4', () => {
  const app = createApp();
  const TENANT_A = '11111111-1111-4111-8111-111111111111';
  const TENANT_B = '22222222-2222-4222-8222-222222222222';
  const STAFF_A = '33333333-3333-4333-8333-333333333333';
  const USER_A = '44444444-4444-4444-8444-444444444444';

  const adminTenantA = {
    id: 'admin-a',
    schoolId: TENANT_A,
    email: 'admin@tenanta.edu',
    systemRole: SYSTEM_ROLES.SCHOOL_ADMIN,
    tokenVersion: 1,
    isActive: true,
    school: { id: TENANT_A, name: 'Tenant A School', code: 'SchoolA', status: 'active' }
  };

  const adminTenantB = {
    id: 'admin-b',
    schoolId: TENANT_B,
    email: 'admin@tenantb.edu',
    systemRole: SYSTEM_ROLES.SCHOOL_ADMIN,
    tokenVersion: 1,
    isActive: true,
    school: { id: TENANT_B, name: 'Tenant B School', code: 'SchoolB', status: 'active' }
  };

  const superAdminUser = {
    id: 'superadmin-1',
    schoolId: null,
    email: 'super@platform.internal',
    systemRole: SYSTEM_ROLES.SUPER_ADMIN,
    tokenVersion: 1,
    isActive: true
  };

  const s015TenantUser = {
    id: USER_A,
    schoolId: TENANT_A,
    email: 'pavi@trustitec.com',
    systemRole: SYSTEM_ROLES.TENANT_USER,
    tokenVersion: 1,
    isActive: true,
    school: { id: TENANT_A, name: 'TrustITec College', code: 'SchoolS015', status: 'active' }
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const getAuthToken = (user) => {
    return tokenService.issueAccessToken({
      sub: user.id,
      schoolId: user.schoolId,
      systemRole: user.systemRole,
      tokenVersion: user.tokenVersion
    });
  };

  describe('1. Cross-Tenant Isolation', () => {
    it('returns 404 when Tenant B tries to read a staff member from Tenant A', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminTenantB);
      // Service called with Tenant B school ID will not find Staff A
      vi.spyOn(staffService, 'getStaffById').mockImplementation(async (schoolId, id) => {
        if (schoolId === TENANT_A && id === STAFF_A) {
          return { id: STAFF_A, schoolId: TENANT_A, name: 'Staff A' };
        }
        const err = new Error('Staff profile not found');
        err.statusCode = 404;
        throw err;
      });

      const tokenB = getAuthToken(adminTenantB);
      const res = await request(app)
        .get(`/api/v1/staff/${STAFF_A}`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('returns 404 when Tenant B tries to update a staff member from Tenant A', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminTenantB);
      vi.spyOn(staffService, 'updateStaff').mockImplementation(async (schoolId) => {
        if (schoolId !== TENANT_A) {
          const err = new Error('Staff profile not found');
          err.statusCode = 404;
          throw err;
        }
        return {};
      });

      const tokenB = getAuthToken(adminTenantB);
      const res = await request(app)
        .patch(`/api/v1/staff/${STAFF_A}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ designation: 'Malicious Update' });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('returns 404 when Tenant B tries to delete a staff member from Tenant A', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminTenantB);
      vi.spyOn(staffService, 'deleteStaff').mockImplementation(async (schoolId) => {
        if (schoolId !== TENANT_A) {
          const err = new Error('Staff profile not found');
          err.statusCode = 404;
          throw err;
        }
        return null;
      });

      const tokenB = getAuthToken(adminTenantB);
      const res = await request(app)
        .delete(`/api/v1/staff/${STAFF_A}`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('2. Parameter Poisoning Prevention', () => {
    it('rejects cross-tenant schoolId injection in request body', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminTenantA);

      const tokenA = getAuthToken(adminTenantA);
      const res = await request(app)
        .post('/api/v1/staff')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          schoolId: TENANT_B, // Poisoned tenant ID
          firstName: 'Poison',
          email: 'poison@tenantb.edu'
        });

      // Tenant middleware rejects conflicting schoolId
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('rejects cross-tenant schoolId injection in query string', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminTenantA);

      const tokenA = getAuthToken(adminTenantA);
      const res = await request(app)
        .get(`/api/v1/staff?schoolId=${TENANT_B}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('3. SuperAdmin Tenant Switching', () => {
    it('allows SuperAdmin to access Tenant A with X-Tenant-Id header', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(superAdminUser);
      vi.spyOn(authRepository, 'findSchoolById').mockResolvedValue({
        id: TENANT_A,
        name: 'Tenant A School',
        code: 'SchoolA',
        status: 'active'
      });
      vi.spyOn(staffService, 'listStaff').mockResolvedValue({
        staff: [{ id: STAFF_A, name: 'Staff A', schoolId: TENANT_A }],
        pagination: { total: 1, page: 1, limit: 20, totalPages: 1 }
      });

      const token = getAuthToken(superAdminUser);
      const res = await request(app)
        .get('/api/v1/staff')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Tenant-Id', TENANT_A);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data[0].schoolId).toBe(TENANT_A);
    });
  });

  describe('4. S015 TENANT_USER Self-Service Compatibility', () => {
    it('allows S015 user with systemRole TENANT_USER to access /staff/me if linked to StaffProfile', async () => {
      const mockS015Staff = {
        id: STAFF_A,
        userId: USER_A,
        schoolId: TENANT_A,
        name: 'Pavithran A',
        email: 'pavi@trustitec.com',
        designation: 'Staffs',
        staffType: 'teaching',
        status: 'Active'
      };

      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(s015TenantUser);
      vi.spyOn(staffService, 'getStaffMe').mockResolvedValue(mockS015Staff);

      const token = getAuthToken(s015TenantUser);
      const res = await request(app)
        .get('/api/v1/staff/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Pavithran A');
    });
  });

  describe('5. PII & Sensitive Financial Data Protection', () => {
    it('serializes staff list without sensitive financial data when requester lacks hr-payroll privilege', async () => {
      const fullStaff = {
        id: STAFF_A,
        name: 'Robert Doe',
        baseSalary: 60000,
        customData: {
          financial: {
            panNumber: 'ABCDE1234F',
            bankAccountNumber: '123456789'
          }
        }
      };

      const serializedWithoutHR = staffService.serializeStaff(fullStaff, false);
      expect(serializedWithoutHR.name).toBe('Robert Doe');
      expect(serializedWithoutHR.baseSalary).toBeUndefined();
      expect(serializedWithoutHR.financial).toBeUndefined();

      const serializedWithHR = staffService.serializeStaff(fullStaff, true);
      expect(serializedWithHR.baseSalary).toBe(60000);
      expect(serializedWithHR.financial).toBeDefined();
      expect(serializedWithHR.financial.panNumber).toBe('ABCDE1234F');
    });
  });
});
