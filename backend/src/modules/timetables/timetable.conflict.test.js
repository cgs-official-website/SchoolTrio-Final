import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as timetableService from './timetable.service.js';
import * as timetableRepository from './timetable.repository.js';
import { areTimeIntervalsOverlapping, timeToMinutes } from './timetable.schemas.js';
import { ConflictError } from '../../utils/app-error.js';

vi.mock('./timetable.repository.js');
vi.mock('../audit/audit.repository.js', () => ({
  createAuditLog: vi.fn().mockResolvedValue({})
}));

describe('Timetable Conflict Detection Suite', () => {
  const schoolId = '11111111-1111-4111-8111-111111111111';
  const classA = '22222222-2222-4222-8222-222222222222';
  const classB = '33333333-3333-4333-8333-333333333333';
  const teacher1 = '44444444-4444-4444-8444-444444444444';
  const teacher2 = '55555555-5555-4555-8555-555555555555';
  const subject1 = '66666666-6666-4666-8666-666666666666';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Time Interval Overlap Math', () => {
    it('converts HH:mm to minutes correctly', () => {
      expect(timeToMinutes('00:00')).toBe(0);
      expect(timeToMinutes('09:00')).toBe(540);
      expect(timeToMinutes('10:30')).toBe(630);
      expect(timeToMinutes('23:59')).toBe(1439);
      expect(timeToMinutes('invalid')).toBeNull();
    });

    it('identifies overlapping intervals', () => {
      // Partial overlap
      expect(areTimeIntervalsOverlapping('09:00', '10:00', '09:30', '10:30')).toBe(true);
      // Enclosure
      expect(areTimeIntervalsOverlapping('09:00', '11:00', '09:30', '10:30')).toBe(true);
      // Exact match
      expect(areTimeIntervalsOverlapping('09:00', '10:00', '09:00', '10:00')).toBe(true);
    });

    it('identifies non-overlapping and back-to-back intervals', () => {
      // Back-to-back: period 1 ends at 10:00, period 2 starts at 10:00
      expect(areTimeIntervalsOverlapping('09:00', '10:00', '10:00', '11:00')).toBe(false);
      expect(areTimeIntervalsOverlapping('10:00', '11:00', '09:00', '10:00')).toBe(false);
      // Completely separate
      expect(areTimeIntervalsOverlapping('09:00', '10:00', '11:00', '12:00')).toBe(false);
    });
  });

  describe('Class Schedule Overlap Detection', () => {
    it('rejects createTimetablePeriod if class already has an overlapping period on the same day', async () => {
      timetableRepository.findClassInTenant.mockResolvedValue({ id: classA, name: 'Grade 5-A' });
      timetableRepository.findSubjectInTenant.mockResolvedValue({ id: subject1, name: 'Math' });
      timetableRepository.findTeacherInTenant.mockResolvedValue({ id: teacher1, name: 'John Doe' });

      // Existing period in class A on Monday 09:00 - 10:00
      timetableRepository.findTimetablePeriods.mockResolvedValueOnce([
        {
          id: 'period-1',
          classId: classA,
          dayOfWeek: 1,
          startTime: '09:00',
          endTime: '10:00'
        }
      ]);

      // Attempting to add 09:30 - 10:30 to class A on Monday
      await expect(
        timetableService.createTimetablePeriod(schoolId, {
          classId: classA,
          subjectId: subject1,
          teacherId: teacher1,
          dayOfWeek: 1,
          startTime: '09:30',
          endTime: '10:30'
        })
      ).rejects.toThrow(ConflictError);
    });

    it('rejects replaceClassTimetable if payload contains overlapping periods for the class', async () => {
      timetableRepository.findClassInTenant.mockResolvedValue({ id: classA, name: 'Grade 5-A' });

      const payload = {
        schedule: {
          Monday: [
            { startTime: '09:00', endTime: '10:00', subjectId: subject1, teacherId: teacher1 },
            { startTime: '09:30', endTime: '10:30', subjectId: subject1, teacherId: teacher2 }
          ]
        }
      };

      await expect(
        timetableService.replaceClassTimetable(schoolId, classA, payload)
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('Teacher Conflict Detection', () => {
    it('rejects createTimetablePeriod if teacher is already assigned to another class in overlapping time slot', async () => {
      timetableRepository.findClassInTenant.mockResolvedValue({ id: classA, name: 'Grade 5-A' });
      timetableRepository.findSubjectInTenant.mockResolvedValue({ id: subject1, name: 'Math' });
      timetableRepository.findTeacherInTenant.mockResolvedValue({ id: teacher1, name: 'John Doe' });

      // Class A has no periods
      timetableRepository.findTimetablePeriods.mockResolvedValueOnce([]);

      // But teacher1 is already in Class B on Monday from 09:00 to 10:00
      timetableRepository.findTimetablePeriods.mockResolvedValueOnce([
        {
          id: 'period-other',
          classId: classB,
          teacherId: teacher1,
          dayOfWeek: 1,
          startTime: '09:00',
          endTime: '10:00',
          teacher: { name: 'John Doe' },
          class: { name: 'Grade 6-B' }
        }
      ]);

      // Attempting to assign teacher1 to Class A on Monday 09:30 - 10:30
      await expect(
        timetableService.createTimetablePeriod(schoolId, {
          classId: classA,
          subjectId: subject1,
          teacherId: teacher1,
          dayOfWeek: 1,
          startTime: '09:30',
          endTime: '10:30'
        })
      ).rejects.toThrow(ConflictError);
    });

    it('rejects replaceClassTimetable if teacher is already assigned to another class in overlapping time slot', async () => {
      timetableRepository.findClassInTenant.mockResolvedValue({ id: classA, name: 'Grade 5-A' });

      // Teacher1 is in Class B on Monday 09:00 - 10:00
      timetableRepository.findTimetablePeriods.mockResolvedValueOnce([
        {
          id: 'period-in-class-b',
          classId: classB,
          teacherId: teacher1,
          dayOfWeek: 1,
          startTime: '09:00',
          endTime: '10:00',
          teacher: { name: 'John Doe' },
          class: { name: 'Grade 6-B' }
        }
      ]);

      const payload = {
        schedule: {
          Monday: [
            { startTime: '09:00', endTime: '10:00', subjectId: subject1, teacherId: teacher1 }
          ]
        }
      };

      await expect(
        timetableService.replaceClassTimetable(schoolId, classA, payload)
      ).rejects.toThrow(ConflictError);
    });

    it('rejects replaceClassTimetable if teacher has overlapping periods within the same class timetable', async () => {
      timetableRepository.findClassInTenant.mockResolvedValue({ id: classA, name: 'Grade 5-A' });

      const payload = {
        schedule: {
          Monday: [
            { startTime: '09:00', endTime: '10:00', subjectId: subject1, teacherId: teacher1 },
            { startTime: '09:30', endTime: '10:30', subjectId: subject1, teacherId: teacher1 }
          ]
        }
      };

      await expect(
        timetableService.replaceClassTimetable(schoolId, classA, payload)
      ).rejects.toThrow(ConflictError);
    });

    it('allows back-to-back periods for the same teacher without conflict', async () => {
      timetableRepository.findClassInTenant.mockResolvedValue({ id: classA, name: 'Grade 5-A' });
      timetableRepository.findTimetablePeriods.mockResolvedValueOnce([]); // No conflict in other classes
      timetableRepository.runTransaction.mockImplementation(async (cb) => {
        return cb({});
      });
      timetableRepository.replaceClassTimetable.mockResolvedValueOnce([
        {
          id: 'p1',
          classId: classA,
          dayOfWeek: 1,
          startTime: '09:00',
          endTime: '10:00',
          teacherId: teacher1
        },
        {
          id: 'p2',
          classId: classA,
          dayOfWeek: 1,
          startTime: '10:00',
          endTime: '11:00',
          teacherId: teacher1
        }
      ]);

      const payload = {
        schedule: {
          Monday: [
            { startTime: '09:00', endTime: '10:00', subjectId: subject1, teacherId: teacher1 },
            { startTime: '10:00', endTime: '11:00', subjectId: subject1, teacherId: teacher1 }
          ]
        }
      };

      const result = await timetableService.replaceClassTimetable(schoolId, classA, payload);
      expect(result).toBeDefined();
      expect(result.classId).toBe(classA);
    });
  });
});

