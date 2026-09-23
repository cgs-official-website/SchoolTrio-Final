import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as clientModule from '../client.js';
import {
  getStudentLeaves,
  createStudentLeave,
  getPendingLeavesCount,
  listLeaves,
  getLeave,
  updateLeaveStatus,
  deleteLeave,
  getMyLeaves,
  createMyLeave,
  leavesApi
} from '../leaves.js';

describe('Leaves API Client Module (Phase L.1)', () => {
  const STUDENT_ID = '11111111-1111-4111-8111-111111111111';
  const LEAVE_ID = '22222222-2222-4222-8222-222222222222';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. getStudentLeaves', () => {
    it('constructs correct GET URL with student ID and query parameters', async () => {
      const mockResponse = {
        success: true,
        data: [
          {
            id: 'leave-1',
            studentId: STUDENT_ID,
            leaveType: 'Sick Leave',
            startDate: '2026-09-15',
            endDate: '2026-09-16',
            reason: 'Flu',
            status: 'Pending',
            createdAt: '2026-09-14T10:00:00.000Z'
          }
        ],
        pagination: { page: 1, limit: 100, total: 1, totalPages: 1, hasNextPage: false, hasPrevPage: false }
      };

      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue(mockResponse);

      const res = await getStudentLeaves(STUDENT_ID, { limit: 100, order: 'desc' });

      expect(apiSpy).toHaveBeenCalledWith(
        `/api/v1/students/${encodeURIComponent(STUDENT_ID)}/leaves?limit=100&order=desc`,
        { method: 'GET' }
      );
      expect(res.data).toHaveLength(1);
      expect(res.data[0].id).toBe('leave-1');
    });

    it('does not send schoolId or applicantId as query arguments', async () => {
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: [],
        pagination: { total: 0 }
      });

      await getStudentLeaves(STUDENT_ID);

      const calledUrl = apiSpy.mock.calls[0][0];
      expect(calledUrl).toBe(`/api/v1/students/${encodeURIComponent(STUDENT_ID)}/leaves`);
      expect(calledUrl).not.toContain('schoolId=');
      expect(calledUrl).not.toContain('applicantId=');
    });

    it('propagates API client errors', async () => {
      vi.spyOn(clientModule, 'apiClient').mockRejectedValue(new Error('API failure'));

      await expect(getStudentLeaves(STUDENT_ID)).rejects.toThrow('API failure');
    });
  });

  describe('2. createStudentLeave', () => {
    it('constructs correct POST URL and forwards JSON body', async () => {
      const mockCreated = {
        success: true,
        data: {
          id: 'leave-uuid-new',
          studentId: STUDENT_ID,
          leaveType: 'Sick Leave',
          startDate: '2026-09-15',
          endDate: '2026-09-17',
          reason: 'Doctor checkup',
          status: 'Pending',
          supportingDoc: {
            name: 'doc.pdf',
            size: '1.2 MB',
            url: 'https://cloudinary.com/demo/sample.pdf'
          },
          createdAt: '2026-09-14T10:00:00.000Z'
        }
      };

      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue(mockCreated);

      const payload = {
        leaveType: 'Sick Leave',
        startDate: '2026-09-15',
        endDate: '2026-09-17',
        reason: 'Doctor checkup',
        supportingDoc: {
          name: 'doc.pdf',
          size: '1.2 MB',
          url: 'https://cloudinary.com/demo/sample.pdf'
        }
      };

      const res = await createStudentLeave(STUDENT_ID, payload);

      expect(apiSpy).toHaveBeenCalledWith(
        `/api/v1/students/${encodeURIComponent(STUDENT_ID)}/leaves`,
        {
          method: 'POST',
          body: JSON.stringify(payload)
        }
      );
      expect(res.data.id).toBe('leave-uuid-new');
      expect(res.data.status).toBe('Pending');
    });
  });

  describe('3. getPendingLeavesCount', () => {
    it('constructs correct GET URL for pending count', async () => {
      const mockResponse = {
        success: true,
        data: { count: 7 }
      };

      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue(mockResponse);

      const res = await leavesApi.getPendingLeavesCount();

      expect(apiSpy).toHaveBeenCalledWith('/api/v1/leaves/pending-count', {
        method: 'GET'
      });
      expect(res.data.count).toBe(7);
    });

    it('propagates API client errors', async () => {
      vi.spyOn(clientModule, 'apiClient').mockRejectedValue(new Error('Pending count error'));

      await expect(leavesApi.getPendingLeavesCount()).rejects.toThrow('Pending count error');
    });
  });

  describe('4. Admin Leave Methods (listLeaves, getLeave, updateLeaveStatus, deleteLeave)', () => {
    it('listLeaves sends GET /api/v1/leaves with query params', async () => {
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: [],
        pagination: { total: 0 }
      });

      await listLeaves({ page: 1, limit: 50, status: 'Pending' });

      expect(apiSpy).toHaveBeenCalledWith('/api/v1/leaves?page=1&limit=50&status=Pending', {
        method: 'GET'
      });
    });

    it('getLeave sends GET /api/v1/leaves/:id', async () => {
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { id: LEAVE_ID }
      });

      await getLeave(LEAVE_ID);

      expect(apiSpy).toHaveBeenCalledWith(`/api/v1/leaves/${encodeURIComponent(LEAVE_ID)}`, {
        method: 'GET'
      });
    });

    it('updateLeaveStatus sends PATCH /api/v1/leaves/:id/status with payload', async () => {
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { id: LEAVE_ID, status: 'Approved' }
      });

      await updateLeaveStatus(LEAVE_ID, { status: 'Approved' });

      expect(apiSpy).toHaveBeenCalledWith(`/api/v1/leaves/${encodeURIComponent(LEAVE_ID)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'Approved' })
      });
    });

    it('deleteLeave sends DELETE /api/v1/leaves/:id', async () => {
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { id: LEAVE_ID, deleted: true }
      });

      await deleteLeave(LEAVE_ID);

      expect(apiSpy).toHaveBeenCalledWith(`/api/v1/leaves/${encodeURIComponent(LEAVE_ID)}`, {
        method: 'DELETE'
      });
    });
  });

  describe('5. Staff Self-Service Methods (getMyLeaves, createMyLeave)', () => {
    it('getMyLeaves sends GET /api/v1/staff/me/leaves with query params', async () => {
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: [],
        pagination: { total: 0 }
      });

      await getMyLeaves({ limit: 50 });

      expect(apiSpy).toHaveBeenCalledWith('/api/v1/staff/me/leaves?limit=50', {
        method: 'GET'
      });
    });

    it('createMyLeave sends POST /api/v1/staff/me/leaves with payload', async () => {
      const payload = {
        leaveType: 'Annual Leave',
        startDate: '2026-10-01',
        endDate: '2026-10-05',
        reason: 'Vacation'
      };

      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { id: LEAVE_ID, status: 'Pending' }
      });

      await createMyLeave(payload);

      expect(apiSpy).toHaveBeenCalledWith('/api/v1/staff/me/leaves', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    });
  });

  describe('6. Leave Approval Rules Methods', () => {
    it('listLeaveApprovalRules calls GET /api/v1/leaves/rules', async () => {
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: [{ id: 'rule-1', minDays: 1, maxDays: 3, roleId: 'role-1', order: 1 }]
      });

      const res = await leavesApi.listLeaveApprovalRules();

      expect(apiSpy).toHaveBeenCalledWith('/api/v1/leaves/rules', {
        method: 'GET'
      });
      expect(res.data).toHaveLength(1);
      expect(res.data[0].id).toBe('rule-1');
    });

    it('createLeaveApprovalRule calls POST /api/v1/leaves/rules with payload', async () => {
      const payload = {
        minDays: 1,
        maxDays: 3,
        roleId: 'role-uuid',
        order: 1
      };

      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { id: 'rule-new', ...payload }
      });

      const res = await leavesApi.createLeaveApprovalRule(payload);

      expect(apiSpy).toHaveBeenCalledWith('/api/v1/leaves/rules', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      expect(res.data.id).toBe('rule-new');
    });

    it('updateLeaveApprovalRule calls PATCH /api/v1/leaves/rules/:id with payload', async () => {
      const payload = { maxDays: 5 };
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { id: 'rule-1', maxDays: 5 }
      });

      const res = await leavesApi.updateLeaveApprovalRule('rule-1', payload);

      expect(apiSpy).toHaveBeenCalledWith('/api/v1/leaves/rules/rule-1', {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      expect(res.data.maxDays).toBe(5);
    });

    it('deleteLeaveApprovalRule calls DELETE /api/v1/leaves/rules/:id', async () => {
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        message: 'Deleted'
      });

      const res = await leavesApi.deleteLeaveApprovalRule('rule-1');

      expect(apiSpy).toHaveBeenCalledWith('/api/v1/leaves/rules/rule-1', {
        method: 'DELETE'
      });
      expect(res.success).toBe(true);
    });
  });

  describe('7. Default export integrity', () => {
    it('exports all methods on leavesApi object', () => {
      expect(leavesApi.listLeaves).toBe(listLeaves);
      expect(leavesApi.getLeave).toBe(getLeave);
      expect(leavesApi.updateLeaveStatus).toBe(updateLeaveStatus);
      expect(leavesApi.deleteLeave).toBe(deleteLeave);
      expect(leavesApi.getMyLeaves).toBe(getMyLeaves);
      expect(leavesApi.createMyLeave).toBe(createMyLeave);
      expect(leavesApi.getStudentLeaves).toBe(getStudentLeaves);
      expect(leavesApi.createStudentLeave).toBe(createStudentLeave);
      expect(leavesApi.getPendingLeavesCount).toBe(getPendingLeavesCount);
      expect(typeof leavesApi.listLeaveApprovalRules).toBe('function');
      expect(typeof leavesApi.createLeaveApprovalRule).toBe('function');
      expect(typeof leavesApi.updateLeaveApprovalRule).toBe('function');
      expect(typeof leavesApi.deleteLeaveApprovalRule).toBe('function');
    });
  });
});

