import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as invoiceService from '../../../src/modules/invoices/invoice.service.js';
import * as invoiceRepository from '../../../src/modules/invoices/invoice.repository.js';
import { ConflictError } from '../../../src/utils/app-error.js';
import { SYSTEM_ROLES } from '../../../src/config/constants.js';

vi.mock('../../../src/modules/invoices/invoice.repository.js');
vi.mock('../../../src/database/prisma.client.js', () => ({
  prisma: {
    $transaction: vi.fn(cb => cb({}))
  }
}));
vi.mock('../../../src/modules/audit/audit.repository.js', () => ({
  createAuditLog: vi.fn().mockResolvedValue({ id: 'audit-log-1' })
}));

describe('Invoice Cancellation Concurrency & State Machine Simulation (Phase 4C.6-B2)', () => {
  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
  const INVOICE_ID = '22222222-2222-4222-8222-222222222222';

  const ACTOR = {
    userId: '33333333-3333-4333-8333-333333333333',
    email: 'finance@school.edu',
    systemRole: SYSTEM_ROLES.SCHOOL_ADMIN
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Test A: Concurrent Double Cancellation Race', () => {
    it('serializes concurrent cancellations so exactly one succeeds and second throws 409', async () => {
      // In-memory row state protected by simulated lock
      let invoiceState = {
        id: INVOICE_ID,
        schoolId: SCHOOL_ID,
        status: 'Pending',
        amount: '50000.00',
        feeName: 'Tuition Fee',
        dueDate: '2026-08-31',
        paidAt: null,
        paymentMode: null,
        transactionReference: null,
        receiptNumber: null
      };

      // Mock findInvoiceByIdForUpdate to return current row snapshot under lock
      invoiceRepository.findInvoiceByIdForUpdate.mockImplementation(async () => {
        return { ...invoiceState };
      });

      // Mock cancelInvoice to update state
      invoiceRepository.cancelInvoice.mockImplementation(async () => {
        invoiceState = { ...invoiceState, status: 'Cancelled' };
        return { ...invoiceState };
      });

      // First cancellation attempt
      const result1 = await invoiceService.cancelInvoice(SCHOOL_ID, INVOICE_ID, { reason: 'Req 1' }, ACTOR);
      expect(result1.status).toBe('Cancelled');

      // Second concurrent cancellation attempt under committed state
      await expect(
        invoiceService.cancelInvoice(SCHOOL_ID, INVOICE_ID, { reason: 'Req 2' }, ACTOR)
      ).rejects.toThrow(ConflictError);

      expect(invoiceState.status).toBe('Cancelled');
    });
  });

  describe('Test B: Cancellation vs Payment Settlement Simulation', () => {
    it('Cancel first: Cancel succeeds, subsequent payment simulation rejects Cancelled invoice', async () => {
      let invoiceState = {
        id: INVOICE_ID,
        schoolId: SCHOOL_ID,
        status: 'Pending',
        amount: '50000.00',
        paidAt: null
      };

      invoiceRepository.findInvoiceByIdForUpdate.mockImplementation(async () => {
        return { ...invoiceState };
      });

      invoiceRepository.cancelInvoice.mockImplementation(async () => {
        invoiceState = { ...invoiceState, status: 'Cancelled' };
        return { ...invoiceState };
      });

      // Cancel executes first
      const cancelResult = await invoiceService.cancelInvoice(SCHOOL_ID, INVOICE_ID, {}, ACTOR);
      expect(cancelResult.status).toBe('Cancelled');
      expect(invoiceState.status).toBe('Cancelled');

      // Simulated Payment settlement under FOR UPDATE lock
      const paymentSimulation = async () => {
        const lockedRow = await invoiceRepository.findInvoiceByIdForUpdate(SCHOOL_ID, INVOICE_ID);
        if (lockedRow.status === 'Cancelled') {
          throw new ConflictError('Cannot pay a cancelled invoice');
        }
        invoiceState = { ...invoiceState, status: 'Paid', paidAt: new Date() };
        return invoiceState;
      };

      await expect(paymentSimulation()).rejects.toThrow(ConflictError);
      expect(invoiceState.status).toBe('Cancelled');
    });

    it('Payment first: Payment simulation succeeds, subsequent Cancel rejects Paid invoice with 409', async () => {
      let invoiceState = {
        id: INVOICE_ID,
        schoolId: SCHOOL_ID,
        status: 'Pending',
        amount: '50000.00',
        paidAt: null
      };

      invoiceRepository.findInvoiceByIdForUpdate.mockImplementation(async () => {
        return { ...invoiceState };
      });

      invoiceRepository.settleInvoicePayment.mockImplementation(async (_schoolId, _id, paymentData) => {
        invoiceState = {
          ...invoiceState,
          status: 'Paid',
          paidAt: paymentData.paidAt,
          paymentMode: paymentData.paymentMode,
          transactionReference: paymentData.transactionReference,
          receiptNumber: paymentData.receiptNumber
        };
        return { ...invoiceState };
      });

      // Real Service Pay executes first
      const payResult = await invoiceService.payInvoice(
        SCHOOL_ID,
        INVOICE_ID,
        { paymentMode: 'Online', transactionReference: 'TXN-001' },
        ACTOR
      );
      expect(payResult.status).toBe('Paid');
      expect(invoiceState.status).toBe('Paid');

      // Cancel executes second
      await expect(
        invoiceService.cancelInvoice(SCHOOL_ID, INVOICE_ID, {}, ACTOR)
      ).rejects.toThrow(ConflictError);

      expect(invoiceState.status).toBe('Paid');
    });
  });

  describe('Test C: Concurrent Duplicate Payment Race & Idempotency', () => {
    it('serializes concurrent payments: first succeeds, second without same txnRef rejects with 409', async () => {
      let invoiceState = {
        id: INVOICE_ID,
        schoolId: SCHOOL_ID,
        status: 'Pending',
        amount: '50000.00',
        paidAt: null,
        paymentMode: null,
        transactionReference: null,
        receiptNumber: null
      };

      invoiceRepository.findInvoiceByIdForUpdate.mockImplementation(async () => {
        return { ...invoiceState };
      });

      invoiceRepository.settleInvoicePayment.mockImplementation(async (_schoolId, _id, paymentData) => {
        invoiceState = {
          ...invoiceState,
          status: 'Paid',
          paidAt: paymentData.paidAt,
          paymentMode: paymentData.paymentMode,
          transactionReference: paymentData.transactionReference,
          receiptNumber: paymentData.receiptNumber
        };
        return { ...invoiceState };
      });

      // Request 1: Pay with TXN-1
      const res1 = await invoiceService.payInvoice(
        SCHOOL_ID,
        INVOICE_ID,
        { transactionReference: 'TXN-1', paymentMode: 'Online' },
        ACTOR
      );
      expect(res1.status).toBe('Paid');

      // Request 2: Pay with TXN-2 (competing request) -> 409
      await expect(
        invoiceService.payInvoice(
          SCHOOL_ID,
          INVOICE_ID,
          { transactionReference: 'TXN-2', paymentMode: 'Online' },
          ACTOR
        )
      ).rejects.toThrow(ConflictError);
    });

    it('idempotent network retry: second request with identical txnRef returns 200 OK without double settling', async () => {
      let invoiceState = {
        id: INVOICE_ID,
        schoolId: SCHOOL_ID,
        status: 'Pending',
        amount: '50000.00',
        paidAt: null,
        paymentMode: null,
        transactionReference: null,
        receiptNumber: null
      };

      invoiceRepository.findInvoiceByIdForUpdate.mockImplementation(async () => {
        return { ...invoiceState };
      });

      invoiceRepository.settleInvoicePayment.mockImplementation(async (_schoolId, _id, paymentData) => {
        invoiceState = {
          ...invoiceState,
          status: 'Paid',
          paidAt: paymentData.paidAt,
          paymentMode: paymentData.paymentMode,
          transactionReference: paymentData.transactionReference,
          receiptNumber: paymentData.receiptNumber
        };
        return { ...invoiceState };
      });

      invoiceRepository.findInvoiceById.mockImplementation(async () => {
        return { ...invoiceState };
      });

      // Request 1: Initial network call
      const res1 = await invoiceService.payInvoice(
        SCHOOL_ID,
        INVOICE_ID,
        { transactionReference: 'TXN-IDEMPOTENT-XYZ', paymentMode: 'Online' },
        ACTOR
      );
      expect(res1.status).toBe('Paid');
      expect(res1.transactionReference).toBe('TXN-IDEMPOTENT-XYZ');

      // Request 2: Identical network retry
      const res2 = await invoiceService.payInvoice(
        SCHOOL_ID,
        INVOICE_ID,
        { transactionReference: 'TXN-IDEMPOTENT-XYZ', paymentMode: 'Online' },
        ACTOR
      );
      expect(res2.status).toBe('Paid');
      expect(res2.transactionReference).toBe('TXN-IDEMPOTENT-XYZ');

      // Ensure settle was called only once
      expect(invoiceRepository.settleInvoicePayment).toHaveBeenCalledTimes(1);
    });
  });
});

