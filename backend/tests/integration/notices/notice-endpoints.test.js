import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/app.js';
import * as noticeService from '../../../src/modules/notices/notice.service.js';
import * as authRepository from '../../../src/modules/auth/auth.repository.js';
import * as tokenService from '../../../src/modules/auth/token.service.js';
import { SYSTEM_ROLES } from '../../../src/config/constants.js';

describe('Integration: Notice Endpoints (/api/v1/notices) — Backend Notice Domain', () => {
  const app = createApp();
  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
  const NOTICE_ID = '22222222-2222-4222-8222-222222222222';
  const CLASS_ID = '33333333-3333-4333-8333-333333333333';

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

  describe('1. GET /api/v1/notices', () => {
    it('returns paginated list of notices for authenticated user', async () => {
      const mockNotices = [
        {
          id: NOTICE_ID,
          title: 'Sports Day',
          content: 'Sports day announcement',
          type: 'global',
          audience: 'all',
          priority: 'normal'
        }
      ];
      const mockPagination = { total: 1, page: 1, limit: 20, totalPages: 1, hasNextPage: false, hasPrevPage: false };

      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(noticeService, 'listNotices').mockResolvedValue({ notices: mockNotices, pagination: mockPagination });

      const token = getAuthToken();
      const res = await request(app)
        .get('/api/v1/notices')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockNotices);
      expect(res.body.pagination).toBeDefined();
    });

    it('rejects unauthenticated request with 401', async () => {
      const res = await request(app).get('/api/v1/notices');
      expect(res.status).toBe(401);
    });
  });

  describe('2. GET /api/v1/notices/:id', () => {
    it('returns a single notice by ID', async () => {
      const mockNotice = {
        id: NOTICE_ID,
        title: 'Sports Day',
        content: 'Sports day announcement',
        type: 'global'
      };

      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(noticeService, 'getNoticeById').mockResolvedValue(mockNotice);

      const token = getAuthToken();
      const res = await request(app)
        .get(`/api/v1/notices/${NOTICE_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockNotice);
    });
  });

  describe('3. POST /api/v1/notices', () => {
    it('creates a notice and returns 201 Created', async () => {
      const payload = {
        title: 'Exam Schedule',
        content: 'Final exams start next week.',
        type: 'global',
        audience: 'all',
        priority: 'high'
      };

      const mockCreated = {
        id: NOTICE_ID,
        ...payload
      };

      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(noticeService, 'createNotice').mockResolvedValue(mockCreated);

      const token = getAuthToken();
      const res = await request(app)
        .post('/api/v1/notices')
        .set('Authorization', `Bearer ${token}`)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe('Exam Schedule');
    });

    it('validates request body and rejects empty title with 400', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);

      const token = getAuthToken();
      const res = await request(app)
        .post('/api/v1/notices')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: '',
          content: 'Valid content'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('4. PUT / PATCH /api/v1/notices/:id', () => {
    it('updates a notice and returns 200', async () => {
      const updatePayload = {
        title: 'Updated Exam Schedule'
      };

      const mockUpdated = {
        id: NOTICE_ID,
        title: 'Updated Exam Schedule',
        content: 'Final exams start next week.'
      };

      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(noticeService, 'updateNotice').mockResolvedValue(mockUpdated);

      const token = getAuthToken();
      const res = await request(app)
        .patch(`/api/v1/notices/${NOTICE_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send(updatePayload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe('Updated Exam Schedule');
    });
  });

  describe('5. DELETE /api/v1/notices/:id', () => {
    it('deletes a notice and returns 200', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(noticeService, 'deleteNotice').mockResolvedValue({ id: NOTICE_ID, message: 'Notice deleted successfully' });

      const token = getAuthToken();
      const res = await request(app)
        .delete(`/api/v1/notices/${NOTICE_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('6. POST /api/v1/notices/:id/view', () => {
    it('records a read receipt and returns 200', async () => {
      const mockResult = {
        notice: { id: NOTICE_ID, title: 'Sports Day' },
        alreadyViewed: false
      };

      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(noticeService, 'recordNoticeView').mockResolvedValue(mockResult);

      const token = getAuthToken();
      const res = await request(app)
        .post(`/api/v1/notices/${NOTICE_ID}/view`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.alreadyViewed).toBe(false);
    });
  });
});
