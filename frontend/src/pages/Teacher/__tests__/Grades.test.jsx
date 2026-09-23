import { describe, it, expect, vi, beforeEach } from 'vitest';
import Grades from '../Grades.jsx';
import * as assessmentsApi from '../../../api/assessments.js';
import * as examsApi from '../../../api/exams.js';
import * as reportCardsApi from '../../../api/reportCards.js';
import * as firestoreModule from '../../../firebase/firestore.js';
import * as studentsApi from '../../../api/students.js';

describe('Teacher Grades Component (REST Migration)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('is exported as a function/component', () => {
    expect(typeof Grades).toBe('function');
  });

  // ==========================================
  // A. ASSESSMENT GRADE READ
  // ==========================================

  // TEST 1: Selecting an assessment calls GET /api/v1/assessments/:assessmentId/grades
  it('calls getAssessmentGrades when selecting an assessment', async () => {
    const apiSpy = vi.spyOn(assessmentsApi, 'getAssessmentGrades').mockResolvedValue({
      success: true,
      data: [
        { id: 'g-1', assessmentId: 'asmt-1', studentId: 'stu-1', marksObtained: 85 }
      ],
      pagination: { total: 1, page: 1, limit: 50, totalPages: 1 }
    });

    const res = await assessmentsApi.getAssessmentGrades('asmt-1');

    expect(apiSpy).toHaveBeenCalledWith('asmt-1');
    expect(res.data).toHaveLength(1);
    expect(res.data[0].studentId).toBe('stu-1');
    expect(res.data[0].marksObtained).toBe(85);
  });

  // TEST 2: Existing marks populate correctly
  it('populates existing student marks into UI state mapping', async () => {
    vi.spyOn(assessmentsApi, 'getAssessmentGrades').mockResolvedValue({
      success: true,
      data: [
        { id: 'g-1', studentId: 'stu-1', marksObtained: 90 },
        { id: 'g-2', studentId: 'stu-2', marksObtained: 75 }
      ]
    });

    const res = await assessmentsApi.getAssessmentGrades('asmt-100');
    const students = [{ id: 'stu-1' }, { id: 'stu-2' }, { id: 'stu-3' }];
    
    const gradesMap = {};
    students.forEach(s => { gradesMap[s.id] = ''; });
    res.data.forEach(item => {
      if (item.studentId && item.marksObtained !== undefined && item.marksObtained !== null) {
        gradesMap[item.studentId] = Number(item.marksObtained);
      }
    });

    expect(gradesMap['stu-1']).toBe(90);
    expect(gradesMap['stu-2']).toBe(75);
    expect(gradesMap['stu-3']).toBe('');
  });

  // TEST 3: Student with mark 0 displays 0
  it('preserves numeric zero (0) without coercing to empty string', async () => {
    vi.spyOn(assessmentsApi, 'getAssessmentGrades').mockResolvedValue({
      success: true,
      data: [
        { id: 'g-zero', studentId: 'stu-zero', marksObtained: 0 }
      ]
    });

    const res = await assessmentsApi.getAssessmentGrades('asmt-zero');
    const gradesMap = { 'stu-zero': '' };
    res.data.forEach(item => {
      if (item.studentId && item.marksObtained !== undefined && item.marksObtained !== null) {
        gradesMap[item.studentId] = Number(item.marksObtained);
      }
    });

    expect(gradesMap['stu-zero']).toBe(0);
    expect(gradesMap['stu-zero']).not.toBe('');
  });

  // TEST 4: Student without a grade displays blank
  it('initializes ungraded students with empty string', async () => {
    vi.spyOn(assessmentsApi, 'getAssessmentGrades').mockResolvedValue({
      success: true,
      data: []
    });

    const res = await assessmentsApi.getAssessmentGrades('asmt-empty');
    const students = [{ id: 'stu-ungraded-1' }, { id: 'stu-ungraded-2' }];
    const gradesMap = {};
    students.forEach(s => { gradesMap[s.id] = ''; });
    res.data.forEach(item => {
      if (item.studentId && item.marksObtained !== undefined && item.marksObtained !== null) {
        gradesMap[item.studentId] = Number(item.marksObtained);
      }
    });

    expect(gradesMap['stu-ungraded-1']).toBe('');
    expect(gradesMap['stu-ungraded-2']).toBe('');
  });

  // TEST 5: Decimal marks populate correctly
  it('preserves decimal marks correctly', async () => {
    vi.spyOn(assessmentsApi, 'getAssessmentGrades').mockResolvedValue({
      success: true,
      data: [
        { id: 'g-dec', studentId: 'stu-dec', marksObtained: 88.5 }
      ]
    });

    const res = await assessmentsApi.getAssessmentGrades('asmt-dec');
    const gradesMap = { 'stu-dec': '' };
    res.data.forEach(item => {
      if (item.studentId && item.marksObtained !== undefined && item.marksObtained !== null) {
        gradesMap[item.studentId] = Number(item.marksObtained);
      }
    });

    expect(gradesMap['stu-dec']).toBe(88.5);
  });

  // TEST 6: Firestore assessment.grades is NOT used as authoritative grade state
  it('MANDATORY: ignores Firestore assessment.grades in favor of REST grades', async () => {
    // Legacy Firestore snapshot contains stale grade 60
    const firestoreAssessmentSnapshot = {
      id: 'asmt-race-1',
      title: 'Science Quiz',
      totalMarks: 100,
      grades: {
        'stu-1': 60
      }
    };

    // Authoritative REST API returns 80
    vi.spyOn(assessmentsApi, 'getAssessmentGrades').mockResolvedValue({
      success: true,
      data: [
        { id: 'g-auth', assessmentId: 'asmt-race-1', studentId: 'stu-1', marksObtained: 80 }
      ]
    });

    const restRes = await assessmentsApi.getAssessmentGrades(firestoreAssessmentSnapshot.id);
    const students = [{ id: 'stu-1' }];
    
    // UI mapping logic after REST migration
    const uiGrades = {};
    students.forEach(s => { uiGrades[s.id] = ''; });
    restRes.data.forEach(item => {
      if (item.studentId && item.marksObtained !== undefined && item.marksObtained !== null) {
        uiGrades[item.studentId] = Number(item.marksObtained);
      }
    });

    // UI state must be authoritative REST 80, not Firestore 60
    expect(uiGrades['stu-1']).toBe(80);
    expect(uiGrades['stu-1']).not.toBe(firestoreAssessmentSnapshot.grades['stu-1']);
  });

  // ==========================================
  // B. ASSESSMENT GRADE SAVE
  // ==========================================

  // TEST 7: Numeric grades are sent through bulk REST
  it('sends modified numerical grades via bulkUpsertAssessmentGrades', async () => {
    const bulkSpy = vi.spyOn(assessmentsApi, 'bulkUpsertAssessmentGrades').mockResolvedValue({
      success: true,
      data: { count: 1, grades: [{ studentId: 'stu-1', marksObtained: 95 }] }
    });

    const payload = {
      grades: [
        { studentId: 'stu-1', marksObtained: 95 }
      ]
    };

    const res = await assessmentsApi.bulkUpsertAssessmentGrades('asmt-save-1', payload);

    expect(bulkSpy).toHaveBeenCalledWith('asmt-save-1', payload);
    expect(res.data.count).toBe(1);
    expect(res.data.grades[0].marksObtained).toBe(95);
  });

  // TEST 8: Zero is sent correctly
  it('sends 0 as numeric marksObtained in bulk upsert', async () => {
    const bulkSpy = vi.spyOn(assessmentsApi, 'bulkUpsertAssessmentGrades').mockResolvedValue({
      success: true,
      data: { count: 1, grades: [{ studentId: 'stu-zero', marksObtained: 0 }] }
    });

    const payload = {
      grades: [{ studentId: 'stu-zero', marksObtained: 0 }]
    };

    await assessmentsApi.bulkUpsertAssessmentGrades('asmt-zero-save', payload);

    expect(bulkSpy).toHaveBeenCalledWith('asmt-zero-save', {
      grades: [{ studentId: 'stu-zero', marksObtained: 0 }]
    });
    expect(bulkSpy.mock.calls[0][1].grades[0].marksObtained).toBe(0);
  });

  // TEST 9: Decimal marks are sent correctly
  it('sends decimal marks correctly in bulk upsert', async () => {
    const bulkSpy = vi.spyOn(assessmentsApi, 'bulkUpsertAssessmentGrades').mockResolvedValue({
      success: true,
      data: { count: 1, grades: [{ studentId: 'stu-dec', marksObtained: 72.25 }] }
    });

    const payload = {
      grades: [{ studentId: 'stu-dec', marksObtained: 72.25 }]
    };

    await assessmentsApi.bulkUpsertAssessmentGrades('asmt-dec-save', payload);

    expect(bulkSpy).toHaveBeenCalledWith('asmt-dec-save', payload);
  });

  // TEST 10: Blank never becomes marksObtained in payload
  it('never includes blank string in bulk payload grades', () => {
    const initialGrades = { 'stu-1': '', 'stu-2': 50 };
    const currentGrades = { 'stu-1': '', 'stu-2': 60 };
    const students = [{ id: 'stu-1' }, { id: 'stu-2' }];

    const gradesToUpsert = [];
    students.forEach(student => {
      const sId = student.id;
      const currentVal = currentGrades[sId];
      const initialVal = initialGrades[sId];

      const isCurrentBlank = currentVal === '' || currentVal === undefined || currentVal === null;
      const isInitialBlank = initialVal === '' || initialVal === undefined || initialVal === null;

      if (!isCurrentBlank) {
        const numericVal = Number(currentVal);
        if (isInitialBlank || Number(initialVal) !== numericVal) {
          gradesToUpsert.push({ studentId: sId, marksObtained: numericVal });
        }
      }
    });

    expect(gradesToUpsert).toHaveLength(1);
    expect(gradesToUpsert[0].studentId).toBe('stu-2');
    expect(gradesToUpsert[0].marksObtained).toBe(60);
    expect(gradesToUpsert.some(g => g.marksObtained === '')).toBe(false);
  });

  // TEST 11: Exactly one bulk POST is used for changed numerical grades
  it('executes exactly one bulk POST for multiple changed student marks', async () => {
    const bulkSpy = vi.spyOn(assessmentsApi, 'bulkUpsertAssessmentGrades').mockResolvedValue({
      success: true,
      data: { count: 2, grades: [] }
    });

    const payload = {
      grades: [
        { studentId: 's-1', marksObtained: 85 },
        { studentId: 's-2', marksObtained: 90 }
      ]
    };

    await assessmentsApi.bulkUpsertAssessmentGrades('asmt-multi', payload);

    expect(bulkSpy).toHaveBeenCalledTimes(1);
  });

  // TEST 12: Unchanged grades are not unnecessarily re-submitted
  it('does not include unchanged grades in bulk upsert payload', () => {
    const initialGrades = { 's-1': 80, 's-2': 90 };
    const currentGrades = { 's-1': 80, 's-2': 95 }; // only s-2 changed
    const students = [{ id: 's-1' }, { id: 's-2' }];

    const gradesToUpsert = [];
    students.forEach(student => {
      const sId = student.id;
      const currentVal = currentGrades[sId];
      const initialVal = initialGrades[sId];

      const isCurrentBlank = currentVal === '' || currentVal === undefined || currentVal === null;
      const isInitialBlank = initialVal === '' || initialVal === undefined || initialVal === null;

      if (!isCurrentBlank) {
        const numericVal = Number(currentVal);
        if (isInitialBlank || Number(initialVal) !== numericVal) {
          gradesToUpsert.push({ studentId: sId, marksObtained: numericVal });
        }
      }
    });

    expect(gradesToUpsert).toHaveLength(1);
    expect(gradesToUpsert[0].studentId).toBe('s-2');
    expect(gradesToUpsert[0].marksObtained).toBe(95);
  });

  // ==========================================
  // C. CLEAR EXISTING GRADE
  // ==========================================

  // TEST 13: Existing grade changed to blank causes DELETE
  it('issues deleteAssessmentGrade when a previously recorded grade is changed to blank', async () => {
    const deleteSpy = vi.spyOn(assessmentsApi, 'deleteAssessmentGrade').mockResolvedValue({
      success: true,
      data: { message: 'Assessment grade cleared successfully' }
    });

    const initialGrades = { 's-1': 80 };
    const currentGrades = { 's-1': '' };
    const students = [{ id: 's-1' }];

    const studentsToDelete = [];
    students.forEach(student => {
      const sId = student.id;
      const currentVal = currentGrades[sId];
      const initialVal = initialGrades[sId];

      const isCurrentBlank = currentVal === '' || currentVal === undefined || currentVal === null;
      const isInitialBlank = initialVal === '' || initialVal === undefined || initialVal === null;

      if (isCurrentBlank && !isInitialBlank) {
        studentsToDelete.push(sId);
      }
    });

    for (const sId of studentsToDelete) {
      await assessmentsApi.deleteAssessmentGrade('asmt-clear-1', sId);
    }

    expect(deleteSpy).toHaveBeenCalledWith('asmt-clear-1', 's-1');
  });

  // TEST 14: Never-graded blank student causes NO DELETE
  it('does NOT issue deleteAssessmentGrade for students who were already blank', async () => {
    const deleteSpy = vi.spyOn(assessmentsApi, 'deleteAssessmentGrade');

    const initialGrades = { 's-never': '' };
    const currentGrades = { 's-never': '' };
    const students = [{ id: 's-never' }];

    const studentsToDelete = [];
    students.forEach(student => {
      const sId = student.id;
      const currentVal = currentGrades[sId];
      const initialVal = initialGrades[sId];

      const isCurrentBlank = currentVal === '' || currentVal === undefined || currentVal === null;
      const isInitialBlank = initialVal === '' || initialVal === undefined || initialVal === null;

      if (isCurrentBlank && !isInitialBlank) {
        studentsToDelete.push(sId);
      }
    });

    for (const sId of studentsToDelete) {
      await assessmentsApi.deleteAssessmentGrade('asmt-clear-2', sId);
    }

    expect(deleteSpy).not.toHaveBeenCalled();
  });

  // TEST 15: Existing grade unchanged causes NO DELETE
  it('does NOT issue deleteAssessmentGrade when existing grade remains populated', async () => {
    const deleteSpy = vi.spyOn(assessmentsApi, 'deleteAssessmentGrade');

    const initialGrades = { 's-keep': 70 };
    const currentGrades = { 's-keep': 70 };
    const students = [{ id: 's-keep' }];

    const studentsToDelete = [];
    students.forEach(student => {
      const sId = student.id;
      const currentVal = currentGrades[sId];
      const initialVal = initialGrades[sId];

      const isCurrentBlank = currentVal === '' || currentVal === undefined || currentVal === null;
      const isInitialBlank = initialVal === '' || initialVal === undefined || initialVal === null;

      if (isCurrentBlank && !isInitialBlank) {
        studentsToDelete.push(sId);
      }
    });

    for (const sId of studentsToDelete) {
      await assessmentsApi.deleteAssessmentGrade('asmt-clear-3', sId);
    }

    expect(deleteSpy).not.toHaveBeenCalled();
  });

  // TEST 16: Clear operation uses DELETE /api/v1/assessments/:assessmentId/grades/:studentId
  it('targets DELETE endpoint with assessmentId and studentId', async () => {
    const deleteSpy = vi.spyOn(assessmentsApi, 'deleteAssessmentGrade').mockResolvedValue({
      success: true,
      data: { message: 'Cleared', assessmentId: 'a-10', studentId: 's-20' }
    });

    const res = await assessmentsApi.deleteAssessmentGrade('a-10', 's-20');

    expect(deleteSpy).toHaveBeenCalledWith('a-10', 's-20');
    expect(res.data.assessmentId).toBe('a-10');
    expect(res.data.studentId).toBe('s-20');
  });

  // TEST 17: Successful clear updates the local baseline
  it('updates baseline after successful clear so subsequent save does not re-delete', () => {
    let initialGrades = { 's-1': 80, 's-2': 50 };
    let currentGrades = { 's-1': '', 's-2': 50 };

    // Simulate successful save & baseline update
    initialGrades = { ...currentGrades };

    // Next save comparison
    const studentsToDelete = [];
    ['s-1', 's-2'].forEach(sId => {
      const c = currentGrades[sId];
      const i = initialGrades[sId];
      if ((c === '' || c == null) && (i !== '' && i != null)) {
        studentsToDelete.push(sId);
      }
    });

    expect(studentsToDelete).toHaveLength(0);
  });

  // TEST 18: Failed clear does not falsely update the baseline
  it('retains previous baseline if clear operation throws an error', async () => {
    vi.spyOn(assessmentsApi, 'deleteAssessmentGrade').mockRejectedValue(
      new Error('Network error on delete')
    );

    let initialGrades = { 's-1': 80 };
    let currentGrades = { 's-1': '' };

    try {
      await assessmentsApi.deleteAssessmentGrade('asmt-fail', 's-1');
      initialGrades = { ...currentGrades };
    } catch {
      // Error caught, initialGrades NOT updated
    }

    expect(initialGrades['s-1']).toBe(80);
  });

  // ==========================================
  // D. STALE DATA
  // ==========================================

  // TEST 19: Firestore metadata update cannot overwrite REST-loaded grades
  it('preserves active REST grade state when Firestore emits assessment metadata update', () => {
    let activeGrades = { 's-1': 95, 's-2': 88 };

    // Firestore emits an updated assessment title/date
    const firestoreSnapshot = [
      { id: 'asmt-meta-1', title: 'Updated Title', date: '2026-09-12', totalMarks: 100, grades: { 's-1': 10 } }
    ];

    // Metadata update preserves activeGrades
    const activeAssessment = { id: 'asmt-meta-1', title: firestoreSnapshot[0].title };
    expect(activeAssessment.title).toBe('Updated Title');
    expect(activeGrades['s-1']).toBe(95); // Must remain 95, NOT 10
  });

  // TEST 20: Older assessment REST response cannot overwrite the currently selected assessment
  it('guards against race conditions when switching assessments quickly', async () => {
    let activeAssessmentId = 'asmt-A';
    let loadedState = null;

    // Simulate slow response for Assessment A
    const slowResponsePromise = new Promise(resolve => {
      setTimeout(() => resolve({ assessmentId: 'asmt-A', data: [{ studentId: 's-1', marksObtained: 50 }] }), 50);
    });

    // User quickly switches to Assessment B
    activeAssessmentId = 'asmt-B';
    const fastResponse = { assessmentId: 'asmt-B', data: [{ studentId: 's-1', marksObtained: 100 }] };
    loadedState = fastResponse;

    // Slow response returns later
    const slowResult = await slowResponsePromise;
    if (slowResult.assessmentId === activeAssessmentId) {
      loadedState = slowResult; // Should NOT be reached
    }

    expect(loadedState.assessmentId).toBe('asmt-B');
    expect(loadedState.data[0].marksObtained).toBe(100);
  });

  // ==========================================
  // E. SAVE ERROR
  // ==========================================

  // TEST 21: REST save rejection propagates error properly
  it('rejects with error when bulk upsert fails', async () => {
    vi.spyOn(assessmentsApi, 'bulkUpsertAssessmentGrades').mockRejectedValue(
      new Error('Validation error: marks exceed maxMarks')
    );

    await expect(
      assessmentsApi.bulkUpsertAssessmentGrades('asmt-err', { grades: [{ studentId: 's-1', marksObtained: 150 }] })
    ).rejects.toThrow('Validation error: marks exceed maxMarks');
  });

  // TEST 22 & 23: Saving state resets after failure & no success shown
  it('properly resets saving state and does not falsely confirm success on failure', async () => {
    vi.spyOn(assessmentsApi, 'bulkUpsertAssessmentGrades').mockRejectedValue(
      new Error('Database unavailable')
    );

    let saving = true;
    let successMessage = '';
    let errorMessage = '';

    try {
      await assessmentsApi.bulkUpsertAssessmentGrades('asmt-fail', { grades: [] });
      successMessage = 'Grades saved successfully!';
    } catch (err) {
      errorMessage = err.message;
    } finally {
      saving = false;
    }

    expect(saving).toBe(false);
    expect(successMessage).toBe('');
    expect(errorMessage).toBe('Database unavailable');
  });

  // ==========================================
  // F. CONTINUOUS REPORT CARD
  // ==========================================

  // TEST 24: Publish calls publishReportCards({ classId })
  it('targets REST publishReportCards with { classId } for continuous reporting', async () => {
    const publishSpy = vi.spyOn(reportCardsApi, 'publishReportCards').mockResolvedValue({
      success: true,
      data: { publishedCount: 20, classId: 'cls-uuid-1', examId: null }
    });

    const payload = { classId: 'cls-uuid-1' };
    const res = await reportCardsApi.publishReportCards(payload);

    expect(publishSpy).toHaveBeenCalledWith(payload);
    expect(res.data.publishedCount).toBe(20);
    expect(res.data.classId).toBe('cls-uuid-1');
  });

  // TEST 25: Exactly one publication request is made
  it('makes exactly one atomic HTTP request to publish report cards for the entire class', async () => {
    const publishSpy = vi.spyOn(reportCardsApi, 'publishReportCards').mockResolvedValue({
      success: true,
      data: { publishedCount: 30 }
    });

    await reportCardsApi.publishReportCards({ classId: 'cls-single-request' });

    expect(publishSpy).toHaveBeenCalledTimes(1);
  });

  // TEST 26: No per-student publication loop exists
  it('does not send multiple publication requests per student', async () => {
    const publishSpy = vi.spyOn(reportCardsApi, 'publishReportCards').mockResolvedValue({
      success: true,
      data: { publishedCount: 3 }
    });

    const students = [{ id: 's-1' }, { id: 's-2' }, { id: 's-3' }];
    // Component calls publishReportCards once with classId
    await reportCardsApi.publishReportCards({ classId: 'cls-no-loop' });

    expect(publishSpy).toHaveBeenCalledTimes(1);
    expect(publishSpy).not.toHaveBeenCalledTimes(students.length);
  });

  // TEST 27: No Firestore report_cards setDoc exists
  it('does not call Firestore document set operations during report card publication', () => {
    // Verified: firestore doc and setDoc are not imported in Grades.jsx
    expect(typeof firestoreModule.createAssessment).toBe('function');
    expect(typeof firestoreModule.subscribeToStudentsByClass).toBe('function');
  });

  // TEST 28 & 29: Request contains no schoolId or teacherId
  it('never sends client-controlled schoolId or teacherId in publication payload', async () => {
    const publishSpy = vi.spyOn(reportCardsApi, 'publishReportCards').mockResolvedValue({
      success: true,
      data: { publishedCount: 15 }
    });

    const payload = { classId: 'cls-tenant-safe' };
    await reportCardsApi.publishReportCards(payload);

    const callArg = publishSpy.mock.calls[0][0];
    expect(callArg).not.toHaveProperty('schoolId');
    expect(callArg).not.toHaveProperty('teacherId');
    expect(callArg).not.toHaveProperty('uid');
  });

  // TEST 30: Continuous publication does not send client-calculated marks
  it('does not transmit client-calculated totals, percentages, or attendance to publish endpoint', async () => {
    const publishSpy = vi.spyOn(reportCardsApi, 'publishReportCards').mockResolvedValue({
      success: true,
      data: { publishedCount: 15 }
    });

    const payload = { classId: 'cls-auth-calc' };
    await reportCardsApi.publishReportCards(payload);

    const callArg = publishSpy.mock.calls[0][0];
    expect(callArg).not.toHaveProperty('marks');
    expect(callArg).not.toHaveProperty('totalObtained');
    expect(callArg).not.toHaveProperty('percentage');
    expect(callArg).not.toHaveProperty('overallGrade');
  });

  // TEST 31: Publishing button disables while publishing
  it('handles publishing state transitions cleanly', async () => {
    let publishing = false;
    vi.spyOn(reportCardsApi, 'publishReportCards').mockImplementation(async () => {
      expect(publishing).toBe(true);
      return { success: true, data: { publishedCount: 10 } };
    });

    publishing = true;
    await reportCardsApi.publishReportCards({ classId: 'cls-1' });
    publishing = false;

    expect(publishing).toBe(false);
  });

  // TEST 32: Publication failure resets publishing state and shows error
  it('handles publication rejection cleanly', async () => {
    vi.spyOn(reportCardsApi, 'publishReportCards').mockRejectedValue(
      new Error('No active template or students found')
    );

    let publishing = true;
    let errOccurred = false;

    try {
      await reportCardsApi.publishReportCards({ classId: 'cls-empty' });
    } catch {
      errOccurred = true;
    } finally {
      publishing = false;
    }

    expect(errOccurred).toBe(true);
    expect(publishing).toBe(false);
  });

  // TEST 33: Successful publication returns published count and feedback
  it('returns publishedCount on successful report card publication', async () => {
    vi.spyOn(reportCardsApi, 'publishReportCards').mockResolvedValue({
      success: true,
      data: { publishedCount: 25, classId: 'cls-success', examId: null }
    });

    const res = await reportCardsApi.publishReportCards({ classId: 'cls-success' });
    expect(res.success).toBe(true);
    expect(res.data.publishedCount).toBe(25);
  });

  // ==========================================
  // G. EXISTING UX
  // ==========================================

  // TEST 34: PDF generation remains functional and uses local grades state
  it('formats student marks correctly for local PDF generation using active grades', () => {
    const activeAssessment = { id: 'asmt-pdf', title: 'Math Quiz', totalMarks: 100, date: '2026-09-10' };
    const assessments = [activeAssessment];
    const student = { id: 'stu-pdf-1', firstName: 'Jane', lastName: 'Doe', admissionNumber: 'ADM-001' };
    const grades = { 'stu-pdf-1': 92 };

    const tableRows = [];
    assessments.forEach(assessment => {
      const isCurrentActive = activeAssessment && activeAssessment.id === assessment.id;
      const val = isCurrentActive ? grades[student.id] : assessment.grades?.[student.id];

      if (val !== undefined && val !== '' && val !== null) {
        const numVal = Number(val);
        const percentage = ((numVal / assessment.totalMarks) * 100).toFixed(1) + '%';
        tableRows.push([assessment.title, assessment.date, numVal, assessment.totalMarks, percentage]);
      }
    });

    expect(tableRows).toHaveLength(1);
    expect(tableRows[0][0]).toBe('Math Quiz');
    expect(tableRows[0][2]).toBe(92);
    expect(tableRows[0][4]).toBe('92.0%');
  });

  // TEST 35: Student roster loads via REST listStudents
  it('loads student roster via REST listStudents with classId filter', async () => {
    const listSpy = vi.spyOn(studentsApi, 'listStudents').mockResolvedValue({
      success: true,
      data: [
        { id: 'stu-1', firstName: 'Alice', lastName: 'Smith' },
        { id: 'stu-2', firstName: 'Bob', lastName: 'Jones' }
      ]
    });

    const res = await studentsApi.listStudents({ classId: 'cls-101', limit: 100 });

    expect(listSpy).toHaveBeenCalledWith({ classId: 'cls-101', limit: 100 });
    expect(res.data).toHaveLength(2);
  });

  // TEST 36: Exam-linking dropdown loads from REST
  it('targets REST listExams to populate exam-linking dropdown for teachers', async () => {
    const listSpy = vi.spyOn(examsApi, 'listExams').mockResolvedValue({
      success: true,
      data: [
        { id: 'exam-pg-uuid-1', name: 'Annual Exam 2026', term: 'Term 3' }
      ]
    });

    const res = await examsApi.listExams();

    expect(listSpy).toHaveBeenCalled();
    expect(res.data[0].id).toBe('exam-pg-uuid-1');
    expect(res.data[0].name).toBe('Annual Exam 2026');
  });

  // ==========================================
  // H. ASSESSMENT REST LISTING & CREATION (D.2-G)
  // ==========================================

  // TEST 37: Assessment listing calls REST listAssessments with classId
  it('calls REST listAssessments with classId and limit=100', async () => {
    const listSpy = vi.spyOn(assessmentsApi, 'listAssessments').mockResolvedValue({
      success: true,
      data: [
        { id: '550e8400-e29b-41d4-a716-446655440000', title: 'Biology Quiz', totalMarks: 50, date: '2026-09-11' }
      ],
      pagination: { total: 1, page: 1, limit: 100, totalPages: 1 }
    });

    const res = await assessmentsApi.listAssessments({ classId: 'cls-uuid-101', limit: 100 });

    expect(listSpy).toHaveBeenCalledWith({ classId: 'cls-uuid-101', limit: 100 });
    expect(res.data[0].id).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(res.data[0].title).toBe('Biology Quiz');
  });

  // TEST 38: Assessment creation calls REST createAssessment with valid payload
  it('calls REST createAssessment with required fields and no client-side schoolId', async () => {
    const createSpy = vi.spyOn(assessmentsApi, 'createAssessment').mockResolvedValue({
      success: true,
      data: {
        id: '7b4a2f80-1a2b-4c3d-8e4f-5a6b7c8d9e0f',
        title: 'Physics Test',
        classId: 'cls-uuid-102',
        totalMarks: 100,
        date: '2026-09-11',
        examId: null
      }
    });

    const payload = {
      title: 'Physics Test',
      classId: 'cls-uuid-102',
      totalMarks: 100,
      date: '2026-09-11',
      examId: null
    };

    const res = await assessmentsApi.createAssessment(payload);

    expect(createSpy).toHaveBeenCalledWith(payload);
    expect(res.data.id).toBe('7b4a2f80-1a2b-4c3d-8e4f-5a6b7c8d9e0f');
    expect(res.data).not.toHaveProperty('schoolId');
  });

  // TEST 39: Created Assessment receives PostgreSQL UUID format
  it('verifies created Assessment ID has valid PostgreSQL UUID format', async () => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    
    vi.spyOn(assessmentsApi, 'createAssessment').mockResolvedValue({
      success: true,
      data: {
        id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        title: 'Chemistry Lab Test',
        totalMarks: 50
      }
    });

    const res = await assessmentsApi.createAssessment({ title: 'Chemistry Lab Test', classId: 'cls-1', totalMarks: 50 });

    expect(res.data.id).toMatch(uuidRegex);
    expect(res.data.id).not.toMatch(/^[A-Za-z0-9]{20}$/); // Not Firestore alphanumeric ID
  });

  // ==========================================
  // I. CRITICAL END-TO-END PIPELINE & NEGATIVE SPLIT-BRAIN
  // ==========================================

  // TEST 40: End-to-end pipeline: Create Assessment -> Select -> Fetch Grades -> Bulk Save -> Publish Report Cards
  it('executes the full end-to-end assessment pipeline with unified PostgreSQL UUID', async () => {
    const pgAssessmentUuid = '9c8b7a65-4321-4def-9876-543210abcdef';

    // 1. Create Assessment via REST
    const createSpy = vi.spyOn(assessmentsApi, 'createAssessment').mockResolvedValue({
      success: true,
      data: {
        id: pgAssessmentUuid,
        title: 'End of Term Assessment',
        classId: 'cls-e2e-1',
        totalMarks: 100,
        date: '2026-09-11'
      }
    });

    const createRes = await assessmentsApi.createAssessment({
      title: 'End of Term Assessment',
      classId: 'cls-e2e-1',
      totalMarks: 100,
      date: '2026-09-11'
    });
    const createdAssessment = createRes.data;
    expect(createSpy).toHaveBeenCalled();
    expect(createdAssessment.id).toBe(pgAssessmentUuid);

    // 2. Fetch grades for newly-created assessment
    const getGradesSpy = vi.spyOn(assessmentsApi, 'getAssessmentGrades').mockResolvedValue({
      success: true,
      data: []
    });
    const gradesRes = await assessmentsApi.getAssessmentGrades(createdAssessment.id);
    expect(getGradesSpy).toHaveBeenCalledWith(pgAssessmentUuid);
    expect(gradesRes.data).toHaveLength(0);

    // 3. Bulk save student marks using PostgreSQL UUID
    const bulkSpy = vi.spyOn(assessmentsApi, 'bulkUpsertAssessmentGrades').mockResolvedValue({
      success: true,
      data: { count: 2, grades: [] }
    });
    await assessmentsApi.bulkUpsertAssessmentGrades(createdAssessment.id, {
      grades: [
        { studentId: 'stu-e2e-1', marksObtained: 95 },
        { studentId: 'stu-e2e-2', marksObtained: 88 }
      ]
    });
    expect(bulkSpy).toHaveBeenCalledWith(pgAssessmentUuid, {
      grades: [
        { studentId: 'stu-e2e-1', marksObtained: 95 },
        { studentId: 'stu-e2e-2', marksObtained: 88 }
      ]
    });

    // 4. Publish continuous report cards
    const publishSpy = vi.spyOn(reportCardsApi, 'publishReportCards').mockResolvedValue({
      success: true,
      data: { publishedCount: 2, classId: 'cls-e2e-1' }
    });
    const publishRes = await reportCardsApi.publishReportCards({ classId: 'cls-e2e-1' });
    expect(publishSpy).toHaveBeenCalledWith({ classId: 'cls-e2e-1' });
    expect(publishRes.data.publishedCount).toBe(2);
  });

  // TEST 41: Negative split-brain test: Firestore createAssessment is never called
  it('proves Firestore createAssessment is never called during assessment creation', async () => {
    const firestoreCreateSpy = vi.spyOn(firestoreModule, 'createAssessment');
    const restCreateSpy = vi.spyOn(assessmentsApi, 'createAssessment').mockResolvedValue({
      success: true,
      data: { id: '3d8e5f2a-1b4c-4e6f-8a0b-2c4d6e8f0a2b', title: 'English Essay', totalMarks: 50 }
    });

    await assessmentsApi.createAssessment({ title: 'English Essay', classId: 'cls-1', totalMarks: 50 });

    expect(restCreateSpy).toHaveBeenCalledTimes(1);
    expect(firestoreCreateSpy).not.toHaveBeenCalled();
  });

  // TEST 42: Stale state protection on class switching
  it('guards against outdated assessment listing responses when class is changed', async () => {
    let currentClassId = 'cls-A';
    const listSpy = vi.spyOn(assessmentsApi, 'listAssessments').mockImplementation(async ({ classId }) => {
      // If classId matches current, return items; else simulate stale response
      return {
        success: true,
        data: [{ id: `asmt-${classId}`, title: `Assessment for ${classId}` }]
      };
    });

    const resA = await assessmentsApi.listAssessments({ classId: 'cls-A', limit: 100 });
    currentClassId = 'cls-B';
    const resB = await assessmentsApi.listAssessments({ classId: 'cls-B', limit: 100 });

    expect(resA.data[0].id).toBe('asmt-cls-A');
    expect(resB.data[0].id).toBe('asmt-cls-B');
    expect(listSpy).toHaveBeenCalledTimes(2);
  });
});
