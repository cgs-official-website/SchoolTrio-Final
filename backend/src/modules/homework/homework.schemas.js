import { z } from 'zod';
import { REGEX } from '../../config/constants.js';

/**
 * Valid homework submission statuses
 */
export const HOMEWORK_STATUSES = ['Not Started', 'In Progress', 'Completed', 'Submitted'];

/**
 * Helper to validate standard calendar date YYYY-MM-DD
 */
const dateStringSchema = z
  .string({ required_error: 'Due date is required' })
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
 * Single file attachment schema
 */
const attachmentFileSchema = z.object({
  name: z.string().trim().max(255).optional(),
  url: z.string().url('Attachment URL must be a valid URL'),
  size: z.union([z.number(), z.string()]).optional(),
  type: z.string().trim().max(100).optional()
});

/**
 * Attachments input schema (allows array of files, or structured object)
 */
const attachmentsInputSchema = z
  .union([
    z.array(attachmentFileSchema),
    z.object({
      files: z.array(attachmentFileSchema).optional(),
      remarks: z.string().trim().max(2000).optional(),
      maxMarks: z.number().min(0).max(1000).optional()
    })
  ])
  .nullable()
  .optional();

export const getUnreadHomeworkCountSchema = {
  query: z.object({
    since: z.string().optional()
  })
};

export const listHomeworkSchema = {
  query: z.object({
    classId: z.string().regex(REGEX.UUID, 'Invalid class ID format').optional(),
    subjectId: z.string().regex(REGEX.UUID, 'Invalid subject ID format').optional(),
    startDate: z.string().regex(REGEX.DATE_ISO, 'Invalid start date').optional(),
    endDate: z.string().regex(REGEX.DATE_ISO, 'Invalid end date').optional(),
    search: z.string().trim().max(100).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    sort: z.enum(['dueDate', 'createdAt', 'title']).default('createdAt'),
    order: z.enum(['asc', 'desc']).default('desc')
  })
};

export const getHomeworkByIdSchema = {
  params: z.object({
    id: z.string({ required_error: 'Homework ID is required' }).regex(REGEX.UUID, 'Invalid homework ID format')
  })
};

export const createHomeworkSchema = {
  body: z.object({
    title: z
      .string({ required_error: 'Title is required' })
      .trim()
      .min(1, 'Title cannot be empty')
      .max(200, 'Title cannot exceed 200 characters'),
    description: z.string().trim().max(5000, 'Description cannot exceed 5000 characters').nullable().optional(),
    classId: z
      .string({ required_error: 'Class ID is required' })
      .regex(REGEX.UUID, 'Invalid class ID format'),
    subjectId: z
      .string({ required_error: 'Subject ID is required' })
      .regex(REGEX.UUID, 'Invalid subject ID format'),
    dueDate: dateStringSchema,
    remarks: z.string().trim().max(2000, 'Remarks cannot exceed 2000 characters').nullable().optional(),
    maxMarks: z.coerce.number().min(0, 'Max marks cannot be negative').max(1000, 'Max marks cannot exceed 1000').optional().default(0),
    attachments: attachmentsInputSchema
  })
};

export const updateHomeworkSchema = {
  params: z.object({
    id: z.string({ required_error: 'Homework ID is required' }).regex(REGEX.UUID, 'Invalid homework ID format')
  }),
  body: z.object({
    title: z.string().trim().min(1, 'Title cannot be empty').max(200, 'Title cannot exceed 200 characters').optional(),
    description: z.string().trim().max(5000, 'Description cannot exceed 5000 characters').nullable().optional(),
    classId: z.string().regex(REGEX.UUID, 'Invalid class ID format').optional(),
    subjectId: z.string().regex(REGEX.UUID, 'Invalid subject ID format').optional(),
    dueDate: dateStringSchema.optional(),
    remarks: z.string().trim().max(2000, 'Remarks cannot exceed 2000 characters').nullable().optional(),
    maxMarks: z.coerce.number().min(0, 'Max marks cannot be negative').max(1000, 'Max marks cannot exceed 1000').optional(),
    attachments: attachmentsInputSchema
  })
};

export const deleteHomeworkSchema = {
  params: z.object({
    id: z.string({ required_error: 'Homework ID is required' }).regex(REGEX.UUID, 'Invalid homework ID format')
  })
};

export const updateSubmissionSchema = {
  params: z.object({
    id: z.string({ required_error: 'Homework ID is required' }).regex(REGEX.UUID, 'Invalid homework ID format'),
    studentId: z.string({ required_error: 'Student ID is required' }).regex(REGEX.UUID, 'Invalid student ID format')
  }),
  body: z.object({
    status: z.enum(HOMEWORK_STATUSES, { errorMap: () => ({ message: 'Invalid status' }) }).optional(),
    grade: z.string().trim().max(10, 'Grade cannot exceed 10 characters').nullable().optional(),
    feedback: z.string().trim().max(2000, 'Feedback cannot exceed 2000 characters').nullable().optional()
  }).refine((data) => data.status !== undefined || data.grade !== undefined || data.feedback !== undefined, {
    message: 'At least one field (status, grade, feedback) must be provided'
  })
};

// ============================================================
// PARENT / STUDENT HOMEWORK SCHEMAS
// ============================================================

export const listStudentHomeworkSchema = {
  params: z.object({
    studentId: z.string({ required_error: 'Student ID is required' }).regex(REGEX.UUID, 'Invalid student ID format')
  }),
  query: z.object({
    status: z.enum(HOMEWORK_STATUSES).optional(),
    subjectId: z.string().regex(REGEX.UUID, 'Invalid subject ID format').optional(),
    search: z.string().trim().max(100).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    sort: z.enum(['dueDate', 'createdAt']).default('dueDate'),
    order: z.enum(['asc', 'desc']).default('asc')
  })
};

export const updateStudentHomeworkStatusSchema = {
  params: z.object({
    studentId: z.string({ required_error: 'Student ID is required' }).regex(REGEX.UUID, 'Invalid student ID format'),
    homeworkId: z.string({ required_error: 'Homework ID is required' }).regex(REGEX.UUID, 'Invalid homework ID format')
  }),
  body: z.object({
    status: z.enum(HOMEWORK_STATUSES, {
      required_error: 'Status is required',
      invalid_type_error: 'Status must be one of: Not Started, In Progress, Completed, Submitted'
    })
  })
};
