import { describe, it, expect } from 'vitest';
import {
  listTimetablesSchema,
  createTimetablePeriodSchema,
  updateTimetablePeriodSchema,
  putClassTimetableSchema,
  timetableIdParamSchema,
  classIdParamSchema,
  normalizeDayOfWeek,
  isEndTimeAfterStartTime
} from '../../../src/modules/timetables/timetable.schemas.js';

const VALID_UUID_1 = '11111111-1111-4111-8111-111111111111';
const VALID_UUID_2 = '22222222-2222-4222-8222-222222222222';
const VALID_UUID_3 = '33333333-3333-4333-8333-333333333333';
const VALID_UUID_4 = '44444444-4444-4444-8444-444444444444';

describe('Timetable Schemas Unit Tests', () => {
  describe('Helper Functions', () => {
    it('normalizes day of week numbers and string names correctly', () => {
      expect(normalizeDayOfWeek(1)).toBe(1);
      expect(normalizeDayOfWeek(6)).toBe(6);
      expect(normalizeDayOfWeek(0)).toBeNull();
      expect(normalizeDayOfWeek(7)).toBeNull();

      expect(normalizeDayOfWeek('Monday')).toBe(1);
      expect(normalizeDayOfWeek('tuesday')).toBe(2);
      expect(normalizeDayOfWeek('WEDNESDAY')).toBe(3);
      expect(normalizeDayOfWeek('Thursday')).toBe(4);
      expect(normalizeDayOfWeek('Friday')).toBe(5);
      expect(normalizeDayOfWeek('saturday')).toBe(6);
      expect(normalizeDayOfWeek('Sunday')).toBeNull();
      expect(normalizeDayOfWeek('invalid-day')).toBeNull();
    });

    it('correctly compares start and end times', () => {
      expect(isEndTimeAfterStartTime('09:00', '10:00')).toBe(true);
      expect(isEndTimeAfterStartTime('09:30', '10:15')).toBe(true);
      expect(isEndTimeAfterStartTime('10:00', '10:00')).toBe(false);
      expect(isEndTimeAfterStartTime('11:00', '10:00')).toBe(false);
      expect(isEndTimeAfterStartTime('', '10:00')).toBe(true);
    });
  });

  describe('listTimetablesSchema', () => {
    it('accepts valid query filters', () => {
      const res = listTimetablesSchema.safeParse({
        query: {
          classId: VALID_UUID_1,
          teacherId: VALID_UUID_2,
          dayOfWeek: 'Monday'
        }
      });
      expect(res.success).toBe(true);
      expect(res.data.query.dayOfWeek).toBe(1);
    });

    it('accepts empty query filters', () => {
      const res = listTimetablesSchema.safeParse({
        query: {}
      });
      expect(res.success).toBe(true);
    });

    it('rejects invalid UUIDs in query', () => {
      const res = listTimetablesSchema.safeParse({
        query: {
          classId: 'not-a-uuid'
        }
      });
      expect(res.success).toBe(false);
    });
  });

  describe('createTimetablePeriodSchema', () => {
    it('accepts a fully valid period payload', () => {
      const res = createTimetablePeriodSchema.safeParse({
        body: {
          classId: VALID_UUID_1,
          sectionId: VALID_UUID_2,
          subjectId: VALID_UUID_3,
          teacherId: VALID_UUID_4,
          dayOfWeek: 1,
          periodNumber: 2,
          startTime: '09:00',
          endTime: '10:00',
          roomNumber: 'Room 101'
        }
      });
      expect(res.success).toBe(true);
      expect(res.data.body.periodNumber).toBe(2);
      expect(res.data.body.roomNumber).toBe('Room 101');
    });

    it('accepts period with day name and nullable relations', () => {
      const res = createTimetablePeriodSchema.safeParse({
        body: {
          classId: VALID_UUID_1,
          sectionId: null,
          subjectId: null,
          teacherId: null,
          dayOfWeek: 'Tuesday',
          startTime: '10:00',
          endTime: '11:00'
        }
      });
      expect(res.success).toBe(true);
      expect(res.data.body.dayOfWeek).toBe(2);
      expect(res.data.body.periodNumber).toBe(1);
    });

    it('rejects when endTime is earlier than or equal to startTime', () => {
      const resEqual = createTimetablePeriodSchema.safeParse({
        body: {
          classId: VALID_UUID_1,
          dayOfWeek: 1,
          startTime: '10:00',
          endTime: '10:00'
        }
      });
      expect(resEqual.success).toBe(false);

      const resEarlier = createTimetablePeriodSchema.safeParse({
        body: {
          classId: VALID_UUID_1,
          dayOfWeek: 1,
          startTime: '11:00',
          endTime: '10:00'
        }
      });
      expect(resEarlier.success).toBe(false);
    });

    it('rejects invalid dayOfWeek', () => {
      const res = createTimetablePeriodSchema.safeParse({
        body: {
          classId: VALID_UUID_1,
          dayOfWeek: 7, // Sunday not supported in 6-day cycle
          startTime: '09:00',
          endTime: '10:00'
        }
      });
      expect(res.success).toBe(false);
    });

    it('rejects invalid time formats', () => {
      const res = createTimetablePeriodSchema.safeParse({
        body: {
          classId: VALID_UUID_1,
          dayOfWeek: 1,
          startTime: '9:00 AM',
          endTime: '10:00 AM'
        }
      });
      expect(res.success).toBe(false);
    });
  });

  describe('updateTimetablePeriodSchema', () => {
    it('accepts partial update payload', () => {
      const res = updateTimetablePeriodSchema.safeParse({
        params: { id: VALID_UUID_1 },
        body: {
          startTime: '09:15',
          endTime: '10:15'
        }
      });
      expect(res.success).toBe(true);
    });

    it('rejects invalid time ordering when both times are provided', () => {
      const res = updateTimetablePeriodSchema.safeParse({
        params: { id: VALID_UUID_1 },
        body: {
          startTime: '11:00',
          endTime: '10:00'
        }
      });
      expect(res.success).toBe(false);
    });
  });

  describe('putClassTimetableSchema', () => {
    it('accepts weekly schedule map payload', () => {
      const res = putClassTimetableSchema.safeParse({
        params: { classId: VALID_UUID_1 },
        body: {
          schedule: {
            Monday: [
              {
                startTime: '09:00',
                endTime: '10:00',
                subjectId: VALID_UUID_2,
                teacherId: VALID_UUID_3
              }
            ],
            Tuesday: []
          }
        }
      });
      expect(res.success).toBe(true);
    });

    it('accepts flat periods array payload', () => {
      const res = putClassTimetableSchema.safeParse({
        params: { classId: VALID_UUID_1 },
        body: {
          periods: [
            {
              dayOfWeek: 1,
              startTime: '09:00',
              endTime: '10:00',
              subjectId: VALID_UUID_2
            }
          ]
        }
      });
      expect(res.success).toBe(true);
    });

    it('rejects payload missing both schedule and periods', () => {
      const res = putClassTimetableSchema.safeParse({
        params: { classId: VALID_UUID_1 },
        body: {
          customData: { note: 'test' }
        }
      });
      expect(res.success).toBe(false);
    });

    it('rejects invalid slot times in weekly schedule', () => {
      const res = putClassTimetableSchema.safeParse({
        params: { classId: VALID_UUID_1 },
        body: {
          schedule: {
            Monday: [
              {
                startTime: '10:00',
                endTime: '09:00'
              }
            ]
          }
        }
      });
      expect(res.success).toBe(false);
    });
  });

  describe('Param Schemas', () => {
    it('validates id and classId params', () => {
      expect(timetableIdParamSchema.safeParse({ params: { id: VALID_UUID_1 } }).success).toBe(true);
      expect(timetableIdParamSchema.safeParse({ params: { id: 'invalid' } }).success).toBe(false);

      expect(classIdParamSchema.safeParse({ params: { classId: VALID_UUID_1 } }).success).toBe(true);
      expect(classIdParamSchema.safeParse({ params: { classId: 'invalid' } }).success).toBe(false);
    });
  });
});
