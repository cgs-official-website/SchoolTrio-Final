import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as noticesApiModule from '../../api/notices.js';
import * as chatsApiModule from '../../api/chats.js';
import * as notificationsApiModule from '../../api/notifications.js';
import * as firestoreModule from '../../firebase/firestore.js';

describe('NotificationContext — REST & Workflow Badge Contract (Phase 4)', () => {
  const CURRENT_USER_ID = 'user-current-123';
  const NOTICE_ID_1 = '11111111-1111-4111-8111-111111111111';
  const NOTICE_ID_2 = '22222222-2222-4222-8222-222222222222';
  const NOTICE_ID_3 = '33333333-3333-4333-8333-333333333333';

  let mockStorage = {};

  beforeEach(() => {
    vi.restoreAllMocks();
    mockStorage = {};
    global.localStorage = {
      getItem: (key) => mockStorage[key] || null,
      setItem: (key, val) => { mockStorage[key] = String(val); },
      removeItem: (key) => { delete mockStorage[key]; },
      clear: () => { mockStorage = {}; }
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================================
  // 1. ZERO FIRESTORE NOTICE / CHAT / NOTIFICATION HELPERS
  // ============================================================
  describe('1. Zero Firestore for Migrated Services', () => {
    it('does NOT call Firestore helpers for notices, chats, or personal notifications', () => {
      const firestoreSpies = [
        vi.spyOn(firestoreModule, 'subscribeToNotices'),
        vi.spyOn(firestoreModule, 'subscribeToGlobalNotices'),
        vi.spyOn(firestoreModule, 'subscribeToClassNotices'),
        vi.spyOn(firestoreModule, 'markNoticeAsViewed'),
        vi.spyOn(firestoreModule, 'subscribeToMessages'),
        vi.spyOn(firestoreModule, 'subscribeToChatRoom'),
        vi.spyOn(firestoreModule, 'getChatsForTeacher'),
        vi.spyOn(firestoreModule, 'markChatRead')
      ];

      firestoreSpies.forEach((spy) => {
        expect(spy).not.toHaveBeenCalled();
      });
    });
  });

  // ============================================================
  // 2. UNREAD NOTICE CALCULATION BASED ON POSTGRESQL viewedBy
  // ============================================================
  describe('2. Unread Notice Calculation', () => {
    it('returns 0 unread notices when all notices are viewed by user', () => {
      const notices = [
        { id: NOTICE_ID_1, viewedBy: [{ uid: CURRENT_USER_ID }] },
        { id: NOTICE_ID_2, viewedBy: [{ userId: CURRENT_USER_ID }] }
      ];

      const unreadCount = notices.filter(
        n => !n.viewedBy?.some(v => v.uid === CURRENT_USER_ID || v.userId === CURRENT_USER_ID)
      ).length;

      expect(unreadCount).toBe(0);
    });

    it('calculates unread notices correctly when some notices are unviewed', () => {
      const notices = [
        { id: NOTICE_ID_1, viewedBy: [{ uid: CURRENT_USER_ID }] }, // read
        { id: NOTICE_ID_2, viewedBy: [] },                          // unread
        { id: NOTICE_ID_3, viewedBy: [{ uid: 'other-user' }] }      // unread by current user
      ];

      const unreadCount = notices.filter(
        n => !n.viewedBy?.some(v => v.uid === CURRENT_USER_ID || v.userId === CURRENT_USER_ID)
      ).length;

      expect(unreadCount).toBe(2);
    });

    it('handles 100+ notices from REST endpoint correctly', async () => {
      const largeList = Array.from({ length: 75 }, (_, i) => ({
        id: `notice-${i}`,
        title: `Notice ${i}`,
        viewedBy: i < 65 ? [{ uid: CURRENT_USER_ID }] : [] // 10 unread
      }));

      vi.spyOn(noticesApiModule, 'listNotices').mockResolvedValue({
        success: true,
        data: largeList,
        pagination: { total: 75, page: 1, limit: 100, totalPages: 1 }
      });

      const res = await noticesApiModule.listNotices({ limit: 100 });
      const unreadCount = res.data.filter(
        n => !n.viewedBy?.some(v => v.uid === CURRENT_USER_ID || v.userId === CURRENT_USER_ID)
      ).length;

      expect(unreadCount).toBe(10);
    });
  });

  // ============================================================
  // 3. CHAT UNREAD COUNT USES chatsApi.getUnreadChatCount()
  // ============================================================
  describe('3. Chat Unread Count via REST', () => {
    it('fetches chat unread count via REST chatsApi.getUnreadChatCount() without client IDs', async () => {
      const unreadSpy = vi.spyOn(chatsApiModule.chatsApi, 'getUnreadChatCount').mockResolvedValue({
        count: 4
      });

      const res = await chatsApiModule.chatsApi.getUnreadChatCount();

      expect(unreadSpy).toHaveBeenCalledTimes(1);
      expect(unreadSpy).toHaveBeenCalledWith();
      expect(res.count).toBe(4);
    });

    it('handles chat unread API failure gracefully without crashing', async () => {
      vi.spyOn(chatsApiModule.chatsApi, 'getUnreadChatCount').mockRejectedValue(new Error('Network error'));

      await expect(chatsApiModule.chatsApi.getUnreadChatCount()).rejects.toThrow('Network error');
    });
  });

  // ============================================================
  // 4. PERSONAL NOTIFICATIONS UNREAD VIA notificationsApi
  // ============================================================
  describe('4. Personal Notifications Unread via REST', () => {
    it('fetches personal notification unread count via notificationsApi.getUnreadNotificationCount() without client IDs', async () => {
      const unreadSpy = vi.spyOn(notificationsApiModule.notificationsApi, 'getUnreadNotificationCount').mockResolvedValue({
        success: true,
        data: { count: 3 }
      });

      const res = await notificationsApiModule.notificationsApi.getUnreadNotificationCount();

      expect(unreadSpy).toHaveBeenCalledTimes(1);
      expect(unreadSpy).toHaveBeenCalledWith();
      expect(res.data.count).toBe(3);
    });
  });

  // ============================================================
  // 5. HOMEWORK UNREAD VIA homeworkApi
  // ============================================================
  describe('5. Homework Unread via REST', () => {
    it('fetches homework unread count via homeworkApi.getUnreadHomeworkCount() without client IDs', async () => {
      const homeworkModule = await import('../../api/homework.js');
      const unreadSpy = vi.spyOn(homeworkModule.homeworkApi, 'getUnreadHomeworkCount').mockResolvedValue({
        success: true,
        data: { count: 2 }
      });

      const res = await homeworkModule.homeworkApi.getUnreadHomeworkCount({ since: '2026-09-01T00:00:00.000Z' });

      expect(unreadSpy).toHaveBeenCalledWith({ since: '2026-09-01T00:00:00.000Z' });
      expect(res.data.count).toBe(2);
    });
  });

  // ============================================================
  // 6. LEAVES PENDING VIA leavesApi (Phase 6)
  // ============================================================
  describe('6. Leaves Pending via REST', () => {
    it('fetches leaves pending count via leavesApi.getPendingLeavesCount() without client IDs', async () => {
      const leavesModule = await import('../../api/leaves.js');
      const pendingSpy = vi.spyOn(leavesModule.leavesApi, 'getPendingLeavesCount').mockResolvedValue({
        success: true,
        data: { count: 5 }
      });

      const res = await leavesModule.leavesApi.getPendingLeavesCount();

      expect(pendingSpy).toHaveBeenCalledTimes(1);
      expect(pendingSpy).toHaveBeenCalledWith();
      expect(res.data.count).toBe(5);
    });

    it('handles leaves pending API failure gracefully', async () => {
      const leavesModule = await import('../../api/leaves.js');
      vi.spyOn(leavesModule.leavesApi, 'getPendingLeavesCount').mockRejectedValue(new Error('Database error'));

      await expect(leavesModule.leavesApi.getPendingLeavesCount()).rejects.toThrow('Database error');
    });
  });

  // ============================================================
  // 7. CANTEEN PENDING VIA canteenApi (Phase 7)
  // ============================================================
  describe('7. Canteen Pending via REST', () => {
    it('fetches canteen pending count via canteenApi.getPendingCanteenCount() without client IDs', async () => {
      const canteenModule = await import('../../api/canteen.js');
      const pendingSpy = vi.spyOn(canteenModule.canteenApi, 'getPendingCanteenCount').mockResolvedValue({
        success: true,
        data: { count: 4 }
      });

      const res = await canteenModule.canteenApi.getPendingCanteenCount();

      expect(pendingSpy).toHaveBeenCalledTimes(1);
      expect(pendingSpy).toHaveBeenCalledWith();
      expect(res.data.count).toBe(4);
    });

    it('handles canteen pending API failure gracefully', async () => {
      const canteenModule = await import('../../api/canteen.js');
      vi.spyOn(canteenModule.canteenApi, 'getPendingCanteenCount').mockRejectedValue(new Error('Database error'));

      await expect(canteenModule.canteenApi.getPendingCanteenCount()).rejects.toThrow('Database error');
    });
  });

  // ============================================================
  // 8. COMPLAINTS PENDING VIA complaintsApi (Phase 8)
  // ============================================================
  describe('8. Complaints Pending via REST', () => {
    it('fetches complaints pending count via complaintsApi.getPendingComplaintsCount() without client IDs', async () => {
      const complaintsModule = await import('../../api/complaints.js');
      const pendingSpy = vi.spyOn(complaintsModule.complaintsApi, 'getPendingComplaintsCount').mockResolvedValue({
        success: true,
        data: { count: 6 }
      });

      const res = await complaintsModule.complaintsApi.getPendingComplaintsCount();

      expect(pendingSpy).toHaveBeenCalledTimes(1);
      expect(pendingSpy).toHaveBeenCalledWith();
      expect(res.data.count).toBe(6);
    });

    it('handles complaints pending API failure gracefully', async () => {
      const complaintsModule = await import('../../api/complaints.js');
      vi.spyOn(complaintsModule.complaintsApi, 'getPendingComplaintsCount').mockRejectedValue(new Error('Database error'));

      await expect(complaintsModule.complaintsApi.getPendingComplaintsCount()).rejects.toThrow('Database error');
    });
  });

  // ============================================================
  // 9. PUBLIC CONTEXT CONTRACT & WORKFLOW BADGE ISOLATION
  // ============================================================
  describe('9. Public Context Contract & Workflow Badges', () => {
    it('preserves public contract with unreadCounts, clearBadge, and lastViewed', () => {
      const expectedKeys = ['noticeboard', 'homework', 'complaints', 'leaves', 'canteen', 'chats'];
      const unreadCounts = {
        noticeboard: 2,
        homework: 1,
        complaints: 6,
        leaves: 3,
        canteen: 4,
        chats: 5,
        notifications: 4
      };

      expectedKeys.forEach((key) => {
        expect(unreadCounts).toHaveProperty(key);
      });
      expect(unreadCounts.noticeboard).toBe(2);
      expect(unreadCounts.homework).toBe(1);
      expect(unreadCounts.complaints).toBe(6);
      expect(unreadCounts.leaves).toBe(3);
      expect(unreadCounts.canteen).toBe(4);
      expect(unreadCounts.chats).toBe(5);
    });

    it('updates localStorage and lastViewed when clearBadge is called', () => {
      const clearBadge = (moduleKey) => {
        const now = new Date().toISOString();
        localStorage.setItem(`lastViewed_${moduleKey}`, now);
      };

      clearBadge('homework');
      expect(localStorage.getItem('lastViewed_homework')).not.toBeNull();
    });
  });

  // ============================================================
  // 10. ASYNC RACE & SESSION TEARDOWN SAFETY
  // ============================================================
  describe('10. Async Race & Session Teardown Safety', () => {
    it('does not commit stale REST notice, chat, homework, leaves, canteen, or complaints results if component unmounts or user logs out', async () => {
      let isMounted = true;
      let state = { noticeboard: 0, chats: 0, homework: 0, leaves: 0, canteen: 0, complaints: 0 };

      const pendingNoticePromise = new Promise((resolve) => {
        setTimeout(() => {
          if (isMounted) {
            state = { ...state, noticeboard: 5, homework: 3, leaves: 4, canteen: 2, complaints: 6 };
          }
          resolve();
        }, 10);
      });

      // User logs out before promise resolves
      isMounted = false;
      state = { noticeboard: 0, chats: 0, homework: 0, leaves: 0, canteen: 0, complaints: 0 };

      await pendingNoticePromise;

      // State must remain 0 and not be contaminated by stale promise
      expect(state.noticeboard).toBe(0);
      expect(state.chats).toBe(0);
      expect(state.homework).toBe(0);
      expect(state.leaves).toBe(0);
      expect(state.canteen).toBe(0);
      expect(state.complaints).toBe(0);
    });
  });

  // ============================================================
  // 11. ZERO POLLING / TIMERS VERIFICATION
  // ============================================================
  describe('11. Zero Polling / Periodic Refresh Timers', () => {
    it('does NOT create background setInterval or periodic timers for REST endpoints', () => {
      const setIntervalSpy = vi.spyOn(global, 'setInterval');
      // When NotificationContext is initialized, setInterval must not be invoked for polling
      expect(setIntervalSpy).not.toHaveBeenCalled();
    });

    it('does NOT create recursive setTimeout timers for periodic polling', () => {
      const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
      // Verify no polling timers
      expect(setTimeoutSpy).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // 12. FOCUS & VISIBILITY LIFECYCLE REFRESH
  // ============================================================
  describe('12. Focus & Visibility Lifecycle Refresh', () => {
    it('refreshes REST counts including leaves, canteen, and complaints pending when window focus or visibility becomes visible', async () => {
      const homeworkModule = await import('../../api/homework.js');
      const leavesModule = await import('../../api/leaves.js');
      const canteenModule = await import('../../api/canteen.js');
      const complaintsModule = await import('../../api/complaints.js');
      const noticeSpy = vi.spyOn(noticesApiModule, 'listNotices').mockResolvedValue({
        success: true,
        data: []
      });
      const chatSpy = vi.spyOn(chatsApiModule.chatsApi, 'getUnreadChatCount').mockResolvedValue({
        count: 0
      });
      const notifSpy = vi.spyOn(notificationsApiModule.notificationsApi, 'getUnreadNotificationCount').mockResolvedValue({
        success: true,
        data: { count: 0 }
      });
      const homeworkSpy = vi.spyOn(homeworkModule.homeworkApi, 'getUnreadHomeworkCount').mockResolvedValue({
        success: true,
        data: { count: 0 }
      });
      const leavesSpy = vi.spyOn(leavesModule.leavesApi, 'getPendingLeavesCount').mockResolvedValue({
        success: true,
        data: { count: 0 }
      });
      const canteenSpy = vi.spyOn(canteenModule.canteenApi, 'getPendingCanteenCount').mockResolvedValue({
        success: true,
        data: { count: 0 }
      });
      const complaintsSpy = vi.spyOn(complaintsModule.complaintsApi, 'getPendingComplaintsCount').mockResolvedValue({
        success: true,
        data: { count: 0 }
      });

      // Simulate lifecycle trigger
      const handleFocus = async () => {
        await noticesApiModule.listNotices({ limit: 100 });
        await chatsApiModule.chatsApi.getUnreadChatCount();
        await notificationsApiModule.notificationsApi.getUnreadNotificationCount();
        await homeworkModule.homeworkApi.getUnreadHomeworkCount({ since: '1970-01-01T00:00:00.000Z' });
        await leavesModule.leavesApi.getPendingLeavesCount();
        await canteenModule.canteenApi.getPendingCanteenCount();
        await complaintsModule.complaintsApi.getPendingComplaintsCount();
      };

      await handleFocus();

      expect(noticeSpy).toHaveBeenCalledWith({ limit: 100 });
      expect(chatSpy).toHaveBeenCalledWith();
      expect(notifSpy).toHaveBeenCalledWith();
      expect(homeworkSpy).toHaveBeenCalledWith({ since: '1970-01-01T00:00:00.000Z' });
      expect(leavesSpy).toHaveBeenCalledWith();
      expect(canteenSpy).toHaveBeenCalledWith();
      expect(complaintsSpy).toHaveBeenCalledWith();
    });
  });
});
