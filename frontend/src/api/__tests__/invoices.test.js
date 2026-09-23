import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as clientModule from '../client.js';
import {
  listInvoices,
  getInvoiceStats,
  getClassWiseReports,
  getPeriodWiseReports,
  getMonthlyRevenueReports,
  getStudentInvoices,
  getInvoice,
  cancelInvoice,
  payInvoice
} from '../invoices.js';

describe('Invoices API Client Module (Phase 4C.7-D.2-I-C & Admin REST Cutover)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('listInvoices calls apiClient with GET /api/v1/invoices and query options', async () => {
    const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: [{ id: 'inv-1', feeName: 'Tuition Fee', amount: 5000 }],
      pagination: { total: 1, page: 1, limit: 50 }
    });

    const res = await listInvoices({ classId: 'class-1', status: 'Pending', limit: 50 });

    expect(apiSpy).toHaveBeenCalledWith('/api/v1/invoices?classId=class-1&status=Pending&limit=50', {
      method: 'GET'
    });
    expect(res.data[0].id).toBe('inv-1');
  });

  it('getInvoiceStats calls apiClient with GET /api/v1/invoices/stats', async () => {
    const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: {
        expected: 50000,
        collected: 30000,
        outstanding: 20000,
        overdueCount: 2,
        overdueAmount: 5000,
        unpaidCount: 5,
        unpaidStudentsCount: 4,
        overdueStudentsCount: 2,
        feeCollectedPct: 60
      }
    });

    const res = await getInvoiceStats();

    expect(apiSpy).toHaveBeenCalledWith('/api/v1/invoices/stats', {
      method: 'GET'
    });
    expect(res.data.expected).toBe(50000);
    expect(res.data.feeCollectedPct).toBe(60);
  });

  it('getClassWiseReports calls apiClient with GET /api/v1/invoices/reports/class-wise', async () => {
    const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: [{ classId: 'c-1', className: 'Grade 10', expected: 10000, collected: 8000 }]
    });

    const res = await getClassWiseReports({ collectionPeriodId: 'p-1' });

    expect(apiSpy).toHaveBeenCalledWith('/api/v1/invoices/reports/class-wise?collectionPeriodId=p-1', {
      method: 'GET'
    });
    expect(res.data).toHaveLength(1);
  });

  it('getPeriodWiseReports calls apiClient with GET /api/v1/invoices/reports/period-wise', async () => {
    const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: [{ periodId: 'p-1', periodName: 'Term 1', totalAmount: 25000 }]
    });

    const res = await getPeriodWiseReports();

    expect(apiSpy).toHaveBeenCalledWith('/api/v1/invoices/reports/period-wise', {
      method: 'GET'
    });
    expect(res.data[0].periodName).toBe('Term 1');
  });

  it('getMonthlyRevenueReports calls apiClient with GET /api/v1/invoices/reports/monthly-revenue', async () => {
    const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: [{ month: '2026-09', revenue: 15000 }]
    });

    const res = await getMonthlyRevenueReports({ months: 6 });

    expect(apiSpy).toHaveBeenCalledWith('/api/v1/invoices/reports/monthly-revenue?months=6', {
      method: 'GET'
    });
    expect(res.data[0].revenue).toBe(15000);
  });

  it('getStudentInvoices calls apiClient with correct endpoint and query params', async () => {
    const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: [{ id: 'inv-1', feeName: 'Tuition Fee', amount: 5000 }],
      pagination: { total: 1, page: 1, limit: 50 },
      summary: { totalInvoiced: 5000, totalPaid: 0, totalOutstanding: 5000 }
    });

    const res = await getStudentInvoices('stu-uuid-1', { status: 'Pending', limit: 50 });

    expect(apiSpy).toHaveBeenCalledWith('/api/v1/students/stu-uuid-1/invoices?status=Pending&limit=50', {
      method: 'GET'
    });
    expect(res.data[0].id).toBe('inv-1');
  });

  it('getStudentInvoices does not pass schoolId as a security query argument', async () => {
    const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: []
    });

    await getStudentInvoices('stu-uuid-1');

    const calledUrl = apiSpy.mock.calls[0][0];
    expect(calledUrl).not.toContain('schoolId=');
  });

  it('getInvoice calls apiClient with GET /api/v1/invoices/:id', async () => {
    const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: { id: 'inv-uuid-1', amount: 3500 }
    });

    const res = await getInvoice('inv-uuid-1');

    expect(apiSpy).toHaveBeenCalledWith('/api/v1/invoices/inv-uuid-1', {
      method: 'GET'
    });
    expect(res.data.id).toBe('inv-uuid-1');
  });

  it('cancelInvoice calls apiClient with PATCH /api/v1/invoices/:id/cancel', async () => {
    const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: { id: 'inv-uuid-1', status: 'Cancelled' }
    });

    const res = await cancelInvoice('inv-uuid-1', { reason: 'Duplicate invoice' });

    expect(apiSpy).toHaveBeenCalledWith('/api/v1/invoices/inv-uuid-1/cancel', {
      method: 'PATCH',
      body: JSON.stringify({ reason: 'Duplicate invoice' })
    });
    expect(res.data.status).toBe('Cancelled');
  });

  it('payInvoice calls apiClient with POST /api/v1/invoices/:id/pay and JSON body', async () => {
    const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: {
        id: 'inv-uuid-1',
        status: 'Paid',
        receiptNumber: 'REC-20260911-ABC123',
        paidAt: '2026-09-11T12:00:00.000Z'
      }
    });

    const payload = { paymentMode: 'Online', transactionReference: 'TXN-9999' };
    const res = await payInvoice('inv-uuid-1', payload);

    expect(apiSpy).toHaveBeenCalledWith('/api/v1/invoices/inv-uuid-1/pay', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    expect(res.data.status).toBe('Paid');
    expect(res.data.receiptNumber).toBe('REC-20260911-ABC123');
  });

  it('propagates network and API errors properly', async () => {
    vi.spyOn(clientModule, 'apiClient').mockRejectedValue(new Error('Network failure'));

    await expect(getStudentInvoices('stu-1')).rejects.toThrow('Network failure');
  });
});
