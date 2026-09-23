import { z } from 'zod';

export const uuidSchema = z
  .string({ required_error: 'ID is required' })
  .uuid({ message: 'Must be a valid UUID' });

export const idParamSchema = {
  params: z.object({
    id: uuidSchema
  })
};

// ==========================================
// 1. Admin List Query Schema
// ==========================================
export const listPayrollQuerySchema = {
  query: z.object({
    page: z
      .union([z.string(), z.number()])
      .optional()
      .transform((val) => (val ? Math.max(1, parseInt(val, 10) || 1) : 1)),
    limit: z
      .union([z.string(), z.number()])
      .optional()
      .transform((val) => (val ? Math.min(100, Math.max(1, parseInt(val, 10) || 50)) : 50)),
    month: z.string().trim().max(50).optional(),
    status: z.enum(['Pending', 'Paid', 'Payslip Released']).optional(),
    staffId: uuidSchema.optional(),
    search: z.string().trim().max(100).optional()
  })
};

// ==========================================
// 2. Staff Self-Service Query Schema
// ==========================================
export const mySalaryQuerySchema = {
  query: z.object({
    month: z.string().trim().max(50).optional()
  })
};

// ==========================================
// 3. Payroll Generation Schema
// ==========================================
export const singleRecordOverrideSchema = z.object({
  staffId: uuidSchema,
  baseSalary: z
    .number({ invalid_type_error: 'baseSalary must be a number' })
    .min(0, { message: 'baseSalary cannot be negative' })
    .optional(),
  deductions: z
    .number({ invalid_type_error: 'deductions must be a number' })
    .min(0, { message: 'deductions cannot be negative' })
    .optional(),
  pfCalculated: z
    .number({ invalid_type_error: 'pfCalculated must be a number' })
    .min(0, { message: 'pfCalculated cannot be negative' })
    .optional(),
  esiCalculated: z
    .number({ invalid_type_error: 'esiCalculated must be a number' })
    .min(0, { message: 'esiCalculated cannot be negative' })
    .optional(),
  netPay: z
    .number({ invalid_type_error: 'netPay must be a number' })
    .optional(),
  customData: z.record(z.any()).optional()
});

export const generatePayrollBodySchema = z.object({
  month: z
    .string({ required_error: 'month is required' })
    .trim()
    .min(1, { message: 'month cannot be empty' })
    .max(50, { message: 'month must not exceed 50 characters' }),
  staffIds: z.array(uuidSchema).optional(),
  records: z.array(singleRecordOverrideSchema).optional()
});

export const generatePayrollSchema = {
  body: generatePayrollBodySchema
};

// ==========================================
// 4. Payroll Status Update Schema
// ==========================================
export const updateStatusBodySchema = z.object({
  status: z.enum(['Pending', 'Paid', 'Payslip Released'], {
    required_error: 'Status is required and must be Pending, Paid, or Payslip Released'
  }),
  paidAt: z
    .string()
    .datetime({ offset: true, message: 'paidAt must be an ISO 8601 datetime string' })
    .optional()
    .nullable()
});

export const updateStatusSchema = {
  params: z.object({ id: uuidSchema }),
  body: updateStatusBodySchema
};

// ==========================================
// 5. HR Configuration Schema
// ==========================================
export const updateConfigBodySchema = z.object({
  authorizedSignature: z
    .string({ invalid_type_error: 'authorizedSignature must be a string or null' })
    .nullable()
    .optional()
});

export const updateConfigSchema = {
  body: updateConfigBodySchema
};
