/**
 * src/api/transport.js
 *
 * Transport & Vehicle Fleet API client module communicating with the PostgreSQL REST backend.
 * Uses the centralized HTTP client with automatic JWT token injection and tenant context.
 */

import { apiClient } from './client.js';

const ALLOWED_VEHICLE_QUERY_KEYS = ['status', 'search'];
const ALLOWED_ROUTE_QUERY_KEYS = ['vehicleId', 'search'];
const ALLOWED_ASSIGNMENT_QUERY_KEYS = ['classId', 'routeId', 'search'];

/**
 * Builds a clean query string from an allowlist of permitted keys.
 *
 * @param {Object} [params={}] - Key-value map of query parameters
 * @param {Array<string>} allowedKeys - Array of allowed key names
 * @returns {string} Formatted query string with leading '?' or empty string
 */
function buildQueryString(params = {}, allowedKeys = []) {
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

// ============================================================
// VEHICLES API (5 Endpoints)
// ============================================================

/**
 * Lists vehicles for the active tenant.
 * Calls GET /api/v1/transport/vehicles.
 *
 * @param {Object} [params={}] - Query options (status, search)
 * @returns {Promise<{ status: string, data: Array<Object>, message?: string }>}
 */
export async function listVehicles(params = {}) {
  const qs = buildQueryString(params, ALLOWED_VEHICLE_QUERY_KEYS);
  return apiClient(`/api/v1/transport/vehicles${qs}`, {
    method: 'GET'
  });
}

/**
 * Retrieves a single vehicle by ID.
 * Calls GET /api/v1/transport/vehicles/:id.
 *
 * @param {string} id - Vehicle UUID
 * @returns {Promise<{ status: string, data: Object, message?: string }>}
 */
export async function getVehicle(id) {
  return apiClient(`/api/v1/transport/vehicles/${encodeURIComponent(id)}`, {
    method: 'GET'
  });
}

/**
 * Creates a new transport vehicle.
 * Calls POST /api/v1/transport/vehicles.
 *
 * @param {Object} payload - Vehicle data (registrationNumber, model, capacity, fitnessExpiry, insuranceExpiry, pollutionExpiry, status, customData)
 * @returns {Promise<{ status: string, data: Object, message?: string }>}
 */
export async function createVehicle(payload) {
  return apiClient('/api/v1/transport/vehicles', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

/**
 * Updates an existing transport vehicle.
 * Calls PATCH /api/v1/transport/vehicles/:id.
 *
 * @param {string} id - Vehicle UUID
 * @param {Object} payload - Vehicle update fields
 * @returns {Promise<{ status: string, data: Object, message?: string }>}
 */
export async function updateVehicle(id, payload) {
  return apiClient(`/api/v1/transport/vehicles/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

/**
 * Deletes a transport vehicle.
 * Calls DELETE /api/v1/transport/vehicles/:id.
 *
 * @param {string} id - Vehicle UUID
 * @returns {Promise<{ status: string, data: Object, message?: string }>}
 */
export async function deleteVehicle(id) {
  return apiClient(`/api/v1/transport/vehicles/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
}

// ============================================================
// ROUTES API (5 Endpoints)
// ============================================================

/**
 * Lists routes for the active tenant.
 * Calls GET /api/v1/transport/routes.
 *
 * @param {Object} [params={}] - Query options (vehicleId, search)
 * @returns {Promise<{ status: string, data: Array<Object>, message?: string }>}
 */
export async function listRoutes(params = {}) {
  const qs = buildQueryString(params, ALLOWED_ROUTE_QUERY_KEYS);
  return apiClient(`/api/v1/transport/routes${qs}`, {
    method: 'GET'
  });
}

/**
 * Retrieves a single route by ID with vehicle and stops.
 * Calls GET /api/v1/transport/routes/:id.
 *
 * @param {string} id - Route UUID
 * @returns {Promise<{ status: string, data: Object, message?: string }>}
 */
export async function getRoute(id) {
  return apiClient(`/api/v1/transport/routes/${encodeURIComponent(id)}`, {
    method: 'GET'
  });
}

/**
 * Creates a new transport route.
 * Calls POST /api/v1/transport/routes.
 *
 * @param {Object} payload - Route data (name, routeNumber, vehicleId, driverName, driverPhone, capacity)
 * @returns {Promise<{ status: string, data: Object, message?: string }>}
 */
export async function createRoute(payload) {
  return apiClient('/api/v1/transport/routes', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

/**
 * Updates an existing transport route.
 * Calls PATCH /api/v1/transport/routes/:id.
 *
 * @param {string} id - Route UUID
 * @param {Object} payload - Route update fields
 * @returns {Promise<{ status: string, data: Object, message?: string }>}
 */
export async function updateRoute(id, payload) {
  return apiClient(`/api/v1/transport/routes/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

/**
 * Deletes a transport route.
 * Calls DELETE /api/v1/transport/routes/:id.
 *
 * @param {string} id - Route UUID
 * @returns {Promise<{ status: string, data: Object, message?: string }>}
 */
export async function deleteRoute(id) {
  return apiClient(`/api/v1/transport/routes/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
}

// ============================================================
// ROUTE STOPS API (3 Endpoints)
// ============================================================

/**
 * Adds a stop to a route.
 * Calls POST /api/v1/transport/routes/:routeId/stops.
 *
 * @param {string} routeId - Route UUID
 * @param {Object} payload - Stop data (stopName, pickupTime, dropTime, stopOrder)
 * @returns {Promise<{ status: string, data: Object, message?: string }>}
 */
export async function addRouteStop(routeId, payload) {
  return apiClient(`/api/v1/transport/routes/${encodeURIComponent(routeId)}/stops`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

/**
 * Updates a route stop.
 * Calls PATCH /api/v1/transport/stops/:id.
 *
 * @param {string} id - Stop UUID
 * @param {Object} payload - Stop update fields
 * @returns {Promise<{ status: string, data: Object, message?: string }>}
 */
export async function updateRouteStop(id, payload) {
  return apiClient(`/api/v1/transport/stops/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

/**
 * Deletes a route stop.
 * Calls DELETE /api/v1/transport/stops/:id.
 *
 * @param {string} id - Stop UUID
 * @returns {Promise<{ status: string, data: Object, message?: string }>}
 */
export async function deleteRouteStop(id) {
  return apiClient(`/api/v1/transport/stops/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
}

// ============================================================
// STUDENT TRANSPORT ASSIGNMENTS API (3 Endpoints)
// ============================================================

/**
 * Lists student transport assignments.
 * Calls GET /api/v1/transport/assignments.
 *
 * @param {Object} [params={}] - Query options (classId, routeId, search)
 * @returns {Promise<{ status: string, data: Array<Object>, message?: string }>}
 */
export async function listTransportAssignments(params = {}) {
  const qs = buildQueryString(params, ALLOWED_ASSIGNMENT_QUERY_KEYS);
  return apiClient(`/api/v1/transport/assignments${qs}`, {
    method: 'GET'
  });
}

/**
 * Assigns a student to a route with an optional pickup stop.
 * Calls POST /api/v1/transport/routes/:routeId/assign.
 *
 * @param {string} routeId - Route UUID
 * @param {Object|string} payload - Assignment payload ({ studentId, pickupStopId }) or studentId string
 * @param {string} [pickupStopId] - Optional stop UUID if second arg is studentId string
 * @returns {Promise<{ status: string, data: Object, message?: string }>}
 */
export async function assignStudentToRoute(routeId, payload, pickupStopId) {
  const body = typeof payload === 'object' && payload !== null
    ? payload
    : { studentId: payload, pickupStopId: pickupStopId || null };

  return apiClient(`/api/v1/transport/routes/${encodeURIComponent(routeId)}/assign`, {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

/**
 * Unassigns a student from a route.
 * Calls POST /api/v1/transport/routes/:routeId/unassign.
 *
 * @param {string} routeId - Route UUID
 * @param {Object|string} payload - Unassignment payload ({ studentId }) or studentId string
 * @returns {Promise<{ status: string, data: Object, message?: string }>}
 */
export async function unassignStudentFromRoute(routeId, payload) {
  const body = typeof payload === 'object' && payload !== null
    ? payload
    : { studentId: payload };

  return apiClient(`/api/v1/transport/routes/${encodeURIComponent(routeId)}/unassign`, {
    method: 'POST',
    body: JSON.stringify(body)
  });
}
