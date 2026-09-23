import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { noticesApi } from '../api/notices';
import { chatsApi } from '../api/chats';
import { notificationsApi } from '../api/notifications';
import { homeworkApi } from '../api/homework';
import { leavesApi } from '../api/leaves';
import { canteenApi } from '../api/canteen';
import { complaintsApi } from '../api/complaints';

const NotificationContext = createContext();

export const useNotifications = () => useContext(NotificationContext);

export const NotificationProvider = ({ children }) => {
  const { userProfile, currentUser } = useAuth();
  const schoolId = userProfile?.schoolId;
  const role = userProfile?.role?.toLowerCase();

  const [unreadCounts, setUnreadCounts] = useState({
    noticeboard: 0,
    homework: 0,
    complaints: 0,
    leaves: 0,
    canteen: 0,
    chats: 0,
    notifications: 0
  });

  const [lastViewed, setLastViewed] = useState({
    noticeboard: localStorage.getItem('lastViewed_noticeboard') || '1970-01-01T00:00:00.000Z',
    homework: localStorage.getItem('lastViewed_homework') || '1970-01-01T00:00:00.000Z',
    notifications: localStorage.getItem('lastViewed_notifications') || '1970-01-01T00:00:00.000Z'
  });

  const clearBadge = useCallback((moduleKey) => {
    const now = new Date().toISOString();
    localStorage.setItem(`lastViewed_${moduleKey}`, now);
    setLastViewed(prev => ({ ...prev, [moduleKey]: now }));
  }, []);

  useEffect(() => {
    if (!schoolId || !currentUser) {
      setUnreadCounts({
        noticeboard: 0,
        homework: 0,
        complaints: 0,
        leaves: 0,
        canteen: 0,
        chats: 0,
        notifications: 0
      });
      return;
    }

    let isMounted = true;

    // 1. Noticeboard Unread Fetch (REST API using authoritative PostgreSQL viewedBy)
    const currentUserId = userProfile?.uid || userProfile?.id || currentUser?.uid || userProfile?.userId;

    const fetchNoticeUnread = async () => {
      try {
        const res = await noticesApi.listNotices({ limit: 100 });
        if (!isMounted) return;
        const notices = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
        const count = notices.filter((n) => {
          return !n.viewedBy?.some((v) => v.uid === currentUserId || v.userId === currentUserId);
        }).length;
        if (!isMounted) return;
        setUnreadCounts(prev => ({ ...prev, noticeboard: count }));
      } catch (err) {
        console.error("Error fetching notice unread count from REST:", err);
      }
    };

    fetchNoticeUnread();

    // 2. Chats Unread Fetch (REST API)
    const fetchChatUnread = async () => {
      if (role !== 'parent' && role !== 'teacher') return;
      try {
        const res = await chatsApi.getUnreadChatCount();
        if (!isMounted) return;
        const count = typeof res?.count === 'number' ? res.count : 0;
        if (!isMounted) return;
        setUnreadCounts(prev => ({ ...prev, chats: count }));
      } catch (err) {
        console.error("Error fetching chat unread count from REST:", err);
      }
    };

    fetchChatUnread();

    // 3. Personal / System Notifications Unread Fetch (REST API)
    const fetchNotificationUnread = async () => {
      try {
        const res = await notificationsApi.getUnreadNotificationCount();
        if (!isMounted) return;
        const count = typeof res?.data?.count === 'number' ? res.data.count : (typeof res?.count === 'number' ? res.count : 0);
        if (!isMounted) return;
        setUnreadCounts(prev => ({ ...prev, notifications: count }));
      } catch (err) {
        console.error("Error fetching personal notifications unread count from REST:", err);
      }
    };

    fetchNotificationUnread();

    // 4. Homework Unread Fetch (REST API — Parents and Teachers only, matching legacy role gate)
    const fetchHomeworkUnread = async () => {
      if (role !== 'parent' && role !== 'teacher') return;
      try {
        const since = lastViewed.homework;
        const res = await homeworkApi.getUnreadHomeworkCount({ since });
        if (!isMounted) return;
        const count = typeof res?.data?.count === 'number' ? res.data.count : (typeof res?.count === 'number' ? res.count : 0);
        if (!isMounted) return;
        setUnreadCounts(prev => ({ ...prev, homework: count }));
      } catch (err) {
        console.error("Error fetching homework unread count from REST:", err);
      }
    };

    fetchHomeworkUnread();

    // 5. Leaves Pending Fetch (REST API — Admin only, matching legacy role gate)
    const fetchLeavesPending = async () => {
      if (role !== 'admin') return;
      try {
        const res = await leavesApi.getPendingLeavesCount();
        if (!isMounted) return;
        const count = typeof res?.data?.count === 'number' ? res.data.count : (typeof res?.count === 'number' ? res.count : 0);
        if (!isMounted) return;
        setUnreadCounts(prev => ({ ...prev, leaves: count }));
      } catch (err) {
        console.error("Error fetching pending leaves count from REST:", err);
      }
    };

    fetchLeavesPending();

    // 6. Canteen Pending Fetch (REST API — Admin, Staff, and Teacher only, matching legacy role gate)
    const fetchCanteenPending = async () => {
      if (role !== 'admin' && role !== 'staff' && role !== 'teacher') return;
      try {
        const res = await canteenApi.getPendingCanteenCount();
        if (!isMounted) return;
        const count = typeof res?.data?.count === 'number' ? res.data.count : (typeof res?.count === 'number' ? res.count : 0);
        if (!isMounted) return;
        setUnreadCounts(prev => ({ ...prev, canteen: count }));
      } catch (err) {
        console.error("Error fetching pending canteen count from REST:", err);
      }
    };

    fetchCanteenPending();

    // 7. Complaints Pending Fetch (REST API — Admin only, matching legacy role gate)
    const fetchComplaintsPending = async () => {
      if (role !== 'admin') return;
      try {
        const res = await complaintsApi.getPendingComplaintsCount();
        if (!isMounted) return;
        const count = typeof res?.data?.count === 'number' ? res.data.count : (typeof res?.count === 'number' ? res.count : 0);
        if (!isMounted) return;
        setUnreadCounts(prev => ({ ...prev, complaints: count }));
      } catch (err) {
        console.error("Error fetching pending complaints count from REST:", err);
      }
    };

    fetchComplaintsPending();

    const handleFocus = () => {
      if (!isMounted) return;
      if (document.visibilityState === 'visible') {
        fetchNoticeUnread();
        fetchChatUnread();
        fetchNotificationUnread();
        fetchHomeworkUnread();
        fetchLeavesPending();
        fetchCanteenPending();
        fetchComplaintsPending();
      }
    };

    window.addEventListener('visibilitychange', handleFocus);
    window.addEventListener('focus', handleFocus);

    return () => {
      isMounted = false;
      window.removeEventListener('visibilitychange', handleFocus);
      window.removeEventListener('focus', handleFocus);
    };
  }, [schoolId, role, currentUser, userProfile?.id, userProfile?.uid, userProfile?.userId, lastViewed.noticeboard, lastViewed.homework]);

  return (
    <NotificationContext.Provider value={{ unreadCounts, clearBadge, lastViewed }}>
      {children}
    </NotificationContext.Provider>
  );
};
