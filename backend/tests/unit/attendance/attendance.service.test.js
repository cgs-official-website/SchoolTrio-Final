import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as attendanceService from '../../../src/modules/attendance/attendance.service.js';
import * as attendanceRepository from '../../../src/modules/attendance/attendance.repository.js';
import * as auditRepository from '../../../src/modules/audit/audit.repository.js';
import { prisma } from '../../../src/database/prisma.client.js';
import {
  NotFoundError,
  ForbiddenError,
  ValidationError
} from '../../../src/utils/app-error.js';

vi.mock('../../../src/modules/attendance/attendance.repository.js');
vi.mock('../../../src/modules/audit/audit.repository.js');
vi.mock('../../../src/database/prisma.client.js', () => {
  const mockPrisma = {
    class: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn()
    },
    section: {
      findFirst: vi.fn()
    },
    student: {
      findMany: vi.fn(),
      findFirst: vi.fn()
    },
    staffProfile: {
      findFirst: vi.fn()
    },
    parentProfile: {
      findFirst: vi.fn()
    },
    parentStudentLink: {
      findFirst: vi.fn()
    },
    schoolSetting: {
      findFirst: vi.fn()
    },
    $transaction: vi.fn(async (cb) => cb(mockPrisma))
  };
  return { prisma: mockPrisma };
});

describe('Unit: Attendance Service Layer — Phase 4C.5', () => {
  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
  const CLASS_ID = '22222222-2222-4222-8222-222222222222';
  const SECTION_ID = '33333333-3333-4333-8333-333333333333';
  const SESSION_ID = '44444444-4444-4444-8444-444444444444';
  const STUDENT_1_ID = '55555555-5555-4555-8555-555555555555';
  const STUDENT_2_ID = '66666666-6666-4666-8666-666666666666';
  const STAFF_PROFILE_ID = '77777777-7777-4777-8777-777777777777';
  const USER_ID = '88888888-8888-4888-8888-888888888888';
  const FLAG_ID = '99999999-9999-4999-8999-999999999999';

  const ACTOR_ADMIN = {
    userId: USER_ID,
    email: 'admin@school.edu',
    systemRole: 'SCHOOL_ADMIN'
  };

  const ACTOR_TEACHER = {
    userId: USER_ID,
    email: 'teacher@school.edu',
    systemRole: 'TEACHER',
    staffProfile: { id: STAFF_PROFILE_ID, assignedClassId: CLASS_ID }
  };

  const ACTOR_PARENT = {
    userId: USER_ID,
    email: 'parent@school.edu',
    systemRole: 'PARENT'
  };

  beforeEach(() => {
    vi.clearAllMocks();

    prisma.class.findFirst.mockResolvedValue({
      id: CLASS_ID,
      schoolId: SCHOOL_ID,
      name: 'Grade 10',
      section: 'A',
      classTeacherId: STAFF_PROFILE_ID
    });

    prisma.student.findMany.mockResolvedValue([
      { id: STUDENT_1_ID, schoolId: SCHOOL_ID, classId: CLASS_ID, sectionId: SECTION_ID, status: 'Active' },
      { id: STUDENT_2_ID, schoolId: SCHOOL_ID, classId: CLASS_ID, sectionId: SECTION_ID, status: 'Active' }
    ]);

    prisma.schoolSetting.findFirst.mockResolvedValue(null);
    auditRepository.createAuditLog.mockResolvedValue({ id: 'audit-1' });
  });

  describe('1. listSessions & getSessionById', () => {
    it('returns paginated attendance sessions', async () => {
      attendanceRepository.findSessions.mockResolvedValue([
        { id: SESSION_ID, classId: CLASS_ID, date: '2026-09-05', session: 'STANDARD', _count: { records: 2 } }
      ]);
      attendanceRepository.countSessions.mockResolvedValue(1);

      const result = await attendanceService.listSessions(SCHOOL_ID, { page: 1, limit: 20 });
      expect(result.sessions).toHaveLength(1);
      expect(result.pagination.total).toBe(1);
    });

    it('throws NotFoundError when session does not exist', async () => {
      attendanceRepository.findSessionById.mockResolvedValue(null);
      await expect(attendanceService.getSessionById(SCHOOL_ID, 'nonexistent')).rejects.toThrow(NotFoundError);
    });
  });

  describe('2. submitAttendanceSession', () => {
    it('creates attendance session, calculates stats, creates absentee flag and dispatches audit log', async () => {
      attendanceRepository.findSessionByNaturalKey.mockResolvedValue(null);
      attendanceRepository.lockSessionByNaturalKeyForUpdate.mockResolvedValue(null);
      attendanceRepository.createSession.mockResolvedValue({
        id: SESSION_ID,
        schoolId: SCHOOL_ID,
        classId: CLASS_ID,
        date: '2026-09-05',
        session: 'STANDARD'
      });
      attendanceRepository.lockAttendanceStatForUpdate.mockResolvedValue(null);
      attendanceRepository.aggregateStudentRecords.mockResolvedValue({
        totalDays: 5,
        presentDays: 3,
        absentDays: 2,
        lateDays: 0,
        percentage: 60
      });
      attendanceRepository.countStudentMonthlyAbsents.mockResolvedValue(2);
      attendanceRepository.findSessionById.mockResolvedValue({
        id: SESSION_ID,
        schoolId: SCHOOL_ID,
        classId: CLASS_ID,
        records: []
      });

      const payload = {
        classId: CLASS_ID,
        date: '2026-09-05',
        session: 'STANDARD',
        records: [
          { studentId: STUDENT_1_ID, status: 'Present' },
          { studentId: STUDENT_2_ID, status: 'Absent', remark: 'Sick' }
        ]
      };

      const result = await attendanceService.submitAttendanceSession(SCHOOL_ID, payload, ACTOR_ADMIN);
      expect(result.id).toBe(SESSION_ID);
      expect(attendanceRepository.createSession).toHaveBeenCalled();
      expect(attendanceRepository.upsertRecord).toHaveBeenCalledTimes(2);
      expect(attendanceRepository.upsertAttendanceStat).toHaveBeenCalled();
      expect(attendanceRepository.upsertAbsenteeFlag).toHaveBeenCalled();
      expect(auditRepository.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actionPerformed: expect.stringContaining('RECORD_ATTENDANCE')
        })
      );
    });

    it('denies teacher when not assigned to target class', async () => {
      prisma.staffProfile.findFirst.mockResolvedValue({
        id: 'other-staff-id',
        assignedClassId: 'other-class-id'
      });
      prisma.class.findFirst.mockResolvedValue({
        id: CLASS_ID,
        schoolId: SCHOOL_ID,
        classTeacherId: 'different-teacher-id'
      });

      const unauthorizedTeacher = {
        userId: USER_ID,
        systemRole: 'TEACHER',
        permissions: []
      };

      await expect(attendanceService.submitAttendanceSession(SCHOOL_ID, {
        classId: CLASS_ID,
        date: '2026-09-05',
        records: [{ studentId: STUDENT_1_ID, status: 'Present' }]
      }, unauthorizedTeacher)).rejects.toThrow(ForbiddenError);
    });

    it('rejects submission if student does not belong to target class', async () => {
      prisma.student.findMany.mockResolvedValue([
        // Only 1 student found when 2 were submitted
        { id: STUDENT_1_ID }
      ]);

      await expect(attendanceService.submitAttendanceSession(SCHOOL_ID, {
        classId: CLASS_ID,
        date: '2026-09-05',
        records: [
          { studentId: STUDENT_1_ID, status: 'Present' },
          { studentId: STUDENT_2_ID, status: 'Present' }
        ]
      }, ACTOR_ADMIN)).rejects.toThrow(ValidationError);
    });
  });

  describe('3. updateAttendanceSession (PATCH)', () => {
    it('locks session, updates records, recomputes stats and removes flag if absences fall below threshold', async () => {
      attendanceRepository.findSessionById.mockResolvedValue({
        id: SESSION_ID,
        schoolId: SCHOOL_ID,
        classId: CLASS_ID,
        date: '2026-09-05',
        session: 'STANDARD'
      });
      attendanceRepository.lockSessionForUpdate.mockResolvedValue({
        id: SESSION_ID,
        school_id: SCHOOL_ID,
        class_id: CLASS_ID,
        date: '2026-09-05'
      });

      attendanceRepository.aggregateStudentRecords.mockResolvedValue({
        totalDays: 5,
        presentDays: 4,
        absentDays: 1,
        lateDays: 0,
        percentage: 80
      });
      attendanceRepository.countStudentMonthlyAbsents.mockResolvedValue(1); // below threshold (2)

      const payload = {
        records: [{ studentId: STUDENT_1_ID, status: 'Present', remark: 'Corrected attendance' }]
      };

      const result = await attendanceService.updateAttendanceSession(SCHOOL_ID, SESSION_ID, payload, ACTOR_ADMIN);
      expect(result.id).toBe(SESSION_ID);
      expect(attendanceRepository.deleteAbsenteeFlag).toHaveBeenCalledWith(SCHOOL_ID, STUDENT_1_ID, '2026-09', expect.anything());
      expect(auditRepository.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actionPerformed: expect.stringContaining('UPDATE_ATTENDANCE')
        })
      );
    });
  });

  describe('4. deleteAttendanceSession', () => {
    it('allows SCHOOL_ADMIN to delete session and recalculates affected stats', async () => {
      attendanceRepository.findSessionById.mockResolvedValue({
        id: SESSION_ID,
        schoolId: SCHOOL_ID,
        classId: CLASS_ID,
        date: '2026-09-05',
        session: 'STANDARD'
      });
      attendanceRepository.lockSessionForUpdate.mockResolvedValue({
        id: SESSION_ID,
        school_id: SCHOOL_ID,
        class_id: CLASS_ID,
        date: '2026-09-05'
      });
      attendanceRepository.findRecordsBySessionId.mockResolvedValue([
        { studentId: STUDENT_1_ID }
      ]);
      attendanceRepository.aggregateStudentRecords.mockResolvedValue({
        totalDays: 4,
        presentDays: 4,
        absentDays: 0,
        lateDays: 0,
        percentage: 100
      });
      attendanceRepository.countStudentMonthlyAbsents.mockResolvedValue(0);

      await attendanceService.deleteAttendanceSession(SCHOOL_ID, SESSION_ID, ACTOR_ADMIN);

      expect(attendanceRepository.deleteSession).toHaveBeenCalledWith(SCHOOL_ID, SESSION_ID, expect.anything());
      expect(attendanceRepository.deleteAbsenteeFlag).toHaveBeenCalled();
      expect(auditRepository.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actionPerformed: expect.stringContaining('DELETE_ATTENDANCE_SESSION')
        })
      );
    });

    it('denies TEACHER from deleting session with ForbiddenError', async () => {
      await expect(attendanceService.deleteAttendanceSession(SCHOOL_ID, SESSION_ID, ACTOR_TEACHER))
        .rejects.toThrow(ForbiddenError);
    });
  });

  describe('5. getDashboardStats', () => {
    it('computes daily attendance aggregates across school classes', async () => {
      attendanceRepository.findClassesForDashboard.mockResolvedValue([
        { id: CLASS_ID, name: 'Grade 10', gradeLevel: 10, sections: [] },
        { id: 'class-2', name: 'Grade 11', gradeLevel: 11, sections: [] }
      ]);
      attendanceRepository.findDailySessionsForDashboard.mockResolvedValue([
        {
          id: SESSION_ID,
          classId: CLASS_ID,
          session: 'STANDARD',
          class: { name: 'Grade 10', gradeLevel: 10 },
          records: [
            { studentId: STUDENT_1_ID, status: 'Present' },
            { studentId: STUDENT_2_ID, status: 'Absent' }
          ]
        }
      ]);

      const result = await attendanceService.getDashboardStats(SCHOOL_ID, '2026-09-05');
      expect(result.date).toBe('2026-09-05');
      expect(result.classesTotal).toBe(2);
      expect(result.classesMarked).toBe(1);
      expect(result.classesPending).toBe(1);
      expect(result.schoolWide.present).toBe(1);
      expect(result.schoolWide.absent).toBe(1);
      expect(result.schoolWide.percentage).toBe(50);
    });
  });

  describe('6. getStudentAttendance', () => {
    it('allows institutional user to access student timeline and stats', async () => {
      prisma.student.findFirst.mockResolvedValue({
        id: STUDENT_1_ID,
        schoolId: SCHOOL_ID,
        firstName: 'Alice',
        lastName: 'Smith',
        admissionNumber: 'ADM-001',
        class: { id: CLASS_ID, name: 'Grade 10' }
      });
      attendanceRepository.findAttendanceStat.mockResolvedValue({
        totalDays: 20,
        presentDays: 18,
        absentDays: 2,
        lateDays: 0,
        percentage: 90
      });
      attendanceRepository.findRecordsByStudent.mockResolvedValue([
        { id: 'rec-1', status: 'Present', session: { date: '2026-09-05', session: 'STANDARD' } }
      ]);
      attendanceRepository.countRecordsByStudent.mockResolvedValue(1);

      const result = await attendanceService.getStudentAttendance(SCHOOL_ID, STUDENT_1_ID, {}, ACTOR_ADMIN);
      expect(result.student.id).toBe(STUDENT_1_ID);
      expect(result.cumulativeStat.percentage).toBe(90);
      expect(result.timeline).toHaveLength(1);
    });

    it('denies parent when child is not linked via ParentStudentLink', async () => {
      prisma.student.findFirst.mockResolvedValue({
        id: STUDENT_1_ID,
        schoolId: SCHOOL_ID,
        firstName: 'Alice',
        lastName: 'Smith'
      });
      prisma.parentProfile.findFirst.mockResolvedValue({ id: 'parent-profile-1' });
      prisma.parentStudentLink.findFirst.mockResolvedValue(null); // Not linked!

      await expect(attendanceService.getStudentAttendance(SCHOOL_ID, STUDENT_1_ID, {}, ACTOR_PARENT))
        .rejects.toThrow(ForbiddenError);
    });
  });

  describe('7. listAbsenteeFlags & resolveAbsenteeFlag', () => {
    it('resolves absentee flag and records audit log', async () => {
      attendanceRepository.findAbsenteeFlagById.mockResolvedValue({
        id: FLAG_ID,
        schoolId: SCHOOL_ID,
        studentId: STUDENT_1_ID,
        isResolved: false,
        student: { firstName: 'Alice' },
        monthStr: '2026-09'
      });
      attendanceRepository.updateAbsenteeFlag.mockResolvedValue({
        id: FLAG_ID,
        schoolId: SCHOOL_ID,
        studentId: STUDENT_1_ID,
        isResolved: true
      });

      const result = await attendanceService.resolveAbsenteeFlag(
        SCHOOL_ID,
        FLAG_ID,
        { isResolved: true, resolutionNotes: 'Parent verified medical leave' },
        ACTOR_ADMIN
      );

      expect(result.isResolved).toBe(true);
      expect(auditRepository.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actionPerformed: expect.stringContaining('RESOLVE_ABSENTEE_FLAG')
        })
      );
    });
  });
});
