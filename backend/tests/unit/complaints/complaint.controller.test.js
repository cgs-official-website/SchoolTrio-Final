import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as complaintController from '../../../src/modules/complaints/complaint.controller.js';
import * as complaintService from '../../../src/modules/complaints/complaint.service.js';

describe('Complaint Controller Unit Tests (CO.2)', () => {
  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
  const COMPLAINT_ID = '22222222-2222-4222-8222-222222222222';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('getPendingComplaintsCount', () => {
    it('calls service with schoolId from tenant context and returns success response', async () => {
      const serviceSpy = vi.spyOn(complaintService, 'getPendingComplaintsCount').mockResolvedValue({ count: 7 });

      const req = {
        tenant: { schoolId: SCHOOL_ID },
        auth: { userId: 'user-1', systemRole: 'SCHOOL_ADMIN' }
      };

      const jsonMock = vi.fn();
      const statusMock = vi.fn().mockReturnValue({ json: jsonMock });
      const res = {
        status: statusMock,
        json: jsonMock
      };
      const next = vi.fn();

      await complaintController.getPendingComplaintsCount(req, res, next);

      expect(serviceSpy).toHaveBeenCalledWith(SCHOOL_ID, req.auth);
      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        data: { count: 7 }
      }));
      expect(next).not.toHaveBeenCalled();
    });

    it('falls back to req.auth.schoolId if req.tenant is not set', async () => {
      const serviceSpy = vi.spyOn(complaintService, 'getPendingComplaintsCount').mockResolvedValue({ count: 0 });

      const req = {
        auth: { userId: 'user-1', schoolId: SCHOOL_ID, systemRole: 'SCHOOL_ADMIN' }
      };

      const jsonMock = vi.fn();
      const statusMock = vi.fn().mockReturnValue({ json: jsonMock });
      const res = {
        status: statusMock,
        json: jsonMock
      };
      const next = vi.fn();

      await complaintController.getPendingComplaintsCount(req, res, next);

      expect(serviceSpy).toHaveBeenCalledWith(SCHOOL_ID, req.auth);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        data: { count: 0 }
      }));
    });

    it('calls next with error if service throws', async () => {
      const error = new Error('Service failure');
      vi.spyOn(complaintService, 'getPendingComplaintsCount').mockRejectedValue(error);

      const req = {
        tenant: { schoolId: SCHOOL_ID },
        auth: { userId: 'user-1' }
      };
      const res = {};
      const next = vi.fn();

      await complaintController.getPendingComplaintsCount(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('listComplaints', () => {
    it('returns paginated complaints from service', async () => {
      const mockResult = {
        data: [{ id: COMPLAINT_ID, title: 'Sample' }],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 }
      };
      vi.spyOn(complaintService, 'listComplaints').mockResolvedValue(mockResult);

      const req = {
        tenant: { schoolId: SCHOOL_ID },
        auth: { userId: 'user-1', systemRole: 'SCHOOL_ADMIN' },
        query: { page: 1, limit: 20 }
      };

      const jsonMock = vi.fn();
      const statusMock = vi.fn().mockReturnValue({ json: jsonMock });
      const res = {
        status: statusMock,
        json: jsonMock
      };
      const next = vi.fn();

      await complaintController.listComplaints(req, res, next);

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        data: mockResult.data,
        pagination: expect.objectContaining({ total: 1 })
      }));
    });
  });

  describe('getComplaintById', () => {
    it('returns complaint detail', async () => {
      const mockComplaint = { id: COMPLAINT_ID, title: 'Sample' };
      vi.spyOn(complaintService, 'getComplaintById').mockResolvedValue(mockComplaint);

      const req = {
        tenant: { schoolId: SCHOOL_ID },
        params: { id: COMPLAINT_ID },
        auth: { userId: 'user-1', systemRole: 'SCHOOL_ADMIN' }
      };

      const jsonMock = vi.fn();
      const statusMock = vi.fn().mockReturnValue({ json: jsonMock });
      const res = {
        status: statusMock,
        json: jsonMock
      };
      const next = vi.fn();

      await complaintController.getComplaintById(req, res, next);

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        data: mockComplaint
      }));
    });
  });

  describe('createComplaint', () => {
    it('creates complaint and returns 201', async () => {
      const mockCreated = { id: COMPLAINT_ID, title: 'New Complaint', status: 'pending' };
      vi.spyOn(complaintService, 'createComplaint').mockResolvedValue(mockCreated);

      const req = {
        tenant: { schoolId: SCHOOL_ID },
        auth: { userId: 'admin-1', systemRole: 'SCHOOL_ADMIN' },
        body: { title: 'New Complaint', description: 'Description text' }
      };

      const jsonMock = vi.fn();
      const statusMock = vi.fn().mockReturnValue({ json: jsonMock });
      const res = {
        status: statusMock,
        json: jsonMock
      };
      const next = vi.fn();

      await complaintController.createComplaint(req, res, next);

      expect(statusMock).toHaveBeenCalledWith(201);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        data: mockCreated
      }));
    });
  });

  describe('updateComplaintStatus', () => {
    it('updates status and returns 200', async () => {
      const mockUpdated = { id: COMPLAINT_ID, status: 'resolved', resolutionNotes: 'Resolved' };
      vi.spyOn(complaintService, 'updateComplaintStatus').mockResolvedValue(mockUpdated);

      const req = {
        tenant: { schoolId: SCHOOL_ID },
        params: { id: COMPLAINT_ID },
        auth: { userId: 'admin-1', systemRole: 'SCHOOL_ADMIN' },
        body: { status: 'resolved', resolutionNotes: 'Resolved' }
      };

      const jsonMock = vi.fn();
      const statusMock = vi.fn().mockReturnValue({ json: jsonMock });
      const res = {
        status: statusMock,
        json: jsonMock
      };
      const next = vi.fn();

      await complaintController.updateComplaintStatus(req, res, next);

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        data: mockUpdated
      }));
    });
  });
});
