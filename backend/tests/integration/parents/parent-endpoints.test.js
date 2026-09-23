import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/app.js';
import * as parentService from '../../../src/modules/parents/parent.service.js';
import * as authRepository from '../../../src/modules/auth/auth.repository.js';
import * as tokenService from '../../../src/modules/auth/token.service.js';
import { SYSTEM_ROLES } from '../../../src/config/constants.js';
import { ConflictError, NotFoundError } from '../../../src/utils/app-error.js';

describe('Integration: Parents Endpoints — Phase 4C.3-B', () => {
  const app = createApp();
  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
  const PARENT_ID = '22222222-2222-4222-8222-222222222222';
  const STUDENT_ID = '33333333-3333-4333-8333-333333333333';

  const mockAdminUser = {
    id: 'admin-1',
    schoolId: SCHOOL_ID,
    email: 'admin@school.edu',
    systemRole: SYSTEM_ROLES.SCHOOL_ADMIN,
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_ID, name: 'Spring Mount', code: 'SchoolS024', status: 'active' }
  };

  const mockParentUser = {
    id: 'parent-user-1',
    schoolId: SCHOOL_ID,
    email: 'parent@home.com',
    systemRole: SYSTEM_ROLES.PARENT,
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

  describe('1. GET /api/v1/parents', () => {
    it('returns paginated list of parents', async () => {
      const mockParents = [{ id: PARENT_ID, name: 'John Parent', email: 'parent@example.com', schoolId: SCHOOL_ID }];
      const mockPagination = { total: 1, page: 1, limit: 20, totalPages: 1, hasNextPage: false, hasPrevPage: false };

      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(parentService, 'listParents').mockResolvedValue({ parents: mockParents, pagination: mockPagination });

      const token = getAuthToken();
      const res = await request(app)
        .get('/api/v1/parents')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockParents);
      expect(res.body.pagination).toBeDefined();
    });

    it('rejects unauthenticated request with 401', async () => {
      const res = await request(app).get('/api/v1/parents');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('2. GET /api/v1/parents/:id', () => {
    it('returns single parent profile by ID', async () => {
      const mockParent = { id: PARENT_ID, name: 'John Parent', schoolId: SCHOOL_ID };
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(parentService, 'getParentById').mockResolvedValue(mockParent);

      const token = getAuthToken();
      const res = await request(app)
        .get(`/api/v1/parents/${PARENT_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockParent);
    });

    it('returns 404 when parent profile is not found', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(parentService, 'getParentById').mockRejectedValue(new NotFoundError('Parent'));

      const token = getAuthToken();
      const res = await request(app)
        .get(`/api/v1/parents/${PARENT_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('3. PATCH /api/v1/parents/:id', () => {
    it('updates parent profile and returns 200', async () => {
      const updatedParent = { id: PARENT_ID, name: 'John Updated', schoolId: SCHOOL_ID };
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(parentService, 'updateParent').mockResolvedValue(updatedParent);

      const token = getAuthToken();
      const res = await request(app)
        .patch(`/api/v1/parents/${PARENT_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'John Updated' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(updatedParent);
    });

    it('rejects empty update body with 400', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);

      const token = getAuthToken();
      const res = await request(app)
        .patch(`/api/v1/parents/${PARENT_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('4. GET /api/v1/students/:studentId/parents', () => {
    it('returns list of parents linked to a student', async () => {
      const mockParents = [{ id: 'link-1', parentProfileId: PARENT_ID, relationship: 'Father' }];
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(parentService, 'getStudentParents').mockResolvedValue(mockParents);

      const token = getAuthToken();
      const res = await request(app)
        .get(`/api/v1/students/${STUDENT_ID}/parents`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockParents);
    });
  });

  describe('5. POST /api/v1/students/:studentId/parents', () => {
    it('links parent to student and returns 201', async () => {
      const mockLink = { id: 'link-1', studentId: STUDENT_ID, parentProfileId: PARENT_ID, relationship: 'Father' };
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(parentService, 'linkParentToStudent').mockResolvedValue(mockLink);

      const token = getAuthToken();
      const res = await request(app)
        .post(`/api/v1/students/${STUDENT_ID}/parents`)
        .set('Authorization', `Bearer ${token}`)
        .send({ parentProfileId: PARENT_ID, relationship: 'Father' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockLink);
    });

    it('rejects duplicate link with 409 Conflict', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(parentService, 'linkParentToStudent').mockRejectedValue(
        new ConflictError('Parent is already linked to this student')
      );

      const token = getAuthToken();
      const res = await request(app)
        .post(`/api/v1/students/${STUDENT_ID}/parents`)
        .set('Authorization', `Bearer ${token}`)
        .send({ parentProfileId: PARENT_ID, relationship: 'Father' });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
    });
  });

  describe('6. DELETE /api/v1/students/:studentId/parents/:parentId', () => {
    it('unlinks parent from student and returns 200', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(parentService, 'unlinkParentFromStudent').mockResolvedValue();

      const token = getAuthToken();
      const res = await request(app)
        .delete(`/api/v1/students/${STUDENT_ID}/parents/${PARENT_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('unlinked successfully');
    });
  });

  describe('7. GET /api/v1/parents/me/children', () => {
    it('returns linked children for authenticated PARENT user', async () => {
      const mockChildren = [{ id: 'link-1', student: { id: STUDENT_ID, firstName: 'Alice' } }];
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockParentUser);
      vi.spyOn(parentService, 'getMyChildren').mockResolvedValue(mockChildren);

      const token = getAuthToken(mockParentUser);
      const res = await request(app)
        .get('/api/v1/parents/me/children')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockChildren);
    });

    it('rejects non-parent user with 403 Forbidden', async () => {
      const nonParentStaff = { ...mockAdminUser, systemRole: SYSTEM_ROLES.STAFF, roles: [] };
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(nonParentStaff);

      const token = getAuthToken(nonParentStaff);
      const res = await request(app)
        .get('/api/v1/parents/me/children')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });
});
