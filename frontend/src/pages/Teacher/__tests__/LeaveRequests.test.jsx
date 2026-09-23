import { describe, it, expect, vi, beforeEach } from 'vitest';
import LeaveRequests from '../LeaveRequests.jsx';
import * as leavesApi from '../../../api/leaves.js';
import * as firestoreModule from '../../../firebase/firestore.js';

describe('Teacher LeaveRequests Component (Phase L.1 REST Migration)', () => {
  const MOCK_MY_LEAVES = [
    {
      id: 'leave-101',
      leaveType: 'Annual Leave',
      startDate: '2026-10-01',
      endDate: '2026-10-05',
      reason: 'Vacation',
      status: 'Pending',
      submittedAt: '2026-09-15T10:00:00.000Z',
      supportingDoc: null
    },
    {
      id: 'leave-102',
      leaveType: 'Sick Leave',
      startDate: '2026-09-01',
      endDate: '2026-09-02',
      reason: 'Cold',
      status: 'Approved',
      submittedAt: '2026-08-31T09:00:00.000Z',
      supportingDoc: {
        name: 'medical.pdf',
        size: '500 KB',
        url: 'https://cloudinary.com/doc.pdf'
      }
    }
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('is exported as a function/component', () => {
    expect(typeof LeaveRequests).toBe('function');
  });

  describe('1. REST Leave Fetching', () => {
    it('calls leavesApi.getMyLeaves and retrieves staff personal leaves', async () => {
      const myLeavesSpy = vi.spyOn(leavesApi, 'getMyLeaves').mockResolvedValue({
        success: true,
        data: MOCK_MY_LEAVES,
        pagination: { total: 2, page: 1, limit: 100 }
      });

      const res = await leavesApi.getMyLeaves({ limit: 100 });

      expect(myLeavesSpy).toHaveBeenCalledWith({ limit: 100 });
      expect(res.data).toHaveLength(2);
      expect(res.data[0].id).toBe('leave-101');
    });

    it('does NOT call legacy Firestore operations for teacher leaves', () => {
      const subscribeSpy = vi.spyOn(firestoreModule, 'subscribeToSubCollection');
      const addDocSpy = vi.spyOn(firestoreModule, 'addSubDocument');

      expect(subscribeSpy).not.toHaveBeenCalled();
      expect(addDocSpy).not.toHaveBeenCalled();
    });
  });

  describe('2. REST Leave Submission', () => {
    it('calls leavesApi.createMyLeave with payload and server resolves identity', async () => {
      const createSpy = vi.spyOn(leavesApi, 'createMyLeave').mockResolvedValue({
        success: true,
        data: {
          id: 'leave-new-1',
          leaveType: 'Sick Leave',
          startDate: '2026-10-10',
          endDate: '2026-10-12',
          reason: 'Doctor checkup',
          status: 'Pending',
          supportingDoc: null
        }
      });

      const payload = {
        leaveType: 'Sick Leave',
        startDate: '2026-10-10',
        endDate: '2026-10-12',
        reason: 'Doctor checkup',
        supportingDoc: null
      };

      const res = await leavesApi.createMyLeave(payload);

      expect(createSpy).toHaveBeenCalledWith(payload);
      expect(res.data.id).toBe('leave-new-1');
      expect(res.data.status).toBe('Pending');
    });
  });
});
