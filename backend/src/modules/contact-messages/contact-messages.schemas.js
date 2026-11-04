import { z } from 'zod';
import { REGEX } from '../../config/constants.js';

export const CONTACT_MESSAGE_STATUSES = ['new', 'read', 'in_progress', 'replied', 'closed'];

export const submitContactMessageSchema = {
  body: z.object({
    name: z
      .string({ required_error: 'Full Name is required' })
      .trim()
      .min(2, 'Name must be at least 2 characters')
      .max(150, 'Name cannot exceed 150 characters'),
    email: z
      .string({ required_error: 'Email address is required' })
      .trim()
      .email('Please provide a valid email address')
      .max(255, 'Email cannot exceed 255 characters'),
    message: z
      .string({ required_error: 'Message is required' })
      .trim()
      .min(5, 'Message must be at least 5 characters')
      .max(5000, 'Message cannot exceed 5000 characters'),
    subject: z
      .string()
      .trim()
      .max(255, 'Subject cannot exceed 255 characters')
      .optional()
  })
};

export const listContactMessagesSchema = {
  query: z.object({
    search: z.string().trim().max(100).optional(),
    status: z.enum([...CONTACT_MESSAGE_STATUSES, 'all']).optional().default('all'),
    sortBy: z.enum(['createdAt', 'name', 'email', 'status']).optional().default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(10)
  })
};

export const contactMessageParamsSchema = {
  params: z.object({
    id: z.string({ required_error: 'Message ID is required' }).regex(REGEX.UUID, 'Invalid message ID format')
  })
};

export const updateStatusSchema = {
  params: z.object({
    id: z.string({ required_error: 'Message ID is required' }).regex(REGEX.UUID, 'Invalid message ID format')
  }),
  body: z.object({
    status: z.enum(CONTACT_MESSAGE_STATUSES, {
      errorMap: () => ({ message: `Status must be one of: ${CONTACT_MESSAGE_STATUSES.join(', ')}` })
    })
  })
};

export const replyContactMessageSchema = {
  params: z.object({
    id: z.string({ required_error: 'Message ID is required' }).regex(REGEX.UUID, 'Invalid message ID format')
  }),
  body: z.object({
    reply: z
      .string({ required_error: 'Reply message cannot be empty' })
      .trim()
      .min(2, 'Reply must be at least 2 characters')
      .max(5000, 'Reply cannot exceed 5000 characters')
  })
};

