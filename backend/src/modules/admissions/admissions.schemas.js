import { z } from 'zod';

/**
 * Common regex and scalar validators
 */
const uuidSchema = z.string().uuid({ message: 'Invalid UUID format' });
const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
const dateSchema = z.string().regex(dateRegex, { message: 'Date must be in YYYY-MM-DD format' });

export const validLeadStatuses = ['Cold', 'Warm', 'Hot', 'New', 'Contacted', 'Enrolled', 'Closed'];
export const validApplicationStatuses = ['Pending', 'Approved', 'Rejected'];
export const validFieldTypes = [
  'text',
  'number',
  'email',
  'phone',
  'date',
  'textarea',
  'dropdown',
  'checkbox',
  'radio'
];

/**
 * Lead ID Param Schema
 */
export const leadParamsSchema = {
  params: z.object({
    id: uuidSchema
  })
};

/**
 * Lead Form ID Param Schema
 */
export const formParamsSchema = {
  params: z.object({
    id: uuidSchema
  })
};

/**
 * Admission Application ID Param Schema
 */
export const applicationParamsSchema = {
  params: z.object({
    id: uuidSchema
  })
};

/**
 * Public Lead Form Lookup Params Schema
 */
export const publicFormLookupParamsSchema = {
  params: z.object({
    schoolId: uuidSchema,
    formId: uuidSchema
  })
};

/**
 * Public School Admission Meta Lookup Params Schema
 */
export const publicAdmissionMetaParamsSchema = {
  params: z.object({
    schoolId: uuidSchema
  })
};

/**
 * Public Lead Submission Schema
 */
export const publicLeadSubmitSchema = {
  params: z.object({
    schoolId: uuidSchema,
    formId: uuidSchema
  }),
  body: z.object({
    data: z.record(z.any(), { message: 'Form data object is required' })
  })
};

/**
 * Public Admission Application Submission Schema
 */
export const publicAdmissionSubmitSchema = {
  params: z.object({
    schoolId: uuidSchema
  }),
  body: z.object({
    firstName: z.string().max(100).optional().nullable().or(z.literal('')),
    lastName: z.string().max(100).optional().nullable().or(z.literal('')),
    studentName: z.string().max(200).optional().nullable(),
    dob: dateSchema.optional().nullable().or(z.literal('')),
    gender: z.string().max(20).optional().default('Male'),
    classId: uuidSchema.optional().nullable().or(z.literal('')),
    targetClassName: z.string().max(100).optional().nullable().or(z.literal('')),
    parentName: z.string().min(1, 'Parent/Guardian name is required').max(150),
    parentRelationship: z.string().max(50).optional().default('Father'),
    parentPhone: z.string().min(5, 'Parent phone must be at least 5 characters').max(20),
    parentEmail: z.string().email('Invalid parent email address').max(255).optional().nullable().or(z.literal('')),
    parentOccupation: z.string().max(100).optional().nullable().or(z.literal('')),
    annualIncome: z.string().max(50).optional().nullable().or(z.literal('')),
    emergencyContact: z.string().max(50).optional().nullable().or(z.literal('')),
    siblingName: z.string().max(100).optional().nullable().or(z.literal('')),
    homeAddress: z.string().max(1000).optional().nullable().or(z.literal('')),
    address: z.string().max(1000).optional().nullable().or(z.literal('')),
    city: z.string().max(100).optional().nullable().or(z.literal('')),
    state: z.string().max(100).optional().nullable().or(z.literal('')),
    pincode: z.string().max(20).optional().nullable().or(z.literal('')),
    photoUrl: z.string().max(1000).optional().nullable().or(z.literal('')),
    bloodGroup: z.string().max(10).optional().nullable().or(z.literal('')),
    nationality: z.string().max(50).optional().nullable().or(z.literal('')),
    religion: z.string().max(50).optional().nullable().or(z.literal('')),
    motherTongue: z.string().max(50).optional().nullable().or(z.literal('')),
    aadharNumber: z.string().max(20).optional().nullable().or(z.literal('')),
    studentEmail: z.string().email().max(255).optional().nullable().or(z.literal('')),
    studentPhone: z.string().max(20).optional().nullable().or(z.literal('')),
    previousSchool: z.string().max(200).optional().nullable().or(z.literal('')),
    previousMarks: z.string().max(50).optional().nullable().or(z.literal('')),
    subjectsChosen: z.string().max(200).optional().nullable().or(z.literal('')),
    busRoute: z.string().max(100).optional().nullable().or(z.literal('')),
    customData: z.record(z.any()).optional().nullable()
  })
};

/**
 * Dynamic Field Schema in Lead Form
 */
const dynamicFieldSchema = z.object({
  id: z.string().min(1, 'Field ID is required'),
  label: z.string().min(1, 'Field label is required').max(200),
  type: z.enum(validFieldTypes, {
    errorMap: () => ({ message: `Field type must be one of: ${validFieldTypes.join(', ')}` })
  }),
  required: z.boolean().optional().default(false),
  options: z.array(z.string()).optional().default([])
});

/**
 * Create Dynamic Lead Form Schema
 */
export const createLeadFormSchema = {
  body: z.object({
    title: z.string().min(1, 'Form title is required').max(150),
    description: z.string().max(1000).optional().nullable().default(''),
    successMessage: z.string().max(500).optional().nullable().default('Thank you! Your enquiry has been received.'),
    fields: z.array(dynamicFieldSchema, {
      required_error: 'Form fields configuration is required'
    }).min(1, 'Form must contain at least one field'),
    isActive: z.boolean().optional().default(true)
  })
};

/**
 * Update Dynamic Lead Form Schema
 */
export const updateLeadFormSchema = {
  params: z.object({
    id: uuidSchema
  }),
  body: z.object({
    title: z.string().min(1).max(150).optional(),
    description: z.string().max(1000).optional().nullable(),
    successMessage: z.string().max(500).optional().nullable(),
    fields: z.array(dynamicFieldSchema).optional(),
    isActive: z.boolean().optional()
  })
};

/**
 * Update Lead Status Schema
 */
export const updateLeadStatusSchema = {
  params: z.object({
    id: uuidSchema
  }),
  body: z.object({
    status: z.enum(validLeadStatuses, {
      errorMap: () => ({ message: `Status must be one of: ${validLeadStatuses.join(', ')}` })
    })
  })
};

/**
 * Update Application Status Schema
 */
export const updateApplicationStatusSchema = {
  params: z.object({
    id: uuidSchema
  }),
  body: z.object({
    status: z.enum(validApplicationStatuses, {
      errorMap: () => ({ message: `Status must be one of: ${validApplicationStatuses.join(', ')}` })
    }),
    remarks: z.string().max(500).optional().nullable()
  })
};

/**
 * Enroll Application to Student Schema
 */
export const enrollApplicationSchema = {
  params: z.object({
    id: uuidSchema
  }),
  body: z.object({
    admissionNumber: z.string().min(1, 'Admission number is required').max(100),
    classId: uuidSchema,
    sectionId: uuidSchema.optional().nullable(),
    rollNumber: z.string().max(50).optional().nullable()
  })
};

/**
 * List Leads Query Schema
 */
export const listLeadsQuerySchema = {
  query: z.object({
    status: z.string().optional(),
    formId: z.string().optional(),
    search: z.string().optional(),
    startDate: z.string().regex(dateRegex, 'startDate must be YYYY-MM-DD').optional(),
    endDate: z.string().regex(dateRegex, 'endDate must be YYYY-MM-DD').optional(),
    page: z.coerce.number().int().positive().optional().default(1),
    limit: z.coerce.number().int().positive().max(500).optional().default(50),
    sort: z.string().optional().default('submittedAt'),
    order: z.enum(['asc', 'desc']).optional().default('desc')
  })
};

/**
 * List Lead Forms Query Schema
 */
export const listFormsQuerySchema = {
  query: z.object({
    isActive: z.enum(['true', 'false']).optional(),
    search: z.string().optional(),
    page: z.coerce.number().int().positive().optional().default(1),
    limit: z.coerce.number().int().positive().max(100).optional().default(50),
    sort: z.string().optional().default('createdAt'),
    order: z.enum(['asc', 'desc']).optional().default('desc')
  })
};

/**
 * List Admission Applications Query Schema
 */
export const listApplicationsQuerySchema = {
  query: z.object({
    status: z.string().optional(),
    classId: z.string().optional(),
    search: z.string().optional(),
    startDate: z.string().regex(dateRegex, 'startDate must be YYYY-MM-DD').optional(),
    endDate: z.string().regex(dateRegex, 'endDate must be YYYY-MM-DD').optional(),
    page: z.coerce.number().int().positive().optional().default(1),
    limit: z.coerce.number().int().positive().max(500).optional().default(50),
    sort: z.string().optional().default('submittedAt'),
    order: z.enum(['asc', 'desc']).optional().default('desc')
  })
};
