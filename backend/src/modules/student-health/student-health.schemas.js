import { z } from 'zod';
import { REGEX } from '../../config/constants.js';
import { BLOOD_GROUPS } from '../students/student.schemas.js';

/**
 * Strict Zod validation schemas for Student Health REST API endpoints.
 */

export const studentHealthParamsSchema = {
  params: z.object({
    id: z
      .string({ required_error: 'Student ID is required' })
      .regex(REGEX.UUID, 'Invalid student ID format')
  })
};

export const updateStudentHealthSchema = {
  params: z.object({
    id: z
      .string({ required_error: 'Student ID is required' })
      .regex(REGEX.UUID, 'Invalid student ID format')
  }),
  body: z
    .object({
      bloodGroup: z
        .enum(BLOOD_GROUPS, {
          errorMap: () => ({ message: `Blood group must be one of: ${BLOOD_GROUPS.join(', ')}` })
        })
        .nullable()
        .optional(),
      allergies: z
        .array(
          z
            .string()
            .trim()
            .min(1, 'Allergy name cannot be empty')
            .max(100, 'Allergy item cannot exceed 100 characters')
        )
        .max(20, 'Cannot exceed 20 allergy items')
        .optional(),
      medicalConditions: z
        .array(
          z
            .string()
            .trim()
            .min(1, 'Medical condition name cannot be empty')
            .max(100, 'Condition item cannot exceed 100 characters')
        )
        .max(20, 'Cannot exceed 20 condition items')
        .optional(),
      medications: z
        .array(
          z
            .string()
            .trim()
            .min(1, 'Medication name cannot be empty')
            .max(100, 'Medication item cannot exceed 100 characters')
        )
        .max(20, 'Cannot exceed 20 medication items')
        .optional(),
      emergencyContactName: z
        .string()
        .trim()
        .max(100, 'Emergency contact name cannot exceed 100 characters')
        .nullable()
        .optional(),
      emergencyContactPhone: z
        .string()
        .trim()
        .max(20, 'Emergency contact phone cannot exceed 20 characters')
        .nullable()
        .optional(),
      doctorName: z
        .string()
        .trim()
        .max(100, 'Doctor name cannot exceed 100 characters')
        .nullable()
        .optional(),
      doctorPhone: z
        .string()
        .trim()
        .max(20, 'Doctor phone cannot exceed 20 characters')
        .nullable()
        .optional(),
      notes: z
        .string()
        .trim()
        .max(2000, 'Health notes cannot exceed 2000 characters')
        .nullable()
        .optional()
    })
    .strict('Unknown fields are not allowed in health update payload')
    .refine(
      (data) => Object.keys(data).length > 0,
      'At least one health field must be provided for update'
    )
};
