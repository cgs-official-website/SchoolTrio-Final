import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/app.js';
import * as libraryService from '../../../src/modules/library/library.service.js';
import * as authRepository from '../../../src/modules/auth/auth.repository.js';
import * as tokenService from '../../../src/modules/auth/token.service.js';
import * as rbacService from '../../../src/modules/rbac/rbac.service.js';
import { SYSTEM_ROLES } from '../../../src/config/constants.js';

describe('Library Routes & RBAC Integration Tests', () => {
  const app = createApp();

  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
  const OTHER_SCHOOL_ID = '99999999-9999-4999-8999-999999999999';
  const ADMIN_USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const LIBRARIAN_USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const VP_USER_ID = 'vvvvvvvv-vvvv-4vvv-8vvv-vvvvvvvvvvvv';
  const TEACHER_USER_ID = 'tttttttt-tttt-4ttt-8ttt-tttttttttttt';
  const PARENT_USER_ID = 'pppppppp-pppp-4ppp-8ppp-pppppppppppp';

  const BOOK_ID = '22222222-2222-4222-8222-222222222222';
  const CATEGORY_ID = '33333333-3333-4333-8333-333333333333';
  const STUDENT_ID = '44444444-4444-4444-8444-444444444444';
  const ISSUE_ID = '55555555-5555-4555-8555-555555555555';

  const adminUser = {
    id: ADMIN_USER_ID,
    schoolId: SCHOOL_ID,
    email: 'admin@school.com',
    systemRole: SYSTEM_ROLES.SCHOOL_ADMIN,
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_ID, name: 'School A', code: 'SCH-A', status: 'active' }
  };

  const librarianUser = {
    id: LIBRARIAN_USER_ID,
    schoolId: SCHOOL_ID,
    email: 'librarian@school.com',
    systemRole: 'LIBRARY',
    roles: ['library'],
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_ID, name: 'School A', code: 'SCH-A', status: 'active' }
  };

  const vpUser = {
    id: VP_USER_ID,
    schoolId: SCHOOL_ID,
    email: 'vp@school.com',
    systemRole: 'VICE_PRINCIPAL',
    roles: ['vice-principal'],
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_ID, name: 'School A', code: 'SCH-A', status: 'active' }
  };

  const teacherUser = {
    id: TEACHER_USER_ID,
    schoolId: SCHOOL_ID,
    email: 'teacher@school.com',
    systemRole: SYSTEM_ROLES.TEACHER,
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_ID, name: 'School A', code: 'SCH-A', status: 'active' }
  };

  const parentUser = {
    id: PARENT_USER_ID,
    schoolId: SCHOOL_ID,
    email: 'parent@school.com',
    systemRole: SYSTEM_ROLES.PARENT,
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_ID, name: 'School A', code: 'SCH-A', status: 'active' }
  };

  const MOCK_BOOK_DTO = {
    id: BOOK_ID,
    schoolId: SCHOOL_ID,
    title: 'The Great Gatsby',
    author: 'F. Scott Fitzgerald',
    isbn: '978-0743273565',
    category: 'Fiction',
    categoryId: CATEGORY_ID,
    totalQuantity: 4,
    availableQuantity: 4,
    customData: {},
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z'
  };

  const MOCK_CATEGORY_DTO = {
    id: CATEGORY_ID,
    schoolId: SCHOOL_ID,
    name: 'Fiction',
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z'
  };

  const MOCK_ISSUE_DTO = {
    id: ISSUE_ID,
    schoolId: SCHOOL_ID,
    bookId: BOOK_ID,
    studentId: STUDENT_ID,
    issuedAt: '2026-09-10T10:00:00.000Z',
    dueDate: '2026-09-30',
    returnedAt: null,
    status: 'issued',
    fineAmount: 0,
    isOverdue: false,
    book: { id: BOOK_ID, title: 'The Great Gatsby' },
    student: { id: STUDENT_ID, name: 'Alice Smith' },
    createdAt: '2026-09-10T10:00:00.000Z',
    updatedAt: '2026-09-10T10:00:00.000Z'
  };

  const getAuthToken = (user = adminUser) => {
    return tokenService.issueAccessToken({
      sub: user.id,
      schoolId: user.schoolId,
      systemRole: user.systemRole,
      tokenVersion: user.tokenVersion
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(authRepository, 'findUserById').mockImplementation(async (id) => {
      if (id === ADMIN_USER_ID) return adminUser;
      if (id === LIBRARIAN_USER_ID) return librarianUser;
      if (id === VP_USER_ID) return vpUser;
      if (id === TEACHER_USER_ID) return teacherUser;
      if (id === PARENT_USER_ID) return parentUser;
      return null;
    });

    vi.spyOn(rbacService, 'getUserEffectivePermissions').mockImplementation(async (_schoolId, userId) => {
      if (userId === LIBRARIAN_USER_ID) {
        return {
          library: { canRead: true, canCreate: true, canEdit: true, canDelete: true }
        };
      }
      if (userId === VP_USER_ID) {
        return {
          library: { canRead: true, canCreate: false, canEdit: false, canDelete: false }
        };
      }
      if (userId === TEACHER_USER_ID) {
        return {
          library: { canRead: false, canCreate: false, canEdit: false, canDelete: false }
        };
      }
      return {};
    });
  });

  describe('GET /api/v1/library/books', () => {
    it('allows Admin to list books', async () => {
      vi.spyOn(libraryService, 'listBooks').mockResolvedValue({
        data: [MOCK_BOOK_DTO],
        pagination: { total: 1, page: 1, limit: 20, totalPages: 1 }
      });

      const res = await request(app)
        .get('/api/v1/library/books')
        .set('Authorization', `Bearer ${getAuthToken(adminUser)}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });

    it('allows Librarian to list books', async () => {
      vi.spyOn(libraryService, 'listBooks').mockResolvedValue({
        data: [MOCK_BOOK_DTO],
        pagination: { total: 1, page: 1, limit: 20, totalPages: 1 }
      });

      const res = await request(app)
        .get('/api/v1/library/books')
        .set('Authorization', `Bearer ${getAuthToken(librarianUser)}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('allows Vice Principal read-only access to list books', async () => {
      vi.spyOn(libraryService, 'listBooks').mockResolvedValue({
        data: [MOCK_BOOK_DTO],
        pagination: { total: 1, page: 1, limit: 20, totalPages: 1 }
      });

      const res = await request(app)
        .get('/api/v1/library/books')
        .set('Authorization', `Bearer ${getAuthToken(vpUser)}`);

      expect(res.status).toBe(200);
    });

    it('denies Teacher without library permissions (403)', async () => {
      const res = await request(app)
        .get('/api/v1/library/books')
        .set('Authorization', `Bearer ${getAuthToken(teacherUser)}`);

      expect(res.status).toBe(403);
    });

    it('denies Parent (403)', async () => {
      const res = await request(app)
        .get('/api/v1/library/books')
        .set('Authorization', `Bearer ${getAuthToken(parentUser)}`);

      expect(res.status).toBe(403);
    });

    it('rejects cross-tenant schoolId spoofing', async () => {
      const res = await request(app)
        .get(`/api/v1/library/books?schoolId=${OTHER_SCHOOL_ID}`)
        .set('Authorization', `Bearer ${getAuthToken(adminUser)}`);

      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/v1/library/books', () => {
    it('allows Librarian with library:create to catalog book', async () => {
      vi.spyOn(libraryService, 'createBook').mockResolvedValue(MOCK_BOOK_DTO);

      const res = await request(app)
        .post('/api/v1/library/books')
        .set('Authorization', `Bearer ${getAuthToken(librarianUser)}`)
        .send({
          title: 'The Great Gatsby',
          author: 'F. Scott Fitzgerald',
          category: 'Fiction',
          totalQuantity: 4
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe('The Great Gatsby');
    });

    it('denies Vice Principal from creating books (403)', async () => {
      const res = await request(app)
        .post('/api/v1/library/books')
        .set('Authorization', `Bearer ${getAuthToken(vpUser)}`)
        .send({
          title: 'The Great Gatsby'
        });

      expect(res.status).toBe(403);
    });

    it('validates request payload (rejects empty title)', async () => {
      const res = await request(app)
        .post('/api/v1/library/books')
        .set('Authorization', `Bearer ${getAuthToken(adminUser)}`)
        .send({
          title: ''
        });

      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /api/v1/library/books/:id', () => {
    it('allows Admin to update book', async () => {
      vi.spyOn(libraryService, 'updateBook').mockResolvedValue({
        ...MOCK_BOOK_DTO,
        totalQuantity: 6
      });

      const res = await request(app)
        .patch(`/api/v1/library/books/${BOOK_ID}`)
        .set('Authorization', `Bearer ${getAuthToken(adminUser)}`)
        .send({ totalQuantity: 6 });

      expect(res.status).toBe(200);
      expect(res.body.data.totalQuantity).toBe(6);
    });
  });

  describe('DELETE /api/v1/library/books/:id', () => {
    it('allows Admin to delete unreferenced book', async () => {
      vi.spyOn(libraryService, 'deleteBook').mockResolvedValue({ message: 'Book deleted successfully' });

      const res = await request(app)
        .delete(`/api/v1/library/books/${BOOK_ID}`)
        .set('Authorization', `Bearer ${getAuthToken(adminUser)}`);

      expect(res.status).toBe(200);
      expect(res.body.data.message).toBe('Book deleted successfully');
    });
  });

  describe('Categories Endpoints', () => {
    it('GET /categories lists categories', async () => {
      vi.spyOn(libraryService, 'listCategories').mockResolvedValue([MOCK_CATEGORY_DTO]);

      const res = await request(app)
        .get('/api/v1/library/categories')
        .set('Authorization', `Bearer ${getAuthToken(librarianUser)}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });

    it('POST /categories creates new category', async () => {
      vi.spyOn(libraryService, 'createCategory').mockResolvedValue(MOCK_CATEGORY_DTO);

      const res = await request(app)
        .post('/api/v1/library/categories')
        .set('Authorization', `Bearer ${getAuthToken(librarianUser)}`)
        .send({ name: 'Fiction' });

      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe('Fiction');
    });
  });

  describe('Issues & Returns Endpoints', () => {
    it('POST /issues creates book issue', async () => {
      vi.spyOn(libraryService, 'issueBook').mockResolvedValue(MOCK_ISSUE_DTO);

      const res = await request(app)
        .post('/api/v1/library/issues')
        .set('Authorization', `Bearer ${getAuthToken(librarianUser)}`)
        .send({
          bookId: BOOK_ID,
          studentId: STUDENT_ID,
          dueDate: '2099-06-30'
        });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('issued');
    });

    it('POST /issues/:id/return marks book returned', async () => {
      vi.spyOn(libraryService, 'returnBook').mockResolvedValue({
        ...MOCK_ISSUE_DTO,
        status: 'returned',
        returnedAt: '2026-09-17T10:00:00.000Z'
      });

      const res = await request(app)
        .post(`/api/v1/library/issues/${ISSUE_ID}/return`)
        .set('Authorization', `Bearer ${getAuthToken(librarianUser)}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('returned');
    });
  });
});
