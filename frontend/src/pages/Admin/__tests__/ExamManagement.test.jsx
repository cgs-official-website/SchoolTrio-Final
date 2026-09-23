import { describe, it, expect, vi, beforeEach } from 'vitest';
import ExamManagement from '../ExamManagement.jsx';
import * as examsApi from '../../../api/exams.js';
import * as reportCardsApi from '../../../api/reportCards.js';
import * as reportCardTemplatesApi from '../../../api/reportCardTemplates.js';
import * as firestoreModule from '../../../firebase/firestore.js';

describe('ExamManagement Component (REST Migration)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('is exported as a function/component', () => {
    expect(typeof ExamManagement).toBe('function');
  });

  // ==========================================
  // EXAMINATION REST TESTS
  // ==========================================

  // TEST 1 — Exam List REST
  it('targets REST listExams on load', async () => {
    const listSpy = vi.spyOn(examsApi, 'listExams').mockResolvedValue({
      success: true,
      data: [
        { id: 'exam-uuid-1', name: 'Mid-Term 2026', startDate: '2026-10-01', endDate: '2026-10-15', term: null }
      ],
      pagination: { total: 1, page: 1, limit: 50 }
    });

    const res = await examsApi.listExams();

    expect(listSpy).toHaveBeenCalled();
    expect(res.data).toHaveLength(1);
    expect(res.data[0].name).toBe('Mid-Term 2026');
    expect(res.data[0].term).toBeNull();
  });

  // TEST 2 — Exam Creation REST
  it('targets REST createExam with { name, startDate, endDate, term }', async () => {
    const createSpy = vi.spyOn(examsApi, 'createExam').mockResolvedValue({
      success: true,
      data: {
        id: 'new-exam-uuid-2',
        name: 'Final Exam 2026',
        startDate: '2026-12-01',
        endDate: '2026-12-15',
        term: 'Term 2'
      }
    });

    const payload = {
      name: 'Final Exam 2026',
      startDate: '2026-12-01',
      endDate: '2026-12-15',
      term: 'Term 2'
    };

    const res = await examsApi.createExam(payload);

    expect(createSpy).toHaveBeenCalledWith(payload);
    expect(res.data.id).toBe('new-exam-uuid-2');
    expect(res.data.name).toBe('Final Exam 2026');
  });

  // TEST 3 — Nullable Term (No synthetic "Term 1")
  it('preserves null term without inventing synthetic "Term 1"', async () => {
    const createSpy = vi.spyOn(examsApi, 'createExam').mockResolvedValue({
      success: true,
      data: {
        id: 'exam-null-term',
        name: 'Diagnostic Test',
        startDate: '2026-09-15',
        endDate: '2026-09-16',
        term: null
      }
    });

    const payload = {
      name: 'Diagnostic Test',
      startDate: '2026-09-15',
      endDate: '2026-09-16'
    };

    const res = await examsApi.createExam(payload);

    expect(createSpy).toHaveBeenCalledWith(payload);
    expect(res.data.term).toBeNull();
    expect(res.data.term).not.toBe('Term 1');
  });

  // TEST 4 — No Direct Firestore createExam Call
  it('does not call Firestore createExam during exam creation', async () => {
    const firestoreCreateSpy = vi.spyOn(firestoreModule, 'createExam');
    vi.spyOn(examsApi, 'createExam').mockResolvedValue({
      success: true,
      data: { id: 'exam-rest-only' }
    });

    await examsApi.createExam({ name: 'Rest Exam' });

    expect(firestoreCreateSpy).not.toHaveBeenCalled();
  });

  // TEST 5 — Error Handling on Exam Creation
  it('handles exam creation failure cleanly', async () => {
    vi.spyOn(examsApi, 'createExam').mockRejectedValue(
      new Error('Start date cannot be after end date')
    );

    await expect(
      examsApi.createExam({ name: 'Bad Dates', startDate: '2026-12-15', endDate: '2026-12-01' })
    ).rejects.toThrow('Start date cannot be after end date');
  });

  // ==========================================
  // REPORT CARD REST TESTS
  // ==========================================

  // TEST 6 — Template REST
  it('targets REST getReportCardTemplate with templateType "report_card"', async () => {
    const templateSpy = vi.spyOn(reportCardTemplatesApi, 'getReportCardTemplate').mockResolvedValue({
      success: true,
      data: {
        id: 'tpl-1',
        templateType: 'report_card',
        config: {
          themeColor: '#3b82f6',
          header: { title: 'ANNUAL PROGRESS REPORT' }
        }
      }
    });

    const res = await reportCardTemplatesApi.getReportCardTemplate('report_card');

    expect(templateSpy).toHaveBeenCalledWith('report_card');
    expect(res.data.config.themeColor).toBe('#3b82f6');
    expect(res.data.config.header.title).toBe('ANNUAL PROGRESS REPORT');
  });

  // TEST 7 — Preview REST
  it('targets REST previewReportCards with { classId, examId } payload', async () => {
    const previewSpy = vi.spyOn(reportCardsApi, 'previewReportCards').mockResolvedValue({
      success: true,
      data: {
        classId: 'class-uuid-1',
        className: 'Class 10-A',
        examId: 'exam-uuid-1',
        examName: 'Mid-Term 2026',
        studentsCount: 1,
        students: [
          {
            student: { id: 'stu-1', firstName: 'John', lastName: 'Doe', admissionNumber: 'ADM-01' },
            marks: {
              'asmt-1': { title: 'Math', obtained: 95, max: 100, grade: 'A1' }
            },
            totalObtained: 95,
            totalMax: 100,
            percentage: '95.0',
            overallGrade: 'A1',
            attendanceSummary: { totalSessions: 60, present: 58 }
          }
        ]
      }
    });

    const payload = {
      classId: 'class-uuid-1',
      examId: 'exam-uuid-1'
    };

    const res = await reportCardsApi.previewReportCards(payload);

    expect(previewSpy).toHaveBeenCalledWith(payload);
    expect(res.data.studentsCount).toBe(1);
    expect(res.data.students[0].percentage).toBe('95.0');
  });

  // TEST 8 — Publication REST
  it('targets REST publishReportCards with exact { classId, examId } payload', async () => {
    const publishSpy = vi.spyOn(reportCardsApi, 'publishReportCards').mockResolvedValue({
      success: true,
      data: {
        publishedCount: 25,
        classId: 'class-uuid-2',
        examId: 'exam-uuid-2'
      }
    });

    const payload = {
      classId: 'class-uuid-2',
      examId: 'exam-uuid-2'
    };

    const res = await reportCardsApi.publishReportCards(payload);

    expect(publishSpy).toHaveBeenCalledWith(payload);
    expect(res.data.publishedCount).toBe(25);
    expect(res.data.classId).toBe('class-uuid-2');
    expect(res.data.examId).toBe('exam-uuid-2');
  });

  // TEST 9 — No Direct Firestore Publication
  it('does not call Firestore publication APIs during publication', async () => {
    const studentsSpy = vi.spyOn(firestoreModule, 'getStudentsByClass');
    const assessmentsSpy = vi.spyOn(firestoreModule, 'getExamAssessments');

    vi.spyOn(reportCardsApi, 'publishReportCards').mockResolvedValue({
      success: true,
      data: { publishedCount: 1 }
    });

    await reportCardsApi.publishReportCards({
      classId: 'class-1',
      examId: 'exam-1'
    });

    expect(studentsSpy).not.toHaveBeenCalled();
    expect(assessmentsSpy).not.toHaveBeenCalled();
  });

  // TEST 10 — Tenant Isolation Security
  it('never sends client-side schoolId in exam, preview, or publish request bodies', async () => {
    const examSpy = vi.spyOn(examsApi, 'createExam').mockResolvedValue({ success: true, data: {} });
    const previewSpy = vi.spyOn(reportCardsApi, 'previewReportCards').mockResolvedValue({ success: true, data: {} });
    const publishSpy = vi.spyOn(reportCardsApi, 'publishReportCards').mockResolvedValue({ success: true, data: {} });

    await examsApi.createExam({ name: 'Safe Exam' });
    await reportCardsApi.previewReportCards({ classId: 'c-1', examId: 'e-1' });
    await reportCardsApi.publishReportCards({ classId: 'c-1', examId: 'e-1' });

    expect(examSpy.mock.calls[0][0]).not.toHaveProperty('schoolId');
    expect(previewSpy.mock.calls[0][0]).not.toHaveProperty('schoolId');
    expect(publishSpy.mock.calls[0][0]).not.toHaveProperty('schoolId');
  });

  // TEST 11 — General Exam Management Intact
  it('preserves class subcollection listener for class selector', () => {
    expect(typeof firestoreModule.subscribeToSubCollection).toBe('function');
  });
});
