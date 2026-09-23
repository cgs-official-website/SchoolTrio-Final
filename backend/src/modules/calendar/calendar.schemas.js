import { z } from 'zod';
import { REGEX } from '../../config/constants.js';

/**
 * Validates ISO calendar date in YYYY-MM-DD format with real calendar validity check.
 * Rejects impossible dates (e.g. 2026-02-30, 2026-13-01, 2026-04-31).
 */
export const calendarDateSchema = z
  .string({ required_error: 'Date is required' })
  .trim()
  .regex(REGEX.DATE_ISO, 'Date must be in YYYY-MM-DD format')
  .refine(val => {
    const [year, month, day] = val.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  }, {
    message: 'Date must be a valid calendar date'
  });

export const ALLOWED_EVENT_TYPES = ['event', 'holiday', 'exam'];
export const ALLOWED_AUDIENCES = ['all', 'teachers', 'students', 'parents'];

export const listCalendarEventsQuerySchema = z.object({
  startDate: calendarDateSchema.optional(),
  endDate: calendarDateSchema.optional(),
  type: z.enum(['event', 'holiday', 'exam'], {
    errorMap: () => ({ message: "type must be 'event', 'holiday', or 'exam'" })
  }).optional(),
  audience: z.enum(['all', 'teachers', 'students', 'parents'], {
    errorMap: () => ({ message: "audience must be 'all', 'teachers', 'students', or 'parents'" })
  }).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200).optional(),
  page: z.coerce.number().int().min(1).default(1).optional()
}).refine(data => {
  if (data.startDate && data.endDate) {
    return data.startDate <= data.endDate;
  }
  return true;
}, {
  message: 'endDate must be greater than or equal to startDate',
  path: ['endDate']
});

/**
 * Schema for GET /api/v1/calendar/events
 */
export const listCalendarEventsSchema = {
  query: listCalendarEventsQuerySchema
};

export const calendarEventIdParamsSchema = z.object({
  id: z.string().uuid({ message: 'Event ID must be a valid UUID' })
});

/**
 * Schema for GET /api/v1/calendar/events/:id and DELETE /api/v1/calendar/events/:id
 */
export const calendarEventIdParamSchema = {
  params: calendarEventIdParamsSchema
};

export const createCalendarEventBodySchema = z.object({
  title: z
    .string({ required_error: 'Title is required' })
    .trim()
    .min(1, { message: 'Title is required and cannot be empty' })
    .max(200, { message: 'Title must not exceed 200 characters' }),
  date: calendarDateSchema,
  endDate: calendarDateSchema.optional().nullable(),
  type: z.enum(['event', 'holiday', 'exam'], {
    errorMap: () => ({ message: "type must be 'event', 'holiday', or 'exam'" })
  }),
  description: z
    .string()
    .trim()
    .max(5000, { message: 'Description must not exceed 5000 characters' })
    .optional()
    .nullable(),
  audience: z.enum(['all', 'teachers', 'students', 'parents'], {
    errorMap: () => ({ message: "audience must be 'all', 'teachers', 'students', or 'parents'" })
  }).default('all')
}).refine(data => {
  if (data.endDate) {
    return data.endDate >= data.date;
  }
  return true;
}, {
  message: 'endDate must be greater than or equal to date',
  path: ['endDate']
});

/**
 * Schema for POST /api/v1/calendar/events
 */
export const createCalendarEventSchema = {
  body: createCalendarEventBodySchema
};

export const updateCalendarEventBodySchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, { message: 'Title cannot be empty' })
    .max(200, { message: 'Title must not exceed 200 characters' })
    .optional(),
  date: calendarDateSchema.optional(),
  endDate: calendarDateSchema.optional().nullable(),
  type: z.enum(['event', 'holiday', 'exam'], {
    errorMap: () => ({ message: "type must be 'event', 'holiday', or 'exam'" })
  }).optional(),
  description: z
    .string()
    .trim()
    .max(5000, { message: 'Description must not exceed 5000 characters' })
    .optional()
    .nullable(),
  audience: z.enum(['all', 'teachers', 'students', 'parents'], {
    errorMap: () => ({ message: "audience must be 'all', 'teachers', 'students', or 'parents'" })
  }).optional()
}).refine(data => {
  if (data.date && data.endDate) {
    return data.endDate >= data.date;
  }
  return true;
}, {
  message: 'endDate must be greater than or equal to date',
  path: ['endDate']
});

/**
 * Schema for PATCH /api/v1/calendar/events/:id
 */
export const updateCalendarEventSchema = {
  params: calendarEventIdParamsSchema,
  body: updateCalendarEventBodySchema
};
