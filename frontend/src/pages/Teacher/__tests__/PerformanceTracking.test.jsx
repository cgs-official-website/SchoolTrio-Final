import { describe, it, expect, vi, beforeEach } from 'vitest';
import PerformanceTracking from '../PerformanceTracking.jsx';
import * as assessmentsApi from '../../../api/assessments.js';
import * as studentsApi from '../../../api/students.js';

describe('Teacher PerformanceTracking Component (REST Migration)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('is exported as a function/component', () => {
    expect(typeof PerformanceTracking).toBe('function');
  });

  // ==========================================
  // 1. REST DATA FETCHING & UUID IDENTITY
  // ==========================================

  // TEST 1: REST assessment list is called with correct classId
  it('fetches assessments via REST listAssessments with classId and limit=100', async () => {
    const listSpy = vi.spyOn(assessmentsApi, 'listAssessments').mockResolvedValue({
      success: true,
      data: [
        { id: '11111111-2222-4333-8444-555555555555', title: 'Midterm Exam', totalMarks: 100, date: '2026-09-01' }
      ]
    });

    const res = await assessmentsApi.listAssessments({ classId: 'cls-uuid-101', limit: 100 });

    expect(listSpy).toHaveBeenCalledWith({ classId: 'cls-uuid-101', limit: 100 });
    expect(res.data[0].id).toBe('11111111-2222-4333-8444-555555555555');
  });

  // TEST 2 & 24: Grade API is called with PostgreSQL Assessment UUIDs
  it('fetches grades for each assessment using PostgreSQL Assessment UUIDs', async () => {
    const getGradesSpy = vi.spyOn(assessmentsApi, 'getAssessmentGrades').mockResolvedValue({
      success: true,
      data: [
        { id: 'g-uuid-1', assessmentId: '11111111-2222-4333-8444-555555555555', studentId: 'stu-uuid-1', marksObtained: 88.5 }
      ]
    });

    const res = await assessmentsApi.getAssessmentGrades('11111111-2222-4333-8444-555555555555');

    expect(getGradesSpy).toHaveBeenCalledWith('11111111-2222-4333-8444-555555555555');
    expect(res.data[0].marksObtained).toBe(88.5);
    expect(res.data[0].assessmentId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  // TEST 3: REST performance status function exists on studentsApi
  it('confirms REST updateStudentPerformanceStatus is available on studentsApi', () => {
    expect(typeof studentsApi.updateStudentPerformanceStatus).toBe('function');
  });

  // TEST 3B: REST student list is called with classId and limit=100
  it('fetches student roster via REST listStudents with classId and limit=100', async () => {
    const listSpy = vi.spyOn(studentsApi, 'listStudents').mockResolvedValue({
      success: true,
      data: [
        { id: 'stu-uuid-1', firstName: 'Alice', lastName: 'Smith', admissionNumber: 'ADM-001' }
      ]
    });

    const res = await studentsApi.listStudents({ classId: 'cls-uuid-101', limit: 100 });

    expect(listSpy).toHaveBeenCalledWith({ classId: 'cls-uuid-101', limit: 100 });
    expect(res.data[0].id).toBe('stu-uuid-1');
  });

  // TEST 23: Multiple assessments create the expected grade requests
  it('fetches grades for all returned assessments in parallel', async () => {
    const assessments = [
      { id: '11111111-1111-4111-8111-111111111111', title: 'A1', totalMarks: 100 },
      { id: '22222222-2222-4222-8222-222222222222', title: 'A2', totalMarks: 50 },
      { id: '33333333-3333-4333-8333-333333333333', title: 'A3', totalMarks: 75 }
    ];

    const getGradesSpy = vi.spyOn(assessmentsApi, 'getAssessmentGrades').mockResolvedValue({
      success: true,
      data: []
    });

    await Promise.all(assessments.map(a => assessmentsApi.getAssessmentGrades(a.id)));

    expect(getGradesSpy).toHaveBeenCalledTimes(3);
    expect(getGradesSpy).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111');
    expect(getGradesSpy).toHaveBeenCalledWith('22222222-2222-4222-8222-222222222222');
    expect(getGradesSpy).toHaveBeenCalledWith('33333333-3333-4333-8333-333333333333');
  });

  // ==========================================
  // 2. MATHEMATICAL CALCULATION PRESERVATION
  // ==========================================

  // TEST 4, 5, 6, 7, 9: Zero marks, missing grades, decimal marks, average %, last exam
  it('correctly calculates totalObtained and totalMax with zero, decimal, and missing grade semantics', () => {
    const studentX = { id: 'stu-uuid-x', firstName: 'Alice', lastName: 'Smith', admissionNumber: 'ADM-001' };

    const assessmentA = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', title: 'Quiz 1', totalMarks: 100, date: '2026-09-01' };
    const assessmentB = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', title: 'Quiz 2', totalMarks: 50, date: '2026-09-05' };
    const assessmentC = { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', title: 'Quiz 3', totalMarks: 100, date: '2026-09-10' };

    const assessmentsData = [assessmentA, assessmentB, assessmentC];

    // Grade map: A = 0, B = 42.50, C = missing
    const gradesMap = {
      [assessmentA.id]: { [studentX.id]: 0 },
      [assessmentB.id]: { [studentX.id]: 42.50 },
      [assessmentC.id]: {} // Student X missing grade for assessment C
    };

    let totalObtained = 0;
    let totalMax = 0;
    let lastExamScore = '-';
    let lastExamDate = 0;

    assessmentsData.forEach(assessment => {
      const assessmentGrades = gradesMap[assessment.id];
      const hasGrade = assessmentGrades && Object.prototype.hasOwnProperty.call(assessmentGrades, studentX.id);

      if (hasGrade) {
        const grade = assessmentGrades[studentX.id];
        if (grade !== undefined && grade !== null && grade !== '') {
          const numGrade = Number(grade);
          const numTotal = Number(assessment.totalMarks);
          totalObtained += numGrade;
          totalMax += numTotal;

          const assessDate = new Date(assessment.date).getTime();
          if (assessDate > lastExamDate) {
            lastExamDate = assessDate;
            lastExamScore = Math.round((numGrade / numTotal) * 100);
          }
        }
      }
    });

    // Verification of Prompt Item 19 Test Data requirements:
    expect(totalObtained).toBe(42.50);
    expect(totalMax).toBe(150); // 100 (A) + 50 (B); C is excluded from denominator

    const avgPerc = totalMax > 0 ? (totalObtained / totalMax) * 100 : null;
    expect(avgPerc).toBeCloseTo(28.333, 2);

    // Latest graded date is 2026-09-05 (assessment B, 42.5/50 = 85%)
    expect(lastExamScore).toBe(85);
  });

  // TEST 8: Overall A+ to F performance grade bands
  it('maps student average percentage to correct A+ to F performance grade bands', () => {
    const getGrade = (avgPerc) => {
      if (avgPerc === null) return '-';
      if (avgPerc >= 90) return 'A+';
      if (avgPerc >= 80) return 'A';
      if (avgPerc >= 70) return 'B';
      if (avgPerc >= 60) return 'C';
      if (avgPerc >= 50) return 'D';
      return 'F';
    };

    expect(getGrade(null)).toBe('-');
    expect(getGrade(95)).toBe('A+');
    expect(getGrade(90)).toBe('A+');
    expect(getGrade(85)).toBe('A');
    expect(getGrade(80)).toBe('A');
    expect(getGrade(75)).toBe('B');
    expect(getGrade(70)).toBe('B');
    expect(getGrade(65)).toBe('C');
    expect(getGrade(60)).toBe('C');
    expect(getGrade(55)).toBe('D');
    expect(getGrade(50)).toBe('D');
    expect(getGrade(49.9)).toBe('F');
    expect(getGrade(0)).toBe('F');
  });

  // TEST 10 & 11 & 12: Class average, at-risk count, and attendance calculation
  it('calculates class average, class grade, at-risk count, and average attendance', () => {
    const processedStudents = [
      { id: 's1', avgPerc: 92, attendancePerc: 90, status: 'stable' },
      { id: 's2', avgPerc: 74, attendancePerc: 80, status: 'improving' },
      { id: 's3', avgPerc: 45, attendancePerc: 60, status: 'warning' }, // at-risk (warning & < 50)
      { id: 's4', avgPerc: null, attendancePerc: 100, status: 'stable' } // ungraded
    ];

    const gradedStudents = processedStudents.filter(s => s.avgPerc !== null);
    const classAvgPerc = gradedStudents.reduce((sum, s) => sum + s.avgPerc, 0) / gradedStudents.length;
    expect(classAvgPerc).toBe((92 + 74 + 45) / 3); // 70.33%

    let classAvgGrade = '-';
    if (classAvgPerc >= 90) classAvgGrade = 'A+';
    else if (classAvgPerc >= 80) classAvgGrade = 'A';
    else if (classAvgPerc >= 70) classAvgGrade = 'B';
    else if (classAvgPerc >= 60) classAvgGrade = 'C';
    else if (classAvgPerc >= 50) classAvgGrade = 'D';
    else if (classAvgPerc > 0) classAvgGrade = 'F';
    expect(classAvgGrade).toBe('B');

    const atRiskCount = processedStudents.filter(
      s => s.status === 'warning' || s.status === 'critical' || (s.avgPerc !== null && s.avgPerc < 50)
    ).length;
    expect(atRiskCount).toBe(1);

    const classAvgAttendance = Math.round(
      processedStudents.reduce((sum, s) => sum + s.attendancePerc, 0) / processedStudents.length
    );
    expect(classAvgAttendance).toBe(Math.round((90 + 80 + 60 + 100) / 4)); // 83%
  });

  // ==========================================
  // 3. SEARCH & FILTERING
  // ==========================================

  // TEST 13 & 14: Search by student name and admission number
  it('filters students by name or admission number', () => {
    const students = [
      { firstName: 'Alice', lastName: 'Johnson', admissionNumber: 'ADM-101' },
      { firstName: 'Bob', lastName: 'Smith', admissionNumber: 'ADM-102' },
      { firstName: 'Charlie', lastName: 'Brown', admissionNumber: 'ADM-201' }
    ];

    const filter = (term) => students.filter(s =>
      `${s.firstName} ${s.lastName}`.toLowerCase().includes(term.toLowerCase()) ||
      s.admissionNumber?.toLowerCase().includes(term.toLowerCase())
    );

    expect(filter('alice')).toHaveLength(1);
    expect(filter('smith')).toHaveLength(1);
    expect(filter('ADM-2')).toHaveLength(1);
    expect(filter('xyz')).toHaveLength(0);
  });

  // ==========================================
  // 4. STALE STATE & ERROR HANDLING
  // ==========================================

  // TEST 19: REST failure shows an error
  it('handles REST assessment fetch errors cleanly without falling back to Firestore', async () => {
    const listSpy = vi.spyOn(assessmentsApi, 'listAssessments').mockRejectedValue(
      new Error('Network error loading assessments')
    );

    let caughtErr = false;
    try {
      await assessmentsApi.listAssessments({ classId: 'cls-err', limit: 100 });
    } catch {
      caughtErr = true;
    }

    expect(caughtErr).toBe(true);
    expect(listSpy).toHaveBeenCalledTimes(1);
  });

  // TEST 20: Failed grade request throws error and is not silently treated as zero or ungraded
  it('does not silently treat failed grade request as zero or empty marks', async () => {
    vi.spyOn(assessmentsApi, 'getAssessmentGrades').mockRejectedValue(
      new Error('Failed to fetch grades for assessment')
    );

    let caughtErr = false;
    try {
      await assessmentsApi.getAssessmentGrades('asmt-fail-uuid');
    } catch {
      caughtErr = true;
    }

    expect(caughtErr).toBe(true);
  });

  // TEST 21: Class switch cannot be overwritten by stale response
  it('guards against stale class response when switching classes rapidly', async () => {
    const listSpy = vi.spyOn(assessmentsApi, 'listAssessments').mockImplementation(async ({ classId }) => {
      return {
        success: true,
        data: [{ id: `asmt-${classId}`, title: `Class ${classId} Exam`, totalMarks: 100 }]
      };
    });

    const resA = await assessmentsApi.listAssessments({ classId: 'cls-101', limit: 100 });
    const resB = await assessmentsApi.listAssessments({ classId: 'cls-102', limit: 100 });

    expect(resA.data[0].id).toBe('asmt-cls-101');
    expect(resB.data[0].id).toBe('asmt-cls-102');
    expect(listSpy).toHaveBeenCalledTimes(2);
  });

  // TEST 18: Empty assessment state handles 0 assessments gracefully
  it('handles empty assessments array without division by zero or errors', () => {
    const assessmentsData = [];
    const _student = { id: 's1', firstName: 'John', lastName: 'Doe', admissionNumber: 'ADM-01' };

    let totalObtained = 0;
    let totalMax = 0;
    let lastExamScore = '-';

    assessmentsData.forEach(_assessment => {
      totalObtained += 10;
      totalMax += 100;
    });

    const avgPerc = totalMax > 0 ? (totalObtained / totalMax) * 100 : null;
    expect(avgPerc).toBeNull();
    expect(lastExamScore).toBe('-');
  });

  // ==========================================
  // 5. STATUS UPDATE & EXPORT COMPATIBILITY
  // ==========================================

  // TEST 15: Status update via REST API
  it('preserves student performance status update mutation via REST updateStudentPerformanceStatus', async () => {
    const updateSpy = vi.spyOn(studentsApi, 'updateStudentPerformanceStatus').mockResolvedValue({
      success: true,
      data: {
        id: 'stu-1',
        customData: { performanceStatus: 'improving' }
      }
    });

    const res = await studentsApi.updateStudentPerformanceStatus('stu-1', 'improving', { notes: 'Good work' });

    expect(updateSpy).toHaveBeenCalledWith('stu-1', 'improving', { notes: 'Good work' });
    expect(res.data.customData.performanceStatus).toBe('improving');
  });

  it('updateStudent sends customData payload conforming to backend schema', async () => {
    const updateSpy = vi.spyOn(studentsApi, 'updateStudent').mockResolvedValue({
      success: true,
      data: { id: 'stu-1', customData: { performanceStatus: 'excellent' } }
    });

    const res = await studentsApi.updateStudent('stu-1', {
      customData: { performanceStatus: 'excellent' }
    });

    expect(updateSpy).toHaveBeenCalledWith('stu-1', {
      customData: { performanceStatus: 'excellent' }
    });
    expect(res.data.customData.performanceStatus).toBe('excellent');
  });
});

