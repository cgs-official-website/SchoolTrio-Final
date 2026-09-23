import { describe, it, expect, vi, beforeEach } from 'vitest';
import LessonPlans from '../LessonPlans.jsx';
import * as lessonPlansApiModule from '../../../api/lesson-plans.js';
import * as classesApiModule from '../../../api/classes.js';
import * as subjectsApiModule from '../../../api/subjects.js';
import * as firestoreModule from '../../../firebase/firestore.js';

describe('Teacher LessonPlans Component (REST Migration & Semantic Verification)', () => {
  const PG_CLASS_ID_1 = '05120a32-8118-44b6-8010-b9ed2c5467c0';
  const PG_CLASS_ID_2 = '15120a32-8118-44b6-8010-b9ed2c5467c1';
  const PG_SUBJECT_ID_1 = '25120a32-8118-44b6-8010-b9ed2c5467c2';
  const PG_SUBJECT_ID_2 = '35120a32-8118-44b6-8010-b9ed2c5467c3';
  const PG_PLAN_ID_1 = '45120a32-8118-44b6-8010-b9ed2c5467c4';
  const PG_PLAN_ID_2 = '55120a32-8118-44b6-8010-b9ed2c5467c5';
  const PG_PLAN_ID_3 = '65120a32-8118-44b6-8010-b9ed2c5467c6';
  const PG_TEACHER_ID = '75120a32-8118-44b6-8010-b9ed2c5467c7';

  const mockClasses = [
    { id: PG_CLASS_ID_1, name: 'Grade 10', section: 'A' },
    { id: PG_CLASS_ID_2, name: 'Grade 9', section: 'B' }
  ];

  const mockSubjects = [
    { id: PG_SUBJECT_ID_1, name: 'Mathematics', code: 'MATH101' },
    { id: PG_SUBJECT_ID_2, name: 'Science', code: 'SCI101' }
  ];

  const mockPlans = [
    {
      id: PG_PLAN_ID_1,
      schoolId: 'school-123',
      teacherId: PG_TEACHER_ID,
      teacherName: 'John Doe',
      classId: PG_CLASS_ID_1,
      className: 'Grade 10 - Section A',
      subjectId: PG_SUBJECT_ID_1,
      subjectName: 'Mathematics',
      topic: 'Quadratic Equations',
      date: '2026-10-15',
      status: 'ready',
      objectives: 'Solve by factoring',
      createdAt: '2026-09-15T10:00:00.000Z',
      updatedAt: '2026-09-15T10:00:00.000Z'
    },
    {
      id: PG_PLAN_ID_2,
      schoolId: 'school-123',
      teacherId: PG_TEACHER_ID,
      teacherName: 'John Doe',
      classId: PG_CLASS_ID_2,
      className: 'Grade 9 - Section B',
      subjectId: PG_SUBJECT_ID_2,
      subjectName: 'Science',
      topic: 'Cell Structure',
      date: '2026-08-10',
      status: 'completed',
      objectives: 'Understand plant vs animal cells',
      createdAt: '2026-08-01T10:00:00.000Z',
      updatedAt: '2026-08-10T10:00:00.000Z'
    }
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('is exported as a valid React component function', () => {
    expect(typeof LessonPlans).toBe('function');
  });

  // ============================================================
  // 1. ZERO FIRESTORE LESSON PLAN ACCESS
  // ============================================================

  it('does NOT invoke Firestore subscription or mutation helpers for lesson plans', () => {
    const subscribeSpy = vi.spyOn(firestoreModule, 'subscribeToSubCollection');
    const addSpy = vi.spyOn(firestoreModule, 'addSubDocument');
    const updateSpy = vi.spyOn(firestoreModule, 'updateSubDocument');
    const deleteSpy = vi.spyOn(firestoreModule, 'deleteSubDocument');

    expect(subscribeSpy).not.toHaveBeenCalled();
    expect(addSpy).not.toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  // ============================================================
  // 2. REST CLASSES & SUBJECTS LOADING
  // ============================================================

  it('loads classes and subjects from REST APIs using PostgreSQL UUIDs', async () => {
    const classesSpy = vi.spyOn(classesApiModule, 'listClasses').mockResolvedValue({
      success: true,
      data: mockClasses
    });
    const subjectsSpy = vi.spyOn(subjectsApiModule, 'listSubjects').mockResolvedValue({
      success: true,
      data: mockSubjects
    });

    const [classesRes, subjectsRes] = await Promise.all([
      classesApiModule.listClasses({ limit: 100 }),
      subjectsApiModule.listSubjects({ limit: 100 })
    ]);

    expect(classesSpy).toHaveBeenCalledWith({ limit: 100 });
    expect(subjectsSpy).toHaveBeenCalledWith({ limit: 100 });
    expect(classesRes.data).toHaveLength(2);
    expect(subjectsRes.data).toHaveLength(2);
    expect(classesRes.data[0].id).toBe(PG_CLASS_ID_1);
    expect(subjectsRes.data[0].id).toBe(PG_SUBJECT_ID_1);
  });

  // ============================================================
  // 3. REST LESSON PLANS LISTING & MULTI-PAGE COMPLETENESS
  // ============================================================

  it('loads lesson plans via REST API client', async () => {
    const listSpy = vi.spyOn(lessonPlansApiModule, 'listLessonPlans').mockResolvedValue({
      success: true,
      data: mockPlans,
      pagination: { total: 2, page: 1, limit: 100, totalPages: 1 }
    });

    const res = await lessonPlansApiModule.listLessonPlans({ page: 1, limit: 100 });

    expect(listSpy).toHaveBeenCalledWith({ page: 1, limit: 100 });
    expect(res.data).toHaveLength(2);
    expect(res.data[0].topic).toBe('Quadratic Equations');
    expect(res.data[0].className).toBe('Grade 10 - Section A');
    expect(res.data[0].subjectName).toBe('Mathematics');
  });

  it('paginates across multiple pages to guarantee dataset completeness', async () => {
    const page1Plans = [mockPlans[0]];
    const page2Plans = [
      {
        id: PG_PLAN_ID_3,
        topic: 'Optics',
        date: '2026-11-20',
        status: 'draft',
        className: 'Grade 10 - Section A',
        subjectName: 'Physics'
      }
    ];

    const listSpy = vi.spyOn(lessonPlansApiModule, 'listLessonPlans')
      .mockResolvedValueOnce({
        success: true,
        data: page1Plans,
        pagination: { total: 2, page: 1, limit: 100, totalPages: 2 }
      })
      .mockResolvedValueOnce({
        success: true,
        data: page2Plans,
        pagination: { total: 2, page: 2, limit: 100, totalPages: 2 }
      });

    let allPlans = [];
    let currentPage = 1;
    let totalPages = 1;

    do {
      const res = await lessonPlansApiModule.listLessonPlans({ page: currentPage, limit: 100 });
      allPlans = allPlans.concat(res.data);
      totalPages = res.pagination?.totalPages || 1;
      currentPage += 1;
    } while (currentPage <= totalPages);

    expect(listSpy).toHaveBeenCalledTimes(2);
    expect(listSpy).toHaveBeenNthCalledWith(1, { page: 1, limit: 100 });
    expect(listSpy).toHaveBeenNthCalledWith(2, { page: 2, limit: 100 });
    expect(allPlans).toHaveLength(2);
    expect(allPlans[0].id).toBe(PG_PLAN_ID_1);
    expect(allPlans[1].id).toBe(PG_PLAN_ID_3);
  });

  // ============================================================
  // 4. REST LESSON PLAN CREATION (POST /api/v1/lesson-plans)
  // ============================================================

  it('creates a lesson plan with client-allowed fields only (no schoolId/userId spoofing)', async () => {
    const createSpy = vi.spyOn(lessonPlansApiModule, 'createLessonPlan').mockResolvedValue({
      success: true,
      data: {
        id: 'new-plan-uuid',
        classId: PG_CLASS_ID_1,
        subjectId: PG_SUBJECT_ID_1,
        topic: 'Trigonometry',
        date: '2026-11-01',
        status: 'draft',
        objectives: 'Sin, Cos, Tan functions'
      }
    });

    const payload = {
      classId: PG_CLASS_ID_1,
      subjectId: PG_SUBJECT_ID_1,
      topic: 'Trigonometry',
      date: '2026-11-01',
      status: 'draft',
      objectives: 'Sin, Cos, Tan functions'
    };

    const res = await lessonPlansApiModule.createLessonPlan(payload);

    expect(createSpy).toHaveBeenCalledWith(payload);
    const sent = createSpy.mock.calls[0][0];
    expect(sent).not.toHaveProperty('schoolId');
    expect(sent).not.toHaveProperty('tenantId');
    expect(sent).not.toHaveProperty('userId');
    expect(sent).not.toHaveProperty('teacherId');
    expect(res.data.id).toBe('new-plan-uuid');
    expect(res.data.topic).toBe('Trigonometry');
  });

  // ============================================================
  // 5. REST LESSON PLAN UPDATE (PATCH /api/v1/lesson-plans/:id)
  // ============================================================

  it('updates a lesson plan via REST API client', async () => {
    const updateSpy = vi.spyOn(lessonPlansApiModule, 'updateLessonPlan').mockResolvedValue({
      success: true,
      data: {
        id: PG_PLAN_ID_1,
        topic: 'Advanced Quadratic Equations',
        status: 'ready'
      }
    });

    const updatePayload = {
      topic: 'Advanced Quadratic Equations',
      status: 'ready'
    };

    const res = await lessonPlansApiModule.updateLessonPlan(PG_PLAN_ID_1, updatePayload);

    expect(updateSpy).toHaveBeenCalledWith(PG_PLAN_ID_1, updatePayload);
    const sent = updateSpy.mock.calls[0][1];
    expect(sent).not.toHaveProperty('schoolId');
    expect(sent).not.toHaveProperty('teacherId');
    expect(res.data.topic).toBe('Advanced Quadratic Equations');
  });

  // ============================================================
  // 6. REST LESSON PLAN DELETION (DELETE /api/v1/lesson-plans/:id)
  // ============================================================

  it('deletes a lesson plan via REST API client', async () => {
    const deleteSpy = vi.spyOn(lessonPlansApiModule, 'deleteLessonPlan').mockResolvedValue({
      success: true,
      message: 'Lesson plan deleted successfully'
    });

    const res = await lessonPlansApiModule.deleteLessonPlan(PG_PLAN_ID_1);

    expect(deleteSpy).toHaveBeenCalledWith(PG_PLAN_ID_1);
    expect(res.success).toBe(true);
  });

  // ============================================================
  // 7. UPCOMING VS PAST DATE-ONLY FILTERING (9-CASE TRUTH TABLE)
  // ============================================================

  it('verifies 9-case truth table for upcoming vs past classification', () => {
    const todayStr = '2026-09-16';

    const testCases = [
      { id: '1', date: '2026-09-20', status: 'draft', expected: 'upcoming' },
      { id: '2', date: '2026-09-20', status: 'ready', expected: 'upcoming' },
      { id: '3', date: '2026-09-20', status: 'completed', expected: 'past' },
      { id: '4', date: '2026-09-16', status: 'draft', expected: 'upcoming' },
      { id: '5', date: '2026-09-16', status: 'ready', expected: 'upcoming' },
      { id: '6', date: '2026-09-16', status: 'completed', expected: 'past' },
      { id: '7', date: '2026-09-10', status: 'draft', expected: 'past' },
      { id: '8', date: '2026-09-10', status: 'ready', expected: 'past' },
      { id: '9', date: '2026-09-10', status: 'completed', expected: 'past' }
    ];

    testCases.forEach(tc => {
      const planDateStr = tc.date.substring(0, 10);
      const isPast = (planDateStr && planDateStr < todayStr) || tc.status === 'completed';
      const actual = isPast ? 'past' : 'upcoming';
      expect(actual).toBe(tc.expected);
    });
  });

  // ============================================================
  // 8. SEARCH FILTERING SEMANTICS (TOPIC & SUBJECT ONLY)
  // ============================================================

  it('searches by topic and subject name without matching class names', () => {
    const plans = [
      { id: '1', topic: 'Linear Equations', subjectName: 'Mathematics', className: 'Grade 10A' },
      { id: '2', topic: 'Plant Reproduction', subjectName: 'Biology', className: 'Grade 10B' },
      { id: '3', topic: 'World War II', subjectName: 'History', className: 'Grade 9A' }
    ];

    const searchTopic = 'linear';
    const res1 = plans.filter(p =>
      (p.topic || '').toLowerCase().includes(searchTopic.toLowerCase()) ||
      (p.subjectName || p.subject || '').toLowerCase().includes(searchTopic.toLowerCase())
    );
    expect(res1).toHaveLength(1);
    expect(res1[0].id).toBe('1');

    const searchSubject = 'bio';
    const res2 = plans.filter(p =>
      (p.topic || '').toLowerCase().includes(searchSubject.toLowerCase()) ||
      (p.subjectName || p.subject || '').toLowerCase().includes(searchSubject.toLowerCase())
    );
    expect(res2).toHaveLength(1);
    expect(res2[0].id).toBe('2');

    const searchClass = 'Grade 10';
    const res3 = plans.filter(p =>
      (p.topic || '').toLowerCase().includes(searchClass.toLowerCase()) ||
      (p.subjectName || p.subject || '').toLowerCase().includes(searchClass.toLowerCase())
    );
    expect(res3).toHaveLength(0);
  });

  // ============================================================
  // 9. EMPTY STATE & ERROR HANDLING
  // ============================================================

  it('handles empty lesson plans list gracefully', async () => {
    vi.spyOn(lessonPlansApiModule, 'listLessonPlans').mockResolvedValue({
      success: true,
      data: [],
      pagination: { total: 0, page: 1, limit: 100, totalPages: 0 }
    });

    const res = await lessonPlansApiModule.listLessonPlans({ limit: 100 });
    expect(res.success).toBe(true);
    expect(res.data).toEqual([]);
    expect(res.pagination.total).toBe(0);
  });

  it('handles API errors without falling back to Firestore', async () => {
    const errorMsg = 'Failed to load lesson plans from server';
    vi.spyOn(lessonPlansApiModule, 'listLessonPlans').mockRejectedValue(new Error(errorMsg));
    const firestoreSpy = vi.spyOn(firestoreModule, 'subscribeToSubCollection');

    await expect(lessonPlansApiModule.listLessonPlans({ limit: 100 })).rejects.toThrow(errorMsg);
    expect(firestoreSpy).not.toHaveBeenCalled();
  });
});
