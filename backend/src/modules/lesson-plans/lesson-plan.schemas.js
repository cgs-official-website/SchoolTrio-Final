import { z } from 'zod';
import { REGEX } from '../../config/constants.js';

/**
 * Validates ISO calendar date in YYYY-MM-DD format with real calendar validity check.
 * Strictly rejects impossible dates (e.g. 2026-02-30, 2026-13-01, 2026-04-31, 2026-02-29 on non-leap years).
 *
 * @param {string} dateStr
 * @returns {boolean}
 */
export function isValidDateString(dateStr) {
  if (typeof dateStr !== 'string' || !REGEX.DATE_ISO.test(dateStr)) {
    return false;
  }
  const [year, month, day] = dateStr.split('-').map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const dateObj = new Date(Date.UTC(year, month - 1, day));
  return (
    dateObj.getUTCFullYear() === year &&
    dateObj.getUTCMonth() === month - 1 &&
    dateObj.getUTCDate() === day
  );
}

/**
 * Calculates the ISO-8601 week number (1..53) deterministically from a YYYY-MM-DD date.
 *
 * @param {string} dateStr - Date in YYYY-MM-DD format
 * @returns {number} ISO week number
 */
export function calculateWeekNumber(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const target = new Date(Date.UTC(year, month - 1, day));
  // Nearest Thursday: current date + 4 - current day number (Monday is 1, Sunday is 7)
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  // First week of the year contains Jan 4th
  const firstThursday = target.getUTCFullYear();
  const jan4 = new Date(Date.UTC(firstThursday, 0, 4));
  const jan4DayNr = (jan4.getUTCDay() + 6) % 7;
  jan4.setUTCDate(jan4.getUTCDate() - jan4DayNr + 3);
  // Calculate difference in weeks
  const weekDiff = Math.round((target.getTime() - jan4.getTime()) / (7 * 24 * 60 * 60 * 1000));
  return 1 + weekDiff;
}

export const ALLOWED_STATUSES = ['draft', 'ready', 'completed'];

export const lessonPlanDateSchema = z
  .string({ required_error: 'Date is required' })
  .trim()
  .regex(REGEX.DATE_ISO, 'Date must be in YYYY-MM-DD format')
  .refine(isValidDateString, {
    message: 'Date must be a valid calendar date'
  });

export const statusEnumSchema = z
  .enum(['draft', 'ready', 'completed', 'Draft', 'Ready', 'Completed'], {
    errorMap: () => ({ message: "Status must be 'draft', 'ready', or 'completed'" })
  })
  .transform(s => (s ? s.toLowerCase() : 'draft'));

export const listLessonPlansQuerySchema = z
  .object({
    classId: z.string().uuid({ message: 'classId must be a valid UUID' }).optional(),
    subjectId: z.string().uuid({ message: 'subjectId must be a valid UUID' }).optional(),
    teacherId: z.string().uuid({ message: 'teacherId must be a valid UUID' }).optional(),
    status: statusEnumSchema.optional(),
    startDate: lessonPlanDateSchema.optional(),
    endDate: lessonPlanDateSchema.optional(),
    search: z.string().trim().max(100).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    page: z.coerce.number().int().min(1).default(1)
  })
  .refine(
    data => {
      if (data.startDate && data.endDate) {
        return data.startDate <= data.endDate;
      }
      return true;
    },
    {
      message: 'startDate cannot be after endDate',
      path: ['startDate']
    }
  );

export const listLessonPlansSchema = {
  query: listLessonPlansQuerySchema
};

export const lessonPlanIdParamsSchema = z.object({
  id: z.string().uuid({ message: 'Lesson plan ID must be a valid UUID' })
});

export const lessonPlanIdParamSchema = {
  params: lessonPlanIdParamsSchema
};

export const createLessonPlanBodySchema = z.object({
  classId: z.string({ required_error: 'classId is required' }).uuid({ message: 'classId must be a valid UUID' }),
  subjectId: z.string({ required_error: 'subjectId is required' }).uuid({ message: 'subjectId must be a valid UUID' }),
  topic: z
    .string({ required_error: 'topic is required' })
    .trim()
    .min(1, { message: 'topic cannot be empty' })
    .max(500, { message: 'topic must not exceed 500 characters' }),
  date: lessonPlanDateSchema,
  objectives: z.string().trim().max(5000, { message: 'objectives must not exceed 5000 characters' }).optional().nullable(),
  status: statusEnumSchema.default('draft'),
  teacherId: z.string().uuid({ message: 'teacherId must be a valid UUID' }).optional()
});

export const createLessonPlanSchema = {
  body: createLessonPlanBodySchema
};

export const updateLessonPlanBodySchema = z.object({
  classId: z.string().uuid({ message: 'classId must be a valid UUID' }).optional(),
  subjectId: z.string().uuid({ message: 'subjectId must be a valid UUID' }).optional(),
  topic: z
    .string()
    .trim()
    .min(1, { message: 'topic cannot be empty' })
    .max(500, { message: 'topic must not exceed 500 characters' })
    .optional(),
  date: lessonPlanDateSchema.optional(),
  objectives: z.string().trim().max(5000, { message: 'objectives must not exceed 5000 characters' }).optional().nullable(),
  status: statusEnumSchema.optional(),
  teacherId: z.string().uuid({ message: 'teacherId must be a valid UUID' }).optional()
});

export const updateLessonPlanSchema = {
  params: lessonPlanIdParamsSchema,
  body: updateLessonPlanBodySchema
};
