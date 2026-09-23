import { z } from 'zod';
import { REGEX } from '../../config/constants.js';

/**
 * Valid notification sort fields
 */
export const NOTIFICATION_SORT_FIELDS = ['createdAt', 'date'];

/**
 * Valid notification types
 */
export const NOTIFICATION_TYPES = [
  'attendance_pending',
  'leave_submitted',
  'absentee_flagged',
  'general',
  'system',
  'announcement',
  'fee_reminder',
  'ptm_scheduled',
  'homework_assigned'
];

/**
 * Schema for listing notifications (with bounded pagination, validated filters, and sort allowlist)
 */
export const listNotificationsSchema = {
  query: z.object({
    unread: z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .transform(val => (typeof val === 'string' ? val === 'true' : val))
      .optional(),
    type: z.string().trim().max(50).optional(),
    date: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)')
      .optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    sort: z.enum(NOTIFICATION_SORT_FIELDS).default('createdAt'),
    order: z.enum(['asc', 'desc']).default('desc')
  })
};

/**
 * Schema for retrieving unread notification count
 */
export const getUnreadCountSchema = {
  query: z.object({
    type: z.string().trim().max(50).optional()
  })
};

/**
 * Schema for getting a notification by ID
 */
export const getNotificationByIdSchema = {
  params: z.object({
    id: z
      .string({ required_error: 'Notification ID is required' })
      .regex(REGEX.UUID, 'Invalid notification ID format')
  })
};

/**
 * Schema for marking a single notification as read
 */
export const markNotificationReadSchema = {
  params: z.object({
    id: z
      .string({ required_error: 'Notification ID is required' })
      .regex(REGEX.UUID, 'Invalid notification ID format')
  })
};

/**
 * Schema for marking all notifications as read
 */
export const markAllReadSchema = {
  body: z
    .object({
      type: z.string().trim().max(50).optional()
    })
    .optional()
};

/**
 * Schema for deleting a notification
 */
export const deleteNotificationSchema = {
  params: z.object({
    id: z
      .string({ required_error: 'Notification ID is required' })
      .regex(REGEX.UUID, 'Invalid notification ID format')
  })
};
