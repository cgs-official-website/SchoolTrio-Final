import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as clientModule from '../client.js';
import {
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
} from '../library.js';

describe('Library API Client (src/api/library.js)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Categories', () => {
    it('listCategories calls GET /api/v1/library/categories', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        status: 'success',
        data: [{ id: 'cat-1', name: 'Science' }]
      });

      const res = await listCategories();

      expect(spy).toHaveBeenCalledWith('/api/v1/library/categories', {
        method: 'GET'
      });
      expect(res.data).toHaveLength(1);
    });

    it('createCategory calls POST /api/v1/library/categories with body', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        status: 'success',
        data: { id: 'cat-2', name: 'History' }
      });

      const res = await createCategory({ name: 'History' });

      expect(spy).toHaveBeenCalledWith('/api/v1/library/categories', {
        method: 'POST',
        body: JSON.stringify({ name: 'History' })
      });
      expect(res.data.name).toBe('History');
    });
  });

  describe('Books', () => {
    it('listBooks builds query string with allowed parameters', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        status: 'success',
        data: [],
        pagination: { total: 0, page: 1, limit: 20, totalPages: 0 }
      });

      await listBooks({
        search: 'Physics',
        category: 'Science',
        availableOnly: true,
        page: 1,
        limit: 10,
        unauthorizedField: 'injectedValue'
      });

      expect(spy).toHaveBeenCalledWith(
        '/api/v1/library/books?search=Physics&category=Science&availableOnly=true&page=1&limit=10',
        { method: 'GET' }
      );
    });

    it('getBook calls GET /api/v1/library/books/:id', async () => {
      const bookId = '11111111-1111-4111-8111-111111111111';
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        status: 'success',
        data: { id: bookId, title: 'Quantum Mechanics' }
      });

      const res = await getBook(bookId);

      expect(spy).toHaveBeenCalledWith(`/api/v1/library/books/${bookId}`, {
        method: 'GET'
      });
      expect(res.data.title).toBe('Quantum Mechanics');
    });

    it('createBook calls POST /api/v1/library/books with valid payload', async () => {
      const payload = {
        title: 'Modern Physics',
        author: 'John Doe',
        isbn: '978-1234567890',
        category: 'Physics',
        totalQuantity: 5,
        customData: { edition: '3rd' }
      };

      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        status: 'success',
        data: { id: 'book-123', ...payload, availableQuantity: 5 }
      });

      const res = await createBook(payload);

      expect(spy).toHaveBeenCalledWith('/api/v1/library/books', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      expect(res.data.availableQuantity).toBe(5);
    });

    it('updateBook calls PATCH /api/v1/library/books/:id with update payload', async () => {
      const bookId = '22222222-2222-4222-8222-222222222222';
      const payload = { title: 'Updated Title', totalQuantity: 10 };

      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        status: 'success',
        data: { id: bookId, ...payload }
      });

      const res = await updateBook(bookId, payload);

      expect(spy).toHaveBeenCalledWith(`/api/v1/library/books/${bookId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      expect(res.data.totalQuantity).toBe(10);
    });

    it('deleteBook calls DELETE /api/v1/library/books/:id', async () => {
      const bookId = '33333333-3333-4333-8333-333333333333';
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        status: 'success',
        data: null
      });

      const res = await deleteBook(bookId);

      expect(spy).toHaveBeenCalledWith(`/api/v1/library/books/${bookId}`, {
        method: 'DELETE'
      });
      expect(res.data).toBeNull();
    });
  });

  describe('Issues', () => {
    it('listIssues builds query string with filter parameters', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        status: 'success',
        data: []
      });

      await listIssues({
        status: 'issued',
        overdue: true,
        studentId: 'student-123',
        page: 1,
        limit: 50
      });

      expect(spy).toHaveBeenCalledWith(
        '/api/v1/library/issues?status=issued&studentId=student-123&overdue=true&page=1&limit=50',
        { method: 'GET' }
      );
    });

    it('issueBook calls POST /api/v1/library/issues with payload', async () => {
      const payload = {
        bookId: 'book-1',
        studentId: 'student-1',
        dueDate: '2026-10-01'
      };

      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        status: 'success',
        data: { id: 'issue-1', ...payload, status: 'issued' }
      });

      const res = await issueBook(payload);

      expect(spy).toHaveBeenCalledWith('/api/v1/library/issues', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      expect(res.data.status).toBe('issued');
    });

    it('returnBook calls POST /api/v1/library/issues/:id/return', async () => {
      const issueId = 'issue-999';
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        status: 'success',
        data: { id: issueId, status: 'returned', returnedAt: new Date().toISOString() }
      });

      const res = await returnBook(issueId);

      expect(spy).toHaveBeenCalledWith(`/api/v1/library/issues/${issueId}/return`, {
        method: 'POST'
      });
      expect(res.data.status).toBe('returned');
    });
  });
});
