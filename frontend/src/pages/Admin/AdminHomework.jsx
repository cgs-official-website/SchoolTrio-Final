import React, { useState, useEffect, useCallback, useRef } from 'react';
import { listHomework, getHomework } from '../../api/homework';
import { listClasses } from '../../api/classes';
import {
  LuFileText as FileText,
  LuSearch as _Search,
  LuX as X,
  LuCircleCheck as CheckCircle,
  LuBookOpen as BookOpen,
  LuRefreshCw as RefreshCw,
  LuAward as Award,
  LuPaperclip as Paperclip,
  LuMessageSquare as MessageSquare
} from 'react-icons/lu';
import { TableSkeleton } from '../../components/Skeleton';
import { sortClassesAscending } from '../../utils/classSorting';
import toast from 'react-hot-toast';

export default function AdminHomework() {
  const [classes, setClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [homeworks, setHomeworks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [showTrackingModal, setShowTrackingModal] = useState(false);
  const [selectedHomework, setSelectedHomework] = useState(null);
  const [trackingLoading, setTrackingLoading] = useState(false);

  const mountedRef = useRef(true);
  const currentClassRef = useRef(selectedClassId);

  // ============================================================
  // 1. FETCH CLASSES (GET /api/v1/classes)
  // ============================================================
  const fetchClasses = useCallback(async () => {
    try {
      const res = await listClasses({ limit: 100 });
      if (!mountedRef.current) return;
      const rawClasses = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
      setClasses(sortClassesAscending(rawClasses));
    } catch (error) {
      if (mountedRef.current) {
        console.error('[AdminHomework] Error loading classes:', error);
        toast.error('Failed to load classes.');
      }
    }
  }, []);

  // ============================================================
  // 2. FETCH HOMEWORK ASSIGNMENTS (GET /api/v1/homework)
  // ============================================================
  const fetchHomeworkList = useCallback(async (targetClassId, silent = false) => {
    if (!silent) setLoading(true);
    try {
      const query = { limit: 100 };
      if (targetClassId) {
        query.classId = targetClassId;
      }

      const res = await listHomework(query);
      if (!mountedRef.current || currentClassRef.current !== targetClassId) return;

      const rawList = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
      setHomeworks(rawList);
    } catch (error) {
      if (mountedRef.current && currentClassRef.current === targetClassId) {
        console.error('[AdminHomework] Error loading homework assignments:', error);
        toast.error(error.message || 'Failed to load homework assignments.');
        setHomeworks([]);
      }
    } finally {
      if (mountedRef.current && currentClassRef.current === targetClassId) {
        if (!silent) setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  // Initial load
  useEffect(() => {
    mountedRef.current = true;
    fetchClasses();
    return () => {
      mountedRef.current = false;
    };
  }, [fetchClasses]);

  // Handle class selection & race condition safety
  useEffect(() => {
    mountedRef.current = true;
    currentClassRef.current = selectedClassId;
    fetchHomeworkList(selectedClassId, false);
  }, [selectedClassId, fetchHomeworkList]);

  // ============================================================
  // 3. TRACKING MODAL (GET /api/v1/homework/:id)
  // ============================================================
  const openTracking = async (hw) => {
    setSelectedHomework(hw);
    setShowTrackingModal(true);
    setTrackingLoading(true);

    try {
      const res = await getHomework(hw.id);
      if (mountedRef.current && res?.data) {
        setSelectedHomework(res.data);
      }
    } catch (error) {
      console.error('[AdminHomework] Error loading homework details and roster:', error);
      toast.error('Failed to load student progress details.');
    } finally {
      if (mountedRef.current) {
        setTrackingLoading(false);
      }
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchHomeworkList(selectedClassId, false);
  };

  if (loading && homeworks.length === 0) {
    return (
      <div className="p-8 max-w-7xl mx-auto animate-fade-in-up">
        <TableSkeleton rows={5} columns={4} />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto animate-fade-in-up pb-24">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Homework Overview
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            View class-wise homework and student submissions across the institution.
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="w-full sm:w-72">
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 outline-none"
            >
              <option value="">All Classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors font-semibold flex items-center gap-2 shrink-0"
            title="Refresh homework"
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            <span className="text-xs font-bold hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Homework Cards Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {homeworks.length === 0 ? (
          <div className="col-span-full p-12 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <BookOpen size={48} className="mx-auto text-slate-300 dark:text-slate-600 mb-4" />
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">No homework found</h3>
            <p className="text-slate-500 dark:text-slate-400 mt-1">
              {selectedClassId
                ? 'No homework has been assigned to this class yet.'
                : 'No homework has been assigned in the school.'}
            </p>
          </div>
        ) : (
          homeworks.map((hw) => {
            const dueDateObj = hw.dueDate ? new Date(hw.dueDate) : null;
            const subjectLabel = hw.subjectName || hw.subjectCode || 'General';
            const classLabel = hw.className || 'Unknown Class';

            return (
              <div
                key={hw.id}
                onClick={() => openTracking(hw)}
                className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group cursor-pointer"
              >
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity pointer-events-none">
                  <FileText size={64} className="text-primary-600 transform rotate-12" />
                </div>
                <div className="relative z-10">
                  <div className="flex justify-between items-start mb-4 gap-2">
                    <span className="px-3 py-1 bg-primary-50 text-primary-700 dark:bg-primary-950/50 dark:text-primary-300 rounded-full text-xs font-bold truncate max-w-[200px]">
                      {classLabel} • {subjectLabel}
                    </span>
                    <span className="text-xs font-semibold text-slate-400 dark:text-slate-300 shrink-0">
                      Due: {dueDateObj ? dueDateObj.toLocaleDateString('en-GB') : 'No date'}
                    </span>
                  </div>

                  <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2 truncate">
                    {hw.title}
                  </h3>

                  {hw.description && (
                    <p className="text-sm text-slate-600 dark:text-slate-300 mb-2 line-clamp-2">
                      {hw.description}
                    </p>
                  )}

                  {hw.remarks && (
                    <p className="text-xs italic text-slate-500 dark:text-slate-400 mb-3 truncate">
                      Remarks: "{hw.remarks}"
                    </p>
                  )}

                  {/* Submission counters */}
                  <div className="flex items-center gap-2 mb-4 text-xs font-semibold text-slate-500 dark:text-slate-400 flex-wrap">
                    {hw.maxMarks > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        <Award size={12} /> {hw.maxMarks} Marks
                      </span>
                    )}
                    {hw.attachmentCount > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        <Paperclip size={12} /> {hw.attachmentCount} Attachment{hw.attachmentCount > 1 ? 's' : ''}
                      </span>
                    )}
                    {hw.submittedCount !== undefined && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                        {hw.submittedCount} Submitted
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
                    <span className="text-sm font-medium text-emerald-600 flex items-center gap-1">
                      <CheckCircle size={16} /> Active
                    </span>
                    <span className="text-xs font-bold text-primary-600 dark:text-primary-400 group-hover:underline">
                      View Tracking &rarr;
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Tracking Modal */}
      {showTrackingModal && selectedHomework && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 z-50">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-3xl flex flex-col max-h-[90vh] overflow-hidden shadow-2xl animate-fade-in-up">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800 shrink-0 gap-4">
              <div className="min-w-0">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white truncate">
                  {selectedHomework.title}
                </h2>
                <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                  Student Progress Tracking • {selectedHomework.className || 'Class'}
                </p>
              </div>
              <button
                onClick={() => setShowTrackingModal(false)}
                className="text-slate-400 dark:text-slate-300 hover:text-slate-600 dark:hover:text-white transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            {/* Modal Content / Student Roster */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
              {trackingLoading ? (
                <div className="p-8 text-center text-slate-500 dark:text-slate-400 font-semibold">
                  <TableSkeleton rows={4} columns={3} />
                </div>
              ) : !selectedHomework.roster || selectedHomework.roster.length === 0 ? (
                <p className="text-center text-slate-500 dark:text-slate-400 italic py-8">
                  No students found in this class.
                </p>
              ) : (
                <div className="space-y-3">
                  {selectedHomework.roster.map((student) => {
                    const status = student.status || 'Not Started';
                    const lastUpdated = student.submittedAt || student.updatedAt
                      ? new Date(student.submittedAt || student.updatedAt).toLocaleString('en-GB')
                      : 'N/A';

                    let statusColor = 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300';
                    if (status === 'In Progress') statusColor = 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300';
                    if (status === 'Completed') statusColor = 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300';
                    if (status === 'Submitted') statusColor = 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300';

                    return (
                      <div
                        key={student.studentId}
                        className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border border-slate-200 dark:border-slate-700 rounded-2xl hover:border-primary-300 dark:hover:border-slate-600 transition-colors gap-4 bg-white dark:bg-slate-900"
                      >
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900 dark:text-white truncate">
                            {student.studentName}
                          </p>
                          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-0.5">
                            ADM: {student.admissionNumber || 'N/A'}
                            {student.rollNumber ? ` | Roll: ${student.rollNumber}` : ''}
                            {' | '}
                            Last Updated: {lastUpdated}
                          </p>

                          {/* Evaluation details when available */}
                          {(student.grade || student.feedback) && (
                            <div className="mt-2 text-xs font-semibold flex items-center gap-2 flex-wrap">
                              {student.grade && (
                                <span className="text-emerald-700 dark:text-emerald-400 font-bold flex items-center gap-1">
                                  <Award size={12} /> Grade: {student.grade}
                                </span>
                              )}
                              {student.feedback && (
                                <span className="text-slate-600 dark:text-slate-300 flex items-center gap-1">
                                  <MessageSquare size={12} /> {student.feedback}
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-3 shrink-0 self-start sm:self-auto">
                          <div className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap ${statusColor}`}>
                            {status}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
