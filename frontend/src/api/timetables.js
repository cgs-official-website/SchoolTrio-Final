import { apiClient } from './client.js';

export const DAY_NAMES = Object.freeze([
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday'
]);

export const DAY_OF_WEEK_MAP = Object.freeze({
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6
});

const ALLOWED_QUERY_KEYS = ['classId', 'teacherId', 'subjectId', 'sectionId', 'dayOfWeek'];

/**
 * Normalizes day string or number into 1..6 (Monday..Saturday).
 * Returns null for Sunday (7) or any invalid day.
 *
 * @param {string|number} val
 * @returns {number|null}
 */
export function normalizeDayOfWeek(val) {
  if (typeof val === 'number' && Number.isInteger(val) && val >= 1 && val <= 6) {
    return val;
  }
  if (typeof val === 'string') {
    const parsed = parseInt(val, 10);
    if (!Number.isNaN(parsed) && parsed >= 1 && parsed <= 6) {
      return parsed;
    }
    const titleCase = val.charAt(0).toUpperCase() + val.slice(1).toLowerCase();
    if (DAY_OF_WEEK_MAP[titleCase]) {
      return DAY_OF_WEEK_MAP[titleCase];
    }
  }
  return null;
}

/**
 * Builds a clean query string from strictly allowlisted parameters.
 *
 * @param {Object} [params={}] - Key-value map of query parameters
 * @returns {string} Formatted query string or empty string
 */
function buildQueryString(params = {}) {
  if (!params || typeof params !== 'object') return '';
  const searchParams = new URLSearchParams();
  for (const key of ALLOWED_QUERY_KEYS) {
    let value = params[key];
    if (key === 'dayOfWeek' && value !== undefined && value !== null && value !== '') {
      const normalizedDay = normalizeDayOfWeek(value);
      if (normalizedDay !== null) {
        searchParams.append(key, String(normalizedDay));
      }
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
 * Lists timetable periods matching query filters.
 * Calls GET /api/v1/timetables.
 *
 * @param {Object} [query={}] - Optional filters ({ classId, teacherId, subjectId, sectionId, dayOfWeek })
 * @returns {Promise<{ status: string, data: Array<Object> }>}
 */
export async function listTimetables(query = {}) {
  const qs = buildQueryString(query);
  return apiClient(`/api/v1/timetables${qs}`, {
    method: 'GET'
  });
}

/**
 * Retrieves the structured weekly timetable for a specific class.
 * Calls GET /api/v1/timetables/classes/:classId.
 *
 * @param {string} classId - Class UUID
 * @returns {Promise<{ status: string, data: Object }>}
 */
export async function getClassTimetable(classId) {
  if (!classId) {
    throw new Error('Class ID is required to fetch class timetable');
  }
  return apiClient(`/api/v1/timetables/classes/${encodeURIComponent(classId)}`, {
    method: 'GET'
  });
}

/**
 * Atomically replaces the entire weekly timetable for a class.
 * Calls PUT /api/v1/timetables/classes/:classId.
 *
 * @param {string} classId - Class UUID
 * @param {Object} payload - { schedule: { Monday: [...] }, customData?: {} }
 * @returns {Promise<{ status: string, message: string, data: Object }>}
 */
export async function replaceClassTimetable(classId, payload = {}) {
  if (!classId) {
    throw new Error('Class ID is required to update class timetable');
  }
  return apiClient(`/api/v1/timetables/classes/${encodeURIComponent(classId)}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
}

/**
 * Creates a single timetable period.
 * Calls POST /api/v1/timetables.
 *
 * @param {Object} payload - { classId, sectionId, subjectId, teacherId, dayOfWeek, periodNumber, startTime, endTime, roomNumber }
 * @returns {Promise<{ status: string, message: string, data: Object }>}
 */
export async function createTimetablePeriod(payload = {}) {
  return apiClient('/api/v1/timetables', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

/**
 * Updates a single timetable period.
 * Calls PATCH /api/v1/timetables/:id.
 *
 * @param {string} id - Timetable Period UUID
 * @param {Object} payload - Partial period fields
 * @returns {Promise<{ status: string, message: string, data: Object }>}
 */
export async function updateTimetablePeriod(id, payload = {}) {
  if (!id) {
    throw new Error('Timetable Period ID is required for update');
  }
  return apiClient(`/api/v1/timetables/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

/**
 * Deletes a single timetable period.
 * Calls DELETE /api/v1/timetables/:id.
 *
 * @param {string} id - Timetable Period UUID
 * @returns {Promise<{ status: string, message: string, data: { id: string } }>}
 */
export async function deleteTimetablePeriod(id) {
  if (!id) {
    throw new Error('Timetable Period ID is required for deletion');
  }
  return apiClient(`/api/v1/timetables/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
}

/**
 * Retrieves the authenticated teacher's subject schedule and class teacher schedule.
 * Calls GET /api/v1/timetables/my-schedule.
 *
 * @returns {Promise<{ status: string, data: Object }>}
 */
export async function getMyTimetable() {
  return apiClient('/api/v1/timetables/my-schedule', {
    method: 'GET'
  });
}
