import { z } from 'zod';
import { ValidationError } from '../../utils/app-error.js';

export const PERMITTED_FIELD_TYPES = [
  'text',
  'number',
  'email',
  'date',
  'select',
  'checkbox',
  'relation',
  'file'
];

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Validates that an object does not contain dangerous prototype pollution keys
 */
export function checkPrototypePollution(obj) {
  if (!obj || typeof obj !== 'object') return;
  const proto = Object.getPrototypeOf(obj);
  if (proto && proto !== Object.prototype && proto !== Array.prototype) {
    throw new ValidationError('Forbidden property key: __proto__ or modified prototype detected');
  }
  for (const key of Object.keys(obj)) {
    if (DANGEROUS_KEYS.has(key)) {
      throw new ValidationError(`Forbidden property key: ${key}`);
    }
    if (obj[key] && typeof obj[key] === 'object') {
      checkPrototypePollution(obj[key]);
    }
  }
}

// ---------------------------------------------------------------------------
// Field & Section Raw Zod Schemas
// ---------------------------------------------------------------------------

export const fieldSchema = z.object({
  id: z.string().trim().min(1, 'Field ID is required').max(100, 'Field ID is too long'),
  label: z.string().trim().min(1, 'Field label is required').max(200, 'Field label is too long'),
  type: z.enum(PERMITTED_FIELD_TYPES, {
    errorMap: () => ({ message: `Field type must be one of: ${PERMITTED_FIELD_TYPES.join(', ')}` })
  }),
  required: z.boolean().default(false),
  options: z.string().max(2000, 'Options string is too long').optional().nullable().default(''),
  relationModule: z.string().trim().max(100, 'Relation module key is too long').optional().nullable().default('')
}).strict();

export const sectionSchema = z.object({
  id: z.string().trim().min(1, 'Section ID is required').max(100, 'Section ID is too long'),
  title: z.string().trim().min(1, 'Section title is required').max(200, 'Section title is too long'),
  fields: z.array(fieldSchema).max(100, 'Maximum 100 fields allowed per section').default([])
}).strict();

// ---------------------------------------------------------------------------
// Form Schema Upsert Schema
// ---------------------------------------------------------------------------

export const rawUpsertFormSchemaSchema = z.object({
  sections: z.array(sectionSchema).max(50, 'Maximum 50 sections allowed per schema').optional(),
  fields: z.array(fieldSchema).max(100, 'Maximum 100 fields allowed in legacy schema').optional()
}).strict().refine((data) => data.sections !== undefined || data.fields !== undefined, {
  message: 'Schema must provide either sections or fields'
});

export const upsertFormSchemaSchema = {
  body: rawUpsertFormSchemaSchema
};

// ---------------------------------------------------------------------------
// Custom Module Creation & Update Schemas
// ---------------------------------------------------------------------------

export const rawCreateCustomModuleSchema = z.object({
  name: z.string().trim().min(1, 'Module name is required').max(100, 'Module name is too long'),
  icon: z.string().trim().max(50, 'Icon name is too long').optional().default('Folder'),
  order: z.number().int().min(0).optional()
}).strict();

export const createCustomModuleSchema = {
  body: rawCreateCustomModuleSchema
};

export const rawUpdateCustomModuleSchema = z.object({
  name: z.string().trim().min(1, 'Module name cannot be empty').max(100, 'Module name is too long').optional(),
  icon: z.string().trim().max(50, 'Icon name is too long').optional(),
  order: z.number().int().min(0).optional(),
  isActive: z.boolean().optional()
}).strict();

export const updateCustomModuleSchema = {
  body: rawUpdateCustomModuleSchema
};

// ---------------------------------------------------------------------------
// Dynamic Record Payload (Dictionary of fieldId -> value)
// ---------------------------------------------------------------------------

export const recordDataSchema = z.record(
  z.string().min(1).max(100),
  z.union([
    z.string().max(10000),
    z.number(),
    z.boolean(),
    z.null()
  ])
);

export const rawCreateRecordSchema = z.object({
  data: recordDataSchema
}).strict();

export const createRecordSchema = {
  body: rawCreateRecordSchema
};

export const rawUpdateRecordSchema = z.object({
  data: recordDataSchema
}).strict();

export const updateRecordSchema = {
  body: rawUpdateRecordSchema
};

// ---------------------------------------------------------------------------
// Query Parameters
// ---------------------------------------------------------------------------

export const rawListRecordsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  search: z.string().trim().max(200).optional()
});

export const listRecordsQuerySchema = {
  query: rawListRecordsQuerySchema
};
