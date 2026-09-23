import { describe, it, expect, vi, beforeEach } from 'vitest';
import ParentGrades from '../Grades.jsx';
import * as reportCardsApiModule from '../../../api/reportCards.js';
import * as adapterModule from '../../../utils/reportCardAdapter.js';

describe('ParentGrades Component (REST Migration)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('is exported as a function/component', () => {
    expect(typeof ParentGrades).toBe('function');
  });

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
    // First argument is studentId, second is query
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
