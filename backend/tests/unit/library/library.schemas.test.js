import { describe, it, expect } from 'vitest';
import {
  createCategoryBodySchema,
  createBookBodySchema,
  updateBookBodySchema,
  listBooksQuerySchema,
  issueBookBodySchema,
  listIssuesQuerySchema,
  dueDateSchema
} from '../../../src/modules/library/library.schemas.js';

describe('Library Validation Schemas', () => {
  const VALID_UUID_1 = '11111111-1111-4111-8111-111111111111';
  const VALID_UUID_2 = '22222222-2222-4222-8222-222222222222';

  describe('createCategoryBodySchema', () => {
    it('accepts valid category name', () => {
      const parsed = createCategoryBodySchema.parse({ name: 'Science Fiction' });
      expect(parsed.name).toBe('Science Fiction');
    });

    it('trims whitespace', () => {
      const parsed = createCategoryBodySchema.parse({ name: '  History  ' });
      expect(parsed.name).toBe('History');
    });

    it('rejects empty or whitespace-only name', () => {
      expect(() => createCategoryBodySchema.parse({ name: '' })).toThrow();
      expect(() => createCategoryBodySchema.parse({ name: '   ' })).toThrow();
    });

    it('rejects name exceeding 100 characters', () => {
      expect(() => createCategoryBodySchema.parse({ name: 'a'.repeat(101) })).toThrow();
    });
  });

  describe('createBookBodySchema', () => {
    it('accepts valid book payload with all fields', () => {
      const parsed = createBookBodySchema.parse({
        title: 'Clean Code',
        author: 'Robert C. Martin',
        isbn: '978-0132350884',
        category: 'Computer Science',
        categoryId: VALID_UUID_1,
        totalQuantity: 5,
        customData: { shelf: 'A3' }
      });
      expect(parsed.title).toBe('Clean Code');
      expect(parsed.author).toBe('Robert C. Martin');
      expect(parsed.isbn).toBe('978-0132350884');
      expect(parsed.category).toBe('Computer Science');
      expect(parsed.categoryId).toBe(VALID_UUID_1);
      expect(parsed.totalQuantity).toBe(5);
      expect(parsed.customData).toEqual({ shelf: 'A3' });
    });

    it('defaults totalQuantity to 1 if omitted', () => {
      const parsed = createBookBodySchema.parse({ title: 'Basic Math' });
      expect(parsed.totalQuantity).toBe(1);
    });

    it('rejects totalQuantity < 1', () => {
      expect(() => createBookBodySchema.parse({ title: 'Book', totalQuantity: 0 })).toThrow();
      expect(() => createBookBodySchema.parse({ title: 'Book', totalQuantity: -1 })).toThrow();
    });

    it('rejects empty title', () => {
      expect(() => createBookBodySchema.parse({ title: '' })).toThrow();
      expect(() => createBookBodySchema.parse({ title: '   ' })).toThrow();
    });
  });

  describe('updateBookBodySchema', () => {
    it('accepts partial updates', () => {
      const parsed = updateBookBodySchema.parse({ totalQuantity: 10 });
      expect(parsed.totalQuantity).toBe(10);
    });

    it('rejects empty update object', () => {
      expect(() => updateBookBodySchema.parse({})).toThrow();
    });

    it('rejects totalQuantity < 1 on update', () => {
      expect(() => updateBookBodySchema.parse({ totalQuantity: 0 })).toThrow();
    });
  });

  describe('listBooksQuerySchema', () => {
    it('applies default pagination values', () => {
      const parsed = listBooksQuerySchema.parse({});
      expect(parsed.page).toBe(1);
      expect(parsed.limit).toBe(20);
    });

    it('clamps limit to maximum of 100', () => {
      const parsed = listBooksQuerySchema.parse({ page: '2', limit: '50' });
      expect(parsed.page).toBe(2);
      expect(parsed.limit).toBe(50);

      expect(() => listBooksQuerySchema.parse({ limit: '101' })).toThrow();
      expect(() => listBooksQuerySchema.parse({ limit: '0' })).toThrow();
    });

    it('parses availableOnly boolean transformation', () => {
      expect(listBooksQuerySchema.parse({ availableOnly: 'true' }).availableOnly).toBe(true);
      expect(listBooksQuerySchema.parse({ availableOnly: '1' }).availableOnly).toBe(true);
      expect(listBooksQuerySchema.parse({ availableOnly: 'false' }).availableOnly).toBe(false);
      expect(listBooksQuerySchema.parse({ availableOnly: '0' }).availableOnly).toBe(false);
    });
  });

  describe('dueDateSchema', () => {
    it('accepts future or today date in YYYY-MM-DD format', () => {
      const futureDate = '2099-12-31';
      expect(dueDateSchema.parse(futureDate)).toBe(futureDate);
    });

    it('rejects invalid date format', () => {
      expect(() => dueDateSchema.parse('31-12-2099')).toThrow();
      expect(() => dueDateSchema.parse('2099/12/31')).toThrow();
      expect(() => dueDateSchema.parse('invalid-date')).toThrow();
    });

    it('rejects past date', () => {
      expect(() => dueDateSchema.parse('2000-01-01')).toThrow();
    });
  });

  describe('issueBookBodySchema', () => {
    it('accepts valid issue payload', () => {
      const parsed = issueBookBodySchema.parse({
        bookId: VALID_UUID_1,
        studentId: VALID_UUID_2,
        dueDate: '2099-06-30'
      });
      expect(parsed.bookId).toBe(VALID_UUID_1);
      expect(parsed.studentId).toBe(VALID_UUID_2);
      expect(parsed.dueDate).toBe('2099-06-30');
    });

    it('rejects missing fields or invalid UUIDs', () => {
      expect(() => issueBookBodySchema.parse({ bookId: 'not-uuid', studentId: VALID_UUID_2, dueDate: '2099-06-30' })).toThrow();
      expect(() => issueBookBodySchema.parse({ bookId: VALID_UUID_1, studentId: 'not-uuid', dueDate: '2099-06-30' })).toThrow();
      expect(() => issueBookBodySchema.parse({ bookId: VALID_UUID_1, studentId: VALID_UUID_2 })).toThrow();
    });
  });

  describe('listIssuesQuerySchema', () => {
    it('accepts valid issue filter query', () => {
      const parsed = listIssuesQuerySchema.parse({
        status: 'Issued',
        bookId: VALID_UUID_1,
        studentId: VALID_UUID_2,
        overdue: 'true',
        search: 'Alice'
      });
      expect(parsed.status).toBe('issued');
      expect(parsed.bookId).toBe(VALID_UUID_1);
      expect(parsed.studentId).toBe(VALID_UUID_2);
      expect(parsed.overdue).toBe(true);
      expect(parsed.search).toBe('Alice');
    });
  });
});
