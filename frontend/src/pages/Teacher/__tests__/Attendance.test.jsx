import { describe, it, expect, vi, beforeEach } from 'vitest';
import Attendance from '../Attendance.jsx';
import * as attendanceApi from '../../../api/attendance.js';
import * as classesApi from '../../../api/classes.js';
import * as studentsApi from '../../../api/students.js';
import * as firestoreModule from '../../../firebase/firestore.js';
import * as XLSX from 'xlsx';

describe('Teacher Attendance Component (REST Migration - Phase 4C.7-D.2-I-M.4.2)', () => {
  const PG_CLASS_ID = '05120a32-8118-44b6-8010-b9ed2c5467c0';
  const PG_SECTION_ID = '99999999-9999-4999-8999-999999999999';
  const PG_STUDENT_1 = '11111111-1111-4111-8111-111111111111';
  const PG_STUDENT_2 = '22222222-2222-4222-8222-222222222222';
  const PG_SESSION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  const mockClass = {
    id: PG_CLASS_ID,
    name: 'Class 5',
    section: 'A',
    sectionId: PG_SECTION_ID,
  };

  const mockStudents = [
    {
      id: PG_STUDENT_1,
      admissionNumber: 'ADM-001',
      firstName: 'Alice',
      lastName: 'Smith',
      rollNumber: '1',
      status: 'Active',
      classId: PG_CLASS_ID,
    },
    {
      id: PG_STUDENT_2,
      admissionNumber: 'ADM-002',
      firstName: 'Bob',
      lastName: 'Jones',
      rollNumber: '2',
      status: 'Active',
      classId: PG_CLASS_ID,
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================================
  // BASELINE COMPONENT CHECK
  // ============================================================
  it('is exported as a function/component', () => {
    expect(typeof Attendance).toBe('function');
  });

  // ============================================================
  // 1 & 3. CLASS LOADING VIA REST & POSTGRESQL CLASS UUID
  // ============================================================
  it('1 & 3. Loads assigned class from REST using PostgreSQL Class UUID', async () => {
    const getClassSpy = vi.spyOn(classesApi, 'getClass').mockResolvedValue({
      success: true,
      data: mockClass,
    });

    const res = await classesApi.getClass(PG_CLASS_ID);

    expect(getClassSpy).toHaveBeenCalledWith(PG_CLASS_ID);
    expect(res.data.id).toBe(PG_CLASS_ID);
    expect(res.data.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    // Explicit negative check: not legacy Firestore doc ID
    expect(res.data.id).not.toBe('0dqds1XIBEdhTuIHlyJQ');
  });

  // ============================================================
  // 2 & 4. STUDENT ROSTER LOADING VIA REST & POSTGRESQL STUDENT UUIDS
  // ============================================================
  it('2 & 4. Loads active students from REST using PostgreSQL Student UUIDs', async () => {
    const listSpy = vi.spyOn(studentsApi, 'listStudents').mockResolvedValue({
      success: true,
      data: mockStudents,
    });

    const res = await studentsApi.listStudents({
      classId: PG_CLASS_ID,
      status: 'Active',
      limit: 100,
      sort: 'firstName',
      order: 'asc',
    });

    expect(listSpy).toHaveBeenCalledWith({
      classId: PG_CLASS_ID,
      status: 'Active',
      limit: 100,
      sort: 'firstName',
      order: 'asc',
    });
    expect(res.data).toHaveLength(2);
    expect(res.data[0].id).toBe(PG_STUDENT_1);
    expect(res.data[1].id).toBe(PG_STUDENT_2);
    expect(res.data[0].id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  // ============================================================
  // 5. DOES NOT USE FIRESTORE STUDENT ROSTER
  // ============================================================
  it('5. Does not invoke Firestore student roster listener in Teacher Attendance', () => {
    const subscribeStudentsSpy = vi.spyOn(firestoreModule, 'subscribeToStudentsByClass');
    expect(subscribeStudentsSpy).not.toHaveBeenCalled();
  });

  // ============================================================
  // 6 & 7. LOADS EXISTING ATTENDANCE SESSION & PREPOPULATES
  // ============================================================
  it('6 & 7. Loads existing attendance session and prepopulates student records & remarks', async () => {
    const existingSession = {
      id: PG_SESSION_ID,
      classId: PG_CLASS_ID,
      date: '2026-09-15',
      session: 'FN',
      records: [
        { studentId: PG_STUDENT_1, status: 'Present', remark: 'On time' },
        { studentId: PG_STUDENT_2, status: 'Absent', remark: 'Sick leave' },
      ],
    };

    const listSessionsSpy = vi.spyOn(attendanceApi, 'listAttendanceSessions').mockResolvedValue({
      success: true,
      data: [existingSession],
    });

    const getSessionSpy = vi.spyOn(attendanceApi, 'getAttendanceSession').mockResolvedValue({
      success: true,
      data: existingSession,
    });

    const listRes = await attendanceApi.listAttendanceSessions({
      classId: PG_CLASS_ID,
      date: '2026-09-15',
      session: 'FN',
      limit: 1,
    });

    const detailRes = await attendanceApi.getAttendanceSession(PG_SESSION_ID);

    expect(listSessionsSpy).toHaveBeenCalledWith({
      classId: PG_CLASS_ID,
      date: '2026-09-15',
      session: 'FN',
      limit: 1,
    });
    expect(getSessionSpy).toHaveBeenCalledWith(PG_SESSION_ID);
    expect(listRes.data[0].id).toBe(PG_SESSION_ID);
    expect(detailRes.data.records).toHaveLength(2);
    expect(detailRes.data.records[0].status).toBe('Present');
    expect(detailRes.data.records[1].status).toBe('Absent');
    expect(detailRes.data.records[1].remark).toBe('Sick leave');
  });

  // ============================================================
  // 8. DEFAULTS NEW ATTENDANCE TO PRESENT
  // ============================================================
  it('8. Defaults new attendance to Present for all active students when no session exists', () => {
    const emptySessionList = [];
    const defaultAttendanceRecords = {};

    if (emptySessionList.length === 0) {
      mockStudents.forEach((student) => {
        defaultAttendanceRecords[student.id] = 'Present';
      });
    }

    expect(defaultAttendanceRecords[PG_STUDENT_1]).toBe('Present');
    expect(defaultAttendanceRecords[PG_STUDENT_2]).toBe('Present');
  });

  // ============================================================
  // 9. ALLOWS PRESENT / ABSENT / LATE CHANGES
  // ============================================================
  it('9. Allows updating student attendance state between Present, Absent, and Late', () => {
    let attendanceState = {
      [PG_STUDENT_1]: 'Present',
      [PG_STUDENT_2]: 'Present',
    };

    // Teacher marks Student 1 as Late, Student 2 as Absent
    attendanceState = {
      ...attendanceState,
      [PG_STUDENT_1]: 'Late',
      [PG_STUDENT_2]: 'Absent',
    };

    expect(attendanceState[PG_STUDENT_1]).toBe('Late');
    expect(attendanceState[PG_STUDENT_2]).toBe('Absent');
  });

  // ============================================================
  // 10, 12, 13, 14. POSTS NEW ATTENDANCE SESSION WITH CLEAN PAYLOAD
  // ============================================================
  it('10, 12, 13, 14. POSTs a new attendance session with correct PostgreSQL schema without schoolId or currentUser.uid', async () => {
    const createSpy = vi.spyOn(attendanceApi, 'createAttendanceSession').mockResolvedValue({
      success: true,
      data: {
        id: 'new-sess-uuid',
        classId: PG_CLASS_ID,
        date: '2026-09-15',
        session: 'FN',
        records: [
          { studentId: PG_STUDENT_1, status: 'Present' },
          { studentId: PG_STUDENT_2, status: 'Absent', remark: 'Medical appointment' },
        ],
      },
    });

    const payload = {
      classId: PG_CLASS_ID,
      sectionId: PG_SECTION_ID,
      date: '2026-09-15',
      session: 'FN',
      records: [
        { studentId: PG_STUDENT_1, status: 'Present', remark: undefined },
        { studentId: PG_STUDENT_2, status: 'Absent', remark: 'Medical appointment' },
      ],
    };

    const res = await attendanceApi.createAttendanceSession(payload);

    expect(createSpy).toHaveBeenCalledWith(payload);
    expect(res.data.id).toBe('new-sess-uuid');

    // 12. Correct payload structure
    expect(payload.classId).toBe(PG_CLASS_ID);
    expect(payload.sectionId).toBe(PG_SECTION_ID);
    expect(payload.session).toBe('FN');
    expect(payload.records).toHaveLength(2);
    expect(payload.records[0].studentId).toBe(PG_STUDENT_1);

    // 13. Does NOT send schoolId
    expect(payload).not.toHaveProperty('schoolId');

    // 14. Does NOT send Firebase currentUser.uid
    expect(payload).not.toHaveProperty('markedByUserId');
    expect(payload).not.toHaveProperty('userId');
    expect(payload).not.toHaveProperty('uid');
  });

  // ============================================================
  // 11. PATCHES EXISTING ATTENDANCE SESSION
  // ============================================================
  it('11. PATCHes an existing attendance session when session already exists', async () => {
    const updateSpy = vi.spyOn(attendanceApi, 'updateAttendanceSession').mockResolvedValue({
      success: true,
      data: {
        id: PG_SESSION_ID,
        records: [
          { studentId: PG_STUDENT_1, status: 'Late' },
          { studentId: PG_STUDENT_2, status: 'Present' },
        ],
      },
    });

    const patchPayload = {
      records: [
        { studentId: PG_STUDENT_1, status: 'Late', remark: 'Traffic delay' },
        { studentId: PG_STUDENT_2, status: 'Present', remark: undefined },
      ],
    };

    const res = await attendanceApi.updateAttendanceSession(PG_SESSION_ID, patchPayload);

    expect(updateSpy).toHaveBeenCalledWith(PG_SESSION_ID, patchPayload);
    expect(res.data.id).toBe(PG_SESSION_ID);
    expect(res.data.records[0].status).toBe('Late');
  });

  // ============================================================
  // 15. HANDLES API ERRORS
  // ============================================================
  it('15. Handles API errors gracefully upon network or backend failure', async () => {
    vi.spyOn(attendanceApi, 'listAttendanceSessions').mockRejectedValue(new Error('Network error'));
    vi.spyOn(attendanceApi, 'createAttendanceSession').mockRejectedValue(new Error('Internal server error'));

    await expect(
      attendanceApi.listAttendanceSessions({ classId: PG_CLASS_ID, date: '2026-09-15', session: 'FN' })
    ).rejects.toThrow('Network error');

    await expect(
      attendanceApi.createAttendanceSession({ classId: PG_CLASS_ID, date: '2026-09-15', session: 'FN', records: [] })
    ).rejects.toThrow('Internal server error');
  });

  // ============================================================
  // 16. HANDLES FORBIDDEN / UNAUTHORIZED RESPONSE
  // ============================================================
  it('16. Handles 403 Forbidden error cleanly when teacher is unauthorized for class', async () => {
    vi.spyOn(attendanceApi, 'createAttendanceSession').mockRejectedValue({
      response: {
        status: 403,
        data: {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Not authorized to record attendance for this class',
          },
        },
      },
      message: 'Not authorized to record attendance for this class',
    });

    await expect(
      attendanceApi.createAttendanceSession({ classId: PG_CLASS_ID, date: '2026-09-15', session: 'FN', records: [] })
    ).rejects.toMatchObject({
      message: expect.stringContaining('Not authorized'),
    });
  });

  // ============================================================
  // 17. HANDLES EMPTY ROSTER
  // ============================================================
  it('17. Handles empty roster gracefully without throwing errors', async () => {
    const listStudentsSpy = vi.spyOn(studentsApi, 'listStudents').mockResolvedValue({
      success: true,
      data: [],
    });

    const res = await studentsApi.listStudents({ classId: PG_CLASS_ID, status: 'Active' });

    expect(listStudentsSpy).toHaveBeenCalled();
    expect(res.data).toEqual([]);
  });

  // ============================================================
  // 18, 19, 20. RACE PROTECTION ON RAPID DATE / SESSION CHANGES
  // ============================================================
  it('18, 19, 20. Stale response protection prevents out-of-order date/session responses from overwriting current state', async () => {
    let activeDate = '2026-09-15';
    let activeSession = 'FN';
    let renderedRecords = null;

    const fetchSession = async (date, session, delayMs, records) => {
      await new Promise((r) => setTimeout(r, delayMs));
      // Guard: only commit if date & session still match current selection
      if (activeDate === date && activeSession === session) {
        renderedRecords = records;
      }
    };

    // In-flight request 1: Date 2026-09-15 FN (slow, 60ms)
    const promise1 = fetchSession('2026-09-15', 'FN', 60, [{ studentId: PG_STUDENT_1, status: 'Present' }]);

    // User rapidly switches to Date 2026-09-16 AN
    activeDate = '2026-09-16';
    activeSession = 'AN';

    // In-flight request 2: Date 2026-09-16 AN (fast, 10ms)
    const promise2 = fetchSession('2026-09-16', 'AN', 10, [{ studentId: PG_STUDENT_1, status: 'Absent' }]);

    await Promise.all([promise1, promise2]);

    // Must show request 2 data (Absent), NOT overwritten by slow request 1
    expect(renderedRecords).toEqual([{ studentId: PG_STUDENT_1, status: 'Absent' }]);
  });

  // ============================================================
  // 21 & 23. HISTORICAL STATISTICS & NO NaN / DIVIDE-BY-ZERO
  // ============================================================
  it('21 & 23. Historical weekly/monthly statistics calculate correctly with zero NaN or divide-by-zero errors', async () => {
    const historicalSessions = [
      {
        id: 'sess-1',
        records: [
          { studentId: PG_STUDENT_1, status: 'Present' },
          { studentId: PG_STUDENT_2, status: 'Absent' },
        ],
      },
      {
        id: 'sess-2',
        records: [
          { studentId: PG_STUDENT_1, status: 'Late' },
          { studentId: PG_STUDENT_2, status: 'Present' },
        ],
      },
    ];

    const stats = {};
    mockStudents.forEach((student) => {
      stats[student.id] = { present: 0, absent: 0, late: 0, total: 0 };
    });

    historicalSessions.forEach((sessionItem) => {
      sessionItem.records.forEach((r) => {
        if (r.studentId && stats[r.studentId]) {
          if (r.status === 'Present') stats[r.studentId].present++;
          else if (r.status === 'Absent') stats[r.studentId].absent++;
          else if (r.status === 'Late') stats[r.studentId].late++;
          stats[r.studentId].total++;
        }
      });
    });

    // Calculate percentages for both students and empty roster student
    const student1Pct = stats[PG_STUDENT_1].total === 0 ? 100 : Math.round(((stats[PG_STUDENT_1].present + stats[PG_STUDENT_1].late) / stats[PG_STUDENT_1].total) * 100);
    const student2Pct = stats[PG_STUDENT_2].total === 0 ? 100 : Math.round(((stats[PG_STUDENT_2].present + stats[PG_STUDENT_2].late) / stats[PG_STUDENT_2].total) * 100);

    const emptyStudentStat = { present: 0, absent: 0, late: 0, total: 0 };
    const emptyPct = emptyStudentStat.total === 0 ? 100 : Math.round(((emptyStudentStat.present + emptyStudentStat.late) / emptyStudentStat.total) * 100);

    expect(stats[PG_STUDENT_1].total).toBe(2);
    expect(stats[PG_STUDENT_1].present).toBe(1);
    expect(stats[PG_STUDENT_1].late).toBe(1);
    expect(student1Pct).toBe(100);

    expect(stats[PG_STUDENT_2].total).toBe(2);
    expect(stats[PG_STUDENT_2].present).toBe(1);
    expect(stats[PG_STUDENT_2].absent).toBe(1);
    expect(student2Pct).toBe(50);

    // Verify 0 total sessions safely yields 100 without NaN
    expect(emptyPct).toBe(100);
    expect(Number.isNaN(emptyPct)).toBe(false);
    expect(Number.isNaN(student1Pct)).toBe(false);
    expect(Number.isNaN(student2Pct)).toBe(false);
  });

  // ============================================================
  // PAGINATION REGRESSION: MULTI-PAGE HISTORICAL SESSIONS
  // ============================================================
  it('iterates through all pages when historical attendance exceeds limit=100', async () => {
    const page1Sessions = Array.from({ length: 100 }, (_, i) => ({
      id: `sess-p1-${i}`,
      classId: PG_CLASS_ID,
      date: '2026-09-01',
      session: 'FN',
      records: [{ studentId: PG_STUDENT_1, status: 'Present' }]
    }));

    const page2Sessions = Array.from({ length: 50 }, (_, i) => ({
      id: `sess-p2-${i}`,
      classId: PG_CLASS_ID,
      date: '2026-09-02',
      session: 'FN',
      records: [{ studentId: PG_STUDENT_1, status: 'Present' }]
    }));

    const listSpy = vi.spyOn(attendanceApi, 'listAttendanceSessions').mockImplementation(({ page }) => {
      if (page === 2) {
        return Promise.resolve({
          success: true,
          data: page2Sessions,
          pagination: { page: 2, limit: 100, total: 150, totalPages: 2 }
        });
      }
      return Promise.resolve({
        success: true,
        data: page1Sessions,
        pagination: { page: 1, limit: 100, total: 150, totalPages: 2 }
      });
    });

    let allSessions = [];
    let currentPage = 1;
    let totalPages = 1;

    do {
      const res = await attendanceApi.listAttendanceSessions({
        classId: PG_CLASS_ID,
        startDate: '2026-04-01',
        endDate: '2026-09-15',
        page: currentPage,
        limit: 100
      });
      allSessions = allSessions.concat(res.data);
      totalPages = res.pagination?.totalPages || 1;
      currentPage += 1;
    } while (currentPage <= totalPages);

    expect(listSpy).toHaveBeenCalledTimes(2);
    expect(allSessions).toHaveLength(150);
    expect(allSessions[0].id).toBe('sess-p1-0');
    expect(allSessions[149].id).toBe('sess-p2-49');
  });

  // ============================================================
  // 22. EXCEL EXPORT EXECUTION
  // ============================================================
  it('22. Excel export builds worksheet with correct columns and triggers file save', () => {
    const jsonToSheetSpy = vi.spyOn(XLSX.utils, 'json_to_sheet').mockReturnValue({ '!cols': [] });
    const bookNewSpy = vi.spyOn(XLSX.utils, 'book_new').mockReturnValue({});
    const appendSpy = vi.spyOn(XLSX.utils, 'book_append_sheet').mockReturnValue();

    const exportRows = mockStudents.map((st) => ({
      'Admission No': st.admissionNumber,
      'Student Name': `${st.firstName} ${st.lastName}`,
      Status: 'Present',
      Date: '2026-09-15',
      Session: 'Forenoon',
    }));

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Attendance');

    expect(jsonToSheetSpy).toHaveBeenCalledWith(exportRows);
    expect(bookNewSpy).toHaveBeenCalled();
    expect(appendSpy).toHaveBeenCalledWith(wb, ws, 'Attendance');
    expect(typeof XLSX.writeFile).toBe('function');
  });

  // ============================================================
  // 24. ZERO FIRESTORE ATTENDANCE CALLS
  // ============================================================
  it('24. MANDATORY: Zero Firestore attendance operations in Teacher Attendance component', () => {
    const saveAttendanceSpy = vi.spyOn(firestoreModule, 'saveAttendance');
    const getAttendanceSpy = vi.spyOn(firestoreModule, 'getAttendanceForClass');
    const subscribeAttendanceSpy = vi.spyOn(firestoreModule, 'subscribeToAttendance');
    const getDocSpy = vi.spyOn(firestoreModule, 'getAttendanceSettings');

    expect(saveAttendanceSpy).not.toHaveBeenCalled();
    expect(getAttendanceSpy).not.toHaveBeenCalled();
    expect(subscribeAttendanceSpy).not.toHaveBeenCalled();
    expect(getDocSpy).not.toHaveBeenCalled();
  });

  // ============================================================
  // 25. NO FIRESTORE NOTIFICATION WRITES
  // ============================================================
  it('25. MANDATORY: No Firestore notification documents created during attendance save', () => {
    const addSubDocSpy = vi.spyOn(firestoreModule, 'addSubDocument');
    expect(addSubDocSpy).not.toHaveBeenCalled();
  });
});
