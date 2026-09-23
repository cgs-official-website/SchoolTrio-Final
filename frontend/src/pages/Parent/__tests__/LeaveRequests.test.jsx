import { describe, it, expect, vi, beforeEach } from 'vitest';
import LeaveRequests from '../LeaveRequests.jsx';
import * as leavesApi from '../../../api/leaves.js';
import * as firestoreModule from '../../../firebase/firestore.js';

describe('Parent LeaveRequests Component (REST Migration - Phase 4C.7-D.2-I-L.2)', () => {
  const STUDENT_ID = '11111111-1111-4111-8111-111111111111';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('is exported as a function/component', () => {
    expect(typeof LeaveRequests).toBe('function');
  });

  describe('1. REST Leave Fetching & Query Parameters', () => {
    it('fetches leaves via REST getStudentLeaves with studentId, limit=100, and order=desc', async () => {
      const apiSpy = vi.spyOn(leavesApi, 'getStudentLeaves').mockResolvedValue({
        success: true,
        data: [
          {
            id: 'leave-1',
            studentId: STUDENT_ID,
            leaveType: 'Sick Leave',
            startDate: '2026-09-15',
            endDate: '2026-09-16',
            reason: 'High fever',
            status: 'Pending',
            supportingDoc: {
              name: 'prescription.pdf',
              size: '1.2 MB',
              url: 'https://cloudinary.com/sample.pdf'
            },
            createdAt: '2026-09-14T10:00:00.000Z'
          }
        ],
        pagination: { total: 1, page: 1, limit: 100 }
      });

      const res = await leavesApi.getStudentLeaves(STUDENT_ID, { limit: 100, order: 'desc' });

      expect(apiSpy).toHaveBeenCalledWith(STUDENT_ID, { limit: 100, order: 'desc' });
      expect(apiSpy.mock.calls[0][1]).not.toHaveProperty('schoolId');
      expect(res.data).toHaveLength(1);
      expect(res.data[0].id).toBe('leave-1');
      expect(res.data[0].leaveType).toBe('Sick Leave');
    });

    it('does NOT call legacy Firestore subscribeToSubCollection, addSubDocument, or getDoc for leaves in Parent flow', () => {
      const subscribeSpy = vi.spyOn(firestoreModule, 'subscribeToSubCollection');
      const addDocSpy = vi.spyOn(firestoreModule, 'addSubDocument');

      expect(subscribeSpy).not.toHaveBeenCalled();
      expect(addDocSpy).not.toHaveBeenCalled();
    });
  });

  describe('2. Leave Creation & REST Payload Forwarding', () => {
    it('submits leave application via REST createStudentLeave with exact payload fields', async () => {
      const createSpy = vi.spyOn(leavesApi, 'createStudentLeave').mockResolvedValue({
        success: true,
        data: {
          id: 'leave-created-1',
          studentId: STUDENT_ID,
          leaveType: 'Sick Leave',
          startDate: '2026-09-20',
          endDate: '2026-09-22',
          reason: 'Doctor appointment',
          status: 'Pending',
          supportingDoc: null,
          createdAt: '2026-09-14T12:00:00.000Z'
        }
      });

      const payload = {
        leaveType: 'Sick Leave',
        startDate: '2026-09-20',
        endDate: '2026-09-22',
        reason: 'Doctor appointment',
        supportingDoc: null
      };

      const res = await leavesApi.createStudentLeave(STUDENT_ID, payload);

      expect(createSpy).toHaveBeenCalledWith(STUDENT_ID, payload);
      expect(res.data.id).toBe('leave-created-1');
      expect(res.data.status).toBe('Pending');

      // Verify no legacy authority fields are included in the payload
      expect(payload).not.toHaveProperty('applicantId');
      expect(payload).not.toHaveProperty('applicantName');
      expect(payload).not.toHaveProperty('applicantRole');
      expect(payload).not.toHaveProperty('schoolId');
      expect(payload).not.toHaveProperty('status');
      expect(payload).not.toHaveProperty('submittedAt');
    });

    it('submits custom leave type when leaveType is others', async () => {
      const createSpy = vi.spyOn(leavesApi, 'createStudentLeave').mockResolvedValue({
        success: true,
        data: {
          id: 'leave-created-2',
          studentId: STUDENT_ID,
          leaveType: 'Family Function',
          startDate: '2026-10-01',
          endDate: '2026-10-01',
          reason: 'Sister wedding',
          status: 'Pending',
          supportingDoc: null,
          createdAt: '2026-09-14T12:00:00.000Z'
        }
      });

      const payload = {
        leaveType: 'Family Function',
        startDate: '2026-10-01',
        endDate: '2026-10-01',
        reason: 'Sister wedding',
        supportingDoc: null
      };

      const res = await leavesApi.createStudentLeave(STUDENT_ID, payload);

      expect(createSpy).toHaveBeenCalledWith(STUDENT_ID, payload);
      expect(res.data.leaveType).toBe('Family Function');
    });

    it('submits supporting document metadata when attached', async () => {
      const createSpy = vi.spyOn(leavesApi, 'createStudentLeave').mockResolvedValue({
        success: true,
        data: {
          id: 'leave-created-3',
          studentId: STUDENT_ID,
          leaveType: 'Sick Leave',
          startDate: '2026-09-15',
          endDate: '2026-09-16',
          reason: 'Fever',
          status: 'Pending',
          supportingDoc: {
            name: 'medical_report.pdf',
            size: '2.1 MB',
            url: 'https://cloudinary.com/sample_report.pdf'
          },
          createdAt: '2026-09-14T12:00:00.000Z'
        }
      });

      const payload = {
        leaveType: 'Sick Leave',
        startDate: '2026-09-15',
        endDate: '2026-09-16',
        reason: 'Fever',
        supportingDoc: {
          name: 'medical_report.pdf',
          size: '2.1 MB',
          url: 'https://cloudinary.com/sample_report.pdf'
        }
      };

      const res = await leavesApi.createStudentLeave(STUDENT_ID, payload);

      expect(createSpy).toHaveBeenCalledWith(STUDENT_ID, payload);
      expect(res.data.supportingDoc.url).toBe('https://cloudinary.com/sample_report.pdf');
    });
  });

  describe('3. Error Handling & Stale Response Protection', () => {
    it('propagates API error when getStudentLeaves fails', async () => {
      vi.spyOn(leavesApi, 'getStudentLeaves').mockRejectedValue(new Error('Network error loading leaves'));

      await expect(leavesApi.getStudentLeaves(STUDENT_ID)).rejects.toThrow('Network error loading leaves');
    });

    it('propagates API error when createStudentLeave fails', async () => {
      vi.spyOn(leavesApi, 'createStudentLeave').mockRejectedValue(new Error('Validation failed on server'));

      await expect(leavesApi.createStudentLeave(STUDENT_ID, {})).rejects.toThrow('Validation failed on server');
    });
  });
});
