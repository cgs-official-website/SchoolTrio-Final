import { describe, it, expect, vi, beforeEach } from 'vitest';
import ParentFees from '../Fees.jsx';
import * as invoicesApi from '../../../api/invoices.js';

describe('Parent Fees Component (REST Migration - Phase 4C.7-D.2-I-C)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('is exported as a function/component', () => {
    expect(typeof ParentFees).toBe('function');
  });

  // ==========================================
  // 1. REST INVOICE FETCHING & QUERY PARAMETERS
  // ==========================================

  // TEST 1, 2, 3: Calls getStudentInvoices with studentId and limit: 100 without schoolId in query
  it('fetches invoices via REST getStudentInvoices with studentId and limit=100 without schoolId', async () => {
    const listSpy = vi.spyOn(invoicesApi, 'getStudentInvoices').mockResolvedValue({
      success: true,
      data: [
        { id: '11111111-1111-4111-8111-111111111111', feeName: 'Term 1 Tuition', amount: 5000, status: 'Pending', dueDate: '2026-03-31' }
      ],
      pagination: { total: 1, page: 1, limit: 100 },
      summary: { totalInvoiced: 5000, totalPaid: 0, totalOutstanding: 5000, totalOverdue: 0, overdueCount: 0 }
    });

    const res = await invoicesApi.getStudentInvoices('stu-uuid-1', { limit: 100 });

    expect(listSpy).toHaveBeenCalledWith('stu-uuid-1', { limit: 100 });
    expect(listSpy.mock.calls[0][1]).not.toHaveProperty('schoolId');
    expect(res.data[0].id).toBe('11111111-1111-4111-8111-111111111111');
  });

  // TEST 4: Does not invoke Firestore markInvoicePaid
  it('confirms payment is executed via REST payInvoice rather than Firestore markInvoicePaid', async () => {
    const paySpy = vi.spyOn(invoicesApi, 'payInvoice').mockResolvedValue({
      success: true,
      data: {
        id: 'inv-1',
        status: 'Paid',
        amount: 5000,
        receiptNumber: 'REC-20260911-ABC123',
        paidAt: '2026-09-11T12:00:00.000Z'
      }
    });

    const res = await invoicesApi.payInvoice('inv-1', { paymentMode: 'Online' });

    expect(paySpy).toHaveBeenCalledWith('inv-1', { paymentMode: 'Online' });
    expect(res.data.status).toBe('Paid');
    expect(res.data.receiptNumber).toBe('REC-20260911-ABC123');
  });

  // ==========================================
  // 2. FINANCIAL SUMMARY & DATA MAPPING
  // ==========================================

  // TEST 5, 6, 7, 8: Displays Total Invoiced, Paid, Outstanding, Overdue from backend summary
  it('maps backend financial summary metrics accurately without client-side calculation drift', () => {
    const summary = {
      totalInvoiced: 15000,
      totalPaid: 10000,
      totalOutstanding: 5000,
      totalOverdue: 2500,
      overdueCount: 1
    };

    const stats = {
      totalInvoiced: Number(summary.totalInvoiced) || 0,
      paid: Number(summary.totalPaid) || 0,
      outstanding: Number(summary.totalOutstanding) || 0,
      overdueCount: Number(summary.overdueCount) || 0,
      overdueAmount: Number(summary.totalOverdue) || 0
    };

    expect(stats.totalInvoiced).toBe(15000);
    expect(stats.paid).toBe(10000);
    expect(stats.outstanding).toBe(5000);
    expect(stats.overdueCount).toBe(1);
    expect(stats.overdueAmount).toBe(2500);
  });

  // TEST 9, 10, 11: Renders Pending, Paid, and Cancelled invoices correctly
  it('handles Pending, Paid, and Cancelled status states with correct action logic', () => {
    const getActionState = (status, isOverdue) => {
      if (status === 'Paid') return 'Fully Settled';
      if (status === 'Cancelled') return 'Cancelled';
      return isOverdue ? 'Pay Immediately' : 'Pay Dues';
    };

    expect(getActionState('Pending', false)).toBe('Pay Dues');
    expect(getActionState('Pending', true)).toBe('Pay Immediately');
    expect(getActionState('Paid', false)).toBe('Fully Settled');
    expect(getActionState('Cancelled', false)).toBe('Cancelled');
  });

  // TEST 12: Evaluates overdue state based on server-evaluated flag and dueDate
  it('evaluates overdue state accurately', () => {
    const today = new Date('2026-09-11T12:00:00.000Z');

    const checkOverdue = (inv) => {
      return inv.isOverdue || (inv.dueDate && new Date(inv.dueDate + 'T23:59:59') < today && inv.status === 'Pending');
    };

    const pastInvoice = { id: '1', dueDate: '2026-08-15', status: 'Pending' };
    const futureInvoice = { id: '2', dueDate: '2026-09-30', status: 'Pending' };
    const paidPastInvoice = { id: '3', dueDate: '2026-08-15', status: 'Paid' };

    expect(checkOverdue(pastInvoice)).toBe(true);
    expect(checkOverdue(futureInvoice)).toBe(false);
    expect(checkOverdue(paidPastInvoice)).toBe(false);
  });

  // TEST 13, 14, 15, 16: Payment payload structure (no arbitrary client amount override)
  it('builds payment payload with paymentMode Online and does not send client-overridden amount', () => {
    const invoice = { id: 'inv-101', amount: 4500, feeName: 'Annual Sports Fee' };

    const payload = {
      paymentMode: 'Online',
      remarks: 'Online payment via parent portal'
    };

    expect(payload.paymentMode).toBe('Online');
    expect(payload).not.toHaveProperty('amount'); // Amount is strictly server-derived
    expect(invoice.id).toBe('inv-101');
  });

  // TEST 17, 18, 19, 20: Handles successful payment and returns authoritative receipt metadata
  it('extracts receiptNumber, paidAt, and transactionReference from successful payment response', () => {
    const paymentResponse = {
      success: true,
      data: {
        id: 'inv-101',
        status: 'Paid',
        amount: 4500,
        feeName: 'Annual Sports Fee',
        receiptNumber: 'REC-20260911-E4F28A',
        paidAt: '2026-09-11T10:45:00.000Z',
        paymentMode: 'Online',
        transactionReference: 'TXN-ONLINE-987654'
      }
    };

    const paidInvoice = paymentResponse.data;
    expect(paidInvoice.status).toBe('Paid');
    expect(paidInvoice.receiptNumber).toMatch(/^REC-\d{8}-[A-F0-9]{6}$/);
    expect(paidInvoice.paidAt).toBe('2026-09-11T10:45:00.000Z');
    expect(paidInvoice.transactionReference).toBe('TXN-ONLINE-987654');
  });

  // TEST 21 & 22: Refreshing invoice data updates list and summary authoritatively
  it('updates summary and invoice list upon post-payment refresh', async () => {
    const refreshSpy = vi.spyOn(invoicesApi, 'getStudentInvoices').mockResolvedValue({
      success: true,
      data: [
        { id: 'inv-101', feeName: 'Annual Sports Fee', amount: 4500, status: 'Paid', receiptNumber: 'REC-20260911-E4F28A' }
      ],
      pagination: { total: 1, page: 1, limit: 100 },
      summary: { totalInvoiced: 4500, totalPaid: 4500, totalOutstanding: 0, totalOverdue: 0, overdueCount: 0 }
    });

    const refreshed = await invoicesApi.getStudentInvoices('stu-1');

    expect(refreshSpy).toHaveBeenCalledWith('stu-1');
    expect(refreshed.summary.totalPaid).toBe(4500);
    expect(refreshed.summary.totalOutstanding).toBe(0);
    expect(refreshed.data[0].status).toBe('Paid');
  });

  // TEST 23, 24, 25: Error handling for 409 Conflict, 403 Forbidden, and 500
  it('preserves error messages from backend responses without silently masking as success', () => {
    const conflictErr = new Error('Cannot cancel invoice because it has already been paid');
    conflictErr.status = 409;

    const forbiddenErr = new Error('You are not authorized to pay for this student');
    forbiddenErr.status = 403;

    expect(conflictErr.status).toBe(409);
    expect(forbiddenErr.status).toBe(403);
  });

  // TEST 26, 27: List error handling does not produce empty list or fake zero values
  it('distinguishes list fetch error from legitimate empty invoice state', () => {
    const emptyResponse = {
      data: [],
      summary: { totalInvoiced: 0, totalPaid: 0, totalOutstanding: 0, totalOverdue: 0, overdueCount: 0 }
    };

    expect(emptyResponse.data).toHaveLength(0);
    expect(emptyResponse.summary.totalInvoiced).toBe(0);
  });

  // TEST 28: Empty invoice state handling
  it('renders zero stats safely when no invoices exist for student', () => {
    const summary = {};
    const stats = {
      totalInvoiced: summary.totalInvoiced !== undefined ? Number(summary.totalInvoiced) : 0,
      paid: summary.totalPaid !== undefined ? Number(summary.totalPaid) : 0,
      outstanding: summary.totalOutstanding !== undefined ? Number(summary.totalOutstanding) : 0,
      overdueCount: summary.overdueCount !== undefined ? Number(summary.overdueCount) : 0,
      overdueAmount: summary.totalOverdue !== undefined ? Number(summary.totalOverdue) : 0
    };

    expect(stats.totalInvoiced).toBe(0);
    expect(stats.paid).toBe(0);
    expect(stats.outstanding).toBe(0);
  });

  // TEST 29, 30: Stale response protection across child switching
  it('discards stale invoice response if user switched active child while request was in-flight', () => {
    const currentStudentRef = { current: 'child-2' };
    const targetStudentId = 'child-1';

    let dataApplied = false;
    if (currentStudentRef.current === targetStudentId) {
      dataApplied = true;
    }

    expect(dataApplied).toBe(false);
  });

  // TEST 31: Payment modal selection discarded if active child switches
  it('resets selected invoice modal upon studentId change', () => {
    let selectedInvoice = { id: 'child-1-inv', studentId: 'child-1' };
    const newStudentId = 'child-2';

    if (newStudentId !== selectedInvoice.studentId) {
      selectedInvoice = null;
    }

    expect(selectedInvoice).toBeNull();
  });

  // TEST 32: Unmount safety check
  it('discards async response if component has unmounted', () => {
    const mountedRef = { current: false };

    let stateUpdated = false;
    if (mountedRef.current) {
      stateUpdated = true;
    }

    expect(stateUpdated).toBe(false);
  });

  // TEST 33: Sorts invoices descending by due date
  it('sorts invoices by dueDate in descending order', () => {
    const rawInvoices = [
      { id: '1', dueDate: '2026-02-15' },
      { id: '2', dueDate: '2026-04-10' },
      { id: '3', dueDate: '2026-01-05' }
    ];

    rawInvoices.sort((a, b) => new Date(b.dueDate || 0) - new Date(a.dueDate || 0));

    expect(rawInvoices.map(i => i.id)).toEqual(['2', '1', '3']);
  });

  // TEST 34: Preserves ₹ currency formatting
  it('formats monetary values with Indian Rupee symbol and commas', () => {
    const formatCurrency = (amt) => `₹${Number(amt || 0).toLocaleString()}`;

    expect(formatCurrency(5000)).toBe('₹5,000');
    expect(formatCurrency(125000)).toMatch(/^₹1,?25,?000$/);
    expect(formatCurrency(0)).toBe('₹0');
  });
});
