import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/app.js';
import * as hrPayrollService from '../../../src/modules/hr-payroll/hr-payroll.service.js';
import * as authRepository from '../../../src/modules/auth/auth.repository.js';
import * as tokenService from '../../../src/modules/auth/token.service.js';
import * as rbacService from '../../../src/modules/rbac/rbac.service.js';
import { SYSTEM_ROLES } from '../../../src/config/constants.js';

describe('HR & Payroll Routes & RBAC Integration Tests', () => {
  const app = createApp();

  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';

  const SUPER_ADMIN_ID = '00000000-0000-4000-8000-000000000000';
  const ADMIN_USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const HR_MANAGER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const TEACHER_USER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const PARENT_USER_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const STUDENT_USER_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

  const PAYROLL_ID = '22222222-2222-4222-8222-222222222222';
  const STAFF_ID = '33333333-3333-4333-8333-333333333333';

  const superAdminUser = {
    id: SUPER_ADMIN_ID,
    schoolId: null,
    email: 'superadmin@sms.com',
    systemRole: SYSTEM_ROLES.SUPER_ADMIN,
    tokenVersion: 1,
    isActive: true
  };

  const adminUser = {
    id: ADMIN_USER_ID,
    schoolId: SCHOOL_ID,
    email: 'admin@school.com',
    systemRole: SYSTEM_ROLES.SCHOOL_ADMIN,
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_ID, name: 'School A', code: 'SCH-A', status: 'active' }
  };

  const hrManagerUser = {
    id: HR_MANAGER_ID,
    schoolId: SCHOOL_ID,
    email: 'hr@school.com',
    systemRole: 'HR_MANAGER',
    roles: ['hr-manager'],
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_ID, name: 'School A', code: 'SCH-A', status: 'active' }
  };

  const teacherUser = {
    id: TEACHER_USER_ID,
    schoolId: SCHOOL_ID,
    email: 'teacher@school.com',
    systemRole: 'TEACHER',
    roles: ['teacher'],
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_ID, name: 'School A', code: 'SCH-A', status: 'active' }
  };

  const parentUser = {
    id: PARENT_USER_ID,
    schoolId: SCHOOL_ID,
    email: 'parent@family.com',
    systemRole: SYSTEM_ROLES.PARENT,
    roles: ['parent'],
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_ID, name: 'School A', code: 'SCH-A', status: 'active' }
  };

  const studentUser = {
    id: STUDENT_USER_ID,
    schoolId: SCHOOL_ID,
    email: 'student@school.com',
    systemRole: 'STUDENT',
    roles: ['student'],
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_ID, name: 'School A', code: 'SCH-A', status: 'active' }
  };

  const getAuthToken = (user = adminUser) => {
    return tokenService.issueAccessToken({
      sub: user.id,
      schoolId: user.schoolId || SCHOOL_ID,
      systemRole: user.systemRole,
      tokenVersion: user.tokenVersion
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(authRepository, 'findSchoolById').mockImplementation(async (id) => {
      if (id === SCHOOL_ID) {
        return { id: SCHOOL_ID, name: 'School A', status: 'active' };
      }
      return null;
    });

    vi.spyOn(authRepository, 'findUserById').mockImplementation(async (id) => {
      if (id === SUPER_ADMIN_ID) return superAdminUser;
      if (id === ADMIN_USER_ID) return adminUser;
      if (id === HR_MANAGER_ID) return hrManagerUser;
      if (id === TEACHER_USER_ID) return teacherUser;
      if (id === PARENT_USER_ID) return parentUser;
      if (id === STUDENT_USER_ID) return studentUser;
      return null;
    });

    vi.spyOn(rbacService, 'getUserEffectivePermissions').mockImplementation(async (_schoolId, userId) => {
      if (userId === HR_MANAGER_ID) {
        return {
          'hr-payroll': { canRead: true, canCreate: true, canEdit: true, canDelete: true }
        };
      }
      if (userId === TEACHER_USER_ID) {
        return {
          'hr-payroll': { canRead: false, canCreate: false, canEdit: false, canDelete: false }
        };
      }
      return {};
    });
  });

  // ==========================================
  // 1. Deduction Calculation Unit Tests
  // ==========================================
  describe('Deduction Calculation Formula', () => {
    it('calculates PF 12% capped at ₹15,000 (max 1800) and ESI 0.75% for salary <= 21,000', () => {
      const res1 = hrPayrollService.calculateDeductions(10000);
      expect(res1.pf).toBe(1200); // 10000 * 0.12
      expect(res1.esi).toBe(75); // 10000 * 0.0075
      expect(res1.total).toBe(1275);

      const res2 = hrPayrollService.calculateDeductions(20000);
      expect(res2.pf).toBe(1800); // min(20000, 15000) * 0.12 = 1800
      expect(res2.esi).toBe(150); // 20000 * 0.0075
      expect(res2.total).toBe(1950);

      const res3 = hrPayrollService.calculateDeductions(50000);
      expect(res3.pf).toBe(1800); // capped at 1800
      expect(res3.esi).toBe(0); // 0 because > 21000
      expect(res3.total).toBe(1800);
    });
  });

  // ==========================================
  // 2. GET /api/v1/hr-payroll (Admin List)
  // ==========================================
  describe('GET /api/v1/hr-payroll', () => {
    it('allows Admin to list payroll records with pagination', async () => {
      vi.spyOn(hrPayrollService, 'listPayrolls').mockResolvedValue({
        records: [
          {
            id: PAYROLL_ID,
            schoolId: SCHOOL_ID,
            teacherId: STAFF_ID,
            month: 'JANUARY 2026',
            baseSalary: 25000,
            status: 'Pending',
            staffProfile: { name: 'John Doe', employeeId: 'EMP001' }
          }
        ],
        total: 1
      });

      const res = await request(app)
        .get('/api/v1/hr-payroll?page=1&limit=10&month=JANUARY%202026')
        .set('Authorization', `Bearer ${getAuthToken(adminUser)}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.pagination.total).toBe(1);
      expect(res.body.pagination.totalPages).toBe(1);
    });

    it('allows SuperAdmin to list payroll records across tenants via bypass with X-Tenant-Id header', async () => {
      vi.spyOn(hrPayrollService, 'listPayrolls').mockResolvedValue({
        records: [],
        total: 0
      });

      const res = await request(app)
        .get('/api/v1/hr-payroll')
        .set('x-tenant-id', SCHOOL_ID)
        .set('Authorization', `Bearer ${getAuthToken(superAdminUser)}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('allows HR Manager with hr-payroll:read permission to list payroll records', async () => {
      vi.spyOn(hrPayrollService, 'listPayrolls').mockResolvedValue({
        records: [],
        total: 0
      });

      const res = await request(app)
        .get('/api/v1/hr-payroll')
        .set('Authorization', `Bearer ${getAuthToken(hrManagerUser)}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('denies Teacher access to admin payroll list (403 Forbidden)', async () => {
      const res = await request(app)
        .get('/api/v1/hr-payroll')
        .set('Authorization', `Bearer ${getAuthToken(teacherUser)}`);

      expect(res.status).toBe(403);
    });

    it('denies Parent access to admin payroll list (403 Forbidden)', async () => {
      const res = await request(app)
        .get('/api/v1/hr-payroll')
        .set('Authorization', `Bearer ${getAuthToken(parentUser)}`);

      expect(res.status).toBe(403);
    });
  });

  // ==========================================
  // 3. GET /api/v1/hr-payroll/my-salary (Staff Self-Service)
  // ==========================================
  describe('GET /api/v1/hr-payroll/my-salary', () => {
    it('allows Teacher to view their own salary history without requiring admin permission', async () => {
      vi.spyOn(hrPayrollService, 'getMySalary').mockResolvedValue([
        {
          id: PAYROLL_ID,
          schoolId: SCHOOL_ID,
          teacherId: STAFF_ID,
          month: 'JANUARY 2026',
          baseSalary: 25000,
          status: 'Payslip Released'
        }
      ]);

      const res = await request(app)
        .get('/api/v1/hr-payroll/my-salary?month=JANUARY%202026')
        .set('Authorization', `Bearer ${getAuthToken(teacherUser)}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].status).toBe('Payslip Released');
    });

    it('returns 401 Unauthorized if unauthenticated', async () => {
      const res = await request(app).get('/api/v1/hr-payroll/my-salary');
      expect(res.status).toBe(401);
    });
  });

  // ==========================================
  // 4. POST /api/v1/hr-payroll/generate (Payroll Generation)
  // ==========================================
  describe('POST /api/v1/hr-payroll/generate', () => {
    it('allows Admin to generate payroll records atomically', async () => {
      vi.spyOn(hrPayrollService, 'generatePayroll').mockResolvedValue({
        count: 2,
        records: [
          { id: 'rec-1', month: 'JANUARY 2026', status: 'Pending' },
          { id: 'rec-2', month: 'JANUARY 2026', status: 'Pending' }
        ]
      });

      const res = await request(app)
        .post('/api/v1/hr-payroll/generate')
        .set('Authorization', `Bearer ${getAuthToken(adminUser)}`)
        .send({
          month: 'JANUARY 2026',
          staffIds: [STAFF_ID]
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.count).toBe(2);
    });

    it('rejects payload missing required month (400 Bad Request)', async () => {
      const res = await request(app)
        .post('/api/v1/hr-payroll/generate')
        .set('Authorization', `Bearer ${getAuthToken(adminUser)}`)
        .send({});

      expect(res.status).toBe(400);
    });

    it('denies Teacher from generating payroll (403 Forbidden)', async () => {
      const res = await request(app)
        .post('/api/v1/hr-payroll/generate')
        .set('Authorization', `Bearer ${getAuthToken(teacherUser)}`)
        .send({ month: 'JANUARY 2026' });

      expect(res.status).toBe(403);
    });
  });

  // ==========================================
  // 5. PATCH /api/v1/hr-payroll/:id/status (Status Lifecycle)
  // ==========================================
  describe('PATCH /api/v1/hr-payroll/:id/status', () => {
    it('allows Admin to transition payroll status to Paid', async () => {
      vi.spyOn(hrPayrollService, 'updatePayrollStatus').mockResolvedValue({
        id: PAYROLL_ID,
        status: 'Paid',
        paidAt: new Date().toISOString()
      });

      const res = await request(app)
        .patch(`/api/v1/hr-payroll/${PAYROLL_ID}/status`)
        .set('Authorization', `Bearer ${getAuthToken(adminUser)}`)
        .send({ status: 'Paid' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('Paid');
    });

    it('rejects invalid status transition value (400 Bad Request)', async () => {
      const res = await request(app)
        .patch(`/api/v1/hr-payroll/${PAYROLL_ID}/status`)
        .set('Authorization', `Bearer ${getAuthToken(adminUser)}`)
        .send({ status: 'INVALID_STATUS' });

      expect(res.status).toBe(400);
    });

    it('rejects non-UUID identifier (400 Bad Request)', async () => {
      const res = await request(app)
        .patch('/api/v1/hr-payroll/not-a-uuid/status')
        .set('Authorization', `Bearer ${getAuthToken(adminUser)}`)
        .send({ status: 'Paid' });

      expect(res.status).toBe(400);
    });
  });

  // ==========================================
  // 6. DELETE /api/v1/hr-payroll/:id (Delete Draft)
  // ==========================================
  describe('DELETE /api/v1/hr-payroll/:id', () => {
    it('allows Admin to delete Pending draft record', async () => {
      vi.spyOn(hrPayrollService, 'deletePayroll').mockResolvedValue();

      const res = await request(app)
        .delete(`/api/v1/hr-payroll/${PAYROLL_ID}`)
        .set('Authorization', `Bearer ${getAuthToken(adminUser)}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('deleted successfully');
    });

    it('denies Teacher from deleting payroll (403 Forbidden)', async () => {
      const res = await request(app)
        .delete(`/api/v1/hr-payroll/${PAYROLL_ID}`)
        .set('Authorization', `Bearer ${getAuthToken(teacherUser)}`);

      expect(res.status).toBe(403);
    });
  });

  // ==========================================
  // 7. GET & PATCH /api/v1/hr-payroll/config (Authorized Signature)
  // ==========================================
  describe('HR Configuration Endpoints', () => {
    it('allows Admin to get HR authorized signature config', async () => {
      vi.spyOn(hrPayrollService, 'getHRConfig').mockResolvedValue({
        authorizedSignature: 'https://cdn.school.com/sig.png'
      });

      const res = await request(app)
        .get('/api/v1/hr-payroll/config')
        .set('Authorization', `Bearer ${getAuthToken(adminUser)}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.authorizedSignature).toBe('https://cdn.school.com/sig.png');
    });

    it('allows Admin to update HR authorized signature config', async () => {
      vi.spyOn(hrPayrollService, 'updateHRConfig').mockResolvedValue({
        authorizedSignature: 'data:image/png;base64,iVBORw0KGgo...'
      });

      const res = await request(app)
        .patch('/api/v1/hr-payroll/config')
        .set('Authorization', `Bearer ${getAuthToken(adminUser)}`)
        .send({ authorizedSignature: 'data:image/png;base64,iVBORw0KGgo...' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.authorizedSignature).toContain('base64');
    });

    it('denies Teacher from accessing HR config (403 Forbidden)', async () => {
      const res = await request(app)
        .get('/api/v1/hr-payroll/config')
        .set('Authorization', `Bearer ${getAuthToken(teacherUser)}`);

      expect(res.status).toBe(403);
    });
  });
});
