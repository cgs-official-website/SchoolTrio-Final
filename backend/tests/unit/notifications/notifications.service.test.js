import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as service from '../../../src/modules/notifications/notifications.service.js';
import * as repository from '../../../src/modules/notifications/notifications.repository.js';
import { NotFoundError, TenantAccessError, ValidationError } from '../../../src/utils/app-error.js';
import { SYSTEM_ROLES } from '../../../src/config/constants.js';

vi.mock('../../../src/modules/notifications/notifications.repository.js', () => ({
  findNotifications: vi.fn(),
  countUnreadNotifications: vi.fn(),
  findNotificationById: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  deleteNotification: vi.fn()
}));

describe('Unit: Notification Service Tests — Backend Notification Domain', () => {
  const SCHOOL_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const OTHER_USER_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const NOTIF_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

  const userActor = {
    id: USER_ID,
    userId: USER_ID,
    systemRole: SYSTEM_ROLES.PARENT,
    role: 'parent'
  };

  const adminActor = {
    id: USER_ID,
    userId: USER_ID,
    systemRole: SYSTEM_ROLES.SCHOOL_ADMIN,
    role: 'admin'
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. formatNotification', () => {
    it('formats a notification entity into safe DTO with className', () => {
      const raw = {
        id: NOTIF_ID,
        schoolId: SCHOOL_ID,
        userId: USER_ID,
        classId: 'class-123',
        class: { name: 'Grade 5', section: 'A' },
        type: 'homework_assigned',
        message: 'Math homework due tomorrow',
        date: '2026-09-16',
        read: false,
        createdAt: new Date('2026-09-15T10:00:00Z')
      };

      const dto = service.formatNotification(raw);
      expect(dto).toEqual({
        id: NOTIF_ID,
        schoolId: SCHOOL_ID,
        userId: USER_ID,
        classId: 'class-123',
        className: 'Grade 5 - A',
        type: 'homework_assigned',
        message: 'Math homework due tomorrow',
        date: '2026-09-16',
        read: false,
        createdAt: new Date('2026-09-15T10:00:00Z')
      });
    });

    it('returns null if input is null/undefined', () => {
      expect(service.formatNotification(null)).toBeNull();
    });
  });

  describe('2. buildRecipientFilter', () => {
    it('scopes regular user strictly to their own userId', () => {
      const filter = service.buildRecipientFilter(userActor);
      expect(filter).toEqual({
        OR: [{ userId: USER_ID }]
      });
    });

    it('scopes administrative actor to own userId and null userId (system-wide alerts)', () => {
      const filter = service.buildRecipientFilter(adminActor);
      expect(filter).toEqual({
        OR: [{ userId: USER_ID }, { userId: null }]
      });
    });

    it('throws ValidationError if actor has no userId', () => {
      expect(() => service.buildRecipientFilter({})).toThrow(ValidationError);
    });
  });

  describe('3. listNotifications', () => {
    it('lists notifications for authenticated user with bounded pagination', async () => {
      const mockRows = [
        { id: NOTIF_ID, schoolId: SCHOOL_ID, userId: USER_ID, type: 'general', message: 'Hello', read: false }
      ];
      repository.findNotifications.mockResolvedValue({ notifications: mockRows, total: 1 });

      const result = await service.listNotifications(SCHOOL_ID, { page: 1, limit: 10 }, userActor);

      expect(repository.findNotifications).toHaveBeenCalledWith(
        SCHOOL_ID,
        {
          recipientFilter: { OR: [{ userId: USER_ID }] },
          unread: undefined,
          type: undefined,
          date: undefined
        },
        { page: 1, limit: 10 },
        { sort: 'createdAt', order: 'desc' }
      );
      expect(result.notifications).toHaveLength(1);
      expect(result.pagination.total).toBe(1);
    });

    it('throws TenantAccessError if schoolId is missing', async () => {
      await expect(service.listNotifications(null, {}, userActor)).rejects.toThrow(TenantAccessError);
    });
  });

  describe('4. getUnreadCount', () => {
    it('returns unread count for authenticated user', async () => {
      repository.countUnreadNotifications.mockResolvedValue(4);

      const result = await service.getUnreadCount(SCHOOL_ID, { type: 'leave_submitted' }, userActor);

      expect(repository.countUnreadNotifications).toHaveBeenCalledWith(
        SCHOOL_ID,
        {
          recipientFilter: { OR: [{ userId: USER_ID }] },
          type: 'leave_submitted'
        }
      );
      expect(result).toEqual({ count: 4 });
    });
  });

  describe('5. getNotificationById', () => {
    it('retrieves notification belonging to the authenticated user', async () => {
      const mockNotif = { id: NOTIF_ID, schoolId: SCHOOL_ID, userId: USER_ID, message: 'Your test', read: false };
      repository.findNotificationById.mockResolvedValue(mockNotif);

      const result = await service.getNotificationById(SCHOOL_ID, NOTIF_ID, userActor);
      expect(result.id).toBe(NOTIF_ID);
    });

    it('allows admin to view system-level notification with userId: null', async () => {
      const mockNotif = { id: NOTIF_ID, schoolId: SCHOOL_ID, userId: null, type: 'attendance_pending', read: false };
      repository.findNotificationById.mockResolvedValue(mockNotif);

      const result = await service.getNotificationById(SCHOOL_ID, NOTIF_ID, adminActor);
      expect(result.id).toBe(NOTIF_ID);
    });

    it('throws NotFoundError when regular user accesses another user notification', async () => {
      const mockNotif = { id: NOTIF_ID, schoolId: SCHOOL_ID, userId: OTHER_USER_ID, message: 'Private', read: false };
      repository.findNotificationById.mockResolvedValue(mockNotif);

      await expect(service.getNotificationById(SCHOOL_ID, NOTIF_ID, userActor)).rejects.toThrow(NotFoundError);
    });

    it('throws NotFoundError when regular user accesses system notification with userId: null', async () => {
      const mockNotif = { id: NOTIF_ID, schoolId: SCHOOL_ID, userId: null, type: 'attendance_pending', read: false };
      repository.findNotificationById.mockResolvedValue(mockNotif);

      await expect(service.getNotificationById(SCHOOL_ID, NOTIF_ID, userActor)).rejects.toThrow(NotFoundError);
    });
  });

  describe('6. markAsRead', () => {
    it('marks notification as read for authorized recipient', async () => {
      const mockNotif = { id: NOTIF_ID, schoolId: SCHOOL_ID, userId: USER_ID, read: false };
      const updatedNotif = { ...mockNotif, read: true };
      repository.findNotificationById.mockResolvedValue(mockNotif);
      repository.markNotificationRead.mockResolvedValue(updatedNotif);

      const result = await service.markAsRead(SCHOOL_ID, NOTIF_ID, userActor);

      expect(repository.markNotificationRead).toHaveBeenCalledWith(SCHOOL_ID, NOTIF_ID);
      expect(result.read).toBe(true);
    });

    it('returns formatted notification directly if already read', async () => {
      const mockNotif = { id: NOTIF_ID, schoolId: SCHOOL_ID, userId: USER_ID, read: true };
      repository.findNotificationById.mockResolvedValue(mockNotif);

      const result = await service.markAsRead(SCHOOL_ID, NOTIF_ID, userActor);

      expect(repository.markNotificationRead).not.toHaveBeenCalled();
      expect(result.read).toBe(true);
    });

    it('rejects marking read on another user notification with NotFoundError', async () => {
      const mockNotif = { id: NOTIF_ID, schoolId: SCHOOL_ID, userId: OTHER_USER_ID, read: false };
      repository.findNotificationById.mockResolvedValue(mockNotif);

      await expect(service.markAsRead(SCHOOL_ID, NOTIF_ID, userActor)).rejects.toThrow(NotFoundError);
      expect(repository.markNotificationRead).not.toHaveBeenCalled();
    });
  });

  describe('7. markAllAsRead', () => {
    it('marks all notifications read scoped to user and tenant', async () => {
      repository.markAllNotificationsRead.mockResolvedValue({ count: 3 });

      const result = await service.markAllAsRead(SCHOOL_ID, { type: 'fee_reminder' }, userActor);

      expect(repository.markAllNotificationsRead).toHaveBeenCalledWith(
        SCHOOL_ID,
        { OR: [{ userId: USER_ID }] },
        'fee_reminder'
      );
      expect(result).toEqual({ count: 3, message: 'All notifications marked as read' });
    });
  });

  describe('8. deleteNotification', () => {
    it('deletes notification belonging to the authenticated user', async () => {
      const mockNotif = { id: NOTIF_ID, schoolId: SCHOOL_ID, userId: USER_ID };
      repository.findNotificationById.mockResolvedValue(mockNotif);
      repository.deleteNotification.mockResolvedValue({ id: NOTIF_ID });

      const result = await service.deleteNotification(SCHOOL_ID, NOTIF_ID, userActor);

      expect(repository.deleteNotification).toHaveBeenCalledWith(SCHOOL_ID, NOTIF_ID);
      expect(result).toEqual({ id: NOTIF_ID, deleted: true });
    });

    it('rejects deleting another user notification with NotFoundError', async () => {
      const mockNotif = { id: NOTIF_ID, schoolId: SCHOOL_ID, userId: OTHER_USER_ID };
      repository.findNotificationById.mockResolvedValue(mockNotif);

      await expect(service.deleteNotification(SCHOOL_ID, NOTIF_ID, userActor)).rejects.toThrow(NotFoundError);
      expect(repository.deleteNotification).not.toHaveBeenCalled();
    });
  });
});
