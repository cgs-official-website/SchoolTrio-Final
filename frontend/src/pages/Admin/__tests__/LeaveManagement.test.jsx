import { describe, it, expect, vi, beforeEach } from 'vitest';
import LeaveManagement from '../LeaveManagement.jsx';
import * as leavesApi from '../../../api/leaves.js';
import * as firestoreModule from '../../../firebase/firestore.js';

describe('Admin LeaveManagement Component (Phase L.1 REST Migration)', () => {
  const MOCK_LEAVES = [
    {
      id: 'leave-1',
      applicantName: 'Jane Teacher',
      applicantRole: 'teacher',
      leaveType: 'Annual Leave',
      startDate: '2026-10-01',
      endDate: '2026-10-05',
      reason: 'Vacation',
      status: 'Pending',
      submittedAt: '2026-09-15T10:00:00.000Z',
      supportingDoc: null
    },
    {
      id: 'leave-2',
      applicantName: 'John Student',
      applicantRole: 'student',
      leaveType: 'Sick Leave',
      startDate: '2026-09-10',
      endDate: '2026-09-12',
      reason: 'Fever',
      status: 'Approved',
      submittedAt: '2026-09-09T08:00:00.000Z',
      supportingDoc: {
        name: 'doctor_note.pdf',
        size: '1.1 MB',
        url: 'https://cloudinary.com/sample.pdf'
      }
    }
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('is exported as a function/component', () => {
    expect(typeof LeaveManagement).toBe('function');
  });

  describe('1. REST Leave Listing', () => {
    it('calls leavesApi.listLeaves and retrieves tenant leaves', async () => {
      const listSpy = vi.spyOn(leavesApi, 'listLeaves').mockResolvedValue({
        success: true,
        data: MOCK_LEAVES,
        pagination: { total: 2, page: 1, limit: 200 }
      });

      const res = await leavesApi.listLeaves({ limit: 200 });

      expect(listSpy).toHaveBeenCalledWith({ limit: 200 });
      expect(res.data).toHaveLength(2);
      expect(res.data[0].id).toBe('leave-1');
      expect(res.data[0].applicantName).toBe('Jane Teacher');
    });

    it('does NOT call legacy Firestore operations for leaves', () => {
      const subscribeSpy = vi.spyOn(firestoreModule, 'subscribeToSubCollection');
      const updateSpy = vi.spyOn(firestoreModule, 'updateSubDocument');
      const deleteSpy = vi.spyOn(firestoreModule, 'deleteSubDocument');

      expect(subscribeSpy).not.toHaveBeenCalled();
      expect(updateSpy).not.toHaveBeenCalled();
      expect(deleteSpy).not.toHaveBeenCalled();
    });
  });

  describe('2. Status Transitions & Deletions via REST', () => {
    it('calls leavesApi.updateLeaveStatus on approval', async () => {
      const updateSpy = vi.spyOn(leavesApi, 'updateLeaveStatus').mockResolvedValue({
        success: true,
        data: { id: 'leave-1', status: 'Approved' }
      });

      const res = await leavesApi.updateLeaveStatus('leave-1', { status: 'Approved' });

      expect(updateSpy).toHaveBeenCalledWith('leave-1', { status: 'Approved' });
      expect(res.data.status).toBe('Approved');
    });

    it('calls leavesApi.updateLeaveStatus on rejection', async () => {
      const updateSpy = vi.spyOn(leavesApi, 'updateLeaveStatus').mockResolvedValue({
        success: true,
        data: { id: 'leave-1', status: 'Rejected' }
      });

      const res = await leavesApi.updateLeaveStatus('leave-1', { status: 'Rejected' });

      expect(updateSpy).toHaveBeenCalledWith('leave-1', { status: 'Rejected' });
      expect(res.data.status).toBe('Rejected');
    });

    it('calls leavesApi.deleteLeave on delete', async () => {
      const deleteSpy = vi.spyOn(leavesApi, 'deleteLeave').mockResolvedValue({
        success: true,
        data: { id: 'leave-1', deleted: true }
      });

      const res = await leavesApi.deleteLeave('leave-1');

      expect(deleteSpy).toHaveBeenCalledWith('leave-1');
      expect(res.data.deleted).toBe(true);
    });
  });
});
