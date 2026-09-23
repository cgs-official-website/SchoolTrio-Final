import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getStudentHomework, updateStudentHomeworkStatus } from '../../api/homework';
import {
  LuFileText as FileText,
  LuClock as Clock,
  LuCircleCheck as CheckCircle2,
  LuUser as _User,
  LuBookOpen as BookOpen,
  LuPaperclip as Paperclip,
  LuRefreshCw as RefreshCw,
  LuAward as Award,
  LuMessageSquare as MessageSquare
} from 'react-icons/lu';
import { TableSkeleton } from '../../components/Skeleton';
import toast from 'react-hot-toast';

export default function HomeworkOverview() {
  const { userProfile } = useAuth();
  const outletContext = useOutletContext();
  const activeStudentId = outletContext?.activeStudentId;
  const activeChild = outletContext?.activeChild;

  // Authoritative student ID from ParentDashboard context with userProfile fallback
  const studentId = activeStudentId || userProfile?.linkedStudentId;

  const [homeworks, setHomeworks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingHwId, setUpdatingHwId] = useState(null);

  const mountedRef = useRef(true);
  const currentStudentRef = useRef(studentId);

  // ============================================================
  // FETCH STUDENT HOMEWORK (GET /api/v1/students/:studentId/homework)
  // ============================================================

  const fetchHomework = useCallback(async (targetStudentId, silent = false) => {
    if (!targetStudentId) {
      setHomeworks([]);
      setLoading(false);
      return;
    }

    if (!silent) setLoading(true);
    try {
      const res = await getStudentHomework(targetStudentId, { limit: 50, sort: 'dueDate', order: 'asc' });
      // Stale response guard for child switching
      if (!mountedRef.current || currentStudentRef.current !== targetStudentId) {
        return;
      }

      const rawList = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
      setHomeworks(rawList);
    } catch (error) {
      if (mountedRef.current && currentStudentRef.current === targetStudentId) {
        console.error('[HomeworkOverview] Error fetching student homework from REST:', error);
        toast.error(error.message || 'Failed to load homework assignments.');
        setHomeworks([]);
      }
    } finally {
      if (mountedRef.current && currentStudentRef.current === targetStudentId) {
        if (!silent) setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  // Synchronize studentId and handle active child switching
  useEffect(() => {
    mountedRef.current = true;
    currentStudentRef.current = studentId;

    if (!studentId) {
      setLoading(false);
      setHomeworks([]);
      return;
    }

    fetchHomework(studentId, false);

    return () => {
      mountedRef.current = false;
    };
  }, [studentId, fetchHomework]);

  // ============================================================
  // STATUS CHANGE (PATCH /api/v1/students/:studentId/homework/:homeworkId/status)
  // ============================================================

  const handleStatusChange = async (hwId, newStatus) => {
    const targetStudentId = currentStudentRef.current || studentId;
    if (!targetStudentId || !hwId) return;

    // Snapshot previous state for rollback on failure
    const previousHomeworks = [...homeworks];

    // Optimistic UI update
    setHomeworks(prev =>
      prev.map(item => {
        if (item.id === hwId) {
          return {
            ...item,
            submission: {
              ...(item.submission || {}),
              status: newStatus,
              submittedAt: newStatus === 'Submitted' ? new Date().toISOString() : item.submission?.submittedAt
            }
          };
        }
        return item;
      })
    );

    setUpdatingHwId(hwId);
    try {
      const res = await updateStudentHomeworkStatus(targetStudentId, hwId, {
        status: newStatus
      });

      // Confirm with authoritative server response if available
      if (res?.data) {
        setHomeworks(prev =>
          prev.map(item => {
            if (item.id === hwId) {
              return {
                ...item,
                submission: {
                  ...(item.submission || {}),
                  status: res.data.status,
                  submittedAt: res.data.submittedAt,
                  grade: res.data.grade ?? item.submission?.grade,
                  feedback: res.data.feedback ?? item.submission?.feedback,
                  updatedAt: res.data.updatedAt
                }
              };
            }
            return item;
          })
        );
      }
      toast.success('Status updated!');
    } catch (error) {
      console.error('[HomeworkOverview] Error updating submission status:', error);
      toast.error(error.message || 'Failed to update status');
      // Rollback to previous state
      if (mountedRef.current && currentStudentRef.current === targetStudentId) {
        setHomeworks(previousHomeworks);
      }
    } finally {
      if (mountedRef.current) {
        setUpdatingHwId(null);
      }
    }
  };

  if (loading) {
    return (
      <div className="p-4 sm:p-8 max-w-5xl mx-auto animate-fade-in-up min-w-0 w-full">
        <TableSkeleton rows={4} columns={3} />
      </div>
    );
  }

  const childDisplayName = activeChild?.name ||
    (activeChild?.firstName ? `${activeChild.firstName} ${activeChild.lastName || ''}`.trim() : null) ||
    'your child';

  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto animate-fade-in-up min-w-0 w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4 w-full">
        <div className="min-w-0">
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight truncate">
            Homework & Assignments
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Track upcoming tasks and evaluations for {childDisplayName}.
          </p>
        </div>
        <button
          onClick={() => {
            if (studentId) {
              setRefreshing(true);
              fetchHomework(studentId, false);
            }
          }}
          disabled={refreshing || !studentId}
          className="p-2.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors font-semibold flex items-center gap-2 self-end sm:self-auto"
          title="Refresh assignments"
        >
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          <span className="text-xs font-bold sm:inline">Refresh</span>
        </button>
      </div>

      {/* Homework List */}
      <div className="grid gap-4">
        {homeworks.length === 0 ? (
          <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <CheckCircle2 size={48} className="mx-auto text-emerald-400 mb-4" />
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">All caught up!</h3>
            <p className="text-slate-500 dark:text-slate-400 mt-1">
              No pending homework assignments found for this class.
            </p>
          </div>
        ) : (
          homeworks.map(hw => {
            const currentStatus = hw.submission?.status || 'Not Started';
            const dueDateObj = hw.dueDate ? new Date(hw.dueDate) : null;
            const todayStr = new Date().toISOString().split('T')[0];
            const isOverdue =
              hw.isOverdue ||
              (hw.dueDate && hw.dueDate < todayStr && currentStatus !== 'Completed' && currentStatus !== 'Submitted');

            let statusColor = 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700';
            if (currentStatus === 'In Progress') statusColor = 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800';
            if (currentStatus === 'Completed') statusColor = 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800';
            if (currentStatus === 'Submitted') statusColor = 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800';

            const attachments = Array.isArray(hw.attachments) ? hw.attachments : [];

            return (
              <div
                key={hw.id}
                className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="flex items-start gap-4 min-w-0 flex-1">
                  <div className={`p-3 rounded-xl shrink-0 ${isOverdue ? 'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400' : 'bg-primary-50 text-primary-600 dark:bg-primary-950/40 dark:text-primary-400'}`}>
                    <FileText size={24} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white truncate">{hw.title}</h3>
                      {hw.maxMarks > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                          <Award size={12} /> {hw.maxMarks} Marks
                        </span>
                      )}
                    </div>
                    {hw.description && (
                      <p className="text-slate-600 dark:text-slate-300 text-sm mt-1 mb-3 whitespace-pre-line">
                        {hw.description}
                      </p>
                    )}

                    {hw.remarks && (
                      <div className="mb-3 px-3 py-2 bg-slate-50/50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 italic max-w-xl">
                        <span className="font-bold text-primary-700 dark:text-primary-400 not-italic block mb-0.5">
                          Teacher's Remarks:
                        </span>
                        "{hw.remarks}"
                      </div>
                    )}

                    {/* Teacher Evaluation Grade / Feedback */}
                    {(hw.submission?.grade || hw.submission?.feedback) && (
                      <div className="mb-3 p-3 bg-emerald-50/50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-800 rounded-xl text-xs font-semibold">
                        <span className="font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1 mb-0.5">
                          <Award size={14} /> Teacher Evaluation:
                        </span>
                        {hw.submission.grade && (
                          <p className="text-emerald-700 dark:text-emerald-400 font-bold">
                            Grade / Marks: {hw.submission.grade}
                          </p>
                        )}
                        {hw.submission.feedback && (
                          <p className="text-slate-600 dark:text-slate-300 mt-0.5 flex items-start gap-1">
                            <MessageSquare size={12} className="mt-0.5 shrink-0" />
                            {hw.submission.feedback}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Meta badges and attachments */}
                    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                      <span className="flex items-center gap-1 bg-slate-50 dark:bg-slate-800 px-2.5 py-1 rounded-md border border-slate-100 dark:border-slate-800">
                        <BookOpen size={12} /> {hw.subjectName || hw.subjectCode || 'General'}
                      </span>
                      {hw.className && (
                        <span className="bg-slate-50 dark:bg-slate-800 px-2.5 py-1 rounded-md border border-slate-100 dark:border-slate-800">
                          {hw.className}
                        </span>
                      )}
                      {hw.assignedDate && (
                        <span className="bg-slate-50 dark:bg-slate-800 px-2.5 py-1 rounded-md border border-slate-100 dark:border-slate-800">
                          Assigned: {new Date(hw.assignedDate).toLocaleDateString('en-GB')}
                        </span>
                      )}
                      {attachments.map((att, idx) => (
                        <a
                          key={idx}
                          href={att.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-primary-50 text-primary-700 dark:bg-primary-950/50 dark:text-primary-300 rounded-md border border-primary-100 dark:border-primary-800 font-bold hover:underline"
                        >
                          <Paperclip size={12} /> {att.name || 'Attachment'}
                        </a>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Due Date and Status Selector */}
                <div className="flex flex-col sm:items-end gap-3 border-t sm:border-t-0 sm:border-l border-slate-100 dark:border-slate-800 pt-4 sm:pt-0 sm:pl-6 min-w-[190px] shrink-0">
                  <div className={`flex items-center gap-1.5 text-sm font-bold ${isOverdue ? 'text-red-600 dark:text-red-400' : 'text-slate-600 dark:text-slate-300'}`}>
                    <Clock size={16} />
                    Due: {dueDateObj ? dueDateObj.toLocaleDateString('en-GB') : 'No date'}
                  </div>

                  <div className="w-full mt-1">
                    <select
                      value={currentStatus}
                      disabled={updatingHwId === hw.id}
                      onChange={(e) => handleStatusChange(hw.id, e.target.value)}
                      className={`w-full px-3 py-2 rounded-xl border text-sm font-bold focus:ring-2 focus:ring-primary-500 outline-none transition-colors cursor-pointer ${statusColor} disabled:opacity-50`}
                    >
                      <option value="Not Started">Not Started</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Completed">Completed</option>
                      <option value="Submitted">Submitted</option>
                    </select>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
