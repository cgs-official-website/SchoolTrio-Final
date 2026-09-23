import { describe, it, expect } from 'vitest';
import { parsePagination, buildPaginationMetadata } from '../../src/utils/pagination.js';

describe('Unit: Pagination Utility', () => {
  it('parsePagination applies default values when query is empty', () => {
    const result = parsePagination({});

    expect(result).toEqual({
      page: 1,
      limit: 20,
      skip: 0,
      take: 20,
      sort: 'createdAt',
      order: 'desc'
    });
  });

  it('parsePagination clamps limit to maxLimit ceiling (100)', () => {
    const result = parsePagination({ limit: '500', page: '2' });

    expect(result.page).toBe(2);
    expect(result.limit).toBe(100);
    expect(result.skip).toBe(100); // (2 - 1) * 100
    expect(result.take).toBe(100);
  });

  it('parsePagination handles custom sorting and direction', () => {
    const result = parsePagination({ sort: 'name', order: 'ASC', page: '3', limit: '10' });

    expect(result.sort).toBe('name');
    expect(result.order).toBe('asc');
    expect(result.page).toBe(3);
    expect(result.limit).toBe(10);
    expect(result.skip).toBe(20);
  });

  it('parsePagination rejects negative or non-integer page and limit safely', () => {
    const result = parsePagination({ page: '-5', limit: 'abc' });

    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });

  it('buildPaginationMetadata calculates totalPages and navigation flags correctly', () => {
    const meta = buildPaginationMetadata(45, 2, 20);

    expect(meta).toEqual({
      page: 2,
      limit: 20,
      total: 45,
      totalPages: 3,
      hasNextPage: true,
      hasPrevPage: true
    });
  });

  it('buildPaginationMetadata handles 0 total results safely', () => {
    const meta = buildPaginationMetadata(0, 1, 20);

    expect(meta).toEqual({
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 0,
      hasNextPage: false,
      hasPrevPage: false
    });
  });
});
