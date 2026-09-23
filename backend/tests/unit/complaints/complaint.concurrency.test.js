import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as complaintService from '../../../src/modules/complaints/complaint.service.js';
import * as complaintRepository from '../../../src/modules/complaints/complaint.repository.js';
import * as auditRepository from '../../../src/modules/audit/audit.repository.js';
import { prisma } from '../../../src/database/prisma.client.js';
import { ConflictError } from '../../../src/utils/app-error.js';

describe('Complaint Concurrency & State Machine Unit Tests (CO.2)', () => {
  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
  const COMPLAINT_ID = '22222222-2222-4222-8222-222222222222';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects status mutation on an already resolved complaint with ConflictError', async () => {
    const existing = {
      id: COMPLAINT_ID,
      schoolId: SCHOOL_ID,
      status: 'resolved',
      resolutionNotes: 'First admin resolved it'
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
        { userId: 'admin-2', systemRole: 'SCHOOL_ADMIN' },
        { status: 'rejected', resolutionNotes: 'Second admin rejected it' }
      )
    ).rejects.toThrow(ConflictError);
  });

  it('rejects status mutation on an already rejected complaint with ConflictError', async () => {
    const existing = {
      id: COMPLAINT_ID,
      schoolId: SCHOOL_ID,
      status: 'rejected',
      resolutionNotes: 'First admin rejected it'
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
        { userId: 'admin-2', systemRole: 'SCHOOL_ADMIN' },
        { status: 'resolved', resolutionNotes: 'Second admin resolved it' }
      )
    ).rejects.toThrow(ConflictError);
  });
});
