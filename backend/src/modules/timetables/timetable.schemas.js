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

/**
 * Converts HH:mm time string to total minutes from midnight (0-1439).
 * Returns null if invalid.
 * @param {string} timeStr - HH:mm
 * @returns {number|null}
 */
export function timeToMinutes(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const parts = timeStr.trim().split(':');
  if (parts.length < 2) return null;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

/**
 * Checks whether two time intervals [startA, endA] and [startB, endB] overlap.
 * Back-to-back intervals (e.g. 09:00-10:00 and 10:00-11:00) do NOT overlap.
 * @param {string} startA
 * @param {string} endA
 * @param {string} startB
 * @param {string} endB
 * @returns {boolean}
 */
export function areTimeIntervalsOverlapping(startA, endA, startB, endB) {
  const sA = timeToMinutes(startA);
  const eA = timeToMinutes(endA);
  const sB = timeToMinutes(startB);
  const eB = timeToMinutes(endB);
  if (sA === null || eA === null || sB === null || eB === null) return false;
  return sA < eB && eA > sB;
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
  }),
  // Optional: return the timetable of ONE section of the class (e.g. V-A vs V-B)
  query: z
    .object({
      sectionId: z.string().uuid({ message: 'sectionId must be a valid UUID' }).optional()
    })
    .passthrough()
    .optional()
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
        .preprocess((val) => normalizeDayOfWeek(val), z.number({ required_error: 'dayOfWeek (1-6 or valid day name) is required' }).int().min(1, 'dayOfWeek must be between 1 and 6').max(6, 'dayOfWeek must be between 1 and 6'))
        .optional(),
      day: z.string().optional(),
      periodNumber: z.coerce.number().int().min(1, 'periodNumber must be a positive integer').default(1),
      startTime: z.string().regex(TIME_24HR_REGEX, { message: 'startTime must be in 24-hour HH:mm format' }),
      endTime: z.string().regex(TIME_24HR_REGEX, { message: 'endTime must be in 24-hour HH:mm format' }),
      roomNumber: z.string().max(50, 'roomNumber cannot exceed 50 characters').trim().nullable().optional()
    })
    .refine((data) => normalizeDayOfWeek(data.dayOfWeek ?? data.day) !== null, {
      message: 'dayOfWeek (integer 1-6 or valid day name like Monday) is required',
      path: ['dayOfWeek']
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
    // Times are optional when the period is linked to a template slot (server derives them)
    startTime: z.string().regex(TIME_24HR_REGEX, { message: 'startTime must be in 24-hour HH:mm format' }).optional(),
    endTime: z.string().regex(TIME_24HR_REGEX, { message: 'endTime must be in 24-hour HH:mm format' }).optional(),
    templateSlotId: z.preprocess((val) => (val === '' ? null : val), z.string().uuid().nullable().optional()),
    subjectId: z.preprocess((val) => (val === '' ? null : val), z.string().uuid().nullable().optional()),
    teacherId: z.preprocess((val) => (val === '' ? null : val), z.string().uuid().nullable().optional()),
    sectionId: z.preprocess((val) => (val === '' ? null : val), z.string().uuid().nullable().optional()),
    roomNumber: z.preprocess((val) => (val === '' ? null : val), z.string().max(50).trim().nullable().optional())
  })
  .refine((data) => data.templateSlotId || (data.startTime && data.endTime), {
    message: 'startTime and endTime are required unless templateSlotId is provided',
    path: ['startTime']
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
      // When provided, ONLY this section's timetable is replaced (other sections are untouched)
      sectionId: z.preprocess((val) => (val === '' ? null : val), z.string().uuid().nullable().optional()),
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

const templateSlotSchema = z
  .object({
    id: z.string().uuid().optional(),
    slotType: z.enum(['PERIOD', 'BREAK', 'LUNCH']),
    label: z.string().trim().min(1, 'label is required').max(100),
    startTime: z.string().regex(TIME_24HR_REGEX, { message: 'startTime must be in 24-hour HH:mm format' }),
    endTime: z.string().regex(TIME_24HR_REGEX, { message: 'endTime must be in 24-hour HH:mm format' })
  })
  .refine((data) => isEndTimeAfterStartTime(data.startTime, data.endTime), {
    message: 'endTime must be later than startTime',
    path: ['endTime']
  });

/**
 * PUT /api/v1/timetables/template
 */
export const putTemplateSchema = z.object({
  body: z.object({
    name: z.string().trim().min(1).max(100).optional(),
    slots: z.array(templateSlotSchema).min(1, 'At least one slot is required').max(30)
  })
});