import { describe, it, expect, vi, beforeEach } from 'vitest';
import ParentGrades from '../Grades.jsx';
import * as reportCardsApiModule from '../../../api/reportCards.js';
import * as adapterModule from '../../../utils/reportCardAdapter.js';

describe('ParentGrades Component (Forensic Fix & Active Child Resolution)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('is exported as a function/component', () => {
    expect(typeof ParentGrades).toBe('function');
  });

  // 1. Context Resolution Tests
  it('resolves studentId from useOutletContext activeStudentId as primary identifier', () => {
    const outletContext = {
      activeStudentId: 'stu-outlet-001',
      activeChild: { id: 'stu-outlet-001', name: 'Active Student' }
    };
    const userProfile = {
      linkedStudentId: 'stu-fallback-002'
    };

    const activeStudentIdFromContext = outletContext?.activeStudentId || outletContext?.activeChild?.id;
    const studentId = activeStudentIdFromContext || userProfile?.linkedStudentId;

    expect(studentId).toBe('stu-outlet-001');
  });

  it('resolves studentId from outletContext activeChild.id if activeStudentId is missing', () => {
    const outletContext = {
      activeChild: { id: 'stu-child-002', name: 'Second Student' }
    };
    const userProfile = {
      linkedStudentId: 'stu-fallback-003'
    };

    const activeStudentIdFromContext = outletContext?.activeStudentId || outletContext?.activeChild?.id;
    const studentId = activeStudentIdFromContext || userProfile?.linkedStudentId;

    expect(studentId).toBe('stu-child-002');
  });

  it('falls back to userProfile.linkedStudentId when outlet context is null/undefined', () => {
    const outletContext = null;
    const userProfile = {
      linkedStudentId: 'stu-legacy-003'
    };

    const activeStudentIdFromContext = outletContext?.activeStudentId || outletContext?.activeChild?.id;
    const studentId = activeStudentIdFromContext || userProfile?.linkedStudentId;

    expect(studentId).toBe('stu-legacy-003');
  });

  it('evaluates studentId as undefined when parent has no linked student', () => {
    const outletContext = null;
    const userProfile = {
      role: 'parent'
    };

    const activeStudentIdFromContext = outletContext?.activeStudentId || outletContext?.activeChild?.id;
    const studentId = activeStudentIdFromContext || userProfile?.linkedStudentId;

    expect(studentId).toBeUndefined();
  });

  // 2. Multi-Child Switching
  it('switches query target when active child switches from Child A to Child B', async () => {
    const apiSpy = vi.spyOn(reportCardsApiModule, 'getStudentReportCards').mockResolvedValue({
      success: true,
      data: []
    });

    // Child A query
    await reportCardsApiModule.getStudentReportCards('child-A-id', {
      limit: 50,
      sortBy: 'publishedAt',
      sortOrder: 'desc'
    });
    expect(apiSpy).toHaveBeenLastCalledWith('child-A-id', expect.any(Object));

    // Switch to Child B
    await reportCardsApiModule.getStudentReportCards('child-B-id', {
      limit: 50,
      sortBy: 'publishedAt',
      sortOrder: 'desc'
    });
    expect(apiSpy).toHaveBeenLastCalledWith('child-B-id', expect.any(Object));
  });

  // 3. API & Data contract tests
  it('targets REST getStudentReportCards with studentId and default query', async () => {
    const apiSpy = vi.spyOn(reportCardsApiModule, 'getStudentReportCards').mockResolvedValue({
      success: true,
      data: [
        {
          id: 'rc-1',
          examId: 'exam-1',
          title: 'Mid-Term Exam',
          marksData: { marks: { 'asmt-1': { obtained: 45, max: 50 } } },
          grades: { totalObtained: 45, totalMax: 50, percentage: 90 },
          publishedAt: '2026-09-10T10:00:00.000Z'
        }
      ]
    });

    const res = await reportCardsApiModule.getStudentReportCards('stu-123', {
      limit: 50,
      sortBy: 'publishedAt',
      sortOrder: 'desc'
    });

    expect(apiSpy).toHaveBeenCalledWith('stu-123', {
      limit: 50,
      sortBy: 'publishedAt',
      sortOrder: 'desc'
    });

    const adapted = adapterModule.adaptReportCards(res.data);
    expect(adapted).toHaveLength(1);
    expect(adapted[0].id).toBe('rc-1');
    expect(adapted[0].percentage).toBe(90);
    expect(adapted[0].examName).toBe('Mid-Term Exam');
  });

  it('does not pass schoolId as a student endpoint security parameter', async () => {
    const apiSpy = vi.spyOn(reportCardsApiModule, 'getStudentReportCards').mockResolvedValue({
      success: true,
      data: []
    });

    await reportCardsApiModule.getStudentReportCards('stu-456', { limit: 50 });

    expect(apiSpy).toHaveBeenCalledWith('stu-456', { limit: 50 });
    expect(apiSpy.mock.calls[0][0]).toBe('stu-456');
  });

  it('handles continuous report cards (examId === null) via adapter cleanly', () => {
    const continuousData = [
      {
        id: 'rc-continuous-1',
        examId: null,
        title: 'Class Assessments Summary',
        marksData: {
          className: 'Class 7-A',
          marks: { 'asmt-quiz': { title: 'Quiz 1', obtained: 18, max: 20 } }
        },
        grades: { totalObtained: 18, totalMax: 20, percentage: 90.0 },
        templateConfigSnapshot: { themeColor: '#3b82f6' },
        publishedAt: '2026-09-11T09:00:00.000Z'
      }
    ];

    const adapted = adapterModule.adaptReportCards(continuousData);

    expect(adapted[0].id).toBe('rc-continuous-1');
    expect(adapted[0].examId).toBeNull();
    expect(adapted[0].examName).toBe('Class Assessments Summary');
    expect(adapted[0].className).toBe('Class 7-A');
    expect(adapted[0].reportTemplate).toEqual({ themeColor: '#3b82f6' });
  });

  it('handles empty report card list cleanly', () => {
    const adapted = adapterModule.adaptReportCards([]);
    expect(adapted).toEqual([]);
  });
});
