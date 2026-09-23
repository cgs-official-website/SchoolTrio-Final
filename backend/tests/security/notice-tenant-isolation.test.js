import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as noticeService from '../../src/modules/notices/notice.service.js';
import * as noticeRepository from '../../src/modules/notices/notice.repository.js';
import { NotFoundError, ValidationError } from '../../src/utils/app-error.js';
import { SYSTEM_ROLES } from '../../src/config/constants.js';

vi.mock('../../src/modules/notices/notice.repository.js');
vi.mock('../../src/modules/audit/audit.repository.js', () => ({
  createAuditLog: vi.fn().mockResolvedValue({ id: 'audit-log-1' })
}));

describe('Security: Notice Tenant Isolation Tests — Backend Notice Domain', () => {
  const TENANT_A_SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
  const TENANT_B_SCHOOL_ID = '22222222-2222-4222-8222-222222222222';

  const NOTICE_ID = '33333333-3333-4333-8333-333333333333';
  const CLASS_TENANT_B_ID = '44444444-4444-4444-8444-444444444444';
  const STUDENT_TENANT_B_ID = '55555555-5555-4555-8555-555555555555';

  const ACTOR_TENANT_A = {
    id: 'user-a-1',
    userId: 'user-a-1',
    schoolId: TENANT_A_SCHOOL_ID,
    systemRole: SYSTEM_ROLES.SCHOOL_ADMIN,
    role: 'ADMIN'
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. Rejects cross-tenant notice reading by returning 404', async () => {
    // Notice exists in Tenant B, but queried under Tenant A context
    noticeRepository.findNoticeById.mockImplementation((schoolId, noticeId) => {
      if (schoolId === TENANT_A_SCHOOL_ID && noticeId === NOTICE_ID) {
        return Promise.resolve(null); // Tenant scoping returns null
      }
      return Promise.resolve({ id: NOTICE_ID, schoolId: TENANT_B_SCHOOL_ID });
    });

    await expect(
      noticeService.getNoticeById(TENANT_A_SCHOOL_ID, NOTICE_ID, ACTOR_TENANT_A)
    ).rejects.toThrow(NotFoundError);
  });

  it('2. Rejects class notice creation when classId belongs to a different tenant', async () => {
    // Class lookup in Tenant A returns null because class belongs to Tenant B
    noticeRepository.findClassInTenant.mockResolvedValue(null);

    const payload = {
      title: 'Math Test',
      content: 'Chapter 4',
      type: 'class',
      classId: CLASS_TENANT_B_ID
    };

    await expect(
      noticeService.createNotice(TENANT_A_SCHOOL_ID, payload, ACTOR_TENANT_A)
    ).rejects.toThrow(NotFoundError);
  });

  it('3. Rejects specific_parents notice creation when target student IDs belong to another tenant', async () => {
    noticeRepository.findStaffProfileByUserId.mockResolvedValue(null);
    // Student lookup in Tenant A returns empty array because students are in Tenant B
    noticeRepository.findStudentsInTenant.mockResolvedValue([]);

    const payload = {
      title: 'Fee Reminder',
      content: 'Please pay dues',
      type: 'global',
      audience: 'specific_parents',
      targetStudentIds: [STUDENT_TENANT_B_ID]
    };

    await expect(
      noticeService.createNotice(TENANT_A_SCHOOL_ID, payload, ACTOR_TENANT_A)
    ).rejects.toThrow(ValidationError);
  });

  it('4. Rejects cross-tenant notice update by returning 404', async () => {
    noticeRepository.findNoticeById.mockResolvedValue(null);

    await expect(
      noticeService.updateNotice(TENANT_A_SCHOOL_ID, NOTICE_ID, { title: 'Updated' }, ACTOR_TENANT_A)
    ).rejects.toThrow(NotFoundError);
  });

  it('5. Rejects cross-tenant notice deletion by returning 404', async () => {
    noticeRepository.findNoticeById.mockResolvedValue(null);

    await expect(
      noticeService.deleteNotice(TENANT_A_SCHOOL_ID, NOTICE_ID, ACTOR_TENANT_A)
    ).rejects.toThrow(NotFoundError);
  });

  it('6. Rejects cross-tenant notice view receipt recording by returning 404', async () => {
    noticeRepository.recordNoticeView.mockResolvedValue(null);

    await expect(
      noticeService.recordNoticeView(TENANT_A_SCHOOL_ID, NOTICE_ID, ACTOR_TENANT_A)
    ).rejects.toThrow(NotFoundError);
  });
});
