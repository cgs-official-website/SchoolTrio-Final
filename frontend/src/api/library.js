/**
 * src/api/library.js
 *
 * Library API client module communicating with the PostgreSQL backend.
 * Uses the centralized HTTP client with automatic JWT token injection and tenant context.
 */

import { apiClient } from './client.js';

const ALLOWED_BOOK_QUERY_KEYS = ['search', 'categoryId', 'category', 'availableOnly', 'page', 'limit'];
const ALLOWED_ISSUE_QUERY_KEYS = ['status', 'bookId', 'studentId', 'overdue', 'search', 'page', 'limit'];

/**
 * Builds a clean query string from an allowlist of permitted keys.
 *
 * @param {Object} [params={}] - Key-value map of query parameters
 * @param {Array<string>} [allowedKeys=[]] - Array of allowed key names
 * @returns {string} Formatted query string with leading '?' or empty string
 */
function buildQueryString(params = {}, allowedKeys = []) {
  if (!params || typeof params !== 'object') return '';
  const searchParams = new URLSearchParams();
  const keys = allowedKeys.length > 0 ? allowedKeys : Object.keys(params);

  for (const key of keys) {
    const value = params[key];
    if (value !== undefined && value !== null && value !== '') {
      searchParams.append(key, String(value));
    }
  }
  const qs = searchParams.toString();
  return qs ? `?${qs}` : '';
}

/**
 * Lists library categories for the active tenant.
 * Calls GET /api/v1/library/categories.
 *
 * @returns {Promise<{ status: string, data: Array<Object>, message?: string }>}
 */
export async function listCategories() {
  return apiClient('/api/v1/library/categories', {
    method: 'GET'
  });
}

/**
 * Creates a new library category.
 * Calls POST /api/v1/library/categories.
 *
 * @param {Object} payload - Category payload ({ name: string })
 * @returns {Promise<{ status: string, data: Object, message?: string }>}
 */
export async function createCategory(payload) {
  return apiClient('/api/v1/library/categories', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

/**
 * Lists books with optional search, category, and availability filters.
 * Calls GET /api/v1/library/books.
 *
 * @param {Object} [params={}] - Query options (search, categoryId, category, availableOnly, page, limit)
 * @returns {Promise<{ status: string, data: Array<Object>, pagination: Object, message?: string }>}
 */
export async function listBooks(params = {}) {
  const qs = buildQueryString(params, ALLOWED_BOOK_QUERY_KEYS);
  return apiClient(`/api/v1/library/books${qs}`, {
    method: 'GET'
  });
}

/**
 * Retrieves a single book by UUID.
 * Calls GET /api/v1/library/books/:id.
 *
 * @param {string} id - PostgreSQL LibraryBook UUID
 * @returns {Promise<{ status: string, data: Object, message?: string }>}
 */
export async function getBook(id) {
  return apiClient(`/api/v1/library/books/${encodeURIComponent(id)}`, {
    method: 'GET'
  });
}

/**
 * Catalogs a new book in the library.
 * Calls POST /api/v1/library/books.
 *
 * @param {Object} payload - Book creation payload ({ title, author?, isbn?, category?, categoryId?, totalQuantity?, customData? })
 * @returns {Promise<{ status: string, data: Object, message?: string }>}
 */
export async function createBook(payload) {
  return apiClient('/api/v1/library/books', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

/**
 * Updates an existing book's metadata or total quantity.
 * Calls PATCH /api/v1/library/books/:id.
 *
 * @param {string} id - PostgreSQL LibraryBook UUID
 * @param {Object} payload - Book update payload ({ title?, author?, isbn?, category?, categoryId?, totalQuantity?, customData? })
 * @returns {Promise<{ status: string, data: Object, message?: string }>}
 */
export async function updateBook(id, payload) {
  return apiClient(`/api/v1/library/books/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

/**
 * Deletes a book record if no issues exist.
 * Calls DELETE /api/v1/library/books/:id.
 *
 * @param {string} id - PostgreSQL LibraryBook UUID
 * @returns {Promise<{ status: string, data: null, message?: string }>}
 */
export async function deleteBook(id) {
  return apiClient(`/api/v1/library/books/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
}

/**
 * Lists book issue records with optional filtering.
 * Calls GET /api/v1/library/issues.
 *
 * @param {Object} [params={}] - Query options (status, bookId, studentId, overdue, search, page, limit)
 * @returns {Promise<{ status: string, data: Array<Object>, pagination: Object, message?: string }>}
 */
export async function listIssues(params = {}) {
  const qs = buildQueryString(params, ALLOWED_ISSUE_QUERY_KEYS);
  return apiClient(`/api/v1/library/issues${qs}`, {
    method: 'GET'
  });
}

/**
 * Issues a book to an active student.
 * Calls POST /api/v1/library/issues.
 *
 * @param {Object} payload - Issue payload ({ bookId, studentId, dueDate })
 * @returns {Promise<{ status: string, data: Object, message?: string }>}
 */
export async function issueBook(payload) {
  return apiClient('/api/v1/library/issues', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

/**
 * Marks an issued book as returned.
 * Calls POST /api/v1/library/issues/:id/return.
 *
 * @param {string} id - PostgreSQL LibraryBookIssue UUID
 * @returns {Promise<{ status: string, data: Object, message?: string }>}
 */
export async function returnBook(id) {
  return apiClient(`/api/v1/library/issues/${encodeURIComponent(id)}/return`, {
    method: 'POST'
  });
}

export const libraryApi = {
  listCategories,
  createCategory,
  listBooks,
  getBook,
  createBook,
  updateBook,
  deleteBook,
  listIssues,
  issueBook,
  returnBook
};

export default libraryApi;
