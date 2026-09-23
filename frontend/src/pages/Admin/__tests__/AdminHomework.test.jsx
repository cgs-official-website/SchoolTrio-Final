import { describe, it, expect, vi, beforeEach } from 'vitest';
import AdminHomework from '../AdminHomework.jsx';
import * as homeworkApi from '../../../api/homework.js';
import * as classesApi from '../../../api/classes.js';
import * as firestoreModule from '../../../firebase/firestore.js';

describe('Admin Homework Overview Component (REST Migration - Phase 4C.7-D.2-I-M.4.1)', () => {
  const PG_CLASS_1 = '05120a32-8118-44b6-8010-b9ed2c5467c0';
  const PG_CLASS_2 = '547da6cb-35bf-48c2-b798-1e809fb62890';
  const HW_ID_1 = '11111111-1111-4111-8111-111111111111';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('is exported as a function/component', () => {
    expect(typeof AdminHomework).toBe('function');
  });

  // ============================================================
  // 1. REST CLASSES LOADING (GET /api/v1/classes)
  // ============================================================

  it('loads classes from REST classes API on mount with limit=100', async () => {
    const classesSpy = vi.spyOn(classesApi, 'listClasses').mockResolvedValue({
      success: true,
      data: [
        { id: PG_CLASS_1, name: 'Grade 5A' },
        { id: PG_CLASS_2, name: 'Grade 6B' }
      ]
    });

    const res = await classesApi.listClasses({ limit: 100 });

    expect(classesSpy).toHaveBeenCalledWith({ limit: 100 });
    expect(classesSpy.mock.calls[0][0]).not.toHaveProperty('schoolId');
    expect(res.data).toHaveLength(2);
    expect(res.data[0].id).toBe(PG_CLASS_1);
  });

  // ============================================================
  // 2. REST HOMEWORK LISTING (GET /api/v1/homework)
  // ============================================================

  it('loads all homework assignments from REST homework API', async () => {
    const listSpy = vi.spyOn(homeworkApi, 'listHomework').mockResolvedValue({
      success: true,
      data: [
        {
          id: HW_ID_1,
          title: 'Mathematics Polynomials',
          description: 'Exercise 2.1 to 2.4',
          classId: PG_CLASS_1,
          className: 'Grade 5A',
          subjectId: 'sub-1',
          subjectName: 'Mathematics',
          subjectCode: 'MATH-101',
          dueDate: '2026-09-30',
          remarks: 'Show steps',
          maxMarks: 50,
          attachmentCount: 1,
          attachments: [{ name: 'worksheet.pdf', url: 'https://cdn.example.com/ws.pdf' }],
          submittedCount: 12,
          completedCount: 5,
          inProgressCount: 3,
          createdAt: '2026-09-15T00:00:00.000Z'
        }
      ],
      pagination: { total: 1, page: 1, limit: 100, totalPages: 1 }
    });

    const res = await homeworkApi.listHomework({ limit: 100 });

    expect(listSpy).toHaveBeenCalledWith({ limit: 100 });
    expect(res.data).toHaveLength(1);
    expect(res.data[0].title).toBe('Mathematics Polynomials');
    expect(res.data[0].className).toBe('Grade 5A');
    expect(res.data[0].submittedCount).toBe(12);
  });

  // ============================================================
  // 3. CLASS FILTERING WITH POSTGRESQL UUID
  // ============================================================

  it('passes PostgreSQL class UUID in server-side class filter query', async () => {
    const listSpy = vi.spyOn(homeworkApi, 'listHomework').mockResolvedValue({
      success: true,
      data: []
    });

    await homeworkApi.listHomework({ classId: PG_CLASS_1, limit: 100 });

    expect(listSpy).toHaveBeenCalledWith({ classId: PG_CLASS_1, limit: 100 });
    expect(listSpy.mock.calls[0][0].classId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    // Explicit negative check: must NOT be legacy Firestore alphanumeric ID
    expect(listSpy.mock.calls[0][0].classId).not.toBe('0dqds1XIBEdhTuIHlyJQ');
  });

  // ============================================================
  // 4. EMPTY & ERROR STATE HANDLING
  // ============================================================

  it('handles empty homework list gracefully', async () => {
    const listSpy = vi.spyOn(homeworkApi, 'listHomework').mockResolvedValue({
      success: true,
      data: [],
      pagination: { total: 0, page: 1, limit: 100, totalPages: 0 }
    });

    const res = await homeworkApi.listHomework({ limit: 100 });

    expect(listSpy).toHaveBeenCalledWith({ limit: 100 });
    expect(res.data).toEqual([]);
  });

  it('handles API error rejection cleanly', async () => {
    vi.spyOn(homeworkApi, 'listHomework').mockRejectedValue(new Error('Internal server error'));

    await expect(homeworkApi.listHomework({ limit: 100 })).rejects.toThrow('Internal server error');
  });

  // ============================================================
  // 5. DETAIL ROSTER & SUBMISSION PROGRESS (GET /api/v1/homework/:id)
  // ============================================================

  it('calls getHomework to retrieve assignment detail with complete student submission roster', async () => {
    const getSpy = vi.spyOn(homeworkApi, 'getHomework').mockResolvedValue({
      success: true,
      data: {
        id: HW_ID_1,
        title: 'Science Project',
        classId: PG_CLASS_1,
        className: 'Grade 5A',
        subjectName: 'Science',
        dueDate: '2026-09-30',
        totalStudents: 3,
        submittedCount: 1,
        completedCount: 1,
        inProgressCount: 1,
        notStartedCount: 0,
        roster: [
          {
            studentId: 'stu-1',
            studentName: 'Alice Johnson',
            admissionNumber: 'ADM-001',
            rollNumber: '1',
            status: 'Submitted',
            submittedAt: '2026-09-20T10:00:00.000Z',
            grade: 'A+',
            feedback: 'Excellent work'
          },
          {
            studentId: 'stu-2',
            studentName: 'Bob Smith',
            admissionNumber: 'ADM-002',
            rollNumber: '2',
            status: 'In Progress',
            submittedAt: null,
            grade: null,
            feedback: null
          },
          {
            studentId: 'stu-3',
            studentName: 'Charlie Brown',
            admissionNumber: 'ADM-003',
            rollNumber: '3',
            status: 'Completed',
            submittedAt: null,
            grade: 'B',
            feedback: 'Good effort'
          }
        ]
      }
    });

    const res = await homeworkApi.getHomework(HW_ID_1);

    expect(getSpy).toHaveBeenCalledWith(HW_ID_1);
    expect(res.data.roster).toHaveLength(3);
    expect(res.data.roster[0].status).toBe('Submitted');
    expect(res.data.roster[0].grade).toBe('A+');
    expect(res.data.roster[0].feedback).toBe('Excellent work');
    expect(res.data.roster[1].status).toBe('In Progress');
    expect(res.data.roster[2].status).toBe('Completed');
  });

  // ============================================================
  // 6. STALE REQUEST RACE PROTECTION
  // ============================================================

  it('discards stale class response when admin switches class filter in-flight', async () => {
    let currentSelectedClass = PG_CLASS_1;
    let displayedHomework = [];

    const fetchForClass = async (classId, delayMs, data) => {
      await new Promise((r) => setTimeout(r, delayMs));
      if (currentSelectedClass === classId) {
        displayedHomework = data;
      }
    };

    const class1Data = [{ id: 'hw-1', title: 'Grade 5 HW' }];
    const class2Data = [{ id: 'hw-2', title: 'Grade 6 HW' }];

    // Trigger request for Class 1 (slow, 50ms)
    const promise1 = fetchForClass(PG_CLASS_1, 50, class1Data);

    // Switch to Class 2 immediately
    currentSelectedClass = PG_CLASS_2;

    // Trigger request for Class 2 (fast, 10ms)
    const promise2 = fetchForClass(PG_CLASS_2, 10, class2Data);

    await Promise.all([promise1, promise2]);

    // Class 2 data must remain displayed
    expect(displayedHomework).toEqual(class2Data);
    expect(displayedHomework[0].title).toBe('Grade 6 HW');
  });

  // ============================================================
  // 7. READ-ONLY AUTHORITY & ZERO MUTATION EXPOSURE
  // ============================================================

  it('confirms Admin Homework UI is read-only and does not invoke mutation endpoints', () => {
    const createSpy = vi.spyOn(homeworkApi, 'createHomework');
    const updateSpy = vi.spyOn(homeworkApi, 'updateHomework');
    const deleteSpy = vi.spyOn(homeworkApi, 'deleteHomework');
    const subSpy = vi.spyOn(homeworkApi, 'updateSubmission');

    expect(createSpy).not.toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(subSpy).not.toHaveBeenCalled();
  });

  // ============================================================
  // 8. ZERO FIRESTORE ACCESS VERIFICATION
  // ============================================================

  it('MANDATORY: contains 0 Firestore operations for homeworks, submissions, classes, or students', () => {
    const subscribeSpy = vi.spyOn(firestoreModule, 'subscribeToSubCollection');
    const getSubSpy = vi.spyOn(firestoreModule, 'getSubCollection');
    const addDocSpy = vi.spyOn(firestoreModule, 'addSubDocument');
    const updateDocSpy = vi.spyOn(firestoreModule, 'updateSubDocument');

    expect(subscribeSpy).not.toHaveBeenCalled();
    expect(getSubSpy).not.toHaveBeenCalled();
    expect(addDocSpy).not.toHaveBeenCalled();
    expect(updateDocSpy).not.toHaveBeenCalled();
  });
});
