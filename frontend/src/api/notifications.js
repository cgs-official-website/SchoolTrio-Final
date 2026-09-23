/**
 * src/api/notifications.js
 *
 * Centralized Notifications API client module communicating with the PostgreSQL REST backend.
 * Uses the centralized HTTP client with automatic JWT token injection,
 * HttpOnly cookie refresh handling, and tenant context.
 */

import { apiClient } from './client.js';

const ALLOWED_LIST_PARAMS = new Set([
  'unread',
  'type',
  'date',
  'page',
  'limit',
  'sort',
  'order'
]);

const ALLOWED_UNREAD_PARAMS = new Set(['type']);

/**
 * Builds a clean query string omitting null, undefined, empty string values,
 * and filtering only allowed query parameters.
 *
 * @param {Object} [params={}] - Key-value map of query parameters
 * @param {Set<string>} [allowedKeys] - Optional Set of allowed parameter names
 * @returns {string} Formatted query string or empty string
 */
function buildQueryString(params = {}, allowedKeys = null) {
  if (!params || typeof params !== 'object') return '';
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (allowedKeys && !allowedKeys.has(key)) {
      continue;
    }
    if (value !== undefined && value !== null && value !== '') {
      searchParams.append(key, String(value));
    }
  }
  const qs = searchParams.toString();
  return qs ? `?${qs}` : '';
}

/**
 * Lists notifications with pagination, sorting, and filters for the authenticated user.
 * Calls GET /api/v1/notifications.
 *
 * Supported query parameters:
 * - unread: boolean | 'true' | 'false'
 * - type: string
 * - date: string (YYYY-MM-DD)
 * - page: number (default 1)
 * - limit: number (default 50, max 100)
 * - sort: 'createdAt' | 'date' (default 'createdAt')
 * - order: 'asc' | 'desc' (default 'desc')
 *
 * @param {Object} [query={}] - Optional query filters and pagination
 * @returns {Promise<{ success: boolean, data: Array<Object>, pagination: Object }>}
 */
export async function listNotifications(query = {}) {
  const qs = buildQueryString(query, ALLOWED_LIST_PARAMS);
  return apiClient(`/api/v1/notifications${qs}`, {
    method: 'GET'
  });
}

/**
 * Gets total unread notification count for the authenticated user.
 * Calls GET /api/v1/notifications/unread-count.
 *
 * Optional query parameters:
 * - type: string
 *
 * @param {Object} [query={}] - Optional filters ({ type? })
 * @returns {Promise<{ success: boolean, data: { count: number } }>}
 */
export async function getUnreadNotificationCount(query = {}) {
  const qs = buildQueryString(query, ALLOWED_UNREAD_PARAMS);
  return apiClient(`/api/v1/notifications/unread-count${qs}`, {
    method: 'GET'
  });
}

/**
 * Retrieves a single notification record by ID.
 * Calls GET /api/v1/notifications/:id.
 *
 * @param {string} id - PostgreSQL Notification UUID
 * @returns {Promise<{ success: boolean, data: Object }>}
 */
export async function getNotificationById(id) {
  return apiClient(`/api/v1/notifications/${encodeURIComponent(id)}`, {
    method: 'GET'
  });
}

export const getNotification = getNotificationById;

/**
 * Marks a single notification as read.
 * Calls PATCH /api/v1/notifications/:id/read.
 *
 * @param {string} id - PostgreSQL Notification UUID
 * @returns {Promise<{ success: boolean, data: Object }>}
 */
export async function markNotificationRead(id) {
  return apiClient(`/api/v1/notifications/${encodeURIComponent(id)}/read`, {
    method: 'PATCH'
  });
}

/**
 * Marks all unread notifications as read for the authenticated user.
 * Calls PATCH /api/v1/notifications/read-all.
 *
 * Optional payload:
 * - type: string (mark only notifications of this type)
 *
 * @param {Object} [payload] - Optional payload ({ type? })
 * @returns {Promise<{ success: boolean, data: { count: number } }>}
 */
export async function markAllNotificationsRead(payload) {
  const options = {
    method: 'PATCH'
  };
  if (payload && typeof payload === 'object' && Object.keys(payload).length > 0) {
    options.body = JSON.stringify(payload);
  }
  return apiClient('/api/v1/notifications/read-all', options);
}

/**
 * Deletes a notification by ID.
 * Calls DELETE /api/v1/notifications/:id.
 *
 * @param {string} id - PostgreSQL Notification UUID
 * @returns {Promise<{ success: boolean, data: { id: string } }>}
 */
export async function deleteNotification(id) {
  return apiClient(`/api/v1/notifications/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
}

export const notificationsApi = {
  listNotifications,
  getUnreadNotificationCount,
  getNotificationById,
  getNotification,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification
};

export default notificationsApi;
