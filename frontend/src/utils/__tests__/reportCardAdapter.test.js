import { describe, it, expect } from 'vitest';
import {
  adaptReportCard,
  adaptReportCards,
  normalizeReportCardTemplate
} from '../reportCardAdapter.js';

describe('reportCardAdapter', () => {
  describe('adaptReportCard', () => {
    it('returns null for falsy or non-object inputs', () => {
      expect(adaptReportCard(null)).toBeNull();
      expect(adaptReportCard(undefined)).toBeNull();
      expect(adaptReportCard('invalid')).toBeNull();
      expect(adaptReportCard(123)).toBeNull();
    });

    it('adapts a formal report card DTO with full nested objects', () => {
      const backendDto = {
        id: 'rc-uuid-1234',
        schoolId: 'sch-uuid-5678',
        studentId: 'stu-uuid-9999',
        title: 'Mid-Term Exam 2026',
        term: 'TERM_1',
        examId: 'exam-uuid-4321',
        marksData: {
          marks: {
            'asmt-1': { title: 'Maths Quiz', obtained: 45, max: 50, grade: 'A1' },
            'asmt-2': { title: 'Science Test', obtained: 40, max: 50, grade: 'A2' }
          },
          publishedBy: 'Mr. Teacher'
        },
        grades: {
          totalObtained: 85,
          totalMax: 100,
          percentage: 85.0,
          overallGrade: 'A2',
          subjectGrades: { 'asmt-1': 'A1', 'asmt-2': 'A2' }
        },
        attendanceSummary: {
          totalSessions: 100,
          present: 95,
          late: 2,
          absent: 3,
          percentage: 97
        },
        publishedAt: '2026-09-10T12:00:00.000Z',
        student: {
          id: 'stu-uuid-9999',
          firstName: 'Alice',
          lastName: 'Smith',
          admissionNumber: 'ADM-2026-001',
          rollNumber: '12',
          classId: 'cls-uuid-1111',
          className: 'Class 10-A',
          sectionName: 'A'
        },
        templateConfigSnapshot: {
          themeColor: '#4f46e5',
          header: { title: 'OFFICIAL REPORT' }
        }
      };

      const result = adaptReportCard(backendDto);

      expect(result).toEqual({
        id: 'rc-uuid-1234',
        examId: 'exam-uuid-4321',
        examName: 'Mid-Term Exam 2026',
        classId: 'cls-uuid-1111',
        className: 'Class 10-A',
        studentId: 'stu-uuid-9999',
        studentName: 'Alice Smith',
        marks: {
          'asmt-1': { title: 'Maths Quiz', obtained: 45, max: 50, grade: 'A1' },
          'asmt-2': { title: 'Science Test', obtained: 40, max: 50, grade: 'A2' }
        },
        totalObtained: 85,
        totalMax: 100,
        percentage: 85.0,
        publishedAt: '2026-09-10T12:00:00.000Z',
        publishedBy: 'Mr. Teacher',
        reportTemplate: {
          themeColor: '#4f46e5',
          header: { title: 'OFFICIAL REPORT' }
        },
        attendanceSummary: {
          totalSessions: 100,
          present: 95,
          late: 2,
          absent: 3,
          percentage: 97
        },
        grades: {
          totalObtained: 85,
          totalMax: 100,
          percentage: 85.0,
          overallGrade: 'A2',
          subjectGrades: { 'asmt-1': 'A1', 'asmt-2': 'A2' }
        },
        term: 'TERM_1',
        title: 'Mid-Term Exam 2026'
      });
    });

    it('adapts a continuous report card (examId === null) without creating synthetic IDs', () => {
      const continuousDto = {
        id: 'rc-cont-uuid-8888',
        schoolId: 'sch-uuid-5678',
        studentId: 'stu-uuid-9999',
        title: 'Class Assessments Summary',
        term: null,
        examId: null,
        marksData: {
          classId: 'cls-uuid-1111',
          className: 'Class 8-B',
          studentId: 'stu-uuid-9999',
          studentName: 'Bob Jones',
          marks: {
            'asmt-10': { title: 'Weekly Quiz', obtained: 20, max: 25 }
          },
          totalObtained: 20,
          totalMax: 25,
          percentage: '80.0',
          reportTemplate: { themeColor: '#3b82f6' },
          publishedBy: 'Class Teacher'
        },
        grades: {
          totalObtained: 20,
          totalMax: 25,
          percentage: 80.0
        },
        attendanceSummary: null,
        publishedAt: '2026-09-11T08:00:00.000Z'
      };

      const result = adaptReportCard(continuousDto);

      expect(result.id).toBe('rc-cont-uuid-8888');
      expect(result.examId).toBeNull(); // Must remain null, NOT synthetic string
      expect(result.examName).toBe('Class Assessments Summary');
      expect(result.className).toBe('Class 8-B');
      expect(result.studentName).toBe('Bob Jones');
      expect(result.totalObtained).toBe(20);
      expect(result.totalMax).toBe(25);
      expect(result.percentage).toBe(80.0);
      expect(result.reportTemplate).toEqual({ themeColor: '#3b82f6' });
    });

    it('does NOT recalculate values and preserves backend authoritative calculations', () => {
      // Inconsistent on purpose to prove adapter does not re-compute
      const inconsistentDto = {
        id: 'rc-1',
        examId: 'exam-1',
        grades: {
          totalObtained: 77,
          totalMax: 100,
          percentage: 99.9 // Intentional mismatch
        }
      };

      const result = adaptReportCard(inconsistentDto);

      expect(result.totalObtained).toBe(77);
      expect(result.totalMax).toBe(100);
      expect(result.percentage).toBe(99.9); // Preserved exactly as supplied
    });

    it('does not mutate the input DTO object (immutability check)', () => {
      const originalDto = Object.freeze({
        id: 'rc-freeze',
        examId: 'exam-freeze',
        title: 'Immutable Exam',
        marksData: Object.freeze({
          marks: Object.freeze({
            'asmt-1': Object.freeze({ obtained: 50, max: 50 })
          })
        }),
        grades: Object.freeze({ totalObtained: 50, totalMax: 50, percentage: 100 }),
        student: Object.freeze({ firstName: 'Frozen', lastName: 'Student' })
      });

      const cloneBefore = JSON.parse(JSON.stringify(originalDto));
      const result = adaptReportCard(originalDto);

      expect(JSON.parse(JSON.stringify(originalDto))).toEqual(cloneBefore);
      expect(result.studentName).toBe('Frozen Student');
      expect(result.percentage).toBe(100);
    });

    it('handles flat preview card DTO format gracefully', () => {
      const previewCard = {
        title: 'Term 1 Preview',
        term: 'TERM_1',
        examId: 'exam-preview-1',
        student: {
          id: 'stu-prev',
          firstName: 'Charlie',
          lastName: 'Brown',
          admissionNumber: 'ADM-007'
        },
        marksData: {
          classId: 'cls-prev',
          className: 'Class 5-C',
          marks: { 'asmt-prev': { title: 'Drawing', obtained: 95, max: 100 } },
          totalObtained: 95,
          totalMax: 100,
          percentage: '95.0'
        },
        grades: {
          totalObtained: 95,
          totalMax: 100,
          percentage: 95.0
        },
        attendanceSummary: {
          totalSessions: 50,
          present: 48,
          percentage: 96
        }
      };

      const result = adaptReportCard(previewCard);

      expect(result.id).toBe('');
      expect(result.examId).toBe('exam-preview-1');
      expect(result.examName).toBe('Term 1 Preview');
      expect(result.studentName).toBe('Charlie Brown');
      expect(result.studentId).toBe('stu-prev');
      expect(result.className).toBe('Class 5-C');
      expect(result.totalObtained).toBe(95);
      expect(result.attendanceSummary.present).toBe(48);
    });
  });

  describe('adaptReportCards', () => {
    it('returns empty array for non-array inputs', () => {
      expect(adaptReportCards(null)).toEqual([]);
      expect(adaptReportCards(undefined)).toEqual([]);
      expect(adaptReportCards('not-an-array')).toEqual([]);
      expect(adaptReportCards({})).toEqual([]);
    });

    it('adapts each report card in the list', () => {
      const list = [
        { id: 'rc-1', title: 'Exam 1', grades: { percentage: 80 } },
        { id: 'rc-2', title: 'Exam 2', grades: { percentage: 90 } },
        null // Null item should be filtered out
      ];

      const results = adaptReportCards(list);

      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('rc-1');
      expect(results[0].percentage).toBe(80);
      expect(results[1].id).toBe('rc-2');
      expect(results[1].percentage).toBe(90);
    });
  });

  describe('normalizeReportCardTemplate', () => {
    it('returns null for null or invalid inputs', () => {
      expect(normalizeReportCardTemplate(null)).toBeNull();
      expect(normalizeReportCardTemplate(undefined)).toBeNull();
    });

    it('normalizes a partial template config with defaults for missing subfields', () => {
      const partialConfig = {
        themeColor: '#10b981',
        header: {
          title: 'CUSTOM TITLE'
        }
      };

      const normalized = normalizeReportCardTemplate(partialConfig);

      expect(normalized.themeColor).toBe('#10b981');
      expect(normalized.header.title).toBe('CUSTOM TITLE');
      expect(normalized.header.showLogo).toBe(true);
      expect(normalized.header.subtitle).toBe('Academic Performance Record');
      expect(normalized.studentFields.admissionNo).toBe(true);
      expect(normalized.grading.style).toBe('marks_and_grades');
      expect(normalized.footer.signatures).toEqual(['Class Teacher', 'Principal', 'Parent']);
    });
  });
});
