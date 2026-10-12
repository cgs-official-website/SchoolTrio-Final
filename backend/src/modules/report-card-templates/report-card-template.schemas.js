import { z } from 'zod';

/**
 * Zod validation schemas for Report Card Template domain.
 * Preserves legacy configuration compatibility without over-restricting flexible builder fields.
 */

export const SUPPORTED_TEMPLATE_TYPES = Object.freeze(['report_card']);

// Template type schema (alphanumeric with hyphen/underscore, max 50 chars)
export const templateTypeSchema = z
  .string()
  .trim()
  .min(1, 'Template type cannot be empty')
  .max(50, 'Template type cannot exceed 50 characters')
  .regex(/^[a-z0-9_-]+$/i, 'Template type must contain only alphanumeric characters, underscores, or hyphens')
  .default('report_card');

// Header configuration schema
export const headerConfigSchema = z
  .object({
    schoolName: z.string().trim().max(200, 'School name cannot exceed 200 characters').optional(),
    showLogo: z.boolean().optional(),
    showAddress: z.boolean().optional(),
    showPhone: z.boolean().optional(),
    showEmail: z.boolean().optional(),
    title: z.string().trim().max(200, 'Header title cannot exceed 200 characters').optional(),
    subtitle: z.string().trim().max(200, 'Header subtitle cannot exceed 200 characters').optional()
  })
  .passthrough();

// Student fields display toggles schema
export const studentFieldsConfigSchema = z
  .object({
    admissionNo: z.boolean().optional(),
    dob: z.boolean().optional(),
    fatherName: z.boolean().optional(),
    motherName: z.boolean().optional(),
    attendance: z.boolean().optional()
  })
  .passthrough();

// Academic & grading display configuration schema
export const gradingConfigSchema = z
  .object({
    style: z
      .enum(['marks', 'grades', 'marks_and_grades'], {
        errorMap: () => ({ message: 'Grading style must be "marks", "grades", or "marks_and_grades"' })
      })
      .optional(),
    showTotal: z.boolean().optional(),
    showPercentage: z.boolean().optional(),
    showRank: z.boolean().optional(),
    columns: z.array(z.string().trim().max(100)).max(20).optional()
  })
  .passthrough();

// Footer & signatures configuration schema
export const footerConfigSchema = z
  .object({
    signatures: z
      .array(z.string().trim().max(100, 'Signature title cannot exceed 100 characters'))
      .max(10, 'Cannot specify more than 10 signatures')
      .optional(),
    gradingScaleText: z.string().trim().max(1000, 'Grading scale text cannot exceed 1000 characters').optional().nullable(),
    remarks: z.boolean().optional()
  })
  .passthrough();

// Assessment component definition schema (columns with individual mark entry fields)
export const assessmentComponentSchema = z
  .object({
    key: z.string().trim().min(1, 'Component key cannot be empty').max(50),
    name: z.string().trim().max(100).optional(),
    label: z.string().trim().min(1, 'Component label cannot be empty').max(100),
    maxMarks: z.coerce.number().min(0, 'Max marks cannot be negative').max(1000).optional().default(100),
    type: z.enum(['mark', 'calculated_total', 'grade', 'max', 'remarks', 'text']).optional().default('mark'),
    weightage: z.coerce.number().min(0).max(100).optional(),
    isCalculated: z.boolean().optional().default(false)
  })
  .passthrough();

// Subject row definition schema
export const templateSubjectSchema = z
  .object({
    id: z.string().trim().min(1, 'Subject id cannot be empty').max(100),
    name: z.string().trim().min(1, 'Subject name cannot be empty').max(150),
    code: z.string().trim().max(50).optional()
  })
  .passthrough();

// Template section definition schema
export const templateSectionSchema = z
  .object({
    id: z.string().trim().min(1, 'Section id cannot be empty').max(100),
    name: z.string().trim().min(1, 'Section name cannot be empty').max(150),
    subjects: z.array(templateSubjectSchema).optional()
  })
  .passthrough();

// Root template configuration schema
export const templateConfigSchema = z
  .object({
    themeColor: z
      .string()
      .trim()
      .regex(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i, 'Theme color must be a valid hex color code (e.g. #3b82f6)')
      .optional(),
    header: headerConfigSchema.optional(),
    studentFields: studentFieldsConfigSchema.optional(),
    grading: gradingConfigSchema.optional(),
    footer: footerConfigSchema.optional(),
    assessmentComponents: z.array(assessmentComponentSchema).max(30).optional(),
    subjects: z.array(templateSubjectSchema).max(50).optional(),
    sections: z.array(templateSectionSchema).max(20).optional(),
    rawHtmlTemplate: z.string().optional().nullable(),
    originalDocxName: z.string().optional().nullable()
  })
  .passthrough();

// Request body schema for creating / updating a template
export const saveReportCardTemplateSchema = {
  params: z.object({
    templateType: templateTypeSchema.optional()
  }),
  body: z.object({
    config: templateConfigSchema
  })
};

// Request params schema for fetching a template
export const getReportCardTemplateSchema = {
  params: z.object({
    templateType: templateTypeSchema.optional()
  })
};
