import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as ptmService from '../../../src/modules/ptm/ptm.service.js';
import * as ptmRepository from '../../../src/modules/ptm/ptm.repository.js';
import * as auditRepository from '../../../src/modules/audit/audit.repository.js';
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
  ConflictError,
  TenantAccessError
} from '../../../src/utils/app-error.js';
import { SYSTEM_ROLES } from '../../../src/config/constants.js';
import { PTM_STATUS, PTM_TYPES } from '../../../src/modules/ptm/ptm.schema.js';

vi.mock('../../../src/modules/ptm/ptm.repository.js');
vi.mock('../../../src/database/prisma.client.js', () => ({
  prisma: {
    $transaction: vi.fn((cb) => cb({}))
  }
}));
vi.mock('../../../src/modules/audit/audit.repository.js', () => ({
  createAuditLog: vi.fn().mockResolvedValue({ id: 'audit-1' })
}));

describe('Unit: PTM Service Tests', () => {
  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
  const CLASS_ID = '22222222-2222-4222-8222-222222222222';
  const OTHER_CLASS_ID = '22222222-9999-4222-8222-999999999999';
  const STUDENT_ID = '33333333-3333-4333-8333-333333333333';
  const UNLINKED_STUDENT_ID = '33333333-9999-4333-8333-999999999999';
  const TEACHER_USER_ID = '44444444-4444-4444-8444-444444444444';
  const TEACHER_PROFILE_ID = '55555555-5555-4555-8555-555555555555';
  const PARENT_USER_ID = '66666666-6666-4666-8666-666666666666';
  const ADMIN_USER_ID = '77777777-7777-4777-8777-777777777777';
  const PTM_ID = '88888888-8888-4888-8888-888888888888';

  const TEACHER_ACTOR = {
    id: TEACHER_USER_ID,
    userId: TEACHER_USER_ID,
    email: 'teacher@school.com',
    name: 'Jane Teacher',
    role: 'TEACHER',
    systemRole: SYSTEM_ROLES.TEACHER
  };

  const PARENT_ACTOR = {
    id: PARENT_USER_ID,
    userId: PARENT_USER_ID,
    email: 'parent@home.com',
    name: 'John Parent',
    role: 'PARENT',
    systemRole: SYSTEM_ROLES.PARENT
  };

  const ADMIN_ACTOR = {
    id: ADMIN_USER_ID,
    userId: ADMIN_USER_ID,
    email: 'admin@school.com',
    name: 'Admin Principal',
    role: 'ADMIN',
    systemRole: SYSTEM_ROLES.ADMIN
  };

  const MOCK_TEACHER_PROFILE = {
    id: TEACHER_PROFILE_ID,
    schoolId: SCHOOL_ID,
    userId: TEACHER_USER_ID,
    name: 'Jane Teacher',
    status: 'Active',
    assignedClassId: CLASS_ID,
    user: { isActive: true },
    assignedClass: { id: CLASS_ID, name: 'Grade 10-A' },
    headedClasses: []
  };

  const MOCK_STUDENT = {
    id: STUDENT_ID,
    schoolId: SCHOOL_ID,
    classId: CLASS_ID,
    firstName: 'Alex',
    lastName: 'Smith',
    admissionNumber: 'ADM-001',
    parents: [
      {
        parent: {
          id: 'parent-prof-1',
          name: 'John Parent',
          phone: '+919876543210',
          email: 'parent@home.com'
        }
      }
    ]
  };

  const MOCK_PTM = {
    id: PTM_ID,
    schoolId: SCHOOL_ID,
    studentId: STUDENT_ID,
    teacherId: TEACHER_PROFILE_ID,
    classId: CLASS_ID,
    date: '2026-09-20',
    timeSlot: '10:00 AM',
    type: PTM_TYPES.IN_PERSON,
    status: PTM_STATUS.CONFIRMED,
    notes: 'Discuss term exam progress',
    createdAt: new Date('2026-09-15T10:00:00Z'),
    updatedAt: new Date('2026-09-15T10:00:00Z'),
    student: MOCK_STUDENT,
    teacher: {
      id: TEACHER_PROFILE_ID,
      name: 'Jane Teacher',
      email: 'teacher@school.com',
      phone: '+919123456780',
      designation: 'Class Teacher'
    },
    class: {
      id: CLASS_ID,
      name: 'Grade 10-A'
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. formatPtm (DTO Serialization)', () => {
    it('formats a database entity into a safe client DTO with frontend alias', () => {
      const dto = ptmService.formatPtm(MOCK_PTM);

      expect(dto).toEqual({
        id: PTM_ID,
        schoolId: SCHOOL_ID,
        studentId: STUDENT_ID,
        studentName: 'Alex Smith',
        studentAdmissionNumber: 'ADM-001',
        teacherId: TEACHER_PROFILE_ID,
        teacherName: 'Jane Teacher',
        teacherEmail: 'teacher@school.com',
        teacherPhone: '+919123456780',
        parentName: 'John Parent',
        parentPhone: '+919876543210',
        classId: CLASS_ID,
        className: 'Grade 10-A',
        date: '2026-09-20',
        timeSlot: '10:00 AM',
        time: '10:00 AM',
        type: 'In-person',
        status: 'Confirmed',
        notes: 'Discuss term exam progress',
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date)
      });
    });

    it('returns null if ptm record is null/undefined', () => {
      expect(ptmService.formatPtm(null)).toBeNull();
    });
  });

  describe('2. listTeacherPtms', () => {
    it('throws TenantAccessError when schoolId is missing', async () => {
      await expect(ptmService.listTeacherPtms(null, {}, TEACHER_ACTOR)).rejects.toThrow(TenantAccessError);
    });

    it('lists appointments for authenticated teacher and assigned class', async () => {
      ptmRepository.findStaffProfileByUserId.mockResolvedValue(MOCK_TEACHER_PROFILE);
      ptmRepository.findTeacherAppointments.mockResolvedValue([MOCK_PTM]);
      ptmRepository.countTeacherAppointments.mockResolvedValue(1);

      const result = await ptmService.listTeacherPtms(SCHOOL_ID, { tab: 'upcoming' }, TEACHER_ACTOR);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe(PTM_ID);
      expect(result.pagination.total).toBe(1);
      expect(ptmRepository.findTeacherAppointments).toHaveBeenCalledWith(
        SCHOOL_ID,
        expect.objectContaining({
          teacherId: TEACHER_PROFILE_ID,
          classId: CLASS_ID,
          tab: 'upcoming'
        })
      );
    });

    it('throws ForbiddenError if teacher account is inactive', async () => {
      ptmRepository.findStaffProfileByUserId.mockResolvedValue({
        ...MOCK_TEACHER_PROFILE,
        status: 'Inactive'
      });

      await expect(ptmService.listTeacherPtms(SCHOOL_ID, {}, TEACHER_ACTOR)).rejects.toThrow(ForbiddenError);
    });
  });

  describe('3. listStudentPtms (Parent Custody Verification)', () => {
    it('allows authenticated parent to list meetings for linked child', async () => {
      ptmRepository.findStudentById.mockResolvedValue(MOCK_STUDENT);
      ptmRepository.findAuthorizedStudentIdsForParent.mockResolvedValue([STUDENT_ID]);
      ptmRepository.findStudentAppointments.mockResolvedValue([MOCK_PTM]);
      ptmRepository.countStudentAppointments.mockResolvedValue(1);

      const result = await ptmService.listStudentPtms(SCHOOL_ID, STUDENT_ID, { tab: 'upcoming' }, PARENT_ACTOR);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].studentId).toBe(STUDENT_ID);
    });

    it('rejects parent access to unlinked student (NotFoundError for security)', async () => {
      ptmRepository.findStudentById.mockResolvedValue({ ...MOCK_STUDENT, id: UNLINKED_STUDENT_ID });
      ptmRepository.findAuthorizedStudentIdsForParent.mockResolvedValue([STUDENT_ID]); // Parent only has STUDENT_ID

      await expect(
        ptmService.listStudentPtms(SCHOOL_ID, UNLINKED_STUDENT_ID, {}, PARENT_ACTOR)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('4. getPtmById (Single Appointment Access)', () => {
    it('allows teacher to retrieve their own appointment', async () => {
      ptmRepository.findAppointmentById.mockResolvedValue(MOCK_PTM);
      ptmRepository.findStaffProfileByUserId.mockResolvedValue(MOCK_TEACHER_PROFILE);

      const result = await ptmService.getPtmById(SCHOOL_ID, PTM_ID, TEACHER_ACTOR);
      expect(result.id).toBe(PTM_ID);
    });

    it('rejects unrelated teacher attempting to view appointment', async () => {
      ptmRepository.findAppointmentById.mockResolvedValue(MOCK_PTM);
      ptmRepository.findStaffProfileByUserId.mockResolvedValue({
        ...MOCK_TEACHER_PROFILE,
        id: 'other-teacher-profile',
        assignedClassId: OTHER_CLASS_ID
      });

      await expect(ptmService.getPtmById(SCHOOL_ID, PTM_ID, TEACHER_ACTOR)).rejects.toThrow(ForbiddenError);
    });
  });

  describe('5. createPtm (Booking & Conflict Prevention)', () => {
    it('creates appointment successfully when no conflict exists', async () => {
      ptmRepository.findStudentById.mockResolvedValue(MOCK_STUDENT);
      ptmRepository.findStaffProfileByUserId.mockResolvedValue(MOCK_TEACHER_PROFILE);
      ptmRepository.checkAppointmentConflicts.mockResolvedValue({
        teacherConflict: false,
        studentConflict: false
      });
      ptmRepository.createAppointment.mockResolvedValue(MOCK_PTM);

      const result = await ptmService.createPtm(
        SCHOOL_ID,
        {
          studentId: STUDENT_ID,
          date: '2026-09-20',
          timeSlot: '10:00 AM',
          type: 'In-person'
        },
        TEACHER_ACTOR
      );

      expect(result.id).toBe(PTM_ID);
      expect(auditRepository.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          schoolId: SCHOOL_ID,
          entityType: 'PtmAppointment',
          actionPerformed: expect.stringContaining('CREATE_PTM')
        })
      );
    });

    it('rejects creation when teacher has a slot conflict', async () => {
      ptmRepository.findStudentById.mockResolvedValue(MOCK_STUDENT);
      ptmRepository.findStaffProfileByUserId.mockResolvedValue(MOCK_TEACHER_PROFILE);
      ptmRepository.checkAppointmentConflicts.mockResolvedValue({
        teacherConflict: true,
        studentConflict: false
      });

      await expect(
        ptmService.createPtm(
          SCHOOL_ID,
          {
            studentId: STUDENT_ID,
            date: '2026-09-20',
            timeSlot: '10:00 AM'
          },
          TEACHER_ACTOR
        )
      ).rejects.toThrow(ConflictError);
    });

    it('rejects creation when student has a slot conflict', async () => {
      ptmRepository.findStudentById.mockResolvedValue(MOCK_STUDENT);
      ptmRepository.findStaffProfileByUserId.mockResolvedValue(MOCK_TEACHER_PROFILE);
      ptmRepository.checkAppointmentConflicts.mockResolvedValue({
        teacherConflict: false,
        studentConflict: true
      });

      await expect(
        ptmService.createPtm(
          SCHOOL_ID,
          {
            studentId: STUDENT_ID,
            date: '2026-09-20',
            timeSlot: '10:00 AM'
          },
          TEACHER_ACTOR
        )
      ).rejects.toThrow(ConflictError);
    });

    it('rejects teacher booking for a student outside assigned class', async () => {
      ptmRepository.findStudentById.mockResolvedValue({
        ...MOCK_STUDENT,
        classId: OTHER_CLASS_ID
      });
      ptmRepository.findStaffProfileByUserId.mockResolvedValue(MOCK_TEACHER_PROFILE);

      await expect(
        ptmService.createPtm(
          SCHOOL_ID,
          {
            studentId: STUDENT_ID,
            date: '2026-09-20',
            timeSlot: '10:00 AM'
          },
          TEACHER_ACTOR
        )
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe('6. updatePtmStatus (Lifecycle State Machine)', () => {
    it('allows teacher to transition Pending -> Confirmed', async () => {
      const pendingPtm = { ...MOCK_PTM, status: PTM_STATUS.PENDING };
      ptmRepository.findAppointmentById.mockResolvedValue(pendingPtm);
      ptmRepository.findStaffProfileByUserId.mockResolvedValue(MOCK_TEACHER_PROFILE);
      ptmRepository.updateAppointment.mockResolvedValue({ ...MOCK_PTM, status: PTM_STATUS.CONFIRMED });

      const result = await ptmService.updatePtmStatus(
        SCHOOL_ID,
        PTM_ID,
        { status: PTM_STATUS.CONFIRMED },
        TEACHER_ACTOR
      );

      expect(result.status).toBe(PTM_STATUS.CONFIRMED);
      expect(auditRepository.createAuditLog).toHaveBeenCalled();
    });

    it('allows parent to cancel their child appointment', async () => {
      ptmRepository.findAppointmentById.mockResolvedValue(MOCK_PTM);
      ptmRepository.findAuthorizedStudentIdsForParent.mockResolvedValue([STUDENT_ID]);
      ptmRepository.updateAppointment.mockResolvedValue({ ...MOCK_PTM, status: PTM_STATUS.CANCELLED });

      const result = await ptmService.updatePtmStatus(
        SCHOOL_ID,
        PTM_ID,
        { status: PTM_STATUS.CANCELLED },
        PARENT_ACTOR
      );

      expect(result.status).toBe(PTM_STATUS.CANCELLED);
    });

    it('rejects parent attempting to mark an appointment Confirmed/Completed', async () => {
      ptmRepository.findAppointmentById.mockResolvedValue(MOCK_PTM);
      ptmRepository.findAuthorizedStudentIdsForParent.mockResolvedValue([STUDENT_ID]);

      await expect(
        ptmService.updatePtmStatus(
          SCHOOL_ID,
          PTM_ID,
          { status: PTM_STATUS.COMPLETED },
          PARENT_ACTOR
        )
      ).rejects.toThrow(ForbiddenError);
    });

    it('rejects invalid state machine transition from Cancelled -> Confirmed', async () => {
      const cancelledPtm = { ...MOCK_PTM, status: PTM_STATUS.CANCELLED };
      ptmRepository.findAppointmentById.mockResolvedValue(cancelledPtm);
      ptmRepository.findStaffProfileByUserId.mockResolvedValue(MOCK_TEACHER_PROFILE);

      await expect(
        ptmService.updatePtmStatus(
          SCHOOL_ID,
          PTM_ID,
          { status: PTM_STATUS.CONFIRMED },
          TEACHER_ACTOR
        )
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('7. cancelPtm (Soft Delete)', () => {
    it('cancels appointment and returns confirmation response', async () => {
      ptmRepository.findAppointmentById.mockResolvedValue(MOCK_PTM);
      ptmRepository.findStaffProfileByUserId.mockResolvedValue(MOCK_TEACHER_PROFILE);
      ptmRepository.updateAppointment.mockResolvedValue({ ...MOCK_PTM, status: PTM_STATUS.CANCELLED });

      const result = await ptmService.cancelPtm(SCHOOL_ID, PTM_ID, TEACHER_ACTOR);

      expect(result).toEqual({
        message: 'PTM appointment successfully cancelled',
        id: PTM_ID,
        status: PTM_STATUS.CANCELLED
      });
    });
  });

  describe('8. Admin Operations', () => {
    it('allows admin to create an appointment for any teacher/student', async () => {
      ptmRepository.findStudentById.mockResolvedValue(MOCK_STUDENT);
      ptmRepository.findStaffProfileById.mockResolvedValue(MOCK_TEACHER_PROFILE);
      ptmRepository.checkAppointmentConflicts.mockResolvedValue({
        teacherConflict: false,
        studentConflict: false
      });
      ptmRepository.createAppointment.mockResolvedValue(MOCK_PTM);

      const result = await ptmService.createPtm(
        SCHOOL_ID,
        {
          studentId: STUDENT_ID,
          teacherId: TEACHER_PROFILE_ID,
          date: '2026-09-20',
          timeSlot: '10:00 AM'
        },
        ADMIN_ACTOR
      );

      expect(result.id).toBe(PTM_ID);
    });

    it('allows admin to list all appointments across classes', async () => {
      ptmRepository.findTeacherAppointments.mockResolvedValue([MOCK_PTM]);
      ptmRepository.countTeacherAppointments.mockResolvedValue(1);

      const result = await ptmService.listTeacherPtms(SCHOOL_ID, { classId: CLASS_ID }, ADMIN_ACTOR);

      expect(result.data).toHaveLength(1);
      expect(ptmRepository.findStaffProfileByUserId).not.toHaveBeenCalled();
    });
  });
});
