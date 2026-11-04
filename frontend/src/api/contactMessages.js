/**
 * src/api/contactMessages.js
 *
 * API client module for Public Contact Form submissions and SuperAdmin
 * Contact Messages & Responses management.
 */

import { apiClient } from './client.js';

function buildQueryString(params = {}) {
  if (!params || typeof params !== 'object') return '';
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.append(key, String(value));
    }
  }
  const qs = searchParams.toString();
  return qs ? `?${qs}` : '';
}

/**
 * Submits a contact inquiry from the public website.
 * Calls POST /api/v1/public/contact-messages
 *
 * @param {Object} data - { name, email, message, subject? }
 * @returns {Promise<Object>}
 */
export async function submitContactMessage(data) {
  return apiClient('/api/v1/public/contact-messages', {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

/**
 * Retrieves paginated contact messages and KPI summary stats for SuperAdmin.
 * Calls GET /api/v1/superadmin/contact-messages
 *
 * @param {Object} [query={}] - { search, status, sortBy, sortOrder, page, limit }
 * @returns {Promise<Object>}
 */
export async function getContactMessages(query = {}) {
  const qs = buildQueryString(query);
  return apiClient(`/api/v1/superadmin/contact-messages${qs}`, {
    method: 'GET'
  });
}

/**
 * Retrieves full details and reply thread for a single message.
 * Calls GET /api/v1/superadmin/contact-messages/:id
 *
 * @param {string} id - Message UUID
 * @returns {Promise<Object>}
 */
export async function getContactMessage(id) {
  return apiClient(`/api/v1/superadmin/contact-messages/${id}`, {
    method: 'GET'
  });
}

/**
 * Updates status of a contact message (e.g. 'read', 'in_progress', 'closed').
 * Calls PATCH /api/v1/superadmin/contact-messages/:id/status
 *
 * @param {string} id - Message UUID
 * @param {string} status - New status
 * @returns {Promise<Object>}
 */
export async function updateContactMessageStatus(id, status) {
  return apiClient(`/api/v1/superadmin/contact-messages/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status })
  });
}

/**
 * Sends and persists an admin response to a contact message.
 * Calls POST /api/v1/superadmin/contact-messages/:id/reply
 *
 * @param {string} id - Message UUID
 * @param {string} replyText - Admin response text
 * @returns {Promise<Object>}
 */
export async function replyContactMessage(id, replyText) {
  return apiClient(`/api/v1/superadmin/contact-messages/${id}/reply`, {
    method: 'POST',
    body: JSON.stringify({ reply: replyText })
  });
}

