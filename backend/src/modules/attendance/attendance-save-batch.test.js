import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as attendanceService from './attendance.service.js';
import * as attendanceRepository from './attendance.repository.js';
import { prisma } from '../../database/prisma.client.js';

vi.mock('./attendance.repository.js');
vi.mock('../../database/prisma.client.js', () => {
  return {
    prisma: {
      class: {
        findFirst: vi.fn()
      },
      section: {
        findFirst: vi.fn()
      },
      student: {
        findMany: vi.fn()
      },
      staffProfile: {
        findFirst: vi.fn()
      },
      academicYear: {
        findFirst: vi.fn()
      },
      schoolSetting: {
        findFirst: vi.fn()
      },
      auditLog: {
        create: vi.fn()
      },
      $transaction: vi.fn(async (cb) => cb(prisma))
    }
  };
});

describe('Attendance Save & Update Batch Recalculation', () => {
  const schoolId = '11111111-1111-1111-1111-111111111111';
  const classId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const sessionId = 'ssssssss-ssss-ssss-ssss-ssssssssssss';
  const studentIds = ['std-1', 'std-2', 'std-3'];
  const actor = { userId: 'teacher-1', systemRole: 'TEACHER', email: 'teacher@school.org' };

  beforeEach(() => {
    vi.clearAllMocks();

    prisma.class.findFirst.mockResolvedValue({
      id: classId,
      name: 'Grade 10 - A',
      classTeacherId: 'teacher-1'
    });

    prisma.staffProfile.findFirst.mockResolvedValue({
      id: 'staff-1',
      userId: 'teacher-1'
    });

    prisma.student.findMany.mockResolvedValue([
      { id: 'std-1' },
      { id: 'std-2' },
      { id: 'std-3' }
    ]);

    prisma.academicYear.findFirst.mockResolvedValue({
      id: 'ay-2026',
      name: '2026-2027',
      isCurrent: true
    });

    prisma.schoolSetting.findFirst.mockResolvedValue({
      absenteeThreshold: 3
    });

    attendanceRepository.upsertSession.mockResolvedValue({
      id: sessionId,
      schoolId,
      classId,
      date: '2026-10-15',
      session: 'FN'
    });

    attendanceRepository.findSessionById.mockResolvedValue({
      id: sessionId,
      schoolId,
      classId,
      date: '2026-10-15',
      session: 'FN',
      records: []
    });

    attendanceRepository.batchUpsertRecords.mockResolvedValue();
    attendanceRepository.batchRecalculateStudentStats.mockResolvedValue();
    attendanceRepository.resolvePendingAttendanceNotifications.mockResolvedValue();
  });

  it('submitAttendanceSession uses upsertSession, batchUpsertRecords, and batchRecalculateStudentStats', async () => {
    const payload = {
      classId,
      date: '2026-10-15',
      session: 'FN',
      records: [
        { studentId: 'std-1', status: 'Present' },
        { studentId: 'std-2', status: 'Absent' },
        { studentId: 'std-3', status: 'Late' }
      ]
    };

    const result = await attendanceService.submitAttendanceSession(schoolId, payload, actor);

    expect(attendanceRepository.upsertSession).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId,
        classId,
        date: '2026-10-15',
        session: 'FN'
      }),
      expect.anything()
    );

    expect(attendanceRepository.batchUpsertRecords).toHaveBeenCalledWith(
      schoolId,
      sessionId,
      payload.records,
      expect.anything()
    );

    expect(attendanceRepository.batchRecalculateStudentStats).toHaveBeenCalledWith(
      schoolId,
      classId,
      studentIds,
      '2026-27',
      '2026-10',
      2,
      expect.anything()
    );

    expect(result.id).toBe(sessionId);
  });

  it('updateAttendanceSession uses batchUpsertRecords and batchRecalculateStudentStats', async () => {
    attendanceRepository.findSessionById.mockResolvedValue({
      id: sessionId,
      schoolId,
      classId,
      date: '2026-10-15',
      session: 'FN',
      class: { id: classId, name: 'Grade 10 - A' }
    });

    const updatePayload = {
      records: [
        { studentId: 'std-1', status: 'Late' },
        { studentId: 'std-2', status: 'Present' }
      ]
    };

    await attendanceService.updateAttendanceSession(schoolId, sessionId, updatePayload, actor);

    expect(attendanceRepository.batchUpsertRecords).toHaveBeenCalledWith(
      schoolId,
      sessionId,
      updatePayload.records,
      expect.anything()
    );

    expect(attendanceRepository.batchRecalculateStudentStats).toHaveBeenCalledWith(
      schoolId,
      classId,
      ['std-1', 'std-2'],
      '2026-27',
      '2026-10',
      2,
      expect.anything()
    );
  });

  it('deleteAttendanceSession uses batchRecalculateStudentStats for all affected students', async () => {
    const adminActor = { userId: 'admin-1', systemRole: 'ADMIN', email: 'admin@school.org' };

    attendanceRepository.findSessionById.mockResolvedValue({
      id: sessionId,
      schoolId,
      classId,
      date: '2026-10-15',
      session: 'FN'
    });

    attendanceRepository.findRecordsBySessionId.mockResolvedValue([
      { studentId: 'std-1' },
      { studentId: 'std-2' }
    ]);

    await attendanceService.deleteAttendanceSession(schoolId, sessionId, adminActor);

    expect(attendanceRepository.deleteSession).toHaveBeenCalledWith(schoolId, sessionId, expect.anything());

    expect(attendanceRepository.batchRecalculateStudentStats).toHaveBeenCalledWith(
      schoolId,
      classId,
      ['std-1', 'std-2'],
      '2026-27',
      '2026-10',
      2,
      expect.anything()
    );
  });
});
