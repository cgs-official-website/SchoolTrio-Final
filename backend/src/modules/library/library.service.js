import { prisma } from '../../database/prisma.client.js';
import * as libraryRepo from './library.repository.js';
import { createAuditLog } from '../audit/audit.repository.js';
import {
  ValidationError,
  NotFoundError,
  ConflictError,
  TenantAccessError
} from '../../utils/app-error.js';

/**
 * Formats a Book database entity to canonical REST DTO.
 */
export function formatBookDto(book) {
  if (!book) return null;

  return {
    id: book.id,
    schoolId: book.schoolId,
    title: book.title,
    author: book.author || null,
    isbn: book.isbn || null,
    category: book.category || (book.libraryCategory ? book.libraryCategory.name : 'General'),
    categoryId: book.categoryId || null,
    categoryDetails: book.libraryCategory
      ? { id: book.libraryCategory.id, name: book.libraryCategory.name }
      : null,
    totalQuantity: book.totalQuantity,
    availableQuantity: book.availableQuantity,
    customData: book.customData || {},
    issueCount: book._count?.issues ?? undefined,
    createdAt: book.createdAt,
    updatedAt: book.updatedAt
  };
}

/**
 * Formats an Issue database entity to canonical REST DTO.
 */
export function formatIssueDto(issue) {
  if (!issue) return null;

  const currentDateStr = new Date().toISOString().split('T')[0];
  const isOverdue = issue.status === 'issued' && issue.dueDate < currentDateStr;

  const student = issue.student || {};
  const studentName = student.firstName
    ? `${student.firstName} ${student.lastName || ''}`.trim()
    : 'Unknown Student';

  return {
    id: issue.id,
    schoolId: issue.schoolId,
    bookId: issue.bookId,
    studentId: issue.studentId,
    issuedAt: issue.issuedAt,
    dueDate: issue.dueDate,
    returnedAt: issue.returnedAt || null,
    status: issue.status,
    fineAmount: issue.fineAmount !== null ? Number(issue.fineAmount) : 0,
    isOverdue,
    book: issue.book
      ? {
          id: issue.book.id,
          title: issue.book.title,
          author: issue.book.author || null,
          isbn: issue.book.isbn || null,
          category: issue.book.category || null,
          availableQuantity: issue.book.availableQuantity,
          totalQuantity: issue.book.totalQuantity
        }
      : null,
    student: issue.student
      ? {
          id: issue.student.id,
          name: studentName,
          firstName: student.firstName || '',
          lastName: student.lastName || '',
          admissionNumber: student.admissionNumber || '',
          classId: student.classId || null,
          className: student.class
            ? (student.section ? `${student.class.name} - Section ${student.section.name}` : student.class.name)
            : null
        }
      : null,
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt
  };
}

/**
 * Category Dual Compatibility Resolution Helper
 * Resolves categoryId and category string name within the same transaction.
 */
export async function resolveCategory(schoolId, categoryId, categoryName, tx = prisma) {
  if (categoryId) {
    const existing = await libraryRepo.findCategoryById(schoolId, categoryId, tx);
    if (!existing) {
      throw new NotFoundError('Library category');
    }
    return {
      categoryId: existing.id,
      category: existing.name
    };
  }

  const rawName = (categoryName && typeof categoryName === 'string' ? categoryName.trim() : '') || 'General';

  let category = await libraryRepo.findCategoryByName(schoolId, rawName, tx);
  if (!category) {
    try {
      category = await libraryRepo.createCategory({ schoolId, name: rawName }, tx);
    } catch (err) {
      // If concurrent insert created it, re-fetch
      category = await libraryRepo.findCategoryByName(schoolId, rawName, tx);
      if (!category) throw err;
    }
  }

  return {
    categoryId: category.id,
    category: category.name
  };
}

// ==========================================
// 1. Category Service Methods
// ==========================================

export async function listCategories(schoolId) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to list categories');
  }
  const categories = await libraryRepo.findCategoriesBySchoolId(schoolId);
  return categories.map(c => ({
    id: c.id,
    schoolId: c.schoolId,
    name: c.name,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt
  }));
}

export async function createCategory(schoolId, actor, data) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to create category');
  }

  const trimmedName = data.name.trim();
  const existing = await libraryRepo.findCategoryByName(schoolId, trimmedName);
  if (existing) {
    throw new ConflictError(`Category '${trimmedName}' already exists`);
  }

  const category = await libraryRepo.createCategory({ schoolId, name: trimmedName });

  createAuditLog({
    schoolId,
    entityType: 'LibraryCategory',
    entityId: category.id,
    actionPerformed: `Created library category '${category.name}'`,
    userName: actor?.name || actor?.email || 'Administrator',
    userRole: actor?.systemRole || actor?.role || 'LIBRARY',
    modifiedFields: { name: category.name }
  });

  return {
    id: category.id,
    schoolId: category.schoolId,
    name: category.name,
    createdAt: category.createdAt,
    updatedAt: category.updatedAt
  };
}

// ==========================================
// 2. Book Service Methods
// ==========================================

export async function listBooks(schoolId, query = {}) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to list books');
  }

  const result = await libraryRepo.findBooks(schoolId, query);
  const totalPages = Math.ceil(result.total / (query.limit || 20)) || 1;

  return {
    data: result.data.map(formatBookDto),
    pagination: {
      total: result.total,
      page: query.page || 1,
      limit: query.limit || 20,
      totalPages
    }
  };
}

export async function getBookById(schoolId, bookId) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to get book');
  }

  const book = await libraryRepo.findBookById(schoolId, bookId);
  if (!book) {
    throw new NotFoundError('Book');
  }

  const activeIssuedCount = await libraryRepo.countActiveBookIssues(schoolId, bookId);

  const dto = formatBookDto(book);
  dto.activeIssuedCount = activeIssuedCount;
  return dto;
}

export async function createBook(schoolId, actor, data) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to create book');
  }

  const book = await prisma.$transaction(
    async (tx) => {
      const { categoryId, category } = await resolveCategory(schoolId, data.categoryId, data.category, tx);

      const totalQuantity = Number(data.totalQuantity) || 1;

      return libraryRepo.createBook(
        {
          schoolId,
          title: data.title,
          author: data.author || null,
          isbn: data.isbn || null,
          category,
          categoryId,
          totalQuantity,
          customData: data.customData || null
        },
        tx
      );
    },
    { maxWait: 5000, timeout: 10000, isolationLevel: 'ReadCommitted' }
  );

  createAuditLog({
    schoolId,
    entityType: 'LibraryBook',
    entityId: book.id,
    actionPerformed: `Cataloged new book '${book.title}' (Quantity: ${book.totalQuantity})`,
    userName: actor?.name || actor?.email || 'Administrator',
    userRole: actor?.systemRole || actor?.role || 'LIBRARY',
    modifiedFields: {
      title: book.title,
      author: book.author,
      isbn: book.isbn,
      category: book.category,
      totalQuantity: book.totalQuantity
    }
  });

  return formatBookDto(book);
}

export async function updateBook(schoolId, actor, bookId, data) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to update book');
  }

  const updatedBook = await prisma.$transaction(
    async (tx) => {
      const existing = await libraryRepo.findBookById(schoolId, bookId, tx);
      if (!existing) {
        throw new NotFoundError('Book');
      }

      const updatePayload = {};

      if (data.title !== undefined) updatePayload.title = data.title.trim();
      if (data.author !== undefined) updatePayload.author = data.author ? data.author.trim() : null;
      if (data.isbn !== undefined) updatePayload.isbn = data.isbn ? data.isbn.trim() : null;
      if (data.customData !== undefined) updatePayload.customData = data.customData;

      // Handle Category update
      if (data.categoryId !== undefined || data.category !== undefined) {
        const { categoryId, category } = await resolveCategory(
          schoolId,
          data.categoryId,
          data.category !== undefined ? data.category : existing.category,
          tx
        );
        updatePayload.categoryId = categoryId;
        updatePayload.category = category;
      }

      // Handle Total Quantity update
      if (data.totalQuantity !== undefined) {
        const newTotal = Number(data.totalQuantity);
        if (newTotal < 1) {
          throw new ValidationError('totalQuantity must be at least 1');
        }

        const activeIssuedCount = await libraryRepo.countActiveBookIssues(schoolId, bookId, tx);
        if (newTotal < activeIssuedCount) {
          throw new ConflictError(
            `New total quantity (${newTotal}) cannot be less than currently issued copies (${activeIssuedCount})`
          );
        }

        updatePayload.totalQuantity = newTotal;
        updatePayload.availableQuantity = newTotal - activeIssuedCount;
      }

      return libraryRepo.updateBook(schoolId, bookId, updatePayload, tx);
    },
    { maxWait: 5000, timeout: 10000, isolationLevel: 'ReadCommitted' }
  );

  createAuditLog({
    schoolId,
    entityType: 'LibraryBook',
    entityId: updatedBook.id,
    actionPerformed: `Updated book '${updatedBook.title}'`,
    userName: actor?.name || actor?.email || 'Administrator',
    userRole: actor?.systemRole || actor?.role || 'LIBRARY',
    modifiedFields: data
  });

  return formatBookDto(updatedBook);
}

export async function deleteBook(schoolId, actor, bookId) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to delete book');
  }

  await prisma.$transaction(
    async (tx) => {
      const existing = await libraryRepo.findBookById(schoolId, bookId, tx);
      if (!existing) {
        throw new NotFoundError('Book');
      }

      const issueCount = await libraryRepo.countBookIssues(schoolId, bookId, tx);
      if (issueCount > 0) {
        throw new ConflictError('Cannot delete book with existing issue records');
      }

      await libraryRepo.deleteBook(schoolId, bookId, tx);
    },
    { maxWait: 5000, timeout: 10000, isolationLevel: 'ReadCommitted' }
  );

  createAuditLog({
    schoolId,
    entityType: 'LibraryBook',
    entityId: bookId,
    actionPerformed: `Deleted book ID '${bookId}'`,
    userName: actor?.name || actor?.email || 'Administrator',
    userRole: actor?.systemRole || actor?.role || 'LIBRARY',
    modifiedFields: null
  });

  return { message: 'Book deleted successfully' };
}

// ==========================================
// 3. Issue Service Methods
// ==========================================

export async function listIssues(schoolId, query = {}) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to list book issues');
  }

  const result = await libraryRepo.findIssues(schoolId, query);
  const totalPages = Math.ceil(result.total / (query.limit || 20)) || 1;

  return {
    data: result.data.map(formatIssueDto),
    pagination: {
      total: result.total,
      page: query.page || 1,
      limit: query.limit || 20,
      totalPages
    }
  };
}

export async function issueBook(schoolId, actor, data) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to issue book');
  }

  const { bookId, studentId, dueDate } = data;

  const issue = await prisma.$transaction(
    async (tx) => {
      // 1. Verify student exists in current tenant
      const student = await libraryRepo.findStudentById(schoolId, studentId, tx);
      if (!student) {
        throw new NotFoundError('Student');
      }

      // 2. Verify book exists in current tenant
      const book = await libraryRepo.findBookById(schoolId, bookId, tx);
      if (!book) {
        throw new NotFoundError('Book');
      }

      // 3. Atomic stock decrement
      const updatedCount = await libraryRepo.decrementBookAvailableQuantityAtomic(schoolId, bookId, tx);
      if (updatedCount === 0) {
        throw new ConflictError('Book is out of stock or unavailable');
      }

      // 4. Create Issue record
      return libraryRepo.createIssue(
        {
          schoolId,
          bookId,
          studentId,
          dueDate
        },
        tx
      );
    },
    { maxWait: 5000, timeout: 10000, isolationLevel: 'ReadCommitted' }
  );

  createAuditLog({
    schoolId,
    entityType: 'LibraryBookIssue',
    entityId: issue.id,
    actionPerformed: `Issued book '${issue.book?.title || bookId}' to student '${issue.student?.firstName || studentId}' (Due: ${dueDate})`,
    userName: actor?.name || actor?.email || 'Administrator',
    userRole: actor?.systemRole || actor?.role || 'LIBRARY',
    modifiedFields: {
      bookId,
      studentId,
      dueDate,
      status: 'issued'
    }
  });

  return formatIssueDto(issue);
}

export async function returnBook(schoolId, actor, issueId) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to return book');
  }

  const issue = await prisma.$transaction(
    async (tx) => {
      // 1. Verify issue exists in current tenant
      const existing = await libraryRepo.findIssueById(schoolId, issueId, tx);
      if (!existing) {
        throw new NotFoundError('Library book issue');
      }

      if (existing.status !== 'issued') {
        throw new ConflictError('Book is already marked as returned');
      }

      // 2. Atomically mark issue returned
      const updatedCount = await libraryRepo.markIssueReturned(schoolId, issueId, tx);
      if (updatedCount === 0) {
        throw new ConflictError('Book is already marked as returned');
      }

      // 3. Increment book stock
      await libraryRepo.incrementBookAvailableQuantityAtomic(schoolId, existing.bookId, tx);

      // Return updated issue representation
      return libraryRepo.findIssueById(schoolId, issueId, tx);
    },
    { maxWait: 5000, timeout: 10000, isolationLevel: 'ReadCommitted' }
  );

  createAuditLog({
    schoolId,
    entityType: 'LibraryBookIssue',
    entityId: issue.id,
    actionPerformed: `Marked book '${issue.book?.title || issue.bookId}' returned from student '${issue.student?.firstName || issue.studentId}'`,
    userName: actor?.name || actor?.email || 'Administrator',
    userRole: actor?.systemRole || actor?.role || 'LIBRARY',
    modifiedFields: {
      status: 'returned',
      returnedAt: issue.returnedAt
    }
  });

  return formatIssueDto(issue);
}
