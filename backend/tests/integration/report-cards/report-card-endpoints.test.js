import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/app.js';
import * as reportCardService from '../../../src/modules/report-cards/report-card.service.js';
import * as authRepository from '../../../src/modules/auth/auth.repository.js';
import * as tokenService from '../../../src/modules/auth/token.service.js';
import { SYSTEM_ROLES } from '../../../src/config/constants.js';
import { NotFoundError, ForbiddenError } from '../../../src/utils/app-error.js';

import * as rbacService from '../../../src/modules/rbac/rbac.service.js';

describe('Report Card API Endpoints Integration & Security Tests (Phase 4C.7-C Batch 3B)', () => {
  const app = createApp();

  const SCHOOL_A = '11111111-1111-4111-8111-111111111111';
  const CLASS_ID = '33333333-3333-4333-8333-333333333333';
  const EXAM_ID = '44444444-4444-4444-8444-444444444444';
  const STUDENT_ID = '55555555-5555-4555-8555-555555555555';
  const REPORT_CARD_ID = '66666666-6666-4666-8666-666666666666';

  const mockAdminUser = {
    id: 'admin-1',
    schoolId: SCHOOL_A,
    email: 'admin@schoola.com',
    systemRole: SYSTEM_ROLES.SCHOOL_ADMIN,
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_A, name: 'School A', status: 'active' }
  };

  const mockTeacherUser = {
    id: 'teacher-1',
    schoolId: SCHOOL_A,
    email: 'teacher@schoola.com',
    systemRole: SYSTEM_ROLES.TEACHER,
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_A, name: 'School A', status: 'active' }
  };

  const mockParentUser = {
    id: 'parent-1',
    schoolId: SCHOOL_A,
    email: 'parent@schoola.com',
    systemRole: SYSTEM_ROLES.PARENT,
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_A, name: 'School A', status: 'active' }
  };

  const mockStudentUser = {
    id: 'student-1',
    schoolId: SCHOOL_A,
    email: 'student@schoola.com',
    systemRole: SYSTEM_ROLES.STUDENT,
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_A, name: 'School A', status: 'active' }
  };

  const getAuthToken = (user) => {
    return tokenService.issueAccessToken({
      sub: user.id,
      schoolId: user.schoolId,
      systemRole: user.systemRole,
      tokenVersion: user.tokenVersion
    });
  };

  beforeEach(() => {
    vi.restoreAllMocks();

    vi.spyOn(rbacService, 'getUserEffectivePermissions').mockImplementation(async (_schoolId, userId) => {
      if (userId === mockParentUser.id || userId === mockStudentUser.id) {
        return {
          exams: { canRead: false, canCreate: false, canEdit: false, canDelete: false }
        };
      }
      return {
        exams: { canRead: true, canCreate: true, canEdit: true, canDelete: false }
      };
    });

    vi.spyOn(authRepository, 'findUserById').mockImplementation(async (id) => {
      if (id === mockAdminUser.id) return mockAdminUser;
      if (id === mockTeacherUser.id) return mockTeacherUser;
      if (id === mockParentUser.id) return mockParentUser;
      if (id === mockStudentUser.id) return mockStudentUser;
      return null;
    });
  });

  // =========================================================================
  // 1. AUTHENTICATION & TENANT BOUNDARIES
  // =========================================================================
  describe('1. Authentication & Tenant Boundaries', () => {
    it('rejects unauthenticated request with 401 Unauthorized', async () => {
      const res = await request(app)
        .post('/api/v1/report-cards/preview')
        .send({ classId: CLASS_ID, examId: EXAM_ID });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('rejects inactive user with 403 Forbidden', async () => {
      const inactiveUser = { ...mockAdminUser, id: 'inactive-admin', isActive: false };
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(inactiveUser);
      const token = getAuthToken(inactiveUser);

      const res = await request(app)
        .post('/api/v1/report-cards/preview')
        .set('Authorization', `Bearer ${token}`)
        .send({ classId: CLASS_ID, examId: EXAM_ID });

      expect(res.status).toBe(403);
    });

    it('rejects stale token version with 401 Unauthorized', async () => {
      const token = tokenService.issueAccessToken({
        sub: mockAdminUser.id,
        schoolId: mockAdminUser.schoolId,
        systemRole: mockAdminUser.systemRole,
        tokenVersion: 999 // stale tokenVersion
      });

      const res = await request(app)
        .post('/api/v1/report-cards/preview')
        .set('Authorization', `Bearer ${token}`)
        .send({ classId: CLASS_ID, examId: EXAM_ID });

      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // 2. INPUT VALIDATION
  // =========================================================================
  describe('2. Input Validation', () => {
    it('returns 400 Bad Request on malformed UUID in preview body', async () => {
      const token = getAuthToken(mockAdminUser);
      const res = await request(app)
        .post('/api/v1/report-cards/preview')
        .set('Authorization', `Bearer ${token}`)
        .send({ classId: 'not-a-valid-uuid' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('returns 400 Bad Request on malformed UUID in URL params', async () => {
      const token = getAuthToken(mockAdminUser);
      const res = await request(app)
        .get('/api/v1/report-cards/not-a-valid-uuid')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('returns 400 Bad Request when studentIds array is empty in publish body', async () => {
      const token = getAuthToken(mockAdminUser);
      const res = await request(app)
        .post('/api/v1/report-cards/publish')
        .set('Authorization', `Bearer ${token}`)
        .send({ classId: CLASS_ID, examId: EXAM_ID, studentIds: [] });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  // =========================================================================
  // 3. PREVIEW ENDPOINT (POST /api/v1/report-cards/preview)
  // =========================================================================
  describe('3. POST /api/v1/report-cards/preview', () => {
    it('allows Admin to generate preview with 200 OK', async () => {
      const token = getAuthToken(mockAdminUser);
      const mockPreviewData = {
        classId: CLASS_ID,
        className: 'Grade 10 - A',
        studentsCount: 1,
        students: [{ student: { id: STUDENT_ID, firstName: 'Alice' } }]
      };

      const spy = vi.spyOn(reportCardService, 'generateReportCardPreview').mockResolvedValue(mockPreviewData);

      const res = await request(app)
        .post('/api/v1/report-cards/preview')
        .set('Authorization', `Bearer ${token}`)
        .send({ classId: CLASS_ID, examId: EXAM_ID });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.studentsCount).toBe(1);
      expect(spy).toHaveBeenCalledWith(SCHOOL_A, { classId: CLASS_ID, examId: EXAM_ID }, expect.anything());
    });

    it('allows continuous preview without examId with 200 OK', async () => {
      const token = getAuthToken(mockAdminUser);
      const mockPreviewData = {
        classId: CLASS_ID,
        className: 'Grade 10 - A',
        studentsCount: 1,
        students: []
      };

      vi.spyOn(reportCardService, 'generateReportCardPreview').mockResolvedValue(mockPreviewData);

      const res = await request(app)
        .post('/api/v1/report-cards/preview')
        .set('Authorization', `Bearer ${token}`)
        .send({ classId: CLASS_ID });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('denies Teacher outside assigned class with 403 Forbidden', async () => {
      const token = getAuthToken(mockTeacherUser);
      vi.spyOn(reportCardService, 'generateReportCardPreview').mockRejectedValue(
        new ForbiddenError('Teachers are only authorized to manage report cards for their assigned class')
      );

      const res = await request(app)
        .post('/api/v1/report-cards/preview')
        .set('Authorization', `Bearer ${token}`)
        .send({ classId: CLASS_ID });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  // =========================================================================
  // 4. PUBLISH ENDPOINT (POST /api/v1/report-cards/publish)
  // =========================================================================
  describe('4. POST /api/v1/report-cards/publish', () => {
    it('allows Admin to publish report cards with 200 OK', async () => {
      const token = getAuthToken(mockAdminUser);
      const mockPublishData = {
        publishedCount: 1,
        reportCards: [{ id: REPORT_CARD_ID, studentId: STUDENT_ID }]
      };

      const spy = vi.spyOn(reportCardService, 'publishReportCards').mockResolvedValue(mockPublishData);

      const res = await request(app)
        .post('/api/v1/report-cards/publish')
        .set('Authorization', `Bearer ${token}`)
        .send({ classId: CLASS_ID, examId: EXAM_ID, studentIds: [STUDENT_ID] });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.publishedCount).toBe(1);
      expect(spy).toHaveBeenCalledWith(SCHOOL_A, { classId: CLASS_ID, examId: EXAM_ID, studentIds: [STUDENT_ID] }, expect.anything());
    });

    it('denies Parent from publishing with 403 Forbidden', async () => {
      const token = getAuthToken(mockParentUser);

      const res = await request(app)
        .post('/api/v1/report-cards/publish')
        .set('Authorization', `Bearer ${token}`)
        .send({ classId: CLASS_ID, examId: EXAM_ID });

      expect(res.status).toBe(403);
    });

    it('denies Student from publishing with 403 Forbidden', async () => {
      const token = getAuthToken(mockStudentUser);

      const res = await request(app)
        .post('/api/v1/report-cards/publish')
        .set('Authorization', `Bearer ${token}`)
        .send({ classId: CLASS_ID, examId: EXAM_ID });

      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // 5. GET SINGLE REPORT CARD (GET /api/v1/report-cards/:id)
  // =========================================================================
  describe('5. GET /api/v1/report-cards/:id', () => {
    it('allows Admin to retrieve report card with 200 OK', async () => {
      const token = getAuthToken(mockAdminUser);
      const mockReportCard = {
        id: REPORT_CARD_ID,
        schoolId: SCHOOL_A,
        studentId: STUDENT_ID,
        title: 'Midterm Report'
      };

      vi.spyOn(reportCardService, 'getReportCard').mockResolvedValue(mockReportCard);

      const res = await request(app)
        .get(`/api/v1/report-cards/${REPORT_CARD_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(REPORT_CARD_ID);
    });

    it('returns 404 Not Found for non-existent or cross-tenant report card', async () => {
      const token = getAuthToken(mockAdminUser);
      vi.spyOn(reportCardService, 'getReportCard').mockRejectedValue(new NotFoundError('Report card not found'));

      const res = await request(app)
        .get(`/api/v1/report-cards/${REPORT_CARD_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('allows linked Parent to retrieve child report card', async () => {
      const token = getAuthToken(mockParentUser);
      const mockReportCard = {
        id: REPORT_CARD_ID,
        schoolId: SCHOOL_A,
        studentId: STUDENT_ID,
        title: 'Midterm Report'
      };

      vi.spyOn(reportCardService, 'getReportCard').mockResolvedValue(mockReportCard);

      const res = await request(app)
        .get(`/api/v1/report-cards/${REPORT_CARD_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(REPORT_CARD_ID);
    });

    it('denies unlinked Parent with 403 Forbidden', async () => {
      const token = getAuthToken(mockParentUser);
      vi.spyOn(reportCardService, 'getReportCard').mockRejectedValue(
        new ForbiddenError('Parents can only view report cards for their linked students')
      );

      const res = await request(app)
        .get(`/api/v1/report-cards/${REPORT_CARD_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // 6. LIST STUDENT REPORT CARDS (GET /api/v1/report-cards/student/:studentId)
  // =========================================================================
  describe('6. GET /api/v1/report-cards/student/:studentId', () => {
    it('returns paginated report cards for student with 200 OK', async () => {
      const token = getAuthToken(mockAdminUser);
      const mockPaginated = {
        reportCards: [{ id: REPORT_CARD_ID }],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1, hasNextPage: false, hasPrevPage: false }
      };

      vi.spyOn(reportCardService, 'listStudentReportCards').mockResolvedValue(mockPaginated);

      const res = await request(app)
        .get(`/api/v1/report-cards/student/${STUDENT_ID}?page=1&limit=20`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.pagination.total).toBe(1);
    });
  });

  // =========================================================================
  // 7. LIST CLASS REPORT CARDS (GET /api/v1/report-cards/class/:classId)
  // =========================================================================
  describe('7. GET /api/v1/report-cards/class/:classId', () => {
    it('returns paginated report cards for class with 200 OK', async () => {
      const token = getAuthToken(mockAdminUser);
      const mockPaginated = {
        reportCards: [{ id: REPORT_CARD_ID }],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1, hasNextPage: false, hasPrevPage: false }
      };

      vi.spyOn(reportCardService, 'listClassReportCards').mockResolvedValue(mockPaginated);

      const res = await request(app)
        .get(`/api/v1/report-cards/class/${CLASS_ID}?page=1&limit=20`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });
  });

  // =========================================================================
  // 8. ROUTE ORDERING / COLLISION VERIFICATION
  // =========================================================================
  describe('8. Route Ordering / Express Route Shadowing Prevention', () => {
    it('ensures GET /student/:studentId routes to listStudentReportCards instead of /:id', async () => {
      const token = getAuthToken(mockAdminUser);
      const studentSpy = vi.spyOn(reportCardService, 'listStudentReportCards').mockResolvedValue({
        reportCards: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 }
      });
      const singleSpy = vi.spyOn(reportCardService, 'getReportCard');

      const res = await request(app)
        .get(`/api/v1/report-cards/student/${STUDENT_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(studentSpy).toHaveBeenCalled();
      expect(singleSpy).not.toHaveBeenCalled();
    });

    it('ensures GET /class/:classId routes to listClassReportCards instead of /:id', async () => {
      const token = getAuthToken(mockAdminUser);
      const classSpy = vi.spyOn(reportCardService, 'listClassReportCards').mockResolvedValue({
        reportCards: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 }
      });
      const singleSpy = vi.spyOn(reportCardService, 'getReportCard');

      const res = await request(app)
        .get(`/api/v1/report-cards/class/${CLASS_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(classSpy).toHaveBeenCalled();
      expect(singleSpy).not.toHaveBeenCalled();
    });
  });
});
