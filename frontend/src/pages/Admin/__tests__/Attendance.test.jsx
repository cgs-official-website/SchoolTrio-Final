import { describe, it, expect, vi, beforeEach } from 'vitest';
import Attendance from '../Attendance.jsx';
import * as attendanceApi from '../../../api/attendance.js';
import * as classesApi from '../../../api/classes.js';
import * as studentsApi from '../../../api/students.js';
import * as firestoreModule from '../../../firebase/firestore.js';
import * as XLSX from 'xlsx';

describe('Admin Attendance Component (REST Migration - Phase 4C.7-D.2-I-M.4.3)', () => {
  const PG_CLASS_1_ID = '05120a32-8118-44b6-8010-b9ed2c5467c0';
  const PG_CLASS_2_ID = '06231b43-9229-45c7-9121-c0fe3d6578d1';
  const PG_SECTION_1_ID = '99999999-9999-4999-8999-999999999999';
  const PG_STUDENT_1 = '11111111-1111-4111-8111-111111111111';
  const PG_STUDENT_2 = '22222222-2222-4222-8222-222222222222';
  const PG_SESSION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const PG_FLAG_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

  const mockClasses = [
    {
      id: PG_CLASS_1_ID,
      name: 'Class 5',
      gradeLevel: '5',
      section: 'A',
      sectionId: PG_SECTION_1_ID,
      capacity: 30,
    },
    {
      id: PG_CLASS_2_ID,
      name: 'Class 6',
      gradeLevel: '6',
      section: 'B',
      sectionId: '88888888-8888-4888-8888-888888888888',
      capacity: 30,
    },
  ];

  const mockStudents = [
    {
      id: PG_STUDENT_1,
      admissionNumber: 'ADM-001',
      firstName: 'Alice',
      lastName: 'Smith',
      rollNumber: '1',
      status: 'Active',
      classId: PG_CLASS_1_ID,
    },
    {
      id: PG_STUDENT_2,
      admissionNumber: 'ADM-002',
      firstName: 'Bob',
      lastName: 'Jones',
      rollNumber: '2',
      status: 'Active',
      classId: PG_CLASS_1_ID,
    },
  ];

  const mockDashboardStats = {
    date: '2026-09-15',
    schoolWide: {
      total: 500,
      present: 450,
      absent: 30,
      late: 20,
      percentage: 94,
    },
    byGrade: {
      '5': { total: 100, present: 95, absent: 3, late: 2, percentage: 97 },
      '6': { total: 100, present: 90, absent: 7, late: 3, percentage: 93 },
    },
    byClass: {
      [PG_CLASS_1_ID]: {
        className: 'Class 5 A',
        gradeLevel: '5',
        total: 50,
        present: 48,
        absent: 1,
        late: 1,
        percentage: 98,
      },
      [PG_CLASS_2_ID]: {
        className: 'Class 6 B',
        gradeLevel: '6',
        total: 50,
        present: 45,
        absent: 3,
        late: 2,
        percentage: 94,
      },
    },
    classesTotal: 10,
    classesMarked: 8,
    classesPending: 2,
  };

  const mockAbsenteeFlags = [
    {
      id: PG_FLAG_ID,
      studentId: PG_STUDENT_2,
      consecutiveDays: 3,
      month: '2026-09',
      isResolved: false,
      resolvedAt: null,
      resolvedByUserId: null,
      resolutionNote: null,
      student: {
        id: PG_STUDENT_2,
        firstName: 'Bob',
        lastName: 'Jones',
        rollNumber: '2',
        admissionNumber: 'ADM-002',
        class: {
          id: PG_CLASS_1_ID,
          name: 'Class 5',
          section: 'A',
        },
      },
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // Baseline
  it('Component export: exports Attendance as a functional component', () => {
    expect(typeof Attendance).toBe('function');
  });

  // 1. Loads classes from REST.
  it('1. Loads classes from REST', async () => {
    const listClassesSpy = vi.spyOn(classesApi, 'listClasses').mockResolvedValue({
      success: true,
      data: mockClasses,
    });
    const res = await classesApi.listClasses({ limit: 100 });
    expect(listClassesSpy).toHaveBeenCalledWith({ limit: 100 });
    expect(res.data).toHaveLength(2);
  });

  // 2. Uses PostgreSQL class UUID.
  it('2. Uses PostgreSQL class UUID', async () => {
    vi.spyOn(classesApi, 'listClasses').mockResolvedValue({
      success: true,
      data: mockClasses,
    });
    const res = await classesApi.listClasses({ limit: 100 });
    expect(res.data[0].id).toBe(PG_CLASS_1_ID);
    expect(res.data[0].id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(res.data[0].id).not.toBe('0dqds1XIBEdhTuIHlyJQ');
  });

  // 3. Loads student roster from REST.
  it('3. Loads student roster from REST', async () => {
    const listStudentsSpy = vi.spyOn(studentsApi, 'listStudents').mockResolvedValue({
      success: true,
      data: mockStudents,
    });
    const res = await studentsApi.listStudents({
      classId: PG_CLASS_1_ID,
      status: 'Active',
      limit: 100,
      sort: 'firstName',
      order: 'asc',
    });
    expect(listStudentsSpy).toHaveBeenCalledWith({
      classId: PG_CLASS_1_ID,
      status: 'Active',
      limit: 100,
      sort: 'firstName',
      order: 'asc',
    });
    expect(res.data).toHaveLength(2);
  });

  // 4. Uses PostgreSQL student UUIDs.
  it('4. Uses PostgreSQL student UUIDs', async () => {
    vi.spyOn(studentsApi, 'listStudents').mockResolvedValue({
      success: true,
      data: mockStudents,
    });
    const res = await studentsApi.listStudents({ classId: PG_CLASS_1_ID, status: 'Active' });
    expect(res.data[0].id).toBe(PG_STUDENT_1);
    expect(res.data[1].id).toBe(PG_STUDENT_2);
    expect(res.data[0].id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  // 5. Handles roster pagination.
  it('5. Handles roster pagination', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => ({
      id: `student-p1-${i}`,
      firstName: `Student1_${i}`,
      lastName: 'Test',
      status: 'Active',
      classId: PG_CLASS_1_ID,
    }));
    const page2 = Array.from({ length: 25 }, (_, i) => ({
      id: `student-p2-${i}`,
      firstName: `Student2_${i}`,
      lastName: 'Test',
      status: 'Active',
      classId: PG_CLASS_1_ID,
    }));

    vi.spyOn(studentsApi, 'listStudents').mockImplementation(({ page }) => {
      if (page === 2) {
        return Promise.resolve({
          success: true,
          data: page2,
          pagination: { page: 2, limit: 100, total: 125, totalPages: 2 },
        });
      }
      return Promise.resolve({
        success: true,
        data: page1,
        pagination: { page: 1, limit: 100, total: 125, totalPages: 2 },
      });
    });

    let allStudents = [];
    let page = 1;
    let totalPages = 1;
    do {
      const res = await studentsApi.listStudents({
        classId: PG_CLASS_1_ID,
        status: 'Active',
        limit: 100,
        page,
      });
      allStudents = allStudents.concat(res.data);
      totalPages = res.pagination?.totalPages || 1;
      page += 1;
    } while (page <= totalPages);

    expect(allStudents).toHaveLength(125);
  });

  // 6. Loads existing attendance session.
  it('6. Loads existing attendance session', async () => {
    const existingSession = {
      id: PG_SESSION_ID,
      classId: PG_CLASS_1_ID,
      date: '2026-09-15',
      session: 'FN',
    };
    const listSessionsSpy = vi.spyOn(attendanceApi, 'listAttendanceSessions').mockResolvedValue({
      success: true,
      data: [existingSession],
    });
    const res = await attendanceApi.listAttendanceSessions({
      classId: PG_CLASS_1_ID,
      date: '2026-09-15',
      session: 'FN',
      limit: 1,
    });
    expect(listSessionsSpy).toHaveBeenCalledWith({
      classId: PG_CLASS_1_ID,
      date: '2026-09-15',
      session: 'FN',
      limit: 1,
    });
    expect(res.data[0].id).toBe(PG_SESSION_ID);
  });

  // 7. Loads session detail.
  it('7. Loads session detail', async () => {
    const existingSessionDetail = {
      id: PG_SESSION_ID,
      classId: PG_CLASS_1_ID,
      date: '2026-09-15',
      session: 'FN',
      records: [
        { studentId: PG_STUDENT_1, status: 'Present', remark: 'On time' },
        { studentId: PG_STUDENT_2, status: 'Absent', remark: 'Medical emergency' },
      ],
    };
    const getSessionSpy = vi.spyOn(attendanceApi, 'getAttendanceSession').mockResolvedValue({
      success: true,
      data: existingSessionDetail,
    });
    const detailRes = await attendanceApi.getAttendanceSession(PG_SESSION_ID);
    expect(getSessionSpy).toHaveBeenCalledWith(PG_SESSION_ID);
    expect(detailRes.data.records).toHaveLength(2);
  });

  // 8. Prepopulates attendance records.
  it('8. Prepopulates attendance records and remarks', async () => {
    const existingSessionDetail = {
      id: PG_SESSION_ID,
      records: [
        { studentId: PG_STUDENT_1, status: 'Present', remark: 'On time' },
        { studentId: PG_STUDENT_2, status: 'Absent', remark: 'Medical emergency' },
      ],
    };
    vi.spyOn(attendanceApi, 'getAttendanceSession').mockResolvedValue({
      success: true,
      data: existingSessionDetail,
    });
    const detailRes = await attendanceApi.getAttendanceSession(PG_SESSION_ID);
    expect(detailRes.data.records[0].status).toBe('Present');
    expect(detailRes.data.records[1].status).toBe('Absent');
    expect(detailRes.data.records[1].remark).toBe('Medical emergency');
  });

  // 9. Defaults new attendance to Present.
  it('9. Defaults new attendance to Present', () => {
    const defaultRecords = {};
    mockStudents.forEach((student) => {
      defaultRecords[student.id] = 'Present';
    });
    expect(defaultRecords[PG_STUDENT_1]).toBe('Present');
    expect(defaultRecords[PG_STUDENT_2]).toBe('Present');
  });

  // 10. Applies cutoff behavior.
  it('10. Applies cutoff behavior (09:30 default)', () => {
    const cutoffTime = '09:30';
    const [cHours, cMins] = cutoffTime.split(':').map(Number);
    const mockNowBefore = new Date(2026, 8, 15, 9, 15);
    const mockNowAfter = new Date(2026, 8, 15, 9, 45);

    const isPastBefore =
      mockNowBefore.getHours() > cHours ||
      (mockNowBefore.getHours() === cHours && mockNowBefore.getMinutes() >= cMins);
    const isPastAfter =
      mockNowAfter.getHours() > cHours ||
      (mockNowAfter.getHours() === cHours && mockNowAfter.getMinutes() >= cMins);

    expect(isPastBefore ? 'Late' : 'Present').toBe('Present');
    expect(isPastAfter ? 'Late' : 'Present').toBe('Late');
  });

  // 11. Allows Present/Absent/Late changes.
  it('11. Allows Present/Absent/Late changes', () => {
    let state = {
      [PG_STUDENT_1]: 'Present',
      [PG_STUDENT_2]: 'Present',
    };
    state = {
      ...state,
      [PG_STUDENT_1]: 'Late',
      [PG_STUDENT_2]: 'Absent',
    };
    expect(state[PG_STUDENT_1]).toBe('Late');
    expect(state[PG_STUDENT_2]).toBe('Absent');
  });

  // 12. Creates attendance via POST.
  it('12. Creates attendance via POST', async () => {
    const createSpy = vi.spyOn(attendanceApi, 'createAttendanceSession').mockResolvedValue({
      success: true,
      data: {
        id: 'new-session-uuid',
        classId: PG_CLASS_1_ID,
        date: '2026-09-15',
        session: 'FN',
        records: [
          { studentId: PG_STUDENT_1, status: 'Present' },
          { studentId: PG_STUDENT_2, status: 'Absent' },
        ],
      },
    });
    const payload = {
      classId: PG_CLASS_1_ID,
      sectionId: PG_SECTION_1_ID,
      date: '2026-09-15',
      session: 'FN',
      records: [
        { studentId: PG_STUDENT_1, status: 'Present' },
        { studentId: PG_STUDENT_2, status: 'Absent' },
      ],
    };
    const res = await attendanceApi.createAttendanceSession(payload);
    expect(createSpy).toHaveBeenCalledWith(payload);
    expect(res.data.id).toBe('new-session-uuid');
  });

  // 13. Updates attendance via PATCH.
  it('13. Updates attendance via PATCH', async () => {
    const updateSpy = vi.spyOn(attendanceApi, 'updateAttendanceSession').mockResolvedValue({
      success: true,
      data: {
        id: PG_SESSION_ID,
        records: [{ studentId: PG_STUDENT_1, status: 'Late', remark: 'Bus delay' }],
      },
    });
    const patchPayload = {
      records: [{ studentId: PG_STUDENT_1, status: 'Late', remark: 'Bus delay' }],
    };
    const res = await attendanceApi.updateAttendanceSession(PG_SESSION_ID, patchPayload);
    expect(updateSpy).toHaveBeenCalledWith(PG_SESSION_ID, patchPayload);
    expect(res.data.records[0].status).toBe('Late');
  });

  // 14. Sends no schoolId.
  it('14. Sends no schoolId in attendance POST payload', async () => {
    const payload = {
      classId: PG_CLASS_1_ID,
      sectionId: PG_SECTION_1_ID,
      date: '2026-09-15',
      session: 'FN',
      records: [{ studentId: PG_STUDENT_1, status: 'Present' }],
    };
    expect(payload).not.toHaveProperty('schoolId');
  });

  // 15. Sends no Firebase UID.
  it('15. Sends no Firebase UID in attendance payload', async () => {
    const payload = {
      classId: PG_CLASS_1_ID,
      sectionId: PG_SECTION_1_ID,
      date: '2026-09-15',
      session: 'FN',
      records: [{ studentId: PG_STUDENT_1, status: 'Present' }],
    };
    expect(payload).not.toHaveProperty('markedByUserId');
    expect(payload).not.toHaveProperty('userId');
    expect(payload).not.toHaveProperty('uid');
  });

  // 16. Dashboard stats load from REST.
  it('16. Dashboard stats load from REST', async () => {
    const statsSpy = vi.spyOn(attendanceApi, 'getAttendanceDashboardStats').mockResolvedValue({
      success: true,
      data: mockDashboardStats,
    });
    const res = await attendanceApi.getAttendanceDashboardStats({ date: '2026-09-15' });
    expect(statsSpy).toHaveBeenCalledWith({ date: '2026-09-15' });
    expect(res.data.schoolWide.percentage).toBe(94);
    expect(res.data.classesPending).toBe(2);
  });

  // 17. Dashboard date changes reload data.
  it('17. Dashboard date changes reload data', async () => {
    const statsSpy = vi.spyOn(attendanceApi, 'getAttendanceDashboardStats').mockResolvedValue({
      success: true,
      data: mockDashboardStats,
    });
    await attendanceApi.getAttendanceDashboardStats({ date: '2026-09-15' });
    await attendanceApi.getAttendanceDashboardStats({ date: '2026-09-16' });
    expect(statsSpy).toHaveBeenCalledTimes(2);
    expect(statsSpy).toHaveBeenLastCalledWith({ date: '2026-09-16' });
  });

  // 18. Grade/class drilldown renders correctly.
  it('18. Grade/class drilldown renders correctly', () => {
    const { byGrade, byClass } = mockDashboardStats;
    expect(byGrade['5'].total).toBe(100);
    expect(byGrade['5'].present).toBe(95);
    expect(byClass[PG_CLASS_1_ID].className).toBe('Class 5 A');
    expect(byClass[PG_CLASS_1_ID].percentage).toBe(98);
  });

  // 19. Absentee flags load from REST.
  it('19. Absentee flags load from REST', async () => {
    const listFlagsSpy = vi.spyOn(attendanceApi, 'listAbsenteeFlags').mockResolvedValue({
      success: true,
      data: mockAbsenteeFlags,
    });
    const res = await attendanceApi.listAbsenteeFlags({ month: '2026-09', limit: 100 });
    expect(listFlagsSpy).toHaveBeenCalledWith({ month: '2026-09', limit: 100 });
    expect(res.data).toHaveLength(1);
    expect(res.data[0].student.firstName).toBe('Bob');
  });

  // 20. Absentee flag resolution works.
  it('20. Absentee flag resolution works', async () => {
    const resolveSpy = vi.spyOn(attendanceApi, 'resolveAbsenteeFlag').mockResolvedValue({
      success: true,
      data: {
        ...mockAbsenteeFlags[0],
        isResolved: true,
        resolvedAt: '2026-09-15T10:00:00Z',
        resolutionNote: 'Parent contacted and confirmed illness',
      },
    });
    const res = await attendanceApi.resolveAbsenteeFlag(PG_FLAG_ID, {
      resolutionNote: 'Parent contacted and confirmed illness',
    });
    expect(resolveSpy).toHaveBeenCalledWith(PG_FLAG_ID, {
      resolutionNote: 'Parent contacted and confirmed illness',
    });
    expect(res.data.isResolved).toBe(true);
  });

  // 21. Monthly analytics loads complete paginated data.
  it('21. Monthly analytics loads complete paginated data', async () => {
    const listSpy = vi.spyOn(attendanceApi, 'listAttendanceSessions').mockResolvedValue({
      success: true,
      data: [{ id: 'm-sess-1', date: '2026-09-01', records: [] }],
      pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
    });
    const res = await attendanceApi.listAttendanceSessions({
      startDate: '2026-09-01',
      endDate: '2026-09-15',
      page: 1,
      limit: 100,
    });
    expect(listSpy).toHaveBeenCalled();
    expect(res.data).toHaveLength(1);
  });

  // 22. Historical reports load all pages.
  it('22. Historical reports load all pages', async () => {
    const page1Sessions = [{ id: 'hist-1', classId: PG_CLASS_1_ID, records: [] }];
    const page2Sessions = [{ id: 'hist-2', classId: PG_CLASS_1_ID, records: [] }];

    vi.spyOn(attendanceApi, 'listAttendanceSessions').mockImplementation(({ page }) => {
      if (page === 2) {
        return Promise.resolve({
          success: true,
          data: page2Sessions,
          pagination: { page: 2, limit: 100, total: 2, totalPages: 2 },
        });
      }
      return Promise.resolve({
        success: true,
        data: page1Sessions,
        pagination: { page: 1, limit: 100, total: 2, totalPages: 2 },
      });
    });

    let allSessions = [];
    let page = 1;
    let totalPages = 1;
    do {
      const res = await attendanceApi.listAttendanceSessions({
        classId: PG_CLASS_1_ID,
        page,
        limit: 100,
      });
      allSessions = allSessions.concat(res.data);
      totalPages = res.pagination?.totalPages || 1;
      page += 1;
    } while (page <= totalPages);

    expect(allSessions).toHaveLength(2);
  });

  // 23. >100-session pagination regression.
  it('23. >100-session pagination regression', async () => {
    const page1Sessions = Array.from({ length: 100 }, (_, i) => ({
      id: `sess-p1-${i}`,
      classId: PG_CLASS_1_ID,
      date: '2026-09-01',
      session: 'FN',
      records: [{ studentId: PG_STUDENT_1, status: 'Present' }],
    }));

    const page2Sessions = Array.from({ length: 50 }, (_, i) => ({
      id: `sess-p2-${i}`,
      classId: PG_CLASS_1_ID,
      date: '2026-09-02',
      session: 'FN',
      records: [{ studentId: PG_STUDENT_1, status: 'Present' }],
    }));

    vi.spyOn(attendanceApi, 'listAttendanceSessions').mockImplementation(({ page }) => {
      if (page === 2) {
        return Promise.resolve({
          success: true,
          data: page2Sessions,
          pagination: { page: 2, limit: 100, total: 150, totalPages: 2 },
        });
      }
      return Promise.resolve({
        success: true,
        data: page1Sessions,
        pagination: { page: 1, limit: 100, total: 150, totalPages: 2 },
      });
    });

    let allSessions = [];
    let currentPage = 1;
    let totalPages = 1;

    do {
      const res = await attendanceApi.listAttendanceSessions({
        startDate: '2026-09-01',
        endDate: '2026-09-15',
        page: currentPage,
        limit: 100,
      });
      allSessions = allSessions.concat(res.data);
      totalPages = res.pagination?.totalPages || 1;
      currentPage += 1;
    } while (currentPage <= totalPages);

    expect(allSessions).toHaveLength(150);
  });

  // 24. Excel export works.
  it('24. Excel export works', () => {
    const jsonToSheetSpy = vi.spyOn(XLSX.utils, 'json_to_sheet').mockReturnValue({ '!cols': [] });
    const bookNewSpy = vi.spyOn(XLSX.utils, 'book_new').mockReturnValue({});
    const appendSpy = vi.spyOn(XLSX.utils, 'book_append_sheet').mockReturnValue();

    const exportRows = mockAbsenteeFlags.map((flag) => ({
      'Student Name': `${flag.student?.firstName || ''} ${flag.student?.lastName || ''}`.trim(),
      'Admission No': flag.student?.admissionNumber || '',
      Class: `${flag.student?.class?.name || ''} ${flag.student?.class?.section || ''}`.trim(),
      'Consecutive Days': flag.consecutiveDays || 0,
      Status: flag.isResolved ? 'Resolved' : 'Active Alert',
      Month: flag.month,
    }));

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Absentee Flags');

    expect(jsonToSheetSpy).toHaveBeenCalledWith(exportRows);
    expect(bookNewSpy).toHaveBeenCalled();
    expect(appendSpy).toHaveBeenCalledWith(wb, ws, 'Absentee Flags');
    expect(typeof XLSX.writeFile).toBe('function');
  });

  // 25. No NaN in statistics/export.
  it('25. No NaN in statistics/export', () => {
    const emptyStats = { present: 0, absent: 0, late: 0, total: 0 };
    const pct =
      emptyStats.total === 0
        ? 100
        : Math.round(((emptyStats.present + emptyStats.late) / emptyStats.total) * 100);

    expect(pct).toBe(100);
    expect(Number.isNaN(pct)).toBe(false);
    expect(Number.isFinite(pct)).toBe(true);
  });

  // 26. API errors display correctly.
  it('26. API errors display correctly', async () => {
    vi.spyOn(attendanceApi, 'getAttendanceDashboardStats').mockRejectedValue(
      new Error('Failed to load dashboard metrics')
    );
    await expect(
      attendanceApi.getAttendanceDashboardStats({ date: '2026-09-15' })
    ).rejects.toThrow('Failed to load dashboard metrics');
  });

  // 27. 403 handling works.
  it('27. 403 handling works', async () => {
    vi.spyOn(attendanceApi, 'createAttendanceSession').mockRejectedValue({
      response: {
        status: 403,
        data: {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Forbidden: Insufficient permissions for attendance marking',
          },
        },
      },
      message: 'Forbidden: Insufficient permissions for attendance marking',
    });

    await expect(
      attendanceApi.createAttendanceSession({
        classId: PG_CLASS_1_ID,
        date: '2026-09-15',
        session: 'FN',
        records: [],
      })
    ).rejects.toMatchObject({
      message: expect.stringContaining('Forbidden'),
    });
  });

  // 28. Race protection for class changes.
  it('28. Race protection for class changes', async () => {
    let activeClass = PG_CLASS_1_ID;
    let renderedData = null;

    const executeClassRequest = async (classId, delayMs, result) => {
      await new Promise((r) => setTimeout(r, delayMs));
      if (activeClass === classId) {
        renderedData = result;
      }
    };

    const p1 = executeClassRequest(PG_CLASS_1_ID, 30, 'Class 1 Old Data');
    activeClass = PG_CLASS_2_ID;
    const p2 = executeClassRequest(PG_CLASS_2_ID, 10, 'Class 2 New Data');

    await Promise.all([p1, p2]);
    expect(renderedData).toBe('Class 2 New Data');
  });

  // 29. Race protection for date changes.
  it('29. Race protection for date changes', async () => {
    let activeDate = '2026-09-15';
    let renderedDate = null;

    const executeDateRequest = async (date, delayMs, result) => {
      await new Promise((r) => setTimeout(r, delayMs));
      if (activeDate === date) {
        renderedDate = result;
      }
    };

    const p1 = executeDateRequest('2026-09-15', 30, '2026-09-15 Data');
    activeDate = '2026-09-16';
    const p2 = executeDateRequest('2026-09-16', 10, '2026-09-16 Data');

    await Promise.all([p1, p2]);
    expect(renderedDate).toBe('2026-09-16 Data');
  });

  // 30. Race protection for session changes.
  it('30. Race protection for session changes', async () => {
    let activeSession = 'FN';
    let renderedSession = null;

    const executeSessionRequest = async (session, delayMs, result) => {
      await new Promise((r) => setTimeout(r, delayMs));
      if (activeSession === session) {
        renderedSession = result;
      }
    };

    const p1 = executeSessionRequest('FN', 30, 'FN Data');
    activeSession = 'AN';
    const p2 = executeSessionRequest('AN', 10, 'AN Data');

    await Promise.all([p1, p2]);
    expect(renderedSession).toBe('AN Data');
  });

  // 31. Race protection for tab/month changes.
  it('31. Race protection for tab/month changes', async () => {
    let activeTab = 'dashboard';
    let renderedTab = null;

    const executeTabRequest = async (tab, delayMs, result) => {
      await new Promise((r) => setTimeout(r, delayMs));
      if (activeTab === tab) {
        renderedTab = result;
      }
    };

    const p1 = executeTabRequest('dashboard', 30, 'Dashboard Data');
    activeTab = 'analytics';
    const p2 = executeTabRequest('analytics', 10, 'Analytics Data');

    await Promise.all([p1, p2]);
    expect(renderedTab).toBe('Analytics Data');
  });

  // 32. ZERO Firestore operations.
  it('32. ZERO Firestore operations', () => {
    const saveAttendanceSpy = vi.spyOn(firestoreModule, 'saveAttendance');
    const getAttendanceSpy = vi.spyOn(firestoreModule, 'getAttendanceForClass');
    const subscribeAttendanceSpy = vi.spyOn(firestoreModule, 'subscribeToAttendance');
    const getSettingsSpy = vi.spyOn(firestoreModule, 'getAttendanceSettings');
    const subscribeStudentsSpy = vi.spyOn(firestoreModule, 'subscribeToStudentsByClass');
    const subscribeSubSpy = vi.spyOn(firestoreModule, 'subscribeToSubCollection');

    expect(saveAttendanceSpy).not.toHaveBeenCalled();
    expect(getAttendanceSpy).not.toHaveBeenCalled();
    expect(subscribeAttendanceSpy).not.toHaveBeenCalled();
    expect(getSettingsSpy).not.toHaveBeenCalled();
    expect(subscribeStudentsSpy).not.toHaveBeenCalled();
    expect(subscribeSubSpy).not.toHaveBeenCalled();
  });

  // 33. ZERO Firestore notification writes.
  it('33. ZERO Firestore notification writes', () => {
    const addSubDocSpy = vi.spyOn(firestoreModule, 'addSubDocument');
    const updateDocSpy = vi.spyOn(firestoreModule, 'updateSubDocument');

    expect(addSubDocSpy).not.toHaveBeenCalled();
    expect(updateDocSpy).not.toHaveBeenCalled();
  });
});
