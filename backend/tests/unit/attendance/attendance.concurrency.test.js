import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as attendanceService from '../../../src/modules/attendance/attendance.service.js';
import * as attendanceRepository from '../../../src/modules/attendance/attendance.repository.js';
import * as auditRepository from '../../../src/modules/audit/audit.repository.js';
import { prisma } from '../../../src/database/prisma.client.js';

vi.mock('../../../src/modules/attendance/attendance.repository.js');
vi.mock('../../../src/modules/audit/audit.repository.js');
vi.mock('../../../src/database/prisma.client.js', () => {
  const mockPrisma = {
    class: {
      findFirst: vi.fn()
    },
    student: {
      findMany: vi.fn()
    },
    schoolSetting: {
      findFirst: vi.fn()
    },
    $transaction: vi.fn(async (cb) => cb(mockPrisma))
  };
  return { prisma: mockPrisma };
});

describe('Unit: Attendance Concurrency & Row-Locking Safety — Phase 4C.5', () => {
  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
  const CLASS_ID = '22222222-2222-4222-8222-222222222222';
  const SESSION_ID = '44444444-4444-4444-8444-444444444444';
  const STUDENT_1_ID = '33333333-3333-4333-8333-333333333333';
  const STUDENT_2_ID = '22222222-2222-4222-8222-222222222222';
  const STUDENT_3_ID = '11111111-1111-4111-8111-111111111111';

  const ACTOR = {
    userId: 'admin-1',
    email: 'admin@school.edu',
    systemRole: 'SCHOOL_ADMIN'
  };

  beforeEach(() => {
    vi.clearAllMocks();

    prisma.class.findFirst.mockResolvedValue({
      id: CLASS_ID,
      schoolId: SCHOOL_ID,
      name: 'Grade 10'
    });

    prisma.student.findMany.mockResolvedValue([
      { id: STUDENT_1_ID, schoolId: SCHOOL_ID, classId: CLASS_ID, status: 'Active' },
      { id: STUDENT_2_ID, schoolId: SCHOOL_ID, classId: CLASS_ID, status: 'Active' },
      { id: STUDENT_3_ID, schoolId: SCHOOL_ID, classId: CLASS_ID, status: 'Active' }
    ]);

    prisma.schoolSetting.findFirst.mockResolvedValue(null);
    auditRepository.createAuditLog.mockResolvedValue({ id: 'audit-1' });
    attendanceRepository.findSessionById.mockResolvedValue({
      id: SESSION_ID,
      schoolId: SCHOOL_ID,
      classId: CLASS_ID,
      records: []
    });
  });

  it('handles P2002 race condition on concurrent session creation by falling back to FOR UPDATE lock on existing session', async () => {
    const p2002Error = new Error('Unique constraint failed on the fields: (`school_id`,`class_id`,`date`,`session`)');
    p2002Error.code = 'P2002';
    p2002Error.meta = { target: ['school_id', 'class_id', 'date', 'session'] };

    // First attempt finds no session
    attendanceRepository.findSessionByNaturalKey.mockResolvedValue(null);
    attendanceRepository.lockSessionByNaturalKeyForUpdate.mockResolvedValue(null);

    // Create throws P2002 due to race with another concurrent worker
    attendanceRepository.createSession.mockRejectedValueOnce(p2002Error);

    // Recovery path re-locks the existing session
    attendanceRepository.lockSessionByNaturalKeyForUpdate.mockResolvedValueOnce({
      id: SESSION_ID,
      school_id: SCHOOL_ID,
      class_id: CLASS_ID
    });

    attendanceRepository.aggregateStudentRecords.mockResolvedValue({
      totalDays: 1,
      presentDays: 1,
      absentDays: 0,
      lateDays: 0,
      percentage: 100
    });
    attendanceRepository.countStudentMonthlyAbsents.mockResolvedValue(0);

    const payload = {
      classId: CLASS_ID,
      date: '2026-09-05',
      session: 'STANDARD',
      records: [{ studentId: STUDENT_1_ID, status: 'Present' }]
    };

    const result = await attendanceService.submitAttendanceSession(SCHOOL_ID, payload, ACTOR);
    expect(result.id).toBe(SESSION_ID);
    expect(attendanceRepository.createSession).toHaveBeenCalled();
    expect(attendanceRepository.lockSessionByNaturalKeyForUpdate).toHaveBeenCalled();
    expect(attendanceRepository.upsertRecord).toHaveBeenCalled();
  });

  it('sorts affected student IDs deterministically before acquiring AttendanceStat locks to prevent deadlocks', async () => {
    attendanceRepository.findSessionByNaturalKey.mockResolvedValue({
      id: SESSION_ID,
      schoolId: SCHOOL_ID
    });
    attendanceRepository.lockSessionForUpdate.mockResolvedValue({
      id: SESSION_ID,
      school_id: SCHOOL_ID
    });

    attendanceRepository.aggregateStudentRecords.mockResolvedValue({
      totalDays: 1,
      presentDays: 1,
      absentDays: 0,
      lateDays: 0,
      percentage: 100
    });
    attendanceRepository.countStudentMonthlyAbsents.mockResolvedValue(0);

    // Pass records in unsorted order: STUDENT_3_ID, STUDENT_1_ID, STUDENT_2_ID
    const payload = {
      classId: CLASS_ID,
      date: '2026-09-05',
      session: 'STANDARD',
      records: [
        { studentId: STUDENT_3_ID, status: 'Present' },
        { studentId: STUDENT_1_ID, status: 'Absent' },
        { studentId: STUDENT_2_ID, status: 'Late' }
      ]
    };

    await attendanceService.submitAttendanceSession(SCHOOL_ID, payload, ACTOR);

    // Verify lock order on AttendanceStat
    const lockCalls = attendanceRepository.lockAttendanceStatForUpdate.mock.calls;
    expect(lockCalls.length).toBe(3);

    // Expected alphabetical order: STUDENT_3_ID (11111111...), STUDENT_2_ID (22222222...), STUDENT_1_ID (33333333...)
    expect(lockCalls[0][1]).toBe(STUDENT_3_ID);
    expect(lockCalls[1][1]).toBe(STUDENT_2_ID);
    expect(lockCalls[2][1]).toBe(STUDENT_1_ID);
  });

  it('locks existing session with FOR UPDATE before updating records during PATCH', async () => {
    attendanceRepository.findSessionById.mockResolvedValue({
      id: SESSION_ID,
      schoolId: SCHOOL_ID,
      classId: CLASS_ID,
      date: '2026-09-05'
    });
    attendanceRepository.lockSessionForUpdate.mockResolvedValue({
      id: SESSION_ID,
      school_id: SCHOOL_ID,
      class_id: CLASS_ID,
      date: '2026-09-05'
    });

    attendanceRepository.aggregateStudentRecords.mockResolvedValue({
      totalDays: 1,
      presentDays: 1,
      absentDays: 0,
      lateDays: 0,
      percentage: 100
    });
    attendanceRepository.countStudentMonthlyAbsents.mockResolvedValue(0);

    const payload = {
      records: [{ studentId: STUDENT_1_ID, status: 'Present' }]
    };

    await attendanceService.updateAttendanceSession(SCHOOL_ID, SESSION_ID, payload, ACTOR);

    expect(attendanceRepository.lockSessionForUpdate).toHaveBeenCalledWith(
      SCHOOL_ID,
      SESSION_ID,
      expect.anything()
    );
  });
});
