import { z } from 'zod';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const listCanteenRequestsSchema = z.object({
  query: z.object({
    status: z.enum(['Pending', 'Approved', 'Delivered', 'Cancelled']).optional(),
    mealType: z.enum(['Breakfast', 'Lunch']).optional(),
    date: z.string().regex(DATE_REGEX, { message: 'date must be in YYYY-MM-DD format' }).optional(),
    search: z.string().trim().max(100).optional(),
    studentId: z.string().uuid({ message: 'studentId must be a valid UUID' }).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    page: z.coerce.number().int().min(1).optional()
  })
});

export const canteenRequestIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid({ message: 'Request ID must be a valid UUID' })
  })
});

export const createCanteenRequestSchema = z.object({
  body: z.object({
    studentId: z.string().uuid({ message: 'studentId must be a valid UUID' }),
    mealType: z.enum(['Breakfast', 'Lunch'], {
      errorMap: () => ({ message: 'mealType must be Breakfast or Lunch' })
    }),
    date: z.string().regex(DATE_REGEX, { message: 'date must be in YYYY-MM-DD format' }).optional()
  })
});

export const updateCanteenRequestStatusSchema = z.object({
  params: z.object({
    id: z.string().uuid({ message: 'Request ID must be a valid UUID' })
  }),
  body: z.object({
    status: z.enum(['Approved', 'Delivered', 'Cancelled'], {
      errorMap: () => ({ message: 'status must be Approved, Delivered, or Cancelled' })
    })
  })
});
