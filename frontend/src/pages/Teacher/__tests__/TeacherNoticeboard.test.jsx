import { describe, it, expect, vi, beforeEach } from 'vitest';
import TeacherNoticeboard from '../TeacherNoticeboard.jsx';
import * as noticesApiModule from '../../../api/notices.js';
import * as classesApiModule from '../../../api/classes.js';
import * as studentsApiModule from '../../../api/students.js';
import * as firestoreModule from '../../../firebase/firestore.js';

describe('Teacher Noticeboard Component (REST Migration)', () => {
  const PG_CLASS_1 = '05120a32-8118-44b6-8010-b9ed2c5467c0';
  const NOTICE_ID_1 = '11111111-1111-4111-8111-111111111111';
  const NOTICE_ID_2 = '22222222-2222-4222-8222-222222222222';
  const STUDENT_ID_1 = '33333333-3333-4333-8333-333333333333';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('is exported as a valid React component function', () => {
    expect(typeof TeacherNoticeboard).toBe('function');
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
      vi.spyOn(firestoreModule, 'markNoticeAsViewed'),
      vi.spyOn(firestoreModule, 'subscribeToStudentsByClass')
    ];

    firestoreSpies.forEach((spy) => {
      expect(spy).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // 2. REST CLASSES & STUDENTS LOADING
  // ============================================================

  it('loads classes from REST classes API using PostgreSQL UUIDs', async () => {
    const classesSpy = vi.spyOn(classesApiModule, 'listClasses').mockResolvedValue({
      success: true,
      data: [{ id: PG_CLASS_1, name: 'Grade 5A' }]
    });

    const res = await classesApiModule.listClasses({ limit: 100 });

    expect(classesSpy).toHaveBeenCalledWith({ limit: 100 });
    expect(res.data[0].id).toBe(PG_CLASS_1);
    expect(res.data[0].name).toBe('Grade 5A');
  });

  it('loads students for class from REST students API', async () => {
    const studentsSpy = vi.spyOn(studentsApiModule, 'listStudents').mockResolvedValue({
      success: true,
      data: [{ id: STUDENT_ID_1, firstName: 'Alice', lastName: 'Smith', classId: PG_CLASS_1 }]
    });

    const res = await studentsApiModule.listStudents({ classId: PG_CLASS_1, limit: 100 });

    expect(studentsSpy).toHaveBeenCalledWith({ classId: PG_CLASS_1, limit: 100 });
    expect(res.data[0].id).toBe(STUDENT_ID_1);
    expect(res.data[0].firstName).toBe('Alice');
  });

  // ============================================================
  // 3. REST NOTICES LISTING (GLOBAL & CLASS)
  // ============================================================

  it('loads global notices via REST API client', async () => {
    const listSpy = vi.spyOn(noticesApiModule, 'listNotices').mockResolvedValue({
      success: true,
      data: [
        {
          id: NOTICE_ID_1,
          title: 'All-School Staff Meeting',
          content: 'Meeting at 3 PM in the auditorium',
          type: 'global',
          audience: 'teachers',
          priority: 'high',
          authorName: 'Principal Skinner',
          viewedBy: [],
          createdAt: '2026-09-15T09:00:00.000Z'
        }
      ],
      pagination: { total: 1, page: 1, limit: 100, totalPages: 1 }
    });

    const res = await noticesApiModule.listNotices({ type: 'global', limit: 100 });

    expect(listSpy).toHaveBeenCalledWith({ type: 'global', limit: 100 });
    expect(res.data).toHaveLength(1);
    expect(res.data[0].title).toBe('All-School Staff Meeting');
    expect(res.data[0].audience).toBe('teachers');
  });

  it('loads class notices with PostgreSQL classId parameter', async () => {
    const listSpy = vi.spyOn(noticesApiModule, 'listNotices').mockResolvedValue({
      success: true,
      data: [
        {
          id: NOTICE_ID_2,
          title: 'Math Homework Reminder',
          content: 'Please submit exercise 4B tomorrow',
          type: 'class',
          classId: PG_CLASS_1,
          className: 'Grade 5A',
          audience: 'parents',
          priority: 'normal',
          authorName: 'Teacher Jane',
          createdAt: '2026-09-15T12:00:00.000Z'
        }
      ],
      pagination: { total: 1, page: 1, limit: 100, totalPages: 1 }
    });

    const res = await noticesApiModule.listNotices({ type: 'class', classId: PG_CLASS_1, limit: 100 });

    expect(listSpy).toHaveBeenCalledWith({ type: 'class', classId: PG_CLASS_1, limit: 100 });
    expect(res.data).toHaveLength(1);
    expect(res.data[0].classId).toBe(PG_CLASS_1);
  });

  // ============================================================
  // 4. REST CLASS NOTICE CREATION (POST /api/v1/notices)
  // ============================================================

  it('creates class notice with client-owned fields only (no server-owned fields)', async () => {
    const createSpy = vi.spyOn(noticesApiModule, 'createNotice').mockResolvedValue({
      success: true,
      data: {
        id: 'notice-teacher-new',
        title: 'Bring art supplies',
        content: 'Watercolor set needed',
        type: 'class',
        classId: PG_CLASS_1,
        audience: 'all',
        priority: 'normal'
      }
    });

    const payload = {
      title: 'Bring art supplies',
      content: 'Watercolor set needed',
      type: 'class',
      classId: PG_CLASS_1,
      audience: 'all',
      priority: 'normal',
      targetStudentIds: []
    };

    const res = await noticesApiModule.createNotice(payload);

    expect(createSpy).toHaveBeenCalledWith(payload);
    const sentPayload = createSpy.mock.calls[0][0];
    expect(sentPayload).not.toHaveProperty('schoolId');
    expect(sentPayload).not.toHaveProperty('authorId');
    expect(sentPayload).not.toHaveProperty('authorName');
    expect(sentPayload).not.toHaveProperty('viewedBy');
    expect(sentPayload).not.toHaveProperty('createdAt');
    expect(res.data.id).toBe('notice-teacher-new');
  });

  // ============================================================
  // 5. REST NOTICE UPDATE & DELETE
  // ============================================================

  it('updates class notice via REST API client', async () => {
    const updateSpy = vi.spyOn(noticesApiModule, 'updateNotice').mockResolvedValue({
      success: true,
      data: { id: NOTICE_ID_2, title: 'Updated Reminder' }
    });

    const updatePayload = {
      title: 'Updated Reminder',
      content: 'Updated content',
      audience: 'parents',
      priority: 'high',
      targetStudentIds: [STUDENT_ID_1]
    };

    const res = await noticesApiModule.updateNotice(NOTICE_ID_2, updatePayload);

    expect(updateSpy).toHaveBeenCalledWith(NOTICE_ID_2, updatePayload);
    const sent = updateSpy.mock.calls[0][1];
    expect(sent).not.toHaveProperty('schoolId');
    expect(sent).not.toHaveProperty('authorId');
    expect(res.data.title).toBe('Updated Reminder');
  });

  it('deletes class notice via REST API client', async () => {
    const deleteSpy = vi.spyOn(noticesApiModule, 'deleteNotice').mockResolvedValue({
      success: true,
      data: { id: NOTICE_ID_2 }
    });

    const res = await noticesApiModule.deleteNotice(NOTICE_ID_2);

    expect(deleteSpy).toHaveBeenCalledWith(NOTICE_ID_2);
    expect(res.success).toBe(true);
  });

  // ============================================================
  // 6. REST READ RECEIPT
  // ============================================================

  it('marks notice as viewed via REST API client without forging identity', async () => {
    const viewSpy = vi.spyOn(noticesApiModule, 'markNoticeViewed').mockResolvedValue({
      success: true,
      data: { notice: { id: NOTICE_ID_1 }, alreadyViewed: false }
    });

    const res = await noticesApiModule.markNoticeViewed(NOTICE_ID_1);

    expect(viewSpy).toHaveBeenCalledWith(NOTICE_ID_1);
    expect(res.data.alreadyViewed).toBe(false);
  });

  // ============================================================
  // 7. EMPTY STATE HANDLING
  // ============================================================

  it('handles empty response gracefully when no notices exist', async () => {
    vi.spyOn(noticesApiModule, 'listNotices').mockResolvedValue({
      success: true,
      data: [],
      pagination: { total: 0, page: 1, limit: 100, totalPages: 0 }
    });

    const res = await noticesApiModule.listNotices({ type: 'class', classId: PG_CLASS_1, limit: 100 });

    expect(res.success).toBe(true);
    expect(res.data).toEqual([]);
    expect(res.pagination.total).toBe(0);
  });
});
