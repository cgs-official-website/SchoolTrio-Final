import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as complaintRepository from '../../../src/modules/complaints/complaint.repository.js';
import { prisma } from '../../../src/database/prisma.client.js';

describe('Complaint Repository Unit Tests (CO.2)', () => {
  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
  const COMPLAINT_ID = '22222222-2222-4222-8222-222222222222';
  const USER_ID = '33333333-3333-4333-8333-333333333333';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('countPendingComplaints', () => {
    it('queries complaint.count with status in pending, Pending and schoolId', async () => {
      const countSpy = vi.spyOn(prisma.complaint, 'count').mockResolvedValue(4);

      const count = await complaintRepository.countPendingComplaints(SCHOOL_ID);

      expect(countSpy).toHaveBeenCalledWith({
        where: {
          schoolId: SCHOOL_ID,
          status: { in: ['pending', 'Pending'] }
        }
      });
      expect(count).toBe(4);
    });
  });

  describe('listComplaints', () => {
    it('queries findMany and count with pagination and order', async () => {
      const mockRows = [{ id: COMPLAINT_ID, title: 'Test' }];
      const findManySpy = vi.spyOn(prisma.complaint, 'findMany').mockResolvedValue(mockRows);
      const countSpy = vi.spyOn(prisma.complaint, 'count').mockResolvedValue(1);

      const result = await complaintRepository.listComplaints(SCHOOL_ID, {
        status: 'pending',
        submittedByUserId: USER_ID,
        skip: 10,
        take: 5
      });

      expect(findManySpy).toHaveBeenCalledWith({
        where: {
          schoolId: SCHOOL_ID,
          status: 'pending',
          submittedByUserId: USER_ID
        },
        skip: 10,
        take: 5,
        orderBy: { createdAt: 'desc' }
      });
      expect(countSpy).toHaveBeenCalledWith({
        where: {
          schoolId: SCHOOL_ID,
          status: 'pending',
          submittedByUserId: USER_ID
        }
      });
      expect(result.data).toEqual(mockRows);
      expect(result.total).toBe(1);
    });
  });

  describe('findComplaintById', () => {
    it('queries findFirst with id and schoolId', async () => {
      const mockRow = { id: COMPLAINT_ID, schoolId: SCHOOL_ID };
      const findFirstSpy = vi.spyOn(prisma.complaint, 'findFirst').mockResolvedValue(mockRow);

      const result = await complaintRepository.findComplaintById(SCHOOL_ID, COMPLAINT_ID);

      expect(findFirstSpy).toHaveBeenCalledWith({
        where: {
          id: COMPLAINT_ID,
          schoolId: SCHOOL_ID
        }
      });
      expect(result).toEqual(mockRow);
    });
  });

  describe('createComplaint', () => {
    it('creates complaint with status pending', async () => {
      const mockCreated = {
        id: COMPLAINT_ID,
        schoolId: SCHOOL_ID,
        title: 'Title',
        description: 'Desc',
        submittedByUserId: USER_ID,
        status: 'pending'
      };
      const createSpy = vi.spyOn(prisma.complaint, 'create').mockResolvedValue(mockCreated);

      const result = await complaintRepository.createComplaint(SCHOOL_ID, {
        title: 'Title',
        description: 'Desc',
        submittedByUserId: USER_ID
      });

      expect(createSpy).toHaveBeenCalledWith({
        data: {
          schoolId: SCHOOL_ID,
          title: 'Title',
          description: 'Desc',
          submittedByUserId: USER_ID,
          status: 'pending'
        }
      });
      expect(result).toEqual(mockCreated);
    });
  });

  describe('updateComplaintStatus', () => {
    it('updates status and resolution fields', async () => {
      const resolvedAt = new Date();
      const mockUpdated = {
        id: COMPLAINT_ID,
        schoolId: SCHOOL_ID,
        status: 'resolved',
        resolutionNotes: 'Done',
        resolvedAt
      };
      const updateSpy = vi.spyOn(prisma.complaint, 'update').mockResolvedValue(mockUpdated);

      const result = await complaintRepository.updateComplaintStatus(SCHOOL_ID, COMPLAINT_ID, {
        status: 'resolved',
        resolutionNotes: 'Done',
        resolvedAt
      });

      expect(updateSpy).toHaveBeenCalledWith({
        where: {
          schoolId_id: {
            schoolId: SCHOOL_ID,
            id: COMPLAINT_ID
          }
        },
        data: {
          status: 'resolved',
          resolutionNotes: 'Done',
          resolvedAt
        }
      });
      expect(result).toEqual(mockUpdated);
    });
  });
});
