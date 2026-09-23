import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/app.js';
import * as invoiceService from '../../../src/modules/invoices/invoice.service.js';
import * as authRepository from '../../../src/modules/auth/auth.repository.js';
import * as tokenService from '../../../src/modules/auth/token.service.js';
import { SYSTEM_ROLES } from '../../../src/config/constants.js';

describe('Invoice Reports & Dashboard API Endpoints Integration Tests (Phase 4C.6-D)', () => {
  const app = createApp();

  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
  const ADMIN_ID = '22222222-2222-4222-8222-222222222222';
  const TEACHER_ID = '33333333-3333-4333-8333-333333333333';
  const PARENT_ID = '44444444-4444-4444-8444-444444444444';
  const STUDENT_USER_ID = '55555555-5555-4555-8555-555555555555';

  const mockAdminUser = {
    id: ADMIN_ID,
    schoolId: SCHOOL_ID,
    email: 'admin@school.edu',
    systemRole: SYSTEM_ROLES.SCHOOL_ADMIN,
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_ID, name: 'Main School', code: 'MAIN', status: 'active' }
  };

  const mockTeacherUser = {
    id: TEACHER_ID,
    schoolId: SCHOOL_ID,
    email: 'teacher@school.edu',
    systemRole: SYSTEM_ROLES.TEACHER,
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_ID, name: 'Main School', code: 'MAIN', status: 'active' }
  };

  const mockParentUser = {
    id: PARENT_ID,
    schoolId: SCHOOL_ID,
    email: 'parent@school.edu',
    systemRole: SYSTEM_ROLES.PARENT,
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_ID, name: 'Main School', code: 'MAIN', status: 'active' }
  };

  const mockStudentUser = {
    id: STUDENT_USER_ID,
    schoolId: SCHOOL_ID,
    email: 'student@school.edu',
    systemRole: SYSTEM_ROLES.STUDENT,
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_ID, name: 'Main School', code: 'MAIN', status: 'active' }
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

  describe('GET /api/v1/invoices/stats', () => {
    it('returns 401 when no token is provided', async () => {
      const res = await request(app).get('/api/v1/invoices/stats');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('returns 403 when teacher without fees.read requests stats', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockTeacherUser);
      const token = getAuthToken(mockTeacherUser);

      const res = await request(app)
        .get('/api/v1/invoices/stats')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('returns 403 when parent requests institutional stats', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockParentUser);
      const token = getAuthToken(mockParentUser);

      const res = await request(app)
        .get('/api/v1/invoices/stats')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('returns 403 when student requests institutional stats', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockStudentUser);
      const token = getAuthToken(mockStudentUser);

      const res = await request(app)
        .get('/api/v1/invoices/stats')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('returns 400 on invalid UUID query parameters', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      const token = getAuthToken(mockAdminUser);

      const res = await request(app)
        .get('/api/v1/invoices/stats?classId=invalid-uuid')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('returns 200 with institutional statistics for authorized staff', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      const token = getAuthToken(mockAdminUser);

      const mockStats = {
        totalExpected: 7716400,
        collectedAmount: 83850,
        outstandingAmount: 7632550,
        overdueAmount: 7632550,
        collectionPercentage: 1.09,
        paidCount: 1,
        unpaidCount: 103,
        overdueCount: 103,
        cancelledCount: 0,
        unpaidStudentsCount: 98,
        overdueStudentsCount: 98
      };
      vi.spyOn(invoiceService, 'getInvoiceStats').mockResolvedValue(mockStats);

      const res = await request(app)
        .get('/api/v1/invoices/stats')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockStats);
    });
  });

  describe('GET /api/v1/invoices/reports/class-wise', () => {
    it('returns 401 when no token is provided', async () => {
      const res = await request(app).get('/api/v1/invoices/reports/class-wise');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('returns 403 for parent callers', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockParentUser);
      const token = getAuthToken(mockParentUser);

      const res = await request(app)
        .get('/api/v1/invoices/reports/class-wise')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('returns 400 on invalid collectionPeriodId query parameter', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      const token = getAuthToken(mockAdminUser);

      const res = await request(app)
        .get('/api/v1/invoices/reports/class-wise?collectionPeriodId=invalid-uuid')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('returns 200 with class-wise report array for authorized staff', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      const token = getAuthToken(mockAdminUser);

      const mockReports = [
        {
          classId: 'c1',
          className: 'Grade 10',
          invoiceCount: 20,
          studentCount: 18,
          totalAmount: 100000,
          collectedAmount: 50000,
          outstandingAmount: 50000,
          overdueAmount: 25000,
          collectionPercentage: 50,
          paidCount: 10,
          pendingCount: 10,
          overdueCount: 5,
          cancelledCount: 0
        }
      ];
      vi.spyOn(invoiceService, 'getClassWiseReports').mockResolvedValue(mockReports);

      const res = await request(app)
        .get('/api/v1/invoices/reports/class-wise')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockReports);
    });
  });

  describe('GET /api/v1/invoices/reports/period-wise', () => {
    it('returns 401 when no token is provided', async () => {
      const res = await request(app).get('/api/v1/invoices/reports/period-wise');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('returns 403 for parent callers', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockParentUser);
      const token = getAuthToken(mockParentUser);

      const res = await request(app)
        .get('/api/v1/invoices/reports/period-wise')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('returns 200 with period-wise report array for authorized staff', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      const token = getAuthToken(mockAdminUser);

      const mockReports = [
        {
          periodId: 'null_period',
          periodName: 'General (No Period)',
          dueDate: null,
          invoiceCount: 104,
          totalAmount: 7716400,
          collectedAmount: 83850,
          outstandingAmount: 7632550,
          overdueAmount: 7632550,
          collectionPercentage: 1.09,
          paidCount: 1,
          pendingCount: 103,
          overdueCount: 103
        }
      ];
      vi.spyOn(invoiceService, 'getPeriodWiseReports').mockResolvedValue(mockReports);

      const res = await request(app)
        .get('/api/v1/invoices/reports/period-wise')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockReports);
    });
  });

  describe('GET /api/v1/invoices/reports/monthly-revenue', () => {
    it('returns 401 when no token is provided', async () => {
      const res = await request(app).get('/api/v1/invoices/reports/monthly-revenue');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('returns 403 for parent callers', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockParentUser);
      const token = getAuthToken(mockParentUser);

      const res = await request(app)
        .get('/api/v1/invoices/reports/monthly-revenue')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('returns 400 on out-of-bounds months query parameter', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      const token = getAuthToken(mockAdminUser);

      const resZero = await request(app)
        .get('/api/v1/invoices/reports/monthly-revenue?months=0')
        .set('Authorization', `Bearer ${token}`);
      expect(resZero.status).toBe(400);

      const resOver = await request(app)
        .get('/api/v1/invoices/reports/monthly-revenue?months=25')
        .set('Authorization', `Bearer ${token}`);
      expect(resOver.status).toBe(400);
    });

    it('returns 200 with monthly revenue timeline for authorized staff', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      const token = getAuthToken(mockAdminUser);

      const mockRevenue = [
        {
          month: '2026-09',
          monthName: 'Sep 2026',
          collectedAmount: 83850,
          paidCount: 1
        }
      ];
      vi.spyOn(invoiceService, 'getMonthlyRevenueReports').mockResolvedValue(mockRevenue);

      const res = await request(app)
        .get('/api/v1/invoices/reports/monthly-revenue?months=7')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockRevenue);
    });
  });

  describe('Route Ordering & Collision Prevention', () => {
    it('ensures static report routes are NOT intercepted by /:id route validator', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      const token = getAuthToken(mockAdminUser);

      vi.spyOn(invoiceService, 'getInvoiceStats').mockResolvedValue({});
      vi.spyOn(invoiceService, 'getClassWiseReports').mockResolvedValue([]);
      vi.spyOn(invoiceService, 'getPeriodWiseReports').mockResolvedValue([]);
      vi.spyOn(invoiceService, 'getMonthlyRevenueReports').mockResolvedValue([]);

      const resStats = await request(app).get('/api/v1/invoices/stats').set('Authorization', `Bearer ${token}`);
      expect(resStats.status).toBe(200);

      const resClass = await request(app).get('/api/v1/invoices/reports/class-wise').set('Authorization', `Bearer ${token}`);
      expect(resClass.status).toBe(200);

      const resPeriod = await request(app).get('/api/v1/invoices/reports/period-wise').set('Authorization', `Bearer ${token}`);
      expect(resPeriod.status).toBe(200);

      const resMonthly = await request(app).get('/api/v1/invoices/reports/monthly-revenue').set('Authorization', `Bearer ${token}`);
      expect(resMonthly.status).toBe(200);
    });
  });
});
