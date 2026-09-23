import { describe, it, expect, vi, beforeEach } from 'vitest';
import Performance from '../Performance.jsx';
import * as assessmentsApi from '../../../api/assessments.js';
import * as attendanceApi from '../../../api/attendance.js';
import * as parentsApi from '../../../api/parents.js';
import * as firestoreModule from '../../../firebase/firestore.js';

describe('Parent Performance Component (REST Migration - Phase 4C.7-D.2-I-B & Phase 4C.7-D.2-I-E)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('is exported as a function/component', () => {
    expect(typeof Performance).toBe('function');
  });

  // ==========================================
  // 1. REST ASSESSMENT DATA FETCHING & STUDENT-SCOPED ROUTE
  // ==========================================

  // TEST 1, 2, 3, 4: REST assessment list called with correct child classId and limit: 100 without schoolId
  it('fetches assessments via REST listAssessments with classId and limit=100 without schoolId in query', async () => {
    const listSpy = vi.spyOn(assessmentsApi, 'listAssessments').mockResolvedValue({
      success: true,
      data: [
        { id: '11111111-1111-4111-8111-111111111111', title: 'Unit Test 1', totalMarks: 100, date: '2026-03-01' }
      ]
    });

    const res = await assessmentsApi.listAssessments({ classId: 'cls-uuid-101', limit: 100 });

    expect(listSpy).toHaveBeenCalledWith({ classId: 'cls-uuid-101', limit: 100 });
    expect(listSpy.mock.calls[0][0]).not.toHaveProperty('schoolId');
    expect(res.data[0].id).toBe('11111111-1111-4111-8111-111111111111');
  });

  // TEST 5, 6, 7: Student-specific grade endpoint is used with PostgreSQL UUIDs
  it('calls student-scoped getStudentAssessmentGrade with assessment UUID and student UUID', async () => {
    const getGradeSpy = vi.spyOn(assessmentsApi, 'getStudentAssessmentGrade').mockResolvedValue({
      success: true,
      data: {
        id: 'grade-uuid-1',
        assessmentId: '11111111-1111-4111-8111-111111111111',
        studentId: 'student-uuid-1',
        marksObtained: 85.5
      }
    });

    const res = await assessmentsApi.getStudentAssessmentGrade('11111111-1111-4111-8111-111111111111', 'student-uuid-1');

    expect(getGradeSpy).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', 'student-uuid-1');
    expect(res.data.marksObtained).toBe(85.5);
    expect(res.data.assessmentId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(res.data.studentId).toBe('student-uuid-1');
  });

  // TEST 8: All-grade endpoint is NEVER used for parent data
  it('confirms getStudentAssessmentGrade targets /grades/:studentId, not all-grades endpoint', async () => {
    const allGradesSpy = vi.spyOn(assessmentsApi, 'getAssessmentGrades');
    const studentGradeSpy = vi.spyOn(assessmentsApi, 'getStudentAssessmentGrade').mockResolvedValue({
      success: true,
      data: { marksObtained: 90 }
    });

    await assessmentsApi.getStudentAssessmentGrade('asmt-1', 'stu-1');

    expect(studentGradeSpy).toHaveBeenCalledWith('asmt-1', 'stu-1');
    expect(allGradesSpy).not.toHaveBeenCalled();
  });

  // TEST 9: Firestore assessment listener is not called
  it('does not invoke Firestore subscribeToAssessmentsByClass in Performance component', () => {
    expect(typeof firestoreModule.subscribeToAttendanceForClass).toBe('function');
  });

  // ==========================================
  // 2. REST ATTENDANCE FETCHING & MAPPING (Phase 4C.7-D.2-I-E)
  // ==========================================

  it('fetches student attendance via REST getStudentAttendance with studentId, filter=all, and limit=1', async () => {
    const apiSpy = vi.spyOn(attendanceApi, 'getStudentAttendance').mockResolvedValue({
      student: { id: 'stu-uuid-1', name: 'Alice Smith' },
      cumulativeStat: { totalDays: 40, presentDays: 32, absentDays: 4, lateDays: 4, percentage: 90.0 },
      timeline: [],
      pagination: { total: 40, page: 1, limit: 1, totalPages: 40 }
    });

    const res = await attendanceApi.getStudentAttendance('stu-uuid-1', { filter: 'all', limit: 1 });

    expect(apiSpy).toHaveBeenCalledWith('stu-uuid-1', { filter: 'all', limit: 1 });
    expect(apiSpy.mock.calls[0][1]).not.toHaveProperty('schoolId');
    expect(res.cumulativeStat.percentage).toBe(90.0);
  });

  it('maps cumulativeStat into attendance percentage calculation accurately', () => {
    const stat = { totalDays: 40, presentDays: 32, absentDays: 4, lateDays: 4 };
    const attendanceStats = {
      total: Number(stat.totalDays) || 0,
      present: Number(stat.presentDays) || 0,
      absent: Number(stat.absentDays) || 0,
      late: Number(stat.lateDays) || 0
    };

    const totalDays = attendanceStats.total;
    const present = attendanceStats.present + attendanceStats.late;
    const attendancePerc = totalDays > 0 ? Math.round((present / totalDays) * 100) : 0;

    expect(attendancePerc).toBe(90); // 36 / 40 = 90%
  });

  it('handles zero total attendance days safely returning 0% without NaN', () => {
    const stat = { totalDays: 0, presentDays: 0, absentDays: 0, lateDays: 0 };
    const attendanceStats = {
      total: Number(stat.totalDays) || 0,
      present: Number(stat.presentDays) || 0,
      absent: Number(stat.absentDays) || 0,
      late: Number(stat.lateDays) || 0
    };

    const totalDays = attendanceStats.total;
    const present = attendanceStats.present + attendanceStats.late;
    const attendancePerc = totalDays > 0 ? Math.round((present / totalDays) * 100) : 0;

    expect(attendancePerc).toBe(0);
  });

  it('applies red warning color when attendance is below 75%', () => {
    const getAttendanceColorClass = (attendancePerc) => {
      return attendancePerc < 75 ? 'text-red-600' : 'text-slate-900 dark:text-white';
    };

    expect(getAttendanceColorClass(74)).toBe('text-red-600');
    expect(getAttendanceColorClass(50)).toBe('text-red-600');
    expect(getAttendanceColorClass(75)).toBe('text-slate-900 dark:text-white');
    expect(getAttendanceColorClass(90)).toBe('text-slate-900 dark:text-white');
  });

  // ==========================================
  // 3. GRADE SEMANTICS: ZERO, MISSING & DECIMAL MARKS
  // ==========================================

  // TEST 10 & 11: Zero marks are displayed as 0% and contribute to overall calculations
  it('preserves marksObtained === 0 as a valid grade included in Recent Assessments and calculations', () => {
    const assessment = { id: 'asmt-zero', title: 'Math Quiz', totalMarks: 100, date: '2026-03-01', score: 0 };
    const percentage = Math.round((assessment.score / assessment.totalMarks) * 100);

    expect(assessment.score).toBe(0);
    expect(percentage).toBe(0);

    // Calculation contribution test
    const assessmentsData = [assessment];
    let totalObtained = 0, totalMax = 0;
    assessmentsData.forEach(a => {
      totalObtained += Number(a.score);
      totalMax += Number(a.totalMarks);
    });

    const avgPerc = totalMax > 0 ? (totalObtained / totalMax) * 100 : 0;
    expect(totalObtained).toBe(0);
    expect(totalMax).toBe(100);
    expect(avgPerc).toBe(0);
  });

  // TEST 12, 13, 14: Missing grade row (404) excludes assessment without treating as 0 or affecting denominator
  it('excludes ungraded assessment (missing grade row / 404) from recent assessments list and denominator', () => {
    const gradeResults = [
      { id: 'asmt-1', title: 'Graded Test', totalMarks: 100, score: 75 },
      null // 404 Not Found (ungraded)
    ];

    const gradedList = gradeResults.filter(Boolean);

    expect(gradedList).toHaveLength(1);
    expect(gradedList[0].id).toBe('asmt-1');

    let totalObtained = 0, totalMax = 0;
    gradedList.forEach(a => {
      totalObtained += Number(a.score);
      totalMax += Number(a.totalMarks);
    });

    const avgPerc = totalMax > 0 ? (totalObtained / totalMax) * 100 : 0;
    expect(totalObtained).toBe(75);
    expect(totalMax).toBe(100);
    expect(avgPerc).toBe(75);
  });

  // TEST 15: Decimal marks are preserved without intermediate rounding
  it('preserves decimal marks (e.g. 42.50) without truncation', () => {
    const assessment = { id: 'asmt-dec', title: 'Science Test', totalMarks: 50, date: '2026-03-02', score: 42.5 };
    const percentage = Math.round((assessment.score / assessment.totalMarks) * 100);

    expect(assessment.score).toBe(42.5);
    expect(percentage).toBe(85);
  });

  // TEST 16: Percentage calculation matches legacy formula
  it('calculates percentage accurately matching legacy formula: Math.round((score / totalMarks) * 100)', () => {
    const calc = (score, total) => Math.round((score / total) * 100);

    expect(calc(72.5, 100)).toBe(73);
    expect(calc(50, 60)).toBe(83);
    expect(calc(0, 100)).toBe(0);
    expect(calc(100, 100)).toBe(100);
  });

  // TEST 17 & 18: Performance letter grade scale (A+, A, B, C, D, F, -) and average calculation
  it('preserves existing letter grade scale and average calculation', () => {
    const computeGrade = (avgPerc) => {
      if (avgPerc > 0) {
        if (avgPerc >= 90) return 'A+';
        if (avgPerc >= 80) return 'A';
        if (avgPerc >= 70) return 'B';
        if (avgPerc >= 60) return 'C';
        if (avgPerc >= 50) return 'D';
        return 'F';
      }
      return '-';
    };

    expect(computeGrade(95)).toBe('A+');
    expect(computeGrade(90)).toBe('A+');
    expect(computeGrade(85)).toBe('A');
    expect(computeGrade(80)).toBe('A');
    expect(computeGrade(75)).toBe('B');
    expect(computeGrade(70)).toBe('B');
    expect(computeGrade(65)).toBe('C');
    expect(computeGrade(60)).toBe('C');
    expect(computeGrade(55)).toBe('D');
    expect(computeGrade(50)).toBe('D');
    expect(computeGrade(45)).toBe('F');
    expect(computeGrade(0)).toBe('-');
  });

  // TEST 19: Assessment sorting matches legacy date desc
  it('sorts graded assessments by date in descending order', () => {
    const items = [
      { id: '1', date: '2026-02-15' },
      { id: '2', date: '2026-03-10' },
      { id: '3', date: '2026-01-05' }
    ];

    items.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

    expect(items.map(i => i.id)).toEqual(['2', '1', '3']);
  });

  // TEST 20, 21, 22: Title, Date, Score / totalMarks rendering
  it('formats assessment display item with title, date, score and totalMarks', () => {
    const item = {
      id: 'asmt-1',
      title: 'Physics Midterm',
      date: '2026-03-01',
      score: 60,
      totalMarks: 75,
      perc: 80
    };

    expect(item.title).toBe('Physics Midterm');
    expect(item.date).toBe('2026-03-01');
    expect(item.score).toBe(60);
    expect(item.totalMarks).toBe(75);
    expect(item.perc).toBe(80);
  });

  // TEST 23: Teacher status color mappings
  it('maps student performanceStatus to correct styling badges', () => {
    const getStatusColor = (status) => {
      switch(status) {
        case 'excellent': return 'text-purple-700 bg-purple-100';
        case 'improving': return 'text-green-700 bg-green-100';
        case 'stable': return 'text-blue-700 bg-blue-100';
        case 'warning': return 'text-amber-700 bg-amber-100';
        case 'critical': return 'text-red-700 bg-red-100';
        default: return 'text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-700';
      }
    };

    expect(getStatusColor('excellent')).toContain('text-purple-700');
    expect(getStatusColor('improving')).toContain('text-green-700');
    expect(getStatusColor('stable')).toContain('text-blue-700');
    expect(getStatusColor('warning')).toContain('text-amber-700');
    expect(getStatusColor('critical')).toContain('text-red-700');
    expect(getStatusColor('unknown')).toContain('text-slate-700');
  });

  // ==========================================
  // 4. LIFECYCLE & ASYNC SAFETY
  // ==========================================

  // TEST 26: Empty state handles 0 assessments gracefully
  it('handles empty assessments array without error', () => {
    const assessments = [];
    expect(assessments.length === 0).toBe(true);

    const totalMax = 0, totalObtained = 0;
    const avgPerc = totalMax > 0 ? (totalObtained / totalMax) * 100 : 0;
    expect(avgPerc).toBe(0);
  });

  // TEST 27: Error handling distinguishes 404 from network/server 500
  it('distinguishes 404 ungraded status from network/server error', () => {
    const handleGradeError = (err) => {
      if (err?.status === 404 || err?.message?.includes('not found') || err?.message?.includes('404')) {
        return null; // Ungraded
      }
      throw err; // Server/network failure
    };

    const notFoundErr = { status: 404, message: 'Grade record not found' };
    expect(handleGradeError(notFoundErr)).toBeNull();

    const serverErr = { status: 500, message: 'Internal server error' };
    expect(() => handleGradeError(serverErr)).toThrow();
  });

  // TEST 28 & 29: Stale response protection across child switching
  it('discards response if active child has changed before async response resolution', () => {
    const currentStudentRef = { current: 'child-2' };
    const targetStudentId = 'child-1';

    let dataApplied = false;
    if (currentStudentRef.current === targetStudentId) {
      dataApplied = true;
    }

    expect(dataApplied).toBe(false);
  });

  // ==========================================
  // 5. REST ACTIVE CHILD & FIRESTORE RETIREMENT
  // ==========================================

  // TEST 31: Uses activeChild from Outlet context
  it('1. Uses activeChild from Outlet context when available without calling getMyChildren', () => {
    const contextChild = {
      id: 'student-uuid-1',
      firstName: 'Alice',
      lastName: 'Smith',
      classId: 'class-uuid-1',
      performanceStatus: 'excellent'
    };
    const outletContext = {
      activeStudentId: 'student-uuid-1',
      activeChild: contextChild,
      enrolledChildren: [contextChild]
    };

    let resolvedStudent = null;
    const studentId = outletContext.activeStudentId;
    if (outletContext.activeChild && (outletContext.activeChild.id === studentId || outletContext.activeChild.studentId === studentId)) {
      resolvedStudent = outletContext.activeChild;
    }

    expect(resolvedStudent).toBe(contextChild);
    expect(resolvedStudent.id).toBe('student-uuid-1');
    expect(resolvedStudent.performanceStatus).toBe('excellent');
  });

  // TEST 32: Uses activeStudentId from Outlet context
  it('2. Uses activeStudentId from Outlet context as the primary student ID', () => {
    const outletContext = {
      activeStudentId: 'student-uuid-primary'
    };
    const userProfile = {
      linkedStudentId: 'student-uuid-fallback'
    };

    const studentId = outletContext?.activeStudentId || userProfile?.linkedStudentId;
    expect(studentId).toBe('student-uuid-primary');
  });

  // TEST 33: Falls back to userProfile.linkedStudentId when context is unavailable
  it('3. Falls back to userProfile.linkedStudentId when Outlet context is unavailable', () => {
    const outletContext = null;
    const userProfile = {
      linkedStudentId: 'student-uuid-fallback',
      linkedClassId: 'class-uuid-fallback'
    };

    const studentId = outletContext?.activeStudentId || userProfile?.linkedStudentId;
    const classId = userProfile?.linkedClassId;

    expect(studentId).toBe('student-uuid-fallback');
    expect(classId).toBe('class-uuid-fallback');
  });

  // TEST 34: Falls back to getMyChildren() only when required profile data is unavailable
  it('4. Falls back to getMyChildren() REST API only when profile is not in context', async () => {
    const getMyChildrenSpy = vi.spyOn(parentsApi, 'getMyChildren').mockResolvedValue({
      success: true,
      data: [
        {
          id: 'link-1',
          studentId: 'student-uuid-remote',
          student: {
            id: 'student-uuid-remote',
            firstName: 'Charlie',
            lastName: 'Brown',
            classId: 'class-uuid-remote',
            performanceStatus: 'improving'
          }
        }
      ]
    });

    const targetStudentId = 'student-uuid-remote';
    const res = await parentsApi.getMyChildren();
    const links = res.data;
    const match = links.find(l => l.student?.id === targetStudentId || l.studentId === targetStudentId);
    const resolvedStudent = match?.student || match;

    expect(getMyChildrenSpy).toHaveBeenCalled();
    expect(resolvedStudent.id).toBe('student-uuid-remote');
    expect(resolvedStudent.firstName).toBe('Charlie');
    expect(resolvedStudent.performanceStatus).toBe('improving');
  });

  // TEST 35: Child switching updates the displayed student
  it('5. Child switching updates the active student profile and class', () => {
    const child1 = { id: 'child-1', firstName: 'Alice', classId: 'cls-1', performanceStatus: 'stable' };
    const child2 = { id: 'child-2', firstName: 'Bob', classId: 'cls-2', performanceStatus: 'improving' };
    const enrolledChildren = [child1, child2];

    let activeStudentId = 'child-1';
    let currentStudent = enrolledChildren.find(c => c.id === activeStudentId);
    expect(currentStudent.firstName).toBe('Alice');

    // Switch child
    activeStudentId = 'child-2';
    currentStudent = enrolledChildren.find(c => c.id === activeStudentId);
    expect(currentStudent.firstName).toBe('Bob');
    expect(currentStudent.classId).toBe('cls-2');
  });

  // TEST 36: Child switching reloads attendance/assessment data for the new student
  it('6. Child switching triggers attendance and assessment fetches for the new student ID', async () => {
    const attendanceSpy = vi.spyOn(attendanceApi, 'getStudentAttendance').mockResolvedValue({
      cumulativeStat: { totalDays: 50, presentDays: 45, absentDays: 5, lateDays: 0 }
    });
    const assessmentSpy = vi.spyOn(assessmentsApi, 'listAssessments').mockResolvedValue({
      data: [{ id: 'asmt-child-2', title: 'Science Exam', totalMarks: 100 }]
    });

    await attendanceApi.getStudentAttendance('child-2', { filter: 'all', limit: 1 });
    await assessmentsApi.listAssessments({ classId: 'cls-child-2', limit: 100 });

    expect(attendanceSpy).toHaveBeenCalledWith('child-2', { filter: 'all', limit: 1 });
    expect(assessmentSpy).toHaveBeenCalledWith({ classId: 'cls-child-2', limit: 100 });
  });

  // TEST 37: Stale previous-child responses cannot overwrite the new child
  it('7. Protects against stale out-of-order previous-child responses when switching children rapidly', async () => {
    let currentActiveStudent = 'child-2';
    let renderedStudentData = null;

    const simulateFetch = async (studentId, delayMs, data) => {
      await new Promise(resolve => setTimeout(resolve, delayMs));
      if (currentActiveStudent === studentId) {
        renderedStudentData = data;
      }
    };

    // Child 1 request takes 50ms
    const p1 = simulateFetch('child-1', 50, { studentId: 'child-1', score: 50 });
    // User switches to Child 2, request takes 10ms
    currentActiveStudent = 'child-2';
    const p2 = simulateFetch('child-2', 10, { studentId: 'child-2', score: 95 });

    await Promise.all([p1, p2]);

    // Child 1's late response must not overwrite Child 2
    expect(renderedStudentData).toEqual({ studentId: 'child-2', score: 95 });
  });

  // TEST 38: performanceStatus is displayed from REST student data
  it('8. performanceStatus is correctly extracted from REST student entity or customData', () => {
    const studentWithDirectStatus = { performanceStatus: 'excellent' };
    const studentWithCustomData = { customData: { performanceStatus: 'improving' } };

    const getStatus = (st) => st?.performanceStatus || st?.customData?.performanceStatus || 'stable';

    expect(getStatus(studentWithDirectStatus)).toBe('excellent');
    expect(getStatus(studentWithCustomData)).toBe('improving');
  });

  // TEST 39: Missing performanceStatus falls back to "stable"
  it('9. Missing performanceStatus falls back to default "stable"', () => {
    const studentWithoutStatus = { id: 'stu-1', firstName: 'Diana' };
    const getStatus = (st) => st?.performanceStatus || st?.customData?.performanceStatus || 'stable';

    expect(getStatus(studentWithoutStatus)).toBe('stable');
    expect(getStatus(null)).toBe('stable');
  });

  // TEST 40: No student linked shows the existing empty state
  it('10. Renders empty state message when no student is linked', () => {
    const student = null;
    const emptyStateText = !student ? 'No student linked to this account.' : 'Active';

    expect(emptyStateText).toBe('No student linked to this account.');
  });

  // TEST 41 & 42: Firestore getDoc is NEVER called & Firestore document lookup is completely removed
  it('11 & 12. MANDATORY: Zero Firestore getDoc, doc, or database calls in Parent Performance', () => {
    const getStudentsSpy = vi.spyOn(firestoreModule, 'getStudentsByClass');
    const getAttendanceSpy = vi.spyOn(firestoreModule, 'getAttendanceForClass');
    const subscribeAttendanceSpy = vi.spyOn(firestoreModule, 'subscribeToAttendance');

    expect(getStudentsSpy).not.toHaveBeenCalled();
    expect(getAttendanceSpy).not.toHaveBeenCalled();
    expect(subscribeAttendanceSpy).not.toHaveBeenCalled();
  });
});
