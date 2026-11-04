import { describe, it, expect } from 'vitest';
import {
  timeToMinutes,
  isEndTimeAfterStartTime,
  areTimeIntervalsOverlapping
} from './TimetableManagement.jsx';

describe('Timetable Conflict Detection Frontend Suite', () => {
  describe('Time Math Helpers', () => {
    it('converts HH:mm to minutes', () => {
      expect(timeToMinutes('08:30')).toBe(510);
      expect(timeToMinutes('09:00')).toBe(540);
      expect(timeToMinutes('10:00')).toBe(600);
      expect(timeToMinutes('13:45')).toBe(825);
      expect(timeToMinutes('')).toBeNull();
      expect(timeToMinutes(null)).toBeNull();
    });

    it('validates endTime is after startTime', () => {
      expect(isEndTimeAfterStartTime('09:00', '10:00')).toBe(true);
      expect(isEndTimeAfterStartTime('10:00', '10:00')).toBe(false);
      expect(isEndTimeAfterStartTime('11:00', '10:00')).toBe(false);
    });

    it('detects overlapping intervals correctly', () => {
      // Partial overlap: 09:00-10:00 and 09:30-10:30
      expect(areTimeIntervalsOverlapping('09:00', '10:00', '09:30', '10:30')).toBe(true);

      // Enclosure: 09:00-11:00 and 09:30-10:30
      expect(areTimeIntervalsOverlapping('09:00', '11:00', '09:30', '10:30')).toBe(true);

      // Exact overlap: 09:00-10:00 and 09:00-10:00
      expect(areTimeIntervalsOverlapping('09:00', '10:00', '09:00', '10:00')).toBe(true);
    });

    it('allows back-to-back periods without conflict', () => {
      // Period 1 ends at 10:00, Period 2 starts at 10:00
      expect(areTimeIntervalsOverlapping('09:00', '10:00', '10:00', '11:00')).toBe(false);
      expect(areTimeIntervalsOverlapping('10:00', '11:00', '09:00', '10:00')).toBe(false);

      // Completely separate times
      expect(areTimeIntervalsOverlapping('09:00', '10:00', '11:00', '12:00')).toBe(false);
    });
  });

  describe('Conflict Detection Scenarios', () => {
    it('detects period overlap within the same class schedule', () => {
      const daySlots = [
        { id: '1', startTime: '09:00', endTime: '10:00', subject: 'Math', teacherId: 't1' }
      ];

      const newSlot = { startTime: '09:30', endTime: '10:30', subject: 'English', teacherId: 't2' };

      const conflict = daySlots.some(s =>
        areTimeIntervalsOverlapping(newSlot.startTime, newSlot.endTime, s.startTime, s.endTime)
      );
      expect(conflict).toBe(true);
    });

    it('detects teacher assigned to two different classes in overlapping slot', () => {
      const allTimetables = {
        'class-b': {
          Monday: [
            { id: 'b1', startTime: '09:00', endTime: '10:00', teacherId: 'teacher-smith', subject: 'Science' }
          ]
        }
      };

      const selectedClassId = 'class-a';
      const activeDay = 'Monday';
      const newSlot = {
        startTime: '09:30',
        endTime: '10:30',
        teacherId: 'teacher-smith',
        subject: 'Physics'
      };

      let teacherConflictFound = false;
      for (const [otherClassId, classGrid] of Object.entries(allTimetables)) {
        if (otherClassId === selectedClassId) continue;
        const otherSlots = classGrid?.[activeDay] || [];
        const hasConflict = otherSlots.some(s =>
          s.teacherId === newSlot.teacherId &&
          areTimeIntervalsOverlapping(newSlot.startTime, newSlot.endTime, s.startTime, s.endTime)
        );
        if (hasConflict) {
          teacherConflictFound = true;
          break;
        }
      }

      expect(teacherConflictFound).toBe(true);
    });

    it('allows teacher to teach in another class if time slots are back-to-back', () => {
      const allTimetables = {
        'class-b': {
          Monday: [
            { id: 'b1', startTime: '09:00', endTime: '10:00', teacherId: 'teacher-smith', subject: 'Science' }
          ]
        }
      };

      const selectedClassId = 'class-a';
      const activeDay = 'Monday';
      const newSlot = {
        startTime: '10:00',
        endTime: '11:00',
        teacherId: 'teacher-smith',
        subject: 'Physics'
      };

      let teacherConflictFound = false;
      for (const [otherClassId, classGrid] of Object.entries(allTimetables)) {
        if (otherClassId === selectedClassId) continue;
        const otherSlots = classGrid?.[activeDay] || [];
        const hasConflict = otherSlots.some(s =>
          s.teacherId === newSlot.teacherId &&
          areTimeIntervalsOverlapping(newSlot.startTime, newSlot.endTime, s.startTime, s.endTime)
        );
        if (hasConflict) {
          teacherConflictFound = true;
          break;
        }
      }

      expect(teacherConflictFound).toBe(false);
    });
  });
});

