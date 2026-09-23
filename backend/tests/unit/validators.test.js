import { describe, it, expect } from 'vitest';
import {
  uuidSchema,
  emailSchema,
  phoneSchema,
  slugSchema,
  dateStringSchema,
  dateRangeSchema,
  paginationQuerySchema
} from '../../src/utils/validators.js';

describe('Unit: Reusable Validators', () => {
  it('uuidSchema validates UUID v4 correctly', () => {
    const valid = '25e9637a-7fa4-4ac2-b43d-b4c0edcf2932';
    const invalid = 'not-a-valid-uuid';

    expect(uuidSchema.safeParse(valid).success).toBe(true);
    expect(uuidSchema.safeParse(invalid).success).toBe(false);
  });

  it('emailSchema trims and lowercases valid emails', () => {
    const raw = '  ADMIN@Example.COM  ';
    const result = emailSchema.safeParse(raw);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe('admin@example.com');
    }
  });

  it('phoneSchema validates international format', () => {
    expect(phoneSchema.safeParse('+919876543210').success).toBe(true);
    expect(phoneSchema.safeParse('9876543210').success).toBe(true);
    expect(phoneSchema.safeParse('invalid-phone').success).toBe(false);
  });

  it('slugSchema validates URL friendly slugs', () => {
    expect(slugSchema.safeParse('vice-principal').success).toBe(true);
    expect(slugSchema.safeParse('School_Name').success).toBe(false);
  });

  it('dateStringSchema validates YYYY-MM-DD ISO format', () => {
    expect(dateStringSchema.safeParse('2026-09-09').success).toBe(true);
    expect(dateStringSchema.safeParse('09-09-2026').success).toBe(false);
    expect(dateStringSchema.safeParse('invalid-date').success).toBe(false);
  });

  it('dateRangeSchema ensures startDate is before or equal to endDate', () => {
    const valid = { startDate: '2026-01-01', endDate: '2026-12-31' };
    const invalid = { startDate: '2026-12-31', endDate: '2026-01-01' };

    expect(dateRangeSchema.safeParse(valid).success).toBe(true);
    expect(dateRangeSchema.safeParse(invalid).success).toBe(false);
  });

  it('paginationQuerySchema coerces query strings and applies defaults', () => {
    const raw = { page: '3', limit: '50', sort: 'name', order: 'asc' };
    const result = paginationQuerySchema.safeParse(raw);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        page: 3,
        limit: 50,
        sort: 'name',
        order: 'asc'
      });
    }
  });
});
