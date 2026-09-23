import { z } from 'zod';
import { REGEX } from '../../config/constants.js';

/**
 * Normalized PTM Appointment Statuses
 */
export const PTM_STATUS = Object.freeze({
  SCHEDULED: 'Scheduled',
  CONFIRMED: 'Confirmed',
  PENDING: 'Pending',
  CANCELLED: 'Cancelled',
  COMPLETED: 'Completed'
});

export const PTM_TYPES = Object.freeze({
  IN_PERSON: 'In-person',
  ONLINE: 'Online'
});

/**
 * Calendar Date (YYYY-MM-DD) Validation Schema
 */
const dateStringSchema = z
  .string({ required_error: 'Date is required' })
  .regex(REGEX.DATE_ISO, 'Date must be formatted as YYYY-MM-DD')
  .refine(
    (val) => {
      const [year, month, day] = val.split('-').map(Number);
      const date = new Date(Date.UTC(year, month - 1, day));
      return (
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day
      );
    },
    { message: 'Date must be a valid calendar date' }
  );

/**
 * Normalizer for meeting type
 */
const meetingTypeSchema = z
  .string()
  .trim()
  .transform((val) => {
    const lower = val.toLowerCase();
    if (lower === 'online') return PTM_TYPES.ONLINE;
    return PTM_TYPES.IN_PERSON;
  })
  .default(PTM_TYPES.IN_PERSON);

/**
 * Normalizer for status
 */
const statusNormalizer = (val) => {
  if (!val) return PTM_STATUS.CONFIRMED;
  const lower = val.toLowerCase();
  if (lower === 'confirmed') return PTM_STATUS.CONFIRMED;
  if (lower === 'scheduled') return PTM_STATUS.SCHEDULED;
  if (lower === 'pending') return PTM_STATUS.PENDING;
  if (lower === 'cancelled') return PTM_STATUS.CANCELLED;
  if (lower === 'completed') return PTM_STATUS.COMPLETED;
  return val;
};

// ============================================================
// REQUEST SCHEMAS
// ============================================================

export const createPtmSchema = {
  body: z
    .object({
      studentId: z
        .string({ required_error: 'Student ID is required' })
        .regex(REGEX.UUID, 'Invalid student ID format'),
      teacherId: z
        .string()
        .regex(REGEX.UUID, 'Invalid teacher ID format')
        .optional(),
      classId: z
        .string()
        .regex(REGEX.UUID, 'Invalid class ID format')
        .optional(),
      date: dateStringSchema,
      timeSlot: z.string().trim().min(1, 'Time slot cannot be empty').max(50, 'Time slot too long').optional(),
      time: z.string().trim().min(1, 'Time cannot be empty').max(50, 'Time too long').optional(),
      type: meetingTypeSchema.optional(),
      status: z
        .string()
        .trim()
        .transform(statusNormalizer)
        .pipe(z.enum([PTM_STATUS.SCHEDULED, PTM_STATUS.CONFIRMED, PTM_STATUS.PENDING]))
        .default(PTM_STATUS.CONFIRMED),
      notes: z.string().trim().max(5000, 'Notes cannot exceed 5000 characters').nullable().optional()
    })
    .refine((data) => data.timeSlot || data.time, {
      message: 'Either timeSlot or time must be provided',
      path: ['timeSlot']
    })
};

export const updatePtmStatusSchema = {
  params: z.object({
    id: z.string({ required_error: 'Appointment ID is required' }).regex(REGEX.UUID, 'Invalid appointment ID format')
  }),
  body: z.object({
    status: z
      .string({ required_error: 'Status is required' })
      .trim()
      .transform(statusNormalizer)
      .pipe(
        z.enum([
          PTM_STATUS.SCHEDULED,
          PTM_STATUS.CONFIRMED,
          PTM_STATUS.PENDING,
          PTM_STATUS.CANCELLED,
          PTM_STATUS.COMPLETED
        ])
      ),
    notes: z.string().trim().max(5000, 'Notes cannot exceed 5000 characters').nullable().optional()
  })
};

export const getPtmByIdSchema = {
  params: z.object({
    id: z.string({ required_error: 'Appointment ID is required' }).regex(REGEX.UUID, 'Invalid appointment ID format')
  })
};

export const listTeacherPtmsSchema = {
  query: z.object({
    classId: z.string().regex(REGEX.UUID, 'Invalid class ID format').optional(),
    tab: z.enum(['upcoming', 'past']).optional(),
    date: z.string().regex(REGEX.DATE_ISO, 'Invalid date format').optional(),
    status: z.string().trim().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    sort: z.enum(['date', 'createdAt', 'timeSlot']).default('date'),
    order: z.enum(['asc', 'desc']).default('asc')
  })
};

export const listStudentPtmsSchema = {
  params: z.object({
    studentId: z.string({ required_error: 'Student ID is required' }).regex(REGEX.UUID, 'Invalid student ID format')
  }),
  query: z.object({
    tab: z.enum(['upcoming', 'past']).optional(),
    status: z.string().trim().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    sort: z.enum(['date', 'createdAt', 'timeSlot']).default('date'),
    order: z.enum(['asc', 'desc']).default('asc')
  })
};

export const deletePtmSchema = {
  params: z.object({
    id: z.string({ required_error: 'Appointment ID is required' }).regex(REGEX.UUID, 'Invalid appointment ID format')
  })
};
