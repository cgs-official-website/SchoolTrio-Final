import React, { useState, useEffect, useCallback, useRef } from 'react';
import { LuTrendingUp, LuUsers, LuIndianRupee, LuBookOpen } from 'react-icons/lu';
import * as XLSX from 'xlsx';
import { useAuth } from '../../context/AuthContext';
import { invoicesApi } from '../../api/invoices';
import { studentsApi } from '../../api/students';
import { staffApi } from '../../api/staff';
import { attendanceApi } from '../../api/attendance';
import toast from 'react-hot-toast';

export default function ReportsAnalytics() {
  const { userProfile } = useAuth();
  const schoolId = userProfile?.schoolId;

  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState({
    totalRevenue: 0,
    studentEnrollment: 0,
    averageAttendance: 0,
    totalStaff: 0
  });

  const [revenueData, setRevenueData] = useState([]);
  const [attendanceData, setAttendanceData] = useState([]);
  const isMountedRef = useRef(true);

  const loadReports = useCallback(async () => {
    setLoading(true);

    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const currentMonthIndex = new Date().getMonth();
    const currentYear = new Date().getFullYear();

    // Prepare 7-day attendance date metadata using local calendar dates
    const dayDates = [];
    const dayRequests = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const iso = `${year}-${month}-${day}`;
      const dayName = days[d.getDay()];
      const formattedDate = `${day}/${month}`;
      dayDates.push({ iso, dayName, formattedDate });
      dayRequests.push(
        attendanceApi.getAttendanceDashboardStats({ date: iso }).catch((err) => {
          console.warn(`[ReportsAnalytics] Failed to fetch attendance stats for ${iso}:`, err);
          return null;
        })
      );
    }

    try {
      const [
        invoiceStatsRes,
        monthlyRevenueRes,
        studentsRes,
        staffRes,
        todayAttendanceRes,
        ...dailyStatsResults
      ] = await Promise.all([
        invoicesApi.getInvoiceStats().catch(() => null),
        invoicesApi.getMonthlyRevenueReports({ months: 7 }).catch(() => null),
        studentsApi.listStudents({ limit: 1 }).catch(() => null),
        staffApi.listStaff({ limit: 1 }).catch(() => null),
        attendanceApi.getAttendanceDashboardStats().catch(() => null),
        ...dayRequests
      ]);

      if (!isMountedRef.current) return;

      // 1. KPI Metrics
      const totalRevenue = Number(invoiceStatsRes?.data?.collectedAmount ?? invoiceStatsRes?.data?.collected ?? 0);
      const studentEnrollment = Number(studentsRes?.pagination?.total || 0);
      const totalStaff = Number(staffRes?.pagination?.total || 0);
      const averageAttendance = Math.round(Number(todayAttendanceRes?.data?.schoolWide?.percentage || 0));

      setMetrics({
        totalRevenue,
        studentEnrollment,
        averageAttendance,
        totalStaff
      });

      // 2. Revenue Overview Chart (Last 7 Months)
      const revMap = {};
      if (Array.isArray(monthlyRevenueRes?.data)) {
        monthlyRevenueRes.data.forEach(item => {
          if (item.month) {
            revMap[item.month] = Number(item.collectedAmount || 0);
          }
        });
      }

      const revChart = [];
      let maxRev = 0;
      for (let i = 6; i >= 0; i--) {
        const d = new Date(currentYear, currentMonthIndex - i, 1);
        const mIdx = d.getMonth();
        const yearStr = d.getFullYear();
        const monthKey = `${yearStr}-${String(mIdx + 1).padStart(2, '0')}`;
        const rev = revMap[monthKey] ?? 0;
        if (rev > maxRev) maxRev = rev;
        revChart.push({ month: months[mIdx], revenue: rev });
      }

      const chartWithPct = revChart.map(item => ({
        ...item,
        pct: maxRev > 0 ? Math.round((item.revenue / maxRev) * 100) : 0
      }));
      setRevenueData(chartWithPct);

      // 3. Attendance Trends (Last 7 Days)
      const attChart = dayDates.map((d, index) => {
        const res = dailyStatsResults[index];
        const sw = res?.data?.schoolWide || res?.schoolWide || {};
        const total = Number(sw.total || 0);
        const present = Number(sw.present || 0);
        const absent = Number(sw.absent || 0);
        const late = Number(sw.late || 0);
        const percentage = sw.percentage !== undefined && total > 0
          ? Math.round(Number(sw.percentage))
          : total > 0
            ? Math.round(((present + late) / total) * 100)
            : 0;

        return {
          date: d.iso,
          formattedDate: d.formattedDate,
          day: d.dayName,
          attendance: percentage,
          present,
          absent,
          late,
          total
        };
      });
      setAttendanceData(attChart);

    } catch (error) {
      console.error("Failed to load reports and analytics data:", error);
      if (isMountedRef.current) {
        toast.error("Failed to load report metrics.");
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    if (schoolId) {
      loadReports();
    }
    return () => {
      isMountedRef.current = false;
    };
  }, [schoolId, loadReports]);

  const displayMetrics = [
    { title: 'Total Revenue (YTD)', value: `₹${metrics.totalRevenue.toLocaleString()}`, trend: '', icon: LuIndianRupee, color: 'bg-emerald-500' },
    { title: 'Student Enrollment', value: metrics.studentEnrollment.toLocaleString(), trend: '', icon: LuUsers, color: 'bg-blue-500' },
    { title: 'Average Attendance', value: `${metrics.averageAttendance}%`, trend: '', icon: LuTrendingUp, color: 'bg-indigo-500' },
    { title: 'Total Teachers', value: metrics.totalStaff.toLocaleString(), trend: '', icon: LuBookOpen, color: 'bg-purple-500' },
  ];

  const handleDownload = () => {
    try {
      const data = displayMetrics.map(m => ({
        Metric: m.title,
        Value: m.value
      }));

      const exportRevenue = revenueData.map(r => ({ Month: r.month, Revenue: `₹${r.revenue}` }));
      const exportAttendance = attendanceData.map(a => ({
        Date: a.date,
        Day: a.day,
        Attendance: `${a.attendance}%`,
        Present: a.present,
        Absent: a.absent,
        Late: a.late,
        Total: a.total
      }));

      const wb = XLSX.utils.book_new();
      
      const wsMetrics = XLSX.utils.json_to_sheet(data);
      XLSX.utils.book_append_sheet(wb, wsMetrics, "KPI Metrics");

      const wsRevenue = XLSX.utils.json_to_sheet(exportRevenue);
      XLSX.utils.book_append_sheet(wb, wsRevenue, "Revenue Overview");

      const wsAttendance = XLSX.utils.json_to_sheet(exportAttendance);
      XLSX.utils.book_append_sheet(wb, wsAttendance, "Attendance Trends");

      XLSX.writeFile(wb, "School_Performance_Report.xlsx");
    } catch (error) {
      console.error("Failed to export report:", error);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-full min-h-[50vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto h-[calc(100vh-2rem)] flex flex-col overflow-y-auto custom-scrollbar">
      <div className="flex justify-between items-end mb-8 shrink-0">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Reports & Analytics</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Key performance metrics and school insights.</p>
        </div>
        <button 
          onClick={handleDownload}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 px-5 py-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-all font-medium shadow-sm active:scale-95"
        >
          Download Full Report
        </button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8 shrink-0">
        {displayMetrics.map((metric, idx) => (
          <div key={idx} className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-4">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white ${metric.color}`}>
                <metric.icon size={24} />
              </div>
            </div>
            <div>
              <p className="text-slate-500 dark:text-slate-400 text-sm font-semibold uppercase tracking-wider">{metric.title}</p>
              <h2 className="text-3xl font-bold text-slate-900 dark:text-white mt-1">{metric.value}</h2>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-[400px]">
        {/* Revenue Chart */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6">Revenue Overview</h3>
          <div className="flex-1 flex items-end justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
            {revenueData.map((data, i) => (
              <div key={i} className="w-full bg-emerald-100 rounded-t-md relative group hover:bg-emerald-200 transition-colors" style={{ height: `${Math.max(data.pct, 5)}%` }}>
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-slate-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                  ₹{data.revenue.toLocaleString()}
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-between text-xs text-slate-400 dark:text-slate-300 mt-2 font-medium px-2">
            {revenueData.map((data, i) => <span key={i}>{data.month}</span>)}
          </div>
        </div>

        {/* Attendance Chart */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Attendance Trends (Last 7 Days)</h3>
              <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mt-0.5">Daily attendance percentage and student breakdown</p>
            </div>
            {attendanceData.some(d => d.total > 0) && (
              <div className="flex items-center gap-3 text-xs font-bold text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-indigo-500"></span> Present %</span>
              </div>
            )}
          </div>

          <div className="flex-1 flex items-end justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2 min-h-[160px]">
            {attendanceData.map((data, i) => {
              const hasRecords = data.total > 0;
              const barHeight = hasRecords ? Math.max(data.attendance, 6) : 4;
              const barBg = hasRecords
                ? 'bg-indigo-500/80 hover:bg-indigo-600 dark:bg-indigo-500 dark:hover:bg-indigo-400'
                : 'bg-slate-100 dark:bg-slate-800';

              return (
                <div
                  key={i}
                  className={`w-full ${barBg} rounded-t-lg relative group transition-all duration-300 cursor-pointer`}
                  style={{ height: `${barHeight}%` }}
                >
                  {/* Tooltip */}
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-slate-900 text-white text-xs px-3 py-2 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap shadow-xl z-20 border border-slate-700">
                    <p className="font-bold border-b border-slate-700 pb-1 mb-1">{data.formattedDate} ({data.day})</p>
                    {hasRecords ? (
                      <div className="space-y-0.5 text-[11px]">
                        <p className="text-indigo-300 font-bold">Attendance: {data.attendance}%</p>
                        <p className="text-emerald-400 font-medium">Present: {data.present}</p>
                        <p className="text-rose-400 font-medium">Absent: {data.absent}</p>
                        {data.late > 0 && <p className="text-amber-400 font-medium">Late: {data.late}</p>}
                        <p className="text-slate-400">Total: {data.total}</p>
                      </div>
                    ) : (
                      <p className="text-slate-400 text-[11px] italic">No attendance recorded</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex justify-between text-xs text-slate-400 dark:text-slate-300 mt-3 font-semibold px-1">
            {attendanceData.map((data, i) => (
              <div key={i} className="flex flex-col items-center">
                <span className="text-slate-700 dark:text-slate-200 font-bold">{data.day}</span>
                <span className="text-[10px] text-slate-400">{data.formattedDate}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
