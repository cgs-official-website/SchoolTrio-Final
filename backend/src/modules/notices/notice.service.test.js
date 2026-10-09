import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as noticeService from './notice.service.js';
import * as noticeRepository from './notice.repository.js';
import { SYSTEM_ROLES } from '../../config/constants.js';

vi.mock('./notice.repository.js');
vi.mock('../audit/audit.repository.js', () => ({
  createAuditLog: vi.fn().mockResolvedValue({})
}));

describe('Noticeboard Read Receipts - Multi-Student Parent Account (BUG-01)', () => {
  const schoolId = '11111111-1111-1111-1111-111111111111';
  const parentUserId = '22222222-2222-2222-2222-222222222222';
  const balaStudentId = '33333333-3333-3333-3333-333333333333';
  const nishaStudentId = '44444444-4444-4444-4444-444444444444';
  const unrelatedStudentId = '55555555-5555-5555-5555-555555555555';
  const class10Id = '66666666-6666-6666-6666-666666666666';
  const class8Id = '77777777-7777-7777-7777-777777777777';
  const noticeGlobalId = '88888888-8888-8888-8888-888888888888';
  const noticeClass10Id = '99999999-9999-9999-9999-999999999999';

  const mockParentProfileWithBothChildren = {
    id: 'parent-profile-1',
    schoolId,
    userId: parentUserId,
    name: 'Arun A',
    children: [
      {
        id: 'link-1',
        relationship: 'Father',
        student: {
          id: balaStudentId,
          firstName: 'Bala',
          lastName: 'A',
          classId: class10Id,
          status: 'Active'
        }
      },
      {
        id: 'link-2',
        relationship: 'Father',
        student: {
          id: nishaStudentId,
          firstName: 'Nisha',
          lastName: 'A',
          classId: class8Id,
          status: 'Active'
        }
      }
    ]
  };

  const mockSingleChildParentProfile = {
    id: 'parent-profile-single',
    schoolId,
    userId: 'single-parent-uuid',
    name: 'Suresh K',
    children: [
      {
        id: 'link-single',
        relationship: 'Father',
        student: {
          id: balaStudentId,
          firstName: 'Bala',
          lastName: 'A',
          classId: class10Id,
          status: 'Active'
        }
      }
    ]
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1 & 2 & 3: Global notice eligible for both Bala A and Nisha A records receipts for both children', async () => {
    const globalNotice = {
      id: noticeGlobalId,
      schoolId,
      title: 'Annual Sports Day',
      content: 'Sports day announcement',
      type: 'global',
      audience: 'parents',
      viewedBy: []
    };

    noticeRepository.findNoticeById.mockResolvedValue(globalNotice);
    noticeRepository.findParentStudentsAndClasses.mockResolvedValue({
      studentIds: [balaStudentId, nishaStudentId],
      classIds: [class10Id, class8Id]
    });
    noticeRepository.findParentWithLinkedStudents.mockResolvedValue(mockParentProfileWithBothChildren);
    noticeRepository.recordNoticeView.mockImplementation(async (sId, nId, viewers) => {
      return {
        notice: {
          ...globalNotice,
          viewedBy: viewers
        },
        alreadyViewed: false
      };
    });

    noticeRepository.findStaffProfilesByUserIds.mockResolvedValue([]);
    noticeRepository.findParentProfilesByUserIds.mockResolvedValue([
      { userId: parentUserId, name: 'Arun A' }
    ]);
    noticeRepository.findStudentsByUserIds.mockResolvedValue([
      { id: balaStudentId, firstName: 'Bala', lastName: 'A', classId: class10Id },
      { id: nishaStudentId, firstName: 'Nisha', lastName: 'A', classId: class8Id }
    ]);
    noticeRepository.findUsersByIds.mockResolvedValue([]);

    const actor = {
      userId: parentUserId,
      systemRole: SYSTEM_ROLES.PARENT
    };

    const response = await noticeService.recordNoticeView(schoolId, noticeGlobalId, actor);

    expect(noticeRepository.recordNoticeView).toHaveBeenCalledTimes(1);
    const recordedViewers = noticeRepository.recordNoticeView.mock.calls[0][2];
    expect(recordedViewers).toHaveLength(2);

    expect(recordedViewers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          uid: parentUserId,
          studentId: balaStudentId,
          studentName: 'Bala A',
          name: 'Arun A (Bala A)',
          role: 'parent',
          classId: class10Id
        }),
        expect.objectContaining({
          uid: parentUserId,
          studentId: nishaStudentId,
          studentName: 'Nisha A',
          name: 'Arun A (Nisha A)',
          role: 'parent',
          classId: class8Id
        })
      ])
    );

    expect(response.notice.viewedBy).toHaveLength(2);
    expect(response.alreadyViewed).toBe(false);
  });

  it('4 & 5 & 6 & 7: Admin receipt query receives all student receipts and does not deduplicate across distinct students', async () => {
    const noticeWithMultipleReceipts = {
      id: noticeGlobalId,
      schoolId,
      title: 'School Picnic',
      content: 'Details here',
      type: 'global',
      audience: 'all',
      viewedBy: [
        {
          uid: parentUserId,
          studentId: balaStudentId,
          studentName: 'Bala A',
          name: 'Arun A (Bala A)',
          role: 'parent',
          classId: class10Id,
          viewedAt: '2026-10-09T10:00:00.000Z'
        },
        {
          uid: parentUserId,
          studentId: nishaStudentId,
          studentName: 'Nisha A',
          name: 'Arun A (Nisha A)',
          role: 'parent',
          classId: class8Id,
          viewedAt: '2026-10-09T10:00:00.000Z'
        }
      ]
    };

    noticeRepository.findNoticesList.mockResolvedValue({
      notices: [noticeWithMultipleReceipts],
      total: 1
    });
    noticeRepository.findStaffProfilesByUserIds.mockResolvedValue([]);
    noticeRepository.findParentProfilesByUserIds.mockResolvedValue([
      { userId: parentUserId, name: 'Arun A' }
    ]);
    noticeRepository.findStudentsByUserIds.mockResolvedValue([
      { id: balaStudentId, firstName: 'Bala', lastName: 'A', classId: class10Id },
      { id: nishaStudentId, firstName: 'Nisha', lastName: 'A', classId: class8Id }
    ]);
    noticeRepository.findUsersByIds.mockResolvedValue([]);

    const adminActor = {
      userId: 'admin-1',
      systemRole: SYSTEM_ROLES.SCHOOL_ADMIN
    };

    const result = await noticeService.listNotices(schoolId, { limit: 10 }, adminActor);
    const notice = result.notices[0];

    expect(notice.viewedBy).toHaveLength(2);
    expect(notice.viewedBy[0].name).toContain('Bala A');
    expect(notice.viewedBy[1].name).toContain('Nisha A');
  });

  it('8: Repeated reads by parent remain idempotent and do not duplicate receipts', async () => {
    const existingViewers = [
      {
        uid: parentUserId,
        studentId: balaStudentId,
        studentName: 'Bala A',
        name: 'Arun A (Bala A)',
        role: 'parent',
        classId: class10Id,
        viewedAt: '2026-10-09T10:00:00.000Z'
      },
      {
        uid: parentUserId,
        studentId: nishaStudentId,
        studentName: 'Nisha A',
        name: 'Arun A (Nisha A)',
        role: 'parent',
        classId: class8Id,
        viewedAt: '2026-10-09T10:00:00.000Z'
      }
    ];

    const notice = {
      id: noticeGlobalId,
      schoolId,
      title: 'Fee Reminder',
      content: 'Content',
      type: 'global',
      audience: 'parents',
      viewedBy: existingViewers
    };

    noticeRepository.findNoticeById.mockResolvedValue(notice);
    noticeRepository.findParentStudentsAndClasses.mockResolvedValue({
      studentIds: [balaStudentId, nishaStudentId],
      classIds: [class10Id, class8Id]
    });
    noticeRepository.findParentWithLinkedStudents.mockResolvedValue(mockParentProfileWithBothChildren);
    noticeRepository.recordNoticeView.mockResolvedValue({
      notice,
      alreadyViewed: true
    });
    noticeRepository.findStaffProfilesByUserIds.mockResolvedValue([]);
    noticeRepository.findParentProfilesByUserIds.mockResolvedValue([
      { userId: parentUserId, name: 'Arun A' }
    ]);
    noticeRepository.findStudentsByUserIds.mockResolvedValue([
      { id: balaStudentId, firstName: 'Bala', lastName: 'A', classId: class10Id },
      { id: nishaStudentId, firstName: 'Nisha', lastName: 'A', classId: class8Id }
    ]);
    noticeRepository.findUsersByIds.mockResolvedValue([]);

    const actor = {
      userId: parentUserId,
      systemRole: SYSTEM_ROLES.PARENT
    };

    const response = await noticeService.recordNoticeView(schoolId, noticeGlobalId, actor);
    expect(response.alreadyViewed).toBe(true);
    expect(response.notice.viewedBy).toHaveLength(2);
  });

  it('9 & 10: Class-specific notice for Class 10 includes Bala A but excludes Nisha A who is in Class 8', async () => {
    const class10Notice = {
      id: noticeClass10Id,
      schoolId,
      title: 'Grade 10 Math Test',
      content: 'Bring calculators',
      type: 'class',
      classId: class10Id,
      audience: 'all',
      viewedBy: []
    };

    noticeRepository.findNoticeById.mockResolvedValue(class10Notice);
    noticeRepository.findParentStudentsAndClasses.mockResolvedValue({
      studentIds: [balaStudentId, nishaStudentId],
      classIds: [class10Id, class8Id]
    });
    noticeRepository.findParentWithLinkedStudents.mockResolvedValue(mockParentProfileWithBothChildren);
    noticeRepository.recordNoticeView.mockImplementation(async (sId, nId, viewers) => {
      return {
        notice: {
          ...class10Notice,
          viewedBy: viewers
        },
        alreadyViewed: false
      };
    });
    noticeRepository.findStaffProfilesByUserIds.mockResolvedValue([]);
    noticeRepository.findParentProfilesByUserIds.mockResolvedValue([
      { userId: parentUserId, name: 'Arun A' }
    ]);
    noticeRepository.findStudentsByUserIds.mockResolvedValue([
      { id: balaStudentId, firstName: 'Bala', lastName: 'A', classId: class10Id }
    ]);
    noticeRepository.findUsersByIds.mockResolvedValue([]);

    const actor = {
      userId: parentUserId,
      systemRole: SYSTEM_ROLES.PARENT
    };

    const response = await noticeService.recordNoticeView(schoolId, noticeClass10Id, actor);

    const recordedViewers = noticeRepository.recordNoticeView.mock.calls[0][2];
    expect(recordedViewers).toHaveLength(1);
    expect(recordedViewers[0].studentId).toBe(balaStudentId);
    expect(recordedViewers[0].name).toBe('Arun A (Bala A)');
    expect(recordedViewers[0].classId).toBe(class10Id);
  });

  it('11: Unauthorized parent whose children are not in targeted class cannot access or view the notice', async () => {
    const otherClassNotice = {
      id: 'notice-class-12',
      schoolId,
      title: 'Grade 12 Physics Lab',
      content: 'Details',
      type: 'class',
      classId: 'class-12-uuid',
      audience: 'parents',
      viewedBy: []
    };

    noticeRepository.findNoticeById.mockResolvedValue(otherClassNotice);
    noticeRepository.findParentStudentsAndClasses.mockResolvedValue({
      studentIds: [balaStudentId, nishaStudentId],
      classIds: [class10Id, class8Id]
    });

    const actor = {
      userId: parentUserId,
      systemRole: SYSTEM_ROLES.PARENT
    };

    await expect(noticeService.recordNoticeView(schoolId, 'notice-class-12', actor)).rejects.toThrow('Notice');
  });

  it('12: Cross-tenant notice access is rejected', async () => {
    const differentSchoolId = '99999999-0000-0000-0000-000000000000';
    noticeRepository.findNoticeById.mockResolvedValue(null);

    const actor = {
      userId: parentUserId,
      systemRole: SYSTEM_ROLES.PARENT
    };

    await expect(noticeService.recordNoticeView(differentSchoolId, noticeGlobalId, actor)).rejects.toThrow('Notice');
  });

  it('13: Single-student parent behavior remains consistent and unaffected', async () => {
    const globalNotice = {
      id: noticeGlobalId,
      schoolId,
      title: 'Holiday Announcement',
      content: 'School closed tomorrow',
      type: 'global',
      audience: 'all',
      viewedBy: []
    };

    noticeRepository.findNoticeById.mockResolvedValue(globalNotice);
    noticeRepository.findParentStudentsAndClasses.mockResolvedValue({
      studentIds: [balaStudentId],
      classIds: [class10Id]
    });
    noticeRepository.findParentWithLinkedStudents.mockResolvedValue(mockSingleChildParentProfile);
    noticeRepository.recordNoticeView.mockImplementation(async (sId, nId, viewers) => {
      return {
        notice: {
          ...globalNotice,
          viewedBy: viewers
        },
        alreadyViewed: false
      };
    });
    noticeRepository.findStaffProfilesByUserIds.mockResolvedValue([]);
    noticeRepository.findParentProfilesByUserIds.mockResolvedValue([
      { userId: 'single-parent-uuid', name: 'Suresh K' }
    ]);
    noticeRepository.findStudentsByUserIds.mockResolvedValue([
      { id: balaStudentId, firstName: 'Bala', lastName: 'A', classId: class10Id }
    ]);
    noticeRepository.findUsersByIds.mockResolvedValue([]);

    const actor = {
      userId: 'single-parent-uuid',
      systemRole: SYSTEM_ROLES.PARENT
    };

    const response = await noticeService.recordNoticeView(schoolId, noticeGlobalId, actor);
    const recordedViewers = noticeRepository.recordNoticeView.mock.calls[0][2];

    expect(recordedViewers).toHaveLength(1);
    expect(recordedViewers[0].studentId).toBe(balaStudentId);
    expect(recordedViewers[0].name).toBe('Suresh K (Bala A)');
  });

  it('14 & 15: Specific parents audience targeting accurately includes only targeted child', async () => {
    const specificNotice = {
      id: 'specific-notice-uuid',
      schoolId,
      title: 'Remedial Class',
      content: 'Bala needs extra attention',
      type: 'global',
      audience: 'specific_parents',
      attachments: {
        targetStudentIds: [balaStudentId]
      },
      viewedBy: []
    };

    noticeRepository.findNoticeById.mockResolvedValue(specificNotice);
    noticeRepository.findParentStudentsAndClasses.mockResolvedValue({
      studentIds: [balaStudentId, nishaStudentId],
      classIds: [class10Id, class8Id]
    });
    noticeRepository.findParentWithLinkedStudents.mockResolvedValue(mockParentProfileWithBothChildren);
    noticeRepository.recordNoticeView.mockImplementation(async (sId, nId, viewers) => {
      return {
        notice: {
          ...specificNotice,
          viewedBy: viewers
        },
        alreadyViewed: false
      };
    });
    noticeRepository.findStaffProfilesByUserIds.mockResolvedValue([]);
    noticeRepository.findParentProfilesByUserIds.mockResolvedValue([
      { userId: parentUserId, name: 'Arun A' }
    ]);
    noticeRepository.findStudentsByUserIds.mockResolvedValue([
      { id: balaStudentId, firstName: 'Bala', lastName: 'A', classId: class10Id }
    ]);
    noticeRepository.findUsersByIds.mockResolvedValue([]);

    const actor = {
      userId: parentUserId,
      systemRole: SYSTEM_ROLES.PARENT
    };

    const response = await noticeService.recordNoticeView(schoolId, 'specific-notice-uuid', actor);
    const recordedViewers = noticeRepository.recordNoticeView.mock.calls[0][2];

    expect(recordedViewers).toHaveLength(1);
    expect(recordedViewers[0].studentId).toBe(balaStudentId);
    expect(recordedViewers[0].name).toBe('Arun A (Bala A)');
  });

  it('16 (SB-2026-1005-04): Does not duplicate student name in brackets when parent name matches student name', async () => {
    const parentProfileWithMatchingName = {
      id: 'parent-profile-same-name',
      schoolId,
      userId: parentUserId,
      name: 'Bala A',
      children: [
        {
          id: 'link-1',
          relationship: 'Parent',
          student: {
            id: balaStudentId,
            firstName: 'Bala',
            lastName: 'A',
            classId: class10Id,
            status: 'Active'
          }
        },
        {
          id: 'link-2',
          relationship: 'Parent',
          student: {
            id: nishaStudentId,
            firstName: 'Nisha',
            lastName: 'A',
            classId: class8Id,
            status: 'Active'
          }
        }
      ]
    };

    const globalNotice = {
      id: noticeGlobalId,
      schoolId,
      title: 'School Circular',
      content: 'General message',
      type: 'global',
      audience: 'parents',
      viewedBy: []
    };

    noticeRepository.findNoticeById.mockResolvedValue(globalNotice);
    noticeRepository.findParentStudentsAndClasses.mockResolvedValue({
      studentIds: [balaStudentId, nishaStudentId],
      classIds: [class10Id, class8Id]
    });
    noticeRepository.findParentWithLinkedStudents.mockResolvedValue(parentProfileWithMatchingName);
    noticeRepository.recordNoticeView.mockImplementation(async (sId, nId, viewers) => {
      return {
        notice: {
          ...globalNotice,
          viewedBy: viewers
        },
        alreadyViewed: false
      };
    });

    noticeRepository.findStaffProfilesByUserIds.mockResolvedValue([]);
    noticeRepository.findParentProfilesByUserIds.mockResolvedValue([
      { userId: parentUserId, name: 'Bala A' }
    ]);
    noticeRepository.findStudentsByUserIds.mockResolvedValue([
      { id: balaStudentId, firstName: 'Bala', lastName: 'A', classId: class10Id },
      { id: nishaStudentId, firstName: 'Nisha', lastName: 'A', classId: class8Id }
    ]);
    noticeRepository.findUsersByIds.mockResolvedValue([]);

    const actor = {
      userId: parentUserId,
      systemRole: SYSTEM_ROLES.PARENT
    };

    const response = await noticeService.recordNoticeView(schoolId, noticeGlobalId, actor);
    const recordedViewers = noticeRepository.recordNoticeView.mock.calls[0][2];

    expect(recordedViewers).toHaveLength(2);
    // Bala A should NOT be 'Bala A (Bala A)'
    const balaReceipt = recordedViewers.find((v) => v.studentId === balaStudentId);
    expect(balaReceipt.name).toBe('Bala A');
    expect(balaReceipt.studentName).toBe('Bala A');

    // Nisha A should be 'Bala A (Nisha A)' in global admin context
    const nishaReceipt = recordedViewers.find((v) => v.studentId === nishaStudentId);
    expect(nishaReceipt.name).toBe('Bala A (Nisha A)');
    expect(nishaReceipt.studentName).toBe('Nisha A');
  });
});
