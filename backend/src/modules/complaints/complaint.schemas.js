import { z } from 'zod';

export const listComplaintsSchema = z.object({
  query: z.object({
    status: z.enum(['pending', 'resolved', 'rejected'], {
      errorMap: () => ({ message: 'status must be pending, resolved, or rejected' })
    }).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    page: z.coerce.number().int().min(1).default(1)
  })
});

export const complaintIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid({ message: 'Complaint ID must be a valid UUID' })
  })
});

export const createComplaintSchema = z.object({
  body: z.object({
    title: z.string().trim().min(1, { message: 'Title is required' }).max(200, { message: 'Title must not exceed 200 characters' }),
    description: z.string().trim().min(1, { message: 'Description is required' })
  })
});

export const updateComplaintStatusSchema = z.object({
  params: z.object({
    id: z.string().uuid({ message: 'Complaint ID must be a valid UUID' })
  }),
  body: z.object({
    status: z.enum(['resolved', 'rejected'], {
      errorMap: () => ({ message: 'status must be resolved or rejected' })
    }),
    resolutionNotes: z.string().trim().max(2000, { message: 'Resolution notes must not exceed 2000 characters' }).optional().nullable()
  })
});
