import { env } from '../../config/env.js';
import { AppError, ConflictError, NotFoundError, ValidationError } from '../../utils/app-error.js';
import { ERROR_CODES } from '../../config/constants.js';

/**
 * Zuna Central Support Desk client.
 *
 * School talks to Zuna ONLY through Zuna's external product API, authenticated by the
 * secret x-api-key of the "School Management System" product. The key lives in this
 * backend's environment and never reaches the browser.
 *
 * Tickets are tied to the logged-in user by clientEmail (set from the verified JWT user,
 * never from request input), so one user cannot read another user's tickets.
 */

const REQUEST_TIMEOUT_MS = 10000;

const ensureConfigured = () => {
  if (!env.ZUNA_API_URL || !env.ZUNA_API_KEY) {
    throw new AppError(
      'Zuna support desk is not configured. Set ZUNA_API_URL and ZUNA_API_KEY on the server.',
      503,
      ERROR_CODES.SERVICE_UNAVAILABLE
    );
  }
};

const zunaRequest = async (method, path, { query, body } = {}) => {
  ensureConfigured();

  const baseUrl = env.ZUNA_API_URL.replace(/\/+$/, '');
  const qs = query
    ? '?' + new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString()
    : '';
  const url = `${baseUrl}/api/public/tickets${path}${qs === '?' ? '' : qs}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ZUNA_API_KEY
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
  } catch (err) {
    const timedOut = err?.name === 'AbortError';
    throw new AppError(
      timedOut ? 'Zuna support desk timed out. Please try again.' : 'Zuna support desk is unreachable. Please try again later.',
      timedOut ? 504 : 502,
      timedOut ? ERROR_CODES.GATEWAY_TIMEOUT : ERROR_CODES.SERVICE_UNAVAILABLE
    );
  } finally {
    clearTimeout(timer);
  }

  const json = await response.json().catch(() => null);

  if (!response.ok || !json?.success) {
    const message = json?.error?.message || `Zuna support desk responded with HTTP ${response.status}`;
    if (response.status === 404) throw new NotFoundError('Ticket');
    if (response.status === 400) throw new ValidationError(message, json?.error?.details || null);
    if (response.status === 409) throw new ConflictError(message);
    if (response.status === 429) throw new AppError(message, 429, ERROR_CODES.RATE_LIMIT_EXCEEDED);
    // 401 = our API key is wrong/inactive: that is a server configuration problem, not the user's fault
    throw new AppError(
      response.status === 401 ? 'Support desk credentials are invalid. Please contact the platform team.' : message,
      502,
      ERROR_CODES.SERVICE_UNAVAILABLE
    );
  }

  return json;
};

/** Identity sent to Zuna, always derived from the authenticated user. */
const buildIdentity = (user) => {
  const schoolName = user?.school?.name || 'School';
  const personName = user?.staffProfile?.name || '';
  const displayName = personName ? `${personName} (${schoolName})` : schoolName;
  return { email: String(user?.email || '').toLowerCase().trim(), displayName };
};

export const listTickets = async (user, { status, page, limit } = {}) => {
  const { email } = buildIdentity(user);
  const json = await zunaRequest('GET', '', { query: { clientEmail: email, status, page, limit } });
  return { tickets: json.data, meta: json.meta };
};

export const createTicket = async (user, { subject, description, priority }) => {
  const { email, displayName } = buildIdentity(user);
  const json = await zunaRequest('POST', '', {
    body: { clientName: displayName, clientEmail: email, subject, description, priority }
  });
  return json.data; // { ticketId }
};

export const getTicket = async (user, ticketId) => {
  const { email } = buildIdentity(user);
  const json = await zunaRequest('GET', `/${encodeURIComponent(ticketId)}`, { query: { clientEmail: email } });
  return json.data;
};

export const addMessage = async (user, ticketId, { text }) => {
  const { email, displayName } = buildIdentity(user);
  const json = await zunaRequest('POST', `/${encodeURIComponent(ticketId)}/messages`, {
    body: { authorName: displayName, clientEmail: email, text }
  });
  return json.data;
};
