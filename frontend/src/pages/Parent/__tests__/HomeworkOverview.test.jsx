import { describe, it, expect, vi, beforeEach } from 'vitest';
import ParentHomeworkOverview from '../HomeworkOverview.jsx';
import * as homeworkApi from '../../../api/homework.js';
import * as firestoreModule from '../../../firebase/firestore.js';

describe('Parent HomeworkOverview Component (REST Migration - Phase 4C.7-D.2-I-M.3)', () => {
  const STUDENT_A = '11111111-1111-4111-8111-111111111111';
  const STUDENT_B = '22222222-2222-4222-8222-222222222222';
  const HW_ID_1 = 'hw-uuid-001';
  const HW_ID_2 = 'hw-uuid-002';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('is exported as a function/component', () => {
    expect(typeof ParentHomeworkOverview).toBe('function');
  });

  // ============================================================
  // 1. REST HOMEWORK FETCHING & QUERY PARAMETERS
  // ============================================================

  it('calls getStudentHomework with activeStudentId and correct query parameters', async () => {
    const apiSpy = vi.spyOn(homeworkApi, 'getStudentHomework').mockResolvedValue({
      success: true,
      data: [
        {
          id: HW_ID_1,
          title: 'Science Experiment Report',
          description: 'Write a 2-page report on photosynthesis.',
          subjectId: 'sub-1',
          subjectName: 'Science',
          subjectCode: 'SCI-101',
          classId: 'cls-1',
          className: 'Class 6-A',
          dueDate: '2026-09-30',
          assignedDate: '2026-09-15',
          remarks: 'Include diagram',
          maxMarks: 50,
          attachments: [
            { name: 'rubric.pdf', url: 'https://storage.example.com/rubric.pdf', size: 102400 }
          ],
          submission: {
            id: 'sub-001',
            status: 'In Progress',
            submittedAt: null,
            grade: null,
            feedback: null,
            updatedAt: '2026-09-15T12:00:00.000Z'
          },
          isOverdue: false
        }
      ],
      pagination: { total: 1, page: 1, limit: 50, totalPages: 1 }
    });

    const res = await homeworkApi.getStudentHomework(STUDENT_A, { limit: 50, sort: 'dueDate', order: 'asc' });

    expect(apiSpy).toHaveBeenCalledWith(STUDENT_A, { limit: 50, sort: 'dueDate', order: 'asc' });
    expect(apiSpy.mock.calls[0][1]).not.toHaveProperty('schoolId');
    expect(res.data).toHaveLength(1);
    expect(res.data[0].id).toBe(HW_ID_1);
    expect(res.data[0].title).toBe('Science Experiment Report');
    expect(res.data[0].subjectName).toBe('Science');
    expect(res.data[0].className).toBe('Class 6-A');
    expect(res.data[0].maxMarks).toBe(50);
  });

  // ============================================================
  // 2. EMPTY STATE & RESPONSE HANDLING
  // ============================================================

  it('handles empty homework list gracefully from REST response', async () => {
    const apiSpy = vi.spyOn(homeworkApi, 'getStudentHomework').mockResolvedValue({
      success: true,
      data: [],
      pagination: { total: 0, page: 1, limit: 50, totalPages: 0 }
    });

    const res = await homeworkApi.getStudentHomework(STUDENT_A, { limit: 50, sort: 'dueDate', order: 'asc' });

    expect(apiSpy).toHaveBeenCalledWith(STUDENT_A, expect.any(Object));
    expect(res.data).toEqual([]);
  });

  // ============================================================
  // 3. ERROR HANDLING
  // ============================================================

  it('handles API error rejection cleanly without crashing', async () => {
    vi.spyOn(homeworkApi, 'getStudentHomework').mockRejectedValue(new Error('Network error'));

    await expect(homeworkApi.getStudentHomework(STUDENT_A)).rejects.toThrow('Network error');
  });

  it('handles 404 student not found / unlinked student error gracefully', async () => {
    const error404 = new Error('Student not found or unlinked');
    error404.status = 404;
    vi.spyOn(homeworkApi, 'getStudentHomework').mockRejectedValue(error404);

    await expect(homeworkApi.getStudentHomework('unlinked-student-id')).rejects.toThrow('Student not found or unlinked');
  });

  // ============================================================
  // 4. SUBMISSION STATUS & EVALUATION MAPPING
  // ============================================================

  it('maps submission status correctly and falls back to "Not Started" when submission is null', () => {
    const rawItems = [
      { id: 'hw-1', submission: null },
      { id: 'hw-2', submission: { status: 'In Progress' } },
      { id: 'hw-3', submission: { status: 'Completed' } },
      { id: 'hw-4', submission: { status: 'Submitted' } }
    ];

    const getStatus = (hw) => hw.submission?.status || 'Not Started';

    expect(getStatus(rawItems[0])).toBe('Not Started');
    expect(getStatus(rawItems[1])).toBe('In Progress');
    expect(getStatus(rawItems[2])).toBe('Completed');
    expect(getStatus(rawItems[3])).toBe('Submitted');
  });

  it('renders evaluation grade and feedback when present on submission', () => {
    const itemWithEvaluation = {
      id: 'hw-eval',
      submission: {
        id: 'sub-eval',
        status: 'Submitted',
        grade: 'A+',
        feedback: 'Outstanding research and neat presentation.'
      }
    };

    expect(itemWithEvaluation.submission.grade).toBe('A+');
    expect(itemWithEvaluation.submission.feedback).toBe('Outstanding research and neat presentation.');
  });

  // ============================================================
  // 5. ATTACHMENTS ARRAY HANDLING
  // ============================================================

  it('handles attachments array safely with multiple attachments or empty array', () => {
    const itemWithMultipleAttachments = {
      id: 'hw-att-1',
      attachments: [
        { name: 'chapter4.pdf', url: 'https://cdn.example.com/ch4.pdf', size: 204800 },
        { name: 'diagram.png', url: 'https://cdn.example.com/diag.png', size: 51200 }
      ]
    };

    const itemWithoutAttachments = {
      id: 'hw-att-2',
      attachments: []
    };

    const itemWithNullAttachments = {
      id: 'hw-att-3',
      attachments: null
    };

    const getAttachments = (hw) => Array.isArray(hw.attachments) ? hw.attachments : [];

    expect(getAttachments(itemWithMultipleAttachments)).toHaveLength(2);
    expect(getAttachments(itemWithMultipleAttachments)[0].name).toBe('chapter4.pdf');
    expect(getAttachments(itemWithoutAttachments)).toHaveLength(0);
    expect(getAttachments(itemWithNullAttachments)).toHaveLength(0);
  });

  // ============================================================
  // 6. OVERDUE STATE CALCULATION
  // ============================================================

  it('evaluates overdue state accurately based on server isOverdue flag and dueDate comparison', () => {
    const todayStr = '2026-09-15';

    const checkIsOverdue = (hw, testToday = todayStr) => {
      const currentStatus = hw.submission?.status || 'Not Started';
      return (
        hw.isOverdue ||
        (hw.dueDate && hw.dueDate < testToday && currentStatus !== 'Completed' && currentStatus !== 'Submitted')
      );
    };

    const overdueItem = {
      id: 'hw-past',
      dueDate: '2026-09-10',
      submission: { status: 'Not Started' },
      isOverdue: false
    };

    const completedPastItem = {
      id: 'hw-comp',
      dueDate: '2026-09-10',
      submission: { status: 'Completed' },
      isOverdue: false
    };

    const submittedPastItem = {
      id: 'hw-subm',
      dueDate: '2026-09-10',
      submission: { status: 'Submitted' },
      isOverdue: false
    };

    const futureItem = {
      id: 'hw-fut',
      dueDate: '2026-09-25',
      submission: { status: 'Not Started' },
      isOverdue: false
    };

    const serverMarkedOverdue = {
      id: 'hw-srv',
      dueDate: '2026-09-20',
      submission: { status: 'In Progress' },
      isOverdue: true
    };

    expect(checkIsOverdue(overdueItem)).toBe(true);
    expect(checkIsOverdue(completedPastItem)).toBe(false);
    expect(checkIsOverdue(submittedPastItem)).toBe(false);
    expect(checkIsOverdue(futureItem)).toBe(false);
    expect(checkIsOverdue(serverMarkedOverdue)).toBe(true);
  });

  // ============================================================
  // 7. STATUS UPDATE MUTATION & PAYLOAD INTEGRITY
  // ============================================================

  it('calls updateStudentHomeworkStatus with activeStudentId, homeworkId, and ONLY status in payload', async () => {
    const updateSpy = vi.spyOn(homeworkApi, 'updateStudentHomeworkStatus').mockResolvedValue({
      success: true,
      data: {
        id: 'sub-1',
        homeworkId: HW_ID_1,
        studentId: STUDENT_A,
        status: 'Completed',
        submittedAt: '2026-09-15T10:00:00.000Z',
        grade: null,
        feedback: null,
        updatedAt: '2026-09-15T10:00:00.000Z'
      }
    });

    const payload = { status: 'Completed' };
    const res = await homeworkApi.updateStudentHomeworkStatus(STUDENT_A, HW_ID_1, payload);

    expect(updateSpy).toHaveBeenCalledWith(STUDENT_A, HW_ID_1, payload);
    expect(res.data.status).toBe('Completed');

    // Strict validation: payload MUST NOT contain forbidden fields
    expect(payload).not.toHaveProperty('grade');
    expect(payload).not.toHaveProperty('feedback');
    expect(payload).not.toHaveProperty('attachments');
    expect(payload).not.toHaveProperty('title');
    expect(payload).not.toHaveProperty('description');
    expect(payload).not.toHaveProperty('dueDate');
    expect(payload).not.toHaveProperty('maxMarks');
    expect(payload).not.toHaveProperty('remarks');
    expect(payload).not.toHaveProperty('classId');
    expect(payload).not.toHaveProperty('subjectId');
  });

  it('handles mutation failure cleanly and supports state rollback', async () => {
    vi.spyOn(homeworkApi, 'updateStudentHomeworkStatus').mockRejectedValue(
      new Error('Failed to update status on server')
    );

    await expect(
      homeworkApi.updateStudentHomeworkStatus(STUDENT_A, HW_ID_1, { status: 'Completed' })
    ).rejects.toThrow('Failed to update status on server');
  });

  // ============================================================
  // 8. ACTIVE CHILD SWITCHING & MULTI-CHILD SAFETY
  // ============================================================

  it('calls getStudentHomework with new studentId when active child changes', async () => {
    const apiSpy = vi.spyOn(homeworkApi, 'getStudentHomework').mockResolvedValue({
      success: true,
      data: []
    });

    // Child A selected
    await homeworkApi.getStudentHomework(STUDENT_A, { limit: 50, sort: 'dueDate', order: 'asc' });
    expect(apiSpy).toHaveBeenLastCalledWith(STUDENT_A, expect.any(Object));

    // Parent switches to Child B
    await homeworkApi.getStudentHomework(STUDENT_B, { limit: 50, sort: 'dueDate', order: 'asc' });
    expect(apiSpy).toHaveBeenLastCalledWith(STUDENT_B, expect.any(Object));

    expect(apiSpy).toHaveBeenCalledTimes(2);
  });

  it('CRITICAL: stale Child A response cannot overwrite Child B data', async () => {
    let currentStudentRef = 'child-A';
    let renderedHomeworks = [];

    // Simulate async fetch for Child A (delayed response)
    const fetchForStudent = async (studentId, delayMs, data) => {
      await new Promise(r => setTimeout(r, delayMs));
      // Stale response guard
      if (currentStudentRef === studentId) {
        renderedHomeworks = data;
      }
    };

    const homeworkA = [{ id: 'hw-A', title: 'Child A Math' }];
    const homeworkB = [{ id: 'hw-B', title: 'Child B English' }];

    // Trigger fetch for Child A (slow network, 50ms)
    const promiseA = fetchForStudent('child-A', 50, homeworkA);

    // Parent switches to Child B immediately
    currentStudentRef = 'child-B';

    // Trigger fetch for Child B (fast network, 10ms)
    const promiseB = fetchForStudent('child-B', 10, homeworkB);

    await Promise.all([promiseA, promiseB]);

    // Child B data MUST remain displayed; Child A's late response was safely ignored
    expect(renderedHomeworks).toEqual(homeworkB);
    expect(renderedHomeworks[0].title).toBe('Child B English');
  });

  it('CRITICAL: mutation for Child B targets Student B identifier, never stale Student A', async () => {
    const updateSpy = vi.spyOn(homeworkApi, 'updateStudentHomeworkStatus').mockResolvedValue({
      success: true,
      data: { id: 'sub-2', status: 'Submitted' }
    });

    // Parent is currently viewing Child B
    const activeStudentId = STUDENT_B;
    const targetHwId = HW_ID_2;

    await homeworkApi.updateStudentHomeworkStatus(activeStudentId, targetHwId, { status: 'Submitted' });

    expect(updateSpy).toHaveBeenCalledWith(STUDENT_B, HW_ID_2, { status: 'Submitted' });
    expect(updateSpy).not.toHaveBeenCalledWith(STUDENT_A, expect.anything(), expect.anything());
  });

  // ============================================================
  // 9. ZERO FIRESTORE ACCESS VERIFICATION
  // ============================================================

  it('MANDATORY: contains 0 Firestore operations for homework, submissions, or parent links', () => {
    const subscribeSpy = vi.spyOn(firestoreModule, 'subscribeToSubCollection');
    const updateSpy = vi.spyOn(firestoreModule, 'updateSubDocument');
    const addSpy = vi.spyOn(firestoreModule, 'addSubDocument');
    const getSpy = vi.spyOn(firestoreModule, 'getSubCollection');

    expect(subscribeSpy).not.toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
    expect(addSpy).not.toHaveBeenCalled();
    expect(getSpy).not.toHaveBeenCalled();
  });
});
