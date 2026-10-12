import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as homeworkService from './homework.service.js';
import * as homeworkRepository from './homework.repository.js';
import { prisma } from '../../database/prisma.client.js';
import { SYSTEM_ROLES } from '../../config/constants.js';
import { ForbiddenError, NotFoundError, TenantAccessError } from '../../utils/app-error.js';

vi.mock('./homework.repository.js');
vi.mock('../../database/prisma.client.js', () => ({
  prisma: {
    $transaction: vi.fn(async (cb) => cb(prisma))
  }
}));
vi.mock('../audit/audit.repository.js', () => ({
  createAuditLog: vi.fn().mockResolvedValue({})
}));

describe('BUG-001: Homework Status Authorization & Management (Service Tests)', () => {
  const schoolId = '11111111-1111-1111-1111-111111111111';
  const classId = '22222222-2222-2222-2222-222222222222';
  const otherClassId = '33333333-3333-3333-3333-333333333333';
  const homeworkId = '44444444-4444-4444-4444-444444444444';
  const student1Id = '55555555-5555-5555-5555-555555555555';
  const student2Id = '66666666-6666-6666-6666-666666666666';
  const teacherUserId = '77777777-7777-7777-7777-777777777777';
  const parentUserId = '88888888-8888-8888-8888-888888888888';

  const teacherActor = {
    id: teacherUserId,
    systemRole: SYSTEM_ROLES.TEACHER,
    role: 'TEACHER'
  };

  const adminActor = {
    id: 'admin-user-id',
    systemRole: SYSTEM_ROLES.SCHOOL_ADMIN,
    role: 'SCHOOL_ADMIN'
  };

  const studentActor = {
    id: student1Id,
    studentId: student1Id,
    systemRole: SYSTEM_ROLES.STUDENT,
    role: 'STUDENT'
  };

  const parentActor = {
    id: parentUserId,
    systemRole: SYSTEM_ROLES.PARENT,
    role: 'PARENT'
  };

  const mockAssignment = {
    id: homeworkId,
    schoolId,
    classId,
    title: 'Math Assignment 1',
    description: 'Solve exercises 1 to 10',
    dueDate: '2026-10-20',
    attachments: null
  };

  const mockStudent1 = {
    id: student1Id,
    schoolId,
    classId,
    firstName: 'Rahul',
    lastName: 'Sharma',
    admissionNumber: 'ADM1001'
  };

  const mockStaffProfile = {
    id: 'staff-profile-1',
    userId: teacherUserId,
    schoolId,
    assignedClassId: classId,
    headedClasses: []
  };

  beforeEach(() => {
    vi.clearAllMocks();

    homeworkRepository.findHomeworkById.mockResolvedValue(mockAssignment);
    homeworkRepository.findStudentInTenant.mockImplementation(async (_sid, stId) => {
      if (stId === student1Id) return mockStudent1;
      if (stId === student2Id) return { ...mockStudent1, id: student2Id, firstName: 'Priya' };
      return null;
    });
    homeworkRepository.findStaffProfileByUserId.mockResolvedValue(mockStaffProfile);
    homeworkRepository.findAuthorizedStudentIdsForParent.mockResolvedValue([student1Id]);
    homeworkRepository.findStudentsInClass.mockResolvedValue([mockStudent1]);
    homeworkRepository.upsertSubmission.mockImplementation(async (_sid, hwId, stId, data) => ({
      id: 'submission-uuid',
      homeworkId: hwId,
      studentId: stId,
      status: data.status || 'Not Started',
      grade: data.grade || null,
      feedback: data.feedback || null,
      submittedAt: data.submittedAt || null,
      updatedAt: new Date().toISOString()
    }));
  });

  // ------------------------------------------------------------
  // Scenario 3: Backend Authorization - Teachers Cannot Mutate Status
  // ------------------------------------------------------------
  describe('Teacher Status Mutation Restrictions (API / Backend)', () => {
    it('rejects teacher attempting to update submission status via updateStaffSubmission', async () => {
      await expect(
        homeworkService.updateStaffSubmission(
          schoolId,
          homeworkId,
          student1Id,
          { status: 'Completed' },
          teacherActor
        )
      ).rejects.toThrow(ForbiddenError);

      await expect(
        homeworkService.updateStaffSubmission(
          schoolId,
          homeworkId,
          student1Id,
          { status: 'Completed' },
          teacherActor
        )
      ).rejects.toThrow('Teachers are not authorized to manually change student homework status');

      expect(homeworkRepository.upsertSubmission).not.toHaveBeenCalled();
    });

    it('rejects teacher attempting to update submission status via bulkUpdateStaffSubmissions', async () => {
      await expect(
        homeworkService.bulkUpdateStaffSubmissions(
          schoolId,
          homeworkId,
          [{ studentId: student1Id, status: 'Completed', grade: 'A' }],
          teacherActor
        )
      ).rejects.toThrow(ForbiddenError);

      await expect(
        homeworkService.bulkUpdateStaffSubmissions(
          schoolId,
          homeworkId,
          [{ studentId: student1Id, status: 'Completed', grade: 'A' }],
          teacherActor
        )
      ).rejects.toThrow('Teachers are not authorized to manually change student homework status');

      expect(homeworkRepository.upsertSubmission).not.toHaveBeenCalled();
    });

    it('rejects teacher attempting to update status via updateStudentHomeworkStatus', async () => {
      await expect(
        homeworkService.updateStudentHomeworkStatus(
          schoolId,
          student1Id,
          homeworkId,
          { status: 'Completed' },
          teacherActor
        )
      ).rejects.toThrow(ForbiddenError);

      await expect(
        homeworkService.updateStudentHomeworkStatus(
          schoolId,
          student1Id,
          homeworkId,
          { status: 'Completed' },
          teacherActor
        )
      ).rejects.toThrow('Teachers are not authorized to manually change student homework status');
    });
  });

  // ------------------------------------------------------------
  // Scenarios 4 & 5: Student-driven updates & submissions succeed
  // ------------------------------------------------------------
  describe('Student-Driven Status Updates and Submissions', () => {
    it('allows a student to update their own homework progress to In Progress', async () => {
      const result = await homeworkService.updateStudentHomeworkStatus(
        schoolId,
        student1Id,
        homeworkId,
        { status: 'In Progress' },
        studentActor
      );

      expect(result.status).toBe('In Progress');
      expect(homeworkRepository.upsertSubmission).toHaveBeenCalledWith(
        schoolId,
        homeworkId,
        student1Id,
        expect.objectContaining({ status: 'In Progress' })
      );
    });

    it('allows a student to submit homework (sets status to Submitted with submittedAt timestamp)', async () => {
      const result = await homeworkService.updateStudentHomeworkStatus(
        schoolId,
        student1Id,
        homeworkId,
        { status: 'Submitted' },
        studentActor
      );

      expect(result.status).toBe('Submitted');
      expect(homeworkRepository.upsertSubmission).toHaveBeenCalledWith(
        schoolId,
        homeworkId,
        student1Id,
        expect.objectContaining({
          status: 'Submitted',
          submittedAt: expect.any(Date)
        })
      );
    });

    it('allows a linked parent to update homework status for their child', async () => {
      const result = await homeworkService.updateStudentHomeworkStatus(
        schoolId,
        student1Id,
        homeworkId,
        { status: 'Completed' },
        parentActor
      );

      expect(result.status).toBe('Completed');
    });
  });

  // ------------------------------------------------------------
  // Scenario 6: Fetching latest persisted status and roster
  // ------------------------------------------------------------
  describe('Teacher Portal Roster & Status Fetching', () => {
    it('returns latest persisted submission status and calculates roster counts accurately', async () => {
      homeworkRepository.findHomeworkWithRoster.mockResolvedValue({
        ...mockAssignment,
        class: {
          id: classId,
          name: 'Class 10-A',
          students: [
            mockStudent1,
            { id: student2Id, firstName: 'Priya', lastName: 'Patel', admissionNumber: 'ADM1002' }
          ]
        },
        subject: { id: 'sub-1', name: 'Mathematics', code: 'MATH' },
        submissions: [
          {
            id: 'sub-row-1',
            studentId: student1Id,
            status: 'Submitted',
            grade: 'A',
            feedback: 'Well done',
            submittedAt: '2026-10-15T10:00:00Z',
            updatedAt: '2026-10-15T10:00:00Z'
          }
        ]
      });

      const result = await homeworkService.getHomeworkById(schoolId, homeworkId);

      expect(result.id).toBe(homeworkId);
      expect(result.totalStudents).toBe(2);
      expect(result.submittedCount).toBe(1);
      expect(result.notStartedCount).toBe(1); // Student 2 has no submission row yet
      expect(result.roster[0].status).toBe('Submitted');
      expect(result.roster[0].grade).toBe('A');
      expect(result.roster[1].status).toBe('Not Started');
    });
  });

  // ------------------------------------------------------------
  // Scenario 7: Unauthorized Cross-Student / Cross-Parent Mutation
  // ------------------------------------------------------------
  describe('Cross-Student Ownership Protection', () => {
    it('rejects a student attempting to update another student homework status', async () => {
      await expect(
        homeworkService.updateStudentHomeworkStatus(
          schoolId,
          student2Id, // Target is student 2
          homeworkId,
          { status: 'Completed' },
          studentActor // Logged in as student 1
        )
      ).rejects.toThrow(ForbiddenError);

      await expect(
        homeworkService.updateStudentHomeworkStatus(
          schoolId,
          student2Id,
          homeworkId,
          { status: 'Completed' },
          studentActor
        )
      ).rejects.toThrow('Students can only update their own homework status');
    });

    it('rejects a parent attempting to update an unlinked student homework status', async () => {
      await expect(
        homeworkService.updateStudentHomeworkStatus(
          schoolId,
          student2Id, // Not in parent's authorized student IDs
          homeworkId,
          { status: 'Completed' },
          parentActor
        )
      ).rejects.toThrow(NotFoundError);
    });
  });

  // ------------------------------------------------------------
  // Scenario 8: Legitimate Teacher Grading & Admin Workflows Functional
  // ------------------------------------------------------------
  describe('Authorized Evaluation & Administrative Workflows', () => {
    it('allows teachers to evaluate with grade and feedback without status', async () => {
      const result = await homeworkService.updateStaffSubmission(
        schoolId,
        homeworkId,
        student1Id,
        { grade: 'A+', feedback: 'Exceptional calculations!' },
        teacherActor
      );

      expect(result.grade).toBe('A+');
      expect(result.feedback).toBe('Exceptional calculations!');
      expect(homeworkRepository.upsertSubmission).toHaveBeenCalledWith(
        schoolId,
        homeworkId,
        student1Id,
        {
          grade: 'A+',
          feedback: 'Exceptional calculations!'
        }
      );
    });

    it('allows teachers to bulk evaluate student submissions without status', async () => {
      homeworkRepository.findStudentsInClass.mockResolvedValue([mockStudent1]);

      const result = await homeworkService.bulkUpdateStaffSubmissions(
        schoolId,
        homeworkId,
        [{ studentId: student1Id, grade: 'B', feedback: 'Good effort' }],
        teacherActor
      );

      expect(result.updatedCount).toBe(1);
      expect(homeworkRepository.upsertSubmission).toHaveBeenCalledWith(
        schoolId,
        homeworkId,
        student1Id,
        { grade: 'B', feedback: 'Good effort' },
        prisma
      );
    });

    it('allows administrators to update status and grade through staff submission endpoint', async () => {
      const result = await homeworkService.updateStaffSubmission(
        schoolId,
        homeworkId,
        student1Id,
        { status: 'Completed', grade: 'A' },
        adminActor
      );

      expect(result.status).toBe('Completed');
      expect(result.grade).toBe('A');
    });
  });

  // ------------------------------------------------------------
  // Scenario 9: Tenant and Class Boundary Enforcement
  // ------------------------------------------------------------
  describe('Tenant and Class Isolation', () => {
    it('rejects requests without schoolId tenant context', async () => {
      await expect(
        homeworkService.updateStaffSubmission(null, homeworkId, student1Id, { grade: 'A' }, teacherActor)
      ).rejects.toThrow(TenantAccessError);

      await expect(
        homeworkService.updateStudentHomeworkStatus(null, student1Id, homeworkId, { status: 'In Progress' }, studentActor)
      ).rejects.toThrow(TenantAccessError);
    });

    it('rejects teachers attempting to evaluate homework for a class they are not assigned to', async () => {
      homeworkRepository.findStaffProfileByUserId.mockResolvedValue({
        id: 'staff-profile-other',
        userId: teacherUserId,
        schoolId,
        assignedClassId: otherClassId,
        headedClasses: []
      });

      await expect(
        homeworkService.updateStaffSubmission(
          schoolId,
          homeworkId,
          student1Id,
          { grade: 'A' },
          teacherActor
        )
      ).rejects.toThrow(ForbiddenError);

      await expect(
        homeworkService.updateStaffSubmission(
          schoolId,
          homeworkId,
          student1Id,
          { grade: 'A' },
          teacherActor
        )
      ).rejects.toThrow('Teachers are only authorized to manage homework for their assigned class');
    });

    it('rejects student status update if homework assignment is not for student class', async () => {
      homeworkRepository.findHomeworkById.mockResolvedValue({
        ...mockAssignment,
        classId: otherClassId
      });

      await expect(
        homeworkService.updateStudentHomeworkStatus(
          schoolId,
          student1Id,
          homeworkId,
          { status: 'Completed' },
          studentActor
        )
      ).rejects.toThrow(NotFoundError);
    });
  });
});
