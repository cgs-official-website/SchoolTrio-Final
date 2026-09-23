import React, { useState, useEffect, useRef } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getMyChildren } from '../../api/parents';
import { getStudentInvoices } from '../../api/invoices';
import { getStudentAttendance } from '../../api/attendance';
import { listAssessments, getStudentAssessmentGrade } from '../../api/assessments';
import { LuCircleUser as _UserCircle, LuCalendar as Calendar, LuGraduationCap as GraduationCap, LuCircleCheck as CheckCircle2, LuTrendingUp as TrendingUp, LuTriangleAlert as AlertTriangle, LuCreditCard as CreditCard, LuArrowRight as ArrowRight } from 'react-icons/lu';
import toast from 'react-hot-toast';

export default function StudentOverview() {
  const { userProfile } = useAuth();
  const outletContext = useOutletContext();
  const activeStudentIdFromContext = outletContext?.activeStudentId;
  const activeChildFromContext = outletContext?.activeChild;

  const studentId = activeStudentIdFromContext || userProfile?.linkedStudentId;

  const [student, setStudent] = useState(null);
  const [resolvedClassId, setResolvedClassId] = useState(null);
  const [classDetails, setClassDetails] = useState(null);
  const [attendanceStats, setAttendanceStats] = useState({ total: 0, present: 0, absent: 0, late: 0 });
  const [assessments, setAssessments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [feeSummary, setFeeSummary] = useState({ unpaidCount: 0, overdueCount: 0, totalUnpaidAmount: 0, earliestDueDate: null });

  const mountedRef = useRef(true);
  const currentStudentRef = useRef(studentId);
  const currentClassRef = useRef(resolvedClassId);

  // Authoritative REST student profile and class loader
  const loadStudentProfile = async (targetStudentId) => {
    try {
      const res = await getMyChildren();
      if (!mountedRef.current || currentStudentRef.current !== targetStudentId) return;

      const links = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
      const match = links.find(l => (l.student?.id === targetStudentId || l.studentId === targetStudentId || l.id === targetStudentId));
      const st = match?.student || (match && match.firstName ? match : null);

      if (st) {
        setStudent({
          id: st.id,
          firstName: st.firstName || '',
          lastName: st.lastName || '',
          admissionNumber: st.admissionNumber || '',
          rollNumber: st.rollNumber || '',
          dob: st.dob || '',
          gender: st.gender || '',
          bloodGroup: st.bloodGroup || '',
          photoUrl: st.photoUrl || null,
          status: st.status || 'Active',
          classId: st.classId || st.class?.id || null,
          sectionId: st.sectionId || st.section?.id || null
        });
        const clsId = st.classId || st.class?.id || null;
        setResolvedClassId(clsId);
        setClassDetails({
          id: clsId,
          name: st.class?.name || '',
          section: st.section?.name || ''
        });
      } else {
        setStudent(null);
        setClassDetails(null);
        setResolvedClassId(null);
      }
    } catch (err) {
      if (mountedRef.current && currentStudentRef.current === targetStudentId) {
        console.error('[StudentOverview] Error loading student profile from REST:', err);
        setStudent(null);
        setClassDetails(null);
        setResolvedClassId(null);
      }
    }
  };

  // Authoritative REST fee invoices loader for unpaid dues and overdue alerts
  const fetchFeeSummary = async (targetStudentId) => {
    try {
      const res = await getStudentInvoices(targetStudentId, { limit: 100 });
      if (!mountedRef.current || currentStudentRef.current !== targetStudentId) return;

      const summary = res?.summary || {};
      const rawInvoices = res?.data || [];

      const unpaidCount = Number(summary.unpaidCount) || 0;
      const overdueCount = Number(summary.overdueCount) || 0;
      const totalUnpaidAmount = Number(summary.outstandingAmount) || Number(summary.totalOutstanding) || 0;

      let earliestDue = null;
      rawInvoices.forEach(inv => {
        if (inv.status !== 'Paid' && inv.status !== 'Cancelled') {
          const due = inv.dueDate ? new Date(inv.dueDate + 'T23:59:59') : null;
          if (due && (!earliestDue || due < earliestDue)) {
            earliestDue = due;
          }
        }
      });

      setFeeSummary({
        unpaidCount,
        overdueCount,
        totalUnpaidAmount,
        earliestDueDate: earliestDue ? earliestDue.toLocaleDateString('en-GB') : null
      });
    } catch (err) {
      if (mountedRef.current && currentStudentRef.current === targetStudentId) {
        console.error('[StudentOverview] Error fetching fee invoices for alert:', err);
        setFeeSummary({ unpaidCount: 0, overdueCount: 0, totalUnpaidAmount: 0, earliestDueDate: null });
      }
    }
  };

  // Fetch REST attendance summary for active student
  const fetchAttendanceSummary = async (targetStudentId) => {
    try {
      const res = await getStudentAttendance(targetStudentId, { filter: 'all', limit: 1 });
      if (!mountedRef.current || currentStudentRef.current !== targetStudentId) return;

      const stat = res?.cumulativeStat;
      if (stat) {
        setAttendanceStats({
          total: Number(stat.totalDays) || 0,
          present: Number(stat.presentDays) || 0,
          absent: Number(stat.absentDays) || 0,
          late: Number(stat.lateDays) || 0
        });
      } else {
        setAttendanceStats({ total: 0, present: 0, absent: 0, late: 0 });
      }
    } catch (error) {
      if (mountedRef.current && currentStudentRef.current === targetStudentId) {
        console.error('[StudentOverview] Error fetching student attendance summary:', error);
        setAttendanceStats({ total: 0, present: 0, absent: 0, late: 0 });
      }
    }
  };

  // Fetch REST assessments and student-specific grades
  const fetchAssessmentsAndGrades = async (targetClassId, targetStudentId) => {
    try {
      const res = await listAssessments({ classId: targetClassId, limit: 100 });
      const rawAssessments = res?.data || [];

      if (!mountedRef.current || currentStudentRef.current !== targetStudentId || currentClassRef.current !== targetClassId) {
        return;
      }

      // Concurrently fetch each assessment's individual grade for this student using the student-scoped endpoint
      const gradeResults = await Promise.all(
        rawAssessments.map(async (a) => {
          try {
            const gRes = await getStudentAssessmentGrade(a.id, targetStudentId);
            const gradeData = gRes?.data;
            if (gradeData && gradeData.marksObtained !== undefined && gradeData.marksObtained !== null && gradeData.marksObtained !== '') {
              return {
                ...a,
                marks: Number(gradeData.marksObtained)
              };
            }
            return null;
          } catch (err) {
            // If grade not found (404 / ungraded), student has no mark for this assessment
            if (err?.status === 404 || err?.message?.includes('not found') || err?.message?.includes('404')) {
              return null;
            }
            // For other errors (network/server failure), rethrow to avoid masking failures as ungraded
            throw err;
          }
        })
      );

      if (!mountedRef.current || currentStudentRef.current !== targetStudentId || currentClassRef.current !== targetClassId) {
        return;
      }

      const gradedList = gradeResults.filter(Boolean);
      gradedList.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

      setAssessments(gradedList);
    } catch (error) {
      if (mountedRef.current && currentStudentRef.current === targetStudentId && currentClassRef.current === targetClassId) {
        console.error('[StudentOverview] Error fetching student assessment data:', error);
        toast.error('Failed to load assessment data.');
        setAssessments([]);
      }
    } finally {
      if (mountedRef.current && currentStudentRef.current === targetStudentId && currentClassRef.current === targetClassId) {
        setLoading(false);
      }
    }
  };

  // Main lifecycle loader for active student
  useEffect(() => {
    mountedRef.current = true;
    currentStudentRef.current = studentId;

    if (!studentId) {
      setStudent(null);
      setClassDetails(null);
      setResolvedClassId(null);
      setFeeSummary({ unpaidCount: 0, overdueCount: 0, totalUnpaidAmount: 0, earliestDueDate: null });
      setAttendanceStats({ total: 0, present: 0, absent: 0, late: 0 });
      setAssessments([]);
      setLoading(false);
      return;
    }

    if (activeChildFromContext && activeChildFromContext.id === studentId) {
      const st = activeChildFromContext;
      setStudent({
        id: st.id,
        firstName: st.firstName || '',
        lastName: st.lastName || '',
        admissionNumber: st.admissionNumber || '',
        rollNumber: st.rollNumber || '',
        dob: st.dob || '',
        gender: st.gender || '',
        bloodGroup: st.bloodGroup || '',
        photoUrl: st.photoUrl || null,
        status: st.status || 'Active',
        classId: st.classId || st.class?.id || null,
        sectionId: st.sectionId || st.section?.id || null
      });
      const clsId = st.classId || st.class?.id || null;
      setResolvedClassId(clsId);
      setClassDetails({
        id: clsId,
        name: st.class?.name || '',
        section: st.section?.name || ''
      });
    } else {
      loadStudentProfile(studentId);
    }

    fetchFeeSummary(studentId);
    fetchAttendanceSummary(studentId);

    return () => {
      mountedRef.current = false;
    };
  }, [studentId, activeChildFromContext]);

  // Load assessments when resolvedClassId is available
  useEffect(() => {
    currentClassRef.current = resolvedClassId;
    if (resolvedClassId && studentId) {
      setLoading(true);
      fetchAssessmentsAndGrades(resolvedClassId, studentId);
    } else if (!resolvedClassId && studentId) {
      setAssessments([]);
      setLoading(false);
    }
  }, [resolvedClassId, studentId]);

  // Listen for fee payment events to refresh fee alert
  useEffect(() => {
    const handleInvoicePaid = (e) => {
      const paidStudentId = e.detail?.studentId;
      if (!paidStudentId || paidStudentId === currentStudentRef.current) {
        fetchFeeSummary(currentStudentRef.current);
      }
    };

    window.addEventListener('sms:invoice-paid', handleInvoicePaid);
    return () => {
      window.removeEventListener('sms:invoice-paid', handleInvoicePaid);
    };
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-[80vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent"></div>
      </div>
    );
  }

  if (!student) return <div className="p-8">Error loading student data.</div>;

  // Calculate overall attendance %
  const attendancePercentage = attendanceStats.total === 0 
    ? 0 
    : Math.round(((attendanceStats.present + attendanceStats.late) / attendanceStats.total) * 100);

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto pb-24 min-w-0 w-full">
      {/* Student Header */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-3xl p-6 sm:p-8 text-white shadow-lg relative overflow-hidden mb-8 w-full">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>
        
        <div className="relative z-10 flex flex-col md:flex-row items-center md:items-start gap-6">
          <div className="w-24 h-24 bg-primary-100 rounded-full flex items-center justify-center text-primary-700 text-3xl font-black border-4 border-white/10 shrink-0 shadow-xl">
            {(student.firstName?.charAt(0) || '')}{(student.lastName?.charAt(0) || '')}
          </div>
          <div className="text-center md:text-left min-w-0 w-full">
            <h1 className="text-4xl font-black mb-2 tracking-tight truncate">
              {student.firstName || ''} {student.lastName || ''}
            </h1>
            <p className="text-slate-300 text-lg flex flex-wrap items-center justify-center md:justify-start gap-3">
              <span className="flex items-center gap-1"><GraduationCap size={18} className="text-primary-400"/> {classDetails ? [classDetails.name, classDetails.section].filter(Boolean).join(' - ') || 'Class' : 'Class'}</span>
              <span className="text-slate-500 dark:text-slate-400">•</span>
              <span className="font-mono text-sm bg-slate-800/50 px-2 py-1 rounded text-slate-300">ID: {student.admissionNumber}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Outstanding / Overdue Fee Alert Banner */}
      {feeSummary.unpaidCount > 0 && (
        <div className={`mb-8 p-6 rounded-3xl border shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-5 animate-fade-in ${
          feeSummary.overdueCount > 0 
            ? 'bg-gradient-to-r from-red-50 to-orange-50 border-red-200 text-red-900' 
            : 'bg-gradient-to-r from-amber-50 to-yellow-50 border-amber-200 text-amber-900'
        } w-full min-w-0`}>
          <div className="flex items-start gap-4 min-w-0 w-full">
            <div className={`p-3.5 rounded-2xl shrink-0 mt-0.5 shadow-md ${
              feeSummary.overdueCount > 0 
                ? 'bg-red-500 text-white shadow-red-500/30 animate-pulse' 
                : 'bg-amber-500 text-white shadow-amber-500/30'
            }`}>
              <AlertTriangle size={26} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-xs font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
                  feeSummary.overdueCount > 0 ? 'bg-red-200 text-red-950 font-black' : 'bg-amber-200 text-amber-950 font-bold'
                }`}>
                  {feeSummary.overdueCount > 0 ? '⚠️ Action Required: Overdue Fees' : '💳 Pending Fee Dues'}
                </span>
                {feeSummary.overdueCount > 0 && (
                  <span className="text-xs font-bold text-red-700 bg-white/90 px-2.5 py-0.5 rounded-full border border-red-200">
                    {feeSummary.overdueCount} Overdue
                  </span>
                )}
              </div>
              <h3 className="text-xl font-black mt-1 text-slate-900 dark:text-white">
                {feeSummary.overdueCount > 0
                  ? `₹${feeSummary.totalUnpaidAmount.toLocaleString()} Outstanding Fee Balance`
                  : `₹${feeSummary.totalUnpaidAmount.toLocaleString()} Pending Fee Dues`
                }
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                {feeSummary.overdueCount > 0
                  ? `There are ${feeSummary.unpaidCount} unpaid fee invoice(s) for your child (${feeSummary.overdueCount} past the due date). Please settle immediately.`
                  : `You have ${feeSummary.unpaidCount} unpaid invoice(s) due by ${feeSummary.earliestDueDate || 'the upcoming due date'}. Please complete payment.`
                }
              </p>
            </div>
          </div>
          <Link
            to="/parent/fees"
            className={`px-5 py-3 rounded-2xl font-bold text-sm shadow-md flex items-center gap-2 shrink-0 transition-all hover:scale-105 active:scale-95 ${
              feeSummary.overdueCount > 0
                ? 'bg-red-600 hover:bg-red-700 text-white shadow-red-600/30'
                : 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-600/30'
            }`}
          >
            <CreditCard size={18} />
            <span>Pay Fees Now</span>
            <ArrowRight size={16} />
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Attendance Summary */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Calendar size={20} className="text-primary-500" />
                Attendance Summary
              </h2>
            </div>

            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-32 h-32 rounded-full relative">
                {/* Visual ring approximation */}
                <svg className="absolute inset-0 w-full h-full -rotate-90">
                  {attendanceStats.total === 0 ? (
                    <circle cx="64" cy="64" r="52" fill="transparent" stroke="currentColor" strokeWidth="8" className="text-slate-200" />
                  ) : (
                    <>
                      <circle cx="64" cy="64" r="52" fill="transparent" stroke="currentColor" strokeWidth="8" className="text-slate-100" />
                      <circle 
                        cx="64" 
                        cy="64" 
                        r="52" 
                        fill="transparent" 
                        stroke="currentColor" 
                        strokeWidth="8" 
                        className={`transition-all duration-1000 ${
                          attendancePercentage >= 90 
                            ? 'text-green-500' 
                            : attendancePercentage >= 75 
                              ? 'text-amber-500' 
                              : 'text-red-500'
                        }`} 
                        strokeDasharray={`${(attendancePercentage / 100) * 326.7} 326.7`} 
                      />
                    </>
                  )}
                </svg>
                <div className="text-3xl font-black text-slate-900 dark:text-white">
                  {attendanceStats.total === 0 ? '--' : `${attendancePercentage}%`}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <div className="bg-green-50 rounded-xl p-2 border border-green-100">
                <div className="font-bold text-green-700 text-lg">{attendanceStats.present}</div>
                <div className="text-green-600/70 text-xs uppercase tracking-wider font-semibold mt-0.5">Present</div>
              </div>
              <div className="bg-amber-50 rounded-xl p-2 border border-amber-100">
                <div className="font-bold text-amber-700 text-lg">{attendanceStats.late}</div>
                <div className="text-amber-600/70 text-xs uppercase tracking-wider font-semibold mt-0.5">Late</div>
              </div>
              <div className="bg-red-50 rounded-xl p-2 border border-red-100">
                <div className="font-bold text-red-700 text-lg">{attendanceStats.absent}</div>
                <div className="text-red-600/70 text-xs uppercase tracking-wider font-semibold mt-0.5">Absent</div>
              </div>
            </div>
            
            {attendanceStats.total === 0 ? (
              <div className="mt-6 bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 p-3 rounded-xl border border-slate-200/60 text-center text-xs font-semibold uppercase tracking-wider">
                No Attendance Recorded Yet
              </div>
            ) : attendancePercentage < 80 ? (
              <div className="mt-6 bg-red-50 text-red-700 p-3 rounded-xl border border-red-200 text-sm flex gap-2">
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                <p>Attendance has dropped below 80%. Please monitor.</p>
              </div>
            ) : null}
          </div>
        </div>

        {/* Recent Grades */}
        <div className="lg:col-span-2">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden h-full flex flex-col">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <TrendingUp size={20} className="text-primary-500" />
                Recent Assessments
              </h2>
            </div>
            
            <div className="flex-1 overflow-y-auto p-0">
              {assessments.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center p-12 text-center">
                  <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 text-slate-300 rounded-full flex items-center justify-center mb-4">
                    <CheckCircle2 size={32} />
                  </div>
                  <h3 className="text-slate-900 dark:text-white font-bold mb-1">No Grades Yet</h3>
                  <p className="text-slate-500 dark:text-slate-400 text-sm">Assessments and grades will appear here once published by the teacher.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {assessments.map(assessment => {
                    const marks = assessment.marks;
                    const percentage = Math.round((marks / assessment.totalMarks) * 100);
                    
                    return (
                      <div key={assessment.id} className="p-4 sm:p-6 hover:bg-slate-50/50 transition-colors flex items-center justify-between gap-4">
                        <div>
                          <h4 className="font-bold text-slate-900 dark:text-white">{assessment.title}</h4>
                          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{assessment.date}</p>
                        </div>
                        <div className="flex items-center gap-4 text-right">
                          <div className="hidden sm:block">
                            <div className="text-sm font-medium text-slate-900 dark:text-white">{marks} <span className="text-slate-400 dark:text-slate-300">/ {assessment.totalMarks}</span></div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">Marks</div>
                          </div>
                          <div className={`px-4 py-2 rounded-xl border font-black text-lg w-20 text-center ${
                            percentage >= 80 ? 'bg-green-50 text-green-700 border-green-200' : 
                            percentage >= 50 ? 'bg-amber-50 text-amber-700 border-amber-200' : 
                            'bg-red-50 text-red-700 border-red-200'
                          }`}>
                            {percentage}%
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

      </div>
    </div>
  );
}
