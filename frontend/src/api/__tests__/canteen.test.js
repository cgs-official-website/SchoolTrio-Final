import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as clientModule from '../client.js';
import {
  getPendingCanteenCount,
  listCanteenRequests,
  createCanteenRequest,
  updateCanteenRequestStatus,
  canteenApi
} from '../canteen.js';

describe('Canteen API Client Module (Phase CA.3)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. getPendingCanteenCount', () => {
    it('constructs correct GET URL for pending canteen count', async () => {
      const mockResponse = {
        success: true,
        data: { count: 3 }
      };

      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue(mockResponse);

      const res = await getPendingCanteenCount();

      expect(apiSpy).toHaveBeenCalledWith('/api/v1/canteen/pending-count', {
        method: 'GET'
      });
      expect(res.data.count).toBe(3);
    });

    it('does not send schoolId, tenantId, or userId as query or body arguments', async () => {
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { count: 0 }
      });

      await getPendingCanteenCount();

      const calledUrl = apiSpy.mock.calls[0][0];
      const calledOptions = apiSpy.mock.calls[0][1];

      expect(calledUrl).toBe('/api/v1/canteen/pending-count');
      expect(calledUrl).not.toContain('schoolId');
      expect(calledUrl).not.toContain('userId');
      expect(calledOptions?.body).toBeUndefined();
    });

    it('propagates API client errors', async () => {
      vi.spyOn(clientModule, 'apiClient').mockRejectedValue(new Error('Network failure'));

      await expect(getPendingCanteenCount()).rejects.toThrow('Network failure');
    });
  });

  describe('2. listCanteenRequests', () => {
    it('constructs correct GET URL without params', async () => {
      const mockResponse = { status: 'success', data: [] };
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue(mockResponse);

      const res = await listCanteenRequests();

      expect(apiSpy).toHaveBeenCalledWith('/api/v1/canteen/requests', {
        method: 'GET'
      });
      expect(res.data).toEqual([]);
    });

    it('appends allowed query parameters correctly', async () => {
      const mockResponse = { status: 'success', data: [] };
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue(mockResponse);

      await listCanteenRequests({
        status: 'Pending',
        mealType: 'Breakfast',
        date: '2026-09-20',
        search: 'Alice',
        studentId: '22222222-2222-4222-8222-222222222222',
        unsupportedParam: 'disallowed'
      });

      const calledUrl = apiSpy.mock.calls[0][0];
      expect(calledUrl).toContain('/api/v1/canteen/requests?');
      expect(calledUrl).toContain('status=Pending');
      expect(calledUrl).toContain('mealType=Breakfast');
      expect(calledUrl).toContain('date=2026-09-20');
      expect(calledUrl).toContain('search=Alice');
      expect(calledUrl).toContain('studentId=22222222-2222-4222-8222-222222222222');
      expect(calledUrl).not.toContain('unsupportedParam');
      expect(calledUrl).not.toContain('schoolId');
    });
  });

  describe('3. createCanteenRequest', () => {
    it('constructs correct POST URL and body payload', async () => {
      const mockPayload = {
        studentId: '22222222-2222-4222-8222-222222222222',
        mealType: 'Lunch',
        date: '2026-09-20'
      };
      const mockResponse = { status: 'success', data: { id: 'req-1', ...mockPayload } };
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue(mockResponse);

      const res = await createCanteenRequest(mockPayload);

      expect(apiSpy).toHaveBeenCalledWith('/api/v1/canteen/requests', {
        method: 'POST',
        body: JSON.stringify(mockPayload)
      });
      expect(res.data.id).toBe('req-1');
    });
  });

  describe('4. updateCanteenRequestStatus', () => {
    it('constructs correct PATCH URL and body payload with encoded ID', async () => {
      const requestId = 'req-123/special';
      const mockPayload = { status: 'Approved' };
      const mockResponse = { status: 'success', data: { id: requestId, status: 'Approved' } };
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue(mockResponse);

      const res = await updateCanteenRequestStatus(requestId, mockPayload);

      expect(apiSpy).toHaveBeenCalledWith(`/api/v1/canteen/requests/${encodeURIComponent(requestId)}/status`, {
        method: 'PATCH',
        body: JSON.stringify(mockPayload)
      });
      expect(res.data.status).toBe('Approved');
    });
  });

  describe('5. Default export integrity', () => {
    it('exports all 4 methods on canteenApi object', () => {
      expect(canteenApi.getPendingCanteenCount).toBe(getPendingCanteenCount);
      expect(canteenApi.listCanteenRequests).toBe(listCanteenRequests);
      expect(canteenApi.createCanteenRequest).toBe(createCanteenRequest);
      expect(canteenApi.updateCanteenRequestStatus).toBe(updateCanteenRequestStatus);
    });
  });
});
