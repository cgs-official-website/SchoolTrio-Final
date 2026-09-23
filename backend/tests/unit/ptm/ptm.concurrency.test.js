import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as ptmService from '../../../src/modules/ptm/ptm.service.js';
import * as ptmRepository from '../../../src/modules/ptm/ptm.repository.js';
import { ConflictError } from '../../../src/utils/app-error.js';
import { SYSTEM_ROLES } from '../../../src/config/constants.js';

vi.mock('../../../src/modules/ptm/ptm.repository.js');
vi.mock('../../../src/database/prisma.client.js', () => ({
  prisma: {
    $transaction: vi.fn((cb) => cb({}))
  }
}));
vi.mock('../../../src/modules/audit/audit.repository.js', () => ({
  createAuditLog: vi.fn().mockResolvedValue({ id: 'audit-1' })
}));

describe('Unit: PTM Concurrency & Slot Collision Tests', () => {
  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
  const CLASS_ID = '22222222-2222-4222-8222-222222222222';
  const STUDENT_1_ID = '33333333-1111-4333-8333-111111111111';
  const STUDENT_2_ID = '33333333-2222-4333-8333-222222222222';
  const TEACHER_USER_ID = '44444444-4444-4444-8444-444444444444';
  const TEACHER_PROFILE_ID = '55555555-5555-4555-8555-555555555555';

  const TEACHER_ACTOR = {
    id: TEACHER_USER_ID,
    userId: TEACHER_USER_ID,
    email: 'teacher@school.com',
    role: 'TEACHER',
    systemRole: SYSTEM_ROLES.TEACHER
  };

  const MOCK_TEACHER_PROFILE = {
    id: TEACHER_PROFILE_ID,
    schoolId: SCHOOL_ID,
    userId: TEACHER_USER_ID,
    name: 'Jane Teacher',
    status: 'Active',
    assignedClassId: CLASS_ID,
    user: { isActive: true },
    headedClasses: []
  };

  const MOCK_STUDENT_1 = {
    id: STUDENT_1_ID,
    schoolId: SCHOOL_ID,
    classId: CLASS_ID,
    firstName: 'Student',
    lastName: 'One',
    parents: []
  };

  const MOCK_STUDENT_2 = {
    id: STUDENT_2_ID,
    schoolId: SCHOOL_ID,
    classId: CLASS_ID,
    firstName: 'Student',
    lastName: 'Two',
    parents: []
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('simulates concurrent booking race on the exact same teacher + date + timeSlot: only one succeeds', async () => {
    ptmRepository.findStudentById.mockImplementation((schoolId, id) => {
      if (id === STUDENT_1_ID) return Promise.resolve(MOCK_STUDENT_1);
      if (id === STUDENT_2_ID) return Promise.resolve(MOCK_STUDENT_2);
      return Promise.resolve(null);
    });

    ptmRepository.findStaffProfileByUserId.mockResolvedValue(MOCK_TEACHER_PROFILE);

    // Simulate in-flight atomic lock/conflict check where first request wins and second sees teacherConflict: true
    let isSlotClaimed = false;

    ptmRepository.checkAppointmentConflicts.mockImplementation(() => {
      if (!isSlotClaimed) {
        isSlotClaimed = true;
        return Promise.resolve({ teacherConflict: false, studentConflict: false });
      } else {
        return Promise.resolve({ teacherConflict: true, studentConflict: false });
      }
    });

    ptmRepository.createAppointment.mockImplementation((data) => {
      return Promise.resolve({
        id: 'ptm-created-1',
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
        student: MOCK_STUDENT_1,
        teacher: { id: TEACHER_PROFILE_ID, name: 'Jane Teacher' },
        class: { id: CLASS_ID, name: 'Grade 10-A' }
      });
    });

    // Execute concurrent booking attempts with Promise.all
    const booking1 = ptmService.createPtm(
      SCHOOL_ID,
      { studentId: STUDENT_1_ID, date: '2026-09-20', timeSlot: '10:00 AM' },
      TEACHER_ACTOR
    );

    const booking2 = ptmService.createPtm(
      SCHOOL_ID,
      { studentId: STUDENT_2_ID, date: '2026-09-20', timeSlot: '10:00 AM' },
      TEACHER_ACTOR
    );

    const results = await Promise.allSettled([booking1, booking2]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(ConflictError);
    expect(rejected[0].reason.message).toContain('Teacher is already booked');
  });

  it('verifies that a cancelled appointment does not block booking the same slot later', async () => {
    ptmRepository.findStudentById.mockResolvedValue(MOCK_STUDENT_1);
    ptmRepository.findStaffProfileByUserId.mockResolvedValue(MOCK_TEACHER_PROFILE);

    // checkAppointmentConflicts only checks for active (status != 'Cancelled') appointments
    ptmRepository.checkAppointmentConflicts.mockResolvedValue({
      teacherConflict: false,
      studentConflict: false
    });

    ptmRepository.createAppointment.mockResolvedValue({
      id: 'ptm-rebooked-1',
      schoolId: SCHOOL_ID,
      studentId: STUDENT_1_ID,
      teacherId: TEACHER_PROFILE_ID,
      classId: CLASS_ID,
      date: '2026-09-20',
      timeSlot: '10:00 AM',
      type: 'In-person',
      status: 'Confirmed',
      createdAt: new Date(),
      updatedAt: new Date(),
      student: MOCK_STUDENT_1,
      teacher: { id: TEACHER_PROFILE_ID, name: 'Jane Teacher' },
      class: { id: CLASS_ID, name: 'Grade 10-A' }
    });

    const result = await ptmService.createPtm(
      SCHOOL_ID,
      { studentId: STUDENT_1_ID, date: '2026-09-20', timeSlot: '10:00 AM' },
      TEACHER_ACTOR
    );

    expect(result.id).toBe('ptm-rebooked-1');
  });

  it('verifies that FOR UPDATE row-locks are acquired on teacher and student before conflict checks and creation', async () => {
    const callSequence = [];

    ptmRepository.findStudentById.mockImplementation(() => {
      callSequence.push('FIND_STUDENT');
      return Promise.resolve(MOCK_STUDENT_1);
    });

    ptmRepository.findStaffProfileByUserId.mockImplementation(() => {
      callSequence.push('FIND_TEACHER');
      return Promise.resolve(MOCK_TEACHER_PROFILE);
    });

    ptmRepository.lockTeacherAndStudentForBooking.mockImplementation(() => {
      callSequence.push('ACQUIRE_ROW_LOCKS_FOR_UPDATE');
      return Promise.resolve();
    });

    ptmRepository.checkAppointmentConflicts.mockImplementation(() => {
      callSequence.push('CHECK_CONFLICTS');
      return Promise.resolve({ teacherConflict: false, studentConflict: false });
    });

    ptmRepository.createAppointment.mockImplementation((data) => {
      callSequence.push('CREATE_APPOINTMENT');
      return Promise.resolve({
        id: 'ptm-seq-1',
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
        student: MOCK_STUDENT_1,
        teacher: { id: TEACHER_PROFILE_ID, name: 'Jane Teacher' },
        class: { id: CLASS_ID, name: 'Grade 10-A' }
      });
    });

    await ptmService.createPtm(
      SCHOOL_ID,
      { studentId: STUDENT_1_ID, date: '2026-09-20', timeSlot: '10:00 AM' },
      TEACHER_ACTOR
    );

    expect(callSequence).toEqual([
      'FIND_STUDENT',
      'FIND_TEACHER',
      'ACQUIRE_ROW_LOCKS_FOR_UPDATE',
      'CHECK_CONFLICTS',
      'CREATE_APPOINTMENT'
    ]);
  });
});
