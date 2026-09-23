import { z } from 'zod';
import { REGEX, PAGINATION_DEFAULTS } from '../../config/constants.js';

/**
 * Attendance Validation Schemas using Zod
 * Formatted as { body, query, params } objects for validate middleware compatibility.
 */

export const ATTENDANCE_STATUSES = ['Present', 'Absent', 'Late'];
export const ATTENDANCE_SESSIONS = ['STANDARD', 'FN', 'AN'];
export const TIMELINE_FILTERS = ['all', 'weekly', 'monthly', 'term'];

/**
 * Helper to validate ISO Date (YYYY-MM-DD) and ensure it is not in the future.
 */
const isoDateSchema = z.string({ required_error: 'Date is required' })
  .regex(REGEX.DATE_ISO, 'Date must be formatted as YYYY-MM-DD')
  .refine((val) => {
    const today = new Date().toISOString().split('T')[0];
    return val <= today;
  }, {
    message: 'Attendance date cannot be in the future'
  });

/**
 * Single student attendance record item schema
 */
export const attendanceRecordItemSchema = z.object({
  studentId: z.string({ required_error: 'Student ID is required' }).regex(REGEX.UUID, 'Invalid student ID format'),
  status: z.enum(ATTENDANCE_STATUSES, {
    errorMap: () => ({ message: `Status must be one of: ${ATTENDANCE_STATUSES.join(', ')}` })
  }),
  remark: z.string().max(255, 'Remark cannot exceed 255 characters').nullable().optional()
});

/**
 * Params schemas
 */
export const attendanceParamsSchema = {
  params: z.object({
    id: z.string({ required_error: 'Session ID is required' }).regex(REGEX.UUID, 'Invalid attendance session ID format')
  })
};

export const studentAttendanceParamsSchema = {
  params: z.object({
    studentId: z.string({ required_error: 'Student ID is required' }).regex(REGEX.UUID, 'Invalid student ID format')
  }),
  query: z.object({
    filter: z.enum(TIMELINE_FILTERS).default('all').optional(),
    academicYear: z.string().max(20).optional(),
    page: z.coerce.number().int().min(1).default(PAGINATION_DEFAULTS.PAGE).optional(),
    limit: z.coerce.number().int().min(1).max(PAGINATION_DEFAULTS.MAX_LIMIT).default(PAGINATION_DEFAULTS.LIMIT).optional()
  })
};

export const absenteeFlagParamsSchema = {
  params: z.object({
    id: z.string({ required_error: 'Flag ID is required' }).regex(REGEX.UUID, 'Invalid absentee flag ID format')
  })
};

/**
 * List Attendance Sessions schema
 */
export const listAttendanceSessionsSchema = {
  query: z.object({
    classId: z.string().regex(REGEX.UUID, 'Invalid class ID format').optional(),
    sectionId: z.string().regex(REGEX.UUID, 'Invalid section ID format').optional(),
    date: z.string().regex(REGEX.DATE_ISO, 'Date must be formatted as YYYY-MM-DD').optional(),
    startDate: z.string().regex(REGEX.DATE_ISO, 'Start date must be formatted as YYYY-MM-DD').optional(),
    endDate: z.string().regex(REGEX.DATE_ISO, 'End date must be formatted as YYYY-MM-DD').optional(),
    session: z.enum(ATTENDANCE_SESSIONS).optional(),
    page: z.coerce.number().int().min(1).default(PAGINATION_DEFAULTS.PAGE).optional(),
    limit: z.coerce.number().int().min(1).max(PAGINATION_DEFAULTS.MAX_LIMIT).default(PAGINATION_DEFAULTS.LIMIT).optional(),
    sort: z.enum(['date', 'createdAt', 'updatedAt']).default('date').optional(),
    order: z.enum(['asc', 'desc']).default('desc').optional()
  }).refine(data => {
    if (data.startDate && data.endDate) {
      return data.startDate <= data.endDate;
    }
    return true;
  }, {
    message: 'startDate cannot be after endDate',
    path: ['startDate']
  })
};

/**
 * Create / Upsert Attendance Session schema
 */
export const createAttendanceSessionSchema = {
  body: z.object({
    classId: z.string({ required_error: 'Class ID is required' }).regex(REGEX.UUID, 'Invalid class ID format'),
    sectionId: z.string().regex(REGEX.UUID, 'Invalid section ID format').nullable().optional(),
    date: isoDateSchema,
    session: z.enum(ATTENDANCE_SESSIONS).default('STANDARD').optional(),
    academicYear: z.string().max(20).optional(),
    records: z.array(attendanceRecordItemSchema)
      .min(1, 'At least one student attendance record is required')
      .refine((records) => {
        const studentIds = records.map(r => r.studentId);
        return new Set(studentIds).size === studentIds.length;
      }, {
        message: 'Duplicate student IDs are not allowed in a single attendance submission'
      })
  })
};

/**
 * Update (PATCH) Attendance Session schema
 */
export const updateAttendanceSessionSchema = {
  params: z.object({
    id: z.string({ required_error: 'Session ID is required' }).regex(REGEX.UUID, 'Invalid attendance session ID format')
  }),
  body: z.object({
    records: z.array(attendanceRecordItemSchema)
      .min(1, 'At least one student attendance record is required')
      .refine((records) => {
        const studentIds = records.map(r => r.studentId);
        return new Set(studentIds).size === studentIds.length;
      }, {
        message: 'Duplicate student IDs are not allowed in a single attendance submission'
      })
  })
};

/**
 * Dashboard statistics query schema
 */
export const dashboardStatsQuerySchema = {
  query: z.object({
    date: z.string().regex(REGEX.DATE_ISO, 'Date must be formatted as YYYY-MM-DD').optional()
  })
};

/**
 * Absentee flags query schema
 */
export const absenteeFlagsQuerySchema = {
  query: z.object({
    classId: z.string().regex(REGEX.UUID, 'Invalid class ID format').optional(),
    month: z.string().regex(/^\d{4}-\d{2}$/, 'Month must be formatted as YYYY-MM').optional(),
    isResolved: z.preprocess(val => {
      if (val === 'true' || val === true) return true;
      if (val === 'false' || val === false) return false;
      return undefined;
    }, z.boolean().optional()),
    page: z.coerce.number().int().min(1).default(PAGINATION_DEFAULTS.PAGE).optional(),
    limit: z.coerce.number().int().min(1).max(PAGINATION_DEFAULTS.MAX_LIMIT).default(PAGINATION_DEFAULTS.LIMIT).optional()
  })
};

/**
 * Resolve absentee flag schema
 */
export const resolveAbsenteeFlagSchema = {
  params: z.object({
    id: z.string({ required_error: 'Flag ID is required' }).regex(REGEX.UUID, 'Invalid absentee flag ID format')
  }),
  body: z.object({
    isResolved: z.boolean().default(true),
    resolutionNotes: z.string().max(500, 'Resolution notes cannot exceed 500 characters').nullable().optional()
  })
};

/**
 * Update Attendance Settings schema
 */
export const updateAttendanceSettingsSchema = {
  body: z.object({
    cutoffTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Cutoff time must be formatted as HH:mm').optional(),
    lateThreshold: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Late threshold must be formatted as HH:mm').optional(),
    absenteeThreshold: z.coerce.number().int().min(1, 'Absentee threshold must be at least 1').optional(),
    workingHoursStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Working hours start must be formatted as HH:mm').optional(),
    workingHoursEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Working hours end must be formatted as HH:mm').optional(),
    timezone: z.string().max(50).optional()
  })
};

