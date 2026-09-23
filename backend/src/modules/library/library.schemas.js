import { z } from 'zod';

export const uuidSchema = z
  .string({ required_error: 'ID is required' })
  .uuid({ message: 'Must be a valid UUID' });

export const libraryIdParamSchema = {
  params: z.object({
    id: z.string({ required_error: 'ID is required' }).uuid({ message: 'ID must be a valid UUID' })
  })
};

// ==========================================
// 1. Category Schemas
// ==========================================

export const createCategoryBodySchema = z.object({
  name: z
    .string({ required_error: 'Category name is required' })
    .trim()
    .min(1, { message: 'Category name cannot be empty' })
    .max(100, { message: 'Category name must not exceed 100 characters' })
});

export const createCategorySchema = {
  body: createCategoryBodySchema
};

// ==========================================
// 2. Book Schemas
// ==========================================

export const createBookBodySchema = z.object({
  title: z
    .string({ required_error: 'Title is required' })
    .trim()
    .min(1, { message: 'Title cannot be empty' })
    .max(255, { message: 'Title must not exceed 255 characters' }),
  author: z
    .string()
    .trim()
    .max(255, { message: 'Author must not exceed 255 characters' })
    .optional()
    .nullable(),
  isbn: z
    .string()
    .trim()
    .max(50, { message: 'ISBN must not exceed 50 characters' })
    .optional()
    .nullable(),
  category: z
    .string()
    .trim()
    .max(100, { message: 'Category must not exceed 100 characters' })
    .optional()
    .nullable(),
  categoryId: z
    .string()
    .uuid({ message: 'categoryId must be a valid UUID' })
    .optional()
    .nullable(),
  totalQuantity: z.coerce
    .number({ invalid_type_error: 'totalQuantity must be an integer' })
    .int({ message: 'totalQuantity must be an integer' })
    .min(1, { message: 'totalQuantity must be at least 1' })
    .default(1),
  customData: z.record(z.any()).optional().nullable()
});

export const createBookSchema = {
  body: createBookBodySchema
};

export const updateBookBodySchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, { message: 'Title cannot be empty' })
      .max(255, { message: 'Title must not exceed 255 characters' })
      .optional(),
    author: z
      .string()
      .trim()
      .max(255, { message: 'Author must not exceed 255 characters' })
      .optional()
      .nullable(),
    isbn: z
      .string()
      .trim()
      .max(50, { message: 'ISBN must not exceed 50 characters' })
      .optional()
      .nullable(),
    category: z
      .string()
      .trim()
      .max(100, { message: 'Category must not exceed 100 characters' })
      .optional()
      .nullable(),
    categoryId: z
      .string()
      .uuid({ message: 'categoryId must be a valid UUID' })
      .optional()
      .nullable(),
    totalQuantity: z.coerce
      .number({ invalid_type_error: 'totalQuantity must be an integer' })
      .int({ message: 'totalQuantity must be an integer' })
      .min(1, { message: 'totalQuantity must be at least 1' })
      .optional(),
    customData: z.record(z.any()).optional().nullable()
  })
  .refine(data => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update'
  });

export const updateBookSchema = {
  params: z.object({
    id: z.string({ required_error: 'Book ID is required' }).uuid({ message: 'Book ID must be a valid UUID' })
  }),
  body: updateBookBodySchema
};

export const listBooksQuerySchema = z.object({
  search: z.string().trim().max(100, { message: 'Search term must not exceed 100 characters' }).optional(),
  category: z.string().trim().max(100).optional(),
  categoryId: z.string().uuid({ message: 'categoryId must be a valid UUID' }).optional(),
  availableOnly: z
    .enum(['true', 'false', '1', '0'])
    .transform(val => val === 'true' || val === '1')
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

export const listBooksSchema = {
  query: listBooksQuerySchema
};

// ==========================================
// 3. Issue Schemas
// ==========================================

export const dueDateSchema = z
  .string({ required_error: 'Due date is required' })
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Due date must be in YYYY-MM-DD format' })
  .refine(
    (dateStr) => {
      const todayStr = new Date().toISOString().split('T')[0];
      return dateStr >= todayStr;
    },
    { message: 'Due date cannot be in the past' }
  );

export const issueBookBodySchema = z.object({
  bookId: z.string({ required_error: 'bookId is required' }).uuid({ message: 'bookId must be a valid UUID' }),
  studentId: z.string({ required_error: 'studentId is required' }).uuid({ message: 'studentId must be a valid UUID' }),
  dueDate: dueDateSchema
});

export const issueBookSchema = {
  body: issueBookBodySchema
};

export const listIssuesQuerySchema = z.object({
  status: z.enum(['issued', 'returned', 'Issued', 'Returned']).transform(s => s.toLowerCase()).optional(),
  bookId: z.string().uuid({ message: 'bookId must be a valid UUID' }).optional(),
  studentId: z.string().uuid({ message: 'studentId must be a valid UUID' }).optional(),
  search: z.string().trim().max(100, { message: 'Search term must not exceed 100 characters' }).optional(),
  overdue: z
    .enum(['true', 'false', '1', '0'])
    .transform(val => val === 'true' || val === '1')
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

export const listIssuesSchema = {
  query: listIssuesQuerySchema
};
