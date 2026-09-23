import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as controller from '../../../src/modules/notifications/notifications.controller.js';
import * as service from '../../../src/modules/notifications/notifications.service.js';

vi.mock('../../../src/modules/notifications/notifications.service.js', () => ({
  listNotifications: vi.fn(),
  getUnreadCount: vi.fn(),
  getNotificationById: vi.fn(),
  markAsRead: vi.fn(),
  markAllAsRead: vi.fn(),
  deleteNotification: vi.fn()
}));

describe('Unit: Notification Controller Tests — Backend Notification Domain', () => {
  const SCHOOL_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const NOTIF_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

  let req, res, next;

  beforeEach(() => {
    vi.clearAllMocks();
    req = {
      tenant: { schoolId: SCHOOL_ID },
      auth: { id: USER_ID, userId: USER_ID, role: 'parent' },
      query: {},
      params: {},
      body: {}
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    };
    next = vi.fn();
  });

  describe('1. listNotifications', () => {
    it('returns paginated response with HTTP 200', async () => {
      const mockResult = {
        notifications: [{ id: NOTIF_ID }],
        pagination: { page: 1, limit: 50, total: 1, totalPages: 1 }
      };
      service.listNotifications.mockResolvedValue(mockResult);

      await controller.listNotifications(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        data: [{ id: NOTIF_ID }],
        pagination: expect.objectContaining({ total: 1 })
      }));
    });

    it('passes errors to next()', async () => {
      const error = new Error('Service error');
      service.listNotifications.mockRejectedValue(error);

      await controller.listNotifications(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('2. getUnreadCount', () => {
    it('returns unread count response with HTTP 200', async () => {
      service.getUnreadCount.mockResolvedValue({ count: 3 });

      await controller.getUnreadCount(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        data: { count: 3 }
      }));
    });
  });

  describe('3. getNotificationById', () => {
    it('returns notification by ID with HTTP 200', async () => {
      req.params.id = NOTIF_ID;
      service.getNotificationById.mockResolvedValue({ id: NOTIF_ID });

      await controller.getNotificationById(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        data: { id: NOTIF_ID }
      }));
    });
  });

  describe('4. markAsRead', () => {
    it('marks notification as read and returns HTTP 200', async () => {
      req.params.id = NOTIF_ID;
      service.markAsRead.mockResolvedValue({ id: NOTIF_ID, read: true });

      await controller.markAsRead(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        data: { id: NOTIF_ID, read: true }
      }));
    });
  });

  describe('5. markAllAsRead', () => {
    it('marks all notifications read and returns HTTP 200', async () => {
      service.markAllAsRead.mockResolvedValue({ count: 5, message: 'All notifications marked as read' });

      await controller.markAllAsRead(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        data: { count: 5, message: 'All notifications marked as read' }
      }));
    });
  });

  describe('6. deleteNotification', () => {
    it('deletes notification and returns HTTP 200', async () => {
      req.params.id = NOTIF_ID;
      service.deleteNotification.mockResolvedValue({ id: NOTIF_ID, deleted: true });

      await controller.deleteNotification(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        data: { id: NOTIF_ID, deleted: true }
      }));
    });
  });
});
