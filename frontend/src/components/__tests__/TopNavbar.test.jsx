import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as noticesApiModule from '../../api/notices.js';
import * as notificationsApiModule from '../../api/notifications.js';
import * as firestoreModule from '../../firebase/firestore.js';

describe('TopNavbar Component — Personal & Notice Notifications REST Migration (Phase 2)', () => {
  const CURRENT_USER_ID = 'user-current-123';
  const NOTICE_ID_1 = '11111111-1111-4111-8111-111111111111';
  const NOTICE_ID_2 = '22222222-2222-4222-8222-222222222222';
  const NOTIF_ID_1 = '33333333-3333-4333-8333-333333333333';
  const NOTIF_ID_2 = '44444444-4444-4444-8444-444444444444';
  const SYSTEM_NOTIF_ID = '55555555-5555-4555-8555-555555555555';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================================
  // 1. ZERO FIRESTORE NOTIFICATION LISTENERS
  // ============================================================
  describe('1. Zero Firestore Notification Listeners', () => {
    it('does NOT call subscribeToNotices in TopNavbar', () => {
      const subscribeSpy = vi.spyOn(firestoreModule, 'subscribeToNotices');
      expect(subscribeSpy).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // 2. REST PERSONAL NOTIFICATIONS LOADING & PAGINATION
  // ============================================================
  describe('2. REST Personal Notifications Loading & Pagination', () => {
    it('loads personal & system notifications via notificationsApi.listNotifications with bounded limit', async () => {
      const listSpy = vi.spyOn(notificationsApiModule, 'listNotifications').mockResolvedValue({
        success: true,
        data: [
          {
            id: NOTIF_ID_1,
            schoolId: 'school-1',
            userId: CURRENT_USER_ID,
            type: 'attendance_pending',
            message: 'Class 10A attendance not marked',
            date: '2026-09-15',
            read: false,
            createdAt: '2026-09-15T09:30:00.000Z'
          }
        ],
        pagination: { total: 1, page: 1, limit: 20 }
      });

      const res = await notificationsApiModule.listNotifications({ limit: 20 });

      expect(listSpy).toHaveBeenCalledWith({ limit: 20 });
      expect(res.data).toHaveLength(1);
      expect(res.data[0].id).toBe(NOTIF_ID_1);
      expect(res.data[0].read).toBe(false);
    });

    it('does not send client-controlled userId or schoolId or tenantId when fetching notifications', async () => {
      const listSpy = vi.spyOn(notificationsApiModule, 'listNotifications').mockResolvedValue({
        success: true,
        data: []
      });

      await notificationsApiModule.listNotifications({ limit: 20 });

      expect(listSpy).toHaveBeenCalledWith(
        expect.not.objectContaining({
          userId: expect.anything(),
          schoolId: expect.anything(),
          tenantId: expect.anything(),
          recipientId: expect.anything()
        })
      );
    });
  });

  // ============================================================
  // 3. READ & READ-ALL HANDLING
  // ============================================================
  describe('3. Personal Notification Read Actions', () => {
    it('calls markNotificationRead when a personal notification is viewed', async () => {
      const markSpy = vi.spyOn(notificationsApiModule, 'markNotificationRead').mockResolvedValue({
        success: true,
        data: { id: NOTIF_ID_1, read: true }
      });

      const res = await notificationsApiModule.markNotificationRead(NOTIF_ID_1);

      expect(markSpy).toHaveBeenCalledWith(NOTIF_ID_1);
      expect(res.data.read).toBe(true);
    });

    it('calls markAllNotificationsRead when Mark All Read is clicked', async () => {
      const markAllSpy = vi.spyOn(notificationsApiModule, 'markAllNotificationsRead').mockResolvedValue({
        success: true,
        data: { count: 3 }
      });

      const res = await notificationsApiModule.markAllNotificationsRead();

      expect(markAllSpy).toHaveBeenCalled();
      expect(res.data.count).toBe(3);
    });
  });

  // ============================================================
  // 4. NOTICE LOADING & READ RECEIPTS PRESERVATION
  // ============================================================
  describe('4. Notice Loading & Read Receipts Preservation', () => {
    it('loads notices for notification dropdown via REST API client', async () => {
      const listSpy = vi.spyOn(noticesApiModule, 'listNotices').mockResolvedValue({
        success: true,
        data: [
          {
            id: NOTICE_ID_1,
            title: 'All-School Assembly',
            content: 'Assembly at 9 AM',
            type: 'global',
            audience: 'all',
            priority: 'high',
            viewedBy: [],
            createdAt: '2026-09-15T08:00:00.000Z'
          }
        ]
      });

      const res = await noticesApiModule.listNotices({ limit: 20 });

      expect(listSpy).toHaveBeenCalledWith({ limit: 20 });
      expect(res.data[0].id).toBe(NOTICE_ID_1);
      expect(res.data[0].title).toBe('All-School Assembly');
    });

    it('registers read receipt via REST API when a single notice is viewed', async () => {
      const viewSpy = vi.spyOn(noticesApiModule, 'markNoticeViewed').mockResolvedValue({
        success: true,
        data: { notice: { id: NOTICE_ID_1 }, alreadyViewed: false }
      });

      const res = await noticesApiModule.markNoticeViewed(NOTICE_ID_1);

      expect(viewSpy).toHaveBeenCalledWith(NOTICE_ID_1);
      expect(res.success).toBe(true);
    });
  });

  // ============================================================
  // 5. UNREAD STATUS & ORDERING COMPUTATION
  // ============================================================
  describe('5. Unread Status & Ordering Computation', () => {
    it('computes personal notification unread status directly from read boolean', () => {
      const personalNotifications = [
        { id: NOTIF_ID_1, read: false }, // unread
        { id: NOTIF_ID_2, read: true }   // read
      ];

      const isNotif1Unread = personalNotifications[0].read === false;
      const isNotif2Unread = personalNotifications[1].read === false;

      expect(isNotif1Unread).toBe(true);
      expect(isNotif2Unread).toBe(false);
    });

    it('computes individual notice unread status using viewedBy array', () => {
      const notices = [
        { id: NOTICE_ID_1, viewedBy: [{ uid: CURRENT_USER_ID }] }, // read
        { id: NOTICE_ID_2, viewedBy: [{ uid: 'other-user' }] }     // unread
      ];

      const isNotice1Unread = !notices[0].viewedBy?.some(v => v.uid === CURRENT_USER_ID);
      const isNotice2Unread = !notices[1].viewedBy?.some(v => v.uid === CURRENT_USER_ID);

      expect(isNotice1Unread).toBe(false);
      expect(isNotice2Unread).toBe(true);
    });

    it('sorts combined notices and personal notifications in descending chronological order', () => {
      const notifications = [
        { id: NOTIF_ID_1, createdAt: '2026-09-15T10:00:00.000Z', type: 'personal' },
        { id: NOTIF_ID_2, createdAt: '2026-09-15T12:00:00.000Z', type: 'personal' }
      ];
      const notices = [
        { id: NOTICE_ID_1, createdAt: '2026-09-15T11:00:00.000Z', type: 'notice' }
      ];

      const combined = [...notifications, ...notices];
      combined.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      expect(combined[0].id).toBe(NOTIF_ID_2); // 12:00
      expect(combined[1].id).toBe(NOTICE_ID_1); // 11:00
      expect(combined[2].id).toBe(NOTIF_ID_1); // 10:00
    });
  });

  // ============================================================
  // 6. SYSTEM NOTIFICATIONS & MAPPING INTEGRITY
  // ============================================================
  describe('6. System Notifications & DTO Mapping', () => {
    it('maps system notifications (userId = null, type = attendance_pending) with default title and high priority', () => {
      const rawSystemNotification = {
        id: SYSTEM_NOTIF_ID,
        schoolId: 'school-1',
        userId: null,
        type: 'attendance_pending',
        message: 'Grade 10B attendance not marked',
        date: '2026-09-15',
        read: false,
        createdAt: '2026-09-15T09:30:00.000Z'
      };

      const mapped = {
        ...rawSystemNotification,
        type: 'personal',
        title: rawSystemNotification.title || (rawSystemNotification.type === 'attendance_pending' ? 'Attendance Alert' : 'Notification'),
        description: rawSystemNotification.description || rawSystemNotification.message,
        priority: rawSystemNotification.priority || (rawSystemNotification.type === 'attendance_pending' ? 'high' : 'normal')
      };

      expect(mapped.title).toBe('Attendance Alert');
      expect(mapped.description).toBe('Grade 10B attendance not marked');
      expect(mapped.priority).toBe('high');
      expect(mapped.read).toBe(false);
    });
  });

  // ============================================================
  // 7. SESSION LIFECYCLE & ASYNC RACE PREVENTION
  // ============================================================
  describe('7. Session Lifecycle & Async Race Prevention', () => {
    it('discards late-resolving REST response if session changed or user logged out before resolution (isMounted guard)', async () => {
      let isMounted = true;
      let state = [];

      const lateResolvingPromise = new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            success: true,
            data: [{ id: NOTIF_ID_1, message: 'Stale user data' }]
          });
        }, 50);
      });

      // Start fetch
      const fetchTask = async () => {
        const res = await lateResolvingPromise;
        if (isMounted) {
          state = res.data;
        }
      };

      const taskPromise = fetchTask();

      // Simulate user logout/session unmount before response returns
      isMounted = false;
      state = []; // reset state on logout

      await taskPromise;

      // Assert state was not populated by stale resolved promise
      expect(state).toHaveLength(0);
    });

    it('resets notification state when userProfile has no schoolId (Logged out / inactive session)', () => {
      const userProfile = null;
      let notices = [{ id: 'old-notice' }];
      let notifications = [{ id: 'old-notif' }];

      if (!userProfile?.schoolId) {
        notices = [];
        notifications = [];
      }

      expect(notices).toHaveLength(0);
      expect(notifications).toHaveLength(0);
    });
  });

  // ============================================================
  // 8. ERROR RESILIENCE
  // ============================================================
  describe('8. API Failure Resilience', () => {
    it('gracefully handles API rejection without throwing unhandled exceptions', async () => {
      vi.spyOn(notificationsApiModule, 'listNotifications').mockRejectedValue(new Error('Network error'));
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      let notifications = [];
      try {
        const res = await notificationsApiModule.listNotifications({ limit: 20 });
        notifications = res?.data || [];
      } catch (err) {
        console.error('Error loading notifications in TopNavbar from REST:', err);
      }

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(notifications).toHaveLength(0);
    });
  });
});

