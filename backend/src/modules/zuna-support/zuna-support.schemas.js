import { z } from 'zod';

export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

export const createZunaTicketSchema = {
  body: z.object({
    subject: z.string({ required_error: 'Subject is required' }).trim().min(3, 'Subject must be at least 3 characters').max(255),
    description: z.string({ required_error: 'Description is required' }).trim().min(5, 'Description must be at least 5 characters').max(5000),
    priority: z
      .string()
      .optional()
      .transform((v) => (v ? v.toUpperCase() : 'MEDIUM'))
      .pipe(z.enum(PRIORITIES))
  })
};

export const listZunaTicketsSchema = {
  query: z.object({
    status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']).optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(50)
  })
};

export const zunaTicketParamsSchema = {
  params: z.object({
    id: z.string().trim().min(1).max(64)
  })
};

export const addZunaMessageSchema = {
  params: z.object({
    id: z.string().trim().min(1).max(64)
  }),
  body: z.object({
    text: z.string({ required_error: 'Message is required' }).trim().min(1, 'Message cannot be empty').max(5000)
  })
};
