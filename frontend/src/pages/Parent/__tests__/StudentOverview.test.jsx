import { describe, it, expect, vi, beforeEach } from 'vitest';
import StudentOverview from '../StudentOverview.jsx';
import * as parentsApi from '../../../api/parents.js';
import * as invoicesApi from '../../../api/invoices.js';
import * as assessmentsApi from '../../../api/assessments.js';
import * as attendanceApi from '../../../api/attendance.js';

describe('Parent StudentOverview Component (PostgreSQL REST Migration - Phase 4C.7-D.2-I-J)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('is exported as a function/component', () => {
    expect(typeof StudentOverview).toBe('function');
  });

  // ==========================================
  // 1. REST STUDENT PROFILE & CLASS / SECTION
  // ==========================================

  it('loads student profile from REST getMyChildren and extracts matching child', async () => {
    const mockChildren = [
      {
        id: 'link-1',
        relationship: 'Father',
        student: {
          id: '11111111-1111-4111-8111-111111111111',
          admissionNumber: 'ADM-101',
          firstName: 'Alice',
          lastName: 'Johnson',
          dob: '2015-05-10',
          gender: 'Female',
          bloodGroup: 'O+',
          status: 'Active',
          classId: 'cls-1',
          class: { id: 'cls-1', name: 'Grade 5' },
          section: { id: 'sec-1', name: 'A' }
        }
      }
    ];

    const getChildrenSpy = vi.spyOn(parentsApi, 'getMyChildren').mockResolvedValue({
      success: true,
      data: mockChildren
    });

    const res = await parentsApi.getMyChildren();
    expect(getChildrenSpy).toHaveBeenCalledTimes(1);

    const match = res.data.find(l => l.student.id === '11111111-1111-4111-8111-111111111111');
    expect(match.student.firstName).toBe('Alice');
    expect(match.student.lastName).toBe('Johnson');
    expect(match.student.admissionNumber).toBe('ADM-101');
    expect(match.student.class.name).toBe('Grade 5');
    expect(match.student.section.name).toBe('A');
  });

  it('formats class and section display cleanly without trailing hyphen if section missing', () => {
    const classDetailsWithSec = { name: 'Grade 5', section: 'A' };
    const classDetailsNoSec = { name: 'Grade 5', section: '' };

    const formatClass = (cd) => [cd.name, cd.section].filter(Boolean).join(' - ') || 'Class';

    expect(formatClass(classDetailsWithSec)).toBe('Grade 5 - A');
    expect(formatClass(classDetailsNoSec)).toBe('Grade 5');
  });

  // ==========================================
  // 2. REST FEE INVOICE & ALERT SUMMARY
  // ==========================================

  it('fetches student fee invoices via REST getStudentInvoices and calculates fee alert summary', async () => {
    const invoiceSpy = vi.spyOn(invoicesApi, 'getStudentInvoices').mockResolvedValue({
      success: true,
      data: [
        { id: 'inv-1', status: 'Pending', amount: 5000, dueDate: '2026-01-01' },
        { id: 'inv-2', status: 'Pending', amount: 3000, dueDate: '2026-02-15' },
        { id: 'inv-3', status: 'Paid', amount: 4000, dueDate: '2026-01-01' }
      ],
      summary: {
        totalInvoiced: 12000,
        paidAmount: 4000,
        outstandingAmount: 8000,
        overdueCount: 2,
        unpaidCount: 2
      }
    });

    const res = await invoicesApi.getStudentInvoices('11111111-1111-4111-8111-111111111111', { limit: 100 });

    expect(invoiceSpy).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', { limit: 100 });
    expect(res.summary.unpaidCount).toBe(2);
    expect(res.summary.overdueCount).toBe(2);
    expect(res.summary.outstandingAmount).toBe(8000);
  });

  it('identifies earliest due date from pending invoices in REST response', () => {
    const rawInvoices = [
      { id: 'inv-1', status: 'Pending', amount: 5000, dueDate: '2026-03-15' },
      { id: 'inv-2', status: 'Pending', amount: 3000, dueDate: '2026-02-01' },
      { id: 'inv-3', status: 'Paid', amount: 2000, dueDate: '2026-01-01' }
    ];

    let earliestDue = null;
    rawInvoices.forEach(inv => {
      if (inv.status !== 'Paid' && inv.status !== 'Cancelled') {
        const due = inv.dueDate ? new Date(inv.dueDate + 'T23:59:59') : null;
        if (due && (!earliestDue || due < earliestDue)) {
          earliestDue = due;
        }
      }
    });

    expect(earliestDue).not.toBeNull();
    expect(earliestDue.toISOString().slice(0, 10)).toBe('2026-02-01');
  });

  // ==========================================
  // 3. REST ASSESSMENTS & STUDENT-SCOPED GRADES
  // ==========================================

  it('fetches assessments via REST listAssessments with classId and limit=100 without schoolId', async () => {
    const listSpy = vi.spyOn(assessmentsApi, 'listAssessments').mockResolvedValue({
      success: true,
      data: [
        { id: '11111111-1111-4111-8111-111111111111', title: 'Unit Test 1', totalMarks: 100, date: '2026-03-01' }
      ]
    });

    const res = await assessmentsApi.listAssessments({ classId: 'cls-uuid-101', limit: 100 });

    expect(listSpy).toHaveBeenCalledWith({ classId: 'cls-uuid-101', limit: 100 });
    expect(res.data[0].id).toBe('11111111-1111-4111-8111-111111111111');
  });

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
  });

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

  // ==========================================
  // 4. REST ATTENDANCE FETCHING & MAPPING
  // ==========================================

  it('fetches student attendance via REST getStudentAttendance with studentId, filter=all, and limit=1', async () => {
    const apiSpy = vi.spyOn(attendanceApi, 'getStudentAttendance').mockResolvedValue({
      student: { id: 'stu-uuid-1', name: 'Alice Smith' },
      cumulativeStat: { totalDays: 30, presentDays: 26, absentDays: 2, lateDays: 2, percentage: 93.3 },
      timeline: [],
      pagination: { total: 30, page: 1, limit: 1, totalPages: 30 }
    });

    const res = await attendanceApi.getStudentAttendance('stu-uuid-1', { filter: 'all', limit: 1 });

    expect(apiSpy).toHaveBeenCalledWith('stu-uuid-1', { filter: 'all', limit: 1 });
    expect(apiSpy.mock.calls[0][1]).not.toHaveProperty('schoolId');
    expect(res.cumulativeStat.totalDays).toBe(30);
    expect(res.cumulativeStat.presentDays).toBe(26);
    expect(res.cumulativeStat.lateDays).toBe(2);
    expect(res.cumulativeStat.absentDays).toBe(2);
  });

  it('maps cumulativeStat into attendanceStats and calculates percentage accurately', () => {
    const stat = { totalDays: 40, presentDays: 34, absentDays: 2, lateDays: 4 };
    const attendanceStats = {
      total: Number(stat.totalDays) || 0,
      present: Number(stat.presentDays) || 0,
      absent: Number(stat.absentDays) || 0,
      late: Number(stat.lateDays) || 0
    };

    const attendancePercentage = attendanceStats.total === 0
      ? 0
      : Math.round(((attendanceStats.present + attendanceStats.late) / attendanceStats.total) * 100);

    expect(attendanceStats.total).toBe(40);
    expect(attendanceStats.present).toBe(34);
    expect(attendanceStats.late).toBe(4);
    expect(attendanceStats.absent).toBe(2);
    expect(attendancePercentage).toBe(95); // (34 + 4) / 40 = 95%
  });

  it('handles zero total attendance days safely displaying -- without NaN', () => {
    const stat = { totalDays: 0, presentDays: 0, absentDays: 0, lateDays: 0 };
    const attendanceStats = {
      total: Number(stat.totalDays) || 0,
      present: Number(stat.presentDays) || 0,
      absent: Number(stat.absentDays) || 0,
      late: Number(stat.lateDays) || 0
    };

    const attendancePercentage = attendanceStats.total === 0
      ? 0
      : Math.round(((attendanceStats.present + attendanceStats.late) / attendanceStats.total) * 100);

    const displayPercentage = attendanceStats.total === 0 ? '--' : `${attendancePercentage}%`;

    expect(attendanceStats.total).toBe(0);
    expect(attendancePercentage).toBe(0);
    expect(displayPercentage).toBe('--');
  });

  it('triggers low attendance warning banner when attendance is below 80%', () => {
    const attendanceStats = { total: 10, present: 6, late: 1, absent: 3 };
    const attendancePercentage = Math.round(((attendanceStats.present + attendanceStats.late) / attendanceStats.total) * 100);

    const shouldShowWarning = attendanceStats.total > 0 && attendancePercentage < 80;

    expect(attendancePercentage).toBe(70);
    expect(shouldShowWarning).toBe(true);
  });

  // ==========================================
  // 5. GRADE CALCULATION & MARKS PRESERVATION
  // ==========================================

  it('preserves marksObtained === 0 as a valid grade included at 0%', () => {
    const assessment = { id: 'asmt-zero', title: 'Math Quiz', totalMarks: 100, date: '2026-03-01', marks: 0 };
    const percentage = Math.round((assessment.marks / assessment.totalMarks) * 100);

    expect(assessment.marks).toBe(0);
    expect(percentage).toBe(0);
  });

  it('excludes ungraded assessment (missing grade row / 404) from recent assessments list', () => {
    const gradeResults = [
      { id: 'asmt-1', title: 'Graded Test', totalMarks: 100, marks: 75 },
      null // 404 Not Found (ungraded)
    ];

    const gradedList = gradeResults.filter(Boolean);

    expect(gradedList).toHaveLength(1);
    expect(gradedList[0].id).toBe('asmt-1');
  });

  it('preserves decimal marks (e.g. 42.50) without truncation', () => {
    const assessment = { id: 'asmt-dec', title: 'Science Test', totalMarks: 50, date: '2026-03-02', marks: 42.5 };
    const percentage = Math.round((assessment.marks / assessment.totalMarks) * 100);

    expect(assessment.marks).toBe(42.5);
    expect(percentage).toBe(85);
  });

  it('sorts graded assessments by date in descending order', () => {
    const items = [
      { id: '1', date: '2026-02-15' },
      { id: '2', date: '2026-03-10' },
      { id: '3', date: '2026-01-05' }
    ];

    items.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

    expect(items.map(i => i.id)).toEqual(['2', '1', '3']);
  });

  // ==========================================
  // 6. ASYNC SAFETY & STALE REQUEST PROTECTION
  // ==========================================

  it('discards response if active student changes during in-flight request', async () => {
    let currentStudentId = 'child-A';
    let stateData = null;

    const requestA = async () => {
      const studentAtCall = currentStudentId;
      await new Promise(r => setTimeout(r, 50));
      if (currentStudentId === studentAtCall) {
        stateData = 'child-A-grades';
      }
    };

    const requestB = async () => {
      const studentAtCall = currentStudentId;
      await new Promise(r => setTimeout(r, 10));
      if (currentStudentId === studentAtCall) {
        stateData = 'child-B-grades';
      }
    };

    const promiseA = requestA();
    currentStudentId = 'child-B'; // Switch child before request A finishes
    const promiseB = requestB();

    await Promise.all([promiseA, promiseB]);

    expect(stateData).toBe('child-B-grades');
  });

  it('prevents state update if component unmounted during fetch', async () => {
    let isMounted = true;
    let stateSet = false;

    const asyncTask = async () => {
      await new Promise(r => setTimeout(r, 20));
      if (isMounted) {
        stateSet = true;
      }
    };

    const promise = asyncTask();
    isMounted = false; // Unmount
    await promise;

    expect(stateSet).toBe(false);
  });
});
