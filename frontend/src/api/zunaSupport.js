/**
 * src/api/zunaSupport.js
 *
 * Client for the Zuna Central Support Desk bridge (GET/POST /api/v1/zuna-support/tickets).
 * The School backend forwards these calls to Zuna's external product API using the
 * server-side API key, so no secret ever reaches the browser.
 */

import { apiClient } from './client.js';

function buildQueryString(params = {}) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params || {})) {
        if (value !== undefined && value !== null && value !== '') {
            searchParams.append(key, String(value));
        }
    }
    const qs = searchParams.toString();
    return qs ? `?${qs}` : '';
}

export const zunaSupportApi = {
    /** Tickets raised by the logged-in user (status comes live from Zuna). */
    listTickets(query = {}) {
        return apiClient(`/api/v1/zuna-support/tickets${buildQueryString(query)}`, { method: 'GET' });
    },

    /** Raise a ticket. Body: { subject, description, priority }. */
    createTicket(payload) {
        return apiClient('/api/v1/zuna-support/tickets', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    },

    /** One ticket with the full conversation (client messages + Zuna replies). */
    getTicket(ticketId) {
        return apiClient(`/api/v1/zuna-support/tickets/${encodeURIComponent(ticketId)}`, { method: 'GET' });
    },

    /** Reply on an existing ticket. */
    addMessage(ticketId, text) {
        return apiClient(`/api/v1/zuna-support/tickets/${encodeURIComponent(ticketId)}/messages`, {
            method: 'POST',
            body: JSON.stringify({ text })
        });
    }
};

export default zunaSupportApi;
