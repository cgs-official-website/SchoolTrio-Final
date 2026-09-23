import { z } from 'zod';

/**
 * Zod validation schemas for Primary Authentication API endpoints.
 */

/**
 * Schema for POST /api/v1/auth/login
 * Evaluates identifier and password without enforcing creation-time complexity.
 */
export const loginSchema = {
  body: z.object({
    identifier: z
      .string({ required_error: 'Identifier (email) is required' })
      .min(1, 'Identifier is required')
      .max(255, 'Identifier must not exceed 255 characters'),
    password: z
      .string({ required_error: 'Password is required' })
      .min(1, 'Password is required')
      .max(128, 'Password must not exceed 128 characters')
  })
};

/**
 * Schema for POST /api/v1/auth/admission-login
 * Evaluates schoolCode, admissionNumber, and password.
 */
export const admissionLoginSchema = {
  body: z.object({
    schoolCode: z
      .string({ required_error: 'School code is required' })
      .min(1, 'School code is required')
      .max(50, 'School code must not exceed 50 characters'),
    admissionNumber: z
      .string({ required_error: 'Admission number is required' })
      .min(1, 'Admission number is required')
      .max(100, 'Admission number must not exceed 100 characters'),
    password: z
      .string({ required_error: 'Password is required' })
      .min(1, 'Password is required')
      .max(128, 'Password must not exceed 128 characters')
  })
};

/**
 * Schema for POST /api/v1/auth/password-reset/request
 */
export const passwordResetRequestSchema = {
  body: z.object({
    email: z
      .string({ required_error: 'Email is required' })
      .email('Invalid email address')
      .max(255, 'Email must not exceed 255 characters')
  })
};

/**
 * Schema for POST /api/v1/auth/password-reset/confirm
 */
export const passwordResetConfirmSchema = {
  body: z.object({
    token: z
      .string({ required_error: 'Token is required' })
      .regex(/^[0-9a-fA-F]{64}$/, 'Token must be a 64-character hexadecimal string'),
    newPassword: z
      .string({ required_error: 'New password is required' })
      .min(8, 'Password must be at least 8 characters long')
      .max(128, 'Password must not exceed 128 characters')
  })
};

/**
 * Schema for POST /api/v1/auth/password-setup/confirm
 */
export const passwordSetupConfirmSchema = {
  body: z.object({
    token: z
      .string({ required_error: 'Token is required' })
      .regex(/^[0-9a-fA-F]{64}$/, 'Token must be a 64-character hexadecimal string'),
    newPassword: z
      .string({ required_error: 'New password is required' })
      .min(8, 'Password must be at least 8 characters long')
      .max(128, 'Password must not exceed 128 characters')
  })
};

/**
 * Schema for POST /api/v1/auth/change-password
 */
export const changePasswordSchema = {
  body: z.object({
    currentPassword: z
      .string({ required_error: 'Current password is required' })
      .min(1, 'Current password is required')
      .max(128, 'Current password must not exceed 128 characters'),
    newPassword: z
      .string({ required_error: 'New password is required' })
      .min(8, 'New password must be at least 8 characters long')
      .max(128, 'New password must not exceed 128 characters')
  })
};

/**
 * Schema for POST /api/v1/auth/firebase-exchange
 */
export const firebaseExchangeSchema = {
  body: z.object({
    idToken: z
      .string({ required_error: 'Firebase ID token is required' })
      .trim()
      .min(1, 'Firebase ID token is required'),
    password: z
      .string()
      .min(1, 'Password must not be empty')
      .max(128, 'Password must not exceed 128 characters')
      .optional()
  })
};




