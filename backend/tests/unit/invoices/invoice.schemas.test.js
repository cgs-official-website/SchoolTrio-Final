import { describe, it, expect } from 'vitest';
import * as invoiceSchemas from '../../../src/modules/invoices/invoice.schemas.js';

describe('Invoice Validation Schemas Unit Tests (Phase 4C.6-B1)', () => {
  const VALID_UUID = '11111111-1111-4111-8111-111111111111';
  const INVALID_UUID = 'not-a-valid-uuid';

  describe('invoiceParamsSchema', () => {
    it('accepts valid UUID param', () => {
      const result = invoiceSchemas.invoiceParamsSchema.params.safeParse({ id: VALID_UUID });
      expect(result.success).toBe(true);
      expect(result.data.id).toBe(VALID_UUID);
    });

    it('rejects invalid or missing UUID', () => {
      expect(invoiceSchemas.invoiceParamsSchema.params.safeParse({ id: INVALID_UUID }).success).toBe(false);
      expect(invoiceSchemas.invoiceParamsSchema.params.safeParse({}).success).toBe(false);
    });
  });

  describe('listInvoicesSchema', () => {
    it('applies default pagination and sorting when query is empty', () => {
      const result = invoiceSchemas.listInvoicesSchema.query.safeParse({});
      expect(result.success).toBe(true);
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(50);
      expect(result.data.order).toBe('desc');
    });

    it('coerces and validates custom pagination', () => {
      const result = invoiceSchemas.listInvoicesSchema.query.safeParse({
        page: '3',
        limit: '25',
        order: 'asc'
      });
      expect(result.success).toBe(true);
      expect(result.data.page).toBe(3);
      expect(result.data.limit).toBe(25);
      expect(result.data.order).toBe('asc');
    });

    it('rejects invalid pagination bounds', () => {
      expect(invoiceSchemas.listInvoicesSchema.query.safeParse({ page: 0 }).success).toBe(false);
      expect(invoiceSchemas.listInvoicesSchema.query.safeParse({ page: -1 }).success).toBe(false);
      expect(invoiceSchemas.listInvoicesSchema.query.safeParse({ limit: 0 }).success).toBe(false);
      expect(invoiceSchemas.listInvoicesSchema.query.safeParse({ limit: 101 }).success).toBe(false);
      expect(invoiceSchemas.listInvoicesSchema.query.safeParse({ page: 'abc' }).success).toBe(false);
    });

    it('validates UUID filter parameters', () => {
      const validQuery = {
        classId: VALID_UUID,
        studentId: VALID_UUID,
        feeStructureId: VALID_UUID,
        collectionPeriodId: VALID_UUID
      };
      const result = invoiceSchemas.listInvoicesSchema.query.safeParse(validQuery);
      expect(result.success).toBe(true);

      expect(invoiceSchemas.listInvoicesSchema.query.safeParse({ classId: INVALID_UUID }).success).toBe(false);
      expect(invoiceSchemas.listInvoicesSchema.query.safeParse({ studentId: INVALID_UUID }).success).toBe(false);
      expect(invoiceSchemas.listInvoicesSchema.query.safeParse({ feeStructureId: INVALID_UUID }).success).toBe(false);
      expect(invoiceSchemas.listInvoicesSchema.query.safeParse({ collectionPeriodId: INVALID_UUID }).success).toBe(false);
    });

    it('validates status filter enum', () => {
      expect(invoiceSchemas.listInvoicesSchema.query.safeParse({ status: 'Pending' }).success).toBe(true);
      expect(invoiceSchemas.listInvoicesSchema.query.safeParse({ status: 'Paid' }).success).toBe(true);
      expect(invoiceSchemas.listInvoicesSchema.query.safeParse({ status: 'Cancelled' }).success).toBe(true);

      expect(invoiceSchemas.listInvoicesSchema.query.safeParse({ status: 'Draft' }).success).toBe(false);
      expect(invoiceSchemas.listInvoicesSchema.query.safeParse({ status: 'Overdue' }).success).toBe(false);
      expect(invoiceSchemas.listInvoicesSchema.query.safeParse({ status: 'unknown' }).success).toBe(false);
    });

    it('coerces overdue boolean filter properly', () => {
      const trueResult1 = invoiceSchemas.listInvoicesSchema.query.safeParse({ overdue: 'true' });
      expect(trueResult1.success).toBe(true);
      expect(trueResult1.data.overdue).toBe(true);

      const trueResult2 = invoiceSchemas.listInvoicesSchema.query.safeParse({ overdue: '1' });
      expect(trueResult2.success).toBe(true);
      expect(trueResult2.data.overdue).toBe(true);

      const falseResult1 = invoiceSchemas.listInvoicesSchema.query.safeParse({ overdue: 'false' });
      expect(falseResult1.success).toBe(true);
      expect(falseResult1.data.overdue).toBe(false);

      const falseResult2 = invoiceSchemas.listInvoicesSchema.query.safeParse({ overdue: '0' });
      expect(falseResult2.success).toBe(true);
      expect(falseResult2.data.overdue).toBe(false);

      expect(invoiceSchemas.listInvoicesSchema.query.safeParse({ overdue: 'invalid' }).success).toBe(false);
    });

    it('validates search query boundaries', () => {
      const validSearch = invoiceSchemas.listInvoicesSchema.query.safeParse({ search: 'John Doe' });
      expect(validSearch.success).toBe(true);
      expect(validSearch.data.search).toBe('John Doe');

      const longSearch = 'a'.repeat(101);
      expect(invoiceSchemas.listInvoicesSchema.query.safeParse({ search: longSearch }).success).toBe(false);
    });
  });

  describe('invoiceStatsSchema', () => {
    it('accepts empty filters', () => {
      const result = invoiceSchemas.invoiceStatsSchema.query.safeParse({});
      expect(result.success).toBe(true);
    });

    it('accepts valid UUID filters', () => {
      const result = invoiceSchemas.invoiceStatsSchema.query.safeParse({
        classId: VALID_UUID,
        studentId: VALID_UUID,
        feeStructureId: VALID_UUID,
        collectionPeriodId: VALID_UUID
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid UUID filters', () => {
      expect(invoiceSchemas.invoiceStatsSchema.query.safeParse({ classId: INVALID_UUID }).success).toBe(false);
      expect(invoiceSchemas.invoiceStatsSchema.query.safeParse({ studentId: INVALID_UUID }).success).toBe(false);
    });
  });

  describe('studentInvoiceParamsSchema', () => {
    it('accepts valid studentId and query parameters', () => {
      const paramResult = invoiceSchemas.studentInvoiceParamsSchema.params.safeParse({ studentId: VALID_UUID });
      expect(paramResult.success).toBe(true);

      const queryResult = invoiceSchemas.studentInvoiceParamsSchema.query.safeParse({
        page: 2,
        limit: 20,
        status: 'Pending',
        order: 'asc'
      });
      expect(queryResult.success).toBe(true);
      expect(queryResult.data.page).toBe(2);
      expect(queryResult.data.status).toBe('Pending');
    });

    it('rejects invalid studentId param', () => {
      expect(invoiceSchemas.studentInvoiceParamsSchema.params.safeParse({ studentId: INVALID_UUID }).success).toBe(false);
      expect(invoiceSchemas.studentInvoiceParamsSchema.params.safeParse({}).success).toBe(false);
    });
  });

  describe('cancelInvoiceSchema', () => {
    it('accepts valid UUID param with empty body', () => {
      const paramResult = invoiceSchemas.cancelInvoiceSchema.params.safeParse({ id: VALID_UUID });
      expect(paramResult.success).toBe(true);
      expect(paramResult.data.id).toBe(VALID_UUID);

      const bodyResult = invoiceSchemas.cancelInvoiceSchema.body.safeParse({});
      expect(bodyResult.success).toBe(true);
    });

    it('accepts valid optional reason string and trims whitespace', () => {
      const bodyResult = invoiceSchemas.cancelInvoiceSchema.body.safeParse({
        reason: '  Student transferred to another school  '
      });
      expect(bodyResult.success).toBe(true);
      expect(bodyResult.data.reason).toBe('Student transferred to another school');
    });

    it('rejects invalid UUID param', () => {
      expect(invoiceSchemas.cancelInvoiceSchema.params.safeParse({ id: INVALID_UUID }).success).toBe(false);
      expect(invoiceSchemas.cancelInvoiceSchema.params.safeParse({}).success).toBe(false);
    });

    it('rejects reason exceeding maximum length', () => {
      const longReason = 'a'.repeat(256);
      const bodyResult = invoiceSchemas.cancelInvoiceSchema.body.safeParse({ reason: longReason });
      expect(bodyResult.success).toBe(false);
    });

    it('rejects non-string reason type', () => {
      expect(invoiceSchemas.cancelInvoiceSchema.body.safeParse({ reason: 12345 }).success).toBe(false);
      expect(invoiceSchemas.cancelInvoiceSchema.body.safeParse({ reason: true }).success).toBe(false);
    });
  });

  describe('payInvoiceSchema (Phase 4C.6-C)', () => {
    it('accepts valid UUID param with empty body', () => {
      const paramResult = invoiceSchemas.payInvoiceSchema.params.safeParse({ id: VALID_UUID });
      expect(paramResult.success).toBe(true);
      expect(paramResult.data.id).toBe(VALID_UUID);

      const bodyResult = invoiceSchemas.payInvoiceSchema.body.safeParse({});
      expect(bodyResult.success).toBe(true);
    });

    it('accepts valid paymentMode enum values', () => {
      const modes = ['Cash', 'Online', 'Cheque', 'Bank Transfer', 'UPI', 'Card'];
      for (const mode of modes) {
        const result = invoiceSchemas.payInvoiceSchema.body.safeParse({ paymentMode: mode });
        expect(result.success).toBe(true);
        expect(result.data.paymentMode).toBe(mode);
      }

      expect(invoiceSchemas.payInvoiceSchema.body.safeParse({ paymentMode: 'Bitcoin' }).success).toBe(false);
      expect(invoiceSchemas.payInvoiceSchema.body.safeParse({ paymentMode: 'cash' }).success).toBe(false);
    });

    it('accepts valid transactionReference and trims whitespace', () => {
      const result = invoiceSchemas.payInvoiceSchema.body.safeParse({
        transactionReference: '  TXN-99887766  '
      });
      expect(result.success).toBe(true);
      expect(result.data.transactionReference).toBe('TXN-99887766');

      expect(invoiceSchemas.payInvoiceSchema.body.safeParse({
        transactionReference: 'a'.repeat(101)
      }).success).toBe(false);
    });

    it('accepts valid receiptNumber and trims whitespace', () => {
      const result = invoiceSchemas.payInvoiceSchema.body.safeParse({
        receiptNumber: '  REC-2026-001  '
      });
      expect(result.success).toBe(true);
      expect(result.data.receiptNumber).toBe('REC-2026-001');

      expect(invoiceSchemas.payInvoiceSchema.body.safeParse({
        receiptNumber: 'a'.repeat(101)
      }).success).toBe(false);
    });

    it('validates ISO datetime for paidAt', () => {
      const validIso = '2026-09-10T10:00:00.000Z';
      const result = invoiceSchemas.payInvoiceSchema.body.safeParse({ paidAt: validIso });
      expect(result.success).toBe(true);
      expect(result.data.paidAt).toBe(validIso);

      expect(invoiceSchemas.payInvoiceSchema.body.safeParse({ paidAt: 'not-a-date' }).success).toBe(false);
      expect(invoiceSchemas.payInvoiceSchema.body.safeParse({ paidAt: '2026-09-10' }).success).toBe(false);
    });

    it('validates optional positive amount', () => {
      const result = invoiceSchemas.payInvoiceSchema.body.safeParse({ amount: 50000 });
      expect(result.success).toBe(true);
      expect(result.data.amount).toBe(50000);

      expect(invoiceSchemas.payInvoiceSchema.body.safeParse({ amount: -100 }).success).toBe(false);
      expect(invoiceSchemas.payInvoiceSchema.body.safeParse({ amount: 0 }).success).toBe(false);
      expect(invoiceSchemas.payInvoiceSchema.body.safeParse({ amount: 'abc' }).success).toBe(false);
    });
  });

  describe('classWiseReportSchema', () => {
    it('accepts empty query filters', () => {
      const result = invoiceSchemas.classWiseReportSchema.query.safeParse({});
      expect(result.success).toBe(true);
    });

    it('accepts valid collectionPeriodId filter', () => {
      const result = invoiceSchemas.classWiseReportSchema.query.safeParse({ collectionPeriodId: VALID_UUID });
      expect(result.success).toBe(true);
      expect(result.data.collectionPeriodId).toBe(VALID_UUID);
    });

    it('rejects invalid collectionPeriodId format', () => {
      const result = invoiceSchemas.classWiseReportSchema.query.safeParse({ collectionPeriodId: INVALID_UUID });
      expect(result.success).toBe(false);
    });
  });

  describe('periodWiseReportSchema', () => {
    it('accepts empty query filters', () => {
      const result = invoiceSchemas.periodWiseReportSchema.query.safeParse({});
      expect(result.success).toBe(true);
    });
  });

  describe('monthlyRevenueReportSchema', () => {
    it('defaults months to 7 when omitted', () => {
      const result = invoiceSchemas.monthlyRevenueReportSchema.query.safeParse({});
      expect(result.success).toBe(true);
      expect(result.data.months).toBe(7);
    });

    it('coerces and accepts valid integer months within bounds (1-24)', () => {
      const r1 = invoiceSchemas.monthlyRevenueReportSchema.query.safeParse({ months: '1' });
      expect(r1.success).toBe(true);
      expect(r1.data.months).toBe(1);

      const r12 = invoiceSchemas.monthlyRevenueReportSchema.query.safeParse({ months: '12' });
      expect(r12.success).toBe(true);
      expect(r12.data.months).toBe(12);

      const r24 = invoiceSchemas.monthlyRevenueReportSchema.query.safeParse({ months: 24 });
      expect(r24.success).toBe(true);
      expect(r24.data.months).toBe(24);
    });

    it('rejects out of bounds or non-integer months', () => {
      expect(invoiceSchemas.monthlyRevenueReportSchema.query.safeParse({ months: 0 }).success).toBe(false);
      expect(invoiceSchemas.monthlyRevenueReportSchema.query.safeParse({ months: -5 }).success).toBe(false);
      expect(invoiceSchemas.monthlyRevenueReportSchema.query.safeParse({ months: 25 }).success).toBe(false);
      expect(invoiceSchemas.monthlyRevenueReportSchema.query.safeParse({ months: 'abc' }).success).toBe(false);
    });
  });
});



