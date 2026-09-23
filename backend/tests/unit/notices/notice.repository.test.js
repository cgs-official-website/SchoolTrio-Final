import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as noticeRepository from '../../../src/modules/notices/notice.repository.js';
import { prisma } from '../../../src/database/prisma.client.js';

vi.mock('../../../src/database/prisma.client.js', () => ({
  prisma: {
    notice: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn()
    },
    class: {
      findFirst: vi.fn()
    },
    student: {
      findMany: vi.fn(),
      findFirst: vi.fn()
    },
    parentProfile: {
      findFirst: vi.fn()
    },
    parentStudentLink: {
      findMany: vi.fn()
    },
    staffProfile: {
      findFirst: vi.fn()
    },
    user: {
      findFirst: vi.fn()
    }
  }
}));

describe('Unit: Notice Repository Tests — Backend Notice Domain', () => {
  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
  const NOTICE_ID = '22222222-2222-4222-8222-222222222222';
  const CLASS_ID = '33333333-3333-4333-8333-333333333333';
  const USER_ID = '44444444-4444-4444-8444-444444444444';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. findNoticeById queries with strict tenant isolation', async () => {
    prisma.notice.findFirst.mockResolvedValue({ id: NOTICE_ID, schoolId: SCHOOL_ID });

    const result = await noticeRepository.findNoticeById(SCHOOL_ID, NOTICE_ID);

    expect(prisma.notice.findFirst).toHaveBeenCalledWith({
      where: { id: NOTICE_ID, schoolId: SCHOOL_ID },
      include: expect.objectContaining({ class: expect.any(Object) })
    });
    expect(result.id).toBe(NOTICE_ID);
  });

  it('2. findNoticesList handles pagination, sorting and filters', async () => {
    prisma.notice.count.mockResolvedValue(1);
    prisma.notice.findMany.mockResolvedValue([{ id: NOTICE_ID, schoolId: SCHOOL_ID }]);

    const options = {
      page: 2,
      limit: 10,
      type: 'global',
      audience: 'teachers',
      sort: 'updatedAt',
      order: 'asc'
    };

    const result = await noticeRepository.findNoticesList(SCHOOL_ID, options);

    expect(prisma.notice.count).toHaveBeenCalledWith({
      where: { schoolId: SCHOOL_ID, type: 'global', audience: 'teachers' }
    });
    expect(prisma.notice.findMany).toHaveBeenCalledWith({
      where: { schoolId: SCHOOL_ID, type: 'global', audience: 'teachers' },
      skip: 10,
      take: 10,
      orderBy: { updatedAt: 'asc' },
      include: expect.any(Object)
    });
    expect(result.total).toBe(1);
    expect(result.notices.length).toBe(1);
  });

  it('3. createNotice inserts tenant-scoped record', async () => {
    const payload = {
      title: 'New Event',
      content: 'Event details',
      type: 'global',
      audience: 'all'
    };

    prisma.notice.create.mockResolvedValue({ id: NOTICE_ID, ...payload, schoolId: SCHOOL_ID });

    const result = await noticeRepository.createNotice(SCHOOL_ID, payload);

    expect(prisma.notice.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        schoolId: SCHOOL_ID,
        title: 'New Event',
        content: 'Event details'
      }),
      include: expect.any(Object)
    });
    expect(result.id).toBe(NOTICE_ID);
  });

  it('4. updateNotice scopes by compound key schoolId_id', async () => {
    const updateData = { title: 'Updated Title' };
    prisma.notice.update.mockResolvedValue({ id: NOTICE_ID, schoolId: SCHOOL_ID, title: 'Updated Title' });

    const result = await noticeRepository.updateNotice(SCHOOL_ID, NOTICE_ID, updateData);

    expect(prisma.notice.update).toHaveBeenCalledWith({
      where: { schoolId_id: { schoolId: SCHOOL_ID, id: NOTICE_ID } },
      data: expect.objectContaining({ title: 'Updated Title' }),
      include: expect.any(Object)
    });
    expect(result.title).toBe('Updated Title');
  });

  it('5. deleteNotice scopes by compound key schoolId_id', async () => {
    prisma.notice.delete.mockResolvedValue({ id: NOTICE_ID, schoolId: SCHOOL_ID });

    await noticeRepository.deleteNotice(SCHOOL_ID, NOTICE_ID);

    expect(prisma.notice.delete).toHaveBeenCalledWith({
      where: { schoolId_id: { schoolId: SCHOOL_ID, id: NOTICE_ID } }
    });
  });

  it('6. recordNoticeView appends viewer receipt idempotently', async () => {
    const existingNotice = {
      id: NOTICE_ID,
      schoolId: SCHOOL_ID,
      viewedBy: [{ uid: 'other-user', name: 'Other User' }]
    };

    prisma.notice.findFirst.mockResolvedValue(existingNotice);
    prisma.notice.update.mockResolvedValue({
      ...existingNotice,
      viewedBy: [
        { uid: 'other-user', name: 'Other User' },
        { uid: USER_ID, name: 'Current User' }
      ]
    });

    const result = await noticeRepository.recordNoticeView(SCHOOL_ID, NOTICE_ID, {
      uid: USER_ID,
      name: 'Current User',
      role: 'parent'
    });

    expect(result.alreadyViewed).toBe(false);
    expect(prisma.notice.update).toHaveBeenCalled();
  });

  it('7. recordNoticeView avoids duplicate write if user already viewed', async () => {
    const existingNotice = {
      id: NOTICE_ID,
      schoolId: SCHOOL_ID,
      viewedBy: [{ uid: USER_ID, name: 'Current User' }]
    };

    prisma.notice.findFirst.mockResolvedValue(existingNotice);

    const result = await noticeRepository.recordNoticeView(SCHOOL_ID, NOTICE_ID, {
      uid: USER_ID,
      name: 'Current User',
      role: 'parent'
    });

    expect(result.alreadyViewed).toBe(true);
    expect(prisma.notice.update).not.toHaveBeenCalled();
  });
});
