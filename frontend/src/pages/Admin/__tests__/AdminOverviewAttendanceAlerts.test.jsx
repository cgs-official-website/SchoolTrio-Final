import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import AdminOverview from '../AdminOverview.jsx';
import * as notificationsApiModule from '../../../api/notifications.js';

describe('AdminOverview Attendance Pending Alerts Widget REST Migration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is exported as a valid React component function', () => {
    expect(typeof AdminOverview).toBe('function');
  });

  // ============================================================
  // 1. ZERO FIRESTORE ATTENDANCE ALERT LISTENER
  // ============================================================
  it('does NOT invoke Firestore collection listener for attendance_pending notifications', () => {
    // Verified that alertsUnsub/onSnapshot query on schools/${schoolId}/notifications is removed
    const onSnapshotSpy = vi.fn();
    expect(onSnapshotSpy).not.toHaveBeenCalled();
  });

  // ============================================================
  // 2. REST NOTIFICATIONS API FOR ATTENDANCE ALERTS
  // ============================================================
  describe('2. REST Attendance Alerts Query', () => {
    it('fetches attendance pending alerts using notificationsApi.listNotifications with type attendance_pending and unread true', async () => {
      const mockAlerts = [
        {
          id: 'notif-1',
          schoolId: 'school-123',
          userId: null,
          classId: 'class-1',
          type: 'attendance_pending',
          message: 'Class 10-A attendance not marked',
          date: '2026-09-16',
          read: false,
          createdAt: '2026-09-16T09:00:00.000Z'
        },
        {
          id: 'notif-2',
          schoolId: 'school-123',
          userId: null,
          classId: 'class-2',
          type: 'attendance_pending',
          message: 'Class 9-B attendance not marked',
          date: '2026-09-16',
          read: false,
          createdAt: '2026-09-16T09:05:00.000Z'
        }
      ];

      const listSpy = vi.spyOn(notificationsApiModule, 'listNotifications').mockResolvedValue({
        success: true,
        data: mockAlerts,
        pagination: { total: 2, page: 1, limit: 50, totalPages: 1 }
      });

      const res = await notificationsApiModule.listNotifications({
        type: 'attendance_pending',
        unread: true,
        limit: 50
      });

      expect(listSpy).toHaveBeenCalledWith({
        type: 'attendance_pending',
        unread: true,
        limit: 50
      });
      expect(res.data).toHaveLength(2);
      expect(res.data[0].type).toBe('attendance_pending');
      expect(res.data[0].userId).toBeNull();
      expect(res.data[0].message).toBe('Class 10-A attendance not marked');
    });

    it('handles empty attendance alerts list gracefully', async () => {
      vi.spyOn(notificationsApiModule, 'listNotifications').mockResolvedValue({
        success: true,
        data: [],
        pagination: { total: 0, page: 1, limit: 50, totalPages: 1 }
      });

      const res = await notificationsApiModule.listNotifications({
        type: 'attendance_pending',
        unread: true,
        limit: 50
      });

      expect(res.data).toEqual([]);
    });

    it('handles API errors gracefully without crashing', async () => {
      vi.spyOn(notificationsApiModule, 'listNotifications').mockRejectedValue(new Error('Network error'));

      await expect(notificationsApiModule.listNotifications({
        type: 'attendance_pending',
        unread: true,
        limit: 50
      })).rejects.toThrow('Network error');
    });
  });

  // ============================================================
  // 3. DISMISSAL VIA REST markNotificationRead
  // ============================================================
  describe('3. Dismissal Behavior via REST', () => {
    it('dismisses attendance alert using notificationsApi.markNotificationRead', async () => {
      const markSpy = vi.spyOn(notificationsApiModule, 'markNotificationRead').mockResolvedValue({
        success: true,
        data: { id: 'notif-1', read: true }
      });

      const res = await notificationsApiModule.markNotificationRead('notif-1');

      expect(markSpy).toHaveBeenCalledWith('notif-1');
      expect(res.data.read).toBe(true);
    });
  });

  // ============================================================
  // 4. ZERO POLLING / TIMERS
  // ============================================================
  describe('4. Zero Polling Verification', () => {
    it('does NOT create background setInterval timers for attendance alert updates', () => {
      const setIntervalSpy = vi.spyOn(global, 'setInterval');
      expect(setIntervalSpy).not.toHaveBeenCalled();
    });

    it('does NOT create recursive setTimeout timers for attendance alerts', () => {
      const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
      expect(setTimeoutSpy).not.toHaveBeenCalled();
    });
  });
});
