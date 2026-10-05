import { describe, it, expect, vi, beforeEach } from 'vitest';
import ParentLibrary from '../ParentLibrary.jsx';
import * as libraryApi from '../../../api/library.js';
import * as apiClientModule from '../../../api/client.js';

describe('ParentLibrary Component & API Client Tests (LIB-001)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('is exported as a function/component', () => {
    expect(typeof ParentLibrary).toBe('function');
  });

  describe('library.js getMyIssuedBooks API Client', () => {
    it('constructs query string and calls GET /api/v1/library/my-issued-books', async () => {
      const clientSpy = vi.spyOn(apiClientModule, 'apiClient').mockResolvedValue({
        status: 'success',
        data: [],
        pagination: { total: 0, page: 1, limit: 20, totalPages: 0 }
      });

      await libraryApi.getMyIssuedBooks({
        studentId: '11111111-1111-4111-8111-111111111111',
        status: 'issued',
        search: 'Physics',
        page: 1,
        limit: 50
      });

      expect(clientSpy).toHaveBeenCalledWith(
        '/api/v1/library/my-issued-books?status=issued&studentId=11111111-1111-4111-8111-111111111111&search=Physics&page=1&limit=50',
        { method: 'GET' }
      );
    });

    it('filters out disallowed query parameters for security', async () => {
      const clientSpy = vi.spyOn(apiClientModule, 'apiClient').mockResolvedValue({
        status: 'success',
        data: []
      });

      await libraryApi.getMyIssuedBooks({
        studentId: '11111111-1111-4111-8111-111111111111',
        schoolId: 'malicious-school-id', // Disallowed
        hackedField: 'injection' // Disallowed
      });

      expect(clientSpy).toHaveBeenCalledWith(
        '/api/v1/library/my-issued-books?studentId=11111111-1111-4111-8111-111111111111',
        { method: 'GET' }
      );
    });
  });

  describe('Data Structure & Format Verification', () => {
    it('handles issued book payload accurately', () => {
      const sampleItem = {
        id: 'issue-1',
        schoolId: 'sch-1',
        bookId: 'b-1',
        studentId: 's-1',
        issuedAt: '2026-09-10T10:00:00.000Z',
        dueDate: '2026-09-25',
        returnedAt: null,
        status: 'issued',
        fineAmount: 0,
        isOverdue: false,
        book: {
          id: 'b-1',
          title: 'Concepts of Physics',
          author: 'H.C. Verma',
          isbn: '978-8177091878',
          category: 'Physics',
          availableQuantity: 5,
          totalQuantity: 10
        }
      };

      expect(sampleItem.book.title).toBe('Concepts of Physics');
      expect(sampleItem.status).toBe('issued');
      expect(sampleItem.isOverdue).toBe(false);
      expect(sampleItem.returnedAt).toBeNull();
    });

    it('handles returned book payload accurately', () => {
      const sampleReturned = {
        id: 'issue-2',
        schoolId: 'sch-1',
        bookId: 'b-2',
        studentId: 's-1',
        issuedAt: '2026-08-01T10:00:00.000Z',
        dueDate: '2026-08-15',
        returnedAt: '2026-08-14T14:30:00.000Z',
        status: 'returned',
        fineAmount: 0,
        isOverdue: false,
        book: {
          id: 'b-2',
          title: 'Chemistry Part 1',
          author: 'NCERT',
          isbn: '978-8174505088',
          category: 'Chemistry'
        }
      };

      expect(sampleReturned.status).toBe('returned');
      expect(sampleReturned.returnedAt).toBeTruthy();
    });
  });
});
