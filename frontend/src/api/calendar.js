/**
 * src/api/calendar.js
 *
 * Academic Calendar API client module communicating with the PostgreSQL REST backend.
 * Uses the centralized HTTP client with automatic JWT token injection and tenant context.
 */

import { apiClient } from './client.js';

const ALLOWED_CALENDAR_QUERY_KEYS = ['startDate', 'endDate', 'type', 'audience', 'limit', 'page'];

/**
 * Builds a clean query string from an allowlist of permitted keys.
 *
 * @param {Object} [params={}] - Key-value map of query parameters
 * @param {Array<string>} [allowedKeys=ALLOWED_CALENDAR_QUERY_KEYS] - Array of allowed key names
 * @returns {string} Formatted query string with leading '?' or empty string
 */
function buildQueryString(params = {}, allowedKeys = ALLOWED_CALENDAR_QUERY_KEYS) {
  if (!params || typeof params !== 'object') return '';
  const searchParams = new URLSearchParams();
  for (const key of allowedKeys) {
    const value = params[key];
    if (value !== undefined && value !== null && value !== '') {
      searchParams.append(key, String(value));
    }
  }
  const qs = searchParams.toString();
  return qs ? `?${qs}` : '';
}

/**
 * Lists calendar events with optional filtering (startDate, endDate, type, audience, limit, page).
 * Calls GET /api/v1/calendar/events.
 *
 * @param {Object} [params={}] - Query options
 * @returns {Promise<{ success: boolean, data: Array<Object>, total: number, page: number, limit: number }>}
 */
export async function listEvents(params = {}) {
  const qs = buildQueryString(params);
  return apiClient(`/api/v1/calendar/events${qs}`, {
    method: 'GET'
  });
}

/**
 * Retrieves a single calendar event by ID.
 * Calls GET /api/v1/calendar/events/:id.
 *
 * @param {string} id - Calendar event UUID
 * @returns {Promise<{ success: boolean, data: Object }>}
 */
export async function getEvent(id) {
  return apiClient(`/api/v1/calendar/events/${encodeURIComponent(id)}`, {
    method: 'GET'
  });
}

/**
 * Creates a new calendar event.
 * Calls POST /api/v1/calendar/events.
 *
 * @param {Object} payload - { title, date, endDate?, type, description?, audience? }
 * @returns {Promise<{ success: boolean, data: Object }>}
 */
export async function createEvent(payload) {
  return apiClient('/api/v1/calendar/events', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

/**
 * Updates an existing calendar event.
 * Calls PATCH /api/v1/calendar/events/:id.
 *
 * @param {string} id - Calendar event UUID
 * @param {Object} payload - { title?, date?, endDate?, type?, description?, audience? }
 * @returns {Promise<{ success: boolean, data: Object }>}
 */
export async function updateEvent(id, payload) {
  return apiClient(`/api/v1/calendar/events/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

/**
 * Deletes a calendar event by ID.
 * Calls DELETE /api/v1/calendar/events/:id.
 *
 * @param {string} id - Calendar event UUID
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export async function deleteEvent(id) {
  return apiClient(`/api/v1/calendar/events/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
}

// Named Aliases for contract consistency
export const getCalendarEvents = listEvents;
export const getCalendarEventById = getEvent;
export const createCalendarEvent = createEvent;
export const updateCalendarEvent = updateEvent;
export const deleteCalendarEvent = deleteEvent;

export const calendarApi = {
  listEvents,
  getEvent,
  createEvent,
  updateEvent,
  deleteEvent,
  getCalendarEvents,
  getCalendarEventById,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent
};

export default calendarApi;
