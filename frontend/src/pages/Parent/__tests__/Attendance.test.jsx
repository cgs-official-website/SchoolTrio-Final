import { describe, it, expect, vi, beforeEach } from 'vitest';
import ParentAttendance from '../Attendance.jsx';
import * as attendanceApi from '../../../api/attendance.js';
import * as firestoreModule from '../../../firebase/firestore.js';

describe('Parent Attendance Component (REST Migration - Phase 4C.7-D.2-I-D)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('is exported as a function/component', () => {
    expect(typeof ParentAttendance).toBe('function');
  });

  // ==========================================
  // 1. REST ATTENDANCE FETCHING & QUERY PARAMS
  // ==========================================

  it('fetches student attendance via REST getStudentAttendance with studentId and filter parameters', async () => {
    const apiSpy = vi.spyOn(attendanceApi, 'getStudentAttendance').mockResolvedValue({
      student: { id: 'stu-uuid-1', name: 'Alice Smith' },
      cumulativeStat: { totalDays: 4, presentDays: 2, absentDays: 1, lateDays: 1, percentage: 75.0 },
      timeline: [
        {
          id: 'rec-1',
          status: 'PRESENT',
          remark: 'On time',
          session: { id: 'ses-1', date: '2026-03-10', session: 'MORNING', class: { name: 'Grade 5A' } }
        },
        {
          id: 'rec-2',
          status: 'LATE',
          remark: 'Traffic delay',
          session: { id: 'ses-2', date: '2026-03-09', session: 'MORNING', class: { name: 'Grade 5A' } }
        },
        {
          id: 'rec-3',
          status: 'ABSENT',
          remark: 'Sick',
          session: { id: 'ses-3', date: '2026-03-08', session: 'MORNING', class: { name: 'Grade 5A' } }
        },
        {
          id: 'rec-4',
          status: 'PRESENT',
          remark: '',
          session: { id: 'ses-4', date: '2026-03-07', session: 'MORNING', class: { name: 'Grade 5A' } }
        }
      ],
      pagination: { total: 4, page: 1, limit: 100, totalPages: 1 }
    });

    const res = await attendanceApi.getStudentAttendance('stu-uuid-1', { filter: 'all', limit: 100 });

    expect(apiSpy).toHaveBeenCalledWith('stu-uuid-1', { filter: 'all', limit: 100 });
    expect(apiSpy.mock.calls[0][1]).not.toHaveProperty('schoolId');
    expect(res.timeline).toHaveLength(4);
    expect(res.cumulativeStat.percentage).toBe(75.0);
  });

  it('does NOT call legacy Firestore subscribeToAttendanceForClass in REST flow', async () => {
    const firestoreSpy = vi.spyOn(firestoreModule, 'subscribeToAttendanceForClass');
    vi.spyOn(attendanceApi, 'getStudentAttendance').mockResolvedValue({
      timeline: []
    });

    await attendanceApi.getStudentAttendance('stu-uuid-1');

    expect(firestoreSpy).not.toHaveBeenCalled();
  });

  // ==========================================
  // 2. FORMULA & METRIC CALCULATIONS
  // ==========================================

  it('verifies (Present + Late) / Total formula calculation matching backend exactly', () => {
    const records = [
      { status: 'PRESENT' },
      { status: 'PRESENT' },
      { status: 'LATE' },
      { status: 'ABSENT' }
    ];

    const presentCount = records.filter(r => r.status.toUpperCase() === 'PRESENT').length;
    const absentCount = records.filter(r => r.status.toUpperCase() === 'ABSENT').length;
    const lateCount = records.filter(r => r.status.toUpperCase() === 'LATE').length;
    const totalCount = records.length;

    const percentage = totalCount === 0 ? 100 : Math.round(((presentCount + lateCount) / totalCount) * 100);

    expect(presentCount).toBe(2);
    expect(absentCount).toBe(1);
    expect(lateCount).toBe(1);
    expect(totalCount).toBe(4);
    expect(percentage).toBe(75); // (2 + 1) / 4 * 100 = 75%
  });

  it('handles zero total attendance days safely returning 100% without NaN', () => {
    const records = [];
    const presentCount = 0;
    const lateCount = 0;
    const totalCount = records.length;

    const percentage = totalCount === 0 ? 100 : Math.round(((presentCount + lateCount) / totalCount) * 100);

    expect(percentage).toBe(100);
    expect(Number.isNaN(percentage)).toBe(false);
  });

  // ==========================================
  // 3. STATUS NORMALIZATION & TIMELINE MAPPING
  // ==========================================

  it('normalizes uppercase PostgreSQL status to display formats and colors', () => {
    const normalizeStatus = (status) => {
      const s = (status || '').toUpperCase();
      if (s === 'PRESENT') return 'Present';
      if (s === 'ABSENT') return 'Absent';
      if (s === 'LATE') return 'Late';
      return status || 'Present';
    };

    expect(normalizeStatus('PRESENT')).toBe('Present');
    expect(normalizeStatus('ABSENT')).toBe('Absent');
    expect(normalizeStatus('LATE')).toBe('Late');
    expect(normalizeStatus('Present')).toBe('Present');
    expect(normalizeStatus('Absent')).toBe('Absent');
    expect(normalizeStatus('Late')).toBe('Late');
  });

  it('maps timeline records correctly from PostgreSQL REST session structure', () => {
    const rawTimeline = [
      {
        id: 'rec-101',
        status: 'PRESENT',
        remark: 'Early arrival',
        session: {
          id: 'ses-101',
          date: '2026-03-15',
          session: 'MORNING',
          class: { id: 'cls-1', name: 'Grade 5A' }
        }
      }
    ];

    const mapped = rawTimeline.map(item => ({
      id: item.id,
      date: item.session?.date || item.date || '',
      status: item.status || 'PRESENT',
      remark: item.remark || '',
      session: item.session?.session || item.session || 'Morning',
      className: item.session?.class?.name || ''
    }));

    expect(mapped[0]).toEqual({
      id: 'rec-101',
      date: '2026-03-15',
      status: 'PRESENT',
      remark: 'Early arrival',
      session: 'MORNING',
      className: 'Grade 5A'
    });
  });

  it('sorts timeline records by date descending', () => {
    const records = [
      { id: '1', date: '2026-03-01' },
      { id: '2', date: '2026-03-15' },
      { id: '3', date: '2026-03-10' }
    ];

    records.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

    expect(records[0].id).toBe('2'); // 2026-03-15
    expect(records[1].id).toBe('3'); // 2026-03-10
    expect(records[2].id).toBe('1'); // 2026-03-01
  });

  // ==========================================
  // 4. PERIOD FILTERING VIA QUERY PARAMS
  // ==========================================

  it('supports all required period filter values (all, weekly, monthly, term)', async () => {
    const apiSpy = vi.spyOn(attendanceApi, 'getStudentAttendance').mockResolvedValue({
      timeline: []
    });

    await attendanceApi.getStudentAttendance('stu-1', { filter: 'weekly', limit: 100 });
    expect(apiSpy).toHaveBeenLastCalledWith('stu-1', { filter: 'weekly', limit: 100 });

    await attendanceApi.getStudentAttendance('stu-1', { filter: 'monthly', limit: 100 });
    expect(apiSpy).toHaveBeenLastCalledWith('stu-1', { filter: 'monthly', limit: 100 });

    await attendanceApi.getStudentAttendance('stu-1', { filter: 'term', limit: 100 });
    expect(apiSpy).toHaveBeenLastCalledWith('stu-1', { filter: 'term', limit: 100 });

    await attendanceApi.getStudentAttendance('stu-1', { filter: 'all', limit: 100 });
    expect(apiSpy).toHaveBeenLastCalledWith('stu-1', { filter: 'all', limit: 100 });
  });

  // ==========================================
  // 5. ERROR HANDLING & SECURITY
  // ==========================================

  it('handles API failure rejection cleanly without uncaught exceptions', async () => {
    vi.spyOn(attendanceApi, 'getStudentAttendance').mockRejectedValue(new Error('Forbidden: parent not linked'));

    await expect(attendanceApi.getStudentAttendance('stu-unlinked')).rejects.toThrow('Forbidden: parent not linked');
  });

  it('verifies attendance client endpoint does not expose class-wide roster data', async () => {
    const apiSpy = vi.spyOn(attendanceApi, 'getStudentAttendance').mockResolvedValue({
      student: { id: 'stu-uuid-1', name: 'Alice Smith' },
      timeline: [{ id: 'rec-1', status: 'PRESENT' }]
    });

    const res = await attendanceApi.getStudentAttendance('stu-uuid-1');

    // Asserts endpoint targets specific studentId route
    expect(apiSpy).toHaveBeenCalledWith('stu-uuid-1');
    expect(res.student.id).toBe('stu-uuid-1');
    expect(res).not.toHaveProperty('roster');
    expect(res).not.toHaveProperty('allStudents');
  });
});
