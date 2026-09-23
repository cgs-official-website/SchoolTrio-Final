import { Router } from 'express';
import * as calendarController from './calendar.controller.js';
import * as calendarSchemas from './calendar.schemas.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { tenantContext } from '../../middleware/tenant.middleware.js';
import { requirePermission } from '../../middleware/rbac.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { SYSTEM_ROLES } from '../../config/constants.js';

/**
 * Custom Authorization Gate for Reading Calendar Events:
 * Allows institutional staff with 'calendar.read' OR authenticated teachers/parents/students.
 */
export const requireCalendarReadOrAudience = (req, res, next) => {
  const user = req.auth || req.user;
  const role = (user?.systemRole || user?.role || '').toUpperCase();
  if (
    role === SYSTEM_ROLES.SUPER_ADMIN ||
    role === SYSTEM_ROLES.SCHOOL_ADMIN ||
    role === SYSTEM_ROLES.PRINCIPAL ||
    role === 'ADMIN' ||
    role === SYSTEM_ROLES.TEACHER ||
    role === 'TEACHER' ||
    role === SYSTEM_ROLES.PARENT ||
    role === 'PARENT' ||
    role === SYSTEM_ROLES.STUDENT ||
    role === 'STUDENT' ||
    user?.loginPanel === 'teacher'
  ) {
    return next();
  }
  return requirePermission('calendar', 'read')(req, res, next);
};

const calendarRouter = Router();

/**
 * 1. List Calendar Events Endpoint
 * GET /api/v1/calendar/events
 */
calendarRouter.get(
  '/events',
  authenticate,
  tenantContext({ requireTenant: true }),
  requireCalendarReadOrAudience,
  validate(calendarSchemas.listCalendarEventsSchema),
  calendarController.listCalendarEvents
);

/**
 * 2. Get Single Calendar Event Endpoint
 * GET /api/v1/calendar/events/:id
 */
calendarRouter.get(
  '/events/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requireCalendarReadOrAudience,
  validate(calendarSchemas.calendarEventIdParamSchema),
  calendarController.getCalendarEventById
);

/**
 * 3. Create Calendar Event Endpoint
 * POST /api/v1/calendar/events
 */
calendarRouter.post(
  '/events',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('calendar', 'create'),
  validate(calendarSchemas.createCalendarEventSchema),
  calendarController.createCalendarEvent
);

/**
 * 4. Update Calendar Event Endpoint
 * PATCH /api/v1/calendar/events/:id
 */
calendarRouter.patch(
  '/events/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('calendar', 'edit'),
  validate(calendarSchemas.updateCalendarEventSchema),
  calendarController.updateCalendarEvent
);

/**
 * 5. Delete Calendar Event Endpoint
 * DELETE /api/v1/calendar/events/:id
 */
calendarRouter.delete(
  '/events/:id',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('calendar', 'delete'),
  validate(calendarSchemas.calendarEventIdParamSchema),
  calendarController.deleteCalendarEvent
);

export { calendarRouter as calendarRoutes };
export default calendarRouter;
