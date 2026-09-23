import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as repository from '../../../src/modules/notifications/notifications.repository.js';
import { prisma } from '../../../src/database/prisma.client.js';

vi.mock('../../../src/database/prisma.client.js', () => ({
  prisma: {
    notification: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      create: vi.fn()
    }
  }
}));

describe('Unit: Notification Repository Tests — Backend Notification Domain', () => {
  const SCHOOL_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const NOTIF_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. buildNotificationWhere', () => {
    it('constructs base tenant where clause', () => {
      const where = repository.buildNotificationWhere(SCHOOL_ID);
      expect(where.schoolId).toBe(SCHOOL_ID);
    });

    it('applies recipientFilter', () => {
      const recipientFilter = { OR: [{ userId: USER_ID }, { userId: null }] };
      const where = repository.buildNotificationWhere(SCHOOL_ID, { recipientFilter });
      expect(where.schoolId).toBe(SCHOOL_ID);
      expect(where.OR).toEqual([{ userId: USER_ID }, { userId: null }]);
    });

    it('applies unread boolean filtering', () => {
      const unreadWhere = repository.buildNotificationWhere(SCHOOL_ID, { unread: true });
      expect(unreadWhere.read).toBe(false);

      const readWhere = repository.buildNotificationWhere(SCHOOL_ID, { unread: false });
      expect(readWhere.read).toBe(true);
    });

    it('applies type and date filters', () => {
      const where = repository.buildNotificationWhere(SCHOOL_ID, {
        type: 'attendance_pending',
        date: '2026-09-15'
      });
      expect(where.type).toBe('attendance_pending');
      expect(where.date).toBe('2026-09-15');
    });
  });

  describe('2. findNotifications', () => {
    it('executes findMany and count in parallel with pagination and sorting', async () => {
      const mockNotifications = [{ id: NOTIF_ID, schoolId: SCHOOL_ID, message: 'Test alert' }];
      prisma.notification.findMany.mockResolvedValue(mockNotifications);
      prisma.notification.count.mockResolvedValue(1);

      const result = await repository.findNotifications(
        SCHOOL_ID,
        { recipientFilter: { OR: [{ userId: USER_ID }] } },
        { page: 2, limit: 10 },
        { sort: 'createdAt', order: 'desc' }
      );

      expect(prisma.notification.findMany).toHaveBeenCalledWith({
        where: {
          schoolId: SCHOOL_ID,
          OR: [{ userId: USER_ID }]
        },
        skip: 10,
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          class: {
            select: {
              id: true,
              name: true
            }
          }
        }
      });
      expect(result.notifications).toEqual(mockNotifications);
      expect(result.total).toBe(1);
    });
  });

  describe('3. countUnreadNotifications', () => {
    it('calls count with read: false and recipientFilter', async () => {
      prisma.notification.count.mockResolvedValue(5);

      const count = await repository.countUnreadNotifications(SCHOOL_ID, {
        recipientFilter: { OR: [{ userId: USER_ID }] },
        type: 'leave_submitted'
      });

      expect(prisma.notification.count).toHaveBeenCalledWith({
        where: {
          schoolId: SCHOOL_ID,
          OR: [{ userId: USER_ID }],
          read: false,
          type: 'leave_submitted'
        }
      });
      expect(count).toBe(5);
    });
  });

  describe('4. findNotificationById', () => {
    it('queries by compound tenant and id', async () => {
      const mockNotif = { id: NOTIF_ID, schoolId: SCHOOL_ID };
      prisma.notification.findFirst.mockResolvedValue(mockNotif);

      const result = await repository.findNotificationById(SCHOOL_ID, NOTIF_ID);

      expect(prisma.notification.findFirst).toHaveBeenCalledWith({
        where: {
          schoolId: SCHOOL_ID,
          id: NOTIF_ID
        },
        include: {
          class: {
            select: {
              id: true,
              name: true
            }
          }
        }
      });
      expect(result).toEqual(mockNotif);
    });
  });

  describe('5. markNotificationRead', () => {
    it('updates read status using compound unique key', async () => {
      const mockNotif = { id: NOTIF_ID, schoolId: SCHOOL_ID, read: true };
      prisma.notification.update.mockResolvedValue(mockNotif);

      const result = await repository.markNotificationRead(SCHOOL_ID, NOTIF_ID);

      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: {
          schoolId_id: {
            schoolId: SCHOOL_ID,
            id: NOTIF_ID
          }
        },
        data: {
          read: true
        },
        include: {
          class: {
            select: {
              id: true,
              name: true
            }
          }
        }
      });
      expect(result).toEqual(mockNotif);
    });
  });

  describe('6. markAllNotificationsRead', () => {
    it('executes atomic updateMany for tenant unread notifications', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 7 });

      const result = await repository.markAllNotificationsRead(
        SCHOOL_ID,
        { OR: [{ userId: USER_ID }] },
        'fee_reminder'
      );

      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: {
          schoolId: SCHOOL_ID,
          OR: [{ userId: USER_ID }],
          read: false,
          type: 'fee_reminder'
        },
        data: {
          read: true
        }
      });
      expect(result.count).toBe(7);
    });
  });

  describe('7. deleteNotification', () => {
    it('deletes notification with compound unique key', async () => {
      prisma.notification.delete.mockResolvedValue({ id: NOTIF_ID });

      const result = await repository.deleteNotification(SCHOOL_ID, NOTIF_ID);

      expect(prisma.notification.delete).toHaveBeenCalledWith({
        where: {
          schoolId_id: {
            schoolId: SCHOOL_ID,
            id: NOTIF_ID
          }
        }
      });
      expect(result.id).toBe(NOTIF_ID);
    });
  });
});
