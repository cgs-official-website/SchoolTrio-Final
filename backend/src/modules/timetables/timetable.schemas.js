import { z } from 'zod';

const TIME_24HR_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Validates whether endTime is strictly after startTime.
 * @param {string} start - HH:mm
 * @param {string} end - HH:mm
 * @returns {boolean}
 */
export function isEndTimeAfterStartTime(start, end) {
  if (!start || !end) return true;
  return start.localeCompare(end) < 0;
}

export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const DAY_OF_WEEK_TO_NAME = Object.freeze({
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday'
});

export const NAME_TO_DAY_OF_WEEK = Object.freeze({
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6
});

/**
 * Normalizes day name or integer into integer 1-6.
 * @param {string|number} val
 * @returns {number|null}
 */
export function normalizeDayOfWeek(val) {
  if (typeof val === 'number' && Number.isInteger(val) && val >= 1 && val <= 6) {
    return val;
  }
  if (typeof val === 'string') {
    const parsed = parseInt(val, 10);
    if (!Number.isNaN(parsed) && parsed >= 1 && parsed <= 6) {
      return parsed;
    }
    const lower = val.trim().toLowerCase();
    if (NAME_TO_DAY_OF_WEEK[lower]) {
      return NAME_TO_DAY_OF_WEEK[lower];
    }
  }
  return null;
}

/**
 * Query schema for GET /api/v1/timetables
 */
export const listTimetablesSchema = z.object({
  query: z.object({
    classId: z.string().uuid({ message: 'classId must be a valid UUID' }).optional(),
    teacherId: z.string().uuid({ message: 'teacherId must be a valid UUID' }).optional(),
    subjectId: z.string().uuid({ message: 'subjectId must be a valid UUID' }).optional(),
    sectionId: z.string().uuid({ message: 'sectionId must be a valid UUID' }).optional(),
    dayOfWeek: z
      .preprocess((val) => (val !== undefined && val !== null ? normalizeDayOfWeek(val) : undefined), z.number().int().min(1).max(6))
      .optional()
  })
});

/**
 * Param schema for routes with :id
 */
export const timetableIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid({ message: 'Timetable Period ID must be a valid UUID' })
  })
});

/**
 * Param schema for routes with :classId
 */
export const classIdParamSchema = z.object({
  params: z.object({
    classId: z.string().uuid({ message: 'Class ID must be a valid UUID' })
  })
});

/**
 * Schema for creating a single TimetablePeriod
 * POST /api/v1/timetables
 */
export const createTimetablePeriodSchema = z.object({
  body: z
    .object({
      classId: z.string().uuid({ message: 'classId must be a valid UUID' }),
      sectionId: z.string().uuid({ message: 'sectionId must be a valid UUID' }).nullable().optional(),
      subjectId: z.string().uuid({ message: 'subjectId must be a valid UUID' }).nullable().optional(),
      teacherId: z.string().uuid({ message: 'teacherId must be a valid UUID' }).nullable().optional(),
      dayOfWeek: z
        .preprocess((val) => normalizeDayOfWeek(val), z.number().int().min(1, 'dayOfWeek must be between 1 and 6').max(6, 'dayOfWeek must be between 1 and 6')),
      periodNumber: z.coerce.number().int().min(1, 'periodNumber must be a positive integer').default(1),
      startTime: z.string().regex(TIME_24HR_REGEX, { message: 'startTime must be in 24-hour HH:mm format' }),
      endTime: z.string().regex(TIME_24HR_REGEX, { message: 'endTime must be in 24-hour HH:mm format' }),
      roomNumber: z.string().max(50, 'roomNumber cannot exceed 50 characters').trim().nullable().optional()
    })
    .refine((data) => isEndTimeAfterStartTime(data.startTime, data.endTime), {
      message: 'endTime must be later than startTime',
      path: ['endTime']
    })
});

/**
 * Schema for updating a single TimetablePeriod
 * PATCH /api/v1/timetables/:id
 */
export const updateTimetablePeriodSchema = z.object({
  params: z.object({
    id: z.string().uuid({ message: 'Timetable Period ID must be a valid UUID' })
  }),
  body: z
    .object({
      classId: z.string().uuid({ message: 'classId must be a valid UUID' }).optional(),
      sectionId: z.string().uuid({ message: 'sectionId must be a valid UUID' }).nullable().optional(),
      subjectId: z.string().uuid({ message: 'subjectId must be a valid UUID' }).nullable().optional(),
      teacherId: z.string().uuid({ message: 'teacherId must be a valid UUID' }).nullable().optional(),
      dayOfWeek: z
        .preprocess((val) => (val !== undefined && val !== null ? normalizeDayOfWeek(val) : undefined), z.number().int().min(1).max(6))
        .optional(),
      periodNumber: z.coerce.number().int().min(1, 'periodNumber must be a positive integer').optional(),
      startTime: z.string().regex(TIME_24HR_REGEX, { message: 'startTime must be in 24-hour HH:mm format' }).optional(),
      endTime: z.string().regex(TIME_24HR_REGEX, { message: 'endTime must be in 24-hour HH:mm format' }).optional(),
      roomNumber: z.string().max(50, 'roomNumber cannot exceed 50 characters').trim().nullable().optional()
    })
    .refine(
      (data) => {
        if (data.startTime && data.endTime) {
          return isEndTimeAfterStartTime(data.startTime, data.endTime);
        }
        return true;
      },
      {
        message: 'endTime must be later than startTime',
        path: ['endTime']
      }
    )
});

/**
 * Period slot inside weekly schedule payload
 */
const periodSlotSchema = z
  .object({
    id: z.string().optional(),
    periodNumber: z.coerce.number().int().min(1).optional(),
    dayOfWeek: z
      .preprocess((val) => (val !== undefined && val !== null ? normalizeDayOfWeek(val) : undefined), z.number().int().min(1).max(6))
      .optional(),
    day: z.string().optional(),
    startTime: z.string().regex(TIME_24HR_REGEX, { message: 'startTime must be in 24-hour HH:mm format' }),
    endTime: z.string().regex(TIME_24HR_REGEX, { message: 'endTime must be in 24-hour HH:mm format' }),
    subjectId: z.preprocess((val) => (val === '' ? null : val), z.string().uuid().nullable().optional()),
    teacherId: z.preprocess((val) => (val === '' ? null : val), z.string().uuid().nullable().optional()),
    sectionId: z.preprocess((val) => (val === '' ? null : val), z.string().uuid().nullable().optional()),
    roomNumber: z.preprocess((val) => (val === '' ? null : val), z.string().max(50).trim().nullable().optional())
  })
  .refine((data) => isEndTimeAfterStartTime(data.startTime, data.endTime), {
    message: 'endTime must be later than startTime',
    path: ['endTime']
  });

/**
 * Schema for atomic weekly timetable replacement
 * PUT /api/v1/timetables/classes/:classId
 */
export const putClassTimetableSchema = z.object({
  params: z.object({
    classId: z.string().uuid({ message: 'Class ID must be a valid UUID' })
  }),
  body: z
    .object({
      schedule: z
        .record(
          z.string(),
          z.array(periodSlotSchema)
        )
        .optional(),
      periods: z.array(periodSlotSchema).optional(),
      customData: z.record(z.unknown()).optional()
    })
    .refine((data) => data.schedule !== undefined || data.periods !== undefined, {
      message: 'Either schedule or periods array must be provided',
      path: ['schedule']
    })
});
