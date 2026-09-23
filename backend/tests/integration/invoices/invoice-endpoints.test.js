import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/app.js';
import * as invoiceService from '../../../src/modules/invoices/invoice.service.js';
import * as authRepository from '../../../src/modules/auth/auth.repository.js';
import * as tokenService from '../../../src/modules/auth/token.service.js';
import { SYSTEM_ROLES } from '../../../src/config/constants.js';
import { NotFoundError } from '../../../src/utils/app-error.js';

describe('Invoice API Endpoints Integration Tests (Phase 4C.6-B1)', () => {
  const app = createApp();

  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
  const ADMIN_ID = '22222222-2222-4222-8222-222222222222';
  const TEACHER_ID = '33333333-3333-4333-8333-333333333333';
  const PARENT_ID = '44444444-4444-4444-8444-444444444444';
  const INVOICE_ID = '55555555-5555-4555-8555-555555555555';
  const STUDENT_ID = '66666666-6666-4666-8666-666666666666';

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

  describe('1. GET /api/v1/invoices', () => {
    it('returns 401 when no token is provided', async () => {
      const res = await request(app).get('/api/v1/invoices');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('returns 403 when teacher without fees.read permission requests invoices', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockTeacherUser);
      const token = getAuthToken(mockTeacherUser);

      const res = await request(app)
        .get('/api/v1/invoices')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('returns 400 when invalid query parameters are supplied', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      const token = getAuthToken(mockAdminUser);

      const res = await request(app)
        .get('/api/v1/invoices?page=0&status=InvalidStatus')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('returns 200 with paginated invoices for authorized user', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(invoiceService, 'listInvoices').mockResolvedValue({
        invoices: [{ id: INVOICE_ID, feeName: 'Tuition', amount: 50000, status: 'Pending', isOverdue: false }],
        pagination: { page: 1, limit: 50, total: 1, totalPages: 1, hasNextPage: false, hasPrevPage: false }
      });

      const token = getAuthToken(mockAdminUser);
      const res = await request(app)
        .get('/api/v1/invoices?page=1&limit=50')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(1);
      expect(res.body.pagination.total).toBe(1);
    });
  });

  describe('2. GET /api/v1/invoices/stats', () => {
    it('returns 401 when no token is provided', async () => {
      const res = await request(app).get('/api/v1/invoices/stats');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('returns 403 when parent requests institutional statistics', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockParentUser);
      const token = getAuthToken(mockParentUser);

      const res = await request(app)
        .get('/api/v1/invoices/stats')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('returns 200 with financial statistics for authorized staff', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(invoiceService, 'getInvoiceStats').mockResolvedValue({
        totalExpected: 80000,
        collectedAmount: 30000,
        outstandingAmount: 50000,
        overdueAmount: 50000,
        overdueCount: 1,
        unpaidCount: 1
      });

      const token = getAuthToken(mockAdminUser);
      const res = await request(app)
        .get('/api/v1/invoices/stats')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.totalExpected).toBe(80000);
      expect(res.body.data.collectedAmount).toBe(30000);
      expect(res.body.data.outstandingAmount).toBe(50000);
    });
  });

  describe('3. GET /api/v1/invoices/:id', () => {
    it('returns 400 for invalid UUID format', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      const token = getAuthToken(mockAdminUser);

      const res = await request(app)
        .get('/api/v1/invoices/not-a-uuid')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('returns 404 when invoice does not exist', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(invoiceService, 'getInvoiceById').mockRejectedValue(new NotFoundError('Invoice'));

      const token = getAuthToken(mockAdminUser);
      const res = await request(app)
        .get(`/api/v1/invoices/${INVOICE_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('returns 200 with invoice details and relations for authorized user', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(invoiceService, 'getInvoiceById').mockResolvedValue({
        id: INVOICE_ID,
        feeName: 'Annual Tuition 2026',
        amount: 50000,
        dueDate: '2026-01-15',
        status: 'Pending',
        isOverdue: true,
        student: { id: STUDENT_ID, firstName: 'Alice', lastName: 'Smith' },
        feeStructure: { id: 'fs1', name: 'Annual Tuition 2026' },
        collectionPeriod: null
      });

      const token = getAuthToken(mockAdminUser);
      const res = await request(app)
        .get(`/api/v1/invoices/${INVOICE_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(INVOICE_ID);
      expect(res.body.data.amount).toBe(50000);
      expect(res.body.data.isOverdue).toBe(true);
    });

    it('returns 200 for orphan invoice with null student', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(invoiceService, 'getInvoiceById').mockResolvedValue({
        id: INVOICE_ID,
        feeName: 'Annual Tuition 2026',
        amount: 50000,
        dueDate: '2026-01-15',
        status: 'Pending',
        isOverdue: true,
        studentId: null,
        student: null,
        feeStructure: { id: 'fs1', name: 'Annual Tuition 2026' },
        collectionPeriod: null
      });

      const token = getAuthToken(mockAdminUser);
      const res = await request(app)
        .get(`/api/v1/invoices/${INVOICE_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.studentId).toBeNull();
      expect(res.body.data.student).toBeNull();
    });
  });

  describe('4. GET /api/v1/students/:studentId/invoices', () => {
    it('returns 400 for invalid student UUID format', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      const token = getAuthToken(mockAdminUser);

      const res = await request(app)
        .get('/api/v1/students/not-a-uuid/invoices')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('returns 404 when student does not exist', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(invoiceService, 'getStudentInvoices').mockRejectedValue(new NotFoundError('Student'));

      const token = getAuthToken(mockAdminUser);
      const res = await request(app)
        .get(`/api/v1/students/${STUDENT_ID}/invoices`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('returns 200 with student timeline and financial summary for authorized user', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(invoiceService, 'getStudentInvoices').mockResolvedValue({
        invoices: [{ id: INVOICE_ID, feeName: 'Tuition', amount: 50000, status: 'Pending', isOverdue: true }],
        pagination: { page: 1, limit: 50, total: 1, totalPages: 1, hasNextPage: false, hasPrevPage: false },
        summary: {
          totalInvoiced: 50000,
          paidAmount: 0,
          outstandingAmount: 50000,
          overdueAmount: 50000,
          overdueCount: 1,
          unpaidCount: 1
        }
      });

      const token = getAuthToken(mockAdminUser);
      const res = await request(app)
        .get(`/api/v1/students/${STUDENT_ID}/invoices`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(1);
      expect(res.body.summary.totalInvoiced).toBe(50000);
      expect(res.body.summary.outstandingAmount).toBe(50000);
    });
  });
});
