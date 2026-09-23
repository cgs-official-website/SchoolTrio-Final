import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/app.js';
import * as invoiceService from '../../../src/modules/invoices/invoice.service.js';
import * as authRepository from '../../../src/modules/auth/auth.repository.js';
import * as tokenService from '../../../src/modules/auth/token.service.js';
import { SYSTEM_ROLES } from '../../../src/config/constants.js';
import { NotFoundError, ConflictError } from '../../../src/utils/app-error.js';

describe('Invoice Cancellation API Endpoints Integration Tests (Phase 4C.6-B2)', () => {
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

  describe('PATCH /api/v1/invoices/:id/cancel', () => {
    it('returns 401 when no token is provided', async () => {
      const res = await request(app).patch(`/api/v1/invoices/${INVOICE_ID}/cancel`);
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('returns 403 when teacher without fees.edit permission requests cancellation', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockTeacherUser);
      const token = getAuthToken(mockTeacherUser);

      const res = await request(app)
        .patch(`/api/v1/invoices/${INVOICE_ID}/cancel`)
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: 'Teacher cancel attempt' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('returns 403 when parent requests cancellation', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockParentUser);
      const token = getAuthToken(mockParentUser);

      const res = await request(app)
        .patch(`/api/v1/invoices/${INVOICE_ID}/cancel`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('returns 400 for invalid UUID format in path parameter', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      const token = getAuthToken(mockAdminUser);

      const res = await request(app)
        .patch('/api/v1/invoices/invalid-uuid/cancel')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('returns 400 when invalid body payload is sent', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      const token = getAuthToken(mockAdminUser);

      const res = await request(app)
        .patch(`/api/v1/invoices/${INVOICE_ID}/cancel`)
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: 12345 });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('returns 404 when invoice does not exist in tenant', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(invoiceService, 'cancelInvoice').mockRejectedValue(new NotFoundError('Invoice'));

      const token = getAuthToken(mockAdminUser);
      const res = await request(app)
        .patch(`/api/v1/invoices/${INVOICE_ID}/cancel`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('returns 409 when invoice is already Paid', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(invoiceService, 'cancelInvoice').mockRejectedValue(
        new ConflictError('Cannot cancel invoice because it has already been paid')
      );

      const token = getAuthToken(mockAdminUser);
      const res = await request(app)
        .patch(`/api/v1/invoices/${INVOICE_ID}/cancel`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('already been paid');
    });

    it('returns 409 when invoice is already Cancelled', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(invoiceService, 'cancelInvoice').mockRejectedValue(
        new ConflictError('Invoice is already cancelled')
      );

      const token = getAuthToken(mockAdminUser);
      const res = await request(app)
        .patch(`/api/v1/invoices/${INVOICE_ID}/cancel`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('already cancelled');
    });

    it('returns 409 when Pending invoice contains payment metadata', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(invoiceService, 'cancelInvoice').mockRejectedValue(
        new ConflictError('Cannot cancel invoice with associated payment metadata')
      );

      const token = getAuthToken(mockAdminUser);
      const res = await request(app)
        .patch(`/api/v1/invoices/${INVOICE_ID}/cancel`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('associated payment metadata');
    });

    it('returns 200 with cancelled invoice detail when cancellation succeeds', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(invoiceService, 'cancelInvoice').mockResolvedValue({
        id: INVOICE_ID,
        schoolId: SCHOOL_ID,
        studentId: STUDENT_ID,
        feeName: 'Annual Tuition 2026',
        amount: 50000,
        dueDate: '2026-08-31',
        status: 'Cancelled',
        isOverdue: false,
        student: { id: STUDENT_ID, firstName: 'Alice', lastName: 'Smith' },
        feeStructure: { id: 'fs1', name: 'Annual Tuition 2026' },
        collectionPeriod: null
      });

      const token = getAuthToken(mockAdminUser);
      const res = await request(app)
        .patch(`/api/v1/invoices/${INVOICE_ID}/cancel`)
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: 'Student transferred' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(INVOICE_ID);
      expect(res.body.data.status).toBe('Cancelled');
      expect(res.body.data.isOverdue).toBe(false);
    });

    it('returns 200 when empty body is sent', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(invoiceService, 'cancelInvoice').mockResolvedValue({
        id: INVOICE_ID,
        schoolId: SCHOOL_ID,
        status: 'Cancelled',
        isOverdue: false
      });

      const token = getAuthToken(mockAdminUser);
      const res = await request(app)
        .patch(`/api/v1/invoices/${INVOICE_ID}/cancel`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('Cancelled');
    });
  });
});
