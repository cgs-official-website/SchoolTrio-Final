import * as calendarRepository from './calendar.repository.js';
import { createAuditLog } from '../audit/audit.repository.js';
import { SYSTEM_ROLES } from '../../config/constants.js';
import {
  ValidationError,
  NotFoundError,
  ForbiddenError
} from '../../utils/app-error.js';

/**
 * Checks whether the actor is an administrator for the tenant.
 *
 * @param {Object} actor
 * @returns {boolean}
 */
export function isTenantAdmin(actor) {
  const role = (actor?.systemRole || actor?.role || '').toUpperCase();
  return (
    role === SYSTEM_ROLES.SUPER_ADMIN ||
    role === SYSTEM_ROLES.SCHOOL_ADMIN ||
    role === SYSTEM_ROLES.PRINCIPAL ||
    role === 'ADMIN'
  );
}

/**
 * Maps a raw AcademicCalendarEvent database record to a clean client DTO.
 *
 * @param {Object|null} record
 * @returns {Object|null}
 */
export function formatCalendarEventDto(record) {
  if (!record) return null;
  return {
    id: record.id,
    schoolId: record.schoolId,
    title: record.title,
    date: record.date,
    endDate: record.endDate || record.date,
    type: record.type,
    description: record.description || null,
    audience: record.audience || 'all',
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

/**
 * Lists calendar events for the tenant with optional filtering.
 *
 * @param {string} schoolId - Validated School UUID from tenant context
 * @param {Object} actor - Authenticated user context
 * @param {Object} [query={}] - Query parameters
 * @returns {Promise<{ data: Array<Object>, total: number }>}
 */
export async function listCalendarEvents(schoolId, actor, query = {}) {
  if (!schoolId) {
    throw new ValidationError('Tenant context required: schoolId is missing');
  }

  const { startDate, endDate, type, audience, limit = 200, page = 1 } = query;
  const skip = (page - 1) * limit;

  // Determine effective audience filter
  let effectiveAudience = audience;
  const isAdmin = isTenantAdmin(actor);

  if (!isAdmin && !effectiveAudience) {
    const role = (actor?.systemRole || actor?.role || '').toUpperCase();
    if (role === SYSTEM_ROLES.TEACHER || role === 'TEACHER') {
      effectiveAudience = ['all', 'teachers'];
    } else if (role === SYSTEM_ROLES.PARENT || role === 'PARENT') {
      effectiveAudience = ['all', 'parents', 'students'];
    } else if (role === SYSTEM_ROLES.STUDENT || role === 'STUDENT') {
      effectiveAudience = ['all', 'students'];
    }
  }

  const { data, total } = await calendarRepository.listCalendarEvents(schoolId, {
    startDate,
    endDate,
    type,
    audience: effectiveAudience,
    skip,
    take: limit
  });

  return {
    data: data.map(formatCalendarEventDto),
    total,
    page,
    limit
  };
}

/**
 * Retrieves a single calendar event by ID.
 *
 * @param {string} schoolId - Validated School UUID
 * @param {Object} actor - Authenticated user context
 * @param {string} id - Event UUID
 * @returns {Promise<Object>}
 */
export async function getCalendarEventById(schoolId, actor, id) {
  if (!schoolId) {
    throw new ValidationError('Tenant context required: schoolId is missing');
  }
  if (!id) {
    throw new ValidationError('Event ID is required');
  }

  const event = await calendarRepository.findCalendarEventById(schoolId, id);
  if (!event) {
    throw new NotFoundError('AcademicCalendarEvent');
  }

  return formatCalendarEventDto(event);
}

/**
 * Creates a new calendar event for the tenant.
 *
 * @param {string} schoolId - Validated School UUID
 * @param {Object} actor - Authenticated user context
 * @param {Object} data - Validated creation payload
 * @returns {Promise<Object>}
 */
export async function createCalendarEvent(schoolId, actor, data) {
  if (!schoolId) {
    throw new ValidationError('Tenant context required: schoolId is missing');
  }
  if (!data.title || !data.date || !data.type) {
    throw new ValidationError('Title, date, and type are required');
  }

  const startDate = data.date;
  const endDate = data.endDate || startDate;

  if (endDate < startDate) {
    throw new ValidationError('endDate must be greater than or equal to date');
  }

  const event = await calendarRepository.createCalendarEvent(schoolId, {
    title: data.title.trim(),
    date: startDate,
    endDate,
    type: data.type,
    description: data.description ? data.description.trim() : null,
    audience: data.audience || 'all'
  });

  // Non-blocking audit log
  createAuditLog({
    schoolId,
    entityType: 'AcademicCalendarEvent',
    entityId: event.id,
    actionPerformed: 'CALENDAR_EVENT_CREATED',
    userName: actor.email || actor.name || 'User',
    userRole: actor.systemRole || actor.role || 'ADMIN',
    modifiedFields: {
      title: event.title,
      date: event.date,
      endDate: event.endDate,
      type: event.type,
      audience: event.audience
    }
  }).catch(err => {
    console.error('[CalendarService] Failed to record audit log for create event:', err.message);
  });

  return formatCalendarEventDto(event);
}

/**
 * Updates an existing calendar event.
 *
 * @param {string} schoolId - Validated School UUID
 * @param {Object} actor - Authenticated user context
 * @param {string} id - Event UUID
 * @param {Object} data - Update payload
 * @returns {Promise<Object>}
 */
export async function updateCalendarEvent(schoolId, actor, id, data) {
  if (!schoolId) {
    throw new ValidationError('Tenant context required: schoolId is missing');
  }
  if (!id) {
    throw new ValidationError('Event ID is required');
  }

  const existing = await calendarRepository.findCalendarEventById(schoolId, id);
  if (!existing) {
    throw new NotFoundError('AcademicCalendarEvent');
  }

  const targetDate = data.date !== undefined ? data.date : existing.date;
  let targetEndDate = data.endDate !== undefined ? data.endDate : existing.endDate;

  if (targetEndDate === null) {
    targetEndDate = targetDate;
  } else if (!targetEndDate) {
    targetEndDate = targetDate;
  }

  if (targetEndDate < targetDate) {
    throw new ValidationError('endDate must be greater than or equal to date');
  }

  const updated = await calendarRepository.updateCalendarEvent(schoolId, id, {
    ...(data.title !== undefined && { title: data.title.trim() }),
    ...(data.date !== undefined && { date: data.date }),
    ...(data.endDate !== undefined && { endDate: targetEndDate }),
    ...(data.type !== undefined && { type: data.type }),
    ...(data.description !== undefined && { description: data.description ? data.description.trim() : null }),
    ...(data.audience !== undefined && { audience: data.audience })
  });

  // Non-blocking audit log
  createAuditLog({
    schoolId,
    entityType: 'AcademicCalendarEvent',
    entityId: updated.id,
    actionPerformed: 'CALENDAR_EVENT_UPDATED',
    userName: actor.email || actor.name || 'User',
    userRole: actor.systemRole || actor.role || 'ADMIN',
    modifiedFields: {
      title: updated.title,
      date: updated.date,
      endDate: updated.endDate,
      type: updated.type,
      audience: updated.audience
    }
  }).catch(err => {
    console.error('[CalendarService] Failed to record audit log for update event:', err.message);
  });

  return formatCalendarEventDto(updated);
}

/**
 * Deletes a calendar event within tenant boundary.
 *
 * @param {string} schoolId - Validated School UUID
 * @param {Object} actor - Authenticated user context
 * @param {string} id - Event UUID
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export async function deleteCalendarEvent(schoolId, actor, id) {
  if (!schoolId) {
    throw new ValidationError('Tenant context required: schoolId is missing');
  }
  if (!id) {
    throw new ValidationError('Event ID is required');
  }

  const existing = await calendarRepository.findCalendarEventById(schoolId, id);
  if (!existing) {
    throw new NotFoundError('AcademicCalendarEvent');
  }

  await calendarRepository.deleteCalendarEvent(schoolId, id);

  // Non-blocking audit log
  createAuditLog({
    schoolId,
    entityType: 'AcademicCalendarEvent',
    entityId: id,
    actionPerformed: 'CALENDAR_EVENT_DELETED',
    userName: actor.email || actor.name || 'User',
    userRole: actor.systemRole || actor.role || 'ADMIN',
    modifiedFields: {
      title: existing.title,
      date: existing.date,
      type: existing.type
    }
  }).catch(err => {
    console.error('[CalendarService] Failed to record audit log for delete event:', err.message);
  });

  return {
    success: true,
    message: 'Calendar event deleted successfully'
  };
}

export const calendarService = {
  listCalendarEvents,
  getCalendarEventById,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  formatCalendarEventDto,
  isTenantAdmin
};

export default calendarService;
