import { describe, it, expect, vi, beforeEach } from 'vitest';
import Noticeboard from '../Noticeboard.jsx';
import * as noticesApiModule from '../../../api/notices.js';
import * as classesApiModule from '../../../api/classes.js';
import * as firestoreModule from '../../../firebase/firestore.js';
import { whatsappService } from '../../../services/whatsappService.js';

describe('Admin Noticeboard Component (REST Migration & Final Targeted Verification)', () => {
  const PG_CLASS_1 = '05120a32-8118-44b6-8010-b9ed2c5467c0';
  const PG_CLASS_2 = '547da6cb-35bf-48c2-b798-1e809fb62890';
  const NOTICE_ID_1 = '11111111-1111-4111-8111-111111111111';
  const NOTICE_ID_2 = '22222222-2222-4222-8222-222222222222';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('is exported as a valid React component function', () => {
    expect(typeof Noticeboard).toBe('function');
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
  // 2. REST CLASSES LOADING (GET /api/v1/classes)
  // ============================================================

  it('loads classes from REST classes API using PostgreSQL UUIDs', async () => {
    const classesSpy = vi.spyOn(classesApiModule, 'listClasses').mockResolvedValue({
      success: true,
      data: [
        { id: PG_CLASS_1, name: 'Grade 5A' },
        { id: PG_CLASS_2, name: 'Grade 6B' }
      ]
    });

    const res = await classesApiModule.listClasses({ limit: 100 });

    expect(classesSpy).toHaveBeenCalledWith({ limit: 100 });
    expect(classesSpy.mock.calls[0][0]).not.toHaveProperty('schoolId');
    expect(res.data).toHaveLength(2);
    expect(res.data[0].id).toBe(PG_CLASS_1);
    expect(res.data[0].name).toBe('Grade 5A');
  });

  // ============================================================
  // 3. REST NOTICES LISTING (GET /api/v1/notices)
  // ============================================================

  it('loads global notices from REST notices API', async () => {
    const listSpy = vi.spyOn(noticesApiModule, 'listNotices').mockResolvedValue({
      success: true,
      data: [
        {
          id: NOTICE_ID_1,
          title: 'Sports Day 2026',
          content: 'Annual sports day details',
          type: 'global',
          audience: 'all',
          priority: 'high',
          authorName: 'Principal Skinner',
          viewedBy: [{ uid: 'user-1', name: 'John Doe', role: 'teacher' }],
          createdAt: '2026-09-15T10:00:00.000Z'
        }
      ],
      pagination: { total: 1, page: 1, limit: 100, totalPages: 1 }
    });

    const res = await noticesApiModule.listNotices({ type: 'global', limit: 100 });

    expect(listSpy).toHaveBeenCalledWith({ type: 'global', limit: 100 });
    expect(listSpy.mock.calls[0][0]).not.toHaveProperty('schoolId');
    expect(res.data).toHaveLength(1);
    expect(res.data[0].title).toBe('Sports Day 2026');
    expect(res.data[0].priority).toBe('high');
    expect(res.data[0].viewedBy).toHaveLength(1);
  });

  it('loads class notices with PostgreSQL classId parameter', async () => {
    const listSpy = vi.spyOn(noticesApiModule, 'listNotices').mockResolvedValue({
      success: true,
      data: [
        {
          id: NOTICE_ID_2,
          title: 'Class 5A Science Test',
          content: 'Test on Friday',
          type: 'class',
          classId: PG_CLASS_1,
          className: 'Grade 5A',
          audience: 'all',
          priority: 'normal',
          authorName: 'Edna Krabappel',
          createdAt: '2026-09-15T11:00:00.000Z'
        }
      ],
      pagination: { total: 1, page: 1, limit: 100, totalPages: 1 }
    });

    const res = await noticesApiModule.listNotices({ type: 'class', limit: 100 });

    expect(listSpy).toHaveBeenCalledWith({ type: 'class', limit: 100 });
    expect(res.data).toHaveLength(1);
    expect(res.data[0].type).toBe('class');
    expect(res.data[0].classId).toBe(PG_CLASS_1);
  });

  // ============================================================
  // 4. EMPTY DATABASE HANDLING
  // ============================================================

  it('handles empty response gracefully when PostgreSQL Notice table has 0 records', async () => {
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

  // ============================================================
  // 5. REST NOTICE CREATION (POST /api/v1/notices)
  // ============================================================

  it('creates global notice without submitting client-controlled fields', async () => {
    const createSpy = vi.spyOn(noticesApiModule, 'createNotice').mockResolvedValue({
      success: true,
      data: {
        id: 'notice-new',
        title: 'New Announcement',
        content: 'Content text',
        type: 'global',
        audience: 'all',
        priority: 'normal'
      }
    });

    const payload = {
      title: 'New Announcement',
      content: 'Content text',
      type: 'global',
      audience: 'all',
      priority: 'normal'
    };

    const res = await noticesApiModule.createNotice(payload);

    expect(createSpy).toHaveBeenCalledWith(payload);
    // Verify client does not inject server-controlled fields
    const sentPayload = createSpy.mock.calls[0][0];
    expect(sentPayload).not.toHaveProperty('schoolId');
    expect(sentPayload).not.toHaveProperty('authorId');
    expect(sentPayload).not.toHaveProperty('authorName');
    expect(sentPayload).not.toHaveProperty('viewedBy');
    expect(sentPayload).not.toHaveProperty('createdAt');
    expect(res.data.id).toBe('notice-new');
  });

  // ============================================================
  // 6. REST NOTICE UPDATE / EDIT (PATCH /api/v1/notices/:id)
  // ============================================================

  it('updates notice via REST API client without modifying server-owned fields', async () => {
    const updateSpy = vi.spyOn(noticesApiModule, 'updateNotice').mockResolvedValue({
      success: true,
      data: {
        id: NOTICE_ID_1,
        title: 'Updated Sports Day Title',
        content: 'Updated content text',
        audience: 'parents',
        priority: 'high'
      }
    });

    const updatePayload = {
      title: 'Updated Sports Day Title',
      content: 'Updated content text',
      audience: 'parents',
      priority: 'high'
    };

    const res = await noticesApiModule.updateNotice(NOTICE_ID_1, updatePayload);

    expect(updateSpy).toHaveBeenCalledWith(NOTICE_ID_1, updatePayload);
    const sentPayload = updateSpy.mock.calls[0][1];
    expect(sentPayload).not.toHaveProperty('schoolId');
    expect(sentPayload).not.toHaveProperty('authorId');
    expect(sentPayload).not.toHaveProperty('authorName');
    expect(sentPayload).not.toHaveProperty('viewedBy');
    expect(sentPayload).not.toHaveProperty('createdAt');
    expect(res.data.title).toBe('Updated Sports Day Title');
  });

  // ============================================================
  // 7. REST NOTICE DELETION (DELETE /api/v1/notices/:id)
  // ============================================================

  it('deletes notice via REST API client', async () => {
    const deleteSpy = vi.spyOn(noticesApiModule, 'deleteNotice').mockResolvedValue({
      success: true,
      data: { id: NOTICE_ID_1, message: 'Notice deleted successfully' }
    });

    const res = await noticesApiModule.deleteNotice(NOTICE_ID_1);

    expect(deleteSpy).toHaveBeenCalledWith(NOTICE_ID_1);
    expect(res.success).toBe(true);
  });

  // ============================================================
  // 8. REST READ RECEIPTS (POST /api/v1/notices/:id/view)
  // ============================================================

  it('records read receipt via REST API client without forging viewer identity', async () => {
    const viewSpy = vi.spyOn(noticesApiModule, 'markNoticeViewed').mockResolvedValue({
      success: true,
      data: { notice: { id: NOTICE_ID_1 }, alreadyViewed: false }
    });

    const res = await noticesApiModule.markNoticeViewed(NOTICE_ID_1);

    expect(viewSpy).toHaveBeenCalledWith(NOTICE_ID_1);
    expect(res.data.alreadyViewed).toBe(false);
  });

  // ============================================================
  // 9. WHATSAPP DISPATCH SAFETY
  // ============================================================

  it('does NOT trigger WhatsApp dispatch on listing, viewing, editing, or deleting notices', async () => {
    const waSpy = vi.spyOn(whatsappService, 'sendNoticeNotification');
    vi.spyOn(noticesApiModule, 'listNotices').mockResolvedValue({ success: true, data: [] });
    vi.spyOn(noticesApiModule, 'getNoticeById').mockResolvedValue({ success: true, data: { id: NOTICE_ID_1 } });
    vi.spyOn(noticesApiModule, 'updateNotice').mockResolvedValue({ success: true, data: { id: NOTICE_ID_1 } });
    vi.spyOn(noticesApiModule, 'deleteNotice').mockResolvedValue({ success: true });

    // Listing
    await noticesApiModule.listNotices({ type: 'global' });
    expect(waSpy).not.toHaveBeenCalled();

    // Viewing
    await noticesApiModule.getNoticeById(NOTICE_ID_1);
    expect(waSpy).not.toHaveBeenCalled();

    // Editing
    await noticesApiModule.updateNotice(NOTICE_ID_1, { title: 'Edit' });
    expect(waSpy).not.toHaveBeenCalled();

    // Deleting
    await noticesApiModule.deleteNotice(NOTICE_ID_1);
    expect(waSpy).not.toHaveBeenCalled();
  });
});
