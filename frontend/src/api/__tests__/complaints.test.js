import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as clientModule from '../client.js';
import {
  getPendingComplaintsCount,
  listComplaints,
  getComplaintById,
  createComplaint,
  updateComplaintStatus,
  complaintsApi
} from '../complaints.js';

describe('Complaints API Client Module', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. getPendingComplaintsCount', () => {
    it('constructs correct GET URL for pending complaints count', async () => {
      const mockResponse = {
        success: true,
        data: { count: 3 }
      };

      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue(mockResponse);

      const res = await getPendingComplaintsCount();

      expect(apiSpy).toHaveBeenCalledWith('/api/v1/complaints/pending-count', {
        method: 'GET'
      });
      expect(res.data.count).toBe(3);
    });

    it('does not send schoolId, tenantId, or userId as query or body arguments', async () => {
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { count: 0 }
      });

      await getPendingComplaintsCount();

      const calledUrl = apiSpy.mock.calls[0][0];
      const calledOptions = apiSpy.mock.calls[0][1];

      expect(calledUrl).toBe('/api/v1/complaints/pending-count');
      expect(calledUrl).not.toContain('schoolId');
      expect(calledUrl).not.toContain('userId');
      expect(calledOptions?.body).toBeUndefined();
    });

    it('propagates API client errors', async () => {
      vi.spyOn(clientModule, 'apiClient').mockRejectedValue(new Error('Network failure'));

      await expect(getPendingComplaintsCount()).rejects.toThrow('Network failure');
    });
  });

  describe('2. listComplaints', () => {
    it('constructs correct GET URL with query parameters', async () => {
      const mockList = {
        success: true,
        data: [{ id: 'comp-1', title: 'Noise issue', status: 'pending' }],
        pagination: { total: 1, page: 1, limit: 20 }
      };
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue(mockList);

      const res = await listComplaints({ status: 'pending', page: 1, limit: 20 });

      expect(apiSpy).toHaveBeenCalledWith('/api/v1/complaints?status=pending&page=1&limit=20', {
        method: 'GET'
      });
      expect(res.data[0].title).toBe('Noise issue');
    });

    it('omits empty query parameters', async () => {
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({ success: true, data: [] });

      await listComplaints({ status: '', page: 1 });

      expect(apiSpy).toHaveBeenCalledWith('/api/v1/complaints?page=1', { method: 'GET' });
    });
  });

  describe('3. getComplaintById', () => {
    it('constructs correct GET URL and encodes ID', async () => {
      const mockComplaint = { id: 'comp-1', title: 'Facility issue', status: 'pending' };
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: mockComplaint
      });

      const res = await getComplaintById('comp/1');

      expect(apiSpy).toHaveBeenCalledWith('/api/v1/complaints/comp%2F1', {
        method: 'GET'
      });
      expect(res.data.title).toBe('Facility issue');
    });
  });

  describe('4. createComplaint', () => {
    it('constructs correct POST URL with payload', async () => {
      const payload = {
        title: 'Broken desk in room 101',
        description: 'The desk leg is unstable and needs repair'
      };
      const mockCreated = { id: 'comp-new', ...payload, status: 'pending' };
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: mockCreated
      });

      const res = await createComplaint(payload);

      expect(apiSpy).toHaveBeenCalledWith('/api/v1/complaints', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      expect(res.data.id).toBe('comp-new');
    });
  });

  describe('5. updateComplaintStatus', () => {
    it('constructs correct PATCH URL for status update', async () => {
      const payload = {
        status: 'resolved',
        resolutionNotes: 'Desk replaced by maintenance team'
      };
      const mockUpdated = { id: 'comp-1', ...payload };
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: mockUpdated
      });

      const res = await updateComplaintStatus('comp-1', payload);

      expect(apiSpy).toHaveBeenCalledWith('/api/v1/complaints/comp-1/status', {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      expect(res.data.status).toBe('resolved');
    });
  });

  describe('6. Default export integrity', () => {
    it('exports all methods on complaintsApi object', () => {
      expect(complaintsApi.getPendingComplaintsCount).toBe(getPendingComplaintsCount);
      expect(complaintsApi.listComplaints).toBe(listComplaints);
      expect(complaintsApi.getComplaintById).toBe(getComplaintById);
      expect(complaintsApi.createComplaint).toBe(createComplaint);
      expect(complaintsApi.updateComplaintStatus).toBe(updateComplaintStatus);
    });
  });
});
