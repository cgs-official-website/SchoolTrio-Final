import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/app.js';
import * as studentService from '../../../src/modules/students/student.service.js';
import * as authRepository from '../../../src/modules/auth/auth.repository.js';
import * as tokenService from '../../../src/modules/auth/token.service.js';
import { SYSTEM_ROLES } from '../../../src/config/constants.js';
import { ConflictError, NotFoundError } from '../../../src/utils/app-error.js';

describe('Integration: Students Endpoints — Phase 4C.3-A', () => {
  const app = createApp();
  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
  const STUDENT_ID = '22222222-2222-4222-8222-222222222222';

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

  describe('GET /api/v1/students', () => {
    it('returns paginated list of students', async () => {
      const mockStudents = [{ id: STUDENT_ID, admissionNumber: 'ADM-101', firstName: 'John', lastName: 'Doe', schoolId: SCHOOL_ID }];
      const mockPagination = { total: 1, page: 1, limit: 20, totalPages: 1, hasNextPage: false, hasPrevPage: false };

      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(studentService, 'listStudents').mockResolvedValue({ students: mockStudents, pagination: mockPagination });

      const token = getAuthToken();
      const res = await request(app)
        .get('/api/v1/students')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockStudents);
      expect(res.body.pagination).toBeDefined();
    });

    it('rejects unauthenticated request with 401', async () => {
      const res = await request(app).get('/api/v1/students');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/students/:id', () => {
    it('returns single student by ID', async () => {
      const mockStudent = { id: STUDENT_ID, admissionNumber: 'ADM-101', firstName: 'John', lastName: 'Doe', schoolId: SCHOOL_ID };
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(studentService, 'getStudentById').mockResolvedValue(mockStudent);

      const token = getAuthToken();
      const res = await request(app)
        .get(`/api/v1/students/${STUDENT_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockStudent);
    });

    it('rejects invalid UUID parameter with 400', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);

      const token = getAuthToken();
      const res = await request(app)
        .get('/api/v1/students/not-a-valid-uuid')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 404 when student is not found', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(studentService, 'getStudentById').mockRejectedValue(new NotFoundError('Student'));

      const token = getAuthToken();
      const res = await request(app)
        .get(`/api/v1/students/${STUDENT_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('POST /api/v1/students', () => {
    it('creates a new student and returns 201', async () => {
      const payload = {
        admissionNumber: 'ADM-202',
        firstName: 'Alice',
        lastName: 'Smith',
        status: 'Active'
      };
      const createdStudent = { id: 'new-uuid', schoolId: SCHOOL_ID, ...payload };

      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(studentService, 'createStudent').mockResolvedValue(createdStudent);

      const token = getAuthToken();
      const res = await request(app)
        .post('/api/v1/students')
        .set('Authorization', `Bearer ${token}`)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(createdStudent);
    });

    it('rejects duplicate admission number with 409', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(studentService, 'createStudent').mockRejectedValue(
        new ConflictError('Admission number "ADM-202" is already registered in this institution')
      );

      const token = getAuthToken();
      const res = await request(app)
        .post('/api/v1/students')
        .set('Authorization', `Bearer ${token}`)
        .send({ admissionNumber: 'ADM-202', firstName: 'Alice' });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CONFLICT');
    });
  });

  describe('PATCH /api/v1/students/:id', () => {
    it('updates a student and returns 200', async () => {
      const updatedStudent = { id: STUDENT_ID, admissionNumber: 'ADM-101', firstName: 'Johnny', schoolId: SCHOOL_ID };

      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(studentService, 'updateStudent').mockResolvedValue(updatedStudent);

      const token = getAuthToken();
      const res = await request(app)
        .patch(`/api/v1/students/${STUDENT_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ firstName: 'Johnny' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(updatedStudent);
    });

    it('rejects empty update payload with 400', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);

      const token = getAuthToken();
      const res = await request(app)
        .patch(`/api/v1/students/${STUDENT_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('DELETE /api/v1/students/:id', () => {
    it('deletes a student and returns 200', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(studentService, 'deleteStudent').mockResolvedValue();

      const token = getAuthToken();
      const res = await request(app)
        .delete(`/api/v1/students/${STUDENT_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Student deleted successfully');
    });

    it('returns 409 when deletion is blocked by dependent records', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(studentService, 'deleteStudent').mockRejectedValue(
        new ConflictError('Cannot delete student with associated billing invoices')
      );

      const token = getAuthToken();
      const res = await request(app)
        .delete(`/api/v1/students/${STUDENT_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CONFLICT');
    });
  });
});
