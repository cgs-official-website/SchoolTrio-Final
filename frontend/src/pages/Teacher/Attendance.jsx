import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  listAttendanceSessions,
  getAttendanceSession,
  createAttendanceSession,
  updateAttendanceSession
} from '../../api/attendance';
import { getClass, listClasses } from '../../api/classes';
import { listStudents } from '../../api/students';
import {
  LuCalendar as CalendarIcon,
  LuCircleCheck as CheckCircle2,
  LuCircleX as XCircle,
  LuCircleAlert as AlertCircle,
  LuSave as Save,
  LuUsers as Users,
  LuFileDown,
  LuX,
  LuRefreshCw as RefreshCw
} from 'react-icons/lu';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';

const DAILY_FIELDS_LIST = [
  { key: 'admissionNo', label: 'Admission No' },
  { key: 'studentName', label: 'Student Name' },
  { key: 'status', label: 'Status' },
  { key: 'date', label: 'Date' },
  { key: 'session', label: 'Session' }
];

const REPORT_FIELDS_LIST = [
  { key: 'admissionNo', label: 'Admission No' },
  { key: 'studentName', label: 'Student Name' },
  { key: 'totalClasses', label: 'Total Classes' },
  { key: 'present', label: 'Present' },
  { key: 'absent', label: 'Absent' },
  { key: 'late', label: 'Late' },
  { key: 'percentage', label: 'Attendance %' }
];

export default function Attendance() {
  const { userProfile } = useAuth();
  const classId = userProfile?.assignedClassId;

  const today = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedSession, setSelectedSession] = useState('FN');

  const [classDetails, setClassDetails] = useState(null);
  const [students, setStudents] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [attendanceRecords, setAttendanceRecords] = useState({}); // { studentId: 'Present' | 'Absent' | 'Late' }
  const [attendanceRemarks, setAttendanceRemarks] = useState({}); // { studentId: string }
  const [existingSessionId, setExistingSessionId] = useState(null);
  const [hasExistingRecord, setHasExistingRecord] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const [viewMode, setViewMode] = useState('daily');
  const [historicalSessions, setHistoricalSessions] = useState([]);
  const [reportStats, setReportStats] = useState({});

  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFileName, setExportFileName] = useState('');

  // Cutoff state (defaults to 09:30 AM)
  const cutoffTime = '09:30';
  const [isPastCutoff, setIsPastCutoff] = useState(false);

  const mountedRef = useRef(true);
  const currentClassRef = useRef(classId);
  const currentDateRef = useRef(selectedDate);
  const currentSessionRef = useRef(selectedSession);

  // Synchronize ref states
  useEffect(() => {
    currentClassRef.current = classId;
    currentDateRef.current = selectedDate;
    currentSessionRef.current = selectedSession;
  });

  // Check Cutoff interval
  useEffect(() => {
    if (selectedDate !== today) {
      setIsPastCutoff(false);
      return;
    }
    const checkCutoff = () => {
      const now = new Date();
      const [h, m] = cutoffTime.split(':').map(Number);
      const cutoffDate = new Date();
      cutoffDate.setHours(h, m, 0, 0);
      setIsPastCutoff(now > cutoffDate);
    };
    checkCutoff();
    const interval = setInterval(checkCutoff, 60000);
    return () => clearInterval(interval);
  }, [selectedDate, today]);

  // ============================================================
  // 1. FETCH CLASS DETAILS & STUDENT ROSTER (REST)
  // ============================================================
  const fetchClassAndRoster = useCallback(async (targetClassId) => {
    if (!targetClassId) {
      setClassDetails(null);
      setStudents([]);
      setLoading(false);
      return;
    }

    try {
      // Fetch Class details
      let cls = null;
      try {
        const clsRes = await getClass(targetClassId);
        cls = clsRes?.data || clsRes;
      } catch {
        // Fallback: listClasses
        const listRes = await listClasses({ limit: 100 });
        const list = Array.isArray(listRes?.data) ? listRes.data : (Array.isArray(listRes) ? listRes : []);
        cls = list.find(c => c.id === targetClassId) || null;
      }

      if (!mountedRef.current || currentClassRef.current !== targetClassId) return;
      if (cls) {
        setClassDetails(cls);
      }

      // Fetch Active Students Roster
      const stuRes = await listStudents({
        classId: targetClassId,
        status: 'Active',
        limit: 100,
        sort: 'firstName',
        order: 'asc'
      });

      if (!mountedRef.current || currentClassRef.current !== targetClassId) return;
      const rawStudents = Array.isArray(stuRes?.data) ? stuRes.data : (Array.isArray(stuRes) ? stuRes : []);
      const sortedStudents = [...rawStudents].sort((a, b) =>
        (a.firstName || '').localeCompare(b.firstName || '')
      );
      setStudents(sortedStudents);
    } catch (err) {
      if (mountedRef.current && currentClassRef.current === targetClassId) {
        console.error('[Attendance] Error fetching class & roster:', err);
        toast.error('Failed to load class roster.');
      }
    }
  }, []);

  // ============================================================
  // 2. FETCH ATTENDANCE SESSION FOR DATE & SESSION (REST)
  // ============================================================
  const fetchSessionAttendance = useCallback(async (targetClassId, targetDate, targetSession, silent = false) => {
    if (!targetClassId || !targetDate) {
      setAttendanceRecords({});
      setExistingSessionId(null);
      setHasExistingRecord(false);
      setLoading(false);
      return;
    }

    if (!silent) setLoading(true);
    try {
      const res = await listAttendanceSessions({
        classId: targetClassId,
        date: targetDate,
        session: targetSession,
        limit: 1
      });

      if (
        !mountedRef.current ||
        currentClassRef.current !== targetClassId ||
        currentDateRef.current !== targetDate ||
        currentSessionRef.current !== targetSession
      ) {
        return;
      }

      const sessions = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
      const matchedSession = sessions.find(s => s.date === targetDate && s.session === targetSession) || sessions[0];

      if (matchedSession) {
        // Fetch detailed session with student records if not already populated
        let fullSession = matchedSession;
        if (!matchedSession.records || matchedSession.records.length === 0) {
          try {
            const detailRes = await getAttendanceSession(matchedSession.id);
            fullSession = detailRes?.data || detailRes?.session || detailRes || matchedSession;
          } catch {
            fullSession = matchedSession;
          }
        }

        if (
          !mountedRef.current ||
          currentClassRef.current !== targetClassId ||
          currentDateRef.current !== targetDate ||
          currentSessionRef.current !== targetSession
        ) {
          return;
        }

        setExistingSessionId(fullSession.id);
        setHasExistingRecord(true);

        const newRecords = {};
        const newRemarks = {};
        const recordsList = Array.isArray(fullSession.records) ? fullSession.records : [];

        // Prepopulate saved statuses
        recordsList.forEach(r => {
          if (r.studentId) {
            newRecords[r.studentId] = r.status || 'Present';
            if (r.remark) newRemarks[r.studentId] = r.remark;
          }
        });

        // Initialize any roster student missing in records
        students.forEach(st => {
          if (!newRecords[st.id]) {
            newRecords[st.id] = 'Present';
          }
        });

        setAttendanceRecords(newRecords);
        setAttendanceRemarks(newRemarks);
      } else {
        // No session exists for this date and session
        setExistingSessionId(null);
        setHasExistingRecord(false);

        const defaultStatus = isPastCutoff ? 'Late' : 'Present';
        const newRecords = {};
        students.forEach(st => {
          newRecords[st.id] = defaultStatus;
        });
        setAttendanceRecords(newRecords);
        setAttendanceRemarks({});
      }
    } catch (err) {
      if (
        mountedRef.current &&
        currentClassRef.current === targetClassId &&
        currentDateRef.current === targetDate &&
        currentSessionRef.current === targetSession
      ) {
        console.error('[Attendance] Error loading session attendance:', err);
        toast.error('Failed to load attendance for selected date.');
      }
    } finally {
      if (
        mountedRef.current &&
        currentClassRef.current === targetClassId &&
        currentDateRef.current === targetDate &&
        currentSessionRef.current === targetSession
      ) {
        if (!silent) setLoading(false);
        setRefreshing(false);
      }
    }
  }, [students, isPastCutoff]);

  // Initial Class & Roster load
  useEffect(() => {
    mountedRef.current = true;
    if (classId) {
      fetchClassAndRoster(classId);
    } else {
      setLoading(false);
    }
    return () => {
      mountedRef.current = false;
    };
  }, [classId, fetchClassAndRoster]);

  // Fetch session attendance when date, session, or students list updates
  useEffect(() => {
    if (!classId || students.length === 0 || viewMode !== 'daily') return;
    fetchSessionAttendance(classId, selectedDate, selectedSession, false);
  }, [classId, selectedDate, selectedSession, students, viewMode, fetchSessionAttendance]);

  // ============================================================
  // 3. FETCH HISTORICAL SESSIONS FOR REPORTS (REST)
  // ============================================================
  useEffect(() => {
    if (viewMode === 'daily' || !classId) return;

    let isMounted = true;
    setLoading(true);

    const now = new Date();
    let startDate = '';
    const endDate = now.toISOString().split('T')[0];

    if (viewMode === 'weekly') {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(now.getDate() - 7);
      startDate = sevenDaysAgo.toISOString().split('T')[0];
    } else if (viewMode === 'monthly') {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      startDate = startOfMonth.toISOString().split('T')[0];
    } else if (viewMode === 'term') {
      const month = now.getMonth();
      const termStart = month >= 3 && month <= 8
        ? new Date(now.getFullYear(), 3, 1)
        : new Date(now.getMonth() < 3 ? now.getFullYear() - 1 : now.getFullYear(), 8, 1);
      startDate = termStart.toISOString().split('T')[0];
    }

    const fetchAllHistoricalSessions = async () => {
      try {
        let allSessions = [];
        let currentPage = 1;
        let totalPages = 1;

        do {
          const res = await listAttendanceSessions({
            classId,
            startDate: startDate || undefined,
            endDate: endDate || undefined,
            page: currentPage,
            limit: 100
          });

          if (!isMounted) return;

          const pageData = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
          allSessions = allSessions.concat(pageData);

          const pagination = res?.pagination;
          totalPages = pagination?.totalPages || 1;
          currentPage += 1;
        } while (currentPage <= totalPages && isMounted);

        if (!isMounted) return;

        // Fetch detailed sessions if records are not expanded
        const fullSessions = await Promise.all(
          allSessions.map(async (s) => {
            if (s.records && s.records.length > 0) return s;
            try {
              const detail = await getAttendanceSession(s.id);
              return detail?.data || detail?.session || detail || s;
            } catch {
              return s;
            }
          })
        );

        if (!isMounted) return;
        setHistoricalSessions(fullSessions);
      } catch (err) {
        if (isMounted) {
          console.error('[Attendance] Error fetching historical reports:', err);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchAllHistoricalSessions();

    return () => {
      isMounted = false;
    };
  }, [viewMode, classId]);

  // Aggregate historical stats
  useEffect(() => {
    if (viewMode === 'daily' || students.length === 0) return;

    const stats = {};
    students.forEach((student) => {
      stats[student.id] = { present: 0, absent: 0, late: 0, total: 0 };
    });

    historicalSessions.forEach((sessionItem) => {
      const records = sessionItem.records || [];
      records.forEach((r) => {
        if (r.studentId && stats[r.studentId]) {
          const status = r.status;
          if (status === 'Present') stats[r.studentId].present++;
          else if (status === 'Absent') stats[r.studentId].absent++;
          else if (status === 'Late') stats[r.studentId].late++;
          stats[r.studentId].total++;
        }
      });
    });

    setReportStats(stats);
  }, [historicalSessions, viewMode, students]);

  // ============================================================
  // 4. STATUS CHANGE & SAVE ACTIONS (REST POST / PATCH)
  // ============================================================
  const handleStatusChange = (studentId, status) => {
    setAttendanceRecords((prev) => ({
      ...prev,
      [studentId]: status
    }));
  };

  const handleSave = async () => {
    if (!classId || students.length === 0) return;

    setSaving(true);
    setSuccessMsg('');

    const formattedRecords = students.map((student) => ({
      studentId: student.id,
      status: attendanceRecords[student.id] || 'Present',
      remark: attendanceRemarks[student.id] || undefined
    }));

    try {
      if (existingSessionId) {
        // Update existing session (PATCH /api/v1/attendance/sessions/:id)
        await updateAttendanceSession(existingSessionId, {
          records: formattedRecords
        });
      } else {
        // Create new session (POST /api/v1/attendance/sessions)
        const payload = {
          classId,
          sectionId: classDetails?.sectionId || undefined,
          date: selectedDate,
          session: selectedSession,
          records: formattedRecords
        };
        const res = await createAttendanceSession(payload);
        if (res?.data?.id) {
          setExistingSessionId(res.data.id);
          setHasExistingRecord(true);
        }
      }

      setSuccessMsg('Attendance saved successfully!');
      toast.success('Attendance saved successfully!');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (error) {
      console.error('[Attendance] Error saving attendance via REST:', error);
      toast.error(error.message || 'Failed to save attendance.');
    } finally {
      if (mountedRef.current) {
        setSaving(false);
      }
    }
  };

  const handleRefresh = () => {
    if (classId) {
      setRefreshing(true);
      fetchSessionAttendance(classId, selectedDate, selectedSession, false);
    }
  };

  // ============================================================
  // 5. EXPORT CONFIGURATION & HANDLER
  // ============================================================
  const availableFieldsList = viewMode === 'daily' ? DAILY_FIELDS_LIST : REPORT_FIELDS_LIST;

  const [selectedFields, setSelectedFields] = useState(() => {
    const init = {};
    DAILY_FIELDS_LIST.forEach((f) => {
      init[f.key] = true;
    });
    return init;
  });

  useEffect(() => {
    const fields = viewMode === 'daily' ? DAILY_FIELDS_LIST : REPORT_FIELDS_LIST;
    const init = {};
    fields.forEach((f) => {
      init[f.key] = true;
    });
    setSelectedFields(init);
  }, [viewMode]);

  const handleFieldToggle = (fieldKey) => {
    setSelectedFields((prev) => ({ ...prev, [fieldKey]: !prev[fieldKey] }));
  };

  const handleSelectAll = (selectVal) => {
    const updated = {};
    availableFieldsList.forEach((field) => {
      updated[field.key] = selectVal;
    });
    setSelectedFields(updated);
  };

  const handleExport = () => {
    const activeFields = Object.keys(selectedFields).filter((k) => selectedFields[k]);
    if (activeFields.length === 0) {
      toast.error('Please select at least one column to export.');
      return;
    }
    try {
      const className = classDetails ? `${classDetails.name || ''}${classDetails.section ? `-${classDetails.section}` : ''}`.trim() : 'Class';
      let wsData = [];
      let fileName = '';

      if (viewMode === 'daily') {
        fileName = `Attendance_${className}_${selectedDate}_${selectedSession}.xlsx`;
        wsData = students.map((student) => {
          const row = {};
          availableFieldsList.forEach((field) => {
            if (!selectedFields[field.key]) return;
            if (field.key === 'admissionNo') row[field.label] = student.admissionNumber || '';
            if (field.key === 'studentName') row[field.label] = `${student.firstName} ${student.lastName || ''}`.trim();
            if (field.key === 'status') row[field.label] = attendanceRecords[student.id] || 'Present';
            if (field.key === 'date') row[field.label] = selectedDate;
            if (field.key === 'session') row[field.label] = selectedSession === 'FN' ? 'Forenoon' : 'Afternoon';
          });
          return row;
        });
      } else {
        const periodLabel = viewMode === 'weekly' ? 'Weekly' : viewMode === 'monthly' ? 'Monthly' : 'Term';
        fileName = `Attendance_${className}_${periodLabel}_Report.xlsx`;
        wsData = students.map((student) => {
          const stat = reportStats[student.id] || { present: 0, absent: 0, late: 0, total: 0 };
          const percentage = stat.total === 0 ? 100 : Math.round(((stat.present + stat.late) / stat.total) * 100);
          const row = {};
          availableFieldsList.forEach((field) => {
            if (!selectedFields[field.key]) return;
            if (field.key === 'admissionNo') row[field.label] = student.admissionNumber || '';
            if (field.key === 'studentName') row[field.label] = `${student.firstName} ${student.lastName || ''}`.trim();
            if (field.key === 'totalClasses') row[field.label] = stat.total;
            if (field.key === 'present') row[field.label] = stat.present;
            if (field.key === 'absent') row[field.label] = stat.absent;
            if (field.key === 'late') row[field.label] = stat.late;
            if (field.key === 'percentage') row[field.label] = `${percentage}%`;
          });
          return row;
        });
      }

      if (wsData.length === 0 || Object.keys(wsData[0]).length === 0) {
        toast.error('No data to export.');
        return;
      }

      const ws = XLSX.utils.json_to_sheet(wsData);
      const colWidths = Object.keys(wsData[0]).map((key) => ({
        wch: Math.max(key.length, ...wsData.map((row) => String(row[key] || '').length)) + 2
      }));
      ws['!cols'] = colWidths;

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Attendance');

      const rawName = exportFileName.trim() || fileName.replace(/\.xlsx$/i, '');
      const finalFileName = rawName.toLowerCase().endsWith('.xlsx') ? rawName : `${rawName}.xlsx`;

      XLSX.writeFile(wb, finalFileName);
      setShowExportModal(false);
      toast.success('Attendance exported successfully!');
    } catch (error) {
      console.error('[Attendance] Export error:', error);
      toast.error('Failed to export attendance.');
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Present':
        return 'bg-green-100 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-800';
      case 'Absent':
        return 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800';
      case 'Late':
        return 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800';
      default:
        return 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700';
    }
  };

  if (!classId) {
    return (
      <div className="p-8 text-center text-slate-500 dark:text-slate-400">
        You must be assigned to a class to take attendance.
      </div>
    );
  }

  const filteredStudents = students.filter(
    (st) =>
      `${st.firstName || ''} ${st.lastName || ''}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (st.admissionNumber && st.admissionNumber.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto h-full flex flex-col min-w-0 w-full animate-fade-in-up pb-24">
      {/* Header Banner */}
      <div className="relative bg-gradient-to-br from-primary-600 to-indigo-700 rounded-3xl p-6 md:p-8 text-white overflow-hidden shadow-lg mb-8 shrink-0">
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-xs font-bold uppercase tracking-wider">
                {classDetails ? `${classDetails.name || ''} ${classDetails.section || ''}`.trim() : 'Class Attendance'}
              </span>
              {hasExistingRecord && viewMode === 'daily' && (
                <span className="px-3 py-1 bg-emerald-400/30 text-emerald-200 border border-emerald-400/40 rounded-full text-xs font-bold">
                  Recorded
                </span>
              )}
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">Daily Attendance</h1>
            <p className="text-primary-100 mt-1">
              Mark student attendance for {selectedDate} ({selectedSession === 'FN' ? 'Forenoon' : 'Afternoon'})
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold text-sm transition-all flex items-center gap-2"
              title="Refresh attendance data"
            >
              <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <button
              onClick={() => setShowExportModal(true)}
              className="px-4 py-2.5 bg-white text-primary-700 hover:bg-primary-50 rounded-xl font-bold text-sm shadow-sm transition-all flex items-center gap-2"
            >
              <LuFileDown size={18} />
              Export
            </button>
          </div>
        </div>
      </div>

      {/* Control Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm mb-6 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          {/* View Mode Switcher */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            {['daily', 'weekly', 'monthly', 'term'].map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${
                  viewMode === mode
                    ? 'bg-white dark:bg-slate-700 text-primary-600 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          {viewMode === 'daily' && (
            <>
              {/* Date Picker */}
              <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
                <CalendarIcon size={16} className="text-slate-500" />
                <input
                  type="date"
                  max={today}
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="bg-transparent border-none text-xs font-bold text-slate-700 dark:text-slate-200 focus:outline-none"
                />
              </div>

              {/* Session Switcher */}
              <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                <button
                  onClick={() => setSelectedSession('FN')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    selectedSession === 'FN'
                      ? 'bg-white dark:bg-slate-700 text-primary-600 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  FN
                </button>
                <button
                  onClick={() => setSelectedSession('AN')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    selectedSession === 'AN'
                      ? 'bg-white dark:bg-slate-700 text-primary-600 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  AN
                </button>
              </div>
            </>
          )}
        </div>

        {/* Search Input */}
        <div className="w-full lg:w-72">
          <input
            type="text"
            placeholder="Search student by name or ADM..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-primary-500 outline-none"
          />
        </div>
      </div>

      {/* Main Roster / Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex-1">
        {loading ? (
          <div className="p-12 text-center text-slate-500 dark:text-slate-400 font-semibold">
            Loading attendance data...
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="p-12 text-center text-slate-500 dark:text-slate-400">
            <Users size={48} className="mx-auto text-slate-300 dark:text-slate-600 mb-4" />
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">No students found</h3>
            <p className="text-xs text-slate-400 mt-1">No active students registered for this class.</p>
          </div>
        ) : viewMode === 'daily' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  <th className="p-4 pl-6">ADM No</th>
                  <th className="p-4">Student Name</th>
                  <th className="p-4 text-center">Status</th>
                  <th className="p-4 pr-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredStudents.map((student) => {
                  const currentStatus = attendanceRecords[student.id] || 'Present';
                  return (
                    <tr key={student.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="p-4 pl-6 text-xs font-bold text-slate-500 dark:text-slate-400">
                        {student.admissionNumber || 'N/A'}
                      </td>
                      <td className="p-4">
                        <p className="font-bold text-slate-900 dark:text-white text-sm">
                          {student.firstName} {student.lastName || ''}
                        </p>
                        {student.rollNumber && (
                          <span className="text-xs font-semibold text-slate-400">Roll: {student.rollNumber}</span>
                        )}
                      </td>
                      <td className="p-4 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold border ${getStatusColor(
                            currentStatus
                          )}`}
                        >
                          {currentStatus === 'Present' && <CheckCircle2 size={12} />}
                          {currentStatus === 'Absent' && <XCircle size={12} />}
                          {currentStatus === 'Late' && <AlertCircle size={12} />}
                          {currentStatus}
                        </span>
                      </td>
                      <td className="p-4 pr-6 text-right">
                        <div className="inline-flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                          {['Present', 'Absent', 'Late'].map((status) => (
                            <button
                              key={status}
                              onClick={() => handleStatusChange(student.id, status)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                                currentStatus === status
                                  ? `${getStatusColor(status)} shadow-sm font-extrabold`
                                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                              }`}
                            >
                              {status}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  <th className="p-4 pl-6">ADM No</th>
                  <th className="p-4">Student Name</th>
                  <th className="p-4 text-center">Total Sessions</th>
                  <th className="p-4 text-center text-green-600">Present</th>
                  <th className="p-4 text-center text-red-600">Absent</th>
                  <th className="p-4 text-center text-amber-600">Late</th>
                  <th className="p-4 pr-6 text-right">Attendance %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredStudents.map((student) => {
                  const stat = reportStats[student.id] || { present: 0, absent: 0, late: 0, total: 0 };
                  const percentage = stat.total === 0 ? 100 : Math.round(((stat.present + stat.late) / stat.total) * 100);
                  return (
                    <tr key={student.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="p-4 pl-6 text-xs font-bold text-slate-500 dark:text-slate-400">
                        {student.admissionNumber || 'N/A'}
                      </td>
                      <td className="p-4 font-bold text-slate-900 dark:text-white text-sm">
                        {student.firstName} {student.lastName || ''}
                      </td>
                      <td className="p-4 text-center text-xs font-bold text-slate-700 dark:text-slate-300">{stat.total}</td>
                      <td className="p-4 text-center text-xs font-bold text-green-600">{stat.present}</td>
                      <td className="p-4 text-center text-xs font-bold text-red-600">{stat.absent}</td>
                      <td className="p-4 text-center text-xs font-bold text-amber-600">{stat.late}</td>
                      <td className="p-4 pr-6 text-right">
                        <span className="font-extrabold text-xs px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white">
                          {percentage}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Floating Save Footer for Daily Mode */}
      {viewMode === 'daily' && (
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-40 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-4 flex items-center gap-4 max-w-xl w-full">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
              {students.length} Students in Roster
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {hasExistingRecord ? 'Editing existing attendance session' : 'Creating new attendance session'}
            </p>
          </div>
          {successMsg && (
            <span className="text-xs font-bold text-emerald-600 animate-fade-in">{successMsg}</span>
          )}
          <button
            onClick={handleSave}
            disabled={saving || students.length === 0}
            className="px-6 py-2.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-bold text-sm rounded-xl transition-all shadow-md flex items-center gap-2 shrink-0"
          >
            <Save size={16} />
            {saving ? 'Saving...' : 'Save Attendance'}
          </button>
        </div>
      )}

      {/* Export Modal */}
      {showExportModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-lg p-6 border border-slate-200 dark:border-slate-800 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Export Attendance Report</h3>
              <button
                onClick={() => setShowExportModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors"
              >
                <LuX size={20} />
              </button>
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Custom File Name (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Class_5A_Attendance"
                  value={exportFileName}
                  onChange={(e) => setExportFileName(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold focus:ring-2 focus:ring-primary-500 outline-none"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-xs font-bold text-slate-500">Select Columns to Export</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleSelectAll(true)}
                      className="text-xs text-primary-600 font-bold hover:underline"
                    >
                      All
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      onClick={() => handleSelectAll(false)}
                      className="text-xs text-slate-400 font-bold hover:underline"
                    >
                      None
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 bg-slate-50 dark:bg-slate-800 p-3 rounded-xl">
                  {availableFieldsList.map((f) => (
                    <label key={f.key} className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!selectedFields[f.key]}
                        onChange={() => handleFieldToggle(f.key)}
                        className="rounded text-primary-600 focus:ring-primary-500"
                      />
                      <span>{f.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowExportModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleExport}
                className="px-5 py-2 text-xs font-bold bg-primary-600 hover:bg-primary-700 text-white rounded-xl shadow-md transition-all flex items-center gap-2"
              >
                <LuFileDown size={16} />
                Download Excel (.xlsx)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
