/**
 * src/api/classes.js
 *
 * Classes, Sections, and Class Categories API client module communicating with the PostgreSQL backend.
 * Uses the centralized HTTP client with automatic JWT token injection and tenant context.
 */

import { apiClient } from './client.js';

/**
 * Builds a clean query string omitting null, undefined, and empty string values.
 *
 * @param {Object} [params={}] - Key-value map of query parameters
 * @returns {string} Formatted query string or empty string
 */
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
 * Lists classes for the active tenant.
 * Calls GET /api/v1/classes.
 *
 * @param {Object} [query={}] - Query options (search, categoryId, hasTeacher, page, limit, sort, order)
 * @returns {Promise<{ success: boolean, data: Array<Object>, pagination: Object, message?: string }>}
 */
export async function listClasses(query = {}) {
  const qs = buildQueryString(query);
  return apiClient(`/api/v1/classes${qs}`, {
    method: 'GET'
  });
}

/**
 * Retrieves a single class by UUID within tenant scope.
 * Calls GET /api/v1/classes/:id.
 *
 * @param {string} id - PostgreSQL Class UUID
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function getClass(id) {
  return apiClient(`/api/v1/classes/${encodeURIComponent(id)}`, {
    method: 'GET'
  });
}

/**
 * Creates a new class for the active tenant.
 * Calls POST /api/v1/classes.
 *
 * @param {Object} data - Class data ({ name, categoryId, gradeLevel, classTeacherId, defaultSection })
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function createClass(data) {
  return apiClient('/api/v1/classes', {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

/**
 * Updates an existing class by UUID within tenant scope.
 * Calls PATCH /api/v1/classes/:id.
 *
 * @param {string} id - PostgreSQL Class UUID
 * @param {Object} data - Partial class data ({ name, categoryId, gradeLevel, classTeacherId })
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function updateClass(id, data) {
  return apiClient(`/api/v1/classes/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(data)
  });
}

/**
 * Deletes a class by UUID within tenant scope.
 * Calls DELETE /api/v1/classes/:id.
 *
 * @param {string} id - PostgreSQL Class UUID
 * @returns {Promise<{ success: boolean, message?: string }>}
 */
export async function deleteClass(id) {
  return apiClient(`/api/v1/classes/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
}

/**
 * Lists sections for a specific class.
 * Calls GET /api/v1/classes/:classId/sections.
 *
 * @param {string} classId - PostgreSQL Class UUID
 * @returns {Promise<{ success: boolean, data: Array<Object>, message?: string }>}
 */
export async function listSections(classId) {
  return apiClient(`/api/v1/classes/${encodeURIComponent(classId)}/sections`, {
    method: 'GET'
  });
}

/**
 * Creates a section for a specific class.
 * Calls POST /api/v1/classes/:classId/sections.
 *
 * @param {string} classId - PostgreSQL Class UUID
 * @param {Object} data - Section data ({ name, capacity, roomNumber })
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function createSection(classId, data) {
  return apiClient(`/api/v1/classes/${encodeURIComponent(classId)}/sections`, {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

/**
 * Updates a section within a class.
 * Calls PATCH /api/v1/classes/:classId/sections/:sectionId.
 *
 * @param {string} classId - PostgreSQL Class UUID
 * @param {string} sectionId - PostgreSQL Section UUID
 * @param {Object} data - Section update data ({ name })
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function updateSection(classId, sectionId, data) {
  return apiClient(`/api/v1/classes/${encodeURIComponent(classId)}/sections/${encodeURIComponent(sectionId)}`, {
    method: 'PATCH',
    body: JSON.stringify(data)
  });
}

/**
 * Deletes a section within a class.
 * Calls DELETE /api/v1/classes/:classId/sections/:sectionId.
 *
 * @param {string} classId - PostgreSQL Class UUID
 * @param {string} sectionId - PostgreSQL Section UUID
 * @returns {Promise<{ success: boolean, message?: string }>}
 */
export async function deleteSection(classId, sectionId) {
  return apiClient(`/api/v1/classes/${encodeURIComponent(classId)}/sections/${encodeURIComponent(sectionId)}`, {
    method: 'DELETE'
  });
}

/**
 * Lists class categories for the active tenant.
 * Calls GET /api/v1/class-categories.
 *
 * @param {Object} [query={}] - Query options
 * @returns {Promise<{ success: boolean, data: Array<Object>, message?: string }>}
 */
export async function listClassCategories(query = {}) {
  const qs = buildQueryString(query);
  return apiClient(`/api/v1/class-categories${qs}`, {
    method: 'GET'
  });
}

/**
 * Creates a custom class category.
 * Calls POST /api/v1/class-categories.
 *
 * @param {Object} data - Category data ({ name, displayOrder })
 * @returns {Promise<{ success: boolean, data: Object, message?: string }>}
 */
export async function createClassCategory(data) {
  return apiClient('/api/v1/class-categories', {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

/**
 * Deletes a class category by UUID.
 * Calls DELETE /api/v1/class-categories/:id.
 *
 * @param {string} id - PostgreSQL Category UUID
 * @returns {Promise<{ success: boolean, message?: string }>}
 */
export async function deleteClassCategory(id) {
  return apiClient(`/api/v1/class-categories/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
}

export const classesApi = {
  listClasses,
  getClass,
  createClass,
  updateClass,
  deleteClass,
  listSections,
  createSection,
  updateSection,
  deleteSection,
  listClassCategories,
  createClassCategory,
  deleteClassCategory
};

export default classesApi;
