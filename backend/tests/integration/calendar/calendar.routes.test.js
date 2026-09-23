import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/app.js';
import * as calendarService from '../../../src/modules/calendar/calendar.service.js';
import * as authRepository from '../../../src/modules/auth/auth.repository.js';
import * as tokenService from '../../../src/modules/auth/token.service.js';
import { SYSTEM_ROLES } from '../../../src/config/constants.js';

describe('Academic Calendar Routes Integration Tests', () => {
  const app = createApp();

  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
  const OTHER_SCHOOL_ID = '99999999-9999-4999-8999-999999999999';
  const ADMIN_USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const TEACHER_USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const PARENT_USER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const EVENT_ID = '22222222-2222-4222-8222-222222222222';

  const adminUser = {
    id: ADMIN_USER_ID,
    schoolId: SCHOOL_ID,
    email: 'admin@school.com',
    systemRole: SYSTEM_ROLES.SCHOOL_ADMIN,
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

  const MOCK_EVENT = {
    id: EVENT_ID,
    schoolId: SCHOOL_ID,
    title: 'Annual Sports Day',
    date: '2026-11-15',
    endDate: '2026-11-16',
    type: 'event',
    description: 'Annual sports meet',
    audience: 'all',
    createdAt: '2026-09-16T10:00:00.000Z',
    updatedAt: '2026-09-16T10:00:00.000Z'
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
    vi.restoreAllMocks();
  });

  describe('Authentication & Security', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app).get('/api/v1/calendar/events');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/calendar/events', () => {
    it('allows Admin to list events', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminUser);
      vi.spyOn(calendarService, 'listCalendarEvents').mockResolvedValue({
        data: [MOCK_EVENT],
        total: 1,
        page: 1,
        limit: 200
      });

      const token = getAuthToken(adminUser);
      const res = await request(app)
        .get('/api/v1/calendar/events?startDate=2026-11-01&endDate=2026-11-30')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].title).toBe('Annual Sports Day');
    });

    it('allows Teacher and Parent to list events', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(parentUser);
      vi.spyOn(calendarService, 'listCalendarEvents').mockResolvedValue({
        data: [MOCK_EVENT],
        total: 1,
        page: 1,
        limit: 200
      });

      const token = getAuthToken(parentUser);
      const res = await request(app)
        .get('/api/v1/calendar/events')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });

    it('rejects invalid query date format with 400', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminUser);

      const token = getAuthToken(adminUser);
      const res = await request(app)
        .get('/api/v1/calendar/events?startDate=15-11-2026')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/calendar/events/:id', () => {
    it('returns event details when found', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminUser);
      vi.spyOn(calendarService, 'getCalendarEventById').mockResolvedValue(MOCK_EVENT);

      const token = getAuthToken(adminUser);
      const res = await request(app)
        .get(`/api/v1/calendar/events/${EVENT_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(EVENT_ID);
    });

    it('rejects non-UUID ID with 400', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminUser);

      const token = getAuthToken(adminUser);
      const res = await request(app)
        .get('/api/v1/calendar/events/non-uuid-id')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/calendar/events', () => {
    it('allows Admin to create event', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminUser);
      vi.spyOn(calendarService, 'createCalendarEvent').mockResolvedValue(MOCK_EVENT);

      const token = getAuthToken(adminUser);
      const res = await request(app)
        .post('/api/v1/calendar/events')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Annual Sports Day',
          date: '2026-11-15',
          endDate: '2026-11-16',
          type: 'event',
          description: 'Annual sports meet',
          audience: 'all'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(EVENT_ID);
    });

    it('rejects Parent from creating event with 403', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(parentUser);

      const token = getAuthToken(parentUser);
      const res = await request(app)
        .post('/api/v1/calendar/events')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Unauthorized Event',
          date: '2026-11-15',
          type: 'event'
        });

      expect(res.status).toBe(403);
    });

    it('rejects impossible date payload with 400', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminUser);

      const token = getAuthToken(adminUser);
      const res = await request(app)
        .post('/api/v1/calendar/events')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Impossible Date',
          date: '2026-02-30',
          type: 'event'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('rejects endDate earlier than date with 400', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminUser);

      const token = getAuthToken(adminUser);
      const res = await request(app)
        .post('/api/v1/calendar/events')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Invalid Range',
          date: '2026-11-20',
          endDate: '2026-11-19',
          type: 'event'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('PATCH /api/v1/calendar/events/:id', () => {
    it('allows Admin to update event', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminUser);
      vi.spyOn(calendarService, 'updateCalendarEvent').mockResolvedValue({
        ...MOCK_EVENT,
        title: 'Updated Sports Day'
      });

      const token = getAuthToken(adminUser);
      const res = await request(app)
        .patch(`/api/v1/calendar/events/${EVENT_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Updated Sports Day'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe('Updated Sports Day');
    });

    it('rejects Parent from updating event with 403', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(parentUser);

      const token = getAuthToken(parentUser);
      const res = await request(app)
        .patch(`/api/v1/calendar/events/${EVENT_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Unauthorized Update'
        });

      expect(res.status).toBe(403);
    });
  });

  describe('DELETE /api/v1/calendar/events/:id', () => {
    it('allows Admin to delete event', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminUser);
      vi.spyOn(calendarService, 'deleteCalendarEvent').mockResolvedValue({
        success: true,
        message: 'Calendar event deleted successfully'
      });

      const token = getAuthToken(adminUser);
      const res = await request(app)
        .delete(`/api/v1/calendar/events/${EVENT_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('rejects Parent from deleting event with 403', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(parentUser);

      const token = getAuthToken(parentUser);
      const res = await request(app)
        .delete(`/api/v1/calendar/events/${EVENT_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });
  });
});
