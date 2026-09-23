import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  listAttendanceSessions,
  getAttendanceSession,
  createAttendanceSession,
  updateAttendanceSession,
  getAttendanceDashboardStats,
  listAbsenteeFlags,
  resolveAbsenteeFlag
} from '../../api/attendance';
import { listClasses } from '../../api/classes';
import { listStudents } from '../../api/students';
import {
  LuCalendar as CalendarIcon,
  LuCircleCheck as CheckCircle2,
  LuSave as Save,
  LuUsers as Users,
  LuCircleAlert as AlertCircle,
  LuLayoutDashboard as DashboardIcon,
  LuClipboardCheck as ClipboardIcon,
  LuChevronDown as ChevronDown,
  LuChevronUp as ChevronUp,
  LuTrendingUp as TrendIcon,
  LuFileSpreadsheet as ExcelIcon,
  LuRefreshCw as RefreshCw
} from 'react-icons/lu';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import { sortClassesAscending } from '../../utils/classSorting';

export default function Attendance() {
  const { userProfile } = useAuth();

  const today = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedSession, setSelectedSession] = useState('FN');
  const [classes, setClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState('');

  const [students, setStudents] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [attendanceRecords, setAttendanceRecords] = useState({});
  const [attendanceRemarks, setAttendanceRemarks] = useState({});
  const [existingSessionId, setExistingSessionId] = useState(null);
  const [hasExistingRecord, setHasExistingRecord] = useState(false);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [viewMode, setViewMode] = useState('daily');
  const [historicalSessions, setHistoricalSessions] = useState([]);
  const [reportStats, setReportStats] = useState({});

  // Cutoff state (Standard SOP default 09:30 AM)
  const cutoffTime = '09:30';
  const [isPastCutoff, setIsPastCutoff] = useState(false);

  // Tabs, Dashboard & Analytics States
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' | 'marking' | 'analytics'
  const [dashboardStats, setDashboardStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [expandedGrades, setExpandedGrades] = useState({});

  // Analytics states
  const [monthlySessionsList, setMonthlySessionsList] = useState([]);
  const [loadingMonthly, setLoadingMonthly] = useState(false);
  const [absenteeFlags, setAbsenteeFlags] = useState([]);
  const [loadingFlags, setLoadingFlags] = useState(false);
  const [filterClassId, setFilterClassId] = useState('all');

  // Role details
  const isCoordinator = userProfile?.role === 'coordinator' || userProfile?.role === 'Grade Coordinator';
  const assignedGrades = userProfile?.assignedGrades || []; // e.g. ['5', 'Grade 5']

  // Request race protection refs
  const mountedRef = useRef(true);
  const currentClassRef = useRef(selectedClassId);
  const currentDateRef = useRef(selectedDate);
  const currentSessionRef = useRef(selectedSession);
  const currentTabRef = useRef(activeTab);

  useEffect(() => {
    currentClassRef.current = selectedClassId;
    currentDateRef.current = selectedDate;
    currentSessionRef.current = selectedSession;
    currentTabRef.current = activeTab;
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

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
  // 1. LOAD ALL CLASSES (REST)
  // ============================================================
  const fetchClasses = useCallback(async () => {
    try {
      const res = await listClasses({ limit: 100 });
      if (!mountedRef.current) return;
      const rawClasses = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
      const sortedClasses = sortClassesAscending(rawClasses);
      setClasses(sortedClasses);
      if (sortedClasses.length > 0 && !selectedClassId) {
        setSelectedClassId(sortedClasses[0].id);
      }
    } catch (err) {
      if (mountedRef.current) {
        console.error('[Admin Attendance] Error fetching classes:', err);
        toast.error('Failed to load classes.');
      }
    }
  }, [selectedClassId]);

  useEffect(() => {
    fetchClasses();
  }, [fetchClasses]);

  // ============================================================
  // 2. LOAD STUDENT ROSTER FOR SELECTED CLASS (REST)
  // ============================================================
  const fetchRoster = useCallback(async (targetClassId) => {
    if (!targetClassId) {
      setStudents([]);
      return;
    }

    try {
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
        console.error('[Admin Attendance] Error fetching student roster:', err);
        toast.error('Failed to load students.');
      }
    }
  }, []);

  useEffect(() => {
    if (selectedClassId) {
      fetchRoster(selectedClassId);
    }
  }, [selectedClassId, fetchRoster]);

  // ============================================================
  // 3. LOAD DAILY ATTENDANCE SESSION (REST)
  // ============================================================
  const fetchDailySession = useCallback(async (targetClassId, targetDate, targetSession, silent = false) => {
    if (!targetClassId || !targetDate) {
      setAttendanceRecords({});
      setExistingSessionId(null);
      setHasExistingRecord(false);
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

        recordsList.forEach(r => {
          if (r.studentId) {
            newRecords[r.studentId] = r.status || 'Present';
            if (r.remark) newRemarks[r.studentId] = r.remark;
          }
        });

        students.forEach(st => {
          if (!newRecords[st.id]) {
            newRecords[st.id] = 'Present';
          }
        });

        setAttendanceRecords(newRecords);
        setAttendanceRemarks(newRemarks);
      } else {
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
        console.error('[Admin Attendance] Error loading daily attendance:', err);
        toast.error('Failed to load attendance session.');
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

  useEffect(() => {
    if (activeTab === 'marking' && viewMode === 'daily' && selectedClassId && students.length > 0) {
      fetchDailySession(selectedClassId, selectedDate, selectedSession, false);
    }
  }, [activeTab, viewMode, selectedClassId, selectedDate, selectedSession, students, fetchDailySession]);

  // ============================================================
  // 4. LOAD DASHBOARD OVERVIEW METRICS (REST)
  // ============================================================
  const fetchDashboardStats = useCallback(async (targetDate) => {
    if (!targetDate) return;
    setLoadingStats(true);
    try {
      const res = await getAttendanceDashboardStats({ date: targetDate });
      if (!mountedRef.current || currentDateRef.current !== targetDate) return;
      setDashboardStats(res?.data || res);
    } catch (err) {
      if (mountedRef.current && currentDateRef.current === targetDate) {
        console.error('[Admin Attendance] Error loading dashboard stats:', err);
        toast.error('Failed to load dashboard statistics.');
        setDashboardStats(null);
      }
    } finally {
      if (mountedRef.current && currentDateRef.current === targetDate) {
        setLoadingStats(false);
      }
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'dashboard') {
      fetchDashboardStats(selectedDate);
    }
  }, [activeTab, selectedDate, fetchDashboardStats]);

  // ============================================================
  // 5. LOAD ANALYTICS TAB DATA (REST ABSENTEE FLAGS & MONTHLY SESSIONS)
  // ============================================================
  const fetchAnalyticsData = useCallback(async (targetDate) => {
    if (!targetDate) return;
    const monthStr = targetDate.slice(0, 7); // YYYY-MM
    setLoadingFlags(true);
    setLoadingMonthly(true);

    try {
      // 1. Fetch Absentee Flags
      const flagsRes = await listAbsenteeFlags({ month: monthStr, limit: 100 });
      if (mountedRef.current && currentDateRef.current.slice(0, 7) === monthStr) {
        const rawFlags = Array.isArray(flagsRes?.data) ? flagsRes.data : (Array.isArray(flagsRes) ? flagsRes : []);
        const enrichedFlags = rawFlags.map(f => ({
          ...f,
          studentName: f.student ? `${f.student.firstName} ${f.student.lastName || ''}`.trim() : (f.studentName || 'Unknown Student'),
          rollNumber: f.student?.rollNumber || f.rollNumber || '-',
          classId: f.class?.name ? `${f.class.name}${f.class.section ? `-${f.class.section}` : ''}` : (f.classId || '-')
        }));
        enrichedFlags.sort((a, b) => (b.absentCount || 0) - (a.absentCount || 0));
        setAbsenteeFlags(enrichedFlags);
        setLoadingFlags(false);
      }

      // 2. Fetch all month sessions with complete pagination for SVG Trend & Grade Averages
      let allMonthSessions = [];
      let currentPage = 1;
      let totalPages = 1;
      const startDate = `${monthStr}-01`;
      const endDate = targetDate;

      do {
        const sessRes = await listAttendanceSessions({
          startDate,
          endDate,
          page: currentPage,
          limit: 100
        });

        if (!mountedRef.current) return;
        const pageSessions = Array.isArray(sessRes?.data) ? sessRes.data : (Array.isArray(sessRes) ? sessRes : []);
        allMonthSessions = allMonthSessions.concat(pageSessions);
        totalPages = sessRes?.pagination?.totalPages || 1;
        currentPage += 1;
      } while (currentPage <= totalPages && mountedRef.current);

      if (mountedRef.current && currentDateRef.current.slice(0, 7) === monthStr) {
        setMonthlySessionsList(allMonthSessions);
        setLoadingMonthly(false);
      }
    } catch (err) {
      if (mountedRef.current) {
        console.error('[Admin Attendance] Error fetching analytics data:', err);
        setLoadingFlags(false);
        setLoadingMonthly(false);
      }
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'analytics') {
      fetchAnalyticsData(selectedDate);
    }
  }, [activeTab, selectedDate, fetchAnalyticsData]);

  // ============================================================
  // 6. HISTORICAL SESSIONS & REPORTS (MULTI-PAGE PAGINATION)
  // ============================================================
  useEffect(() => {
    if (activeTab !== 'marking' || viewMode === 'daily' || !selectedClassId) return;

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
            classId: selectedClassId,
            startDate: startDate || undefined,
            endDate: endDate || undefined,
            page: currentPage,
            limit: 100
          });

          if (!isMounted) return;
          const pageData = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
          allSessions = allSessions.concat(pageData);
          totalPages = res?.pagination?.totalPages || 1;
          currentPage += 1;
        } while (currentPage <= totalPages && isMounted);

        if (!isMounted) return;

        // Fetch detailed sessions if records are not already expanded
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
          console.error('[Admin Attendance] Error fetching historical reports:', err);
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
  }, [activeTab, viewMode, selectedClassId]);

  // Aggregate historical stats
  useEffect(() => {
    if (activeTab !== 'marking' || viewMode === 'daily' || students.length === 0) return;

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
  }, [activeTab, historicalSessions, viewMode, students]);

  // ============================================================
  // 7. SAVE / UPDATE ATTENDANCE ACTION (REST POST / PATCH)
  // ============================================================
  const handleStatusChange = (studentId, status) => {
    setAttendanceRecords((prev) => ({
      ...prev,
      [studentId]: status
    }));
  };

  const handleSave = async () => {
    if (!selectedClassId || students.length === 0) return;

    setSaving(true);
    const selectedClass = classes.find(c => c.id === selectedClassId);

    const formattedRecords = students.map((student) => ({
      studentId: student.id,
      status: attendanceRecords[student.id] || 'Present',
      remark: attendanceRemarks[student.id] || undefined
    }));

    try {
      if (existingSessionId) {
        await updateAttendanceSession(existingSessionId, {
          records: formattedRecords
        });
      } else {
        const payload = {
          classId: selectedClassId,
          sectionId: selectedClass?.sectionId || undefined,
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

      toast.success('Attendance saved successfully!');
    } catch (error) {
      console.error('[Admin Attendance] Error saving attendance:', error);
      toast.error(error.message || 'Failed to save attendance.');
    } finally {
      if (mountedRef.current) {
        setSaving(false);
      }
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    if (activeTab === 'dashboard') {
      fetchDashboardStats(selectedDate);
    } else if (activeTab === 'marking' && selectedClassId) {
      fetchDailySession(selectedClassId, selectedDate, selectedSession, false);
    } else if (activeTab === 'analytics') {
      fetchAnalyticsData(selectedDate);
    }
  };

  // ============================================================
  // 8. RESOLVE ABSENTEE FLAG / ALERT
  // ============================================================
  const handleDismissAlert = async (alertId) => {
    try {
      await resolveAbsenteeFlag(alertId, {
        isResolved: true,
        resolutionNotes: 'Dismissed by administrator'
      });
      toast.success('Alert dismissed.');
      fetchAnalyticsData(selectedDate);
    } catch (error) {
      console.error('[Admin Attendance] Error dismissing alert:', error);
      toast.error('Failed to dismiss alert.');
    }
  };

  // ============================================================
  // 9. EXCEL EXPORT FOR REPEATED ABSENTEES
  // ============================================================
  const handleExportExcel = () => {
    try {
      const dataToExport = absenteeFlags
        .filter(f => filterClassId === 'all' || f.classId === filterClassId)
        .map(f => ({
          'Roll No': f.rollNumber || '-',
          'Student Name': f.studentName,
          'Class': f.classId,
          'Month': f.monthStr || f.month || selectedDate.slice(0, 7),
          'Absence Count': f.absentCount,
          'Flagged At': f.createdAt ? new Date(f.createdAt).toLocaleDateString('en-GB') : '-'
        }));

      if (dataToExport.length === 0) {
        toast.error('No absentee records to export.');
        return;
      }

      const worksheet = XLSX.utils.json_to_sheet(dataToExport);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Repeated Absentees');
      XLSX.writeFile(workbook, `repeated_absentees_${selectedDate.slice(0, 7)}.xlsx`);
      toast.success('Excel exported successfully!');
    } catch (e) {
      console.error('[Admin Attendance] Failed to export Excel:', e);
      toast.error('Failed to export Excel.');
    }
  };

  // Compile Grade Averages for Analytics
  const getGradeMonthAverages = () => {
    const gradesMap = {};
    monthlySessionsList.forEach((sess) => {
      const grade = sess.class?.gradeLevel ? String(sess.class.gradeLevel) : (sess.class?.name || 'General');
      if (!gradesMap[grade]) {
        gradesMap[grade] = { presentCount: 0, totalCount: 0 };
      }
      const records = sess.records || [];
      records.forEach((r) => {
        gradesMap[grade].totalCount++;
        if (r.status === 'Present' || r.status === 'Late') {
          gradesMap[grade].presentCount++;
        }
      });
    });

    return Object.entries(gradesMap).map(([gradeId, accum]) => ({
      gradeId,
      average: accum.totalCount === 0 ? 100 : Math.round((accum.presentCount / accum.totalCount) * 100)
    }));
  };

  const renderTrendSVG = () => {
    if (monthlySessionsList.length === 0) return null;
    const width = 600;
    const height = 150;
    const padding = 30;

    // Group sessions by date
    const dateMap = {};
    monthlySessionsList.forEach((sess) => {
      const d = sess.date;
      if (!dateMap[d]) {
        dateMap[d] = { present: 0, total: 0 };
      }
      const records = sess.records || [];
      records.forEach((r) => {
        dateMap[d].total++;
        if (r.status === 'Present' || r.status === 'Late') {
          dateMap[d].present++;
        }
      });
    });

    const sortedDates = Object.keys(dateMap).sort();
    if (sortedDates.length === 0) return null;

    const points = sortedDates.map((dStr, idx) => {
      const x = padding + (idx / (sortedDates.length - 1 || 1)) * (width - 2 * padding);
      const dayData = dateMap[dStr];
      const percentage = dayData.total === 0 ? 100 : Math.round((dayData.present / dayData.total) * 100);
      const y = height - padding - (percentage / 100) * (height - 2 * padding);
      return { x, y, date: dStr, percentage };
    });

    const pathData = points.reduce((acc, p, idx) => {
      return idx === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
    }, '');

    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-48 bg-slate-50/50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 p-2">
        {[0, 25, 50, 75, 100].map((val) => {
          const y = height - padding - (val / 100) * (height - 2 * padding);
          return (
            <g key={val}>
              <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="#f1f5f9" strokeWidth="1" />
              <text x={padding - 5} y={y + 4} textAnchor="end" className="text-[8px] fill-slate-400 font-bold font-mono">{val}%</text>
            </g>
          );
        })}
        {pathData && <path d={pathData} fill="none" stroke="rgb(79, 70, 229)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}
        {points.map((p, idx) => (
          <g key={idx} className="group cursor-pointer">
            <circle cx={p.x} cy={p.y} r="4" className="fill-indigo-600 stroke-white stroke-2 hover:r-6 transition-all" />
            <title>{p.date}: {p.percentage}%</title>
          </g>
        ))}
      </svg>
    );
  };

  const toggleGrade = (gradeId) => {
    setExpandedGrades((prev) => ({ ...prev, [gradeId]: !prev[gradeId] }));
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Present': return 'bg-green-100 text-green-700 border-green-200';
      case 'Absent': return 'bg-red-100 text-red-700 border-red-200';
      case 'Late': return 'bg-amber-100 text-amber-700 border-amber-200';
      default: return 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700';
    }
  };

  // Filter scoped statistics for Grade Coordinators
  const getScopedStats = () => {
    if (!dashboardStats) return null;
    if (!isCoordinator || assignedGrades.length === 0) return dashboardStats;

    const filteredByGrade = {};
    const filteredByClass = {};

    Object.entries(dashboardStats.byGrade || {}).forEach(([gradeId, data]) => {
      const matches = assignedGrades.some(g =>
        g.toLowerCase() === gradeId.toLowerCase() ||
        gradeId.toLowerCase().includes(g.toLowerCase())
      );
      if (matches) filteredByGrade[gradeId] = data;
    });

    Object.entries(dashboardStats.byClass || {}).forEach(([classId, data]) => {
      const gradeLevel = data.gradeLevel || '';
      const matches = assignedGrades.some(g =>
        g.toLowerCase() === gradeLevel.toLowerCase() ||
        gradeLevel.toLowerCase().includes(g.toLowerCase())
      );
      if (matches) filteredByClass[classId] = data;
    });

    const schoolWide = { total: 0, present: 0, absent: 0, late: 0, percentage: 100 };
    Object.values(filteredByGrade).forEach((g) => {
      schoolWide.total += g.total;
      schoolWide.present += g.present;
      schoolWide.absent += g.absent;
      schoolWide.late += g.late;
    });
    if (schoolWide.total > 0) {
      schoolWide.percentage = Number((((schoolWide.present + schoolWide.late) / schoolWide.total) * 100).toFixed(1));
    }

    const classesTotal = Object.keys(filteredByClass).length;
    const classesMarked = Object.values(filteredByClass).filter((s) => s.total > 0).length;

    return {
      ...dashboardStats,
      schoolWide,
      byGrade: filteredByGrade,
      byClass: filteredByClass,
      classesMarked,
      classesTotal,
      classesPending: Math.max(0, classesTotal - classesMarked)
    };
  };

  const scopedStats = getScopedStats();

  return (
    <div className="p-8 max-w-7xl mx-auto pb-24">
      {/* Top Header Row */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Attendance Management</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">View analytics, run cutoff audits, and log student attendance records.</p>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-2xl font-bold text-sm transition-all flex items-center gap-2 shadow-sm shrink-0"
            title="Refresh attendance data"
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          {/* Tab Selection Wrapper */}
          <div className="overflow-x-auto custom-scrollbar pb-1 -mb-1">
            <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-700 p-1.5 rounded-2xl border border-slate-200/60 shadow-sm min-w-max">
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${
                  activeTab === 'dashboard'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-md'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100'
                }`}
              >
                <DashboardIcon size={16} /> Dashboard
              </button>
              <button
                onClick={() => setActiveTab('marking')}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${
                  activeTab === 'marking'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-md'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100'
                }`}
              >
                <ClipboardIcon size={16} /> Daily Marking
              </button>
              <button
                onClick={() => setActiveTab('analytics')}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${
                  activeTab === 'analytics'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-md'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100'
                }`}
              >
                <TrendIcon size={16} /> Analytics
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* --- DASHBOARD TAB VIEW --- */}
      {activeTab === 'dashboard' && (
        <div className="space-y-8 animate-fade-in">
          {/* Dashboard Filtering Controls */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <CalendarIcon className="text-primary-600" size={24} />
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">Historical Archives</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Select a calendar date to view the daily attendance snapshot.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 outline-none text-slate-700 dark:text-slate-200 font-semibold bg-white dark:bg-slate-900 cursor-pointer shadow-sm text-sm"
              />
              {selectedDate !== today && (
                <button
                  onClick={() => setSelectedDate(today)}
                  className="px-4 py-2.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-bold rounded-xl text-sm transition-colors shadow-sm"
                >
                  Today
                </button>
              )}
            </div>
          </div>

          {loadingStats ? (
            <div className="p-20 flex justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent"></div>
            </div>
          ) : !scopedStats ? (
            <div className="p-16 text-center bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm text-slate-400 dark:text-slate-300">
              <ClipboardIcon className="mx-auto mb-3 opacity-30" size={48} />
              <p className="font-bold text-base text-slate-600 dark:text-slate-300">No Statistics Calculated</p>
              <p className="text-xs mt-1">There are no dashboard records compiled for {selectedDate}. Marks must be saved to compile stats.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
              {/* Left Column: Aggregated Breakdown */}
              <div className="xl:col-span-2 space-y-6">
                {/* Metric Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-between">
                    <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Attendance Rate</p>
                    <p className="text-4xl font-extrabold text-slate-900 dark:text-white mt-2">
                      {scopedStats.schoolWide?.percentage ?? 100}%
                    </p>
                    <div className="mt-4 h-1.5 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div className="h-full bg-green-500 rounded-full" style={{ width: `${scopedStats.schoolWide?.percentage ?? 100}%` }}></div>
                    </div>
                  </div>
                  <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-between">
                    <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Classes Marked</p>
                    <p className="text-4xl font-extrabold text-slate-900 dark:text-white mt-2">
                      {scopedStats.classesMarked} <span className="text-lg font-medium text-slate-400 dark:text-slate-300">/ {scopedStats.classesTotal}</span>
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-300 mt-4">
                      {scopedStats.classesPending ?? Math.max(0, scopedStats.classesTotal - scopedStats.classesMarked)} classes remaining today
                    </p>
                  </div>
                  <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-between">
                    <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Pending Alerts</p>
                    <p className={`text-4xl font-extrabold mt-2 ${(scopedStats.classesPending || 0) > 0 ? 'text-red-600' : 'text-slate-900 dark:text-white'}`}>
                      {scopedStats.classesPending ?? 0}
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-300 mt-4">
                      Unrecorded class attendance sessions
                    </p>
                  </div>
                </div>

                {/* Grade and Section Breakdown Table */}
                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                  <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
                    <h3 className="font-bold text-slate-900 dark:text-white text-lg">Grade & Section Breakdown</h3>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {Object.entries(scopedStats.byGrade || {})
                      .sort(([gradeA], [gradeB]) => gradeA.localeCompare(gradeB, undefined, { numeric: true, sensitivity: 'base' }))
                      .map(([gradeId, gradeData]) => {
                        const isExpanded = !!expandedGrades[gradeId];
                        const classSections = Object.values(scopedStats.byClass || {})
                          .filter(s => (s.gradeLevel || 'General') === gradeId || s.className?.startsWith(gradeId))
                          .sort((a, b) => (a.className || '').localeCompare(b.className || '', undefined, { numeric: true, sensitivity: 'base' }));

                        return (
                          <div key={gradeId} className="group">
                            <div
                              onClick={() => toggleGrade(gradeId)}
                              className="flex items-center justify-between px-6 py-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                            >
                              <div className="flex items-center gap-3">
                                <span className="font-bold text-slate-800 dark:text-slate-100 text-base">Grade {gradeId}</span>
                                <span className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold px-2 py-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
                                  {classSections.length} Classes
                                </span>
                              </div>
                              <div className="flex items-center gap-8">
                                <div className="flex items-center gap-4 text-xs font-semibold text-slate-500 dark:text-slate-400">
                                  <span>Present: <b className="text-green-600">{gradeData.present}</b></span>
                                  <span>Absent: <b className="text-red-600">{gradeData.absent}</b></span>
                                  <span>Late: <b className="text-amber-600">{gradeData.late}</b></span>
                                </div>
                                <span className={`text-sm font-black px-3 py-1 rounded-full border ${
                                  gradeData.percentage >= 75
                                    ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-800'
                                    : gradeData.percentage >= 50
                                      ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
                                      : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800'
                                }`}>
                                  {gradeData.percentage}%
                                </span>
                                {isExpanded ? <ChevronUp className="text-slate-400 dark:text-slate-300" size={18} /> : <ChevronDown className="text-slate-400 dark:text-slate-300" size={18} />}
                              </div>
                            </div>

                            {isExpanded && (
                              <div className="bg-slate-50/40 dark:bg-slate-800/40 px-6 py-2 border-t border-slate-100 dark:border-slate-800">
                                <table className="w-full text-left border-collapse my-2">
                                  <thead>
                                    <tr className="text-slate-400 dark:text-slate-300 font-bold text-[10px] uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
                                      <th className="pb-2">Class / Section</th>
                                      <th className="pb-2">Total Students</th>
                                      <th className="pb-2 text-green-600">Present</th>
                                      <th className="pb-2 text-red-600">Absent</th>
                                      <th className="pb-2 text-amber-600">Late</th>
                                      <th className="pb-2 text-right">Percentage</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {classSections.map((sec, sIdx) => (
                                      <tr key={sIdx} className="border-b border-slate-100/50 dark:border-slate-800/50 last:border-0 hover:bg-slate-100/40 dark:hover:bg-slate-800/40 text-sm">
                                        <td className="py-2.5 font-bold text-slate-700 dark:text-slate-200">{sec.className}</td>
                                        <td className="py-2.5 font-medium text-slate-500 dark:text-slate-400">{sec.total}</td>
                                        <td className="py-2.5 font-semibold text-green-600">{sec.present}</td>
                                        <td className="py-2.5 font-semibold text-red-600">{sec.absent}</td>
                                        <td className="py-2.5 font-semibold text-amber-600">{sec.late}</td>
                                        <td className="py-2.5 text-right">
                                          <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded-lg border ${
                                            sec.total === 0
                                              ? 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                                              : sec.percentage >= 75
                                                ? 'bg-green-50 text-green-600 border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-800'
                                                : sec.percentage >= 50
                                                  ? 'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
                                                  : 'bg-red-50 text-red-600 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800'
                                          }`}>
                                            {sec.total === 0 ? 'Unmarked' : `${sec.percentage}%`}
                                          </span>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </div>
              </div>

              {/* Right Column: Pending Alert Panel */}
              <div className="xl:col-span-1">
                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-red-200 dark:border-red-900/60 overflow-hidden shadow-sm sticky top-6">
                  <div className="border-b border-red-100 dark:border-red-900/40 px-6 py-4 bg-red-50/55 dark:bg-red-950/30 flex items-center justify-between">
                    <h2 className="text-base font-bold text-red-800 dark:text-red-300 flex items-center gap-2">
                      <AlertCircle className="text-red-600 dark:text-red-400" size={20} /> Pending Class Logs
                    </h2>
                    <span className="bg-red-100 dark:bg-red-900/60 text-red-800 dark:text-red-200 text-xs px-2.5 py-0.5 rounded-full font-black">
                      {scopedStats.classesPending ?? 0}
                    </span>
                  </div>
                  {(scopedStats.classesPending || 0) === 0 ? (
                    <div className="p-8 text-center text-slate-400 dark:text-slate-300">
                      <CheckCircle2 className="mx-auto mb-2 text-green-500" size={28} />
                      <p className="font-bold text-sm text-slate-700 dark:text-slate-200">All Attendance Logged</p>
                      <p className="text-xs mt-0.5">All class attendance sessions recorded for {selectedDate}.</p>
                    </div>
                  ) : (
                    <div className="p-6 space-y-4 max-h-[480px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                      {Object.values(scopedStats.byClass || {})
                        .filter(s => s.total === 0)
                        .map((c) => (
                          <div key={c.classId} className="flex items-start justify-between gap-4 pt-3 first:pt-0">
                            <div>
                              <p className="font-bold text-slate-800 dark:text-slate-100 text-sm">Attendance Pending</p>
                              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                Class: {c.className}
                              </p>
                              <p className="text-[10px] text-slate-400 dark:text-slate-300 mt-0.5">
                                Date: {selectedDate}
                              </p>
                            </div>
                            <button
                              onClick={() => {
                                setSelectedClassId(c.classId);
                                setActiveTab('marking');
                              }}
                              className="text-xs font-bold text-primary-600 hover:text-primary-700 bg-primary-50 dark:bg-primary-950/40 px-3 py-1.5 rounded-xl transition-colors shrink-0"
                            >
                              Mark Now
                            </button>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* --- ANALYTICS TAB VIEW --- */}
      {activeTab === 'analytics' && (
        <div className="space-y-8 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <TrendIcon className="text-primary-600" size={24} />
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">Historical & Trend Analytics</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Explore monthly statistics, compare grade averages, and track repeated absentees.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 outline-none text-slate-700 dark:text-slate-200 font-semibold bg-white dark:bg-slate-900 cursor-pointer shadow-sm text-sm"
              />
              {selectedDate !== today && (
                <button
                  onClick={() => setSelectedDate(today)}
                  className="px-4 py-2.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-bold rounded-xl text-sm transition-colors shadow-sm"
                >
                  Today
                </button>
              )}
            </div>
          </div>

          {loadingMonthly ? (
            <div className="p-20 flex justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent"></div>
            </div>
          ) : monthlySessionsList.length === 0 ? (
            <div className="p-16 text-center bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm text-slate-400 dark:text-slate-300">
              <TrendIcon className="mx-auto mb-3 opacity-30" size={48} />
              <p className="font-bold text-base text-slate-600 dark:text-slate-300">No Monthly Data Available</p>
              <p className="text-xs mt-1">There are no attendance sessions recorded for the month of {selectedDate.slice(0, 7)}.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-lg">School-Wide Monthly Trend</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Daily attendance percentage rate plotted across the month.</p>
                </div>
                <div className="pt-2">
                  {renderTrendSVG()}
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-lg">Grade-by-Grade Comparison</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Average monthly attendance rate comparison per grade level.</p>
                </div>
                <div className="space-y-4 overflow-y-auto max-h-[220px] pr-2">
                  {getGradeMonthAverages().map((grade) => (
                    <div key={grade.gradeId} className="space-y-1.5">
                      <div className="flex justify-between text-xs font-bold text-slate-700 dark:text-slate-200">
                        <span>Grade {grade.gradeId}</span>
                        <span>{grade.average}%</span>
                      </div>
                      <div className="h-2.5 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-primary-500 to-indigo-600 rounded-full transition-all duration-500"
                          style={{ width: `${grade.average}%` }}
                        ></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Repeated Absentees Card */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-50/50 dark:bg-slate-800/50">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-lg">Repeated Absentees Audit</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Students whose monthly absences meet or exceed the school threshold.</p>
              </div>
              <div className="flex items-center gap-3 w-full sm:w-auto shrink-0 justify-end">
                <select
                  value={filterClassId}
                  onChange={(e) => setFilterClassId(e.target.value)}
                  className="border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-200 font-semibold py-2 px-3 bg-white dark:bg-slate-900 shadow-sm outline-none text-xs"
                >
                  <option value="all">All Classes</option>
                  {classes.map(cls => (
                    <option key={cls.id} value={cls.id}>{cls.name} - {cls.section || 'A'}</option>
                  ))}
                </select>
                <button
                  onClick={handleExportExcel}
                  disabled={absenteeFlags.length === 0}
                  className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-sm transition-colors"
                >
                  <ExcelIcon size={14} /> Export Excel
                </button>
              </div>
            </div>

            {loadingFlags ? (
              <div className="p-12 flex justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-600 border-t-transparent"></div>
              </div>
            ) : absenteeFlags.length === 0 ? (
              <div className="p-12 text-center text-slate-500 dark:text-slate-400 text-sm">
                No repeated absentees flagged for {selectedDate.slice(0, 7)}.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800">
                      <th className="p-4 text-xs font-bold text-slate-400 dark:text-slate-300 pl-6">Roll No</th>
                      <th className="p-4 text-xs font-bold text-slate-400 dark:text-slate-300">Student Name</th>
                      <th className="p-4 text-xs font-bold text-slate-400 dark:text-slate-300">Class</th>
                      <th className="p-4 text-xs font-bold text-slate-400 dark:text-slate-300">Month</th>
                      <th className="p-4 text-xs font-bold text-slate-400 dark:text-slate-300 text-center">Monthly Absences</th>
                      <th className="p-4 text-xs font-bold text-slate-400 dark:text-slate-300 text-right pr-6">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {absenteeFlags
                      .filter(f => filterClassId === 'all' || f.classId === filterClassId)
                      .map((flag) => (
                        <tr key={flag.id} className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                          <td className="p-4 text-slate-600 dark:text-slate-300 font-medium pl-6">{flag.rollNumber || '-'}</td>
                          <td className="p-4 font-bold text-slate-900 dark:text-white">{flag.studentName}</td>
                          <td className="p-4 font-semibold text-slate-600 dark:text-slate-300">{flag.classId}</td>
                          <td className="p-4 font-semibold text-slate-500 dark:text-slate-400">{flag.monthStr || flag.month || selectedDate.slice(0, 7)}</td>
                          <td className="p-4 text-center font-black text-red-600 text-sm">{flag.absentCount}</td>
                          <td className="p-4 text-right pr-6">
                            <button
                              onClick={() => handleDismissAlert(flag.id)}
                              className="text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-red-600 hover:bg-red-50/80 dark:hover:bg-red-950/40 px-2.5 py-1 rounded-lg transition-colors"
                            >
                              Resolve
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- DAILY MARKING TAB VIEW --- */}
      {activeTab === 'marking' && (
        <div className="space-y-8 animate-fade-in">
          {/* Class, Session & Date selectors */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4 w-full md:w-auto">
              <select
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                className="border-slate-200 dark:border-slate-700 rounded-xl focus:ring-primary-500 text-slate-700 dark:text-slate-200 font-semibold py-2.5 pl-4 pr-10 bg-white dark:bg-slate-900 shadow-sm outline-none text-sm w-full sm:w-auto"
              >
                <option value="" disabled>Select Class</option>
                {classes.map(cls => (
                  <option key={cls.id} value={cls.id}>{cls.name} - Section {cls.section || 'A'}</option>
                ))}
              </select>
              <select
                value={viewMode}
                onChange={(e) => setViewMode(e.target.value)}
                className="border-slate-200 dark:border-slate-700 rounded-xl focus:ring-primary-500 text-slate-700 dark:text-slate-200 font-semibold py-2.5 pl-4 pr-10 bg-white dark:bg-slate-900 shadow-sm outline-none text-sm w-full sm:w-auto"
              >
                <option value="daily">Daily Marking</option>
                <option value="weekly">This Week Report</option>
                <option value="monthly">This Month Report</option>
                <option value="term">This Term Report</option>
              </select>
            </div>

            {viewMode === 'daily' && (
              <div className="flex flex-wrap items-center gap-3 shrink-0 w-full md:w-auto justify-end">
                <div className="flex items-center gap-2 bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                  <CalendarIcon size={18} className="text-slate-400 dark:text-slate-300 ml-1" />
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="border-none focus:ring-0 text-slate-700 dark:text-slate-200 font-semibold text-sm py-0 pr-1 bg-transparent cursor-pointer outline-none"
                  />
                </div>
                <select
                  value={selectedSession}
                  onChange={(e) => setSelectedSession(e.target.value)}
                  className="border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-primary-500 text-slate-700 dark:text-slate-200 font-bold py-2.5 px-4 bg-white dark:bg-slate-900 shadow-sm outline-none text-sm"
                >
                  <option value="FN">FN (Forenoon)</option>
                  <option value="AN">AN (Afternoon)</option>
                </select>
              </div>
            )}
          </div>

          {viewMode === 'daily' && isPastCutoff && !hasExistingRecord && (
            <div className="p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 text-amber-800 dark:text-amber-300 rounded-2xl flex items-start gap-3 animate-fade-in-down">
              <AlertCircle size={20} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-sm">Attendance not marked — past cutoff ({cutoffTime})</p>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">New marks will default to Late. Staff can still mark attendance manually.</p>
              </div>
            </div>
          )}

          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 flex justify-between items-center">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-600 dark:text-slate-300 pl-2">
                <Users size={18} />
                <span>{students.length} Students</span>
              </div>
              {viewMode === 'daily' && (
                <button
                  onClick={handleSave}
                  disabled={saving || loading || students.length === 0}
                  className="px-6 py-2 bg-primary-600 text-white rounded-xl font-bold hover:bg-primary-700 disabled:opacity-50 transition-colors flex items-center gap-2 shadow-sm"
                >
                  {saving ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div> : <Save size={18} />}
                  {saving ? 'Saving...' : 'Save Attendance'}
                </button>
              )}
            </div>

            <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
              <input
                type="text"
                placeholder="Search student by name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full md:w-1/3 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-shadow text-sm"
              />
            </div>

            {loading ? (
              <div className="p-20 flex justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent"></div>
              </div>
            ) : students.length === 0 ? (
              <div className="p-12 text-center text-slate-500 dark:text-slate-400">No students found in this class.</div>
            ) : viewMode === 'daily' ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800">
                      <th className="p-4 text-sm font-semibold text-slate-400 dark:text-slate-300 pl-6">Roll No</th>
                      <th className="p-4 text-sm font-semibold text-slate-400 dark:text-slate-300">Student Name</th>
                      <th className="p-4 text-sm font-semibold text-slate-400 dark:text-slate-300">Status</th>
                      <th className="p-4 text-sm font-semibold text-slate-400 dark:text-slate-300 text-right pr-6">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students
                      .filter(s => `${s.firstName} ${s.lastName || ''}`.toLowerCase().includes(searchQuery.toLowerCase()))
                      .map((student) => (
                        <tr key={student.id} className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                          <td className="p-4 text-slate-600 dark:text-slate-300 font-medium pl-6">{student.rollNumber || '-'}</td>
                          <td className="p-4 font-bold text-slate-900 dark:text-white">
                            {student.firstName} {student.lastName || ''}
                          </td>
                          <td className="p-4">
                            <span className={`px-3 py-1 text-xs font-bold uppercase tracking-wider rounded-full border ${getStatusColor(attendanceRecords[student.id])}`}>
                              {attendanceRecords[student.id] || 'Present'}
                            </span>
                          </td>
                          <td className="p-4 text-right pr-6">
                            <div className="flex justify-end gap-2">
                              {['Present', 'Absent', 'Late'].map(status => (
                                <button
                                  key={status}
                                  onClick={() => handleStatusChange(student.id, status)}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                                    attendanceRecords[student.id] === status
                                      ? getStatusColor(status)
                                      : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                                  }`}
                                >
                                  {status}
                                </button>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider font-semibold">
                      <th className="p-4 pl-6">Roll No</th>
                      <th className="p-4">Student Name</th>
                      <th className="p-4">Total Classes</th>
                      <th className="p-4 text-green-600">Present</th>
                      <th className="p-4 text-red-600">Absent</th>
                      <th className="p-4 text-amber-600">Late</th>
                      <th className="p-4 pr-6 text-right">Percentage</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                    {students
                      .filter(s => `${s.firstName} ${s.lastName || ''}`.toLowerCase().includes(searchQuery.toLowerCase()))
                      .map(student => {
                        const stat = reportStats[student.id] || { present: 0, absent: 0, late: 0, total: 0 };
                        const percentage = stat.total === 0 ? 100 : Math.round(((stat.present + stat.late) / stat.total) * 100);

                        return (
                          <tr key={student.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                            <td className="p-4 pl-6 text-slate-600 dark:text-slate-300 font-medium">{student.rollNumber || '-'}</td>
                            <td className="p-4">
                              <div className="font-bold text-slate-900 dark:text-white">{student.firstName} {student.lastName || ''}</div>
                            </td>
                            <td className="p-4 font-semibold text-slate-600 dark:text-slate-300">{stat.total}</td>
                            <td className="p-4 font-semibold text-green-600">{stat.present}</td>
                            <td className="p-4 font-semibold text-red-600">{stat.absent}</td>
                            <td className="p-4 font-semibold text-amber-600">{stat.late}</td>
                            <td className="p-4 pr-6 text-right">
                              <span className={`inline-flex items-center justify-center px-3 py-1 text-xs font-bold rounded-full border ${
                                percentage >= 75
                                  ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-800'
                                  : percentage >= 50
                                    ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
                                    : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800'
                              }`}>
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
        </div>
      )}
    </div>
  );
}
