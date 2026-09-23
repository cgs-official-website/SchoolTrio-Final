import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as invoiceService from '../../../src/modules/invoices/invoice.service.js';
import * as invoiceRepository from '../../../src/modules/invoices/invoice.repository.js';
import {
  ValidationError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
  TenantAccessError
} from '../../../src/utils/app-error.js';
import { SYSTEM_ROLES } from '../../../src/config/constants.js';

import * as auditRepository from '../../../src/modules/audit/audit.repository.js';

vi.mock('../../../src/modules/invoices/invoice.repository.js');
vi.mock('../../../src/database/prisma.client.js', () => ({
  prisma: {
    $transaction: vi.fn(cb => cb({}))
  }
}));
vi.mock('../../../src/modules/audit/audit.repository.js', () => ({
  createAuditLog: vi.fn().mockResolvedValue({ id: 'audit-log-1' })
}));

describe('Invoice Service Unit Tests (Phase 4C.6-B1 & 4C.6-B2)', () => {
  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
  const STUDENT_ID_1 = '22222222-2222-4222-8222-222222222222';
  const STUDENT_ID_2 = '33333333-3333-4333-8333-333333333333';
  const UNLINKED_STUDENT_ID = '44444444-4444-4444-8444-444444444444';
  const INVOICE_ID_1 = '55555555-5555-4555-8555-555555555555';
  const FEE_STRUCTURE_ID = '66666666-6666-4666-8666-666666666666';
  const PARENT_USER_ID = '77777777-7777-4777-8777-777777777777';

  const STAFF_ACTOR = {
    userId: '88888888-8888-4888-8888-888888888888',
    email: 'admin@school.com',
    systemRole: SYSTEM_ROLES.SCHOOL_ADMIN
  };

  const PARENT_ACTOR = {
    userId: PARENT_USER_ID,
    email: 'parent@home.com',
    systemRole: SYSTEM_ROLES.PARENT
  };

  const MOCK_INVOICE_1 = {
    id: INVOICE_ID_1,
    schoolId: SCHOOL_ID,
    studentId: STUDENT_ID_1,
    feeStructureId: FEE_STRUCTURE_ID,
    collectionPeriodId: null,
    feeName: 'Annual Tuition 2026',
    amount: '50000.00',
    dueDate: '2026-01-15', // past date -> overdue if Pending
    status: 'Pending',
    paidAt: null,
    paymentMode: null,
    transactionReference: null,
    receiptNumber: null,
    customData: { note: 'historical snapshot' },
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    student: {
      id: STUDENT_ID_1,
      admissionNumber: 'ADM-001',
      firstName: 'Alice',
      lastName: 'Smith',
      status: 'Active',
      class: { id: 'c1', name: 'Grade 10' },
      section: { id: 's1', name: 'A' }
    },
    feeStructure: {
      id: FEE_STRUCTURE_ID,
      name: 'Annual Tuition 2026 Updated Template',
      amount: '55000.00', // Note: template differs from snapshot
      dueDate: '2026-02-15',
      classId: 'c1',
      collectionPeriodId: null
    },
    collectionPeriod: null
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('formatInvoice Helper', () => {
    it('correctly calculates dynamic overdue and preserves snapshot fields', () => {
      const formatted = invoiceService.formatInvoice(MOCK_INVOICE_1, '2026-09-10');
      expect(formatted.id).toBe(INVOICE_ID_1);
      expect(formatted.amount).toBe(50000); // from Invoice, NOT FeeStructure 55000
      expect(formatted.feeName).toBe('Annual Tuition 2026');
      expect(formatted.dueDate).toBe('2026-01-15');
      expect(formatted.isOverdue).toBe(true); // Pending + 2026-01-15 < 2026-09-10
      expect(formatted.student.firstName).toBe('Alice');
      expect(formatted.collectionPeriod).toBeNull();
    });

    it('marks Paid or Cancelled invoices as isOverdue = false regardless of due date', () => {
      const paidInvoice = { ...MOCK_INVOICE_1, status: 'Paid' };
      const cancelledInvoice = { ...MOCK_INVOICE_1, status: 'Cancelled' };

      expect(invoiceService.formatInvoice(paidInvoice, '2026-09-10').isOverdue).toBe(false);
      expect(invoiceService.formatInvoice(cancelledInvoice, '2026-09-10').isOverdue).toBe(false);
    });

    it('handles orphan invoices with null student safely', () => {
      const orphanInvoice = { ...MOCK_INVOICE_1, studentId: null, student: null };
      const formatted = invoiceService.formatInvoice(orphanInvoice, '2026-09-10');
      expect(formatted.studentId).toBeNull();
      expect(formatted.student).toBeNull();
    });
  });

  describe('listInvoices', () => {
    it('throws TenantAccessError when schoolId is missing', async () => {
      await expect(invoiceService.listInvoices(null, {}, STAFF_ACTOR)).rejects.toThrow(TenantAccessError);
    });

    it('allows institutional staff to query all invoices with filters and pagination', async () => {
      invoiceRepository.findInvoices.mockResolvedValue({
        invoices: [MOCK_INVOICE_1],
        total: 1
      });

      const result = await invoiceService.listInvoices(
        SCHOOL_ID,
        { page: 1, limit: 10, status: 'Pending', search: 'Alice' },
        STAFF_ACTOR
      );

      expect(invoiceRepository.findInvoices).toHaveBeenCalledWith(SCHOOL_ID, {
        page: 1,
        limit: 10,
        classId: undefined,
        feeStructureId: undefined,
        collectionPeriodId: undefined,
        status: 'Pending',
        overdue: undefined,
        search: 'Alice',
        order: 'desc'
      });
      expect(result.invoices.length).toBe(1);
      expect(result.invoices[0].amount).toBe(50000);
      expect(result.pagination.total).toBe(1);
    });

    it('derives authorized student IDs for parent users and scopes list query', async () => {
      invoiceRepository.findAuthorizedStudentIdsForParent.mockResolvedValue([STUDENT_ID_1, STUDENT_ID_2]);
      invoiceRepository.findInvoices.mockResolvedValue({
        invoices: [MOCK_INVOICE_1],
        total: 1
      });

      const result = await invoiceService.listInvoices(SCHOOL_ID, {}, PARENT_ACTOR);

      expect(invoiceRepository.findAuthorizedStudentIdsForParent).toHaveBeenCalledWith(SCHOOL_ID, PARENT_USER_ID);
      expect(invoiceRepository.findInvoices).toHaveBeenCalledWith(SCHOOL_ID, expect.objectContaining({
        studentIds: [STUDENT_ID_1, STUDENT_ID_2]
      }));
      expect(result.invoices.length).toBe(1);
    });

    it('returns empty result when parent has no linked active students', async () => {
      invoiceRepository.findAuthorizedStudentIdsForParent.mockResolvedValue([]);

      const result = await invoiceService.listInvoices(SCHOOL_ID, {}, PARENT_ACTOR);

      expect(result.invoices).toEqual([]);
      expect(result.pagination.total).toBe(0);
      expect(invoiceRepository.findInvoices).not.toHaveBeenCalled();
    });

    it('returns empty result when parent filters by an unlinked student ID', async () => {
      invoiceRepository.findAuthorizedStudentIdsForParent.mockResolvedValue([STUDENT_ID_1]);

      const result = await invoiceService.listInvoices(
        SCHOOL_ID,
        { studentId: UNLINKED_STUDENT_ID },
        PARENT_ACTOR
      );

      expect(result.invoices).toEqual([]);
      expect(result.pagination.total).toBe(0);
      expect(invoiceRepository.findInvoices).not.toHaveBeenCalled();
    });
  });

  describe('getInvoiceById', () => {
    it('throws TenantAccessError when schoolId is missing', async () => {
      await expect(invoiceService.getInvoiceById(null, INVOICE_ID_1, STAFF_ACTOR)).rejects.toThrow(TenantAccessError);
    });

    it('throws NotFoundError if invoice does not exist in tenant', async () => {
      invoiceRepository.findInvoiceById.mockResolvedValue(null);
      await expect(invoiceService.getInvoiceById(SCHOOL_ID, INVOICE_ID_1, STAFF_ACTOR)).rejects.toThrow(NotFoundError);
    });

    it('allows institutional staff to retrieve invoice details including snapshot', async () => {
      invoiceRepository.findInvoiceById.mockResolvedValue(MOCK_INVOICE_1);

      const invoice = await invoiceService.getInvoiceById(SCHOOL_ID, INVOICE_ID_1, STAFF_ACTOR);

      expect(invoice.id).toBe(INVOICE_ID_1);
      expect(invoice.amount).toBe(50000);
      expect(invoice.feeName).toBe('Annual Tuition 2026');
      expect(invoice.student.firstName).toBe('Alice');
    });

    it('allows institutional staff to retrieve orphan invoices', async () => {
      const orphan = { ...MOCK_INVOICE_1, studentId: null, student: null };
      invoiceRepository.findInvoiceById.mockResolvedValue(orphan);

      const invoice = await invoiceService.getInvoiceById(SCHOOL_ID, INVOICE_ID_1, STAFF_ACTOR);

      expect(invoice.id).toBe(INVOICE_ID_1);
      expect(invoice.studentId).toBeNull();
      expect(invoice.student).toBeNull();
    });

    it('allows parent to retrieve invoice for their linked child', async () => {
      invoiceRepository.findInvoiceById.mockResolvedValue(MOCK_INVOICE_1);
      invoiceRepository.findAuthorizedStudentIdsForParent.mockResolvedValue([STUDENT_ID_1]);

      const invoice = await invoiceService.getInvoiceById(SCHOOL_ID, INVOICE_ID_1, PARENT_ACTOR);

      expect(invoice.id).toBe(INVOICE_ID_1);
      expect(invoice.studentId).toBe(STUDENT_ID_1);
    });

    it('blocks parent from retrieving invoice belonging to unlinked child with 404', async () => {
      invoiceRepository.findInvoiceById.mockResolvedValue(MOCK_INVOICE_1); // MOCK_INVOICE_1 belongs to STUDENT_ID_1
      invoiceRepository.findAuthorizedStudentIdsForParent.mockResolvedValue([STUDENT_ID_2]); // Parent only has STUDENT_ID_2

      await expect(invoiceService.getInvoiceById(SCHOOL_ID, INVOICE_ID_1, PARENT_ACTOR)).rejects.toThrow(NotFoundError);
    });

    it('blocks parent from retrieving orphan invoice with 404', async () => {
      const orphan = { ...MOCK_INVOICE_1, studentId: null, student: null };
      invoiceRepository.findInvoiceById.mockResolvedValue(orphan);

      await expect(invoiceService.getInvoiceById(SCHOOL_ID, INVOICE_ID_1, PARENT_ACTOR)).rejects.toThrow(NotFoundError);
    });
  });

  describe('getInvoiceStats', () => {
    it('throws ForbiddenError when a parent requests institutional statistics', async () => {
      await expect(invoiceService.getInvoiceStats(SCHOOL_ID, {}, PARENT_ACTOR)).rejects.toThrow(ForbiddenError);
    });

    it('allows institutional staff to retrieve aggregate statistics', async () => {
      const mockStats = {
        totalExpected: 80000,
        collectedAmount: 30000,
        outstandingAmount: 50000,
        overdueAmount: 50000,
        overdueCount: 1,
        unpaidCount: 1
      };
      invoiceRepository.aggregateInvoiceStats.mockResolvedValue(mockStats);

      const stats = await invoiceService.getInvoiceStats(SCHOOL_ID, { classId: 'c1' }, STAFF_ACTOR);

      expect(invoiceRepository.aggregateInvoiceStats).toHaveBeenCalledWith(SCHOOL_ID, {
        classId: 'c1',
        studentId: undefined,
        feeStructureId: undefined,
        collectionPeriodId: undefined
      });
      expect(stats.totalExpected).toBe(80000);
      expect(stats.collectedAmount).toBe(30000);
      expect(stats.outstandingAmount).toBe(50000);
    });
  });

  describe('getStudentInvoices', () => {
    it('throws NotFoundError if target student does not exist in tenant', async () => {
      invoiceRepository.findStudentInTenant.mockResolvedValue(null);

      await expect(
        invoiceService.getStudentInvoices(SCHOOL_ID, UNLINKED_STUDENT_ID, {}, STAFF_ACTOR)
      ).rejects.toThrow(NotFoundError);
    });

    it('allows institutional staff to retrieve student invoice timeline and balance summary', async () => {
      invoiceRepository.findStudentInTenant.mockResolvedValue({ id: STUDENT_ID_1, firstName: 'Alice' });
      invoiceRepository.findStudentInvoices.mockResolvedValue({
        invoices: [MOCK_INVOICE_1],
        total: 1
      });
      invoiceRepository.aggregateStudentInvoiceStats.mockResolvedValue({
        totalInvoiced: 50000,
        paidAmount: 0,
        outstandingAmount: 50000,
        overdueAmount: 50000,
        overdueCount: 1,
        unpaidCount: 1
      });

      const result = await invoiceService.getStudentInvoices(SCHOOL_ID, STUDENT_ID_1, {}, STAFF_ACTOR);

      expect(result.invoices.length).toBe(1);
      expect(result.summary.totalInvoiced).toBe(50000);
      expect(result.summary.outstandingAmount).toBe(50000);
    });

    it('allows parent to retrieve invoice history for their linked child', async () => {
      invoiceRepository.findStudentInTenant.mockResolvedValue({ id: STUDENT_ID_1, firstName: 'Alice' });
      invoiceRepository.findAuthorizedStudentIdsForParent.mockResolvedValue([STUDENT_ID_1]);
      invoiceRepository.findStudentInvoices.mockResolvedValue({
        invoices: [MOCK_INVOICE_1],
        total: 1
      });
      invoiceRepository.aggregateStudentInvoiceStats.mockResolvedValue({
        totalInvoiced: 50000,
        paidAmount: 0,
        outstandingAmount: 50000,
        overdueAmount: 50000,
        overdueCount: 1,
        unpaidCount: 1
      });

      const result = await invoiceService.getStudentInvoices(SCHOOL_ID, STUDENT_ID_1, {}, PARENT_ACTOR);

      expect(result.invoices.length).toBe(1);
      expect(result.summary.outstandingAmount).toBe(50000);
    });

    it('blocks parent from retrieving history for unlinked student with 404', async () => {
      invoiceRepository.findStudentInTenant.mockResolvedValue({ id: UNLINKED_STUDENT_ID, firstName: 'Bob' });
      invoiceRepository.findAuthorizedStudentIdsForParent.mockResolvedValue([STUDENT_ID_1]);

      await expect(
        invoiceService.getStudentInvoices(SCHOOL_ID, UNLINKED_STUDENT_ID, {}, PARENT_ACTOR)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('cancelInvoice (Phase 4C.6-B2)', () => {
    it('throws TenantAccessError when schoolId is missing', async () => {
      await expect(invoiceService.cancelInvoice(null, INVOICE_ID_1, {}, STAFF_ACTOR)).rejects.toThrow(TenantAccessError);
    });

    it('throws NotFoundError if invoice does not exist in tenant', async () => {
      invoiceRepository.findInvoiceByIdForUpdate.mockResolvedValue(null);

      await expect(
        invoiceService.cancelInvoice(SCHOOL_ID, INVOICE_ID_1, {}, STAFF_ACTOR)
      ).rejects.toThrow(NotFoundError);
    });

    it('successfully cancels a Pending invoice without payment metadata under row lock', async () => {
      invoiceRepository.findInvoiceByIdForUpdate.mockResolvedValue({
        id: INVOICE_ID_1,
        schoolId: SCHOOL_ID,
        studentId: STUDENT_ID_1,
        status: 'Pending',
        amount: '50000.00',
        feeName: 'Annual Tuition 2026',
        paidAt: null,
        paymentMode: null,
        transactionReference: null,
        receiptNumber: null
      });

      const cancelledRaw = {
        ...MOCK_INVOICE_1,
        status: 'Cancelled'
      };
      invoiceRepository.cancelInvoice.mockResolvedValue(cancelledRaw);

      const result = await invoiceService.cancelInvoice(
        SCHOOL_ID,
        INVOICE_ID_1,
        { reason: 'Student transferred' },
        STAFF_ACTOR
      );

      expect(invoiceRepository.findInvoiceByIdForUpdate).toHaveBeenCalledWith(SCHOOL_ID, INVOICE_ID_1, expect.anything());
      expect(invoiceRepository.cancelInvoice).toHaveBeenCalledWith(SCHOOL_ID, INVOICE_ID_1, expect.anything());
      expect(result.status).toBe('Cancelled');
      expect(result.isOverdue).toBe(false);
      expect(result.amount).toBe(50000);

      expect(auditRepository.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
        schoolId: SCHOOL_ID,
        entityType: 'Invoice',
        entityId: INVOICE_ID_1,
        actionPerformed: 'CANCEL_INVOICE',
        modifiedFields: {
          status: {
            old: 'Pending',
            new: 'Cancelled'
          },
          reason: 'Student transferred'
        }
      }));
    });

    it('rejects cancellation of Paid invoice with ConflictError (409)', async () => {
      invoiceRepository.findInvoiceByIdForUpdate.mockResolvedValue({
        id: INVOICE_ID_1,
        schoolId: SCHOOL_ID,
        status: 'Paid',
        paidAt: new Date()
      });

      await expect(
        invoiceService.cancelInvoice(SCHOOL_ID, INVOICE_ID_1, {}, STAFF_ACTOR)
      ).rejects.toThrow(ConflictError);

      expect(invoiceRepository.cancelInvoice).not.toHaveBeenCalled();
    });

    it('rejects cancellation of already Cancelled invoice with ConflictError (409)', async () => {
      invoiceRepository.findInvoiceByIdForUpdate.mockResolvedValue({
        id: INVOICE_ID_1,
        schoolId: SCHOOL_ID,
        status: 'Cancelled'
      });

      await expect(
        invoiceService.cancelInvoice(SCHOOL_ID, INVOICE_ID_1, {}, STAFF_ACTOR)
      ).rejects.toThrow(ConflictError);

      expect(invoiceRepository.cancelInvoice).not.toHaveBeenCalled();
    });

    it('rejects cancellation of Pending invoice with paidAt payment metadata', async () => {
      invoiceRepository.findInvoiceByIdForUpdate.mockResolvedValue({
        id: INVOICE_ID_1,
        schoolId: SCHOOL_ID,
        status: 'Pending',
        paidAt: new Date(),
        paymentMode: null,
        transactionReference: null,
        receiptNumber: null
      });

      await expect(
        invoiceService.cancelInvoice(SCHOOL_ID, INVOICE_ID_1, {}, STAFF_ACTOR)
      ).rejects.toThrow(ConflictError);

      expect(invoiceRepository.cancelInvoice).not.toHaveBeenCalled();
    });

    it('rejects cancellation of Pending invoice with paymentMode payment metadata', async () => {
      invoiceRepository.findInvoiceByIdForUpdate.mockResolvedValue({
        id: INVOICE_ID_1,
        schoolId: SCHOOL_ID,
        status: 'Pending',
        paidAt: null,
        paymentMode: 'Cash',
        transactionReference: null,
        receiptNumber: null
      });

      await expect(
        invoiceService.cancelInvoice(SCHOOL_ID, INVOICE_ID_1, {}, STAFF_ACTOR)
      ).rejects.toThrow(ConflictError);
    });

    it('rejects cancellation of Pending invoice with transactionReference payment metadata', async () => {
      invoiceRepository.findInvoiceByIdForUpdate.mockResolvedValue({
        id: INVOICE_ID_1,
        schoolId: SCHOOL_ID,
        status: 'Pending',
        paidAt: null,
        paymentMode: null,
        transactionReference: 'TXN-12345',
        receiptNumber: null
      });

      await expect(
        invoiceService.cancelInvoice(SCHOOL_ID, INVOICE_ID_1, {}, STAFF_ACTOR)
      ).rejects.toThrow(ConflictError);
    });

    it('rejects cancellation of Pending invoice with receiptNumber payment metadata', async () => {
      invoiceRepository.findInvoiceByIdForUpdate.mockResolvedValue({
        id: INVOICE_ID_1,
        schoolId: SCHOOL_ID,
        status: 'Pending',
        paidAt: null,
        paymentMode: null,
        transactionReference: null,
        receiptNumber: 'REC-999'
      });

      await expect(
        invoiceService.cancelInvoice(SCHOOL_ID, INVOICE_ID_1, {}, STAFF_ACTOR)
      ).rejects.toThrow(ConflictError);
    });

    it('allows cancellation of orphan invoice by authorized staff', async () => {
      const orphanInvoice = {
        ...MOCK_INVOICE_1,
        studentId: null,
        student: null,
        status: 'Pending'
      };
      invoiceRepository.findInvoiceByIdForUpdate.mockResolvedValue(orphanInvoice);
      invoiceRepository.cancelInvoice.mockResolvedValue({ ...orphanInvoice, status: 'Cancelled' });

      const result = await invoiceService.cancelInvoice(SCHOOL_ID, INVOICE_ID_1, {}, STAFF_ACTOR);

      expect(result.status).toBe('Cancelled');
      expect(result.studentId).toBeNull();
      expect(result.student).toBeNull();
    });

    it('audit failure does not abort or roll back cancellation', async () => {
      invoiceRepository.findInvoiceByIdForUpdate.mockResolvedValue({
        id: INVOICE_ID_1,
        schoolId: SCHOOL_ID,
        status: 'Pending'
      });
      invoiceRepository.cancelInvoice.mockResolvedValue({ ...MOCK_INVOICE_1, status: 'Cancelled' });
      auditRepository.createAuditLog.mockRejectedValue(new Error('Audit DB down'));

      const result = await invoiceService.cancelInvoice(SCHOOL_ID, INVOICE_ID_1, {}, STAFF_ACTOR);

      expect(result.status).toBe('Cancelled');
    });
  });

  describe('payInvoice (Phase 4C.6-C)', () => {
    it('throws TenantAccessError when schoolId is missing', async () => {
      await expect(invoiceService.payInvoice(null, INVOICE_ID_1, {}, STAFF_ACTOR)).rejects.toThrow(TenantAccessError);
    });

    it('throws NotFoundError if invoice does not exist in tenant', async () => {
      invoiceRepository.findInvoiceByIdForUpdate.mockResolvedValue(null);

      await expect(
        invoiceService.payInvoice(SCHOOL_ID, INVOICE_ID_1, {}, STAFF_ACTOR)
      ).rejects.toThrow(NotFoundError);
    });

    it('successfully settles payment for Pending invoice with custom parameters', async () => {
      invoiceRepository.findInvoiceByIdForUpdate.mockResolvedValue({
        id: INVOICE_ID_1,
        schoolId: SCHOOL_ID,
        studentId: STUDENT_ID_1,
        status: 'Pending',
        amount: '50000.00',
        feeName: 'Annual Tuition 2026',
        dueDate: '2026-08-31',
        paidAt: null,
        paymentMode: null,
        transactionReference: null,
        receiptNumber: null
      });

      const settledRaw = {
        ...MOCK_INVOICE_1,
        status: 'Paid',
        paidAt: new Date('2026-09-01T10:00:00.000Z'),
        paymentMode: 'Cheque',
        transactionReference: 'CHQ-12345',
        receiptNumber: 'REC-PAPER-01'
      };
      invoiceRepository.settleInvoicePayment.mockResolvedValue(settledRaw);

      const result = await invoiceService.payInvoice(
        SCHOOL_ID,
        INVOICE_ID_1,
        {
          paymentMode: 'Cheque',
          transactionReference: 'CHQ-12345',
          receiptNumber: 'REC-PAPER-01',
          paidAt: '2026-09-01T10:00:00.000Z'
        },
        STAFF_ACTOR
      );


      expect(invoiceRepository.findInvoiceByIdForUpdate).toHaveBeenCalledWith(SCHOOL_ID, INVOICE_ID_1, expect.anything());
      expect(invoiceRepository.settleInvoicePayment).toHaveBeenCalledWith(
        SCHOOL_ID,
        INVOICE_ID_1,
        expect.objectContaining({
          paymentMode: 'Cheque',
          transactionReference: 'CHQ-12345',
          receiptNumber: 'REC-PAPER-01'
        }),
        expect.anything()
      );
      expect(result.status).toBe('Paid');
      expect(result.isOverdue).toBe(false);
      expect(result.paymentMode).toBe('Cheque');
      expect(result.receiptNumber).toBe('REC-PAPER-01');

      expect(auditRepository.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
        schoolId: SCHOOL_ID,
        entityType: 'Invoice',
        entityId: INVOICE_ID_1,
        actionPerformed: 'RECORD_PAYMENT',
        modifiedFields: expect.objectContaining({
          status: { old: 'Pending', new: 'Paid' },
          amount: 50000,
          paymentMode: 'Cheque',
          transactionReference: 'CHQ-12345',
          receiptNumber: 'REC-PAPER-01'
        })
      }));
    });

    it('defaults paymentMode to Cash and auto-generates receiptNumber for staff when omitted', async () => {
      invoiceRepository.findInvoiceByIdForUpdate.mockResolvedValue({
        id: INVOICE_ID_1,
        schoolId: SCHOOL_ID,
        studentId: STUDENT_ID_1,
        status: 'Pending',
        amount: '50000.00'
      });

      invoiceRepository.settleInvoicePayment.mockImplementation(async (_schoolId, _id, paymentData) => ({
        ...MOCK_INVOICE_1,
        status: 'Paid',
        paidAt: paymentData.paidAt,
        paymentMode: paymentData.paymentMode,
        transactionReference: paymentData.transactionReference,
        receiptNumber: paymentData.receiptNumber
      }));

      const result = await invoiceService.payInvoice(SCHOOL_ID, INVOICE_ID_1, {}, STAFF_ACTOR);

      expect(result.status).toBe('Paid');
      expect(result.paymentMode).toBe('Cash');
      expect(result.receiptNumber).toMatch(/^REC-\d{8}-[A-F0-9]{6}$/);
    });

    it('defaults paymentMode to Online for parent callers when omitted', async () => {
      invoiceRepository.findAuthorizedStudentIdsForParent.mockResolvedValue([STUDENT_ID_1]);
      invoiceRepository.findInvoiceByIdForUpdate.mockResolvedValue({
        id: INVOICE_ID_1,
        schoolId: SCHOOL_ID,
        studentId: STUDENT_ID_1,
        status: 'Pending',
        amount: '50000.00'
      });

      invoiceRepository.settleInvoicePayment.mockImplementation(async (_schoolId, _id, paymentData) => ({
        ...MOCK_INVOICE_1,
        status: 'Paid',
        paymentMode: paymentData.paymentMode,
        receiptNumber: paymentData.receiptNumber
      }));

      const result = await invoiceService.payInvoice(SCHOOL_ID, INVOICE_ID_1, {}, PARENT_ACTOR);

      expect(result.status).toBe('Paid');
      expect(result.paymentMode).toBe('Online');
    });

    it('rejects staff payment when paidAt is in the future with BadRequestError', async () => {
      invoiceRepository.findInvoiceByIdForUpdate.mockResolvedValue({
        id: INVOICE_ID_1,
        schoolId: SCHOOL_ID,
        studentId: STUDENT_ID_1,
        status: 'Pending',
        amount: '50000.00'
      });

      const futureDate = new Date(Date.now() + 86400000 * 5).toISOString();

      await expect(
        invoiceService.payInvoice(SCHOOL_ID, INVOICE_ID_1, { paidAt: futureDate }, STAFF_ACTOR)
      ).rejects.toThrow(ValidationError);
    });

    it('ignores client-supplied paidAt for parents and stamps server timestamp', async () => {
      invoiceRepository.findAuthorizedStudentIdsForParent.mockResolvedValue([STUDENT_ID_1]);
      invoiceRepository.findInvoiceByIdForUpdate.mockResolvedValue({
        id: INVOICE_ID_1,
        schoolId: SCHOOL_ID,
        studentId: STUDENT_ID_1,
        status: 'Pending',
        amount: '50000.00'
      });

      let capturedPaidAt = null;
      invoiceRepository.settleInvoicePayment.mockImplementation(async (_schoolId, _id, paymentData) => {
        capturedPaidAt = paymentData.paidAt;
        return {
          ...MOCK_INVOICE_1,
          status: 'Paid',
          paidAt: paymentData.paidAt
        };
      });

      const spoofedDate = '2020-01-01T00:00:00.000Z';
      await invoiceService.payInvoice(SCHOOL_ID, INVOICE_ID_1, { paidAt: spoofedDate }, PARENT_ACTOR);

      expect(capturedPaidAt).toBeInstanceOf(Date);
      expect(capturedPaidAt.getFullYear()).toBeGreaterThanOrEqual(2026);
    });

    it('rejects payment if supplied amount does not match invoice obligation with ValidationError', async () => {
      invoiceRepository.findInvoiceByIdForUpdate.mockResolvedValue({
        id: INVOICE_ID_1,
        schoolId: SCHOOL_ID,
        studentId: STUDENT_ID_1,
        status: 'Pending',
        amount: '50000.00'
      });

      await expect(
        invoiceService.payInvoice(SCHOOL_ID, INVOICE_ID_1, { amount: 30000 }, STAFF_ACTOR)
      ).rejects.toThrow(ValidationError);

    });

    it('rejects payment for Cancelled invoice with ConflictError (409)', async () => {
      invoiceRepository.findInvoiceByIdForUpdate.mockResolvedValue({
        id: INVOICE_ID_1,
        schoolId: SCHOOL_ID,
        status: 'Cancelled'
      });

      await expect(
        invoiceService.payInvoice(SCHOOL_ID, INVOICE_ID_1, {}, STAFF_ACTOR)
      ).rejects.toThrow(ConflictError);

      expect(invoiceRepository.settleInvoicePayment).not.toHaveBeenCalled();
    });

    it('rejects payment for Paid invoice without transactionReference with ConflictError (409)', async () => {
      invoiceRepository.findInvoiceByIdForUpdate.mockResolvedValue({
        id: INVOICE_ID_1,
        schoolId: SCHOOL_ID,
        status: 'Paid',
        transactionReference: null
      });

      await expect(
        invoiceService.payInvoice(SCHOOL_ID, INVOICE_ID_1, { transactionReference: 'TXN-1' }, STAFF_ACTOR)
      ).rejects.toThrow(ConflictError);
    });

    it('rejects payment for Paid invoice with conflicting transactionReference with ConflictError (409)', async () => {
      invoiceRepository.findInvoiceByIdForUpdate.mockResolvedValue({
        id: INVOICE_ID_1,
        schoolId: SCHOOL_ID,
        status: 'Paid',
        transactionReference: 'TXN-ORIGINAL'
      });

      await expect(
        invoiceService.payInvoice(SCHOOL_ID, INVOICE_ID_1, { transactionReference: 'TXN-NEW' }, STAFF_ACTOR)
      ).rejects.toThrow(ConflictError);
    });

    it('returns existing invoice (200 OK) for Paid invoice when transactionReference matches exactly (idempotent retry)', async () => {
      invoiceRepository.findInvoiceByIdForUpdate.mockResolvedValue({
        id: INVOICE_ID_1,
        schoolId: SCHOOL_ID,
        status: 'Paid',
        transactionReference: 'TXN-IDEMPOTENT-123'
      });

      const existingPaid = {
        ...MOCK_INVOICE_1,
        status: 'Paid',
        transactionReference: 'TXN-IDEMPOTENT-123'
      };
      invoiceRepository.findInvoiceById.mockResolvedValue(existingPaid);

      const result = await invoiceService.payInvoice(
        SCHOOL_ID,
        INVOICE_ID_1,
        { transactionReference: 'TXN-IDEMPOTENT-123' },
        STAFF_ACTOR
      );

      expect(result.status).toBe('Paid');
      expect(result.transactionReference).toBe('TXN-IDEMPOTENT-123');
      expect(invoiceRepository.settleInvoicePayment).not.toHaveBeenCalled();
      expect(auditRepository.createAuditLog).not.toHaveBeenCalled();
    });

    it('blocks parent from paying invoice belonging to unlinked student with 404', async () => {
      invoiceRepository.findAuthorizedStudentIdsForParent.mockResolvedValue([STUDENT_ID_2]); // Parent only has STUDENT_ID_2
      invoiceRepository.findInvoiceByIdForUpdate.mockResolvedValue({
        id: INVOICE_ID_1,
        schoolId: SCHOOL_ID,
        studentId: STUDENT_ID_1, // Invoice belongs to STUDENT_ID_1
        status: 'Pending',
        amount: '50000.00'
      });

      await expect(
        invoiceService.payInvoice(SCHOOL_ID, INVOICE_ID_1, {}, PARENT_ACTOR)
      ).rejects.toThrow(NotFoundError);
    });

    it('blocks parent from paying orphan invoice with 404', async () => {
      invoiceRepository.findAuthorizedStudentIdsForParent.mockResolvedValue([STUDENT_ID_1]);
      invoiceRepository.findInvoiceByIdForUpdate.mockResolvedValue({
        id: INVOICE_ID_1,
        schoolId: SCHOOL_ID,
        studentId: null, // Orphan invoice
        status: 'Pending',
        amount: '50000.00'
      });

      await expect(
        invoiceService.payInvoice(SCHOOL_ID, INVOICE_ID_1, {}, PARENT_ACTOR)
      ).rejects.toThrow(NotFoundError);
    });

    it('audit failure does not abort or roll back payment settlement', async () => {
      invoiceRepository.findInvoiceByIdForUpdate.mockResolvedValue({
        id: INVOICE_ID_1,
        schoolId: SCHOOL_ID,
        studentId: STUDENT_ID_1,
        status: 'Pending',
        amount: '50000.00'
      });
      invoiceRepository.settleInvoicePayment.mockResolvedValue({ ...MOCK_INVOICE_1, status: 'Paid' });
      auditRepository.createAuditLog.mockRejectedValue(new Error('Audit DB down'));

      const result = await invoiceService.payInvoice(SCHOOL_ID, INVOICE_ID_1, {}, STAFF_ACTOR);

      expect(result.status).toBe('Paid');
    });
  });

  describe('Reporting & Dashboard Services (Phase 4C.6-D)', () => {
    const STUDENT_ACTOR = {
      userId: '99999999-9999-4999-9999-999999999999',
      email: 'student@school.com',
      systemRole: SYSTEM_ROLES.STUDENT
    };

    describe('getInvoiceStats', () => {
      it('throws TenantAccessError when schoolId is missing', async () => {
        await expect(invoiceService.getInvoiceStats(null, {}, STAFF_ACTOR)).rejects.toThrow(TenantAccessError);
      });

      it('blocks parent and student callers with ForbiddenError', async () => {
        await expect(invoiceService.getInvoiceStats(SCHOOL_ID, {}, PARENT_ACTOR)).rejects.toThrow(ForbiddenError);
        await expect(invoiceService.getInvoiceStats(SCHOOL_ID, {}, STUDENT_ACTOR)).rejects.toThrow(ForbiddenError);
      });

      it('delegates to aggregateInvoiceStats with combined filters for staff', async () => {
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
        invoiceRepository.aggregateInvoiceStats.mockResolvedValue(mockStats);

        const query = { classId: 'c1', collectionPeriodId: 'p1' };
        const result = await invoiceService.getInvoiceStats(SCHOOL_ID, query, STAFF_ACTOR);

        expect(invoiceRepository.aggregateInvoiceStats).toHaveBeenCalledWith(SCHOOL_ID, {
          classId: 'c1',
          studentId: undefined,
          feeStructureId: undefined,
          collectionPeriodId: 'p1'
        });
        expect(result).toEqual(mockStats);
      });
    });

    describe('getClassWiseReports', () => {
      it('throws TenantAccessError when schoolId is missing', async () => {
        await expect(invoiceService.getClassWiseReports(null, {}, STAFF_ACTOR)).rejects.toThrow(TenantAccessError);
      });

      it('blocks parent and student callers with ForbiddenError', async () => {
        await expect(invoiceService.getClassWiseReports(SCHOOL_ID, {}, PARENT_ACTOR)).rejects.toThrow(ForbiddenError);
        await expect(invoiceService.getClassWiseReports(SCHOOL_ID, {}, STUDENT_ACTOR)).rejects.toThrow(ForbiddenError);
      });

      it('delegates to aggregateClassWiseReports with filters for staff', async () => {
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
        invoiceRepository.aggregateClassWiseReports.mockResolvedValue(mockReports);

        const query = { collectionPeriodId: 'p1' };
        const result = await invoiceService.getClassWiseReports(SCHOOL_ID, query, STAFF_ACTOR);

        expect(invoiceRepository.aggregateClassWiseReports).toHaveBeenCalledWith(SCHOOL_ID, {
          collectionPeriodId: 'p1'
        });
        expect(result).toEqual(mockReports);
      });
    });

    describe('getPeriodWiseReports', () => {
      it('throws TenantAccessError when schoolId is missing', async () => {
        await expect(invoiceService.getPeriodWiseReports(null, STAFF_ACTOR)).rejects.toThrow(TenantAccessError);
      });

      it('blocks parent and student callers with ForbiddenError', async () => {
        await expect(invoiceService.getPeriodWiseReports(SCHOOL_ID, PARENT_ACTOR)).rejects.toThrow(ForbiddenError);
        await expect(invoiceService.getPeriodWiseReports(SCHOOL_ID, STUDENT_ACTOR)).rejects.toThrow(ForbiddenError);
      });

      it('delegates to aggregatePeriodWiseReports for staff', async () => {
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
        invoiceRepository.aggregatePeriodWiseReports.mockResolvedValue(mockReports);

        const result = await invoiceService.getPeriodWiseReports(SCHOOL_ID, STAFF_ACTOR);

        expect(invoiceRepository.aggregatePeriodWiseReports).toHaveBeenCalledWith(SCHOOL_ID);
        expect(result).toEqual(mockReports);
      });
    });

    describe('getMonthlyRevenueReports', () => {
      it('throws TenantAccessError when schoolId is missing', async () => {
        await expect(invoiceService.getMonthlyRevenueReports(null, {}, STAFF_ACTOR)).rejects.toThrow(TenantAccessError);
      });

      it('blocks parent and student callers with ForbiddenError', async () => {
        await expect(invoiceService.getMonthlyRevenueReports(SCHOOL_ID, {}, PARENT_ACTOR)).rejects.toThrow(ForbiddenError);
        await expect(invoiceService.getMonthlyRevenueReports(SCHOOL_ID, {}, STUDENT_ACTOR)).rejects.toThrow(ForbiddenError);
      });

      it('delegates to aggregateMonthlyRevenueReports with defaulted and custom months', async () => {
        const mockReports = [
          {
            month: '2026-09',
            monthName: 'Sep 2026',
            collectedAmount: 83850,
            paidCount: 1
          }
        ];
        invoiceRepository.aggregateMonthlyRevenueReports.mockResolvedValue(mockReports);

        const resDefault = await invoiceService.getMonthlyRevenueReports(SCHOOL_ID, {}, STAFF_ACTOR);
        expect(invoiceRepository.aggregateMonthlyRevenueReports).toHaveBeenCalledWith(SCHOOL_ID, 7);
        expect(resDefault).toEqual(mockReports);

        const resCustom = await invoiceService.getMonthlyRevenueReports(SCHOOL_ID, { months: 12 }, STAFF_ACTOR);
        expect(invoiceRepository.aggregateMonthlyRevenueReports).toHaveBeenCalledWith(SCHOOL_ID, 12);
        expect(resCustom).toEqual(mockReports);
      });
    });
  });
});



