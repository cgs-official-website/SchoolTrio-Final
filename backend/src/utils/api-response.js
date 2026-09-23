import { HTTP_STATUS } from '../config/constants.js';

/**
 * Standardized API Response Helper
 */
export class ApiResponse {
  /**
   * Sends a standard successful JSON response.
   * @param {import('express').Response} res - Express response object
   * @param {any} data - Data payload
   * @param {string} [message] - Optional success message
   * @param {number} [statusCode=200] - HTTP status code
   */
  static success(res, data = null, message = null, statusCode = HTTP_STATUS.OK) {
    const payload = {
      success: true,
      ...(message && { message }),
      data
    };
    return res.status(statusCode).json(payload);
  }

  /**
   * Sends a standard paginated successful JSON response.
   * @param {import('express').Response} res - Express response object
   * @param {Array} data - Array of data items
   * @param {Object} pagination - Pagination metadata object
   * @param {number} pagination.page - Current page number
   * @param {number} pagination.limit - Page size limit
   * @param {number} pagination.total - Total items matching query
   * @param {number} pagination.totalPages - Total calculated pages
   * @param {boolean} [pagination.hasNextPage] - Whether next page exists
   * @param {boolean} [pagination.hasPrevPage] - Whether previous page exists
   * @param {string} [message] - Optional success message
   * @param {number} [statusCode=200] - HTTP status code
   */
  static paginated(res, data = [], pagination = {}, message = null, statusCode = HTTP_STATUS.OK) {
    const payload = {
      success: true,
      ...(message && { message }),
      data,
      pagination: {
        page: Number(pagination.page) || 1,
        limit: Number(pagination.limit) || 20,
        total: Number(pagination.total) || 0,
        totalPages: Number(pagination.totalPages) || (pagination.limit ? Math.ceil(pagination.total / pagination.limit) : 1),
        hasNextPage: pagination.hasNextPage ?? ((pagination.page * pagination.limit) < pagination.total),
        hasPrevPage: pagination.hasPrevPage ?? (pagination.page > 1)
      }
    };
    return res.status(statusCode).json(payload);
  }
}
