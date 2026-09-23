import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/app.js';
import * as hrPayrollService from '../../../src/modules/hr-payroll/hr-payroll.service.js';
import * as authRepository from '../../../src/modules/auth/auth.repository.js';
import * as tokenService from '../../../src/modules/auth/token.service.js';
import * as rbacService from '../../../src/modules/rbac/rbac.service.js';
import { SYSTEM_ROLES } from '../../../src/config/constants.js';

describe('HR & Payroll End-to-End Production Readiness & Validation (Phase HR.5)', () => {
  const app = createApp();

  const TENANT_A = '11111111-1111-4111-8111-111111111111';
  const TENANT_B = '22222222-2222-4222-8222-222222222222';

  const SUPER_ADMIN_ID = '00000000-0000-4000-8000-000000000000';
  const ADMIN_A_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const HR_MANAGER_A_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const TEACHER_A_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const PARENT_A_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const STUDENT_A_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

  const PAYROLL_ID = '99999999-9999-4999-8999-999999999999';
  const STAFF_PROFILE_ID = '88888888-8888-4888-8888-888888888888';

  const superAdminUser = {
    id: SUPER_ADMIN_ID,
    schoolId: null,
    email: 'superadmin@sms.com',
    systemRole: SYSTEM_ROLES.SUPER_ADMIN,
    tokenVersion: 1,
    isActive: true
  };

  const adminAUser = {
    id: ADMIN_A_ID,
    schoolId: TENANT_A,
    email: 'admin@schoolA.com',
    systemRole: SYSTEM_ROLES.SCHOOL_ADMIN,
    tokenVersion: 1,
    isActive: true,
    school: { id: TENANT_A, name: 'School A', code: 'SCH-A', status: 'active' }
  };

  const hrManagerAUser = {
    id: HR_MANAGER_A_ID,
    schoolId: TENANT_A,
    email: 'hr@schoolA.com',
    systemRole: 'HR_MANAGER',
    roles: ['hr-manager'],
    tokenVersion: 1,
    isActive: true,
    school: { id: TENANT_A, name: 'School A', code: 'SCH-A', status: 'active' }
  };

  const teacherAUser = {
    id: TEACHER_A_ID,
    schoolId: TENANT_A,
    email: 'teacher@schoolA.com',
    systemRole: 'TEACHER',
    roles: ['teacher'],
    tokenVersion: 1,
    isActive: true,
    school: { id: TENANT_A, name: 'School A', code: 'SCH-A', status: 'active' }
  };

  const parentAUser = {
    id: PARENT_A_ID,
    schoolId: TENANT_A,
    email: 'parent@family.com',
    systemRole: SYSTEM_ROLES.PARENT,
    roles: ['parent'],
    tokenVersion: 1,
    isActive: true,
    school: { id: TENANT_A, name: 'School A', code: 'SCH-A', status: 'active' }
  };

  const studentAUser = {
    id: STUDENT_A_ID,
    schoolId: TENANT_A,
    email: 'student@schoolA.com',
    systemRole: 'STUDENT',
    roles: ['student'],
    tokenVersion: 1,
    isActive: true,
    school: { id: TENANT_A, name: 'School A', code: 'SCH-A', status: 'active' }
  };

  const issueToken = (user) => {
    return tokenService.issueAccessToken({
      sub: user.id,
      schoolId: user.schoolId || TENANT_A,
      systemRole: user.systemRole,
      tokenVersion: user.tokenVersion
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(authRepository, 'findSchoolById').mockImplementation(async (id) => {
      if (id === TENANT_A) return { id: TENANT_A, name: 'School A', status: 'active' };
      if (id === TENANT_B) return { id: TENANT_B, name: 'School B', status: 'active' };
      return null;
    });

    vi.spyOn(authRepository, 'findUserById').mockImplementation(async (id) => {
      if (id === SUPER_ADMIN_ID) return superAdminUser;
      if (id === ADMIN_A_ID) return adminAUser;
      if (id === HR_MANAGER_A_ID) return hrManagerAUser;
      if (id === TEACHER_A_ID) return teacherAUser;
      if (id === PARENT_A_ID) return parentAUser;
      if (id === STUDENT_A_ID) return studentAUser;
      return null;
    });

    vi.spyOn(rbacService, 'getUserEffectivePermissions').mockImplementation(async (_schoolId, userId) => {
      if (userId === HR_MANAGER_A_ID) {
        return {
          'hr-payroll': { canRead: true, canCreate: true, canEdit: true, canDelete: true }
        };
      }
      return {
        'hr-payroll': { canRead: false, canCreate: false, canEdit: false, canDelete: false }
      };
    });
  });

  // ==========================================
  // 1. Comprehensive Authentication & RBAC Matrix
  // ==========================================
  describe('Authentication & RBAC Matrix', () => {
    it('rejects unauthenticated requests to all endpoints with 401 Unauthorized', async () => {
      const endpoints = [
        { method: 'get', url: '/api/v1/hr-payroll' },
        { method: 'get', url: '/api/v1/hr-payroll/my-salary' },
        { method: 'post', url: '/api/v1/hr-payroll/generate' },
        { method: 'get', url: '/api/v1/hr-payroll/config' },
        { method: 'patch', url: `/api/v1/hr-payroll/${PAYROLL_ID}/status` },
        { method: 'delete', url: `/api/v1/hr-payroll/${PAYROLL_ID}` }
      ];

      for (const ep of endpoints) {
        const res = await request(app)[ep.method](ep.url);
        expect(res.status).toBe(401);
      }
    });

    it('grants SuperAdmin full access to all HR/Payroll routes with tenant header switch', async () => {
      vi.spyOn(hrPayrollService, 'listPayrolls').mockResolvedValue({ records: [], total: 0 });
      vi.spyOn(hrPayrollService, 'getHRConfig').mockResolvedValue({ authorizedSignature: null });

      const listRes = await request(app)
        .get('/api/v1/hr-payroll')
        .set('x-tenant-id', TENANT_A)
        .set('Authorization', `Bearer ${issueToken(superAdminUser)}`);
      expect(listRes.status).toBe(200);

      const configRes = await request(app)
        .get('/api/v1/hr-payroll/config')
        .set('x-tenant-id', TENANT_A)
        .set('Authorization', `Bearer ${issueToken(superAdminUser)}`);
      expect(configRes.status).toBe(200);
    });

    it('grants School Admin full access to HR/Payroll routes', async () => {
      vi.spyOn(hrPayrollService, 'listPayrolls').mockResolvedValue({ records: [], total: 0 });

      const res = await request(app)
        .get('/api/v1/hr-payroll')
        .set('Authorization', `Bearer ${issueToken(adminAUser)}`);
      expect(res.status).toBe(200);
    });

    it('grants HR Manager with hr-payroll:read full access', async () => {
      vi.spyOn(hrPayrollService, 'listPayrolls').mockResolvedValue({ records: [], total: 0 });

      const res = await request(app)
        .get('/api/v1/hr-payroll')
        .set('Authorization', `Bearer ${issueToken(hrManagerAUser)}`);
      expect(res.status).toBe(200);
    });

    it('denies Teacher access to Admin list (403) but allows self-service /my-salary (200)', async () => {
      vi.spyOn(hrPayrollService, 'getMySalary').mockResolvedValue([]);

      const adminRes = await request(app)
        .get('/api/v1/hr-payroll')
        .set('Authorization', `Bearer ${issueToken(teacherAUser)}`);
      expect(adminRes.status).toBe(403);

      const selfRes = await request(app)
        .get('/api/v1/hr-payroll/my-salary')
        .set('Authorization', `Bearer ${issueToken(teacherAUser)}`);
      expect(selfRes.status).toBe(200);
    });

    it('denies Parent and Student access to all HR/Payroll endpoints (403 Forbidden)', async () => {
      for (const user of [parentAUser, studentAUser]) {
        const listRes = await request(app)
          .get('/api/v1/hr-payroll')
          .set('Authorization', `Bearer ${issueToken(user)}`);
        expect(listRes.status).toBe(403);

        const configRes = await request(app)
          .get('/api/v1/hr-payroll/config')
          .set('Authorization', `Bearer ${issueToken(user)}`);
        expect(configRes.status).toBe(403);
      }
    });
  });

  // ==========================================
  // 2. Statutory Calculation Boundary Verification
  // ==========================================
  describe('Statutory Calculation Boundary Verification', () => {
    it('correctly calculates PF and ESI across all key threshold boundaries', () => {
      // 0 Salary
      const r0 = hrPayrollService.calculateDeductions(0);
      expect(r0).toEqual({ pf: 0, esi: 0, total: 0 });

      // Negative Salary (defensive check)
      const rNeg = hrPayrollService.calculateDeductions(-5000);
      expect(rNeg).toEqual({ pf: 0, esi: 0, total: 0 });

      // ₹10,000 (below both thresholds)
      const r10k = hrPayrollService.calculateDeductions(10000);
      expect(r10k.pf).toBe(1200); // 10000 * 0.12
      expect(r10k.esi).toBe(75); // 10000 * 0.0075
      expect(r10k.total).toBe(1275);

      // ₹15,000 (PF threshold boundary: min(15000, 15000) * 0.12 = 1800)
      const r15k = hrPayrollService.calculateDeductions(15000);
      expect(r15k.pf).toBe(1800);
      expect(r15k.esi).toBe(113); // round(15000 * 0.0075 = 112.5) = 113
      expect(r15k.total).toBe(1913);

      // ₹20,000 (above PF ceiling, below ESI ceiling)
      const r20k = hrPayrollService.calculateDeductions(20000);
      expect(r20k.pf).toBe(1800); // capped at 1800
      expect(r20k.esi).toBe(150); // 20000 * 0.0075
      expect(r20k.total).toBe(1950);

      // ₹21,000 (exact ESI ceiling boundary: <= 21000 applies ESI)
      const r21k = hrPayrollService.calculateDeductions(21000);
      expect(r21k.pf).toBe(1800);
      expect(r21k.esi).toBe(158); // round(21000 * 0.0075 = 157.5) = 158
      expect(r21k.total).toBe(1958);

      // ₹21,001 (above ESI ceiling: ESI becomes 0)
      const r21kPlus = hrPayrollService.calculateDeductions(21001);
      expect(r21kPlus.pf).toBe(1800);
      expect(r21kPlus.esi).toBe(0); // 0 because > 21000
      expect(r21kPlus.total).toBe(1800);

      // ₹50,000 (executive level)
      const r50k = hrPayrollService.calculateDeductions(50000);
      expect(r50k.pf).toBe(1800);
      expect(r50k.esi).toBe(0);
      expect(r50k.total).toBe(1800);
    });
  });

  // ==========================================
  // 3. E2E Admin Workflow & Error Handling
  // ==========================================
  describe('E2E Admin Operations & Error Handling', () => {
    it('executes full payroll generation, status transition, and draft deletion workflow', async () => {
      // 1. Generate Payroll
      const genSpy = vi.spyOn(hrPayrollService, 'generatePayroll').mockResolvedValue({
        count: 1,
        records: [
          {
            id: PAYROLL_ID,
            schoolId: TENANT_A,
            teacherId: STAFF_PROFILE_ID,
            month: 'FEBRUARY 2026',
            baseSalary: 30000,
            pfCalculated: 1800,
            esiCalculated: 0,
            deductions: 1800,
            netPay: 28200,
            status: 'Pending'
          }
        ]
      });

      const genRes = await request(app)
        .post('/api/v1/hr-payroll/generate')
        .set('Authorization', `Bearer ${issueToken(adminAUser)}`)
        .send({ month: 'FEBRUARY 2026', staffIds: [STAFF_PROFILE_ID] });

      expect(genRes.status).toBe(201);
      expect(genRes.body.count).toBe(1);
      expect(genSpy).toHaveBeenCalledWith(
        TENANT_A,
        expect.objectContaining({ month: 'FEBRUARY 2026' }),
        expect.anything()
      );

      // 2. Transition Status: Pending -> Paid
      const updateStatusSpy = vi.spyOn(hrPayrollService, 'updatePayrollStatus').mockResolvedValue({
        id: PAYROLL_ID,
        status: 'Paid',
        paidAt: new Date().toISOString()
      });

      const updateRes = await request(app)
        .patch(`/api/v1/hr-payroll/${PAYROLL_ID}/status`)
        .set('Authorization', `Bearer ${issueToken(adminAUser)}`)
        .send({ status: 'Paid' });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.status).toBe('Paid');
      expect(updateStatusSpy).toHaveBeenCalledWith(
        TENANT_A,
        PAYROLL_ID,
        expect.objectContaining({ status: 'Paid' }),
        expect.anything()
      );

      // 3. Transition Status: Paid -> Payslip Released
      updateStatusSpy.mockResolvedValueOnce({
        id: PAYROLL_ID,
        status: 'Payslip Released',
        paidAt: new Date().toISOString()
      });

      const releaseRes = await request(app)
        .patch(`/api/v1/hr-payroll/${PAYROLL_ID}/status`)
        .set('Authorization', `Bearer ${issueToken(adminAUser)}`)
        .send({ status: 'Payslip Released' });

      expect(releaseRes.status).toBe(200);
      expect(releaseRes.body.data.status).toBe('Payslip Released');

      // 4. Delete Pending Draft (allowed)
      const deleteSpy = vi.spyOn(hrPayrollService, 'deletePayroll').mockResolvedValue();

      const deleteRes = await request(app)
        .delete(`/api/v1/hr-payroll/${PAYROLL_ID}`)
        .set('Authorization', `Bearer ${issueToken(adminAUser)}`);

      expect(deleteRes.status).toBe(200);
      expect(deleteSpy).toHaveBeenCalledWith(TENANT_A, PAYROLL_ID, expect.anything());
    });
  });
});
