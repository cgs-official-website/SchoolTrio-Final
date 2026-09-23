import { z } from 'zod';
import { REGEX } from '../../config/constants.js';

/**
 * Zod validation schemas for Support Tickets REST endpoints.
 */

export const TICKET_STATUSES = ['open', 'in-progress', 'resolved', 'closed'];
export const TICKET_PRIORITIES = ['low', 'medium', 'high', 'urgent'];
export const TICKET_CATEGORIES = ['general', 'billing', 'technical', 'feature_request', 'account'];

export const createTicketSchema = {
  body: z.object({
    subject: z
      .string({ required_error: 'Subject is required' })
      .trim()
      .min(1, 'Subject cannot be empty')
      .max(255, 'Subject cannot exceed 255 characters'),
    description: z
      .string({ required_error: 'Description is required' })
      .trim()
      .min(1, 'Description cannot be empty')
      .max(5000, 'Description cannot exceed 5000 characters'),
    category: z
      .string()
      .trim()
      .max(50, 'Category cannot exceed 50 characters')
      .default('general'),
    priority: z
      .enum(TICKET_PRIORITIES, {
        errorMap: () => ({ message: `Priority must be one of: ${TICKET_PRIORITIES.join(', ')}` })
      })
      .default('medium')
  })
};

export const listTicketsSchema = {
  query: z.object({
    status: z.enum([...TICKET_STATUSES, 'all']).optional(),
    priority: z.enum(TICKET_PRIORITIES).optional(),
    category: z.string().trim().max(50).optional(),
    search: z.string().trim().max(100).optional(),
    page: z.coerce.number().int().min(1, 'Page must be at least 1').optional(),
    limit: z.coerce.number().int().min(1, 'Limit must be at least 1').max(100, 'Limit cannot exceed 100').optional()
  })
};

export const ticketParamsSchema = {
  params: z.object({
    id: z.string({ required_error: 'Ticket ID is required' }).regex(REGEX.UUID, 'Invalid ticket ID format')
  })
};

export const addMessageSchema = {
  params: z.object({
    id: z.string({ required_error: 'Ticket ID is required' }).regex(REGEX.UUID, 'Invalid ticket ID format')
  }),
  body: z.object({
    message: z
      .string({ required_error: 'Message text is required' })
      .trim()
      .min(1, 'Message text cannot be empty')
      .max(5000, 'Message cannot exceed 5000 characters'),
    attachments: z.array(z.string().url('Invalid attachment URL format')).max(10, 'Cannot exceed 10 attachments').optional(),
    isInternalNote: z.boolean().optional()
  })
};

export const superAdminListTicketsSchema = {
  query: z.object({
    schoolId: z.string().regex(REGEX.UUID, 'Invalid school ID format').optional(),
    status: z.enum([...TICKET_STATUSES, 'all']).optional(),
    priority: z.enum(TICKET_PRIORITIES).optional(),
    category: z.string().trim().max(50).optional(),
    search: z.string().trim().max(100).optional(),
    page: z.coerce.number().int().min(1, 'Page must be at least 1').optional(),
    limit: z.coerce.number().int().min(1, 'Limit must be at least 1').max(100, 'Limit cannot exceed 100').optional()
  })
};

export const superAdminUpdateStatusSchema = {
  params: z.object({
    id: z.string({ required_error: 'Ticket ID is required' }).regex(REGEX.UUID, 'Invalid ticket ID format')
  }),
  body: z.object({
    status: z.enum(TICKET_STATUSES, {
      errorMap: () => ({ message: `Status must be one of: ${TICKET_STATUSES.join(', ')}` })
    })
  })
};

export const superAdminAddMessageSchema = {
  params: z.object({
    id: z.string({ required_error: 'Ticket ID is required' }).regex(REGEX.UUID, 'Invalid ticket ID format')
  }),
  body: z.object({
    message: z
      .string({ required_error: 'Message text is required' })
      .trim()
      .min(1, 'Message text cannot be empty')
      .max(5000, 'Message cannot exceed 5000 characters'),
    attachments: z.array(z.string().url('Invalid attachment URL format')).max(10, 'Cannot exceed 10 attachments').optional(),
    isInternalNote: z.boolean().optional().default(false)
  })
};
