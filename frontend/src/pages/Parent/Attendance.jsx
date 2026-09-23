import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getStudentAttendance } from '../../api/attendance';
import { LuCalendar as Calendar, LuCircleCheck as CheckCircle2, LuCircleX as XCircle, LuCircleAlert as AlertCircle } from 'react-icons/lu';
import toast from 'react-hot-toast';

export default function ParentAttendance() {
  const { userProfile } = useAuth();
  const studentId = userProfile?.linkedStudentId;

  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState(null);

  const mountedRef = useRef(true);
  const currentStudentRef = useRef(studentId);

  const fetchAttendance = async (targetStudentId, currentFilter) => {
    try {
      setLoading(true);
      setError(null);
      const res = await getStudentAttendance(targetStudentId, { filter: currentFilter, limit: 100 });
      if (!mountedRef.current || currentStudentRef.current !== targetStudentId) return;

      const rawTimeline = res?.timeline || [];
      const records = rawTimeline.map(item => ({
        id: item.id,
        date: item.session?.date || item.date || '',
        status: item.status || 'PRESENT',
        remark: item.remark || '',
        session: item.session?.session || item.session || 'Morning',
        className: item.session?.class?.name || ''
      }));

      // Sort by date descending
      records.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

      setAttendanceRecords(records);
    } catch (err) {
      if (mountedRef.current && currentStudentRef.current === targetStudentId) {
        console.error('Error fetching student attendance:', err);
        setError(err.message || 'Failed to load attendance records.');
        toast.error(err.message || 'Failed to load attendance records.');
        setAttendanceRecords([]);
      }
    } finally {
      if (mountedRef.current && currentStudentRef.current === targetStudentId) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    currentStudentRef.current = studentId;

    if (!studentId) {
      setLoading(false);
      setAttendanceRecords([]);
      return;
    }

    fetchAttendance(studentId, filter);

    return () => {
      mountedRef.current = false;
    };
  }, [studentId, filter]);

  const normalizeStatus = (status) => {
    const s = (status || '').toUpperCase();
    if (s === 'PRESENT') return 'Present';
    if (s === 'ABSENT') return 'Absent';
    if (s === 'LATE') return 'Late';
    return status || 'Present';
  };

  const getStatusIcon = (status) => {
    const s = normalizeStatus(status);
    if (s === 'Present') return <CheckCircle2 size={20} className="text-green-500" />;
    if (s === 'Absent') return <XCircle size={20} className="text-red-500" />;
    if (s === 'Late') return <AlertCircle size={20} className="text-amber-500" />;
    return null;
  };

  const getStatusColor = (status) => {
    const s = normalizeStatus(status);
    if (s === 'Present') return 'bg-green-50 text-green-700 border-green-200';
    if (s === 'Absent') return 'bg-red-50 text-red-700 border-red-200';
    if (s === 'Late') return 'bg-amber-50 text-amber-700 border-amber-200';
    return 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700';
  };

  const formatDateDisplay = (dateString) => {
    if (!dateString) return 'N/A';
    // Use date parts to prevent timezone shift with UTC midnight
    const parts = dateString.split('T')[0].split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const monthIndex = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      return new Date(year, monthIndex, day).toLocaleDateString('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
    }
    return new Date(dateString).toLocaleDateString('en-GB');
  };

  const presentCount = attendanceRecords.filter(r => normalizeStatus(r.status) === 'Present').length;
  const absentCount = attendanceRecords.filter(r => normalizeStatus(r.status) === 'Absent').length;
  const lateCount = attendanceRecords.filter(r => normalizeStatus(r.status) === 'Late').length;
  const totalCount = attendanceRecords.length;
  const percentage = totalCount === 0 ? 100 : Math.round(((presentCount + lateCount) / totalCount) * 100);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-[80vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto animate-fade-in-up pb-24 min-w-0 w-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4 w-full">
        <div className="min-w-0">
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight truncate">Detailed Attendance</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">View your child's daily attendance records.</p>
        </div>
        
        <div className="w-full sm:w-48">
          <select 
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900"
          >
            <option value="all">All Time</option>
            <option value="weekly">This Week</option>
            <option value="monthly">This Month</option>
            <option value="term">This Term</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-sm font-medium">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm text-center">
          <div className="text-3xl font-black text-slate-900 dark:text-white mb-1">{percentage}%</div>
          <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Overall</div>
        </div>
        <div className="bg-green-50 p-6 rounded-2xl border border-green-100 shadow-sm text-center">
          <div className="text-3xl font-black text-green-700 mb-1">{presentCount}</div>
          <div className="text-xs font-bold text-green-600/70 uppercase tracking-wider">Present</div>
        </div>
        <div className="bg-red-50 p-6 rounded-2xl border border-red-100 shadow-sm text-center">
          <div className="text-3xl font-black text-red-700 mb-1">{absentCount}</div>
          <div className="text-xs font-bold text-red-600/70 uppercase tracking-wider">Absent</div>
        </div>
        <div className="bg-amber-50 p-6 rounded-2xl border border-amber-100 shadow-sm text-center">
          <div className="text-3xl font-black text-amber-700 mb-1">{lateCount}</div>
          <div className="text-xs font-bold text-amber-600/70 uppercase tracking-wider">Late</div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        {attendanceRecords.length === 0 ? (
          <div className="p-16 text-center text-slate-500 dark:text-slate-400">
            <Calendar size={48} className="mx-auto mb-4 text-slate-300" />
            <p className="text-lg font-bold text-slate-900 dark:text-white mb-1">No Records Found</p>
            <p>No attendance records found for this period.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {attendanceRecords.map(record => {
              const displayStatus = normalizeStatus(record.status);
              return (
                <div key={record.id} className="p-4 sm:p-6 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-slate-100 dark:bg-slate-700 rounded-xl flex items-center justify-center text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                      <Calendar size={20} />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 dark:text-white">{formatDateDisplay(record.date)}</h3>
                      {record.remark && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{record.remark}</p>
                      )}
                    </div>
                  </div>
                  <div className={`px-4 py-1.5 rounded-lg border font-bold text-sm flex items-center gap-2 ${getStatusColor(record.status)}`}>
                    {getStatusIcon(record.status)}
                    {displayStatus}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
