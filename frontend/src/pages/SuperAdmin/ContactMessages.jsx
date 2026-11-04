import React, { useState, useEffect, useCallback } from 'react';
import { 
  LuMail, 
  LuSearch, 
  LuSparkles, 
  LuClock, 
  LuCheckCheck, 
  LuArchive, 
  LuInbox, 
  LuEye, 
  LuSend, 
  LuX, 
  LuRefreshCw, 
  LuTriangleAlert, 
  LuCircleCheck, 
  LuUser, 
  LuChevronLeft, 
  LuChevronRight,
  LuMessageSquare,
  LuExternalLink
} from 'react-icons/lu';
import toast from 'react-hot-toast';
import { 
  getContactMessages, 
  getContactMessage, 
  updateContactMessageStatus, 
  replyContactMessage 
} from '../../api/contactMessages';
import { useLiveDataRefresh } from '../../hooks/useLiveDataRefresh';

export default function ContactMessages() {
  const [messages, setMessages] = useState([]);
  const [stats, setStats] = useState({
    total: 0,
    new: 0,
    inProgress: 0,
    replied: 0,
    closed: 0
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters & Pagination
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1
  });

  // Modal & Reply State
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [submittingReply, setSubmittingReply] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const fetchMessages = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);

    try {
      const res = await getContactMessages({
        search: searchTerm.trim() || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        sortBy: 'createdAt',
        sortOrder,
        page: currentPage,
        limit: 10
      });

      if (res?.data) {
        setMessages(res.data.messages || []);
        if (res.data.stats) setStats(res.data.stats);
        if (res.data.pagination) setPagination(res.data.pagination);
      }
    } catch (err) {
      console.error('Failed to fetch contact messages:', err);
      toast.error('Failed to load contact messages');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [searchTerm, statusFilter, sortOrder, currentPage]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Live auto-refresh when events trigger
  useLiveDataRefresh(() => fetchMessages(true), [fetchMessages], ['contact-messages', 'inquiries']);

  // Handle open message detail modal
  const handleOpenDetail = async (msg) => {
    setSelectedMessage(msg);
    setReplyText('');
    setLoadingDetail(true);

    try {
      const res = await getContactMessage(msg.id);
      if (res?.data) {
        setSelectedMessage(res.data);
      }
    } catch (err) {
      console.error('Failed to load full message detail:', err);
      toast.error('Failed to load full message details');
    } finally {
      setLoadingDetail(false);
    }
  };

  // Handle Status Update
  const handleStatusChange = async (newStatus) => {
    if (!selectedMessage || updatingStatus) return;
    setUpdatingStatus(true);
    try {
      await updateContactMessageStatus(selectedMessage.id, newStatus);
      toast.success(`Message marked as ${newStatus.replace('_', ' ')}`);
      
      // Update local modal state
      setSelectedMessage(prev => prev ? { ...prev, status: newStatus } : null);
      
      // Refresh list
      fetchMessages(true);
    } catch (err) {
      console.error('Failed to update status:', err);
      toast.error(err.message || 'Failed to update message status');
    } finally {
      setUpdatingStatus(false);
    }
  };

  // Handle Admin Reply Submission
  const handleSendReply = async (e) => {
    e.preventDefault();
    if (!selectedMessage || !replyText.trim() || submittingReply) return;

    setSubmittingReply(true);
    try {
      const res = await replyContactMessage(selectedMessage.id, replyText.trim());
      
      const emailStatus = res?.data?.emailDeliveryStatus;
      if (emailStatus === 'sent') {
        toast.success('Reply saved and email dispatched to visitor!');
      } else if (emailStatus === 'not_configured') {
        toast('Reply saved to database. (Email provider not configured on server)', {
          icon: 'ℹ️'
        });
      } else if (emailStatus === 'failed') {
        toast.error(`Reply saved to database, but email failed: ${res?.data?.emailDeliveryError || 'Unknown delivery error'}`);
      } else {
        toast.success('Reply submitted successfully');
      }

      setReplyText('');
      
      // Reload message detail to reflect new reply and 'replied' status
      const updated = await getContactMessage(selectedMessage.id);
      if (updated?.data) {
        setSelectedMessage(updated.data);
      }
      
      // Refresh list & metrics
      fetchMessages(true);
    } catch (err) {
      console.error('Failed to send reply:', err);
      toast.error(err.message || 'Failed to send reply');
    } finally {
      setSubmittingReply(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'new':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
            NEW
          </span>
        );
      case 'read':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300">
            <LuEye size={13} />
            Read
          </span>
        );
      case 'in_progress':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300">
            <LuClock size={13} />
            In Progress
          </span>
        );
      case 'replied':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
            <LuCheckCheck size={13} />
            Replied
          </span>
        );
      case 'closed':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
            <LuArchive size={13} />
            Closed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
            {status}
          </span>
        );
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto flex flex-col min-w-0">
      {/* Header */}
      <div className="mb-8 shrink-0 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
            <LuMail className="text-primary-600 shrink-0" /> Contact Messages
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Manage, review, and respond to public inquiries submitted via the public contact website.
          </p>
        </div>
        <button
          onClick={() => fetchMessages(true)}
          disabled={refreshing || loading}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-sm transition-colors shadow-sm disabled:opacity-50"
          title="Refresh Messages"
        >
          <LuRefreshCw size={16} className={refreshing ? 'animate-spin text-primary-600' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8 shrink-0">
        {/* Total */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary-50 dark:bg-primary-950/40 text-primary-600 flex items-center justify-center shrink-0">
            <LuInbox size={22} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total</p>
            <p className="text-2xl font-black text-slate-900 dark:text-white">{stats.total}</p>
          </div>
        </div>

        {/* New */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 flex items-center justify-center shrink-0">
            <LuSparkles size={22} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">New</p>
            <p className="text-2xl font-black text-rose-600">{stats.new}</p>
          </div>
        </div>

        {/* In Progress */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 flex items-center justify-center shrink-0">
            <LuClock size={22} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">In Progress</p>
            <p className="text-2xl font-black text-amber-600">{stats.inProgress}</p>
          </div>
        </div>

        {/* Replied */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 flex items-center justify-center shrink-0">
            <LuCheckCheck size={22} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Replied</p>
            <p className="text-2xl font-black text-emerald-600">{stats.replied}</p>
          </div>
        </div>

        {/* Closed */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4 col-span-2 lg:col-span-1">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center shrink-0">
            <LuArchive size={22} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Closed</p>
            <p className="text-2xl font-black text-slate-800 dark:text-slate-200">{stats.closed}</p>
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col overflow-hidden mb-6">
        {/* Search & Filters Toolbar */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between shrink-0">
          <div className="relative flex-1 max-w-full md:max-w-md">
            <LuSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Search by sender name or email address..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-medium text-sm outline-none transition-all"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 font-semibold text-sm outline-none cursor-pointer"
              >
                <option value="all">All Statuses</option>
                <option value="new">New</option>
                <option value="read">Read</option>
                <option value="in_progress">In Progress</option>
                <option value="replied">Replied</option>
                <option value="closed">Closed</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Sort:</span>
              <select
                value={sortOrder}
                onChange={(e) => {
                  setSortOrder(e.target.value);
                  setCurrentPage(1);
                }}
                className="px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 font-semibold text-sm outline-none cursor-pointer"
              >
                <option value="desc">Latest First</option>
                <option value="asc">Oldest First</option>
              </select>
            </div>
          </div>
        </div>

        {/* Table Content */}
        <div className="w-full min-w-0 overflow-x-auto custom-scrollbar flex-1">
          {loading ? (
            <div className="p-16 text-center text-slate-500 dark:text-slate-400">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent mx-auto mb-4"></div>
              <p className="font-semibold text-sm">Loading contact inquiries...</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse min-w-max">
              <thead className="sticky top-0 bg-white dark:bg-slate-900 shadow-sm z-10">
                <tr className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs uppercase tracking-wider border-b border-slate-200 dark:border-slate-700">
                  <th className="p-4 font-bold">Message ID</th>
                  <th className="p-4 font-bold">Sender Name</th>
                  <th className="p-4 font-bold">Email Address</th>
                  <th className="p-4 font-bold max-w-xs">Message Preview</th>
                  <th className="p-4 font-bold">Submitted Date & Time</th>
                  <th className="p-4 font-bold text-center">Status</th>
                  <th className="p-4 font-bold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                {messages.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="p-16 text-center text-slate-500 dark:text-slate-400">
                      <LuMail size={44} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                      <p className="font-bold text-slate-800 dark:text-slate-100 text-base">No contact messages found</p>
                      <p className="text-xs text-slate-500 mt-1">Try adjusting your search criteria or filter options.</p>
                    </td>
                  </tr>
                ) : (
                  messages.map((msg) => {
                    const isNew = msg.status === 'new';
                    const shortId = `#MSG-${msg.id.substring(0, 6).toUpperCase()}`;

                    return (
                      <tr
                        key={msg.id}
                        className={`transition-colors ${
                          isNew 
                            ? 'bg-rose-50/40 dark:bg-rose-950/20 font-semibold' 
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                        }`}
                      >
                        {/* ID */}
                        <td className="p-4 font-mono text-xs font-bold text-slate-500 dark:text-slate-400">
                          {shortId}
                        </td>

                        {/* Sender */}
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-950 text-primary-700 dark:text-primary-300 flex items-center justify-center font-bold text-xs shrink-0">
                              {msg.name ? msg.name.charAt(0).toUpperCase() : 'U'}
                            </div>
                            <span className="font-bold text-slate-900 dark:text-white truncate max-w-[160px]">
                              {msg.name}
                            </span>
                          </div>
                        </td>

                        {/* Email */}
                        <td className="p-4 text-slate-600 dark:text-slate-300">
                          <a
                            href={`mailto:${msg.email}`}
                            className="hover:text-primary-600 transition-colors underline decoration-slate-300 underline-offset-2"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {msg.email}
                          </a>
                        </td>

                        {/* Preview */}
                        <td className="p-4 text-slate-600 dark:text-slate-300 max-w-xs">
                          <p className="truncate text-xs font-normal text-slate-500 dark:text-slate-400" title={msg.message}>
                            {msg.message}
                          </p>
                        </td>

                        {/* Date */}
                        <td className="p-4 text-slate-500 dark:text-slate-400 text-xs whitespace-nowrap">
                          {formatDate(msg.createdAt)}
                        </td>

                        {/* Status */}
                        <td className="p-4 text-center whitespace-nowrap">
                          {getStatusBadge(msg.status)}
                        </td>

                        {/* Action */}
                        <td className="p-4 text-right">
                          <button
                            onClick={() => handleOpenDetail(msg)}
                            className="px-3.5 py-1.5 rounded-xl border border-primary-200 dark:border-primary-800/80 bg-primary-50 dark:bg-primary-950/50 hover:bg-primary-100 dark:hover:bg-primary-900 text-primary-700 dark:text-primary-300 font-bold text-xs transition-colors flex items-center gap-1.5 ml-auto shadow-sm"
                          >
                            <LuEye size={14} />
                            <span>View</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination Footer */}
        {pagination.totalPages > 1 && (
          <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex flex-col sm:flex-row items-center justify-between gap-4">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Showing page <span className="text-slate-900 dark:text-white font-bold">{pagination.page}</span> of{' '}
              <span className="text-slate-900 dark:text-white font-bold">{pagination.totalPages}</span> ({pagination.total} messages total)
            </span>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={!pagination.hasPrevPage}
                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold transition-colors flex items-center gap-1"
              >
                <LuChevronLeft size={16} /> Previous
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.min(pagination.totalPages, p + 1))}
                disabled={!pagination.hasNextPage}
                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold transition-colors flex items-center gap-1"
              >
                Next <LuChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Message Details & Reply Modal */}
      {selectedMessage && (
        <div 
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setSelectedMessage(null)}
        >
          <div 
            className="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden my-8 max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/40">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-primary-100 text-primary-700 flex items-center justify-center font-bold">
                  <LuMail size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    Contact Message Details
                  </h3>
                  <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
                    ID: {selectedMessage.id}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedMessage(null)}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <LuX size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 custom-scrollbar">
              {/* Meta information card */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 text-sm">
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase">Sender Name</p>
                  <p className="font-bold text-slate-900 dark:text-white mt-0.5">{selectedMessage.name}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase">Sender Email</p>
                  <p className="font-semibold text-primary-600 mt-0.5">
                    <a href={`mailto:${selectedMessage.email}`} className="hover:underline flex items-center gap-1">
                      {selectedMessage.email} <LuExternalLink size={12} />
                    </a>
                  </p>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase">Submitted On</p>
                  <p className="font-medium text-slate-700 dark:text-slate-300 mt-0.5">{formatDate(selectedMessage.createdAt)}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase">Current Status</p>
                  <div className="mt-1">{getStatusBadge(selectedMessage.status)}</div>
                </div>
              </div>

              {/* Complete Message Box */}
              <div>
                <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                  Complete Message
                </h4>
                <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-sm whitespace-pre-wrap leading-relaxed">
                  {selectedMessage.message}
                </div>
              </div>

              {/* Status Action Buttons */}
              <div>
                <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                  Update Status
                </h4>
                <div className="flex flex-wrap gap-2">
                  {selectedMessage.status !== 'read' && selectedMessage.status !== 'replied' && (
                    <button
                      type="button"
                      disabled={updatingStatus}
                      onClick={() => handleStatusChange('read')}
                      className="px-3.5 py-2 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 text-blue-700 dark:text-blue-300 font-bold text-xs transition-colors flex items-center gap-1.5"
                    >
                      <LuEye size={14} /> Mark as Read
                    </button>
                  )}

                  {selectedMessage.status !== 'in_progress' && selectedMessage.status !== 'closed' && (
                    <button
                      type="button"
                      disabled={updatingStatus}
                      onClick={() => handleStatusChange('in_progress')}
                      className="px-3.5 py-2 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 text-amber-700 dark:text-amber-300 font-bold text-xs transition-colors flex items-center gap-1.5"
                    >
                      <LuClock size={14} /> Mark as In Progress
                    </button>
                  )}

                  {selectedMessage.status !== 'closed' && (
                    <button
                      type="button"
                      disabled={updatingStatus}
                      onClick={() => handleStatusChange('closed')}
                      className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-300 font-bold text-xs transition-colors flex items-center gap-1.5"
                    >
                      <LuArchive size={14} /> Close Message
                    </button>
                  )}

                  {selectedMessage.status === 'closed' && (
                    <button
                      type="button"
                      disabled={updatingStatus}
                      onClick={() => handleStatusChange('in_progress')}
                      className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-300 font-bold text-xs transition-colors flex items-center gap-1.5"
                    >
                      <LuRefreshCw size={14} /> Reopen Message
                    </button>
                  )}
                </div>
              </div>

              {/* Historical Replies Thread */}
              {selectedMessage.replies && selectedMessage.replies.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
                    Response History ({selectedMessage.replies.length})
                  </h4>
                  <div className="space-y-3">
                    {selectedMessage.replies.map((rep) => (
                      <div
                        key={rep.id}
                        className="p-4 rounded-2xl bg-primary-50/50 dark:bg-primary-950/30 border border-primary-100 dark:border-primary-900/50 space-y-2"
                      >
                        <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
                          <span className="font-bold text-primary-900 dark:text-primary-200 flex items-center gap-1.5">
                            <LuUser size={13} /> {rep.adminName || 'SuperAdmin'}
                          </span>
                          <span className="text-slate-400 font-medium">{formatDate(rep.createdAt)}</span>
                        </div>
                        <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
                          {rep.replyText}
                        </p>
                        
                        {/* Email Delivery Status Badge */}
                        <div className="pt-1 flex items-center gap-2">
                          {rep.emailDeliveryStatus === 'sent' && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-100/60 dark:bg-emerald-950/60 px-2 py-0.5 rounded-md">
                              <LuCircleCheck size={12} /> Email Dispatched
                            </span>
                          )}
                          {rep.emailDeliveryStatus === 'failed' && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600 bg-rose-100/60 dark:bg-rose-950/60 px-2 py-0.5 rounded-md" title={rep.emailDeliveryError || ''}>
                              <LuTriangleAlert size={12} /> Email Failed
                            </span>
                          )}
                          {rep.emailDeliveryStatus === 'not_configured' && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600 bg-amber-100/60 dark:bg-amber-950/60 px-2 py-0.5 rounded-md">
                              <LuTriangleAlert size={12} /> Email Skipped (Not Configured)
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Admin Reply Composer Form */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <LuMessageSquare size={14} className="text-primary-600" />
                  Write Response to {selectedMessage.name}
                </h4>
                <form onSubmit={handleSendReply} className="space-y-3">
                  <textarea
                    rows={4}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    disabled={submittingReply}
                    placeholder={`Write your official response to ${selectedMessage.name} (${selectedMessage.email})...`}
                    className="w-full p-4 rounded-2xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-medium text-sm outline-none resize-none transition-all placeholder:text-slate-400"
                    required
                  ></textarea>

                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <p className="text-xs text-slate-400">
                      Response will be stored in database and dispatched to <span className="font-semibold text-slate-600 dark:text-slate-300">{selectedMessage.email}</span>.
                    </p>
                    <button
                      type="submit"
                      disabled={submittingReply || !replyText.trim()}
                      className="px-5 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-bold text-sm shadow-md shadow-primary-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ml-auto"
                    >
                      {submittingReply ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          <span>Sending...</span>
                        </>
                      ) : (
                        <>
                          <LuSend size={15} />
                          <span>Send Reply</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
