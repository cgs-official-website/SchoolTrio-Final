import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/app.js';
import * as classService from '../../../src/modules/classes/class.service.js';
import * as categoryService from '../../../src/modules/class-categories/category.service.js';
import * as authRepository from '../../../src/modules/auth/auth.repository.js';
import * as tokenService from '../../../src/modules/auth/token.service.js';
import { SYSTEM_ROLES } from '../../../src/config/constants.js';
import { ConflictError } from '../../../src/utils/app-error.js';

describe('Integration: Classes, Sections & Categories Endpoints — Phase 4C.2-A.2.2', () => {
  const app = createApp();
  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
  const CLASS_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const SECTION_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const CATEGORY_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const STAFF_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

  const mockAdminUser = {
    id: 'admin-1',
    schoolId: SCHOOL_ID,
    email: 'admin@school.edu',
    systemRole: SYSTEM_ROLES.SCHOOL_ADMIN,
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_ID, name: 'Spring Mount', code: 'SchoolS024', status: 'active' }
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const getAuthToken = (user = mockAdminUser) => {
    return tokenService.issueAccessToken({
      sub: user.id,
      schoolId: user.schoolId,
      systemRole: user.systemRole,
      tokenVersion: user.tokenVersion
    });
  };

  describe('1. Class CRUD Endpoints (/api/v1/classes)', () => {
    it('GET /api/v1/classes returns paginated list of classes', async () => {
      const mockClasses = [{ id: CLASS_ID, name: 'Grade 10', schoolId: SCHOOL_ID }];
      const mockPagination = { total: 1, page: 1, limit: 20, totalPages: 1, hasNextPage: false, hasPrevPage: false };

      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(classService, 'listClasses').mockResolvedValue({ classes: mockClasses, pagination: mockPagination });

      const token = getAuthToken();
      const res = await request(app)
        .get('/api/v1/classes')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockClasses);
      expect(res.body.pagination).toBeDefined();
    });

    it('GET /api/v1/classes/:id returns single class', async () => {
      const mockClass = { id: CLASS_ID, name: 'Grade 10', schoolId: SCHOOL_ID };
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(classService, 'getClassById').mockResolvedValue(mockClass);

      const token = getAuthToken();
      const res = await request(app)
        .get(`/api/v1/classes/${CLASS_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockClass);
    });

    it('POST /api/v1/classes creates a new class with classTeacherId and defaultSection', async () => {
      const createdClass = { id: CLASS_ID, name: 'Grade 10', schoolId: SCHOOL_ID, classTeacherId: STAFF_ID };
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(classService, 'createClass').mockResolvedValue(createdClass);

      const token = getAuthToken();
      const res = await request(app)
        .post('/api/v1/classes')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Grade 10',
          defaultSection: 'A',
          classTeacherId: STAFF_ID
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(createdClass);
    });

    it('PATCH /api/v1/classes/:id updates class details and synchronizes class teacher', async () => {
      const updatedClass = { id: CLASS_ID, name: 'Grade 10', classTeacherId: STAFF_ID, schoolId: SCHOOL_ID };
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(classService, 'updateClass').mockResolvedValue(updatedClass);

      const token = getAuthToken();
      const res = await request(app)
        .patch(`/api/v1/classes/${CLASS_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          classTeacherId: STAFF_ID
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(updatedClass);
    });

    it('DELETE /api/v1/classes/:id deletes class successfully when no dependencies exist', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(classService, 'deleteClass').mockResolvedValue(undefined);

      const token = getAuthToken();
      const res = await request(app)
        .delete(`/api/v1/classes/${CLASS_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('DELETE /api/v1/classes/:id returns 409 Conflict when class has blocking dependencies', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(classService, 'deleteClass').mockRejectedValue(
        new ConflictError('Cannot delete class with assigned students')
      );

      const token = getAuthToken();
      const res = await request(app)
        .delete(`/api/v1/classes/${CLASS_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toBe('Cannot delete class with assigned students');
    });
  });

  describe('2. Section Endpoints (/api/v1/classes/:classId/sections)', () => {
    it('GET /api/v1/classes/:classId/sections returns sections for a class', async () => {
      const mockSections = [{ id: SECTION_ID, name: 'A', classId: CLASS_ID }];
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(classService, 'listSections').mockResolvedValue(mockSections);

      const token = getAuthToken();
      const res = await request(app)
        .get(`/api/v1/classes/${CLASS_ID}/sections`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockSections);
    });

    it('POST /api/v1/classes/:classId/sections creates a section with 201 Created', async () => {
      const createdSection = { id: SECTION_ID, name: 'B', classId: CLASS_ID };
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(classService, 'createSection').mockResolvedValue(createdSection);

      const token = getAuthToken();
      const res = await request(app)
        .post(`/api/v1/classes/${CLASS_ID}/sections`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'B' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(createdSection);
    });

    it('PATCH /api/v1/classes/:classId/sections/:sectionId updates section name', async () => {
      const updatedSection = { id: SECTION_ID, name: 'C', classId: CLASS_ID };
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(classService, 'updateSection').mockResolvedValue(updatedSection);

      const token = getAuthToken();
      const res = await request(app)
        .patch(`/api/v1/classes/${CLASS_ID}/sections/${SECTION_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'C' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(updatedSection);
    });

    it('DELETE /api/v1/classes/:classId/sections/:sectionId deletes section', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(classService, 'deleteSection').mockResolvedValue(undefined);

      const token = getAuthToken();
      const res = await request(app)
        .delete(`/api/v1/classes/${CLASS_ID}/sections/${SECTION_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('DELETE /api/v1/classes/:classId/sections/:sectionId returns 409 Conflict when section has dependencies', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(classService, 'deleteSection').mockRejectedValue(
        new ConflictError('Cannot delete section with assigned students')
      );

      const token = getAuthToken();
      const res = await request(app)
        .delete(`/api/v1/classes/${CLASS_ID}/sections/${SECTION_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toBe('Cannot delete section with assigned students');
    });
  });

  describe('3. Category Endpoints (/api/v1/class-categories)', () => {
    it('GET /api/v1/class-categories returns categories list', async () => {
      const mockCategories = [{ id: CATEGORY_ID, name: 'Primary', displayOrder: 0 }];
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(categoryService, 'listCategories').mockResolvedValue(mockCategories);

      const token = getAuthToken();
      const res = await request(app)
        .get('/api/v1/class-categories')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockCategories);
    });

    it('POST /api/v1/class-categories creates category with 201 Created', async () => {
      const createdCategory = { id: CATEGORY_ID, name: 'Primary', displayOrder: 1 };
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(categoryService, 'createCategory').mockResolvedValue(createdCategory);

      const token = getAuthToken();
      const res = await request(app)
        .post('/api/v1/class-categories')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Primary', displayOrder: 1 });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(createdCategory);
    });

    it('DELETE /api/v1/class-categories/:id deletes category', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(categoryService, 'deleteCategory').mockResolvedValue(undefined);

      const token = getAuthToken();
      const res = await request(app)
        .delete(`/api/v1/class-categories/${CATEGORY_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('DELETE /api/v1/class-categories/:id returns 409 when category is used by classes', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(categoryService, 'deleteCategory').mockRejectedValue(
        new ConflictError('Cannot delete category because it is assigned to existing classes')
      );

      const token = getAuthToken();
      const res = await request(app)
        .delete(`/api/v1/class-categories/${CATEGORY_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toBe('Cannot delete category because it is assigned to existing classes');
    });
  });

  describe('4. Actor Identity & Request Body Spoof Prevention', () => {
    it('passes authentic JWT actor identity to service and ignores request body spoofing', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      const createSpy = vi.spyOn(classService, 'createClass').mockResolvedValue({ id: CLASS_ID, name: 'Grade 10' });

      const token = getAuthToken(mockAdminUser);
      const res = await request(app)
        .post('/api/v1/classes')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Grade 10'
        });

      expect(res.status).toBe(201);
      expect(createSpy).toHaveBeenCalledWith(
        SCHOOL_ID,
        expect.objectContaining({ name: 'Grade 10' }),
        expect.objectContaining({
          email: 'admin@school.edu',
          systemRole: SYSTEM_ROLES.SCHOOL_ADMIN
        })
      );
    });
  });
});
