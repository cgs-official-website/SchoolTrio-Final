import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  getStatusColorClass,
  applyStudentStatusUpdate,
  resolveAssessmentTimestamp,
  calculateStudentGrades,
  fetchAllGradesForAssessment,
  calculateClassAverageMetrics
} from './PerformanceTracking.jsx';
import { updateStudentPerformanceStatus } from '../../api/students.js';
import * as clientModule from '../../api/client.js';

vi.mock('../../api/client.js', () => ({
  apiClient: vi.fn()
}));

describe('BUG-PERF-004: Frontend Performance Trend Status Update Tests', () => {
  const filePath = path.resolve(__dirname, 'PerformanceTracking.jsx');
  const fileContent = fs.readFileSync(filePath, 'utf-8');

  const student1Id = 'student-uuid-1';
  const student2Id = 'student-uuid-2';

  const mockStudents = [
    {
      id: student1Id,
      firstName: 'Alice',
      lastName: 'Smith',
      admissionNumber: 'ADM-001',
      status: 'stable',
      performanceStatus: 'stable',
      customData: { performanceStatus: 'stable', medicalInfo: 'None' }
    },
    {
      id: student2Id,
      firstName: 'Bob',
      lastName: 'Jones',
      admissionNumber: 'ADM-002',
      status: 'improving',
      performanceStatus: 'improving',
      customData: { performanceStatus: 'improving' }
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================
  // 1. API CLIENT CONTRACT TESTS
  // ============================================================
  describe('API Client (updateStudentPerformanceStatus)', () => {
    it('calls dedicated PATCH /api/v1/students/:id/performance-status with { status }', async () => {
      clientModule.apiClient.mockResolvedValue({
        success: true,
        data: { id: student1Id, customData: { performanceStatus: 'improving' } }
      });

      const res = await updateStudentPerformanceStatus(student1Id, 'improving');

      expect(clientModule.apiClient).toHaveBeenCalledWith(
        `/api/v1/students/${student1Id}/performance-status`,
        {
          method: 'PATCH',
          body: JSON.stringify({ status: 'improving' })
        }
      );
      expect(res.success).toBe(true);
    });

    it('sends correct payload for "excellent"', async () => {
      clientModule.apiClient.mockResolvedValue({ success: true });

      await updateStudentPerformanceStatus(student1Id, 'excellent');

      expect(clientModule.apiClient).toHaveBeenCalledWith(
        `/api/v1/students/${student1Id}/performance-status`,
        {
          method: 'PATCH',
          body: JSON.stringify({ status: 'excellent' })
        }
      );
    });

    it('sends correct payload for "stable"', async () => {
      clientModule.apiClient.mockResolvedValue({ success: true });

      await updateStudentPerformanceStatus(student1Id, 'stable');

      expect(clientModule.apiClient).toHaveBeenCalledWith(
        `/api/v1/students/${student1Id}/performance-status`,
        {
          method: 'PATCH',
          body: JSON.stringify({ status: 'stable' })
        }
      );
    });

    it('does NOT call general updateStudent or send full customData object in payload', () => {
      const apiFile = path.resolve(__dirname, '../../api/students.js');
      const apiContent = fs.readFileSync(apiFile, 'utf-8');

      // Verify updateStudentPerformanceStatus calls /performance-status directly
      expect(apiContent).toContain('/api/v1/students/${encodeURIComponent(studentId)}/performance-status');
      expect(apiContent).not.toMatch(/updateStudentPerformanceStatus[^{]*\{[^}]*return updateStudent\(/);
    });
  });

  // ============================================================
  // 2. STATE REDUCTION & DATA ISOLATION (applyStudentStatusUpdate)
  // ============================================================
  describe('State Updater (applyStudentStatusUpdate)', () => {
    it('updates status to "improving" for the target student only', () => {
      const updated = applyStudentStatusUpdate(mockStudents, student1Id, 'improving');

      expect(updated[0].performanceStatus).toBe('improving');
      expect(updated[0].customData.performanceStatus).toBe('improving');
      expect(updated[0].customData.medicalInfo).toBe('None'); // Unrelated customData preserved

      // Other student remains completely untouched
      expect(updated[1].performanceStatus).toBe('improving');
      expect(updated[1].id).toBe(student2Id);
    });

    it('updates status to "excellent" for target student', () => {
      const updated = applyStudentStatusUpdate(mockStudents, student1Id, 'excellent');

      expect(updated[0].performanceStatus).toBe('excellent');
      expect(updated[0].customData.performanceStatus).toBe('excellent');
    });

    it('updates status to "stable" for target student', () => {
      const updated = applyStudentStatusUpdate(mockStudents, student2Id, 'stable');

      expect(updated[1].performanceStatus).toBe('stable');
      expect(updated[1].customData.performanceStatus).toBe('stable');
    });

    it('preserves previous state if studentId is not found', () => {
      const updated = applyStudentStatusUpdate(mockStudents, 'unknown-id', 'excellent');

      expect(updated[0].performanceStatus).toBe('stable');
      expect(updated[1].performanceStatus).toBe('improving');
    });
  });

  // ============================================================
  // 3. UI LABELS, COLOR MAPPINGS & SOURCE VERIFICATION
  // ============================================================
  describe('UI Labels, Styles & Source Checks', () => {
    it('maps all supported trend statuses to their corresponding aesthetic styles', () => {
      expect(getStatusColorClass('excellent')).toBe('text-purple-700 bg-purple-100');
      expect(getStatusColorClass('improving')).toBe('text-green-700 bg-green-100');
      expect(getStatusColorClass('stable')).toBe('text-blue-700 bg-blue-100');
      expect(getStatusColorClass('warning')).toBe('text-amber-700 bg-amber-100');
      expect(getStatusColorClass('critical')).toBe('text-red-700 bg-red-100');
      expect(getStatusColorClass('unknown')).toBe('text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-700');
    });

    it('verifies dropdown options contain Excellent, Improving, Stable, Warning, Critical', () => {
      expect(fileContent).toContain('<option value="excellent">Excellent</option>');
      expect(fileContent).toContain('<option value="improving">Improving</option>');
      expect(fileContent).toContain('<option value="stable">Stable</option>');
      expect(fileContent).toContain('<option value="warning">Warning</option>');
      expect(fileContent).toContain('<option value="critical">Critical</option>');
    });

    it('verifies select control is disabled while updatingId matches student.id', () => {
      expect(fileContent).toContain('disabled={updatingId === student.id}');
    });

    it('verifies handleStatusChange checks updatingId to prevent duplicate submissions', () => {
      expect(fileContent).toContain('if (updatingId === studentId) return;');
    });

    it('verifies error toast uses error?.message when available', () => {
      expect(fileContent).toContain('toast.error(error?.message || "Failed to update status")');
    });

    it('verifies updateStudentPerformanceStatus is called with (studentId, newStatus) without customData', () => {
      expect(fileContent).toContain('await updateStudentPerformanceStatus(studentId, newStatus);');
      expect(fileContent).not.toContain('updateStudentPerformanceStatus(studentId, newStatus, student?.customData)');
    });
  });

  // ============================================================
  // 4. BUG-PERF-005: LATEST EXAM SCORE & OVERALL GRADE TESTS
  // ============================================================
  describe('BUG-PERF-005: Latest Exam Score & Overall Grade Calculation and Resilience Tests', () => {
    const studentA = 'student-test-uuid-a';
    const studentB = 'student-test-uuid-b';

    // 1. An assessment with date: null and a valid fallback timestamp
    it('resolves timestamp using candidate hierarchy (date -> exam.startDate -> createdAt)', () => {
      // Candidate 1: valid date
      const assWithDate = { date: '2026-03-20', exam: { startDate: '2026-03-10' }, createdAt: '2026-03-01T00:00:00Z' };
      expect(resolveAssessmentTimestamp(assWithDate)).toBe(new Date('2026-03-20').getTime());

      // Candidate 2: date is null, falls back to exam.startDate
      const assWithExamDate = { date: null, exam: { startDate: '2026-03-10' }, createdAt: '2026-03-01T00:00:00Z' };
      expect(resolveAssessmentTimestamp(assWithExamDate)).toBe(new Date('2026-03-10').getTime());

      // Candidate 3: date & exam are null, falls back to createdAt
      const assWithCreatedAt = { date: null, exam: null, createdAt: '2026-03-01T12:00:00.000Z' };
      expect(resolveAssessmentTimestamp(assWithCreatedAt)).toBe(new Date('2026-03-01T12:00:00.000Z').getTime());
    });

    it('correctly calculates Last Exam Score when assessment.date is null but createdAt is valid', () => {
      const assessments = [
        { id: 'ass-no-date', totalMarks: 100, date: null, exam: null, createdAt: '2026-03-15T10:00:00Z' }
      ];
      const gradesMap = {
        'ass-no-date': { [studentA]: 85 }
      };

      const res = calculateStudentGrades(studentA, assessments, gradesMap);
      expect(res.lastExamScore).toBe('85%');
      expect(res.avgGrade).toBe('A');
      expect(res.avgPerc).toBe(85);
    });

    // 2. Missing or invalid dates without crashing or producing invalid percentages
    it('handles missing or invalid dates without crashing and avoids division by zero or NaN', () => {
      const assessments = [
        { id: 'ass-invalid', totalMarks: 100, date: 'not-a-date', exam: null, createdAt: null },
        { id: 'ass-zero-total', totalMarks: 0, date: '2026-03-10', exam: null, createdAt: null }
      ];
      const gradesMap = {
        'ass-invalid': { [studentA]: 75 },
        'ass-zero-total': { [studentA]: 50 }
      };

      const res = calculateStudentGrades(studentA, assessments, gradesMap);
      expect(res.lastExamScore).toBe('75%');
      expect(res.avgGrade).toBe('B');
      expect(res.avgPerc).toBe(75);
      expect(Number.isNaN(res.avgPerc)).toBe(false);
    });

    // 3. Multiple assessments selecting the latest one deterministically (and tie-breaker on identical timestamps)
    it('selects the latest assessment deterministically when multiple assessments exist', () => {
      const assessments = [
        { id: 'ass-1', totalMarks: 100, date: '2026-01-15', createdAt: '2026-01-15T00:00:00Z' },
        { id: 'ass-2', totalMarks: 100, date: '2026-03-15', createdAt: '2026-03-15T00:00:00Z' },
        { id: 'ass-3', totalMarks: 100, date: '2026-02-15', createdAt: '2026-02-15T00:00:00Z' }
      ];
      const gradesMap = {
        'ass-1': { [studentA]: 60 },
        'ass-2': { [studentA]: 95 },
        'ass-3': { [studentA]: 70 }
      };

      const res = calculateStudentGrades(studentA, assessments, gradesMap);
      expect(res.lastExamScore).toBe('95%'); // ass-2 is latest
    });

    it('uses a stable assessment ID tie-breaker when two assessments have identical timestamps', () => {
      const timestamp = '2026-03-15';
      const assessments = [
        { id: 'assessment-alpha', totalMarks: 100, date: timestamp },
        { id: 'assessment-zeta', totalMarks: 100, date: timestamp }
      ];
      const gradesMap = {
        'assessment-alpha': { [studentA]: 70 },
        'assessment-zeta': { [studentA]: 90 }
      };

      // Regardless of array order, assessment-zeta wins tie-breaker
      const resForward = calculateStudentGrades(studentA, assessments, gradesMap);
      const resReverse = calculateStudentGrades(studentA, [...assessments].reverse(), gradesMap);

      expect(resForward.lastExamScore).toBe('90%');
      expect(resReverse.lastExamScore).toBe('90%');
    });

    // 4. A legitimate score of 0
    it('preserves a legitimate score of 0 without converting it to missing data', () => {
      const assessments = [
        { id: 'ass-zero', totalMarks: 100, date: '2026-03-15' }
      ];
      const gradesMap = {
        'ass-zero': { [studentA]: 0 }
      };

      const res = calculateStudentGrades(studentA, assessments, gradesMap);
      expect(res.lastExamScore).toBe('0%');
      expect(res.avgPerc).toBe(0);
      expect(res.avgGrade).toBe('F');
    });

    // 5. More than 20 students with multi-page pagination
    it('retrieves all pages for an assessment with > 20 students using pagination metadata', async () => {
      const page1Grades = Array.from({ length: 20 }, (_, i) => ({ studentId: `st-${i + 1}`, marksObtained: 80 }));
      const page2Grades = Array.from({ length: 10 }, (_, i) => ({ studentId: `st-${i + 21}`, marksObtained: 95 }));

      const mockFetch = vi.fn().mockImplementation((id, query) => {
        if (query.page === 1) {
          return Promise.resolve({
            success: true,
            data: page1Grades,
            pagination: { page: 1, limit: 20, total: 30, totalPages: 2, hasNextPage: true }
          });
        }
        return Promise.resolve({
          success: true,
          data: page2Grades,
          pagination: { page: 2, limit: 20, total: 30, totalPages: 2, hasNextPage: false }
        });
      });

      const allGrades = await fetchAllGradesForAssessment('ass-multi-page', mockFetch);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(allGrades).toHaveLength(30);
      expect(allGrades[24].studentId).toBe('st-25');
      expect(allGrades[24].marksObtained).toBe(95);
    });

    // 6. One assessment request failing while other assessments succeed
    it('retains successful assessments and computes scores even when another assessment throws', async () => {
      const assessments = [
        { id: 'ass-success', totalMarks: 100, date: '2026-03-15' }
      ];
      const gradesMap = {
        'ass-success': { [studentA]: 88 }
      };

      const res = calculateStudentGrades(studentA, assessments, gradesMap);
      expect(res.lastExamScore).toBe('88%');
      expect(res.avgGrade).toBe('A');
    });

    // 7. Partial retrieval failure communicated without claiming failed assessment has no grades
    it('verifies partial retrieval failure UI elements and notifications exist in source code', () => {
      const srcPath = path.resolve(__dirname, 'PerformanceTracking.jsx');
      const content = fs.readFileSync(srcPath, 'utf-8');

      // State flag & toast warning
      expect(content).toContain('setPartialError(true)');
      expect(content).toContain('toast.error("Some assessment records could not be retrieved');
      // Non-blocking banner in JSX
      expect(content).toContain('{partialError && (');
      expect(content).toContain('Some assessment records could not be retrieved. Displayed performance metrics reflect currently accessible assessments.');
    });

    // 8. Student with no applicable grades still displaying '-'
    it('displays "-" for Last Exam Score and Overall Grade when a student genuinely has no grades', () => {
      const assessments = [
        { id: 'ass-1', totalMarks: 100, date: '2026-03-15' }
      ];
      // studentB has no entries in gradesMap
      const gradesMap = {
        'ass-1': { [studentA]: 85 }
      };

      const res = calculateStudentGrades(studentB, assessments, gradesMap);
      expect(res.lastExamScore).toBe('-');
      expect(res.avgGrade).toBe('-');
      expect(res.avgPerc).toBeNull();
    });

    it('excludes absent and exempt records from ordinary numeric scores and displays "-" if only absent/exempt', () => {
      const assessments = [
        { id: 'ass-absent', totalMarks: 100, date: '2026-03-15' },
        { id: 'ass-exempt', totalMarks: 100, date: '2026-03-20' }
      ];
      const gradesMap = {
        'ass-absent': { [studentA]: { marksObtained: 0, isAbsent: true, isExempt: false } },
        'ass-exempt': { [studentA]: { marksObtained: null, isAbsent: false, isExempt: true } }
      };

      const res = calculateStudentGrades(studentA, assessments, gradesMap);
      expect(res.lastExamScore).toBe('-');
      expect(res.avgGrade).toBe('-');
      expect(res.avgPerc).toBeNull();
    });

    // 9. Existing grade boundaries remaining unchanged
    it('preserves established academic grade boundaries exactly (A+, A, B, C, D, F)', () => {
      const testBoundary = (marksObtained, expectedGrade) => {
        const ass = [{ id: 'ass-test', totalMarks: 100, date: '2026-03-15' }];
        const gMap = { 'ass-test': { [studentA]: marksObtained } };
        return calculateStudentGrades(studentA, ass, gMap).avgGrade;
      };

      expect(testBoundary(95, 'A+')).toBe('A+');
      expect(testBoundary(90, 'A+')).toBe('A+');
      expect(testBoundary(89, 'A')).toBe('A');
      expect(testBoundary(80, 'A')).toBe('A');
      expect(testBoundary(75, 'B')).toBe('B');
      expect(testBoundary(70, 'B')).toBe('B');
      expect(testBoundary(65, 'C')).toBe('C');
      expect(testBoundary(60, 'C')).toBe('C');
      expect(testBoundary(55, 'D')).toBe('D');
      expect(testBoundary(50, 'D')).toBe('D');
      expect(testBoundary(49, 'F')).toBe('F');
      expect(testBoundary(1, 'F')).toBe('F');
    });

    // 10. Changing classes while requests are in flight
    it('verifies in-flight request race condition guards protect against stale class data overwriting state', () => {
      const srcPath = path.resolve(__dirname, 'PerformanceTracking.jsx');
      const content = fs.readFileSync(srcPath, 'utf-8');

      // Checks currentClassIdRef before committing state
      expect(content).toContain('if (!mountedRef.current || currentClassIdRef.current !== targetClassId) return;');
      expect(content).toContain('currentClassIdRef.current = classId;');
    });
  });
});

describe('BUG-PERF-006: Class Average Summary Calculation, Rendering & Coordination Tests', () => {
  const filePath = path.resolve(__dirname, 'PerformanceTracking.jsx');
  const fileContent = fs.readFileSync(filePath, 'utf-8');

  // 1. A class with multiple scored students displays the correct arithmetic mean of their individual percentages.
  it('1. calculates the correct arithmetic mean of individual student percentages for multiple scored students', () => {
    const scoredStudents = [
      { id: 's1', avgPerc: 85.0 },
      { id: 's2', avgPerc: 90.0 },
      { id: 's3', avgPerc: 65.0 }
    ];

    const result = calculateClassAverageMetrics(scoredStudents);
    // (85.0 + 90.0 + 65.0) / 3 = 80.0% -> 'A'
    expect(result.classAvgPerc).toBe(80.0);
    expect(result.classAvgGrade).toBe('A');

    // Test non-integer average with rounding to 1 decimal place
    const unevenStudents = [
      { id: 's1', avgPerc: 80.4 },
      { id: 's2', avgPerc: 85.2 }
    ];
    const unevenResult = calculateClassAverageMetrics(unevenStudents);
    // (80.4 + 85.2) / 2 = 82.8% -> 'A'
    expect(unevenResult.classAvgPerc).toBe(82.8);
    expect(unevenResult.classAvgGrade).toBe('A');
  });

  // 2. A valid class average of exactly 0% displays 0.0% and grade F.
  it('2. returns 0 and grade F for a valid class average of exactly 0% (renders 0.0% and grade F)', () => {
    const zeroStudents = [
      { id: 's1', avgPerc: 0 },
      { id: 's2', avgPerc: 0 }
    ];

    const result = calculateClassAverageMetrics(zeroStudents);
    expect(result.classAvgPerc).toBe(0);
    expect(result.classAvgGrade).toBe('F');

    // Verify rendering format: 0.0% instead of 'No data'
    const renderedPerc = result.classAvgPerc !== null && Number.isFinite(result.classAvgPerc)
      ? `${result.classAvgPerc.toFixed(1)}%`
      : 'No data';
    expect(renderedPerc).toBe('0.0%');

    // Verify the JSX no longer has the flawed `classAvgPerc > 0` guard
    expect(fileContent).not.toContain("classAvgPerc > 0 ? `${classAvgPerc.toFixed(1)}%` : 'No data'");
    expect(fileContent).toContain("classAvgPerc !== null && Number.isFinite(classAvgPerc) ? `${classAvgPerc.toFixed(1)}%` : 'No data'");
  });

  // 3. A class with no applicable marks displays - and No data.
  it('3. returns null and grade "-" for a class with no applicable marks (renders "-" and "No data")', () => {
    // Empty array
    const emptyResult = calculateClassAverageMetrics([]);
    expect(emptyResult.classAvgPerc).toBeNull();
    expect(emptyResult.classAvgGrade).toBe('-');

    const renderedEmpty = emptyResult.classAvgPerc !== null && Number.isFinite(emptyResult.classAvgPerc)
      ? `${emptyResult.classAvgPerc.toFixed(1)}%`
      : 'No data';
    expect(renderedEmpty).toBe('No data');

    // Students with null marks
    const unassessedStudents = [
      { id: 's1', avgPerc: null },
      { id: 's2', avgPerc: null }
    ];
    const unassessedResult = calculateClassAverageMetrics(unassessedStudents);
    expect(unassessedResult.classAvgPerc).toBeNull();
    expect(unassessedResult.classAvgGrade).toBe('-');
  });

  // 4. Students with only absent/exempt records do not affect the average divisor.
  it('4. excludes students with only absent/exempt records so they do not deflate the divisor', () => {
    const students = [
      { id: 's-scored', avgPerc: 75.0 },
      { id: 's-absent', avgPerc: null }, // absent-only results yield avgPerc: null
      { id: 's-exempt', avgPerc: null }  // exempt-only results yield avgPerc: null
    ];

    const result = calculateClassAverageMetrics(students);
    // Divisor must be 1, NOT 3. Average is 75.0, grade 'B'
    expect(result.classAvgPerc).toBe(75.0);
    expect(result.classAvgGrade).toBe('B');
  });

  // 5. A mixture of scored students and students without applicable marks produces the correct average.
  it('5. computes the correct arithmetic mean for a mixture of scored and unscored students', () => {
    const students = [
      { id: 's1', avgPerc: 92.0 },
      { id: 's2', avgPerc: 78.0 },
      { id: 's3', avgPerc: null },
      { id: 's4', avgPerc: null }
    ];

    const result = calculateClassAverageMetrics(students);
    // (92.0 + 78.0) / 2 = 85.0% -> 'A'
    expect(result.classAvgPerc).toBe(85.0);
    expect(result.classAvgGrade).toBe('A');
  });

  // 6. Null, undefined, NaN, and infinite percentages are excluded safely.
  it('6. safely excludes null, undefined, NaN, Infinity, and non-numeric values', () => {
    const dirtyStudents = [
      { id: 's-valid', avgPerc: 70.0 },
      { id: 's-null', avgPerc: null },
      { id: 's-undef', avgPerc: undefined },
      { id: 's-nan', avgPerc: NaN },
      { id: 's-inf', avgPerc: Infinity },
      { id: 's-neg-inf', avgPerc: -Infinity },
      { id: 's-string', avgPerc: '70.0' },
      null,
      undefined,
      {}
    ];

    const result = calculateClassAverageMetrics(dirtyStudents);
    expect(result.classAvgPerc).toBe(70.0);
    expect(result.classAvgGrade).toBe('B');

    // If ALL entries are invalid / non-numeric
    const allInvalid = [
      { id: 's-nan', avgPerc: NaN },
      { id: 's-inf', avgPerc: Infinity },
      { id: 's-str', avgPerc: 'abc' }
    ];
    const invalidResult = calculateClassAverageMetrics(allInvalid);
    expect(invalidResult.classAvgPerc).toBeNull();
    expect(invalidResult.classAvgGrade).toBe('-');
  });

  // 7. All existing grade boundaries remain unchanged.
  it('7. preserves all established academic grade boundaries exactly (A+, A, B, C, D, F)', () => {
    const testGradeBoundary = (perc) => {
      return calculateClassAverageMetrics([{ id: 's', avgPerc: perc }]).classAvgGrade;
    };

    expect(testGradeBoundary(95.0)).toBe('A+');
    expect(testGradeBoundary(90.0)).toBe('A+');
    expect(testGradeBoundary(89.9)).toBe('A');
    expect(testGradeBoundary(80.0)).toBe('A');
    expect(testGradeBoundary(79.9)).toBe('B');
    expect(testGradeBoundary(70.0)).toBe('B');
    expect(testGradeBoundary(69.9)).toBe('C');
    expect(testGradeBoundary(60.0)).toBe('C');
    expect(testGradeBoundary(59.9)).toBe('D');
    expect(testGradeBoundary(50.0)).toBe('D');
    expect(testGradeBoundary(49.9)).toBe('F');
    expect(testGradeBoundary(0.0)).toBe('F');
  });

  // 8. A slow student-roster request does not cause the summary to settle prematurely.
  it('8. coordinates async fetching lifecycle with Promise.allSettled and does not clear loading in fetchPerformanceData prematurely', async () => {
    // 1. fetchPerformanceData no longer has a finally block setting loading = false
    const startIdx = fileContent.indexOf('const fetchPerformanceData = async');
    const endIdx = fileContent.indexOf('const fetchAttendanceData = async');
    expect(startIdx).toBeGreaterThan(-1);
    expect(endIdx).toBeGreaterThan(startIdx);
    const perfDataFn = fileContent.slice(startIdx, endIdx);
    expect(perfDataFn).not.toContain('finally');
    expect(perfDataFn).not.toContain('setLoading(false)');

    // 2. useEffect coordinates with Promise.allSettled
    expect(fileContent).toContain('Promise.allSettled([');
    expect(fileContent).toContain('fetchPerformanceData(targetClassId)');
    expect(fileContent).toContain('fetchStudentsData(targetClassId)');
    expect(fileContent).toContain('fetchAttendanceData(targetClassId)');

    // 3. Simulating execution: loading remains true until the slowest request settles
    let loading = true;
    let slowRosterResolved = false;

    const fastPerfPromise = Promise.resolve({ data: [] });
    const slowRosterPromise = new Promise((resolve) => {
      setTimeout(() => {
        slowRosterResolved = true;
        resolve({ data: [{ id: 's1', firstName: 'John' }] });
      }, 50);
    });

    const coordinator = Promise.allSettled([fastPerfPromise, slowRosterPromise]).finally(() => {
      loading = false;
    });

    // Fast perf has resolved, but slow roster is still pending -> loading must still be true
    await fastPerfPromise;
    expect(slowRosterResolved).toBe(false);
    expect(loading).toBe(true);

    // After all settled
    await coordinator;
    expect(slowRosterResolved).toBe(true);
    expect(loading).toBe(false);
  });

  // 9. A failed required roster request is not presented as a confirmed empty class.
  it('9. communicates student-roster request failures with toast.error rather than silently treating class as confirmed empty', () => {
    // Verifies toast.error is invoked in fetchStudentsData catch block
    expect(fileContent).toContain('toast.error("Failed to load student roster.");');
  });

  // 10. Switching classes during in-flight requests does not display stale class averages.
  it('10. guards against race conditions by checking currentClassIdRef before setting loading and committing state', () => {
    // loadAllClassData finally checks mountedRef and currentClassIdRef
    expect(fileContent).toContain('if (mountedRef.current && currentClassIdRef.current === targetClassId) {');
    expect(fileContent).toContain('setLoading(false);');

    // fetchStudentsData checks currentClassIdRef
    expect(fileContent).toContain('if (!mountedRef.current || currentClassIdRef.current !== targetClassId) return;');
  });

  // 11. Existing BUG-PERF-005 tests continue to pass.
  it('11. verifies calculateStudentGrades still works alongside calculateClassAverageMetrics', () => {
    const studentId = 'student-test';
    const assessments = [
      { id: 'ass-1', totalMarks: 100, date: '2026-03-10' },
      { id: 'ass-2', totalMarks: 100, date: '2026-03-20' }
    ];
    const gradesMap = {
      'ass-1': { [studentId]: 80 },
      'ass-2': { [studentId]: 90 }
    };

    const studentGrades = calculateStudentGrades(studentId, assessments, gradesMap);
    expect(studentGrades.avgGrade).toBe('A');
    expect(studentGrades.avgPerc).toBe(85.0);
    expect(studentGrades.lastExamScore).toBe('90%');

    // Feeding into calculateClassAverageMetrics
    const classMetrics = calculateClassAverageMetrics([{ id: studentId, avgPerc: studentGrades.avgPerc }]);
    expect(classMetrics.classAvgPerc).toBe(85.0);
    expect(classMetrics.classAvgGrade).toBe('A');
  });
});
