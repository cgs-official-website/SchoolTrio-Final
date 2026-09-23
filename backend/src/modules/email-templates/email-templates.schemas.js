import { z } from 'zod';

/**
 * Validation Schemas for Email Templates REST API
 */

export const templateParamsSchema = {
  params: z.object({
    id: z.string()
      .trim()
      .min(1, 'Template identifier is required')
      .max(100, 'Template identifier cannot exceed 100 characters')
      .regex(/^[a-zA-Z0-9_-]+$/, 'Template identifier must be alphanumeric with optional dashes or underscores')
  }).strict()
};

export const listTemplatesQuerySchema = {
  query: z.object({
    isActive: z.enum(['true', 'false']).optional(),
    isSystem: z.enum(['true', 'false']).optional(),
    search: z.string().trim().max(100).optional()
  }).strict()
};

export const createTemplateSchema = {
  body: z.object({
    id: z.string()
      .trim()
      .min(1, 'Identifier cannot be empty')
      .max(100, 'Identifier cannot exceed 100 characters')
      .regex(/^[a-zA-Z0-9_-]+$/, 'Identifier must be alphanumeric with dashes or underscores')
      .optional(),
    name: z.string()
      .trim()
      .min(1, 'Template name is required')
      .max(255, 'Template name cannot exceed 255 characters'),
    description: z.string()
      .trim()
      .max(1000, 'Description cannot exceed 1000 characters')
      .optional()
      .default(''),
    subject: z.string()
      .trim()
      .min(1, 'Email subject line is required')
      .max(255, 'Email subject cannot exceed 255 characters'),
    body: z.string()
      .trim()
      .min(1, 'Template body cannot be empty')
      .max(50000, 'Template body cannot exceed 50,000 characters')
      .optional(),
    html: z.string()
      .trim()
      .min(1, 'Template html cannot be empty')
      .max(50000, 'Template html cannot exceed 50,000 characters')
      .optional(),
    variables: z.array(
      z.string().trim().min(1).max(100)
    ).max(50, 'Cannot exceed 50 template variables').optional().default([]),
    isActive: z.boolean().optional().default(true)
  }).strict().refine(data => Boolean(data.body || data.html), {
    message: 'Either body or html content is required',
    path: ['body']
  })
};

export const updateTemplateSchema = {
  params: z.object({
    id: z.string()
      .trim()
      .min(1, 'Template identifier is required')
      .max(100, 'Template identifier cannot exceed 100 characters')
      .regex(/^[a-zA-Z0-9_-]+$/, 'Template identifier must be alphanumeric with optional dashes or underscores')
  }).strict(),
  body: z.object({
    name: z.string().trim().min(1).max(255).optional(),
    description: z.string().trim().max(1000).optional(),
    subject: z.string().trim().min(1, 'Subject cannot be empty').max(255).optional(),
    body: z.string().trim().min(1, 'Body content cannot be empty').max(50000).optional(),
    html: z.string().trim().min(1, 'HTML content cannot be empty').max(50000).optional(),
    variables: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
    isActive: z.boolean().optional()
  }).strict().refine(data => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update'
  })
};

export const bulkUpdateTemplatesSchema = {
  body: z.object({
    // Structured array format
    templates: z.array(
      z.object({
        id: z.string().trim().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/),
        name: z.string().trim().min(1).max(255).optional(),
        description: z.string().trim().max(1000).optional(),
        subject: z.string().trim().min(1).max(255).optional(),
        body: z.string().trim().min(1).max(50000).optional(),
        html: z.string().trim().min(1).max(50000).optional(),
        variables: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
        isActive: z.boolean().optional()
      }).strict()
    ).optional(),

    // Legacy flat fields format (matching existing frontend EmailTemplates.jsx)
    welcomeSubject: z.string().trim().max(255).optional(),
    welcomeHtml: z.string().trim().max(50000).optional(),
    forgotPasswordSubject: z.string().trim().max(255).optional(),
    forgotPasswordHtml: z.string().trim().max(50000).optional(),
    approvalSubject: z.string().trim().max(255).optional(),
    approvalHtml: z.string().trim().max(50000).optional()
  }).strict().refine(
    data => Boolean(data.templates?.length || Object.keys(data).some(k => k.endsWith('Subject') || k.endsWith('Html'))),
    { message: 'At least one template update must be provided' }
  )
};
