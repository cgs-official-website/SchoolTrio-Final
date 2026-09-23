import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as homeworkService from '../../../src/modules/homework/homework.service.js';
import * as homeworkRepository from '../../../src/modules/homework/homework.repository.js';
import {
  NotFoundError,
  ForbiddenError,
  ValidationError
} from '../../../src/utils/app-error.js';
import { SYSTEM_ROLES } from '../../../src/config/constants.js';

vi.mock('../../../src/modules/homework/homework.repository.js');
vi.mock('../../../src/modules/audit/audit.repository.js', () => ({
  createAuditLog: vi.fn().mockResolvedValue({ id: 'audit-log-1' })
}));

describe('Unit: Homework Service Tests — Phase 4C.7-D.2-I-M.1', () => {
  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
  const CLASS_ID = '22222222-2222-4222-8222-222222222222';
  const OTHER_CLASS_ID = '22222222-2222-4222-8222-999999999999';
  const SUBJECT_ID = '33333333-3333-4333-8333-333333333333';
  const STUDENT_ID = '44444444-4444-4444-8444-444444444444';
  const OTHER_STUDENT_ID = '44444444-4444-4444-8444-999999999999';
  const PARENT_USER_ID = '55555555-5555-4555-8555-555555555555';
  const TEACHER_USER_ID = '66666666-6666-4666-8666-666666666666';
  const ADMIN_USER_ID = '77777777-7777-4777-8777-777777777777';
  const HOMEWORK_ID = '88888888-8888-4888-8888-888888888888';

  const PARENT_ACTOR = {
    id: PARENT_USER_ID,
    userId: PARENT_USER_ID,
    systemRole: SYSTEM_ROLES.PARENT,
    role: 'PARENT'
  };

  const TEACHER_ACTOR = {
    id: TEACHER_USER_ID,
    userId: TEACHER_USER_ID,
    systemRole: SYSTEM_ROLES.TEACHER,
    role: 'TEACHER'
  };

  const ADMIN_ACTOR = {
    id: ADMIN_USER_ID,
    userId: ADMIN_USER_ID,
    systemRole: SYSTEM_ROLES.SCHOOL_ADMIN,
    role: 'ADMIN'
  };

  const MOCK_ASSIGNMENT = {
    id: HOMEWORK_ID,
    schoolId: SCHOOL_ID,
    title: 'Algebra Quadratic Equations',
    description: 'Solve exercises 1 to 10',
    classId: CLASS_ID,
    subjectId: SUBJECT_ID,
    dueDate: '2026-09-30',
    attachments: {
      files: [
        {
          name: 'sheet.pdf',
          url: 'https://example.com/sheet.pdf',
          size: 1024,
          type: 'application/pdf'
        }
      ],
      remarks: 'Show all steps',
      maxMarks: 50
    },
    createdAt: new Date('2026-09-14T08:00:00Z'),
    updatedAt: new Date('2026-09-14T08:00:00Z'),
    class: {
      id: CLASS_ID,
      name: 'Grade 10-A'
    },
    subject: {
      id: SUBJECT_ID,
      name: 'Mathematics',
      code: 'MATH10'
    },
    submissions: []
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Normalization & Formatting Helpers', () => {
    it('normalizes attachment array and explicit remarks/maxMarks', () => {
      const files = [{ name: 'f1.pdf', url: 'https://example.com/f1.pdf' }];
      const normalized = homeworkService.normalizeAttachments(files, 'Important remarks', 100);

      expect(normalized).toEqual({
        files,
        remarks: 'Important remarks',
        maxMarks: 100
      });
    });

    it('extracts attachment details from legacy array format', () => {
      const legacyArray = [{ name: 'doc.pdf', url: 'https://example.com/doc.pdf' }];
      const extracted = homeworkService.extractAttachmentDetails(legacyArray);

      expect(extracted).toEqual({
        files: legacyArray,
        remarks: '',
        maxMarks: 0
      });
    });

    it('extracts attachment details from structured object format', () => {
      const structured = {
        files: [{ name: 'doc.pdf', url: 'https://example.com/doc.pdf' }],
        remarks: 'Do not forget units',
        maxMarks: 25
      };
      const extracted = homeworkService.extractAttachmentDetails(structured);

      expect(extracted).toEqual({
        files: structured.files,
        remarks: 'Do not forget units',
        maxMarks: 25
      });
    });

    it('formats parent homework with missing submission as synthetic Not Started', () => {
      const formatted = homeworkService.formatParentHomework(MOCK_ASSIGNMENT, null);

      expect(formatted.submission).toEqual({
        id: null,
        status: 'Not Started',
        submittedAt: null,
        grade: null,
        feedback: null,
        updatedAt: null
      });
      expect(formatted.isOverdue).toBe(false);
    });
  });

  describe('2. createHomework', () => {
    it('successfully creates homework assignment for authorized admin', async () => {
      homeworkRepository.findClassById.mockResolvedValue({ id: CLASS_ID, name: 'Grade 10-A' });
      homeworkRepository.findSubjectById.mockResolvedValue({ id: SUBJECT_ID, name: 'Mathematics' });
      homeworkRepository.createHomework.mockResolvedValue(MOCK_ASSIGNMENT);

      const payload = {
        title: 'Algebra Quadratic Equations',
        description: 'Solve exercises 1 to 10',
        classId: CLASS_ID,
        subjectId: SUBJECT_ID,
        dueDate: '2026-09-30',
        remarks: 'Show all steps',
        maxMarks: 50
      };

      const result = await homeworkService.createHomework(SCHOOL_ID, payload, ADMIN_ACTOR);

      expect(result.id).toBe(HOMEWORK_ID);
      expect(homeworkRepository.createHomework).toHaveBeenCalledWith(
        SCHOOL_ID,
        expect.objectContaining({
          title: payload.title,
          classId: CLASS_ID,
          subjectId: SUBJECT_ID,
          dueDate: payload.dueDate
        })
      );
    });

    it('blocks teacher from creating homework for unassigned class', async () => {
      homeworkRepository.findClassById.mockResolvedValue({ id: CLASS_ID, name: 'Grade 10-A' });
      homeworkRepository.findStaffProfileByUserId.mockResolvedValue({
        id: 'staff-1',
        assignedClassId: OTHER_CLASS_ID,
        headedClasses: []
      });

      const payload = {
        title: 'Algebra',
        classId: CLASS_ID,
        subjectId: SUBJECT_ID,
        dueDate: '2026-09-30'
      };

      await expect(
        homeworkService.createHomework(SCHOOL_ID, payload, TEACHER_ACTOR)
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe('3. updateHomework', () => {
    it('allows updating fields when no submissions exist', async () => {
      homeworkRepository.findHomeworkById.mockResolvedValue(MOCK_ASSIGNMENT);
      homeworkRepository.updateHomework.mockResolvedValue({
        ...MOCK_ASSIGNMENT,
        title: 'Updated Title'
      });

      const result = await homeworkService.updateHomework(
        SCHOOL_ID,
        HOMEWORK_ID,
        { title: 'Updated Title' },
        ADMIN_ACTOR
      );

      expect(result.title).toBe('Updated Title');
      expect(homeworkRepository.updateHomework).toHaveBeenCalled();
    });

    it('blocks changing classId when student submissions already exist', async () => {
      homeworkRepository.findHomeworkById.mockResolvedValue(MOCK_ASSIGNMENT);
      homeworkRepository.countSubmissionsByHomeworkId.mockResolvedValue(5);

      await expect(
        homeworkService.updateHomework(
          SCHOOL_ID,
          HOMEWORK_ID,
          { classId: OTHER_CLASS_ID },
          ADMIN_ACTOR
        )
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('4. getStudentHomework & updateStudentHomeworkStatus (Parent Portal)', () => {
    it('retrieves homework for student with authorized parent', async () => {
      homeworkRepository.findStudentInTenant.mockResolvedValue({
        id: STUDENT_ID,
        schoolId: SCHOOL_ID,
        classId: CLASS_ID
      });
      homeworkRepository.findAuthorizedStudentIdsForParent.mockResolvedValue([STUDENT_ID]);
      homeworkRepository.findStudentHomeworkList.mockResolvedValue({
        homeworks: [MOCK_ASSIGNMENT],
        total: 1
      });

      const result = await homeworkService.getStudentHomework(
        SCHOOL_ID,
        STUDENT_ID,
        {},
        PARENT_ACTOR
      );

      expect(result.homeworks).toHaveLength(1);
      expect(result.homeworks[0].submission.status).toBe('Not Started');
    });

    it('rejects parent requesting homework for unlinked student', async () => {
      homeworkRepository.findStudentInTenant.mockResolvedValue({
        id: OTHER_STUDENT_ID,
        schoolId: SCHOOL_ID,
        classId: CLASS_ID
      });
      homeworkRepository.findAuthorizedStudentIdsForParent.mockResolvedValue([STUDENT_ID]); // Only linked to STUDENT_ID

      await expect(
        homeworkService.getStudentHomework(SCHOOL_ID, OTHER_STUDENT_ID, {}, PARENT_ACTOR)
      ).rejects.toThrow(NotFoundError);
    });

    it('allows parent to transition status to Submitted and sets submittedAt', async () => {
      homeworkRepository.findStudentInTenant.mockResolvedValue({
        id: STUDENT_ID,
        schoolId: SCHOOL_ID,
        classId: CLASS_ID
      });
      homeworkRepository.findAuthorizedStudentIdsForParent.mockResolvedValue([STUDENT_ID]);
      homeworkRepository.findHomeworkById.mockResolvedValue(MOCK_ASSIGNMENT);
      homeworkRepository.upsertSubmission.mockResolvedValue({
        id: 'sub-1',
        homeworkId: HOMEWORK_ID,
        studentId: STUDENT_ID,
        status: 'Submitted',
        submittedAt: new Date('2026-09-15T10:00:00Z'),
        grade: null,
        feedback: null,
        updatedAt: new Date('2026-09-15T10:00:00Z')
      });

      const result = await homeworkService.updateStudentHomeworkStatus(
        SCHOOL_ID,
        STUDENT_ID,
        HOMEWORK_ID,
        { status: 'Submitted' },
        PARENT_ACTOR
      );

      expect(result.status).toBe('Submitted');
      expect(result.submittedAt).toBeDefined();
      expect(homeworkRepository.upsertSubmission).toHaveBeenCalledWith(
        SCHOOL_ID,
        HOMEWORK_ID,
        STUDENT_ID,
        expect.objectContaining({
          status: 'Submitted',
          submittedAt: expect.any(Date)
        })
      );
    });
  });

  describe('5. Staff Evaluation (updateStaffSubmission)', () => {
    it('allows staff to grade and provide feedback on submission', async () => {
      homeworkRepository.findHomeworkById.mockResolvedValue(MOCK_ASSIGNMENT);
      homeworkRepository.findStudentInTenant.mockResolvedValue({
        id: STUDENT_ID,
        schoolId: SCHOOL_ID,
        classId: CLASS_ID
      });
      homeworkRepository.upsertSubmission.mockResolvedValue({
        id: 'sub-1',
        homeworkId: HOMEWORK_ID,
        studentId: STUDENT_ID,
        status: 'Submitted',
        grade: 'A',
        feedback: 'Great presentation',
        submittedAt: new Date('2026-09-15T10:00:00Z'),
        updatedAt: new Date('2026-09-15T11:00:00Z')
      });

      const result = await homeworkService.updateStaffSubmission(
        SCHOOL_ID,
        HOMEWORK_ID,
        STUDENT_ID,
        { grade: 'A', feedback: 'Great presentation' },
        ADMIN_ACTOR
      );

      expect(result.grade).toBe('A');
      expect(result.feedback).toBe('Great presentation');
    });
  });

  describe('6. Unread Homework Count (getUnreadHomeworkCount)', () => {
    it('returns school-wide homework count for Admin role', async () => {
      homeworkRepository.countHomeworkSince.mockResolvedValue(5);

      const result = await homeworkService.getUnreadHomeworkCount(
        SCHOOL_ID,
        '2026-09-01T00:00:00.000Z',
        ADMIN_ACTOR
      );

      expect(homeworkRepository.countHomeworkSince).toHaveBeenCalledWith(
        SCHOOL_ID,
        expect.objectContaining({
          sinceDate: expect.any(Date)
        })
      );
      expect(result.count).toBe(5);
    });

    it('PATH B APPROVED: returns assigned class homework count only for Teacher (excludes other classes)', async () => {
      // Scenario: Teacher assigned to Class A. 1 new homework in Class A, 1 new homework in Class B.
      // Under Path B, count filters specifically by [Class A], yielding count = 1.
      homeworkRepository.findStaffProfileByUserId.mockResolvedValue({
        id: 'staff-1',
        assignedClassId: CLASS_ID
      });
      homeworkRepository.countHomeworkSince.mockImplementation(async (schoolId, options) => {
        expect(options.classIds).toEqual([CLASS_ID]);
        return 1;
      });

      const result = await homeworkService.getUnreadHomeworkCount(
        SCHOOL_ID,
        '2026-09-01T00:00:00.000Z',
        TEACHER_ACTOR
      );

      expect(homeworkRepository.countHomeworkSince).toHaveBeenCalledWith(
        SCHOOL_ID,
        expect.objectContaining({
          classIds: [CLASS_ID],
          sinceDate: expect.any(Date)
        })
      );
      expect(result.count).toBe(1);
    });

    it('returns 0 for Teacher without an assignedClassId', async () => {
      homeworkRepository.findStaffProfileByUserId.mockResolvedValue({
        id: 'staff-unassigned',
        assignedClassId: null
      });

      const result = await homeworkService.getUnreadHomeworkCount(
        SCHOOL_ID,
        '2026-09-01T00:00:00.000Z',
        TEACHER_ACTOR
      );

      expect(result.count).toBe(0);
      expect(homeworkRepository.countHomeworkSince).not.toHaveBeenCalled();
    });

    it('PATH B APPROVED: returns linked children classes homework count only for Parent (excludes other classes)', async () => {
      // Scenario: Parent linked to child in Class A. 1 new homework in Class A, 1 new homework in Class B.
      // Under Path B, count filters specifically by [Class A], yielding count = 1.
      homeworkRepository.findAuthorizedStudentIdsForParent.mockResolvedValue([STUDENT_ID]);
      homeworkRepository.findStudentsClasses.mockResolvedValue([{ id: STUDENT_ID, classId: CLASS_ID }]);
      homeworkRepository.countHomeworkSince.mockImplementation(async (schoolId, options) => {
        expect(options.classIds).toEqual([CLASS_ID]);
        return 1;
      });

      const result = await homeworkService.getUnreadHomeworkCount(
        SCHOOL_ID,
        '2026-09-01T00:00:00.000Z',
        PARENT_ACTOR
      );

      expect(homeworkRepository.countHomeworkSince).toHaveBeenCalledWith(
        SCHOOL_ID,
        expect.objectContaining({
          classIds: [CLASS_ID],
          sinceDate: expect.any(Date)
        })
      );
      expect(result.count).toBe(1);
    });

    it('returns 0 for Parent with no linked children', async () => {
      homeworkRepository.findAuthorizedStudentIdsForParent.mockResolvedValue([]);

      const result = await homeworkService.getUnreadHomeworkCount(
        SCHOOL_ID,
        '2026-09-01T00:00:00.000Z',
        PARENT_ACTOR
      );

      expect(result.count).toBe(0);
      expect(homeworkRepository.countHomeworkSince).not.toHaveBeenCalled();
    });

    it('returns 0 count for unsupported or unassigned roles (e.g. Accountant/Driver)', async () => {
      const result = await homeworkService.getUnreadHomeworkCount(
        SCHOOL_ID,
        '2026-09-01T00:00:00.000Z',
        { id: 'user-other', systemRole: 'ACCOUNTANT', role: 'ACCOUNTANT' }
      );

      expect(result.count).toBe(0);
    });

    it('handles null or missing since parameter by querying without date lower-bound', async () => {
      homeworkRepository.findStaffProfileByUserId.mockResolvedValue({
        id: 'staff-1',
        assignedClassId: CLASS_ID
      });
      homeworkRepository.countHomeworkSince.mockResolvedValue(10);

      const result = await homeworkService.getUnreadHomeworkCount(
        SCHOOL_ID,
        null,
        TEACHER_ACTOR
      );

      expect(homeworkRepository.countHomeworkSince).toHaveBeenCalledWith(
        SCHOOL_ID,
        expect.objectContaining({
          classIds: [CLASS_ID],
          sinceDate: null
        })
      );
      expect(result.count).toBe(10);
    });
  });
});
