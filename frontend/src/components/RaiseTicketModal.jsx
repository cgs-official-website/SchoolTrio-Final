import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { LuX, LuLifeBuoy, LuSend, LuCircleAlert, LuCircleCheck, LuMessageSquare, LuClock, LuPlus, LuChevronRight, LuArrowLeft } from "react-icons/lu";
import { zunaSupportApi } from '../api/zunaSupport.js';

const LIST_POLL_MS = 20000;
const THREAD_POLL_MS = 15000;

function formatTicketDate(val) {
  if (!val) return 'Recently';
  const d = new Date(val);
  if (isNaN(d.getTime())) return 'Recently';
  return d.toLocaleDateString('en-GB');
}

// Zuna ticket ids are long; show a short, readable reference
const shortId = (id) => String(id || '').slice(-6).toUpperCase();

const errorMessageOf = (err, fallback) =>
  err?.message || fallback;

export default function RaiseTicketModal({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('raise'); // 'raise' | 'history'
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('MEDIUM');
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Ticket history (live from Zuna through the School backend)
  const [myTickets, setMyTickets] = useState([]);
  const [listError, setListError] = useState('');
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [replyError, setReplyError] = useState('');

  const loadTickets = useCallback(async () => {
    try {
      const res = await zunaSupportApi.listTickets({ limit: 100 });
      setMyTickets(Array.isArray(res?.data) ? res.data : []);
      setListError('');
    } catch (err) {
      setListError(errorMessageOf(err, 'Could not load your tickets from Zuna.'));
    }
  }, []);

  const loadThread = useCallback(async (ticketId) => {
    try {
      const res = await zunaSupportApi.getTicket(ticketId);
      if (res?.data) {
        setSelectedTicket((current) => (current && current.id === ticketId ? res.data : current));
      }
    } catch (err) {
      setReplyError(errorMessageOf(err, 'Could not load this conversation.'));
    }
  }, []);

  // Keep the ticket list fresh while the modal is open
  useEffect(() => {
    if (!isOpen) return undefined;
    loadTickets();
    const timer = setInterval(loadTickets, LIST_POLL_MS);
    return () => clearInterval(timer);
  }, [isOpen, loadTickets]);

  // Keep the open conversation fresh (picks up Zuna admin replies and status changes)
  useEffect(() => {
    if (!isOpen || !selectedTicket?.id) return undefined;
    const ticketId = selectedTicket.id;
    const timer = setInterval(() => loadThread(ticketId), THREAD_POLL_MS);
    return () => clearInterval(timer);
  }, [isOpen, selectedTicket?.id, loadThread]);

  if (!isOpen) return null;

  const handleSelectTicket = (ticket) => {
    setReplyError('');
    setReplyText('');
    setSelectedTicket({ ...ticket, messages: ticket.messages || [] });
    loadThread(ticket.id);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await zunaSupportApi.createTicket({
        subject: subject.trim(),
        description: description.trim(),
        priority: (priority || 'MEDIUM').toUpperCase()
      });

      const ticketId = res?.data?.ticketId;
      setSuccessMsg(`✓ Ticket #${shortId(ticketId)} submitted successfully to Zuna Central Support Desk!`);
      setSubject('');
      setDescription('');
      loadTickets();
      setTimeout(() => {
        setSuccessMsg('');
        setActiveTab('history');
      }, 1500);
    } catch (err) {
      console.error('Error raising ticket to Zuna:', err);
      setErrorMsg(`Failed to submit support ticket: ${errorMessageOf(err, 'Please try again in a moment.')}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSendReply = async (e) => {
    e.preventDefault();
    if (!replyText.trim() || !selectedTicket) return;
    setSendingReply(true);
    setReplyError('');

    try {
      await zunaSupportApi.addMessage(selectedTicket.id, replyText.trim());
      setReplyText('');
      await loadThread(selectedTicket.id);
      loadTickets();
    } catch (err) {
      setReplyError(errorMessageOf(err, 'Could not send your reply.'));
    } finally {
      setSendingReply(false);
    }
  };

  const getStatusBadge = (status) => {
    switch ((status || '').toLowerCase().replace('_', '-')) {
      case 'resolved': return <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-md text-xs font-bold flex items-center gap-1"><LuCircleCheck size={12} /> Resolved</span>;
      case 'closed': return <span className="px-2 py-0.5 bg-slate-200 text-slate-700 rounded-md text-xs font-bold flex items-center gap-1"><LuCircleCheck size={12} /> Closed</span>;
      case 'in-progress': return <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-md text-xs font-bold flex items-center gap-1"><LuClock size={12} /> In Progress</span>;
      default: return <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-md text-xs font-bold flex items-center gap-1"><LuMessageSquare size={12} /> Open</span>;
    }
  };

  const modalContent = (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-100 dark:border-slate-800 w-full max-w-xl overflow-hidden flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
              <LuLifeBuoy size={20} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Zuna Central Support</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Direct live support desk for School Administrators</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 dark:text-slate-300 hover:text-slate-600 dark:hover:text-slate-300 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <LuX size={18} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 px-5 gap-2">
          <button
            onClick={() => { setActiveTab('raise'); setSelectedTicket(null); }}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition-all flex items-center gap-2 ${activeTab === 'raise'
                ? 'border-indigo-600 text-indigo-600 bg-white dark:bg-slate-900 rounded-t-xl'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
          >
            <LuPlus size={15} /> Raise New Ticket
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition-all flex items-center gap-2 ${activeTab === 'history'
                ? 'border-indigo-600 text-indigo-600 bg-white dark:bg-slate-900 rounded-t-xl'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
          >
            <LuMessageSquare size={15} /> My Tickets ({myTickets.length})
          </button>
        </div>

        {/* TAB 1: RAISE NEW TICKET */}
        {activeTab === 'raise' && (
          <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
            {successMsg && (
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-2xl text-xs font-bold flex items-center gap-2">
                <LuCircleCheck size={16} /> {successMsg}
              </div>
            )}

            {errorMsg && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl text-xs font-bold flex items-center gap-2">
                <LuCircleAlert size={16} /> {errorMsg}
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">
                Issue Subject
              </label>
              <input
                type="text"
                required
                className="w-full px-4 py-3 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-900 dark:text-white font-medium"
                placeholder="e.g. Exam Marks Generation Failure"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">
                  Priority Level
                </label>
                <select
                  className="w-full px-4 py-3 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-900 dark:text-white font-semibold"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                >
                  <option value="LOW">Low Priority</option>
                  <option value="MEDIUM">Medium Priority</option>
                  <option value="HIGH">High Priority</option>
                  <option value="URGENT">⚡ Urgent Priority</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">
                  Product System
                </label>
                <input
                  type="text"
                  disabled
                  value="School Management"
                  className="w-full px-4 py-3 text-sm bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-2xl text-slate-500 dark:text-slate-400 font-bold"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">
                Detailed Description
              </label>
              <textarea
                required
                rows={4}
                className="w-full px-4 py-3 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-900 dark:text-white font-medium resize-none"
                placeholder="Explain the issue you are experiencing..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-2xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-95 rounded-2xl shadow-lg shadow-indigo-500/25 flex items-center gap-2 transition-all disabled:opacity-50"
              >
                <LuSend size={14} /> {loading ? 'Submitting...' : 'Submit to Zuna Admin'}
              </button>
            </div>
          </form>
        )}

        {/* TAB 2: MY TICKETS & REPLIES THREAD */}
        {activeTab === 'history' && !selectedTicket && (
          <div className="p-5 flex-1 overflow-y-auto space-y-3">
            {listError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl text-xs font-bold flex items-center gap-2">
                <LuCircleAlert size={16} /> {listError}
              </div>
            )}
            {myTickets.map(t => (
              <div
                key={t.id}
                onClick={() => handleSelectTicket(t)}
                className="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-slate-700 hover:shadow-md transition-all cursor-pointer bg-white dark:bg-slate-900 flex items-center justify-between gap-3 group"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-extrabold text-indigo-600">#{shortId(t.id)}</span>
                    {getStatusBadge(t.status)}
                    <span className="text-xs text-slate-400 dark:text-slate-300 font-medium ml-auto">
                      {formatTicketDate(t.createdAt)}
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 transition-colors">{t.subject}</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">{t.description}</p>
                </div>
                <LuChevronRight className="text-slate-300 group-hover:text-indigo-600 transition-colors shrink-0" size={18} />
              </div>
            ))}

            {myTickets.length === 0 && (
              <div className="text-center py-12 text-slate-400 dark:text-slate-300">
                <LuLifeBuoy size={40} className="mx-auto mb-2 text-slate-300" />
                <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">No support tickets found.</p>
                <p className="text-xs text-slate-400 dark:text-slate-300 mt-1">Switch to "Raise New Ticket" tab to submit a support request.</p>
              </div>
            )}
          </div>
        )}

        {/* CONVERSATION THREAD DETAIL VIEW */}
        {activeTab === 'history' && selectedTicket && (
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Thread Navigation Header */}
            <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 flex items-center justify-between">
              <button
                onClick={() => setSelectedTicket(null)}
                className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
              >
                <LuArrowLeft size={14} /> Back to My Tickets
              </button>
              <div className="flex items-center gap-2">
                <span className="text-xs font-extrabold text-slate-400 dark:text-slate-300">#{shortId(selectedTicket.id)}</span>
                {getStatusBadge(selectedTicket.status)}
              </div>
            </div>

            {/* Message Thread List */}
            <div className="p-5 flex-1 overflow-y-auto space-y-3 bg-slate-50/40">
              <div className="p-3.5 bg-slate-100/80 rounded-2xl border border-slate-200 dark:border-slate-700">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 block mb-1">Ticket Subject: {selectedTicket.subject}</span>
                <p className="text-xs text-slate-800 dark:text-slate-100 font-medium">{selectedTicket.description}</p>
              </div>

              {(selectedTicket.messages || []).map((msg, i) => {
                const isSuperAdmin = msg.sender === 'ADMIN';
                return (
                  <div key={msg.id || i} className={`flex flex-col ${isSuperAdmin ? 'items-start' : 'items-end'}`}>
                    <div className={`max-w-[85%] p-3.5 rounded-2xl text-xs font-medium ${isSuperAdmin
                        ? 'bg-indigo-600 text-white rounded-tl-none shadow-sm'
                        : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-tr-none shadow-sm'
                      }`}>
                      <div className="flex items-center justify-between gap-3 text-[10px] opacity-75 mb-1 font-bold">
                        <span>{isSuperAdmin ? '⚡ Zuna SuperAdmin Support' : msg.authorName || 'School Admin'}</span>
                        <span>{formatTicketDate(msg.createdAt)}</span>
                      </div>
                      <p className="leading-relaxed">{msg.text}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Reply Input Box */}
            {replyError && (
              <div className="mx-3 mb-2 p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-bold flex items-center gap-2">
                <LuCircleAlert size={14} /> {replyError}
              </div>
            )}
            <form onSubmit={handleSendReply} className="p-3 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex gap-2">
              <input
                type="text"
                placeholder={selectedTicket.status === 'CLOSED' ? 'This ticket is closed. Raise a new ticket.' : 'Write reply to Zuna SuperAdmin...'}
                disabled={selectedTicket.status === 'CLOSED'}
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                className="flex-1 px-4 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-white font-medium"
                required
              />
              <button
                type="submit"
                disabled={sendingReply || selectedTicket.status === 'CLOSED'}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl flex items-center gap-1 shadow-sm disabled:opacity-50 transition-all"
              >
                <LuSend size={12} /> {sendingReply ? 'Sending...' : 'Reply'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
}
