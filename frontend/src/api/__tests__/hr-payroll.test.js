import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as clientModule from '../client.js';
import {
  listPayroll,
  getMySalary,
  generatePayroll,
  updatePayrollStatus,
  deletePayroll,
  getConfig,
  updateConfig,
  fetchAllPayroll
} from '../hr-payroll.js';

describe('HR & Payroll API Client (src/api/hr-payroll.js)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('listPayroll', () => {
    it('calls GET /api/v1/hr-payroll with query parameters', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: [{ id: 'p-1', month: 'JANUARY 2026', status: 'Pending' }],
        pagination: { total: 1, page: 1, limit: 10, totalPages: 1 }
      });

      const res = await listPayroll({ page: 1, limit: 10, month: 'JANUARY 2026', status: 'Pending' });

      expect(spy).toHaveBeenCalledWith(
        '/api/v1/hr-payroll?page=1&limit=10&month=JANUARY+2026&status=Pending',
        { method: 'GET' }
      );
      expect(res.data).toHaveLength(1);
    });

    it('handles call without query parameters', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: []
      });

      await listPayroll();
      expect(spy).toHaveBeenCalledWith('/api/v1/hr-payroll', { method: 'GET' });
    });
  });

  describe('getMySalary', () => {
    it('calls GET /api/v1/hr-payroll/my-salary with month filter without sending client staff authority', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: [{ id: 'p-1', month: 'JANUARY 2026', status: 'Payslip Released' }]
      });

      const res = await getMySalary({ month: 'JANUARY 2026' });

      expect(spy).toHaveBeenCalledWith(
        '/api/v1/hr-payroll/my-salary?month=JANUARY+2026',
        { method: 'GET' }
      );
      expect(res.data).toHaveLength(1);
    });
  });

  describe('generatePayroll', () => {
    it('calls POST /api/v1/hr-payroll/generate with payload', async () => {
      const payload = {
        month: 'JANUARY 2026',
        records: [
          { staffId: 'staff-uuid-1', baseSalary: 30000, deductions: 1800 }
        ]
      };

      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        message: 'Payroll generated successfully for 1 staff member(s)',
        data: [{ id: 'p-1', ...payload.records[0] }],
        count: 1
      });

      const res = await generatePayroll(payload);

      expect(spy).toHaveBeenCalledWith('/api/v1/hr-payroll/generate', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      expect(res.count).toBe(1);
    });
  });

  describe('updatePayrollStatus', () => {
    it('calls PATCH /api/v1/hr-payroll/:id/status with payload', async () => {
      const id = 'p-uuid-123';
      const payload = { status: 'Paid' };

      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { id, status: 'Paid' }
      });

      const res = await updatePayrollStatus(id, payload);

      expect(spy).toHaveBeenCalledWith(`/api/v1/hr-payroll/${encodeURIComponent(id)}/status`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      expect(res.data.status).toBe('Paid');
    });
  });

  describe('deletePayroll', () => {
    it('calls DELETE /api/v1/hr-payroll/:id', async () => {
      const id = 'p-uuid-123';
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        message: 'Payroll draft record deleted successfully'
      });

      const res = await deletePayroll(id);

      expect(spy).toHaveBeenCalledWith(`/api/v1/hr-payroll/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
      expect(res.success).toBe(true);
    });
  });

  describe('getConfig & updateConfig', () => {
    it('getConfig calls GET /api/v1/hr-payroll/config', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { authorizedSignature: 'https://cdn.school.com/sig.png' }
      });

      const res = await getConfig();

      expect(spy).toHaveBeenCalledWith('/api/v1/hr-payroll/config', { method: 'GET' });
      expect(res.data.authorizedSignature).toBe('https://cdn.school.com/sig.png');
    });

    it('updateConfig calls PATCH /api/v1/hr-payroll/config with signature payload', async () => {
      const payload = { authorizedSignature: 'data:image/png;base64,...' };
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: payload
      });

      const res = await updateConfig(payload);

      expect(spy).toHaveBeenCalledWith('/api/v1/hr-payroll/config', {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      expect(res.data.authorizedSignature).toBe(payload.authorizedSignature);
    });
  });

  describe('fetchAllPayroll', () => {
    it('sequentially fetches all pages up to totalPages', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient')
        .mockResolvedValueOnce({
          success: true,
          data: [{ id: 'p-1' }, { id: 'p-2' }],
          pagination: { totalPages: 2, page: 1, limit: 2 }
        })
        .mockResolvedValueOnce({
          success: true,
          data: [{ id: 'p-3' }],
          pagination: { totalPages: 2, page: 2, limit: 2 }
        });

      const allRecords = await fetchAllPayroll({ limit: 2 });

      expect(spy).toHaveBeenCalledTimes(2);
      expect(allRecords).toHaveLength(3);
      expect(allRecords.map(r => r.id)).toEqual(['p-1', 'p-2', 'p-3']);
    });
  });
});
