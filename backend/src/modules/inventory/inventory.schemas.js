import { z } from 'zod';

export const uuidSchema = z
  .string({ required_error: 'ID is required' })
  .uuid({ message: 'Must be a valid UUID' });

export const categoryIdParamSchema = {
  params: z.object({
    id: uuidSchema
  })
};

export const itemIdParamSchema = {
  params: z.object({
    id: uuidSchema
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
    .max(100, { message: 'Category name must not exceed 100 characters' }),
  description: z
    .string()
    .trim()
    .max(500, { message: 'Description must not exceed 500 characters' })
    .optional()
    .nullable()
});

export const createCategorySchema = {
  body: createCategoryBodySchema
};

export const updateCategoryBodySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { message: 'Category name cannot be empty' })
    .max(100, { message: 'Category name must not exceed 100 characters' })
    .optional(),
  description: z
    .string()
    .trim()
    .max(500, { message: 'Description must not exceed 500 characters' })
    .optional()
    .nullable()
});

export const updateCategorySchema = {
  params: z.object({ id: uuidSchema }),
  body: updateCategoryBodySchema
};

// ==========================================
// 2. Inventory Item Schemas
// ==========================================

export const createItemBodySchema = z.object({
  name: z
    .string({ required_error: 'Item name is required' })
    .trim()
    .min(1, { message: 'Item name cannot be empty' })
    .max(150, { message: 'Item name must not exceed 150 characters' }),
  productId: z
    .string()
    .trim()
    .max(100, { message: 'Product ID must not exceed 100 characters' })
    .optional()
    .nullable(),
  category: z
    .string()
    .trim()
    .max(100, { message: 'Category name must not exceed 100 characters' })
    .optional()
    .nullable(),
  categoryId: z
    .string()
    .uuid({ message: 'categoryId must be a valid UUID' })
    .optional()
    .nullable(),
  quantity: z
    .number()
    .int({ message: 'Quantity must be an integer' })
    .min(0, { message: 'Quantity cannot be negative' })
    .default(0),
  unit: z
    .string()
    .trim()
    .max(50, { message: 'Unit must not exceed 50 characters' })
    .default('pcs'),
  minimumStock: z
    .number()
    .int({ message: 'Minimum stock must be an integer' })
    .min(0, { message: 'Minimum stock cannot be negative' })
    .default(5),
  unitPrice: z
    .number()
    .min(0, { message: 'Unit price cannot be negative' })
    .optional()
    .nullable(),
  customData: z
    .record(z.any())
    .optional()
    .nullable()
});

export const createItemSchema = {
  body: createItemBodySchema
};

export const updateItemBodySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { message: 'Item name cannot be empty' })
    .max(150, { message: 'Item name must not exceed 150 characters' })
    .optional(),
  productId: z
    .string()
    .trim()
    .max(100, { message: 'Product ID must not exceed 100 characters' })
    .optional()
    .nullable(),
  category: z
    .string()
    .trim()
    .max(100, { message: 'Category name must not exceed 100 characters' })
    .optional()
    .nullable(),
  categoryId: z
    .string()
    .uuid({ message: 'categoryId must be a valid UUID' })
    .optional()
    .nullable(),
  unit: z
    .string()
    .trim()
    .max(50, { message: 'Unit must not exceed 50 characters' })
    .optional(),
  minimumStock: z
    .number()
    .int({ message: 'Minimum stock must be an integer' })
    .min(0, { message: 'Minimum stock cannot be negative' })
    .optional(),
  unitPrice: z
    .number()
    .min(0, { message: 'Unit price cannot be negative' })
    .optional()
    .nullable(),
  customData: z
    .record(z.any())
    .optional()
    .nullable()
});

export const updateItemSchema = {
  params: z.object({ id: uuidSchema }),
  body: updateItemBodySchema
};

export const listItemsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  category: z.string().trim().optional(),
  status: z.enum(['All', 'In Stock', 'Low Stock', 'Out of Stock']).optional(),
  search: z.string().trim().optional()
});

export const listItemsSchema = {
  query: listItemsQuerySchema
};

export const bulkDeleteItemsBodySchema = z.object({
  itemIds: z
    .array(uuidSchema, { required_error: 'itemIds array is required' })
    .min(1, { message: 'At least one itemId is required' })
});

export const bulkDeleteItemsSchema = {
  body: bulkDeleteItemsBodySchema
};

// ==========================================
// 3. Stock Adjustment Schema
// ==========================================

export const adjustStockBodySchema = z.object({
  type: z.enum(['inbound', 'outbound'], {
    required_error: 'Adjustment type must be either inbound or outbound'
  }),
  quantity: z
    .number({ required_error: 'Quantity is required' })
    .int({ message: 'Quantity must be an integer' })
    .positive({ message: 'Adjustment quantity must be greater than 0' }),
  remarks: z
    .string()
    .trim()
    .max(1000, { message: 'Remarks must not exceed 1000 characters' })
    .optional()
    .nullable()
});

export const adjustStockSchema = {
  params: z.object({ id: uuidSchema }),
  body: adjustStockBodySchema
};

// ==========================================
// 4. Bulk Import Schema
// ==========================================

export const bulkImportRowSchema = z.object({
  productId: z
    .string()
    .trim()
    .max(100, { message: 'Product ID must not exceed 100 characters' })
    .optional()
    .nullable(),
  name: z
    .string({ required_error: 'Product Name is mandatory' })
    .trim()
    .min(1, { message: 'Product Name is mandatory' })
    .max(150, { message: 'Product Name must not exceed 150 characters' }),
  category: z
    .string({ required_error: 'Category is mandatory' })
    .trim()
    .min(1, { message: 'Category is mandatory' })
    .max(100, { message: 'Category must not exceed 100 characters' }),
  quantity: z
    .number()
    .int({ message: 'Initial stock must be an integer' })
    .min(0, { message: 'Initial stock cannot be negative' })
    .default(0)
});

export const bulkImportBodySchema = z.object({
  items: z
    .array(bulkImportRowSchema, { required_error: 'items array is required' })
    .min(1, { message: 'Uploaded file has no data rows' }),
  autoCreateCategories: z.boolean().default(false),
  duplicateAction: z.enum(['skip', 'update', 'create-new']).default('skip')
});

export const bulkImportSchema = {
  body: bulkImportBodySchema
};

// ==========================================
// 5. Audit Logs Schema
// ==========================================

export const listAuditLogsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  startDate: z.string().trim().optional(),
  endDate: z.string().trim().optional(),
  productName: z.string().trim().optional(),
  productId: z.string().trim().optional(),
  category: z.string().trim().optional(),
  userName: z.string().trim().optional(),
  actionType: z.string().trim().optional(),
  transactionType: z.enum(['All', 'inbound', 'outbound']).optional(),
  search: z.string().trim().optional()
});

export const listAuditLogsSchema = {
  query: listAuditLogsQuerySchema
};
