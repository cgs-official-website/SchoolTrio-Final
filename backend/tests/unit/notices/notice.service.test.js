import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as noticeService from '../../../src/modules/notices/notice.service.js';
import * as noticeRepository from '../../../src/modules/notices/notice.repository.js';
import {
  NotFoundError,
  ForbiddenError,
  ValidationError
} from '../../../src/utils/app-error.js';
import { SYSTEM_ROLES } from '../../../src/config/constants.js';

vi.mock('../../../src/modules/notices/notice.repository.js');
vi.mock('../../../src/modules/audit/audit.repository.js', () => ({
  createAuditLog: vi.fn().mockResolvedValue({ id: 'audit-log-1' })
}));

describe('Unit: Notice Service Tests — Backend Notice Domain', () => {
  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
  const CLASS_ID = '22222222-2222-4222-8222-222222222222';
  const OTHER_CLASS_ID = '22222222-2222-4222-8222-999999999999';
  const STUDENT_ID = '33333333-3333-4333-8333-333333333333';
  const OTHER_STUDENT_ID = '33333333-3333-4333-8333-999999999999';
  const PARENT_USER_ID = '44444444-4444-4444-8444-444444444444';
  const TEACHER_USER_ID = '55555555-5555-4555-8555-555555555555';
  const OTHER_TEACHER_ID = '55555555-5555-4555-8555-999999999999';
  const ADMIN_USER_ID = '66666666-6666-4666-8666-666666666666';
  const NOTICE_ID = '77777777-7777-4777-8777-777777777777';

  const ADMIN_ACTOR = {
    id: ADMIN_USER_ID,
    userId: ADMIN_USER_ID,
    systemRole: SYSTEM_ROLES.SCHOOL_ADMIN,
    role: 'ADMIN',
    name: 'Principal Skinner'
  };

  const TEACHER_ACTOR = {
    id: TEACHER_USER_ID,
    userId: TEACHER_USER_ID,
    systemRole: SYSTEM_ROLES.TEACHER,
    role: 'TEACHER',
    name: 'Edna Krabappel'
  };

  const PARENT_ACTOR = {
    id: PARENT_USER_ID,
    userId: PARENT_USER_ID,
    systemRole: SYSTEM_ROLES.PARENT,
    role: 'PARENT',
    name: 'Homer Simpson'
  };

  const MOCK_NOTICE = {
    id: NOTICE_ID,
    schoolId: SCHOOL_ID,
    title: 'School Sports Day',
    content: 'Annual sports day is scheduled for next Friday.',
    type: 'global',
    classId: null,
    audience: 'all',
    viewedBy: [],
    attachments: {
      priority: 'high',
      authorId: ADMIN_USER_ID,
      authorName: 'Principal Skinner',
      targetStudentIds: [],
      files: []
    },
    createdAt: new Date('2026-09-15T10:00:00.000Z'),
    updatedAt: new Date('2026-09-15T10:00:00.000Z')
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. listNotices Visibility Rules', () => {
    it('returns full list without role constraints for Admin', async () => {
      noticeRepository.findNoticesList.mockResolvedValue({
        notices: [MOCK_NOTICE],
        total: 1
      });

      const result = await noticeService.listNotices(SCHOOL_ID, { page: 1, limit: 20 }, ADMIN_ACTOR);

      expect(noticeRepository.findNoticesList).toHaveBeenCalledWith(SCHOOL_ID, { page: 1, limit: 20 });
      expect(result.notices.length).toBe(1);
      expect(result.notices[0].title).toBe('School Sports Day');
      expect(result.notices[0].priority).toBe('high');
      expect(result.notices[0].authorName).toBe('Principal Skinner');
    });

    it('scopes Teacher notices to global (all, teachers) and assigned class', async () => {
      noticeRepository.findStaffProfileByUserId.mockResolvedValue({
        id: 'staff-1',
        assignedClassId: CLASS_ID,
        headedClasses: []
      });

      noticeRepository.findNoticesList.mockResolvedValue({
        notices: [MOCK_NOTICE],
        total: 1
      });

      const result = await noticeService.listNotices(SCHOOL_ID, {}, TEACHER_ACTOR);

      expect(noticeRepository.findStaffProfileByUserId).toHaveBeenCalledWith(SCHOOL_ID, TEACHER_USER_ID);
      expect(noticeRepository.findNoticesList).toHaveBeenCalledWith(
        SCHOOL_ID,
        expect.objectContaining({
          customWhere: {
            OR: [
              { type: 'global', audience: { in: ['all', 'teachers'] } },
              { type: 'class', classId: { in: [CLASS_ID] } }
            ]
          }
        })
      );
      expect(result.notices.length).toBe(1);
    });

    it('scopes Parent notices to child class and filters specific_parents by student ID', async () => {
      noticeRepository.findParentStudentsAndClasses.mockResolvedValue({
        studentIds: [STUDENT_ID],
        classIds: [CLASS_ID]
      });

      const noticeForAll = { ...MOCK_NOTICE, id: 'n-1', audience: 'all' };
      const noticeForSpecificParent = {
        ...MOCK_NOTICE,
        id: 'n-2',
        audience: 'specific_parents',
        attachments: { targetStudentIds: [STUDENT_ID] }
      };
      const noticeForOtherParent = {
        ...MOCK_NOTICE,
        id: 'n-3',
        audience: 'specific_parents',
        attachments: { targetStudentIds: [OTHER_STUDENT_ID] }
      };

      noticeRepository.findNoticesList.mockResolvedValue({
        notices: [noticeForAll, noticeForSpecificParent, noticeForOtherParent],
        total: 3
      });

      const result = await noticeService.listNotices(SCHOOL_ID, {}, PARENT_ACTOR);

      expect(result.notices.length).toBe(2);
      expect(result.notices.map((n) => n.id)).toEqual(['n-1', 'n-2']);
    });
  });

  describe('2. createNotice', () => {
    it('creates a global notice deriving author identity securely from token and staff profile', async () => {
      noticeRepository.findStaffProfileByUserId.mockResolvedValue({
        id: 'staff-1',
        firstName: 'Seymour',
        lastName: 'Skinner'
      });

      noticeRepository.createNotice.mockResolvedValue({
        ...MOCK_NOTICE,
        id: 'new-notice-1'
      });

      const payload = {
        title: 'Board Meeting',
        content: 'All trustees are requested to attend.',
        type: 'global',
        audience: 'teachers',
        priority: 'normal'
      };

      const result = await noticeService.createNotice(SCHOOL_ID, payload, ADMIN_ACTOR);

      expect(noticeRepository.createNotice).toHaveBeenCalledWith(
        SCHOOL_ID,
        expect.objectContaining({
          title: 'Board Meeting',
          content: 'All trustees are requested to attend.',
          type: 'global',
          audience: 'teachers',
          attachments: expect.objectContaining({
            authorId: ADMIN_USER_ID,
            authorName: 'Seymour Skinner',
            priority: 'normal'
          })
        })
      );
      expect(result.id).toBe('new-notice-1');
    });

    it('validates teacher assignment when teacher creates a class notice', async () => {
      noticeRepository.findClassInTenant.mockResolvedValue({
        id: CLASS_ID,
        schoolId: SCHOOL_ID,
        name: 'Grade 5A'
      });

      noticeRepository.findStaffProfileByUserId.mockResolvedValue({
        id: 'staff-teacher-1',
        assignedClassId: CLASS_ID,
        firstName: 'Edna',
        lastName: 'Krabappel'
      });

      noticeRepository.createNotice.mockResolvedValue({
        ...MOCK_NOTICE,
        id: 'class-notice-1',
        type: 'class',
        classId: CLASS_ID
      });

      const payload = {
        title: 'Science Project Due',
        content: 'Please submit solar system models.',
        type: 'class',
        classId: CLASS_ID,
        audience: 'all'
      };

      const result = await noticeService.createNotice(SCHOOL_ID, payload, TEACHER_ACTOR);

      expect(noticeRepository.findClassInTenant).toHaveBeenCalledWith(SCHOOL_ID, CLASS_ID);
      expect(result.id).toBe('class-notice-1');
    });

    it('rejects class notice creation if teacher is not assigned to the class', async () => {
      noticeRepository.findClassInTenant.mockResolvedValue({
        id: OTHER_CLASS_ID,
        schoolId: SCHOOL_ID,
        name: 'Grade 6B',
        classTeacherId: 'other-teacher-profile'
      });

      noticeRepository.findStaffProfileByUserId.mockResolvedValue({
        id: 'staff-teacher-1',
        assignedClassId: CLASS_ID, // Assigned to 5A, trying to post to 6B
        headedClasses: []
      });

      const payload = {
        title: 'Unauthorized Post',
        content: 'Some message',
        type: 'class',
        classId: OTHER_CLASS_ID
      };

      await expect(noticeService.createNotice(SCHOOL_ID, payload, TEACHER_ACTOR)).rejects.toThrow(ForbiddenError);
    });

    it('rejects specific_parents notice if target student IDs belong to another tenant or are invalid', async () => {
      noticeRepository.findStaffProfileByUserId.mockResolvedValue(null);
      noticeRepository.findStudentsInTenant.mockResolvedValue([
        { id: STUDENT_ID, schoolId: SCHOOL_ID }
      ]); // Only 1 found out of 2 requested

      const payload = {
        title: 'Parent-Teacher Meeting',
        content: 'Please meet me after school.',
        type: 'global',
        audience: 'specific_parents',
        targetStudentIds: [STUDENT_ID, OTHER_STUDENT_ID]
      };

      await expect(noticeService.createNotice(SCHOOL_ID, payload, ADMIN_ACTOR)).rejects.toThrow(ValidationError);
    });

    it('rejects ordinary teacher attempting to create global notice without permission', async () => {
      noticeRepository.findStaffProfileByUserId.mockResolvedValue({
        id: 'staff-teacher-1',
        firstName: 'Edna',
        lastName: 'Krabappel'
      });

      const payload = {
        title: 'Global Announcement Attempt',
        content: 'School-wide notice',
        type: 'global',
        audience: 'all'
      };

      await expect(noticeService.createNotice(SCHOOL_ID, payload, TEACHER_ACTOR)).rejects.toThrow(ForbiddenError);
    });

    it('ignores client-supplied forged authorId and authorName', async () => {
      noticeRepository.findStaffProfileByUserId.mockResolvedValue({
        id: 'staff-1',
        firstName: 'Seymour',
        lastName: 'Skinner'
      });

      noticeRepository.createNotice.mockResolvedValue({
        ...MOCK_NOTICE,
        id: 'new-notice-1'
      });

      const forgedPayload = {
        title: 'Board Meeting',
        content: 'All trustees are requested to attend.',
        type: 'global',
        audience: 'teachers',
        authorId: 'forged-author-uuid',
        authorName: 'Fake Impersonated Author'
      };

      await noticeService.createNotice(SCHOOL_ID, forgedPayload, ADMIN_ACTOR);

      expect(noticeRepository.createNotice).toHaveBeenCalledWith(
        SCHOOL_ID,
        expect.objectContaining({
          attachments: expect.objectContaining({
            authorId: ADMIN_USER_ID,
            authorName: 'Seymour Skinner'
          })
        })
      );
    });
  });

  describe('3. getNoticeById Role Visibility', () => {
    it('allows Admin to fetch any notice by ID in tenant', async () => {
      noticeRepository.findNoticeById.mockResolvedValue(MOCK_NOTICE);

      const result = await noticeService.getNoticeById(SCHOOL_ID, NOTICE_ID, ADMIN_ACTOR);
      expect(result.id).toBe(NOTICE_ID);
    });

    it('denies Teacher fetching private class notice of another class', async () => {
      noticeRepository.findNoticeById.mockResolvedValue({
        ...MOCK_NOTICE,
        type: 'class',
        classId: OTHER_CLASS_ID,
        attachments: { authorId: OTHER_TEACHER_ID }
      });
      noticeRepository.findStaffProfileByUserId.mockResolvedValue({
        id: 'staff-teacher-1',
        assignedClassId: CLASS_ID,
        headedClasses: []
      });

      await expect(
        noticeService.getNoticeById(SCHOOL_ID, NOTICE_ID, TEACHER_ACTOR)
      ).rejects.toThrow(NotFoundError);
    });

    it('denies Parent fetching specific_parents notice for another child', async () => {
      noticeRepository.findNoticeById.mockResolvedValue({
        ...MOCK_NOTICE,
        audience: 'specific_parents',
        attachments: { targetStudentIds: [OTHER_STUDENT_ID] }
      });
      noticeRepository.findParentStudentsAndClasses.mockResolvedValue({
        studentIds: [STUDENT_ID],
        classIds: [CLASS_ID]
      });

      await expect(
        noticeService.getNoticeById(SCHOOL_ID, NOTICE_ID, PARENT_ACTOR)
      ).rejects.toThrow(NotFoundError);
    });

    it('denies Student fetching class notice for another class', async () => {
      noticeRepository.findNoticeById.mockResolvedValue({
        ...MOCK_NOTICE,
        type: 'class',
        classId: OTHER_CLASS_ID,
        audience: 'students'
      });
      noticeRepository.findStudentByUserId.mockResolvedValue({
        id: 'student-1',
        classId: CLASS_ID
      });

      const studentActor = {
        id: 'student-user-1',
        userId: 'student-user-1',
        systemRole: SYSTEM_ROLES.STUDENT,
        role: 'STUDENT'
      };

      await expect(
        noticeService.getNoticeById(SCHOOL_ID, NOTICE_ID, studentActor)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('4. updateNotice & deleteNotice', () => {
    it('allows Admin to update any notice', async () => {
      noticeRepository.findNoticeById.mockResolvedValue(MOCK_NOTICE);
      noticeRepository.updateNotice.mockResolvedValue({
        ...MOCK_NOTICE,
        title: 'Updated Sports Day'
      });

      const result = await noticeService.updateNotice(
        SCHOOL_ID,
        NOTICE_ID,
        { title: 'Updated Sports Day' },
        ADMIN_ACTOR
      );

      expect(noticeRepository.updateNotice).toHaveBeenCalledWith(
        SCHOOL_ID,
        NOTICE_ID,
        expect.objectContaining({ title: 'Updated Sports Day' })
      );
      expect(result.title).toBe('Updated Sports Day');
    });

    it('rejects update if a non-admin teacher attempts to modify another author notice', async () => {
      noticeRepository.findNoticeById.mockResolvedValue({
        ...MOCK_NOTICE,
        attachments: {
          authorId: OTHER_TEACHER_ID
        }
      });

      await expect(
        noticeService.updateNotice(SCHOOL_ID, NOTICE_ID, { title: 'Hacked Title' }, TEACHER_ACTOR)
      ).rejects.toThrow(ForbiddenError);
    });

    it('rejects deletion if non-admin teacher attempts to delete another author notice', async () => {
      noticeRepository.findNoticeById.mockResolvedValue({
        ...MOCK_NOTICE,
        attachments: {
          authorId: OTHER_TEACHER_ID
        }
      });

      await expect(
        noticeService.deleteNotice(SCHOOL_ID, NOTICE_ID, TEACHER_ACTOR)
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe('5. recordNoticeView', () => {
    it('records read receipt and flags alreadyViewed status', async () => {
      noticeRepository.findStaffProfileByUserId.mockResolvedValue({ assignedClassId: CLASS_ID });
      noticeRepository.recordNoticeView.mockResolvedValue({
        notice: {
          ...MOCK_NOTICE,
          viewedBy: [
            {
              uid: TEACHER_USER_ID,
              name: 'Edna Krabappel',
              role: 'teacher',
              classId: CLASS_ID,
              viewedAt: '2026-09-15T12:00:00.000Z'
            }
          ]
        },
        alreadyViewed: false
      });

      const result = await noticeService.recordNoticeView(SCHOOL_ID, NOTICE_ID, TEACHER_ACTOR);

      expect(noticeRepository.recordNoticeView).toHaveBeenCalledWith(
        SCHOOL_ID,
        NOTICE_ID,
        expect.objectContaining({
          uid: TEACHER_USER_ID,
          role: 'teacher',
          classId: CLASS_ID
        })
      );
      expect(result.alreadyViewed).toBe(false);
      expect(result.notice.viewedBy.length).toBe(1);
    });
  });
});
