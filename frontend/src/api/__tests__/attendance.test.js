import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as clientModule from '../client.js';
import {
  getStudentAttendance,
  listAttendanceSessions,
  getAttendanceSession,
  createAttendanceSession,
  updateAttendanceSession,
  getAttendanceDashboardStats,
  listAbsenteeFlags,
  resolveAbsenteeFlag,
  markAttendance
} from '../attendance.js';

describe('Attendance API Client Module (Phase 4C.7-D.2-I-M.4.3)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('getStudentAttendance calls apiClient with correct endpoint and query parameters', async () => {
    const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      student: { id: 'stu-uuid-1', name: 'Alice Smith' },
      cumulativeStat: { totalDays: 40, presentDays: 38, absentDays: 1, lateDays: 1, percentage: 97.5 },
      timeline: [{ id: 'rec-1', status: 'PRESENT' }],
      pagination: { total: 40, page: 1, limit: 50, totalPages: 1 }
    });

    const res = await getStudentAttendance('stu-uuid-1', { filter: 'monthly', limit: 50 });

    expect(apiSpy).toHaveBeenCalledWith('/api/v1/attendance/students/stu-uuid-1?filter=monthly&limit=50', {
      method: 'GET'
    });
    expect(res.student.name).toBe('Alice Smith');
    expect(res.cumulativeStat.percentage).toBe(97.5);
  });

  it('getStudentAttendance does not pass schoolId in query string', async () => {
    const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      timeline: []
    });

    await getStudentAttendance('stu-uuid-1');

    const calledUrl = apiSpy.mock.calls[0][0];
    expect(calledUrl).toBe('/api/v1/attendance/students/stu-uuid-1');
    expect(calledUrl).not.toContain('schoolId=');
  });

  it('listAttendanceSessions calls apiClient with GET /api/v1/attendance/sessions', async () => {
    const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      data: [{ id: 'ses-1', date: '2026-03-15' }]
    });

    const res = await listAttendanceSessions({ classId: 'cls-1', date: '2026-03-15' });

    expect(apiSpy).toHaveBeenCalledWith('/api/v1/attendance/sessions?classId=cls-1&date=2026-03-15', {
      method: 'GET'
    });
    expect(res.data[0].id).toBe('ses-1');
  });

  it('getAttendanceSession calls apiClient with GET /api/v1/attendance/sessions/:sessionId', async () => {
    const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      session: { id: 'ses-uuid-1', date: '2026-03-15' }
    });

    const res = await getAttendanceSession('ses-uuid-1');

    expect(apiSpy).toHaveBeenCalledWith('/api/v1/attendance/sessions/ses-uuid-1', {
      method: 'GET'
    });
    expect(res.session.id).toBe('ses-uuid-1');
  });

  it('createAttendanceSession calls apiClient with POST /api/v1/attendance/sessions and payload', async () => {
    const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: { id: 'ses-new-1', date: '2026-09-15' }
    });

    const payload = {
      classId: '05120a32-8118-44b6-8010-b9ed2c5467c0',
      date: '2026-09-15',
      session: 'FN',
      records: [{ studentId: '11111111-1111-4111-8111-111111111111', status: 'Present' }]
    };

    const res = await createAttendanceSession(payload);

    expect(apiSpy).toHaveBeenCalledWith('/api/v1/attendance/sessions', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    expect(res.data.id).toBe('ses-new-1');
  });

  it('updateAttendanceSession calls apiClient with PATCH /api/v1/attendance/sessions/:id and payload', async () => {
    const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: { id: 'ses-1', updatedAt: '2026-09-15T10:00:00.000Z' }
    });

    const payload = {
      records: [{ studentId: '11111111-1111-4111-8111-111111111111', status: 'Late', remark: 'Traffic' }]
    };

    const res = await updateAttendanceSession('ses-1', payload);

    expect(apiSpy).toHaveBeenCalledWith('/api/v1/attendance/sessions/ses-1', {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
    expect(res.data.id).toBe('ses-1');
  });

  it('getAttendanceDashboardStats calls apiClient with GET /api/v1/attendance/dashboard-stats', async () => {
    const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: { totalStudents: 100, present: 95, absent: 5 }
    });

    const res = await getAttendanceDashboardStats({ date: '2026-09-15' });

    expect(apiSpy).toHaveBeenCalledWith('/api/v1/attendance/dashboard-stats?date=2026-09-15', {
      method: 'GET'
    });
    expect(res.data.totalStudents).toBe(100);
  });

  it('listAbsenteeFlags calls apiClient with GET /api/v1/attendance/absentee-flags and query parameters', async () => {
    const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: [{ id: 'flag-1', month: '2026-09', absentCount: 3 }],
      pagination: { total: 1, page: 1, limit: 20, totalPages: 1 }
    });

    const res = await listAbsenteeFlags({ month: '2026-09', limit: 50 });

    expect(apiSpy).toHaveBeenCalledWith('/api/v1/attendance/absentee-flags?month=2026-09&limit=50', {
      method: 'GET'
    });
    expect(res.data[0].id).toBe('flag-1');
  });

  it('resolveAbsenteeFlag calls apiClient with PATCH /api/v1/attendance/absentee-flags/:id/resolve and payload', async () => {
    const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: { id: 'flag-1', isResolved: true }
    });

    const res = await resolveAbsenteeFlag('flag-1', { isResolved: true, resolutionNotes: 'Medical leave submitted' });

    expect(apiSpy).toHaveBeenCalledWith('/api/v1/attendance/absentee-flags/flag-1/resolve', {
      method: 'PATCH',
      body: JSON.stringify({ isResolved: true, resolutionNotes: 'Medical leave submitted' })
    });
    expect(res.data.isResolved).toBe(true);
  });

  it('markAttendance wrapper forwards to createAttendanceSession', async () => {
    const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: { id: 'ses-wrap-1' }
    });

    const payload = { classId: 'cls-1', date: '2026-09-15', records: [] };
    const res = await markAttendance(payload);

    expect(apiSpy).toHaveBeenCalledWith('/api/v1/attendance/sessions', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    expect(res.data.id).toBe('ses-wrap-1');
  });

  it('propagates network and API errors properly', async () => {
    vi.spyOn(clientModule, 'apiClient').mockRejectedValue(new Error('Unauthorized'));

    await expect(getStudentAttendance('stu-1')).rejects.toThrow('Unauthorized');
  });
});
