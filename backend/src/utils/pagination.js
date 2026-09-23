import { PAGINATION_DEFAULTS } from '../config/constants.js';

/**
 * Parses and sanitizes query parameters for pagination.
 * Ensures page >= 1 and 1 <= limit <= maxLimit.
 *
 * @param {Object} query - Express request query object (req.query)
 * @param {Object} [options] - Options to override defaults
 * @param {number} [options.defaultLimit=20] - Default limit if not provided
 * @param {number} [options.maxLimit=100] - Hard ceiling for page limit
 * @param {string} [options.defaultSort='createdAt'] - Default sort field
 * @param {string} [options.defaultOrder='desc'] - Default sort order ('asc' | 'desc')
 * @returns {{ page: number, limit: number, skip: number, take: number, sort: string, order: 'asc' | 'desc' }}
 */
export const parsePagination = (query = {}, options = {}) => {
  const defaultLimit = options.defaultLimit || PAGINATION_DEFAULTS.LIMIT;
  const maxLimit = options.maxLimit || PAGINATION_DEFAULTS.MAX_LIMIT;
  const defaultSort = options.defaultSort || PAGINATION_DEFAULTS.SORT;
  const defaultOrder = options.defaultOrder || PAGINATION_DEFAULTS.ORDER;

  // 1. Parse page number (minimum 1)
  const rawPage = parseInt(query.page, 10);
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : PAGINATION_DEFAULTS.PAGE;

  // 2. Parse limit (bounded between 1 and maxLimit)
  const rawLimit = parseInt(query.limit, 10);
  let limit = Number.isInteger(rawLimit) && rawLimit > 0 ? rawLimit : defaultLimit;
  if (limit > maxLimit) {
    limit = maxLimit;
  }

  // 3. Compute offset/skip and take
  const skip = (page - 1) * limit;
  const take = limit;

  // 4. Parse sort field and order
  const sort = typeof query.sort === 'string' && query.sort.trim() ? query.sort.trim() : defaultSort;
  const rawOrder = typeof query.order === 'string' ? query.order.toLowerCase().trim() : '';
  const order = rawOrder === 'asc' || rawOrder === 'desc' ? rawOrder : defaultOrder;

  return {
    page,
    limit,
    skip,
    take,
    sort,
    order
  };
};

/**
 * Builds standard pagination metadata from query results.
 *
 * @param {number} total - Total count of matching records
 * @param {number} page - Current page number
 * @param {number} limit - Items per page
 * @returns {{ page: number, limit: number, total: number, totalPages: number, hasNextPage: boolean, hasPrevPage: boolean }}
 */
export const buildPaginationMetadata = (total = 0, page = 1, limit = 20) => {
  const safeTotal = Math.max(0, parseInt(total, 10) || 0);
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.max(1, parseInt(limit, 10) || 20);
  const totalPages = safeTotal === 0 ? 0 : Math.ceil(safeTotal / safeLimit);

  return {
    page: safePage,
    limit: safeLimit,
    total: safeTotal,
    totalPages,
    hasNextPage: safePage < totalPages,
    hasPrevPage: safePage > 1
  };
};
