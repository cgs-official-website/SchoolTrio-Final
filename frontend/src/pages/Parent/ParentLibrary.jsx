import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getMyIssuedBooks } from '../../api/library';
import {
  LuBookOpen,
  LuSearch,
  LuCalendar,
  LuClock,
  LuCircleCheck,
  LuCircleAlert,
  LuRefreshCw,
  LuBookmark,
  LuTag
} from 'react-icons/lu';
import toast from 'react-hot-toast';

export default function ParentLibrary() {
  const { userProfile } = useAuth();
  const outletContext = useOutletContext();
  const activeStudentId = outletContext?.activeStudentId;
  const activeChild = outletContext?.activeChild;

  const studentId = activeStudentId || userProfile?.linkedStudentId;

  const resolvedStudentName =
    activeChild?.name ||
    (activeChild?.firstName
      ? `${activeChild.firstName} ${activeChild.lastName || ''}`.trim()
      : null) ||
    'Student';

  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL'); // ALL, ISSUED, RETURNED, OVERDUE

  const mountedRef = useRef(true);
  const currentStudentRef = useRef(studentId);

  const fetchIssues = useCallback(
    async (targetStudentId, isManualRefresh = false) => {
      try {
        if (isManualRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }
        setError(null);

        const params = { limit: 100 };
        if (targetStudentId) {
          params.studentId = targetStudentId;
        }

        const res = await getMyIssuedBooks(params);

        if (!mountedRef.current || currentStudentRef.current !== targetStudentId) return;

        const data = Array.isArray(res?.data)
          ? res.data
          : Array.isArray(res?.items)
          ? res.items
          : Array.isArray(res)
          ? res
          : [];

        setIssues(data);
        if (isManualRefresh) {
          toast.success('Library records updated');
        }
      } catch (err) {
        if (mountedRef.current && currentStudentRef.current === targetStudentId) {
          console.error('[ParentLibrary] Error loading issued books:', err);
          const msg = err.message || 'Failed to load library records.';
          setError(msg);
          toast.error(msg);
          setIssues([]);
        }
      } finally {
        if (mountedRef.current && currentStudentRef.current === targetStudentId) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    mountedRef.current = true;
    currentStudentRef.current = studentId;

    fetchIssues(studentId);

    return () => {
      mountedRef.current = false;
    };
  }, [studentId, fetchIssues]);

  const handleRefresh = () => {
    fetchIssues(studentId, true);
  };

  const formatDate = (dateString) => {
    if (!dateString) return '—';
    try {
      const parts = String(dateString).split('T')[0].split('-');
      if (parts.length === 3) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        const dateObj = new Date(year, month, day);
        return dateObj.toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        });
      }
      return new Date(dateString).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return String(dateString);
    }
  };

  // KPIs
  const totalIssued = issues.length;
  const currentlyActive = issues.filter(
    (i) => (i.status || '').toLowerCase() === 'issued'
  ).length;
  const returnedCount = issues.filter(
    (i) => (i.status || '').toLowerCase() === 'returned'
  ).length;
  const overdueCount = issues.filter(
    (i) => (i.status || '').toLowerCase() === 'issued' && i.isOverdue
  ).length;

  // Filtered list
  const filteredIssues = issues.filter((item) => {
    const bookTitle = (item.book?.title || item.bookName || '').toLowerCase();
    const bookAuthor = (item.book?.author || '').toLowerCase();
    const bookIsbn = (item.book?.isbn || item.bookId || '').toLowerCase();
    const query = searchTerm.toLowerCase().trim();

    const matchesSearch =
      !query ||
      bookTitle.includes(query) ||
      bookAuthor.includes(query) ||
      bookIsbn.includes(query);

    const isReturned = (item.status || '').toLowerCase() === 'returned';
    const isIssued = (item.status || '').toLowerCase() === 'issued';
    const isOverdue = isIssued && item.isOverdue;

    let matchesStatus = true;
    if (statusFilter === 'ISSUED') {
      matchesStatus = isIssued && !isOverdue;
    } else if (statusFilter === 'RETURNED') {
      matchesStatus = isReturned;
    } else if (statusFilter === 'OVERDUE') {
      matchesStatus = isOverdue;
    }

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-primary-50 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400 rounded-xl">
              <LuBookOpen className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-white">
                Library & Issued Books
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Viewing library records for{' '}
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  {resolvedStudentName}
                </span>
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={handleRefresh}
          disabled={loading || refreshing}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-sm font-medium rounded-xl transition-all shadow-sm disabled:opacity-50"
        >
          <LuRefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm flex items-center gap-4">
          <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
            <LuBookmark className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Total Issued
            </p>
            <p className="text-2xl font-bold text-slate-800 dark:text-white mt-1">
              {loading ? '—' : totalIssued}
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm flex items-center gap-4">
          <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">
            <LuClock className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Currently Holding
            </p>
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">
              {loading ? '—' : currentlyActive}
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm flex items-center gap-4">
          <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">
            <LuCircleCheck className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Returned
            </p>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
              {loading ? '—' : returnedCount}
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm flex items-center gap-4">
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400">
            <LuCircleAlert className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Overdue
            </p>
            <p className="text-2xl font-bold text-rose-600 dark:text-rose-400 mt-1">
              {loading ? '—' : overdueCount}
            </p>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <LuSearch className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by book, author, ISBN..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-800 dark:text-slate-100 placeholder-slate-400"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          {[
            { id: 'ALL', label: 'All Records' },
            { id: 'ISSUED', label: 'Issued' },
            { id: 'RETURNED', label: 'Returned' },
            { id: 'OVERDUE', label: 'Overdue' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                statusFilter === tab.id
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-12 text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-primary-500 border-t-transparent mb-3" />
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
            Loading issued books...
          </p>
        </div>
      ) : error ? (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-rose-100 dark:border-rose-900/40 p-8 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-rose-50 dark:bg-rose-900/30 text-rose-500 flex items-center justify-center mx-auto">
            <LuCircleAlert className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-slate-800 dark:text-white">
            Failed to Load Library Records
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            {error}
          </p>
          <button
            onClick={handleRefresh}
            className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold rounded-lg shadow-sm"
          >
            Try Again
          </button>
        </div>
      ) : filteredIssues.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-12 text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-slate-50 dark:bg-slate-700 text-slate-400 flex items-center justify-center mx-auto">
            <LuBookOpen className="w-7 h-7" />
          </div>
          <h3 className="text-base font-semibold text-slate-800 dark:text-white">
            No Books Found
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
            {searchTerm || statusFilter !== 'ALL'
              ? 'No issued books match your active filter criteria.'
              : 'No books have been issued.'}
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-700 bg-slate-50/75 dark:bg-slate-700/30 text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider">
                  <th className="py-3.5 px-6">Book Details</th>
                  <th className="py-3.5 px-6">Category / ISBN</th>
                  <th className="py-3.5 px-6">Issue Date</th>
                  <th className="py-3.5 px-6">Due Date</th>
                  <th className="py-3.5 px-6">Return Status</th>
                  <th className="py-3.5 px-6">Return Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700 text-sm">
                {filteredIssues.map((issue) => {
                  const isReturned =
                    (issue.status || '').toLowerCase() === 'returned';
                  const isOverdue = !isReturned && issue.isOverdue;

                  return (
                    <tr
                      key={issue.id}
                      className="hover:bg-slate-50/50 dark:hover:bg-slate-700/20 transition-colors"
                    >
                      <td className="py-4 px-6">
                        <div className="font-semibold text-slate-800 dark:text-white">
                          {issue.book?.title || issue.bookName || 'Untitled Book'}
                        </div>
                        {issue.book?.author && (
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            by {issue.book.author}
                          </div>
                        )}
                      </td>

                      <td className="py-4 px-6">
                        <div className="flex flex-col gap-1 items-start">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                            <LuTag className="w-3 h-3" />
                            {issue.book?.category || 'General'}
                          </span>
                          {issue.book?.isbn && (
                            <span className="text-xs font-mono text-slate-400">
                              ISBN: {issue.book.isbn}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-4 px-6 text-slate-600 dark:text-slate-300">
                        <div className="flex items-center gap-2">
                          <LuCalendar className="w-4 h-4 text-slate-400" />
                          <span>{formatDate(issue.issuedAt)}</span>
                        </div>
                      </td>

                      <td className="py-4 px-6 text-slate-600 dark:text-slate-300">
                        <div className="flex items-center gap-2">
                          <LuCalendar className="w-4 h-4 text-slate-400" />
                          <span
                            className={
                              isOverdue ? 'font-semibold text-rose-600' : ''
                            }
                          >
                            {formatDate(issue.dueDate)}
                          </span>
                        </div>
                      </td>

                      <td className="py-4 px-6">
                        {isReturned ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/60">
                            <LuCircleCheck className="w-3.5 h-3.5" />
                            Returned
                          </span>
                        ) : isOverdue ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 border border-rose-200/60 dark:border-rose-800/60 animate-pulse">
                            <LuCircleAlert className="w-3.5 h-3.5" />
                            Overdue
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-200/60 dark:border-blue-800/60">
                            <LuClock className="w-3.5 h-3.5" />
                            Issued
                          </span>
                        )}
                      </td>

                      <td className="py-4 px-6 text-slate-600 dark:text-slate-300">
                        {isReturned ? (
                          <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                            {formatDate(issue.returnedAt)}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-700">
            {filteredIssues.map((issue) => {
              const isReturned =
                (issue.status || '').toLowerCase() === 'returned';
              const isOverdue = !isReturned && issue.isOverdue;

              return (
                <div key={issue.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-semibold text-slate-800 dark:text-white">
                        {issue.book?.title || issue.bookName || 'Untitled Book'}
                      </h4>
                      {issue.book?.author && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          by {issue.book.author}
                        </p>
                      )}
                    </div>

                    {isReturned ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">
                        <LuCircleCheck className="w-3 h-3" />
                        Returned
                      </span>
                    ) : isOverdue ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400">
                        <LuCircleAlert className="w-3 h-3" />
                        Overdue
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                        <LuClock className="w-3 h-3" />
                        Issued
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-50 dark:border-slate-700/50">
                    <div>
                      <span className="text-slate-400">Category: </span>
                      <span className="font-medium text-slate-700 dark:text-slate-300">
                        {issue.book?.category || 'General'}
                      </span>
                    </div>
                    {issue.book?.isbn && (
                      <div>
                        <span className="text-slate-400">ISBN: </span>
                        <span className="font-mono text-slate-700 dark:text-slate-300">
                          {issue.book.isbn}
                        </span>
                      </div>
                    )}
                    <div>
                      <span className="text-slate-400">Issued: </span>
                      <span className="text-slate-700 dark:text-slate-300">
                        {formatDate(issue.issuedAt)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400">Due: </span>
                      <span
                        className={
                          isOverdue
                            ? 'font-bold text-rose-600'
                            : 'text-slate-700 dark:text-slate-300'
                        }
                      >
                        {formatDate(issue.dueDate)}
                      </span>
                    </div>
                    {isReturned && (
                      <div className="col-span-2">
                        <span className="text-slate-400">Returned on: </span>
                        <span className="font-medium text-emerald-600">
                          {formatDate(issue.returnedAt)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
