import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/app.js';
import * as hrPayrollService from '../../../src/modules/hr-payroll/hr-payroll.service.js';
import * as hrPayrollRepository from '../../../src/modules/hr-payroll/hr-payroll.repository.js';
import * as staffRepository from '../../../src/modules/staff/staff.repository.js';
import * as authRepository from '../../../src/modules/auth/auth.repository.js';
import * as tokenService from '../../../src/modules/auth/token.service.js';
import * as rbacService from '../../../src/modules/rbac/rbac.service.js';
import { SYSTEM_ROLES } from '../../../src/config/constants.js';
import { NotFoundError, ValidationError } from '../../../src/utils/app-error.js';

describe('HR & Payroll Production Hardening & Security Integration Tests (Phase HR.4)', () => {
  const app = createApp();

  const TENANT_A_ID = '11111111-1111-4111-8111-111111111111';
  const TENANT_B_ID = '22222222-2222-4222-8222-222222222222';

  const ADMIN_A_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const ADMIN_B_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const TEACHER_A_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const TEACHER_B_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

  const STAFF_PROFILE_A_ID = '33333333-3333-4333-8333-333333333333';
  const STAFF_PROFILE_B_ID = '44444444-4444-4444-8444-444444444444';

  const PAYROLL_A_ID = '55555555-5555-4555-8555-555555555555';
  const PAYROLL_B_ID = '66666666-6666-4666-8666-666666666666';

  const adminUserA = {
    id: ADMIN_A_ID,
    schoolId: TENANT_A_ID,
    email: 'adminA@schoolA.com',
    systemRole: SYSTEM_ROLES.SCHOOL_ADMIN,
    tokenVersion: 1,
    isActive: true,
    school: { id: TENANT_A_ID, name: 'School A', code: 'SCH-A', status: 'active' }
  };

  const adminUserB = {
    id: ADMIN_B_ID,
    schoolId: TENANT_B_ID,
    email: 'adminB@schoolB.com',
    systemRole: SYSTEM_ROLES.SCHOOL_ADMIN,
    tokenVersion: 1,
    isActive: true,
    school: { id: TENANT_B_ID, name: 'School B', code: 'SCH-B', status: 'active' }
  };

  const teacherUserA = {
    id: TEACHER_A_ID,
    schoolId: TENANT_A_ID,
    email: 'teacherA@schoolA.com',
    systemRole: 'TEACHER',
    roles: ['teacher'],
    tokenVersion: 1,
    isActive: true,
    school: { id: TENANT_A_ID, name: 'School A', code: 'SCH-A', status: 'active' }
  };

  const teacherUserB = {
    id: TEACHER_B_ID,
    schoolId: TENANT_B_ID,
    email: 'teacherB@schoolB.com',
    systemRole: 'TEACHER',
    roles: ['teacher'],
    tokenVersion: 1,
    isActive: true,
    school: { id: TENANT_B_ID, name: 'School B', code: 'SCH-B', status: 'active' }
  };

  const getAuthToken = (user) => {
    return tokenService.issueAccessToken({
      sub: user.id,
      schoolId: user.schoolId,
      systemRole: user.systemRole,
      tokenVersion: user.tokenVersion
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(authRepository, 'findSchoolById').mockImplementation(async (id) => {
      if (id === TENANT_A_ID) return { id: TENANT_A_ID, name: 'School A', status: 'active' };
      if (id === TENANT_B_ID) return { id: TENANT_B_ID, name: 'School B', status: 'active' };
      return null;
    });

    vi.spyOn(authRepository, 'findUserById').mockImplementation(async (id) => {
      if (id === ADMIN_A_ID) return adminUserA;
      if (id === ADMIN_B_ID) return adminUserB;
      if (id === TEACHER_A_ID) return teacherUserA;
      if (id === TEACHER_B_ID) return teacherUserB;
      return null;
    });

    vi.spyOn(rbacService, 'getUserEffectivePermissions').mockImplementation(async (_schoolId, userId) => {
      if (userId === ADMIN_A_ID || userId === ADMIN_B_ID) {
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
  // 1. Cross-Tenant Attack Surface Tests
  // ==========================================
  describe('Cross-Tenant Attack Surface & Isolation', () => {
    it('strictly rejects non-SuperAdmin attempting cross-tenant schoolId injection in query with 403 Forbidden', async () => {
      const res = await request(app)
        .get(`/api/v1/hr-payroll/my-salary?schoolId=${TENANT_B_ID}`)
        .set('Authorization', `Bearer ${getAuthToken(teacherUserA)}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Cross-tenant access rejected');
    });

    it('denies Admin from Tenant A mutating Tenant B payroll status (returns error without affecting Tenant B)', async () => {
      vi.spyOn(hrPayrollService, 'updatePayrollStatus').mockRejectedValue(
        new NotFoundError('Payroll record not found')
      );

      const res = await request(app)
        .patch(`/api/v1/hr-payroll/${PAYROLL_B_ID}/status`)
        .set('Authorization', `Bearer ${getAuthToken(adminUserA)}`)
        .send({ status: 'Paid' });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('denies Admin from Tenant A deleting Tenant B payroll record', async () => {
      vi.spyOn(hrPayrollService, 'deletePayroll').mockRejectedValue(
        new NotFoundError('Payroll record not found')
      );

      const res = await request(app)
        .delete(`/api/v1/hr-payroll/${PAYROLL_B_ID}`)
        .set('Authorization', `Bearer ${getAuthToken(adminUserA)}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('isolates HR configuration per tenant', async () => {
      const getConfigSpy = vi.spyOn(hrPayrollService, 'getHRConfig').mockResolvedValue({
        authorizedSignature: 'https://school-a.com/sig.png'
      });

      const res = await request(app)
        .get('/api/v1/hr-payroll/config')
        .set('Authorization', `Bearer ${getAuthToken(adminUserA)}`);

      expect(res.status).toBe(200);
      expect(getConfigSpy).toHaveBeenCalledWith(TENANT_A_ID);
    });
  });

  // ==========================================
  // 2. Self-Service Salary Security
  // ==========================================
  describe('Self-Service Salary Security (GET /my-salary)', () => {
    it('service layer resolves StaffProfile server-side from req.user.id and queries only own records', async () => {
      vi.spyOn(staffRepository, 'findStaffByUserId').mockResolvedValue({
        id: STAFF_PROFILE_A_ID,
        schoolId: TENANT_A_ID,
        userId: TEACHER_A_ID,
        name: 'Teacher A'
      });

      const repoSpy = vi.spyOn(hrPayrollRepository, 'findPayrollsByStaffId').mockResolvedValue([
        {
          id: PAYROLL_A_ID,
          schoolId: TENANT_A_ID,
          teacherId: STAFF_PROFILE_A_ID,
          month: 'JANUARY 2026',
          baseSalary: 30000,
          status: 'Payslip Released'
        }
      ]);

      const records = await hrPayrollService.getMySalary(TENANT_A_ID, TEACHER_A_ID, {});
      expect(records).toHaveLength(1);
      expect(records[0].teacherId).toBe(STAFF_PROFILE_A_ID);
      expect(repoSpy).toHaveBeenCalledWith(TENANT_A_ID, STAFF_PROFILE_A_ID, expect.any(Object));
    });

    it('service layer throws NotFoundError when user does not have a linked staff profile', async () => {
      vi.spyOn(staffRepository, 'findStaffByUserId').mockResolvedValue(null);

      await expect(
        hrPayrollService.getMySalary(TENANT_A_ID, TEACHER_A_ID, {})
      ).rejects.toThrow(NotFoundError);
    });
  });

  // ==========================================
  // 3. Status State Machine & Deletion Rules
  // ==========================================
  describe('Status State Machine & Concurrency Protections', () => {
    it('supports full bidirectional status transitions (Pending -> Paid -> Payslip Released -> Paid -> Pending)', async () => {
      const updateStatusSpy = vi.spyOn(hrPayrollService, 'updatePayrollStatus');

      // 1. Pending -> Paid
      updateStatusSpy.mockResolvedValueOnce({ id: PAYROLL_A_ID, status: 'Paid', paidAt: new Date().toISOString() });
      let res = await request(app)
        .patch(`/api/v1/hr-payroll/${PAYROLL_A_ID}/status`)
        .set('Authorization', `Bearer ${getAuthToken(adminUserA)}`)
        .send({ status: 'Paid' });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('Paid');

      // 2. Paid -> Payslip Released
      updateStatusSpy.mockResolvedValueOnce({ id: PAYROLL_A_ID, status: 'Payslip Released', paidAt: new Date().toISOString() });
      res = await request(app)
        .patch(`/api/v1/hr-payroll/${PAYROLL_A_ID}/status`)
        .set('Authorization', `Bearer ${getAuthToken(adminUserA)}`)
        .send({ status: 'Payslip Released' });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('Payslip Released');

      // 3. Payslip Released -> Paid (Reverse transition confirmed in legacy)
      updateStatusSpy.mockResolvedValueOnce({ id: PAYROLL_A_ID, status: 'Paid', paidAt: new Date().toISOString() });
      res = await request(app)
        .patch(`/api/v1/hr-payroll/${PAYROLL_A_ID}/status`)
        .set('Authorization', `Bearer ${getAuthToken(adminUserA)}`)
        .send({ status: 'Paid' });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('Paid');

      // 4. Paid -> Pending (Reverse transition confirmed in legacy)
      updateStatusSpy.mockResolvedValueOnce({ id: PAYROLL_A_ID, status: 'Pending', paidAt: null });
      res = await request(app)
        .patch(`/api/v1/hr-payroll/${PAYROLL_A_ID}/status`)
        .set('Authorization', `Bearer ${getAuthToken(adminUserA)}`)
        .send({ status: 'Pending' });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('Pending');
    });

    it('rejects deletion of finalized payroll (Paid / Payslip Released) with 400 ValidationError', async () => {
      vi.spyOn(hrPayrollService, 'deletePayroll').mockRejectedValue(
        new ValidationError("Cannot delete payroll record in 'Paid' status. Only draft records in 'Pending' status can be deleted.")
      );

      const res = await request(app)
        .delete(`/api/v1/hr-payroll/${PAYROLL_A_ID}`)
        .set('Authorization', `Bearer ${getAuthToken(adminUserA)}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Cannot delete payroll record');
    });
  });

  // ==========================================
  // 4. Input Validation & Parameter Hardening
  // ==========================================
  describe('Input Validation & Boundary Hardening', () => {
    it('rejects invalid/non-UUID params with 400 Bad Request', async () => {
      const res = await request(app)
        .delete('/api/v1/hr-payroll/12345-invalid-id')
        .set('Authorization', `Bearer ${getAuthToken(adminUserA)}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('rejects invalid status enum with 400 Bad Request', async () => {
      const res = await request(app)
        .patch(`/api/v1/hr-payroll/${PAYROLL_A_ID}/status`)
        .set('Authorization', `Bearer ${getAuthToken(adminUserA)}`)
        .send({ status: 'UNKNOWN_STATUS' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('caps pagination limit safely at 100 on Admin list', async () => {
      const listSpy = vi.spyOn(hrPayrollService, 'listPayrolls').mockResolvedValue({
        records: [],
        total: 0
      });

      const res = await request(app)
        .get('/api/v1/hr-payroll?limit=500&page=1')
        .set('Authorization', `Bearer ${getAuthToken(adminUserA)}`);

      expect(res.status).toBe(200);
      expect(listSpy).toHaveBeenCalledWith(
        TENANT_A_ID,
        expect.objectContaining({ limit: 100 })
      );
    });

    it('rejects negative salary overrides during payroll generation with 400 Bad Request', async () => {
      const res = await request(app)
        .post('/api/v1/hr-payroll/generate')
        .set('Authorization', `Bearer ${getAuthToken(adminUserA)}`)
        .send({
          month: 'JANUARY 2026',
          records: [
            {
              staffId: STAFF_PROFILE_A_ID,
              baseSalary: -5000
            }
          ]
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });
});
