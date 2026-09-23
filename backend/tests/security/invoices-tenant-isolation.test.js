import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import * as invoiceService from '../../src/modules/invoices/invoice.service.js';
import * as authRepository from '../../src/modules/auth/auth.repository.js';
import * as tokenService from '../../src/modules/auth/token.service.js';
import { SYSTEM_ROLES } from '../../src/config/constants.js';
import { NotFoundError } from '../../src/utils/app-error.js';

describe('Security: Invoice Domain Tenant Isolation & Parent Child-Scope Authorization (Phase 4C.6-B1)', () => {
  const app = createApp();

  const TENANT_A = '11111111-1111-4111-8111-111111111111';
  const TENANT_B = '22222222-2222-4222-8222-222222222222';

  const STUDENT_1_A = '33333333-3333-4333-8333-333333333333';
  const STUDENT_3_A = '55555555-5555-4555-8555-555555555555';

  const INVOICE_1_A = '77777777-7777-4777-8777-777777777777';
  const INVOICE_3_A = '88888888-8888-4888-8888-888888888888';

  const ADMIN_A_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const ADMIN_B_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const PARENT_A_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

  const adminTenantA = {
    id: ADMIN_A_ID,
    schoolId: TENANT_A,
    email: 'admin@tenanta.edu',
    systemRole: SYSTEM_ROLES.SCHOOL_ADMIN,
    tokenVersion: 1,
    isActive: true,
    school: { id: TENANT_A, name: 'School A', code: 'SchoolA', status: 'active' }
  };

  const adminTenantB = {
    id: ADMIN_B_ID,
    schoolId: TENANT_B,
    email: 'admin@tenantb.edu',
    systemRole: SYSTEM_ROLES.SCHOOL_ADMIN,
    tokenVersion: 1,
    isActive: true,
    school: { id: TENANT_B, name: 'School B', code: 'SchoolB', status: 'active' }
  };

  const parentTenantA = {
    id: PARENT_A_ID,
    schoolId: TENANT_A,
    email: 'parent.a@home.com',
    systemRole: SYSTEM_ROLES.PARENT,
    tokenVersion: 1,
    isActive: true,
    school: { id: TENANT_A, name: 'School A', code: 'SchoolA', status: 'active' }
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

  describe('1. Cross-Tenant Invoice Isolation', () => {
    it('returns 404 when Admin B attempts to read Invoice belonging to Tenant A', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminTenantB);
      vi.spyOn(invoiceService, 'getInvoiceById').mockImplementation(async (schoolId, id) => {
        if (schoolId === TENANT_B && id === INVOICE_1_A) {
          throw new NotFoundError('Invoice');
        }
        return { id: INVOICE_1_A, schoolId: TENANT_A };
      });

      const tokenB = getAuthToken(adminTenantB);
      const res = await request(app)
        .get(`/api/v1/invoices/${INVOICE_1_A}`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('returns 404 when Admin B attempts to read Student Invoice History for a Student in Tenant A', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminTenantB);
      vi.spyOn(invoiceService, 'getStudentInvoices').mockImplementation(async (schoolId, studentId) => {
        if (schoolId === TENANT_B && studentId === STUDENT_1_A) {
          throw new NotFoundError('Student');
        }
        return { invoices: [], pagination: {}, summary: {} };
      });

      const tokenB = getAuthToken(adminTenantB);
      const res = await request(app)
        .get(`/api/v1/students/${STUDENT_1_A}/invoices`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('2. Parent Child-Scope Authorization', () => {
    it('allows Parent A to access invoices for linked Student 1 and Student 2', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(parentTenantA);
      vi.spyOn(invoiceService, 'getInvoiceById').mockImplementation(async (_schoolId, id) => {
        if (id === INVOICE_1_A) {
          return { id: INVOICE_1_A, studentId: STUDENT_1_A, amount: 50000 };
        }
        throw new NotFoundError('Invoice');
      });

      const tokenParent = getAuthToken(parentTenantA);
      const res = await request(app)
        .get(`/api/v1/invoices/${INVOICE_1_A}`)
        .set('Authorization', `Bearer ${tokenParent}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(INVOICE_1_A);
    });

    it('denies Parent A access to Student 3 invoice with 404 (no existence disclosure)', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(parentTenantA);
      vi.spyOn(invoiceService, 'getInvoiceById').mockImplementation(async () => {
        // INVOICE_3_A belongs to STUDENT_3_A, not linked to Parent A
        throw new NotFoundError('Invoice');
      });

      const tokenParent = getAuthToken(parentTenantA);
      const res = await request(app)
        .get(`/api/v1/invoices/${INVOICE_3_A}`)
        .set('Authorization', `Bearer ${tokenParent}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('denies Parent A access to Student 3 invoice history with 404', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(parentTenantA);
      vi.spyOn(invoiceService, 'getStudentInvoices').mockImplementation(async () => {
        // STUDENT_3_A is not linked to Parent A
        throw new NotFoundError('Student');
      });

      const tokenParent = getAuthToken(parentTenantA);
      const res = await request(app)
        .get(`/api/v1/students/${STUDENT_3_A}/invoices`)
        .set('Authorization', `Bearer ${tokenParent}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('returns empty scoped list when Parent A queries list with studentId=Student3', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(parentTenantA);
      vi.spyOn(invoiceService, 'listInvoices').mockResolvedValue({
        invoices: [],
        pagination: { page: 1, limit: 50, total: 0, totalPages: 1, hasNextPage: false, hasPrevPage: false }
      });

      const tokenParent = getAuthToken(parentTenantA);
      const res = await request(app)
        .get(`/api/v1/invoices?studentId=${STUDENT_3_A}`)
        .set('Authorization', `Bearer ${tokenParent}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.pagination.total).toBe(0);
    });

    it('strictly denies Parent access to institutional stats with 403 Forbidden', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(parentTenantA);
      const tokenParent = getAuthToken(parentTenantA);

      const res = await request(app)
        .get('/api/v1/invoices/stats')
        .set('Authorization', `Bearer ${tokenParent}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('3. Tenant Parameter Poisoning Protection', () => {
    it('rejects invoice list query with conflicting schoolId passed in query string', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminTenantA);

      const tokenA = getAuthToken(adminTenantA);
      const res = await request(app)
        .get(`/api/v1/invoices?schoolId=${TENANT_B}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('rejects invoice cancellation with conflicting schoolId passed in body', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminTenantA);

      const tokenA = getAuthToken(adminTenantA);
      const res = await request(app)
        .patch(`/api/v1/invoices/${INVOICE_1_A}/cancel`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ schoolId: TENANT_B, reason: 'Poison attempt' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('4. Cancellation Tenant & Role Security (Phase 4C.6-B2)', () => {
    it('returns 404 when Admin B attempts to cancel Invoice belonging to Tenant A', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminTenantB);
      vi.spyOn(invoiceService, 'cancelInvoice').mockImplementation(async (schoolId, id) => {
        if (schoolId === TENANT_B && id === INVOICE_1_A) {
          throw new NotFoundError('Invoice');
        }
        return { id: INVOICE_1_A, status: 'Cancelled' };
      });

      const tokenB = getAuthToken(adminTenantB);
      const res = await request(app)
        .patch(`/api/v1/invoices/${INVOICE_1_A}/cancel`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('strictly denies Parent from cancelling invoice with 403 Forbidden', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(parentTenantA);
      const tokenParent = getAuthToken(parentTenantA);

      const res = await request(app)
        .patch(`/api/v1/invoices/${INVOICE_1_A}/cancel`)
        .set('Authorization', `Bearer ${tokenParent}`)
        .send({ reason: 'Parent cancel' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('5. Payment Settlement Tenant & Role Security (Phase 4C.6-C)', () => {
    it('returns 404 when Admin B attempts to record payment for Invoice belonging to Tenant A', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminTenantB);
      vi.spyOn(invoiceService, 'payInvoice').mockImplementation(async (schoolId, id) => {
        if (schoolId === TENANT_B && id === INVOICE_1_A) {
          throw new NotFoundError('Invoice');
        }
        return { id: INVOICE_1_A, status: 'Paid' };
      });

      const tokenB = getAuthToken(adminTenantB);
      const res = await request(app)
        .post(`/api/v1/invoices/${INVOICE_1_A}/pay`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ paymentMode: 'Cash' });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('denies Parent A from paying invoice of unlinked student with 404 (zero existence disclosure)', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(parentTenantA);
      vi.spyOn(invoiceService, 'payInvoice').mockImplementation(async () => {
        // INVOICE_3_A belongs to unlinked student
        throw new NotFoundError('Invoice');
      });

      const tokenParent = getAuthToken(parentTenantA);
      const res = await request(app)
        .post(`/api/v1/invoices/${INVOICE_3_A}/pay`)
        .set('Authorization', `Bearer ${tokenParent}`)
        .send({ paymentMode: 'Online' });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('rejects payment request with conflicting schoolId passed in body', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminTenantA);

      const tokenA = getAuthToken(adminTenantA);
      const res = await request(app)
        .post(`/api/v1/invoices/${INVOICE_1_A}/pay`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ schoolId: TENANT_B, paymentMode: 'Cash' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('6. Report & Dashboard Tenant Isolation and Role Security (Phase 4C.6-D)', () => {
    const STUDENT_USER_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    const TEACHER_USER_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

    const studentTenantA = {
      id: STUDENT_USER_ID,
      schoolId: TENANT_A,
      email: 'student.a@school.edu',
      systemRole: SYSTEM_ROLES.STUDENT,
      tokenVersion: 1,
      isActive: true,
      school: { id: TENANT_A, name: 'School A', code: 'SchoolA', status: 'active' }
    };

    const teacherWithoutFeesRead = {
      id: TEACHER_USER_ID,
      schoolId: TENANT_A,
      email: 'teacher.a@school.edu',
      systemRole: SYSTEM_ROLES.TEACHER,
      tokenVersion: 1,
      isActive: true,
      school: { id: TENANT_A, name: 'School A', code: 'SchoolA', status: 'active' }
    };

    it('ensures stats are strictly scoped to authenticated tenant (School A vs School B)', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminTenantA);
      const tokenA = getAuthToken(adminTenantA);

      const statsA = { totalExpected: 100000, collectedAmount: 50000 };
      vi.spyOn(invoiceService, 'getInvoiceStats').mockImplementation(async (schoolId) => {
        expect(schoolId).toBe(TENANT_A);
        return statsA;
      });

      const res = await request(app)
        .get('/api/v1/invoices/stats')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual(statsA);
    });

    it('denies Parent access to institutional stats, class reports, period reports, and monthly revenue with 403', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(parentTenantA);
      const tokenParent = getAuthToken(parentTenantA);

      const resStats = await request(app).get('/api/v1/invoices/stats').set('Authorization', `Bearer ${tokenParent}`);
      expect(resStats.status).toBe(403);

      const resClass = await request(app).get('/api/v1/invoices/reports/class-wise').set('Authorization', `Bearer ${tokenParent}`);
      expect(resClass.status).toBe(403);

      const resPeriod = await request(app).get('/api/v1/invoices/reports/period-wise').set('Authorization', `Bearer ${tokenParent}`);
      expect(resPeriod.status).toBe(403);

      const resMonthly = await request(app).get('/api/v1/invoices/reports/monthly-revenue').set('Authorization', `Bearer ${tokenParent}`);
      expect(resMonthly.status).toBe(403);
    });

    it('denies Student access to all institutional reporting endpoints with 403', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(studentTenantA);
      const tokenStudent = getAuthToken(studentTenantA);

      const resStats = await request(app).get('/api/v1/invoices/stats').set('Authorization', `Bearer ${tokenStudent}`);
      expect(resStats.status).toBe(403);

      const resClass = await request(app).get('/api/v1/invoices/reports/class-wise').set('Authorization', `Bearer ${tokenStudent}`);
      expect(resClass.status).toBe(403);

      const resPeriod = await request(app).get('/api/v1/invoices/reports/period-wise').set('Authorization', `Bearer ${tokenStudent}`);
      expect(resPeriod.status).toBe(403);

      const resMonthly = await request(app).get('/api/v1/invoices/reports/monthly-revenue').set('Authorization', `Bearer ${tokenStudent}`);
      expect(resMonthly.status).toBe(403);
    });

    it('denies Teacher without fees.read permission with 403', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(teacherWithoutFeesRead);
      const tokenTeacher = getAuthToken(teacherWithoutFeesRead);

      const resStats = await request(app).get('/api/v1/invoices/stats').set('Authorization', `Bearer ${tokenTeacher}`);
      expect(resStats.status).toBe(403);

      const resClass = await request(app).get('/api/v1/invoices/reports/class-wise').set('Authorization', `Bearer ${tokenTeacher}`);
      expect(resClass.status).toBe(403);

      const resPeriod = await request(app).get('/api/v1/invoices/reports/period-wise').set('Authorization', `Bearer ${tokenTeacher}`);
      expect(resPeriod.status).toBe(403);

      const resMonthly = await request(app).get('/api/v1/invoices/reports/monthly-revenue').set('Authorization', `Bearer ${tokenTeacher}`);
      expect(resMonthly.status).toBe(403);
    });
  });
});


