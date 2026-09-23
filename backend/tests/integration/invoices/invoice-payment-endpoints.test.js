import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/app.js';
import * as invoiceService from '../../../src/modules/invoices/invoice.service.js';
import * as authRepository from '../../../src/modules/auth/auth.repository.js';
import * as tokenService from '../../../src/modules/auth/token.service.js';
import { SYSTEM_ROLES } from '../../../src/config/constants.js';
import { NotFoundError, ConflictError, ValidationError } from '../../../src/utils/app-error.js';



describe('Invoice Payment API Endpoints Integration Tests (Phase 4C.6-C)', () => {
  const app = createApp();

  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
  const ADMIN_ID = '22222222-2222-4222-8222-222222222222';
  const TEACHER_ID = '33333333-3333-4333-8333-333333333333';
  const PARENT_ID = '44444444-4444-4444-8444-444444444444';
  const STUDENT_USER_ID = '55555555-5555-4555-8555-555555555555';
  const INVOICE_ID = '66666666-6666-4666-8666-666666666666';
  const STUDENT_ID = '77777777-7777-4777-8777-777777777777';

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

  describe('POST /api/v1/invoices/:id/pay', () => {
    it('returns 401 when no token is provided', async () => {
      const res = await request(app).post(`/api/v1/invoices/${INVOICE_ID}/pay`);
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('returns 403 when teacher without fees.edit permission requests payment', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockTeacherUser);
      const token = getAuthToken(mockTeacherUser);

      const res = await request(app)
        .post(`/api/v1/invoices/${INVOICE_ID}/pay`)
        .set('Authorization', `Bearer ${token}`)
        .send({ paymentMode: 'Cash' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('returns 403 when student user attempts payment', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockStudentUser);
      const token = getAuthToken(mockStudentUser);

      const res = await request(app)
        .post(`/api/v1/invoices/${INVOICE_ID}/pay`)
        .set('Authorization', `Bearer ${token}`)
        .send({ paymentMode: 'Online' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('returns 400 for invalid UUID in path param', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      const token = getAuthToken(mockAdminUser);

      const res = await request(app)
        .post('/api/v1/invoices/not-a-uuid/pay')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('returns 400 when invalid paymentMode is sent in body', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      const token = getAuthToken(mockAdminUser);

      const res = await request(app)
        .post(`/api/v1/invoices/${INVOICE_ID}/pay`)
        .set('Authorization', `Bearer ${token}`)
        .send({ paymentMode: 'InvalidMode' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('returns 400 when amount mismatch is thrown by service', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(invoiceService, 'payInvoice').mockRejectedValue(
        new ValidationError('Payment amount does not match invoice obligation')
      );


      const token = getAuthToken(mockAdminUser);
      const res = await request(app)
        .post(`/api/v1/invoices/${INVOICE_ID}/pay`)
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 10000 });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('does not match');
    });

    it('returns 404 when invoice does not exist in tenant', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(invoiceService, 'payInvoice').mockRejectedValue(new NotFoundError('Invoice'));

      const token = getAuthToken(mockAdminUser);
      const res = await request(app)
        .post(`/api/v1/invoices/${INVOICE_ID}/pay`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('returns 409 when invoice is already Cancelled', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(invoiceService, 'payInvoice').mockRejectedValue(
        new ConflictError('Cannot pay a cancelled invoice')
      );

      const token = getAuthToken(mockAdminUser);
      const res = await request(app)
        .post(`/api/v1/invoices/${INVOICE_ID}/pay`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('cancelled invoice');
    });

    it('returns 409 when invoice is already Paid without idempotent retry match', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(invoiceService, 'payInvoice').mockRejectedValue(
        new ConflictError('Invoice has already been paid')
      );

      const token = getAuthToken(mockAdminUser);
      const res = await request(app)
        .post(`/api/v1/invoices/${INVOICE_ID}/pay`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('already been paid');
    });

    it('returns 200 with paid invoice detail when Admin records payment', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(invoiceService, 'payInvoice').mockResolvedValue({
        id: INVOICE_ID,
        schoolId: SCHOOL_ID,
        studentId: STUDENT_ID,
        feeName: 'Annual Tuition 2026',
        amount: 50000,
        dueDate: '2026-08-31',
        status: 'Paid',
        isOverdue: false,
        paymentMode: 'Cash',
        receiptNumber: 'REC-2026-001',
        transactionReference: null,
        paidAt: '2026-09-10T10:00:00.000Z'
      });

      const token = getAuthToken(mockAdminUser);
      const res = await request(app)
        .post(`/api/v1/invoices/${INVOICE_ID}/pay`)
        .set('Authorization', `Bearer ${token}`)
        .send({ paymentMode: 'Cash', receiptNumber: 'REC-2026-001' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(INVOICE_ID);
      expect(res.body.data.status).toBe('Paid');
      expect(res.body.data.paymentMode).toBe('Cash');
      expect(res.body.data.receiptNumber).toBe('REC-2026-001');
    });

    it('returns 200 when Parent settles payment for their linked student', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockParentUser);
      vi.spyOn(invoiceService, 'payInvoice').mockResolvedValue({
        id: INVOICE_ID,
        schoolId: SCHOOL_ID,
        studentId: STUDENT_ID,
        feeName: 'Annual Tuition 2026',
        amount: 50000,
        dueDate: '2026-08-31',
        status: 'Paid',
        isOverdue: false,
        paymentMode: 'Online',
        receiptNumber: 'REC-20260910-A1B2C3',
        transactionReference: 'TXN-ONLINE-999',
        paidAt: '2026-09-10T10:00:00.000Z'
      });

      const token = getAuthToken(mockParentUser);
      const res = await request(app)
        .post(`/api/v1/invoices/${INVOICE_ID}/pay`)
        .set('Authorization', `Bearer ${token}`)
        .send({ transactionReference: 'TXN-ONLINE-999' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('Paid');
      expect(res.body.data.paymentMode).toBe('Online');
      expect(res.body.data.transactionReference).toBe('TXN-ONLINE-999');
    });
  });
});
