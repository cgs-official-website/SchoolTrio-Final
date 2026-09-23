import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as leaveRepository from '../../../src/modules/leaves/leave.repository.js';
import * as leaveService from '../../../src/modules/leaves/leave.service.js';
import { SYSTEM_ROLES } from '../../../src/config/constants.js';

vi.mock('../../../src/modules/leaves/leave.repository.js');
vi.mock('../../../src/modules/audit/audit.repository.js', () => ({
  createAuditLog: vi.fn().mockResolvedValue({ id: 'audit-1' })
}));

describe('Unit: Leave Concurrency & Isolation Safety — Phase 4C.7-D.2-I-L.1', () => {
  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
  const STUDENT_ID = '22222222-2222-4222-8222-222222222222';
  const PARENT_USER_ID = '33333333-3333-4333-8333-333333333333';

  const PARENT_ACTOR = {
    userId: PARENT_USER_ID,
    email: 'parent@home.com',
    systemRole: SYSTEM_ROLES.PARENT
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handles concurrent leave submissions independently without cross-talk or race conditions', async () => {
    vi.spyOn(leaveRepository, 'findStudentInTenant').mockResolvedValue({ id: STUDENT_ID, schoolId: SCHOOL_ID });
    vi.spyOn(leaveRepository, 'findAuthorizedStudentIdsForParent').mockResolvedValue([STUDENT_ID]);

    let counter = 0;
    vi.spyOn(leaveRepository, 'createLeave').mockImplementation(async (schoolId, studentId, data) => {
      counter += 1;
      return {
        id: `leave-uuid-${counter}`,
        schoolId,
        applicantId: studentId,
        leaveType: data.leaveType,
        startDate: data.startDate,
        endDate: data.endDate,
        reason: data.reason,
        status: 'Pending',
        reviewedBy: null,
        customData: { applicantRole: 'student' },
        createdAt: new Date(),
        updatedAt: new Date()
      };
    });

    const requests = [
      leaveService.createStudentLeave(SCHOOL_ID, STUDENT_ID, {
        leaveType: 'Sick Leave',
        startDate: '2026-09-15',
        endDate: '2026-09-16',
        reason: 'Flu 1'
      }, PARENT_ACTOR),
      leaveService.createStudentLeave(SCHOOL_ID, STUDENT_ID, {
        leaveType: 'Sick Leave',
        startDate: '2026-09-17',
        endDate: '2026-09-18',
        reason: 'Flu 2'
      }, PARENT_ACTOR),
      leaveService.createStudentLeave(SCHOOL_ID, STUDENT_ID, {
        leaveType: 'Casual',
        startDate: '2026-09-22',
        endDate: '2026-09-22',
        reason: 'Family Event'
      }, PARENT_ACTOR)
    ];

    const results = await Promise.all(requests);

    expect(results).toHaveLength(3);
    expect(results[0].id).toBe('leave-uuid-1');
    expect(results[1].id).toBe('leave-uuid-2');
    expect(results[2].id).toBe('leave-uuid-3');
    expect(results.every(r => r.status === 'Pending')).toBe(true);
    expect(results.every(r => r.studentId === STUDENT_ID)).toBe(true);
  });
});
