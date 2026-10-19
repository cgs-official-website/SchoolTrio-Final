import { z } from 'zod';
import { REGEX } from '../../config/constants.js';

/**
 * Zod validation schemas for Audit Logs endpoints.
 */

const isoDateStringSchema = z
  .string()
  .trim()
  .refine((val) => !isNaN(Date.parse(val)), {
    message: 'Invalid date format. Expected ISO date or datetime string'
  });

export const listTenantAuditLogsSchema = {
  query: z
    .object({
      search: z.string().trim().max(100, 'Search keyword must not exceed 100 characters').optional(),
      entityType: z.string().trim().max(50, 'entityType must not exceed 50 characters').optional(),
      actionPerformed: z.string().trim().max(100, 'actionPerformed must not exceed 100 characters').optional(),
      action: z.string().trim().max(100, 'action must not exceed 100 characters').optional(),
      userName: z.string().trim().max(200, 'userName must not exceed 200 characters').optional(),
      actor: z.string().trim().max(200, 'actor must not exceed 200 characters').optional(),
      startDate: isoDateStringSchema.optional(),
      endDate: isoDateStringSchema.optional(),
      page: z.coerce.number().int('Page must be an integer').min(1, 'Page must be at least 1').optional(),
      limit: z.coerce.number().int('Limit must be an integer').min(1, 'Limit must be at least 1').max(100, 'Limit cannot exceed 100').optional(),
      includeSummary: z.coerce.boolean().optional()
    })
    .refine(
      (data) => {
        if (data.startDate && data.endDate) {
          return new Date(data.startDate).getTime() <= new Date(data.endDate).getTime();
        }
        return true;
      },
      {
        message: 'startDate must be before or equal to endDate',
        path: ['startDate']
      }
    )
};

export const listSuperAdminAuditLogsSchema = {
  query: z
    .object({
      search: z.string().trim().max(100, 'Search keyword must not exceed 100 characters').optional(),
      schoolId: z.string().regex(REGEX.UUID, 'Invalid school ID format').optional(),
      entityType: z.string().trim().max(50, 'entityType must not exceed 50 characters').optional(),
      actionPerformed: z.string().trim().max(100, 'actionPerformed must not exceed 100 characters').optional(),
      action: z.string().trim().max(100, 'action must not exceed 100 characters').optional(),
      userName: z.string().trim().max(200, 'userName must not exceed 200 characters').optional(),
      actor: z.string().trim().max(200, 'actor must not exceed 200 characters').optional(),
      startDate: isoDateStringSchema.optional(),
      endDate: isoDateStringSchema.optional(),
      page: z.coerce.number().int('Page must be an integer').min(1, 'Page must be at least 1').optional(),
      limit: z.coerce.number().int('Limit must be an integer').min(1, 'Limit must be at least 1').max(100, 'Limit cannot exceed 100').optional(),
      includeSummary: z.coerce.boolean().optional()
    })
    .refine(
      (data) => {
        if (data.startDate && data.endDate) {
          return new Date(data.startDate).getTime() <= new Date(data.endDate).getTime();
        }
        return true;
      },
      {
        message: 'startDate must be before or equal to endDate',
        path: ['startDate']
      }
    )
};
