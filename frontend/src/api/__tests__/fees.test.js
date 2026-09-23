import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as clientModule from '../client.js';
import {
  listCollectionPeriods,
  getCollectionPeriod,
  createCollectionPeriod,
  updateCollectionPeriod,
  deleteCollectionPeriod,
  listFeeStructures,
  getFeeStructure,
  createFeeStructure,
  updateFeeStructure,
  deleteFeeStructure
} from '../fees.js';

describe('Fees API Client Module (Phase Admin REST Cutover)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Fee Collection Periods API', () => {
    it('listCollectionPeriods calls GET /api/v1/fee-collection-periods with query params', async () => {
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: [{ id: 'period-1', name: 'Term 1', dueDate: '2026-10-15', displayOrder: 1 }],
        pagination: { total: 1, page: 1, limit: 50 }
      });

      const res = await listCollectionPeriods({ limit: 100 });

      expect(apiSpy).toHaveBeenCalledWith('/api/v1/fee-collection-periods?limit=100', {
        method: 'GET'
      });
      expect(res.data[0].id).toBe('period-1');
      expect(res.data[0].name).toBe('Term 1');
    });

    it('getCollectionPeriod calls GET /api/v1/fee-collection-periods/:id', async () => {
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { id: 'period-1', name: 'Term 1' }
      });

      const res = await getCollectionPeriod('period-1');

      expect(apiSpy).toHaveBeenCalledWith('/api/v1/fee-collection-periods/period-1', {
        method: 'GET'
      });
      expect(res.data.id).toBe('period-1');
    });

    it('createCollectionPeriod calls POST /api/v1/fee-collection-periods with payload', async () => {
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { id: 'period-new', name: 'Term 2', dueDate: '2026-12-01', displayOrder: 2 }
      });

      const payload = { name: 'Term 2', dueDate: '2026-12-01', displayOrder: 2 };
      const res = await createCollectionPeriod(payload);

      expect(apiSpy).toHaveBeenCalledWith('/api/v1/fee-collection-periods', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      expect(res.data.id).toBe('period-new');
    });

    it('updateCollectionPeriod calls PATCH /api/v1/fee-collection-periods/:id with payload', async () => {
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { id: 'period-1', name: 'Updated Term 1' }
      });

      const payload = { name: 'Updated Term 1' };
      const res = await updateCollectionPeriod('period-1', payload);

      expect(apiSpy).toHaveBeenCalledWith('/api/v1/fee-collection-periods/period-1', {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      expect(res.data.name).toBe('Updated Term 1');
    });

    it('deleteCollectionPeriod calls DELETE /api/v1/fee-collection-periods/:id', async () => {
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { id: 'period-1', deleted: true }
      });

      const res = await deleteCollectionPeriod('period-1');

      expect(apiSpy).toHaveBeenCalledWith('/api/v1/fee-collection-periods/period-1', {
        method: 'DELETE'
      });
      expect(res.data.deleted).toBe(true);
    });
  });

  describe('Fee Structures API', () => {
    it('listFeeStructures calls GET /api/v1/fee-structures with query filters', async () => {
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: [{ id: 'fs-1', name: 'Tuition Fee Grade 10', amount: 5000, classId: 'cls-1' }],
        pagination: { total: 1, page: 1, limit: 50 }
      });

      const res = await listFeeStructures({ classId: 'cls-1', limit: 20 });

      expect(apiSpy).toHaveBeenCalledWith('/api/v1/fee-structures?classId=cls-1&limit=20', {
        method: 'GET'
      });
      expect(res.data[0].id).toBe('fs-1');
    });

    it('getFeeStructure calls GET /api/v1/fee-structures/:id', async () => {
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { id: 'fs-1', name: 'Tuition Fee Grade 10' }
      });

      const res = await getFeeStructure('fs-1');

      expect(apiSpy).toHaveBeenCalledWith('/api/v1/fee-structures/fs-1', {
        method: 'GET'
      });
      expect(res.data.id).toBe('fs-1');
    });

    it('createFeeStructure calls POST /api/v1/fee-structures with payload', async () => {
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: {
          id: 'fs-new',
          name: 'Annual Sports Fee',
          amount: 1200,
          dueDate: '2026-11-01',
          classId: 'cls-1',
          invoicesGenerated: 35
        }
      });

      const payload = {
        name: 'Annual Sports Fee',
        amount: 1200,
        dueDate: '2026-11-01',
        classId: 'cls-1'
      };
      const res = await createFeeStructure(payload);

      expect(apiSpy).toHaveBeenCalledWith('/api/v1/fee-structures', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      expect(res.data.id).toBe('fs-new');
      expect(res.data.invoicesGenerated).toBe(35);
    });

    it('updateFeeStructure calls PATCH /api/v1/fee-structures/:id with payload', async () => {
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { id: 'fs-1', name: 'Updated Fee' }
      });

      const payload = { name: 'Updated Fee' };
      const res = await updateFeeStructure('fs-1', payload);

      expect(apiSpy).toHaveBeenCalledWith('/api/v1/fee-structures/fs-1', {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      expect(res.data.name).toBe('Updated Fee');
    });

    it('deleteFeeStructure calls DELETE /api/v1/fee-structures/:id', async () => {
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { id: 'fs-1', deleted: true }
      });

      const res = await deleteFeeStructure('fs-1');

      expect(apiSpy).toHaveBeenCalledWith('/api/v1/fee-structures/fs-1', {
        method: 'DELETE'
      });
      expect(res.data.deleted).toBe(true);
    });
  });

  describe('Security & Tenant Isolation', () => {
    it('does not send schoolId or userId in URL or payload', async () => {
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({ success: true, data: [] });

      await listCollectionPeriods();
      await listFeeStructures();

      const url1 = apiSpy.mock.calls[0][0];
      const url2 = apiSpy.mock.calls[1][0];

      expect(url1).not.toContain('schoolId=');
      expect(url2).not.toContain('schoolId=');
      expect(url1).not.toContain('userId=');
      expect(url2).not.toContain('userId=');
    });
  });
});
