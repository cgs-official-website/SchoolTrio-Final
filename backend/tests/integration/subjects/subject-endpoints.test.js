import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/app.js';
import * as subjectService from '../../../src/modules/subjects/subject.service.js';
import * as authRepository from '../../../src/modules/auth/auth.repository.js';
import * as tokenService from '../../../src/modules/auth/token.service.js';
import { SYSTEM_ROLES } from '../../../src/config/constants.js';
import { ConflictError } from '../../../src/utils/app-error.js';

describe('Integration: Subjects Endpoints — Phase 4C.2-B', () => {
  const app = createApp();
  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
  const SUBJECT_ID = '22222222-2222-4222-8222-222222222222';

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

  describe('GET /api/v1/subjects', () => {
    it('returns paginated list of subjects', async () => {
      const mockSubjects = [{ id: SUBJECT_ID, name: 'Mathematics', code: 'MATH101', schoolId: SCHOOL_ID }];
      const mockPagination = { total: 1, page: 1, limit: 20, totalPages: 1, hasNextPage: false, hasPrevPage: false };

      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(subjectService, 'listSubjects').mockResolvedValue({ subjects: mockSubjects, pagination: mockPagination });

      const token = getAuthToken();
      const res = await request(app)
        .get('/api/v1/subjects')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockSubjects);
      expect(res.body.pagination).toBeDefined();
    });

    it('rejects unauthenticated request with 401', async () => {
      const res = await request(app).get('/api/v1/subjects');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/subjects/:id', () => {
    it('returns single subject by ID', async () => {
      const mockSubject = { id: SUBJECT_ID, name: 'Physics', code: 'PHYS101', schoolId: SCHOOL_ID };
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(subjectService, 'getSubjectById').mockResolvedValue(mockSubject);

      const token = getAuthToken();
      const res = await request(app)
        .get(`/api/v1/subjects/${SUBJECT_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockSubject);
    });

    it('rejects invalid UUID parameter with 400', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);

      const token = getAuthToken();
      const res = await request(app)
        .get('/api/v1/subjects/invalid-uuid')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/subjects', () => {
    it('creates a new subject and returns 201', async () => {
      const createdSubject = { id: SUBJECT_ID, name: 'Chemistry', code: 'CHEM101', credits: 4, schoolId: SCHOOL_ID };
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(subjectService, 'createSubject').mockResolvedValue(createdSubject);

      const token = getAuthToken();
      const res = await request(app)
        .post('/api/v1/subjects')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Chemistry', code: 'CHEM101', credits: 4 });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(createdSubject);
    });

    it('returns 409 when duplicate subject conflict occurs', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(subjectService, 'createSubject').mockRejectedValue(
        new ConflictError('Subject "Chemistry" already exists in this institution')
      );

      const token = getAuthToken();
      const res = await request(app)
        .post('/api/v1/subjects')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Chemistry' });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
    });

    it('returns 400 when name is missing', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);

      const token = getAuthToken();
      const res = await request(app)
        .post('/api/v1/subjects')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: 'CHEM101' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('PATCH /api/v1/subjects/:id', () => {
    it('updates subject and returns 200', async () => {
      const updatedSubject = { id: SUBJECT_ID, name: 'Advanced Chemistry', code: 'CHEM101', schoolId: SCHOOL_ID };
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(subjectService, 'updateSubject').mockResolvedValue(updatedSubject);

      const token = getAuthToken();
      const res = await request(app)
        .patch(`/api/v1/subjects/${SUBJECT_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Advanced Chemistry' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(updatedSubject);
    });

    it('returns 400 when update payload is empty', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);

      const token = getAuthToken();
      const res = await request(app)
        .patch(`/api/v1/subjects/${SUBJECT_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('DELETE /api/v1/subjects/:id', () => {
    it('deletes subject and returns 200 on success', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(subjectService, 'deleteSubject').mockResolvedValue(undefined);

      const token = getAuthToken();
      const res = await request(app)
        .delete(`/api/v1/subjects/${SUBJECT_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toMatch(/deleted successfully/);
    });

    it('returns 409 Conflict when dependency guard blocks deletion', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(subjectService, 'deleteSubject').mockRejectedValue(
        new ConflictError('Cannot delete subject with existing examination assessments')
      );

      const token = getAuthToken();
      const res = await request(app)
        .delete(`/api/v1/subjects/${SUBJECT_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toMatch(/examination assessments/);
    });
  });
});
