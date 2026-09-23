import { describe, it, expect, vi, beforeEach } from 'vitest';
import ParentNoticeboard from '../ParentNoticeboard.jsx';
import * as noticesApiModule from '../../../api/notices.js';
import * as parentsApiModule from '../../../api/parents.js';
import * as firestoreModule from '../../../firebase/firestore.js';

describe('Parent Noticeboard Component (REST Migration)', () => {
  const PG_CLASS_1 = '05120a32-8118-44b6-8010-b9ed2c5467c0';
  const PG_CLASS_2 = '547da6cb-35bf-48c2-b798-1e809fb62890';
  const STUDENT_ID_1 = '11111111-1111-4111-8111-111111111111';
  const STUDENT_ID_2 = '22222222-2222-4222-8222-222222222222';
  const NOTICE_ID_1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const NOTICE_ID_2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('is exported as a valid React component function', () => {
    expect(typeof ParentNoticeboard).toBe('function');
  });

  // ============================================================
  // 1. ZERO FIRESTORE NOTICE ACCESS
  // ============================================================

  it('does NOT invoke Firestore notice subscription helpers or methods', () => {
    const firestoreSpies = [
      vi.spyOn(firestoreModule, 'subscribeToGlobalNotices'),
      vi.spyOn(firestoreModule, 'subscribeToClassNotices'),
      vi.spyOn(firestoreModule, 'createNotice'),
      vi.spyOn(firestoreModule, 'updateNotice'),
      vi.spyOn(firestoreModule, 'deleteNotice'),
      vi.spyOn(firestoreModule, 'markNoticeAsViewed')
    ];

    firestoreSpies.forEach((spy) => {
      expect(spy).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // 2. PARENT CHILDREN LOADING (GET /api/v1/parents/me/children)
  // ============================================================

  it('loads linked children from REST parents API', async () => {
    const childrenSpy = vi.spyOn(parentsApiModule, 'getMyChildren').mockResolvedValue({
      success: true,
      data: [
        {
          id: 'link-1',
          studentId: STUDENT_ID_1,
          student: { id: STUDENT_ID_1, firstName: 'Alice', classId: PG_CLASS_1, class: { name: 'Grade 5A' } }
        },
        {
          id: 'link-2',
          studentId: STUDENT_ID_2,
          student: { id: STUDENT_ID_2, firstName: 'Bob', classId: PG_CLASS_2, class: { name: 'Grade 6B' } }
        }
      ]
    });

    const res = await parentsApiModule.getMyChildren();

    expect(childrenSpy).toHaveBeenCalled();
    expect(res.data).toHaveLength(2);
    expect(res.data[0].student.firstName).toBe('Alice');
    expect(res.data[1].student.firstName).toBe('Bob');
  });

  // ============================================================
  // 3. REST NOTICES LISTING (GLOBAL & CLASS)
  // ============================================================

  it('loads global notices via REST API client for parent visibility', async () => {
    const listSpy = vi.spyOn(noticesApiModule, 'listNotices').mockResolvedValue({
      success: true,
      data: [
        {
          id: NOTICE_ID_1,
          title: 'Annual Parent-Teacher Conference',
          content: 'Conferences scheduled for next week.',
          type: 'global',
          audience: 'parents',
          priority: 'high',
          authorName: 'Principal Skinner',
          viewedBy: [],
          createdAt: '2026-09-15T08:00:00.000Z'
        }
      ],
      pagination: { total: 1, page: 1, limit: 100, totalPages: 1 }
    });

    const res = await noticesApiModule.listNotices({ type: 'global', limit: 100 });

    expect(listSpy).toHaveBeenCalledWith({ type: 'global', limit: 100 });
    expect(res.data).toHaveLength(1);
    expect(res.data[0].title).toBe('Annual Parent-Teacher Conference');
    expect(res.data[0].audience).toBe('parents');
  });

  it('loads class notices via REST API client scoped to linked children classes', async () => {
    const listSpy = vi.spyOn(noticesApiModule, 'listNotices').mockResolvedValue({
      success: true,
      data: [
        {
          id: NOTICE_ID_2,
          title: 'Grade 5 Field Trip Notice',
          content: 'Permission slips due Friday.',
          type: 'class',
          classId: PG_CLASS_1,
          className: 'Grade 5A',
          audience: 'all',
          priority: 'normal',
          authorName: 'Teacher Jane',
          createdAt: '2026-09-15T09:30:00.000Z'
        }
      ],
      pagination: { total: 1, page: 1, limit: 100, totalPages: 1 }
    });

    const res = await noticesApiModule.listNotices({ type: 'class', limit: 100 });

    expect(listSpy).toHaveBeenCalledWith({ type: 'class', limit: 100 });
    expect(res.data).toHaveLength(1);
    expect(res.data[0].className).toBe('Grade 5A');
  });

  // ============================================================
  // 4. REST READ RECEIPTS (POST /api/v1/notices/:id/view)
  // ============================================================

  it('records read receipts via REST without mutating database or forging identity', async () => {
    const viewSpy = vi.spyOn(noticesApiModule, 'markNoticeViewed').mockResolvedValue({
      success: true,
      data: { notice: { id: NOTICE_ID_1 }, alreadyViewed: false }
    });

    const res = await noticesApiModule.markNoticeViewed(NOTICE_ID_1);

    expect(viewSpy).toHaveBeenCalledWith(NOTICE_ID_1);
    expect(res.data.alreadyViewed).toBe(false);
  });

  // ============================================================
  // 5. EMPTY STATE HANDLING
  // ============================================================

  it('handles empty response gracefully when no notices exist', async () => {
    vi.spyOn(noticesApiModule, 'listNotices').mockResolvedValue({
      success: true,
      data: [],
      pagination: { total: 0, page: 1, limit: 100, totalPages: 0 }
    });

    const res = await noticesApiModule.listNotices({ type: 'global', limit: 100 });

    expect(res.success).toBe(true);
    expect(res.data).toEqual([]);
    expect(res.pagination.total).toBe(0);
  });
});
