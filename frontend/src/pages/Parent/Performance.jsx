import React, { useState, useEffect, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getMyChildren } from '../../api/parents';
import { getStudentAttendance } from '../../api/attendance';
import { listAssessments, getStudentAssessmentGrade } from '../../api/assessments';
import { LuTrendingUp, LuAward, LuBookOpen } from 'react-icons/lu';
import toast from 'react-hot-toast';

export default function Performance() {
  const { userProfile } = useAuth();
  const outletContext = useOutletContext();
  const activeStudentIdFromContext = outletContext?.activeStudentId;
  const activeChildFromContext = outletContext?.activeChild;
  const enrolledChildrenFromContext = outletContext?.enrolledChildren;

  const studentId = activeStudentIdFromContext || userProfile?.linkedStudentId;

  const [student, setStudent] = useState(activeChildFromContext || null);
  const [resolvedClassId, setResolvedClassId] = useState(
    activeChildFromContext?.classId || activeChildFromContext?.class?.id || userProfile?.linkedClassId || null
  );
  const [attendanceStats, setAttendanceStats] = useState({ total: 0, present: 0, absent: 0, late: 0 });
  const [assessmentsData, setAssessmentsData] = useState([]);
  const [loading, setLoading] = useState(true);

  const mountedRef = useRef(true);
  const currentStudentRef = useRef(studentId);
  const currentClassRef = useRef(resolvedClassId);

  const fetchAttendance = async (targetStudentId) => {
    try {
      const res = await getStudentAttendance(targetStudentId, { filter: 'all', limit: 1 });
      if (!mountedRef.current || currentStudentRef.current !== targetStudentId) {
        return;
      }
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
    } catch (err) {
      if (mountedRef.current && currentStudentRef.current === targetStudentId) {
        console.error("Error fetching student attendance for performance:", err);
        setAttendanceStats({ total: 0, present: 0, absent: 0, late: 0 });
      }
    }
  };

  const fetchAssessmentsAndGrades = async (targetClassId, targetStudentId) => {
    try {
      const res = await listAssessments({ classId: targetClassId, limit: 100 });
      const rawAssessments = res?.data || [];

      if (!mountedRef.current || currentStudentRef.current !== targetStudentId || currentClassRef.current !== targetClassId) {
        return;
      }

      const gradeResults = await Promise.all(
        rawAssessments.map(async (a) => {
          try {
            const gRes = await getStudentAssessmentGrade(a.id, targetStudentId);
            const gradeData = gRes?.data;
            if (
              gradeData &&
              gradeData.marksObtained !== undefined &&
              gradeData.marksObtained !== null &&
              gradeData.marksObtained !== ''
            ) {
              const score = Number(gradeData.marksObtained);
              const totalMarks = Number(a.totalMarks) || 100;
              return {
                id: a.id,
                title: a.title,
                date: a.date || a.assessmentDate || a.createdAt,
                score,
                totalMarks,
                perc: totalMarks > 0 ? Math.round((score / totalMarks) * 100) : 0
              };
            }
            return null;
          } catch (err) {
            if (err?.status === 404 || err?.message?.includes('not found') || err?.message?.includes('404')) {
              return null;
            }
            throw err;
          }
        })
      );

      if (!mountedRef.current || currentStudentRef.current !== targetStudentId || currentClassRef.current !== targetClassId) {
        return;
      }

      const gradedList = gradeResults.filter(Boolean);
      gradedList.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

      setAssessmentsData(gradedList);
    } catch (error) {
      if (mountedRef.current && currentStudentRef.current === targetStudentId && currentClassRef.current === targetClassId) {
        console.error("Error fetching student performance assessments:", error);
        toast.error("Failed to load assessments");
        setAssessmentsData([]);
      }
    } finally {
      if (mountedRef.current && currentStudentRef.current === targetStudentId && currentClassRef.current === targetClassId) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    currentStudentRef.current = studentId;

    if (!studentId) {
      setStudent(null);
      setResolvedClassId(null);
      setAssessmentsData([]);
      setAttendanceStats({ total: 0, present: 0, absent: 0, late: 0 });
      setLoading(false);
      return;
    }

    setLoading(true);
    setAssessmentsData([]);

    // 1. Resolve Student Profile and Class ID from Context or REST
    const resolveAndLoadData = async () => {
      let resolvedStudent = null;

      // First try activeChild from context if it matches target studentId
      if (activeChildFromContext && (activeChildFromContext.id === studentId || activeChildFromContext.studentId === studentId)) {
        resolvedStudent = activeChildFromContext;
      } else if (Array.isArray(enrolledChildrenFromContext) && enrolledChildrenFromContext.length > 0) {
        // Next try finding in enrolledChildren
        resolvedStudent = enrolledChildrenFromContext.find(
          c => c.id === studentId || c.studentId === studentId
        ) || null;
      }

      // Fallback: fetch via getMyChildren() REST if child info not in context
      if (!resolvedStudent) {
        try {
          const res = await getMyChildren();
          if (!mountedRef.current || currentStudentRef.current !== studentId) return;
          const links = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
          const match = links.find(l => l.student?.id === studentId || l.studentId === studentId || l.id === studentId);
          resolvedStudent = match?.student || (match && match.firstName ? match : null);
        } catch (err) {
          console.error('[Performance] Error fetching student profile from REST:', err);
        }
      }

      if (!mountedRef.current || currentStudentRef.current !== studentId) return;

      if (!resolvedStudent) {
        setStudent(null);
        setResolvedClassId(null);
        setLoading(false);
        return;
      }

      setStudent(resolvedStudent);
      const classId = resolvedStudent.classId || resolvedStudent.class?.id || userProfile?.linkedClassId || null;
      setResolvedClassId(classId);
      currentClassRef.current = classId;

      // 2. Fetch Attendance
      fetchAttendance(studentId);

      // 3. Fetch Assessments and Grades if classId is available
      if (classId) {
        fetchAssessmentsAndGrades(classId, studentId);
      } else {
        setAssessmentsData([]);
        setLoading(false);
      }
    };

    resolveAndLoadData();

    return () => {
      mountedRef.current = false;
    };
  }, [studentId, activeChildFromContext, enrolledChildrenFromContext, userProfile?.linkedClassId]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-[80vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent"></div>
      </div>
    );
  }

  if (!student) return <div className="p-8">No student linked to this account.</div>;

  // Calculate Metrics
  const totalDays = attendanceStats.total;
  const present = attendanceStats.present + attendanceStats.late;
  const attendancePerc = totalDays > 0 ? Math.round((present / totalDays) * 100) : 0;

  let totalObtained = 0, totalMax = 0;
  assessmentsData.forEach(assessment => {
    totalObtained += Number(assessment.score);
    totalMax += Number(assessment.totalMarks);
  });

  const avgPerc = totalMax > 0 ? (totalObtained / totalMax) * 100 : 0;
  let avgGrade = '-';
  if (avgPerc > 0) {
    if (avgPerc >= 90) avgGrade = 'A+';
    else if (avgPerc >= 80) avgGrade = 'A';
    else if (avgPerc >= 70) avgGrade = 'B';
    else if (avgPerc >= 60) avgGrade = 'C';
    else if (avgPerc >= 50) avgGrade = 'D';
    else avgGrade = 'F';
  }

  const getStatusColor = (status) => {
    switch(status) {
      case 'excellent': return 'text-purple-700 bg-purple-100';
      case 'improving': return 'text-green-700 bg-green-100';
      case 'stable': return 'text-blue-700 bg-blue-100';
      case 'warning': return 'text-amber-700 bg-amber-100';
      case 'critical': return 'text-red-700 bg-red-100';
      default: return 'text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-700';
    }
  };

  const trendStatus = student?.performanceStatus || student?.customData?.performanceStatus || 'stable';

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto pb-24 min-w-0 w-full">
      <div className="mb-8 min-w-0 w-full">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3 truncate">
          <LuTrendingUp className="text-primary-600 shrink-0" /> Academic Performance
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">Review your child's academic progress and teacher feedback.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-gradient-to-br from-primary-600 to-primary-800 p-6 rounded-3xl text-white shadow-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2"></div>
          <p className="text-primary-100 font-bold mb-1">Teacher's Status</p>
          <div className="flex items-center gap-3">
            <span className={`px-4 py-1.5 rounded-xl text-sm font-black uppercase tracking-widest ${getStatusColor(trendStatus)} bg-white dark:bg-slate-900 shadow-sm`}>
              {trendStatus}
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-6">
          <div className="w-16 h-16 rounded-2xl bg-green-50 text-green-600 flex items-center justify-center shrink-0">
            <LuAward size={32} />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-500 dark:text-slate-400">Overall Grade</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-3xl font-black text-slate-900 dark:text-white">{avgGrade}</span>
              <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">{avgPerc > 0 ? `${avgPerc.toFixed(1)}%` : ''}</span>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-center">
          <p className="text-sm font-bold text-slate-500 dark:text-slate-400 mb-1">Attendance</p>
          <span className={`text-3xl font-black ${attendancePerc < 75 ? 'text-red-600' : 'text-slate-900 dark:text-white'}`}>{attendancePerc}%</span>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3 bg-slate-50 dark:bg-slate-800">
          <LuBookOpen className="text-primary-600" size={24} />
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Recent Assessments</h2>
        </div>
        <div className="p-6">
          {assessmentsData.length > 0 ? (
            <div className="space-y-4">
              {assessmentsData.map(assessment => (
                <div key={assessment.id} className="flex justify-between items-center p-4 rounded-2xl border border-slate-100 dark:border-slate-800 hover:border-primary-200 dark:hover:border-slate-700 hover:bg-primary-50/30 transition-all gap-4 w-full min-w-0">
                  <div className="min-w-0">
                    <h3 className="font-bold text-slate-900 dark:text-white truncate">{assessment.title}</h3>
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400 truncate">{new Date(assessment.date).toLocaleDateString('en-GB')}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-black text-lg text-slate-900 dark:text-white">{assessment.score} <span className="text-slate-400 dark:text-slate-300 text-sm font-bold">/ {assessment.totalMarks}</span></p>
                    <p className="text-xs font-bold text-primary-600">{assessment.perc}%</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-slate-500 dark:text-slate-400 font-medium">
              No assessments recorded yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
