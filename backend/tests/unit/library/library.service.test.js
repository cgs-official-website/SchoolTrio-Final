import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as libraryService from '../../../src/modules/library/library.service.js';
import * as libraryRepo from '../../../src/modules/library/library.repository.js';
import * as auditRepo from '../../../src/modules/audit/audit.repository.js';
import { prisma } from '../../../src/database/prisma.client.js';
import {
  NotFoundError,
  ConflictError
} from '../../../src/utils/app-error.js';

describe('Library Service Layer', () => {
  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
  const BOOK_ID = '22222222-2222-4222-8222-222222222222';
  const CATEGORY_ID = '33333333-3333-4333-8333-333333333333';
  const STUDENT_ID = '44444444-4444-4444-8444-444444444444';
  const ISSUE_ID = '55555555-5555-4555-8555-555555555555';

  const actor = {
    id: '66666666-6666-4666-8666-666666666666',
    role: 'LIBRARY',
    email: 'librarian@school.edu'
  };

  const sampleCategory = {
    id: CATEGORY_ID,
    schoolId: SCHOOL_ID,
    name: 'Science',
    createdAt: new Date('2026-09-01T10:00:00Z'),
    updatedAt: new Date('2026-09-01T10:00:00Z')
  };

  const sampleBook = {
    id: BOOK_ID,
    schoolId: SCHOOL_ID,
    title: 'A Brief History of Time',
    author: 'Stephen Hawking',
    isbn: '978-0553380163',
    category: 'Science',
    categoryId: CATEGORY_ID,
    totalQuantity: 3,
    availableQuantity: 3,
    customData: { shelf: 'Row 4' },
    createdAt: new Date('2026-09-01T10:00:00Z'),
    updatedAt: new Date('2026-09-01T10:00:00Z'),
    libraryCategory: { id: CATEGORY_ID, name: 'Science' },
    _count: { issues: 0 }
  };

  const sampleIssue = {
    id: ISSUE_ID,
    schoolId: SCHOOL_ID,
    bookId: BOOK_ID,
    studentId: STUDENT_ID,
    issuedAt: new Date('2026-09-10T10:00:00Z'),
    dueDate: '2026-09-25',
    returnedAt: null,
    status: 'issued',
    fineAmount: 0,
    book: {
      id: BOOK_ID,
      title: 'A Brief History of Time',
      author: 'Stephen Hawking',
      isbn: '978-0553380163',
      category: 'Science',
      availableQuantity: 2,
      totalQuantity: 3
    },
    student: {
      id: STUDENT_ID,
      firstName: 'Alice',
      lastName: 'Smith',
      admissionNumber: 'ADM-001',
      classId: 'class-uuid',
      class: { id: 'class-uuid', name: 'Grade 10' },
      section: { id: 'sec-uuid', name: 'A' }
    },
    createdAt: new Date('2026-09-10T10:00:00Z'),
    updatedAt: new Date('2026-09-10T10:00:00Z')
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(auditRepo, 'createAuditLog').mockResolvedValue(null);
    vi.spyOn(prisma, '$transaction').mockImplementation(async (callback) => {
      return callback(prisma);
    });
  });

  describe('formatBookDto & formatIssueDto', () => {
    it('correctly formats book entity to DTO', () => {
      const dto = libraryService.formatBookDto(sampleBook);
      expect(dto.id).toBe(BOOK_ID);
      expect(dto.title).toBe('A Brief History of Time');
      expect(dto.category).toBe('Science');
      expect(dto.categoryDetails).toEqual({ id: CATEGORY_ID, name: 'Science' });
      expect(dto.totalQuantity).toBe(3);
      expect(dto.availableQuantity).toBe(3);
    });

    it('correctly formats issue entity with overdue detection', () => {
      const pastDueDateIssue = {
        ...sampleIssue,
        dueDate: '2020-01-01',
        status: 'issued'
      };
      const dto = libraryService.formatIssueDto(pastDueDateIssue);
      expect(dto.isOverdue).toBe(true);

      const returnedIssue = {
        ...sampleIssue,
        dueDate: '2020-01-01',
        status: 'returned'
      };
      expect(libraryService.formatIssueDto(returnedIssue).isOverdue).toBe(false);
    });
  });

  describe('resolveCategory helper', () => {
    it('resolves by categoryId when category exists', async () => {
      vi.spyOn(libraryRepo, 'findCategoryById').mockResolvedValue(sampleCategory);

      const resolved = await libraryService.resolveCategory(SCHOOL_ID, CATEGORY_ID, null);
      expect(resolved.categoryId).toBe(CATEGORY_ID);
      expect(resolved.category).toBe('Science');
    });

    it('throws NotFoundError when categoryId does not exist', async () => {
      vi.spyOn(libraryRepo, 'findCategoryById').mockResolvedValue(null);

      await expect(libraryService.resolveCategory(SCHOOL_ID, 'non-existent-uuid', null)).rejects.toThrow(NotFoundError);
    });

    it('resolves existing category by name', async () => {
      vi.spyOn(libraryRepo, 'findCategoryByName').mockResolvedValue(sampleCategory);

      const resolved = await libraryService.resolveCategory(SCHOOL_ID, null, 'Science');
      expect(resolved.categoryId).toBe(CATEGORY_ID);
      expect(resolved.category).toBe('Science');
    });

    it('creates new category when name does not exist', async () => {
      vi.spyOn(libraryRepo, 'findCategoryByName').mockResolvedValue(null);
      vi.spyOn(libraryRepo, 'createCategory').mockResolvedValue({
        id: 'new-cat-id',
        schoolId: SCHOOL_ID,
        name: 'Novel'
      });

      const resolved = await libraryService.resolveCategory(SCHOOL_ID, null, 'Novel');
      expect(resolved.categoryId).toBe('new-cat-id');
      expect(resolved.category).toBe('Novel');
    });
  });

  describe('Categories CRUD', () => {
    it('listCategories returns categories for tenant', async () => {
      vi.spyOn(libraryRepo, 'findCategoriesBySchoolId').mockResolvedValue([sampleCategory]);

      const result = await libraryService.listCategories(SCHOOL_ID);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Science');
    });

    it('createCategory successfully creates category', async () => {
      vi.spyOn(libraryRepo, 'findCategoryByName').mockResolvedValue(null);
      vi.spyOn(libraryRepo, 'createCategory').mockResolvedValue(sampleCategory);

      const result = await libraryService.createCategory(SCHOOL_ID, actor, { name: 'Science' });
      expect(result.name).toBe('Science');
      expect(auditRepo.createAuditLog).toHaveBeenCalled();
    });

    it('createCategory throws ConflictError on duplicate name', async () => {
      vi.spyOn(libraryRepo, 'findCategoryByName').mockResolvedValue(sampleCategory);

      await expect(libraryService.createCategory(SCHOOL_ID, actor, { name: 'Science' })).rejects.toThrow(ConflictError);
    });
  });

  describe('Books CRUD', () => {
    it('listBooks returns paginated books', async () => {
      vi.spyOn(libraryRepo, 'findBooks').mockResolvedValue({ total: 1, data: [sampleBook] });

      const result = await libraryService.listBooks(SCHOOL_ID, { page: 1, limit: 20 });
      expect(result.data).toHaveLength(1);
      expect(result.pagination.total).toBe(1);
    });

    it('getBookById returns book with activeIssuedCount', async () => {
      vi.spyOn(libraryRepo, 'findBookById').mockResolvedValue(sampleBook);
      vi.spyOn(libraryRepo, 'countActiveBookIssues').mockResolvedValue(1);

      const result = await libraryService.getBookById(SCHOOL_ID, BOOK_ID);
      expect(result.id).toBe(BOOK_ID);
      expect(result.activeIssuedCount).toBe(1);
    });

    it('createBook initializes availableQuantity to totalQuantity', async () => {
      vi.spyOn(libraryRepo, 'findCategoryByName').mockResolvedValue(sampleCategory);
      vi.spyOn(libraryRepo, 'createBook').mockResolvedValue({
        ...sampleBook,
        totalQuantity: 5,
        availableQuantity: 5
      });

      const result = await libraryService.createBook(SCHOOL_ID, actor, {
        title: 'New Book',
        category: 'Science',
        totalQuantity: 5
      });

      expect(result.totalQuantity).toBe(5);
      expect(result.availableQuantity).toBe(5);
    });

    it('updateBook updates fields and recalculates availableQuantity', async () => {
      vi.spyOn(libraryRepo, 'findBookById').mockResolvedValue({
        ...sampleBook,
        totalQuantity: 3,
        availableQuantity: 2
      });
      vi.spyOn(libraryRepo, 'countActiveBookIssues').mockResolvedValue(1);
      vi.spyOn(libraryRepo, 'updateBook').mockResolvedValue({
        ...sampleBook,
        totalQuantity: 5,
        availableQuantity: 4 // 5 total - 1 active issue
      });

      const result = await libraryService.updateBook(SCHOOL_ID, actor, BOOK_ID, {
        totalQuantity: 5
      });

      expect(result.totalQuantity).toBe(5);
      expect(result.availableQuantity).toBe(4);
    });

    it('updateBook throws ConflictError if new total is less than active issues', async () => {
      vi.spyOn(libraryRepo, 'findBookById').mockResolvedValue(sampleBook);
      vi.spyOn(libraryRepo, 'countActiveBookIssues').mockResolvedValue(3); // 3 copies issued

      await expect(
        libraryService.updateBook(SCHOOL_ID, actor, BOOK_ID, { totalQuantity: 2 })
      ).rejects.toThrow(ConflictError);
    });

    it('deleteBook throws ConflictError when book has issue history', async () => {
      vi.spyOn(libraryRepo, 'findBookById').mockResolvedValue(sampleBook);
      vi.spyOn(libraryRepo, 'countBookIssues').mockResolvedValue(2);

      await expect(libraryService.deleteBook(SCHOOL_ID, actor, BOOK_ID)).rejects.toThrow(ConflictError);
    });

    it('deleteBook deletes book when no issues exist', async () => {
      vi.spyOn(libraryRepo, 'findBookById').mockResolvedValue(sampleBook);
      vi.spyOn(libraryRepo, 'countBookIssues').mockResolvedValue(0);
      vi.spyOn(libraryRepo, 'deleteBook').mockResolvedValue(sampleBook);

      const result = await libraryService.deleteBook(SCHOOL_ID, actor, BOOK_ID);
      expect(result.message).toBe('Book deleted successfully');
    });
  });

  describe('Issue & Return Workflow', () => {
    it('issueBook atomically decrements stock and creates issue', async () => {
      vi.spyOn(libraryRepo, 'findStudentById').mockResolvedValue({ id: STUDENT_ID, schoolId: SCHOOL_ID });
      vi.spyOn(libraryRepo, 'findBookById').mockResolvedValue(sampleBook);
      vi.spyOn(libraryRepo, 'decrementBookAvailableQuantityAtomic').mockResolvedValue(1);
      vi.spyOn(libraryRepo, 'createIssue').mockResolvedValue(sampleIssue);

      const result = await libraryService.issueBook(SCHOOL_ID, actor, {
        bookId: BOOK_ID,
        studentId: STUDENT_ID,
        dueDate: '2026-09-30'
      });

      expect(result.id).toBe(ISSUE_ID);
      expect(result.status).toBe('issued');
      expect(libraryRepo.decrementBookAvailableQuantityAtomic).toHaveBeenCalled();
    });

    it('issueBook throws ConflictError when book is out of stock', async () => {
      vi.spyOn(libraryRepo, 'findStudentById').mockResolvedValue({ id: STUDENT_ID, schoolId: SCHOOL_ID });
      vi.spyOn(libraryRepo, 'findBookById').mockResolvedValue({ ...sampleBook, availableQuantity: 0 });
      vi.spyOn(libraryRepo, 'decrementBookAvailableQuantityAtomic').mockResolvedValue(0);

      await expect(
        libraryService.issueBook(SCHOOL_ID, actor, {
          bookId: BOOK_ID,
          studentId: STUDENT_ID,
          dueDate: '2026-09-30'
        })
      ).rejects.toThrow(ConflictError);
    });

    it('issueBook throws NotFoundError when student does not exist', async () => {
      vi.spyOn(libraryRepo, 'findStudentById').mockResolvedValue(null);

      await expect(
        libraryService.issueBook(SCHOOL_ID, actor, {
          bookId: BOOK_ID,
          studentId: STUDENT_ID,
          dueDate: '2026-09-30'
        })
      ).rejects.toThrow(NotFoundError);
    });

    it('returnBook marks issue returned and increments stock', async () => {
      vi.spyOn(libraryRepo, 'findIssueById')
        .mockResolvedValueOnce(sampleIssue)
        .mockResolvedValueOnce({ ...sampleIssue, status: 'returned', returnedAt: new Date() });
      vi.spyOn(libraryRepo, 'markIssueReturned').mockResolvedValue(1);
      vi.spyOn(libraryRepo, 'incrementBookAvailableQuantityAtomic').mockResolvedValue(1);

      const result = await libraryService.returnBook(SCHOOL_ID, actor, ISSUE_ID);
      expect(result.status).toBe('returned');
      expect(libraryRepo.incrementBookAvailableQuantityAtomic).toHaveBeenCalled();
    });

    it('returnBook throws ConflictError if issue is already returned', async () => {
      vi.spyOn(libraryRepo, 'findIssueById').mockResolvedValue({ ...sampleIssue, status: 'returned' });

      await expect(libraryService.returnBook(SCHOOL_ID, actor, ISSUE_ID)).rejects.toThrow(ConflictError);
    });
  });
});
