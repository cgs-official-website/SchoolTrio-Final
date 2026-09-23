import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as homeworkRepository from '../../../src/modules/homework/homework.repository.js';
import * as homeworkService from '../../../src/modules/homework/homework.service.js';
import { SYSTEM_ROLES } from '../../../src/config/constants.js';

vi.mock('../../../src/modules/homework/homework.repository.js');
vi.mock('../../../src/modules/audit/audit.repository.js', () => ({
  createAuditLog: vi.fn().mockResolvedValue({ id: 'audit-1' })
}));

describe('Unit: Homework Concurrency & Isolation Safety — Phase 4C.7-D.2-I-M.1', () => {
  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
  const CLASS_ID = '22222222-2222-4222-8222-222222222222';
  const STUDENT_ID = '33333333-3333-4333-8333-333333333333';
  const HOMEWORK_ID = '44444444-4444-4444-8444-444444444444';
  const PARENT_USER_ID = '55555555-5555-4555-8555-555555555555';
  const TEACHER_USER_ID = '66666666-6666-4666-8666-666666666666';

  const PARENT_ACTOR = {
    userId: PARENT_USER_ID,
    systemRole: SYSTEM_ROLES.PARENT,
    role: 'PARENT'
  };

  const TEACHER_ACTOR = {
    userId: TEACHER_USER_ID,
    systemRole: SYSTEM_ROLES.TEACHER,
    role: 'TEACHER'
  };

  const MOCK_ASSIGNMENT = {
    id: HOMEWORK_ID,
    schoolId: SCHOOL_ID,
    classId: CLASS_ID,
    title: 'Science Project'
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handles simultaneous parent status update and teacher grading on same submission', async () => {
    homeworkRepository.findStudentInTenant.mockResolvedValue({
      id: STUDENT_ID,
      schoolId: SCHOOL_ID,
      classId: CLASS_ID
    });
    homeworkRepository.findAuthorizedStudentIdsForParent.mockResolvedValue([STUDENT_ID]);
    homeworkRepository.findHomeworkById.mockResolvedValue(MOCK_ASSIGNMENT);
    homeworkRepository.findStaffProfileByUserId.mockResolvedValue({
      id: 'staff-1',
      assignedClassId: CLASS_ID,
      headedClasses: []
    });

    let currentSubmission = {
      id: 'sub-uuid-1',
      schoolId: SCHOOL_ID,
      homeworkId: HOMEWORK_ID,
      studentId: STUDENT_ID,
      status: 'In Progress',
      grade: null,
      feedback: null,
      submittedAt: null,
      updatedAt: new Date()
    };

    homeworkRepository.upsertSubmission.mockImplementation(async (schoolId, hwId, studId, data) => {
      currentSubmission = {
        ...currentSubmission,
        ...data,
        updatedAt: new Date()
      };
      return currentSubmission;
    });

    // Parent updates status to Submitted
    const parentReq = homeworkService.updateStudentHomeworkStatus(
      SCHOOL_ID,
      STUDENT_ID,
      HOMEWORK_ID,
      { status: 'Submitted' },
      PARENT_ACTOR
    );

    // Teacher grades the submission
    const teacherReq = homeworkService.updateStaffSubmission(
      SCHOOL_ID,
      HOMEWORK_ID,
      STUDENT_ID,
      { grade: 'A', feedback: 'Good job' },
      TEACHER_ACTOR
    );

    const [parentRes, teacherRes] = await Promise.all([parentReq, teacherReq]);

    expect(parentRes).toBeDefined();
    expect(teacherRes).toBeDefined();
    expect(currentSubmission.grade).toBe('A');
    expect(currentSubmission.feedback).toBe('Good job');
  });
});
