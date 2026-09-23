import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as timetableService from '../../../src/modules/timetables/timetable.service.js';
import * as timetableRepository from '../../../src/modules/timetables/timetable.repository.js';
import * as auditRepository from '../../../src/modules/audit/audit.repository.js';
import {
  TenantAccessError,
  NotFoundError,
  ForbiddenError,
  ValidationError
} from '../../../src/utils/app-error.js';

const SCHOOL_ID = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const CLASS_ID = '11111111-1111-4111-8111-111111111111';
const SECTION_ID = '22222222-2222-4222-8222-222222222222';
const SUBJECT_ID = '33333333-3333-4333-8333-333333333333';
const TEACHER_ID = '44444444-4444-4444-8444-444444444444';
const PERIOD_ID = '55555555-5555-4555-8555-555555555555';
const USER_ID = '66666666-6666-4666-8666-666666666666';

describe('Timetable Service Unit Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(auditRepository, 'createAuditLog').mockResolvedValue({ id: 'audit-log-1' });
  });

  const mockPeriod = {
    id: PERIOD_ID,
    schoolId: SCHOOL_ID,
    classId: CLASS_ID,
    sectionId: SECTION_ID,
    subjectId: SUBJECT_ID,
    teacherId: TEACHER_ID,
    dayOfWeek: 1,
    periodNumber: 1,
    startTime: '09:00',
    endTime: '10:00',
    roomNumber: '101',
    createdAt: new Date('2026-09-01'),
    updatedAt: new Date('2026-09-01'),
    class: { id: CLASS_ID, name: 'Grade 10 - A' },
    section: { id: SECTION_ID, name: 'A' },
    subject: { id: SUBJECT_ID, name: 'Mathematics', code: 'MATH101' },
    teacher: { id: TEACHER_ID, name: 'Jane Doe', email: 'jane@school.edu', phone: '1234567890' }
  };

  const mockClass = {
    id: CLASS_ID,
    schoolId: SCHOOL_ID,
    name: 'Grade 10 - A',
    classTeacherId: TEACHER_ID,
    classTeacher: { id: TEACHER_ID, name: 'Jane Doe' }
  };

  describe('listTimetables', () => {
    it('throws TenantAccessError when schoolId is missing', async () => {
      await expect(timetableService.listTimetables(null)).rejects.toThrow(TenantAccessError);
    });

    it('lists periods for administrator with query filters', async () => {
      vi.spyOn(timetableRepository, 'findTimetablePeriods').mockResolvedValue([mockPeriod]);

      const result = await timetableService.listTimetables(
        SCHOOL_ID,
        { classId: CLASS_ID, dayOfWeek: 1 },
        { role: 'SCHOOL_ADMIN' }
      );

      expect(timetableRepository.findTimetablePeriods).toHaveBeenCalledWith(SCHOOL_ID, {
        classId: CLASS_ID,
        dayOfWeek: 1,
        teacherId: undefined,
        subjectId: undefined,
        sectionId: undefined
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(PERIOD_ID);
      expect(result[0].day).toBe('Monday');
    });

    it('scopes timetable queries for parents to linked student classes', async () => {
      vi.spyOn(timetableRepository, 'findAuthorizedClassIdsForParent').mockResolvedValue([CLASS_ID]);
      vi.spyOn(timetableRepository, 'findTimetablePeriods').mockResolvedValue([mockPeriod]);

      const result = await timetableService.listTimetables(
        SCHOOL_ID,
        {},
        { role: 'PARENT', userId: USER_ID }
      );

      expect(timetableRepository.findAuthorizedClassIdsForParent).toHaveBeenCalledWith(SCHOOL_ID, USER_ID);
      expect(timetableRepository.findTimetablePeriods).toHaveBeenCalledWith(
        SCHOOL_ID,
        expect.objectContaining({ classId: CLASS_ID })
      );
      expect(result).toHaveLength(1);
    });

    it('scopes timetable queries for students to their own class', async () => {
      vi.spyOn(timetableRepository, 'findStudentByUserId').mockResolvedValue({ id: 's1', classId: CLASS_ID });
      vi.spyOn(timetableRepository, 'findTimetablePeriods').mockResolvedValue([mockPeriod]);

      const result = await timetableService.listTimetables(
        SCHOOL_ID,
        {},
        { role: 'STUDENT', userId: USER_ID }
      );

      expect(timetableRepository.findStudentByUserId).toHaveBeenCalledWith(SCHOOL_ID, USER_ID);
      expect(timetableRepository.findTimetablePeriods).toHaveBeenCalledWith(
        SCHOOL_ID,
        expect.objectContaining({ classId: CLASS_ID })
      );
      expect(result).toHaveLength(1);
    });
  });

  describe('getClassTimetable', () => {
    it('returns structured weekly schedule for a valid class', async () => {
      vi.spyOn(timetableRepository, 'findClassInTenant').mockResolvedValue(mockClass);
      vi.spyOn(timetableRepository, 'findTimetablePeriods').mockResolvedValue([mockPeriod]);

      const result = await timetableService.getClassTimetable(SCHOOL_ID, CLASS_ID, { role: 'ADMIN' });

      expect(result.classId).toBe(CLASS_ID);
      expect(result.className).toBe('Grade 10 - A');
      expect(result.schedule.Monday).toHaveLength(1);
      expect(result.schedule.Tuesday).toHaveLength(0);
      expect(result.periods).toHaveLength(1);
    });

    it('throws NotFoundError if class does not exist in tenant', async () => {
      vi.spyOn(timetableRepository, 'findClassInTenant').mockResolvedValue(null);

      await expect(
        timetableService.getClassTimetable(SCHOOL_ID, CLASS_ID, { role: 'ADMIN' })
      ).rejects.toThrow(NotFoundError);
    });

    it('throws NotFoundError if parent tries to access an unauthorized class', async () => {
      vi.spyOn(timetableRepository, 'findClassInTenant').mockResolvedValue(mockClass);
      vi.spyOn(timetableRepository, 'findAuthorizedClassIdsForParent').mockResolvedValue(['other-class-id']);

      await expect(
        timetableService.getClassTimetable(SCHOOL_ID, CLASS_ID, { role: 'PARENT', userId: USER_ID })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('createTimetablePeriod', () => {
    it('creates period successfully when all referenced entities are valid', async () => {
      vi.spyOn(timetableRepository, 'findClassInTenant').mockResolvedValue(mockClass);
      vi.spyOn(timetableRepository, 'findSectionInTenant').mockResolvedValue({ id: SECTION_ID });
      vi.spyOn(timetableRepository, 'findSubjectInTenant').mockResolvedValue({ id: SUBJECT_ID });
      vi.spyOn(timetableRepository, 'findTeacherInTenant').mockResolvedValue({ id: TEACHER_ID });
      vi.spyOn(timetableRepository, 'createTimetablePeriod').mockResolvedValue(mockPeriod);

      const payload = {
        classId: CLASS_ID,
        sectionId: SECTION_ID,
        subjectId: SUBJECT_ID,
        teacherId: TEACHER_ID,
        dayOfWeek: 1,
        periodNumber: 1,
        startTime: '09:00',
        endTime: '10:00',
        roomNumber: '101'
      };

      const result = await timetableService.createTimetablePeriod(SCHOOL_ID, payload, {
        name: 'Admin User',
        role: 'SCHOOL_ADMIN'
      });

      expect(result.id).toBe(PERIOD_ID);
      expect(auditRepository.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actionPerformed: 'CREATE_TIMETABLE_PERIOD',
          entityType: 'TimetablePeriod'
        })
      );
    });

    it('throws NotFoundError when class does not exist in tenant', async () => {
      vi.spyOn(timetableRepository, 'findClassInTenant').mockResolvedValue(null);

      await expect(
        timetableService.createTimetablePeriod(SCHOOL_ID, { classId: CLASS_ID, dayOfWeek: 1, startTime: '09:00', endTime: '10:00' })
      ).rejects.toThrow(NotFoundError);
    });

    it('throws NotFoundError when teacher does not exist in tenant', async () => {
      vi.spyOn(timetableRepository, 'findClassInTenant').mockResolvedValue(mockClass);
      vi.spyOn(timetableRepository, 'findTeacherInTenant').mockResolvedValue(null);

      await expect(
        timetableService.createTimetablePeriod(SCHOOL_ID, {
          classId: CLASS_ID,
          teacherId: TEACHER_ID,
          dayOfWeek: 1,
          startTime: '09:00',
          endTime: '10:00'
        })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('updateTimetablePeriod', () => {
    it('updates period and dispatches audit log', async () => {
      vi.spyOn(timetableRepository, 'findTimetablePeriodById').mockResolvedValue(mockPeriod);
      vi.spyOn(timetableRepository, 'updateTimetablePeriod').mockResolvedValue({
        ...mockPeriod,
        startTime: '09:30',
        endTime: '10:30'
      });

      const result = await timetableService.updateTimetablePeriod(
        SCHOOL_ID,
        PERIOD_ID,
        { startTime: '09:30', endTime: '10:30' },
        { name: 'Admin', role: 'ADMIN' }
      );

      expect(result.startTime).toBe('09:30');
      expect(auditRepository.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actionPerformed: 'UPDATE_TIMETABLE_PERIOD'
        })
      );
    });

    it('throws ValidationError if updated time violates ordering', async () => {
      vi.spyOn(timetableRepository, 'findTimetablePeriodById').mockResolvedValue(mockPeriod);

      await expect(
        timetableService.updateTimetablePeriod(
          SCHOOL_ID,
          PERIOD_ID,
          { startTime: '11:00' }, // existing endTime is 10:00 -> 11:00 >= 10:00 is invalid
          { name: 'Admin' }
        )
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('deleteTimetablePeriod', () => {
    it('deletes period and returns success confirmation', async () => {
      vi.spyOn(timetableRepository, 'findTimetablePeriodById').mockResolvedValue(mockPeriod);
      vi.spyOn(timetableRepository, 'deleteTimetablePeriod').mockResolvedValue(mockPeriod);

      const result = await timetableService.deleteTimetablePeriod(SCHOOL_ID, PERIOD_ID, { name: 'Admin' });

      expect(result.id).toBe(PERIOD_ID);
      expect(auditRepository.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actionPerformed: 'DELETE_TIMETABLE_PERIOD'
        })
      );
    });

    it('throws NotFoundError if period not found in tenant', async () => {
      vi.spyOn(timetableRepository, 'findTimetablePeriodById').mockResolvedValue(null);

      await expect(
        timetableService.deleteTimetablePeriod(SCHOOL_ID, PERIOD_ID)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('replaceClassTimetable', () => {
    it('validates all referenced entities and replaces timetable atomically in transaction', async () => {
      vi.spyOn(timetableRepository, 'findClassInTenant').mockResolvedValue(mockClass);
      vi.spyOn(timetableRepository, 'findSubjectInTenant').mockResolvedValue({ id: SUBJECT_ID });
      vi.spyOn(timetableRepository, 'findTeacherInTenant').mockResolvedValue({ id: TEACHER_ID });

      vi.spyOn(timetableRepository, 'runTransaction').mockImplementation(async (cb) => {
        return cb({});
      });
      vi.spyOn(timetableRepository, 'replaceClassTimetable').mockResolvedValue([mockPeriod]);

      const payload = {
        schedule: {
          Monday: [
            {
              startTime: '09:00',
              endTime: '10:00',
              subjectId: SUBJECT_ID,
              teacherId: TEACHER_ID
            }
          ],
          Tuesday: []
        }
      };

      const result = await timetableService.replaceClassTimetable(SCHOOL_ID, CLASS_ID, payload, {
        name: 'Admin',
        role: 'ADMIN'
      });

      expect(result.classId).toBe(CLASS_ID);
      expect(result.schedule.Monday).toHaveLength(1);
      expect(auditRepository.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actionPerformed: 'REPLACE_CLASS_TIMETABLE'
        })
      );
    });

    it('aborts without transaction if any referenced subject is not in tenant', async () => {
      vi.spyOn(timetableRepository, 'findClassInTenant').mockResolvedValue(mockClass);
      vi.spyOn(timetableRepository, 'findSubjectInTenant').mockResolvedValue(null);
      const runTransactionSpy = vi.spyOn(timetableRepository, 'runTransaction');

      const payload = {
        schedule: {
          Monday: [
            {
              startTime: '09:00',
              endTime: '10:00',
              subjectId: 'invalid-subject-uuid'
            }
          ]
        }
      };

      await expect(
        timetableService.replaceClassTimetable(SCHOOL_ID, CLASS_ID, payload, { name: 'Admin' })
      ).rejects.toThrow(NotFoundError);

      expect(runTransactionSpy).not.toHaveBeenCalled();
    });
  });

  describe('getMySchedule', () => {
    it('returns subjectSchedule and classSchedule for authenticated teacher', async () => {
      const mockTeacherProfile = {
        id: TEACHER_ID,
        userId: USER_ID,
        name: 'Jane Doe',
        assignedClassId: CLASS_ID,
        status: 'Active',
        user: { isActive: true },
        assignedClass: { id: CLASS_ID, name: 'Grade 10 - A' }
      };

      vi.spyOn(timetableRepository, 'findStaffProfileByUserId').mockResolvedValue(mockTeacherProfile);
      vi.spyOn(timetableRepository, 'findTimetablePeriods').mockResolvedValue([mockPeriod]);

      const result = await timetableService.getMySchedule(SCHOOL_ID, {
        id: USER_ID,
        role: 'TEACHER'
      });

      expect(result.teacherId).toBe(TEACHER_ID);
      expect(result.isClassTeacher).toBe(true);
      expect(result.assignedClassName).toBe('Grade 10 - A');
      expect(result.subjectSchedule.Monday).toHaveLength(1);
      expect(result.classSchedule.Monday).toHaveLength(1);
    });

    it('throws ForbiddenError if staff profile is not found or inactive', async () => {
      vi.spyOn(timetableRepository, 'findStaffProfileByUserId').mockResolvedValue(null);

      await expect(
        timetableService.getMySchedule(SCHOOL_ID, { id: USER_ID, role: 'TEACHER' })
      ).rejects.toThrow(ForbiddenError);
    });
  });
});
