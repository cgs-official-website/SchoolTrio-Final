import { z } from 'zod';
import { REGEX } from '../../config/constants.js';

/**
 * Valid notice types
 */
export const NOTICE_TYPES = ['global', 'class'];

/**
 * Valid notice audiences
 */
export const NOTICE_AUDIENCES = [
  'all',
  'teachers',
  'parents',
  'students',
  'students_parents',
  'specific_parents'
];

/**
 * Valid notice priorities
 */
export const NOTICE_PRIORITIES = ['normal', 'high'];

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
      priority: z.enum(NOTICE_PRIORITIES).optional(),
      targetStudentIds: z.array(z.string().regex(REGEX.UUID, 'Invalid student ID format')).optional()
    })
  ])
  .nullable()
  .optional();

// ============================================================
// NOTICE SCHEMAS
// ============================================================

/**
 * Schema for creating a notice
 */
export const createNoticeSchema = {
  body: z
    .object({
      title: z
        .string({ required_error: 'Title is required' })
        .trim()
        .min(1, 'Title cannot be empty')
        .max(200, 'Title cannot exceed 200 characters'),
      content: z.string().trim().min(1, 'Content is required').optional(),
      message: z.string().trim().min(1, 'Message is required').optional(),
      type: z.enum(NOTICE_TYPES, {
        errorMap: () => ({ message: `Type must be one of: ${NOTICE_TYPES.join(', ')}` })
      }).default('global'),
      classId: z
        .string()
        .regex(REGEX.UUID, 'Invalid class ID format')
        .nullable()
        .optional(),
      audience: z.enum(NOTICE_AUDIENCES, {
        errorMap: () => ({ message: `Audience must be one of: ${NOTICE_AUDIENCES.join(', ')}` })
      }).default('all'),
      priority: z.enum(NOTICE_PRIORITIES, {
        errorMap: () => ({ message: `Priority must be one of: ${NOTICE_PRIORITIES.join(', ')}` })
      }).default('normal'),
      targetStudentIds: z
        .array(z.string().regex(REGEX.UUID, 'Invalid target student ID format'))
        .optional(),
      sendWhatsApp: z.boolean().optional(),
      attachments: attachmentsInputSchema
    })
    .refine((data) => Boolean(data.content || data.message), {
      message: 'Notice content or message is required',
      path: ['content']
    })
    .refine(
      (data) => {
        if (data.type === 'class') {
          return Boolean(data.classId);
        }
        return true;
      },
      {
        message: 'Class ID is required when notice type is "class"',
        path: ['classId']
      }
    )
};

/**
 * Schema for updating a notice
 */
export const updateNoticeSchema = {
  params: z.object({
    id: z.string().regex(REGEX.UUID, 'Invalid notice ID format')
  }),
  body: z
    .object({
      title: z
        .string()
        .trim()
        .min(1, 'Title cannot be empty')
        .max(200, 'Title cannot exceed 200 characters')
        .optional(),
      content: z.string().trim().min(1, 'Content cannot be empty').optional(),
      message: z.string().trim().min(1, 'Message cannot be empty').optional(),
      type: z.enum(NOTICE_TYPES).optional(),
      classId: z
        .string()
        .regex(REGEX.UUID, 'Invalid class ID format')
        .nullable()
        .optional(),
      audience: z.enum(NOTICE_AUDIENCES).optional(),
      priority: z.enum(NOTICE_PRIORITIES).optional(),
      targetStudentIds: z
        .array(z.string().regex(REGEX.UUID, 'Invalid target student ID format'))
        .optional(),
      attachments: attachmentsInputSchema
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: 'At least one field must be provided for update'
    })
};

/**
 * Schema for listing / querying notices
 */
export const listNoticesSchema = {
  query: z.object({
    type: z.enum(NOTICE_TYPES).optional(),
    audience: z.enum(NOTICE_AUDIENCES).optional(),
    classId: z.string().regex(REGEX.UUID, 'Invalid class ID format').optional(),
    priority: z.enum(NOTICE_PRIORITIES).optional(),
    search: z.string().trim().max(100).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    sort: z.enum(['createdAt', 'updatedAt', 'title', 'priority']).default('createdAt'),
    order: z.enum(['asc', 'desc']).default('desc')
  })
};

/**
 * Schema for fetching a single notice by ID
 */
export const getNoticeByIdSchema = {
  params: z.object({
    id: z.string().regex(REGEX.UUID, 'Invalid notice ID format')
  })
};

/**
 * Schema for deleting a notice
 */
export const deleteNoticeSchema = {
  params: z.object({
    id: z.string().regex(REGEX.UUID, 'Invalid notice ID format')
  })
};

/**
 * Schema for recording a read receipt
 */
export const markNoticeViewedSchema = {
  params: z.object({
    id: z.string().regex(REGEX.UUID, 'Invalid notice ID format')
  })
};
