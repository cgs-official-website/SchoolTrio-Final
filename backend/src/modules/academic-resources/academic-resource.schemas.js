import { z } from 'zod';

export const ALLOWED_RESOURCE_TYPES = ['document', 'video', 'image', 'link'];

export const resourceTypeEnumSchema = z
  .enum(['document', 'video', 'image', 'link', 'Document', 'Video', 'Image', 'Link'], {
    errorMap: () => ({ message: "Type must be one of: 'document', 'video', 'image', 'link'" })
  })
  .transform(s => (s ? s.toLowerCase() : 'document'));

export const resourceUrlSchema = z
  .string({ invalid_type_error: 'File URL must be a string' })
  .trim()
  .url('File URL must be a valid URL')
  .refine(
    (url) => {
      try {
        const parsed = new URL(url);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
      } catch {
        return false;
      }
    },
    { message: 'File URL protocol must be http: or https:' }
  );

export const listAcademicResourcesQuerySchema = z.object({
  classId: z.string().uuid({ message: 'classId must be a valid UUID' }).optional(),
  subjectId: z.string().uuid({ message: 'subjectId must be a valid UUID' }).optional(),
  type: resourceTypeEnumSchema.optional(),
  uploaderId: z.string().uuid({ message: 'uploaderId must be a valid UUID' }).optional(),
  search: z.string().trim().max(100, { message: 'Search term must not exceed 100 characters' }).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

export const listAcademicResourcesSchema = {
  query: listAcademicResourcesQuerySchema
};

export const academicResourceIdParamsSchema = z.object({
  id: z.string().uuid({ message: 'Resource ID must be a valid UUID' })
});

export const academicResourceIdParamSchema = {
  params: academicResourceIdParamsSchema
};

export const createAcademicResourceBodySchema = z.object({
  title: z
    .string({ required_error: 'Title is required' })
    .trim()
    .min(1, { message: 'Title cannot be empty' })
    .max(200, { message: 'Title must not exceed 200 characters' }),
  classId: z.string({ required_error: 'classId is required' }).uuid({ message: 'classId must be a valid UUID' }),
  subjectId: z.string().uuid({ message: 'subjectId must be a valid UUID' }).optional().nullable(),
  fileUrl: resourceUrlSchema.optional().nullable(),
  type: resourceTypeEnumSchema.default('document'),
  description: z.string().trim().max(5000, { message: 'Description must not exceed 5000 characters' }).optional().nullable()
});

export const createAcademicResourceSchema = {
  body: createAcademicResourceBodySchema
};

export const updateAcademicResourceBodySchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, { message: 'Title cannot be empty' })
      .max(200, { message: 'Title must not exceed 200 characters' })
      .optional(),
    classId: z.string().uuid({ message: 'classId must be a valid UUID' }).optional(),
    subjectId: z.string().uuid({ message: 'subjectId must be a valid UUID' }).optional().nullable(),
    fileUrl: resourceUrlSchema.optional().nullable(),
    type: resourceTypeEnumSchema.optional(),
    description: z.string().trim().max(5000, { message: 'Description must not exceed 5000 characters' }).optional().nullable()
  })
  .refine(data => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update'
  });

export const updateAcademicResourceSchema = {
  params: academicResourceIdParamsSchema,
  body: updateAcademicResourceBodySchema
};
