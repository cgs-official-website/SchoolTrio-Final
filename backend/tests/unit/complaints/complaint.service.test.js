import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as complaintService from '../../../src/modules/complaints/complaint.service.js';
import * as complaintRepository from '../../../src/modules/complaints/complaint.repository.js';
import * as auditRepository from '../../../src/modules/audit/audit.repository.js';
import { prisma } from '../../../src/database/prisma.client.js';
import {
  ValidationError,
  NotFoundError,
  ForbiddenError,
  ConflictError
} from '../../../src/utils/app-error.js';

describe('Complaint Service Unit Tests (CO.2)', () => {
  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
  const COMPLAINT_ID = '22222222-2222-4222-8222-222222222222';
  const USER_ID = '33333333-3333-4333-8333-333333333333';
  const OTHER_USER_ID = '44444444-4444-4444-8444-444444444444';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('getPendingComplaintsCount', () => {
    it('throws ValidationError when schoolId is missing', async () => {
      await expect(complaintService.getPendingComplaintsCount(null))
        .rejects.toThrow(ValidationError);
      await expect(complaintService.getPendingComplaintsCount(''))
        .rejects.toThrow('Tenant context required: schoolId is missing');
    });

    it('retrieves pending complaint count for the school', async () => {
      const countSpy = vi.spyOn(complaintRepository, 'countPendingComplaints').mockResolvedValue(5);

      const result = await complaintService.getPendingComplaintsCount(SCHOOL_ID, { role: 'admin' });

      expect(countSpy).toHaveBeenCalledWith(SCHOOL_ID);
      expect(result).toEqual({ count: 5 });
    });

    it('returns count 0 when there are no pending complaints', async () => {
      vi.spyOn(complaintRepository, 'countPendingComplaints').mockResolvedValue(0);

      const result = await complaintService.getPendingComplaintsCount(SCHOOL_ID, { role: 'admin' });

      expect(result).toEqual({ count: 0 });
    });

    it('propagates database errors thrown by repository', async () => {
      vi.spyOn(complaintRepository, 'countPendingComplaints').mockRejectedValue(new Error('DB connection failure'));

      await expect(complaintService.getPendingComplaintsCount(SCHOOL_ID, { role: 'admin' }))
        .rejects.toThrow('DB connection failure');
    });
  });

  describe('listComplaints', () => {
    it('lists all tenant complaints for Admin/Principal without submitter restriction', async () => {
      const mockList = {
        data: [
          { id: COMPLAINT_ID, schoolId: SCHOOL_ID, title: 'Issue 1', status: 'pending', submittedByUserId: USER_ID }
        ],
        total: 1
      };
      const repoSpy = vi.spyOn(complaintRepository, 'listComplaints').mockResolvedValue(mockList);

      const result = await complaintService.listComplaints(
        SCHOOL_ID,
        { userId: 'admin-1', systemRole: 'SCHOOL_ADMIN' },
        { page: 1, limit: 10, status: 'pending' }
      );

      expect(repoSpy).toHaveBeenCalledWith(SCHOOL_ID, {
        status: 'pending',
        submittedByUserId: undefined,
        skip: 0,
        take: 10
      });
      expect(result.data).toHaveLength(1);
      expect(result.pagination.total).toBe(1);
      expect(result.pagination.totalPages).toBe(1);
    });

    it('scopes listing strictly to submittedByUserId for non-admin callers (Teacher/Parent/Student/Staff)', async () => {
      const mockList = { data: [], total: 0 };
      const repoSpy = vi.spyOn(complaintRepository, 'listComplaints').mockResolvedValue(mockList);

      await complaintService.listComplaints(
        SCHOOL_ID,
        { userId: USER_ID, systemRole: 'PARENT' },
        { page: 2, limit: 5 }
      );

      expect(repoSpy).toHaveBeenCalledWith(SCHOOL_ID, {
        status: undefined,
        submittedByUserId: USER_ID,
        skip: 5,
        take: 5
      });
    });
  });

  describe('getComplaintById', () => {
    it('allows Admin to view any complaint in tenant', async () => {
      const mockComplaint = {
        id: COMPLAINT_ID,
        schoolId: SCHOOL_ID,
        title: 'Issue',
        submittedByUserId: OTHER_USER_ID,
        status: 'pending'
      };
      vi.spyOn(complaintRepository, 'findComplaintById').mockResolvedValue(mockComplaint);

      const result = await complaintService.getComplaintById(
        SCHOOL_ID,
        COMPLAINT_ID,
        { userId: 'admin-1', systemRole: 'SCHOOL_ADMIN' }
      );

      expect(result.id).toBe(COMPLAINT_ID);
    });

    it('allows non-admin owner to view their own complaint', async () => {
      const mockComplaint = {
        id: COMPLAINT_ID,
        schoolId: SCHOOL_ID,
        title: 'Issue',
        submittedByUserId: USER_ID,
        status: 'pending'
      };
      vi.spyOn(complaintRepository, 'findComplaintById').mockResolvedValue(mockComplaint);

      const result = await complaintService.getComplaintById(
        SCHOOL_ID,
        COMPLAINT_ID,
        { userId: USER_ID, systemRole: 'PARENT' }
      );

      expect(result.id).toBe(COMPLAINT_ID);
    });

    it('throws ForbiddenError when non-admin user tries to view another users complaint', async () => {
      const mockComplaint = {
        id: COMPLAINT_ID,
        schoolId: SCHOOL_ID,
        title: 'Issue',
        submittedByUserId: OTHER_USER_ID,
        status: 'pending'
      };
      vi.spyOn(complaintRepository, 'findComplaintById').mockResolvedValue(mockComplaint);

      await expect(
        complaintService.getComplaintById(
          SCHOOL_ID,
          COMPLAINT_ID,
          { userId: USER_ID, systemRole: 'PARENT' }
        )
      ).rejects.toThrow(ForbiddenError);
    });

    it('throws NotFoundError when complaint does not exist in tenant', async () => {
      vi.spyOn(complaintRepository, 'findComplaintById').mockResolvedValue(null);

      await expect(
        complaintService.getComplaintById(
          SCHOOL_ID,
          COMPLAINT_ID,
          { userId: 'admin-1', systemRole: 'SCHOOL_ADMIN' }
        )
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('createComplaint', () => {
    it('creates complaint with status pending and derives submitter from actor context', async () => {
      const mockCreated = {
        id: COMPLAINT_ID,
        schoolId: SCHOOL_ID,
        title: 'Classroom Issue',
        description: 'Need repair',
        status: 'pending',
        submittedByUserId: USER_ID,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      const createSpy = vi.spyOn(complaintRepository, 'createComplaint').mockResolvedValue(mockCreated);
      const auditSpy = vi.spyOn(auditRepository, 'createAuditLog').mockResolvedValue({});

      const result = await complaintService.createComplaint(
        SCHOOL_ID,
        { userId: USER_ID, systemRole: 'PARENT', email: 'parent@example.com' },
        { title: '  Classroom Issue  ', description: '  Need repair  ' }
      );

      expect(createSpy).toHaveBeenCalledWith(SCHOOL_ID, {
        title: 'Classroom Issue',
        description: 'Need repair',
        submittedByUserId: USER_ID
      });
      expect(result.status).toBe('pending');
      expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({
        schoolId: SCHOOL_ID,
        entityType: 'Complaint',
        actionPerformed: 'COMPLAINT_CREATED'
      }));
    });

    it('throws ValidationError when title or description is missing', async () => {
      await expect(
        complaintService.createComplaint(
          SCHOOL_ID,
          { userId: USER_ID },
          { title: '', description: 'Desc' }
        )
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('updateComplaintStatus', () => {
    it('successfully updates pending complaint to resolved inside transaction and logs audit event', async () => {
      const existing = {
        id: COMPLAINT_ID,
        schoolId: SCHOOL_ID,
        status: 'pending'
      };
      const updated = {
        id: COMPLAINT_ID,
        schoolId: SCHOOL_ID,
        status: 'resolved',
        resolutionNotes: 'Fixed by maintenance team',
        resolvedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      };

      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback) => {
        const tx = {
          $queryRaw: vi.fn().mockResolvedValue([existing])
        };
        vi.spyOn(complaintRepository, 'findComplaintByIdForUpdate').mockResolvedValue(existing);
        vi.spyOn(complaintRepository, 'updateComplaintStatus').mockResolvedValue(updated);
        return callback(tx);
      });
      const auditSpy = vi.spyOn(auditRepository, 'createAuditLog').mockResolvedValue({});

      const result = await complaintService.updateComplaintStatus(
        SCHOOL_ID,
        COMPLAINT_ID,
        { userId: 'admin-1', systemRole: 'SCHOOL_ADMIN', email: 'admin@school.com' },
        { status: 'resolved', resolutionNotes: 'Fixed by maintenance team' }
      );

      expect(result.status).toBe('resolved');
      expect(result.resolutionNotes).toBe('Fixed by maintenance team');
      expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({
        actionPerformed: 'COMPLAINT_RESOLVED'
      }));
    });

    it('throws ConflictError if complaint is already in resolved status', async () => {
      const existing = {
        id: COMPLAINT_ID,
        schoolId: SCHOOL_ID,
        status: 'resolved'
      };

      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback) => {
        const tx = {};
        vi.spyOn(complaintRepository, 'findComplaintByIdForUpdate').mockResolvedValue(existing);
        return callback(tx);
      });

      await expect(
        complaintService.updateComplaintStatus(
          SCHOOL_ID,
          COMPLAINT_ID,
          { userId: 'admin-1', systemRole: 'SCHOOL_ADMIN' },
          { status: 'rejected' }
        )
      ).rejects.toThrow(ConflictError);
    });

    it('throws NotFoundError if complaint is not found', async () => {
      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback) => {
        const tx = {};
        vi.spyOn(complaintRepository, 'findComplaintByIdForUpdate').mockResolvedValue(null);
        return callback(tx);
      });

      await expect(
        complaintService.updateComplaintStatus(
          SCHOOL_ID,
          COMPLAINT_ID,
          { userId: 'admin-1', systemRole: 'SCHOOL_ADMIN' },
          { status: 'resolved' }
        )
      ).rejects.toThrow(NotFoundError);
    });
  });
});
