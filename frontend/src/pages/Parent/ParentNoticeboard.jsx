import React, { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { noticesApi } from '../../api/notices';
import { getMyChildren } from '../../api/parents';
import { LuBell as Bell, LuMegaphone as Megaphone, LuUsers as Users, LuTriangleAlert as AlertTriangle } from 'react-icons/lu';
import toast from 'react-hot-toast';

export default function ParentNoticeboard() {
  const { userProfile, currentUser } = useAuth();
  const outletContext = useOutletContext();
  const activeStudentId = outletContext?.activeStudentId || userProfile?.linkedStudentId;

  const [activeTab, setActiveTab] = useState('global');
  const [globalNotices, setGlobalNotices] = useState([]);
  const [classNotices, setClassNotices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [_children, setChildren] = useState([]);

  const currentUserId = userProfile?.id || userProfile?.userId || currentUser?.uid;

  // Automatically mark unread notices as viewed via REST API
  const markUnreadAsViewed = useCallback((noticesList) => {
    if (!currentUserId || !noticesList || !Array.isArray(noticesList)) return;
    noticesList.forEach((notice) => {
      const alreadyViewed = notice.viewedBy?.some((v) => v.uid === currentUserId || v.userId === currentUserId);
      if (!alreadyViewed && notice.id) {
        noticesApi.markNoticeViewed(notice.id).catch(() => {});
      }
    });
  }, [currentUserId]);

  // Load parent's linked children from REST API
  useEffect(() => {
    let isMounted = true;
    async function loadChildren() {
      try {
        const res = await getMyChildren();
        if (isMounted && res.data) {
          const rawChildren = Array.isArray(res.data) ? res.data : [];
          setChildren(rawChildren);
        }
      } catch (err) {
        console.error('Failed to load linked children from REST:', err);
      }
    }
    loadChildren();
    return () => {
      isMounted = false;
    };
  }, []);

  // Fetch notices from REST API
  const fetchNotices = useCallback(async () => {
    setLoading(true);
    try {
      if (activeTab === 'global') {
        const res = await noticesApi.listNotices({ type: 'global', limit: 100 });
        const notices = res.data || [];
        setGlobalNotices(notices);
        markUnreadAsViewed(notices);
      } else if (activeTab === 'class') {
        const queryParams = { type: 'class', limit: 100 };
        const res = await noticesApi.listNotices(queryParams);
        const notices = res.data || [];
        setClassNotices(notices);
        markUnreadAsViewed(notices);
      }
    } catch (err) {
      console.error('Failed to load parent notices from REST:', err);
      toast.error('Failed to load notices from server.');
    } finally {
      setLoading(false);
    }
  }, [activeTab, markUnreadAsViewed]);

  useEffect(() => {
    fetchNotices();
  }, [fetchNotices, activeStudentId]);

  const displayedNotices = activeTab === 'global' ? globalNotices : classNotices;

  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto pb-24 min-w-0 w-full">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4 w-full">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3 truncate">
            <Megaphone className="text-primary-600 shrink-0" />
            Noticeboard
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">View official announcements from the school and your child's class teacher.</p>
        </div>
      </div>

      <div className="flex gap-4 mb-6 border-b border-slate-200 dark:border-slate-700 overflow-x-auto w-full custom-scrollbar shrink-0">
        <button
          onClick={() => setActiveTab('global')}
          className={`pb-3 px-4 font-bold transition-colors whitespace-nowrap ${activeTab === 'global' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
        >
          Global Notices
        </button>
        <button
          onClick={() => setActiveTab('class')}
          className={`pb-3 px-4 font-bold transition-colors whitespace-nowrap ${activeTab === 'class' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
        >
          Class Noticeboard
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-48">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent"></div>
        </div>
      ) : (
        <div className="space-y-4">
          {displayedNotices.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-700 p-12 text-center text-slate-500 dark:text-slate-400">
              <Bell size={48} className="mx-auto mb-4 text-slate-300" />
              <p className="text-lg font-medium text-slate-900 dark:text-white">No active notices</p>
              <p>You're all caught up!</p>
            </div>
          ) : (
            displayedNotices.map((notice) => {
              const isHighPriority = notice.priority === 'high';

              return (
                <div
                  key={notice.id}
                  className={`bg-white dark:bg-slate-900 rounded-3xl border p-6 flex flex-col md:flex-row gap-6 shadow-sm transition-all hover:shadow-md
                    ${isHighPriority ? 'border-red-200 bg-red-50/10' : 'border-slate-200 dark:border-slate-700'}
                  `}
                >
                  <div className="flex-1 space-y-4">
                    <div>
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        {isHighPriority && (
                          <span className="flex items-center gap-1.5 px-2.5 py-1 bg-red-100 text-red-700 rounded-lg text-xs font-bold uppercase tracking-wider">
                            <AlertTriangle size={14} /> High Priority
                          </span>
                        )}
                        {notice.className && (
                          <span className="flex items-center gap-1.5 px-2.5 py-1 bg-primary-50 text-primary-700 dark:bg-slate-700 dark:text-slate-200 rounded-lg text-xs font-bold uppercase tracking-wider">
                            Class: {notice.className}
                          </span>
                        )}
                        <span className="text-sm font-medium text-slate-400 dark:text-slate-300">
                          {notice.createdAt ? new Date(notice.createdAt).toLocaleString(undefined, {
                            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                          }) : ''}
                        </span>
                      </div>
                      <h3 className="text-xl font-bold text-slate-900 dark:text-white mt-2">{notice.title}</h3>
                    </div>

                    <div className="text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap font-medium">
                      {notice.content || notice.message}
                    </div>

                    <div className="text-sm font-medium text-slate-400 dark:text-slate-300 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center border border-slate-200 dark:border-slate-700">
                        <Users size={12} className="text-slate-500 dark:text-slate-400" />
                      </div>
                      Posted by: {notice.authorName || 'School Administration'}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
