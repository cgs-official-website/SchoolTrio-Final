import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { 
  listStudents,
  updateStudentPerformanceStatus 
} from '../../api/students';
import { 
  listAttendanceSessions, 
  getAttendanceSession 
} from '../../api/attendance';
import { 
  listAssessments, 
  getAssessmentGrades 
} from '../../api/assessments';
import { LuTrendingUp, LuSearch, LuDownload, LuAward, LuX, LuFileDown } from 'react-icons/lu';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';

export function getStatusColorClass(status) {
  switch (status) {
    case 'excellent': return 'text-purple-700 bg-purple-100';
    case 'improving': return 'text-green-700 bg-green-100';
    case 'stable': return 'text-blue-700 bg-blue-100';
    case 'warning': return 'text-amber-700 bg-amber-100';
    case 'critical': return 'text-red-700 bg-red-100';
    default: return 'text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-700';
  }
}

export function applyStudentStatusUpdate(studentsList, studentId, newStatus) {
  if (!Array.isArray(studentsList)) return [];
  return studentsList.map(s => (s.id === studentId ? {
    ...s,
    performanceStatus: newStatus,
    customData: { ...(s.customData || {}), performanceStatus: newStatus }
  } : s));
}

/**
 * Resolves an assessment's authoritative date timestamp in preferred order:
 * 1. Valid assessment.date
 * 2. Valid assessment.exam.startDate (if relation exists)
 * 3. Valid assessment.createdAt
 * Returns epoch timestamp (number) or null if no valid candidate exists.
 */
export function resolveAssessmentTimestamp(assessment) {
  if (!assessment || typeof assessment !== 'object') return null;

  const candidates = [
    assessment.date,
    assessment.exam?.startDate,
    assessment.createdAt
  ];

  for (const candidate of candidates) {
    if (candidate !== null && candidate !== undefined && candidate !== '') {
      const parsed = new Date(candidate).getTime();
      if (!isNaN(parsed) && parsed > 0) {
        return parsed;
      }
    }
  }

  return null;
}

/**
 * Computes academic grade metrics for a student from accessible assessments and grade records.
 * Deterministically chooses the latest assessment score (with stable ID tie-breaker).
 * Excludes absent/exempt records from ordinary numeric scores.
 */
export function calculateStudentGrades(studentId, assessmentsData, gradesMap) {
  let totalObtained = 0;
  let totalMax = 0;
  let lastExamScore = '-';
  let lastExamDate = -1;
  let lastExamId = null;

  if (!Array.isArray(assessmentsData) || !gradesMap || typeof gradesMap !== 'object') {
    return { avgGrade: '-', avgPerc: null, lastExamScore: '-' };
  }

  assessmentsData.forEach(assessment => {
    if (!assessment || !assessment.id) return;
    const assessmentGrades = gradesMap[assessment.id];
    if (!assessmentGrades || !Object.prototype.hasOwnProperty.call(assessmentGrades, studentId)) {
      return;
    }

    const entry = assessmentGrades[studentId];
    if (entry === undefined || entry === null || entry === '') return;

    const isObj = typeof entry === 'object' && entry !== null;
    const isAbsent = isObj && Boolean(entry.isAbsent);
    const isExempt = isObj && Boolean(entry.isExempt);

    // Absent or exempt records do not count as ordinary numeric marks
    if (isAbsent || isExempt) return;

    const numGrade = isObj ? Number(entry.marksObtained) : Number(entry);
    const numTotal = Number(assessment.totalMarks);

    // Validate that marks and maxMarks are finite numbers, and totalMarks > 0
    if (!Number.isFinite(numGrade) || !Number.isFinite(numTotal) || numTotal <= 0) {
      return;
    }

    totalObtained += numGrade;
    totalMax += numTotal;

    const rawDate = resolveAssessmentTimestamp(assessment);
    const assessDate = rawDate !== null ? rawDate : 0;

    // Latest assessment selection with deterministic tie-breaker:
    // 1. First eligible assessment seen (lastExamDate === -1)
    // 2. Later timestamp (assessDate > lastExamDate)
    // 3. Identical timestamp: deterministic tie-breaker based on stable unique assessment.id
    const isLater = lastExamDate === -1 || assessDate > lastExamDate;
    const isTieBreakerWinner =
      assessDate === lastExamDate &&
      String(assessment.id).localeCompare(String(lastExamId || '')) > 0;

    if (isLater || isTieBreakerWinner) {
      lastExamDate = assessDate;
      lastExamId = assessment.id;
      lastExamScore = Math.round((numGrade / numTotal) * 100);
    }
  });

  const avgPerc = totalMax > 0 ? (totalObtained / totalMax) * 100 : null;
  let avgGrade = '-';
  if (avgPerc !== null) {
    if (avgPerc >= 90) avgGrade = 'A+';
    else if (avgPerc >= 80) avgGrade = 'A';
    else if (avgPerc >= 70) avgGrade = 'B';
    else if (avgPerc >= 60) avgGrade = 'C';
    else if (avgPerc >= 50) avgGrade = 'D';
    else avgGrade = 'F';
  }

  return {
    avgGrade,
    avgPerc,
    lastExamScore: lastExamScore !== '-' ? `${lastExamScore}%` : '-'
  };
}

/**
 * Paginates through all pages for an assessment grade endpoint to retrieve the complete grade roster.
 */
export async function fetchAllGradesForAssessment(assessmentId, fetchFn = getAssessmentGrades) {
  let allGrades = [];
  let page = 1;
  const limit = 100;
  let hasMore = true;
  const maxPages = 50;

  while (hasMore && page <= maxPages) {
    const res = await fetchFn(assessmentId, { page, limit });
    const items = Array.isArray(res?.data) ? res.data : [];
    allGrades = allGrades.concat(items);

    const pagination = res?.pagination;
    if (pagination && typeof pagination.totalPages === 'number') {
      hasMore = page < pagination.totalPages;
    } else if (pagination && typeof pagination.hasNextPage === 'boolean') {
      hasMore = pagination.hasNextPage;
    } else {
      hasMore = items.length === limit;
    }
    page++;
  }

  return allGrades;
}

/**
 * BUG-PERF-006: Pure helper to compute class average percentage and letter grade.
 * - Includes only students with finite numeric avgPerc (excluding null, undefined, NaN, Infinity).
 * - Excludes students with no applicable numeric marks (e.g. absent/exempt-only).
 * - Computes the arithmetic mean of individual student percentages.
 * - Returns { classAvgPerc: null, classAvgGrade: '-' } when no applicable students exist.
 * - Returns { classAvgPerc: 0, classAvgGrade: 'F' } when valid average is exactly 0.
 * - Standard academic grade boundaries: >=90 A+, >=80 A, >=70 B, >=60 C, >=50 D, <50 F.
 * - Rounds arithmetic mean to 1 decimal place matching percentage display precision.
 */
export function calculateClassAverageMetrics(processedStudents) {
  if (!Array.isArray(processedStudents) || processedStudents.length === 0) {
    return { classAvgPerc: null, classAvgGrade: '-' };
  }

  const scoredStudents = processedStudents.filter(
    s => s && s.avgPerc !== null && s.avgPerc !== undefined && typeof s.avgPerc === 'number' && Number.isFinite(s.avgPerc)
  );

  if (scoredStudents.length === 0) {
    return { classAvgPerc: null, classAvgGrade: '-' };
  }

  const total = scoredStudents.reduce((sum, s) => sum + s.avgPerc, 0);
  const rawAvg = total / scoredStudents.length;
  const classAvgPerc = Number(rawAvg.toFixed(1));

  let classAvgGrade = 'F';
  if (classAvgPerc >= 90) classAvgGrade = 'A+';
  else if (classAvgPerc >= 80) classAvgGrade = 'A';
  else if (classAvgPerc >= 70) classAvgGrade = 'B';
  else if (classAvgPerc >= 60) classAvgGrade = 'C';
  else if (classAvgPerc >= 50) classAvgGrade = 'D';
  else classAvgGrade = 'F';

  return { classAvgPerc, classAvgGrade };
}

export default function PerformanceTracking() {
  const { userProfile } = useAuth();
  const schoolId = userProfile?.schoolId;
  const classId = userProfile?.assignedClassId;

  const [searchTerm, setSearchTerm] = useState('');
  const [students, setStudents] = useState([]);
  const [attendanceData, setAttendanceData] = useState([]);
  const [assessmentsData, setAssessmentsData] = useState([]);
  const [gradesMap, setGradesMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  const [partialError, setPartialError] = useState(false);

  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFileName, setExportFileName] = useState('');

  const mountedRef = useRef(true);
  const currentClassIdRef = useRef(classId);

  const availableFieldsList = [
    { key: 'admissionNo', label: 'Admission No' },
    { key: 'studentName', label: 'Student Name' },
    { key: 'attendance', label: 'Attendance %' },
    { key: 'lastExam', label: 'Last Exam Score' },
    { key: 'grade', label: 'Overall Grade' },
    { key: 'status', label: 'Trend Status' },
  ];

  const [selectedFields, setSelectedFields] = useState(() => {
    const init = {};
    [
      'admissionNo', 'studentName', 'attendance',
      'lastExam', 'grade', 'status'
    ].forEach(k => { init[k] = true; });
    return init;
  });

  const handleFieldToggle = (fieldKey) => {
    setSelectedFields(prev => ({ ...prev, [fieldKey]: !prev[fieldKey] }));
  };

  const handleSelectAll = (selectVal) => {
    const updated = {};
    availableFieldsList.forEach(field => {
      updated[field.key] = selectVal;
    });
    setSelectedFields(updated);
  };

  const handleExport = () => {
    const activeFields = Object.keys(selectedFields).filter(k => selectedFields[k]);
    if (activeFields.length === 0) {
      toast.error('Please select at least one column to export.');
      return;
    }
    if (processedStudents.length === 0) {
      toast.error('No student data available to export.');
      return;
    }
    try {
      const exportData = processedStudents.map((student, index) => {
        const row = { 'S.No': index + 1 };
        availableFieldsList.forEach(field => {
          if (!selectedFields[field.key]) return;
          if (field.key === 'admissionNo') row[field.label] = student.admissionNumber || '';
          if (field.key === 'studentName') row[field.label] = `${student.firstName} ${student.lastName}`;
          if (field.key === 'attendance') row[field.label] = `${student.attendancePerc}%`;
          if (field.key === 'lastExam') row[field.label] = student.lastExamScore;
          if (field.key === 'grade') row[field.label] = student.avgGrade;
          if (field.key === 'status') row[field.label] = student.status.charAt(0).toUpperCase() + student.status.slice(1);
        });
        return row;
      });

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Performance');
      XLSX.writeFile(wb, 'Student_Performance_Report.xlsx');
      setShowExportModal(false);
      toast.success('Performance report exported successfully!');
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export report.');
    }
  };

  const fetchPerformanceData = async (targetClassId) => {
    setPartialError(false);
    try {
      const res = await listAssessments({ classId: targetClassId, limit: 100 });
      const assessments = res?.data || [];
      
      if (!mountedRef.current || currentClassIdRef.current !== targetClassId) return;

      let hasPartialFailure = false;
      const gradesResults = await Promise.all(
        assessments.map(async (a) => {
          try {
            const grades = await fetchAllGradesForAssessment(a.id);
            return { assessmentId: a.id, grades, failed: false };
          } catch (err) {
            console.warn(`[PerformanceTracking] Failed to load grades for assessment ${a.id}:`, err?.message || err);
            hasPartialFailure = true;
            return { assessmentId: a.id, grades: null, failed: true };
          }
        })
      );

      if (!mountedRef.current || currentClassIdRef.current !== targetClassId) return;

      if (hasPartialFailure) {
        setPartialError(true);
        toast.error("Some assessment records could not be retrieved. Displayed data may be partial.");
      }

      const map = {};
      const successfulAssessments = [];

      gradesResults.forEach(({ assessmentId, grades, failed }) => {
        if (failed || !Array.isArray(grades)) return;

        const matchingAssessment = assessments.find(a => a.id === assessmentId);
        if (matchingAssessment) {
          successfulAssessments.push(matchingAssessment);
        }

        map[assessmentId] = {};
        grades.forEach(g => {
          if (g && g.studentId) {
            if (g.isAbsent || g.isExempt) {
              map[assessmentId][g.studentId] = {
                isAbsent: Boolean(g.isAbsent),
                isExempt: Boolean(g.isExempt),
                marksObtained: null
              };
            } else if (g.marksObtained !== undefined && g.marksObtained !== null && g.marksObtained !== '') {
              const num = Number(g.marksObtained);
              if (Number.isFinite(num)) {
                map[assessmentId][g.studentId] = {
                  isAbsent: false,
                  isExempt: false,
                  marksObtained: num
                };
              }
            }
          }
        });
      });

      setAssessmentsData(successfulAssessments);
      setGradesMap(map);
    } catch (error) {
      if (mountedRef.current && currentClassIdRef.current === targetClassId) {
        console.error("Error fetching performance assessment data:", error);
        toast.error("Failed to load performance assessment data.");
      }
    }
  };

  const fetchAttendanceData = async (targetClassId) => {
    try {
      const res = await listAttendanceSessions({ classId: targetClassId, limit: 100 });
      if (!mountedRef.current || currentClassIdRef.current !== targetClassId) return;
      const sessions = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
      const detailedSessions = await Promise.all(
        sessions.map(async (s) => {
          if (s.records && s.records.length > 0) return s;
          try {
            const det = await getAttendanceSession(s.id);
            return det?.data || det?.session || det || s;
          } catch {
            return s;
          }
        })
      );
      if (!mountedRef.current || currentClassIdRef.current !== targetClassId) return;
      const formatted = detailedSessions.map(s => {
        const recs = {};
        (s.records || []).forEach(r => {
          if (r.studentId) recs[r.studentId] = r.status;
        });
        return { id: s.id, date: s.date, records: recs };
      });
      setAttendanceData(formatted);
    } catch (err) {
      console.error('Error fetching attendance in PerformanceTracking:', err);
      if (mountedRef.current && currentClassIdRef.current === targetClassId) {
        setAttendanceData([]);
      }
    }
  };

  const fetchStudentsData = async (targetClassId) => {
    try {
      const res = await listStudents({ classId: targetClassId, limit: 100 });
      if (!mountedRef.current || currentClassIdRef.current !== targetClassId) return;
      const studentList = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
      setStudents(studentList);
    } catch (err) {
      console.error('Error fetching students in PerformanceTracking:', err);
      if (mountedRef.current && currentClassIdRef.current === targetClassId) {
        toast.error("Failed to load student roster.");
        setStudents([]);
      }
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    currentClassIdRef.current = classId;

    if (!schoolId || !classId) {
      setLoading(false);
      return;
    }
    
    setLoading(true);

    const loadAllClassData = async (targetClassId) => {
      try {
        await Promise.allSettled([
          fetchPerformanceData(targetClassId),
          fetchStudentsData(targetClassId),
          fetchAttendanceData(targetClassId)
        ]);
      } finally {
        if (mountedRef.current && currentClassIdRef.current === targetClassId) {
          setLoading(false);
        }
      }
    };

    loadAllClassData(classId);

    return () => {
      mountedRef.current = false;
    };
  }, [schoolId, classId]);

  // Calculate dynamic metrics for each student
  const processedStudents = students.map(student => {
    // 1. Calculate Attendance
    let present = 0, total = 0;
    attendanceData.forEach(day => {
      if (day.records && day.records[student.id]) {
        total++;
        if (day.records[student.id] === 'Present' || day.records[student.id] === 'Late') {
          present++;
        }
      }
    });
    const attendancePerc = total > 0 ? Math.round((present / total) * 100) : 0;

    // 2. Calculate Grades
    const { avgGrade, avgPerc, lastExamScore } = calculateStudentGrades(student.id, assessmentsData, gradesMap);

    return {
      ...student,
      attendancePerc,
      avgGrade,
      avgPerc,
      lastExamScore,
      status: student.customData?.performanceStatus || student.performanceStatus || 'stable'
    };
  });

  const filteredStudents = processedStudents.filter(s => 
    `${s.firstName} ${s.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.admissionNumber?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Summary Metrics
  const { classAvgPerc, classAvgGrade } = calculateClassAverageMetrics(processedStudents);

  const atRiskCount = processedStudents.filter(s => s.status === 'warning' || s.status === 'critical' || (s.avgPerc !== null && s.avgPerc < 50)).length;
  
  const classAvgAttendance = processedStudents.length > 0
    ? Math.round(processedStudents.reduce((sum, s) => sum + s.attendancePerc, 0) / processedStudents.length)
    : 0;


  const handleStatusChange = async (studentId, newStatus) => {
    if (updatingId === studentId) return;
    setUpdatingId(studentId);
    try {
      await updateStudentPerformanceStatus(studentId, newStatus);
      setStudents(prev => applyStudentStatusUpdate(prev, studentId, newStatus));
      toast.success("Status updated");
    } catch (error) {
      toast.error(error?.message || "Failed to update status");
    } finally {
      setUpdatingId(null);
    }
  };

  const getStatusColor = (status) => getStatusColorClass(status);

  const getGradeColor = (grade) => {
    if (grade.includes('A')) return 'text-green-600';
    if (grade.includes('B')) return 'text-blue-600';
    if (grade.includes('C')) return 'text-amber-600';
    if (grade === '-') return 'text-slate-400 dark:text-slate-300';
    return 'text-red-600';
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-[80vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto h-full flex flex-col">
      <div className="mb-8 shrink-0 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
            <LuTrendingUp className="text-primary-600" /> Student Performance
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Track academic progress and attendance trends dynamically.</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => {
              if (students.length === 0) {
                toast.error("No student data available to export.");
                return;
              }
              setExportFileName('Student_Performance_Report');
              setShowExportModal(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-bold hover:bg-primary-700 shadow-md shadow-primary-600/10 transition-all active:scale-[0.98]"
          >
            <LuDownload size={18} /> Export
          </button>
        </div>
      </div>

      {partialError && (
        <div className="mb-6 p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-sm flex items-center gap-3 shrink-0">
          <span className="font-bold">Notice:</span>
          <span>Some assessment records could not be retrieved. Displayed performance metrics reflect currently accessible assessments.</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8 shrink-0">
        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm col-span-1 md:col-span-2 flex items-center gap-6">
          <div className="w-16 h-16 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
            <LuAward size={32} />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-500 dark:text-slate-400">Class Average</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-3xl font-black text-slate-900 dark:text-white">{classAvgGrade}</span>
              <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                {classAvgPerc !== null && Number.isFinite(classAvgPerc) ? `${classAvgPerc.toFixed(1)}%` : 'No data'}
              </span>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-center">
          <p className="text-sm font-bold text-slate-500 dark:text-slate-400 mb-1">Students at Risk</p>
          <span className="text-3xl font-black text-red-600">{atRiskCount}</span>
        </div>
        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-center">
          <p className="text-sm font-bold text-slate-500 dark:text-slate-400 mb-1">Avg Attendance</p>
          <span className="text-3xl font-black text-slate-900 dark:text-white">{classAvgAttendance}%</span>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col flex-1 min-h-0 overflow-hidden">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex gap-4 shrink-0">
          <div className="relative flex-1 max-w-md">
            <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-300" size={20} />
            <input 
              type="text"
              placeholder="Search students..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900"
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead className="sticky top-0 bg-white dark:bg-slate-900 shadow-sm z-10">
              <tr className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-sm border-b border-slate-200 dark:border-slate-700">
                <th className="p-4 font-bold pl-6">Student Name</th>
                <th className="p-4 font-bold text-center">Attendance %</th>
                <th className="p-4 font-bold text-center">Last Exam Score</th>
                <th className="p-4 font-bold text-center">Overall Grade</th>
                <th className="p-4 font-bold pr-6 text-right">Trend Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredStudents.map((student) => (
                <tr key={student.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="p-4 pl-6">
                    <p className="font-bold text-slate-900 dark:text-white group-hover:text-primary-600 transition-colors">{student.firstName} {student.lastName}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-300 font-semibold">{student.admissionNumber}</p>
                  </td>
                  <td className="p-4 text-center">
                    <span className={`font-bold ${student.attendancePerc < 75 ? 'text-red-600' : 'text-slate-700 dark:text-slate-200'}`}>
                      {student.attendancePerc}%
                    </span>
                  </td>
                  <td className="p-4 text-center">
                    <span className="font-bold text-slate-700 dark:text-slate-200">{student.lastExamScore}</span>
                  </td>
                  <td className="p-4 text-center">
                    <span className={`text-lg font-black ${getGradeColor(student.avgGrade)}`}>
                      {student.avgGrade}
                    </span>
                  </td>
                  <td className="p-4 pr-6 text-right flex justify-end">
                    <select
                      disabled={updatingId === student.id}
                      value={student.status}
                      onChange={(e) => handleStatusChange(student.id, e.target.value)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider border-0 cursor-pointer appearance-none text-center ${getStatusColor(student.status)}`}
                      style={{ textAlignLast: 'center' }}
                    >
                      <option value="excellent">Excellent</option>
                      <option value="improving">Improving</option>
                      <option value="stable">Stable</option>
                      <option value="warning">Warning</option>
                      <option value="critical">Critical</option>
                    </select>
                  </td>
                </tr>
              ))}
              {filteredStudents.length === 0 && (
                <tr>
                  <td colSpan="5" className="text-center py-12 text-slate-500 dark:text-slate-400 font-medium">No students found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Export Field Selector Modal */}
      {showExportModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-100 dark:border-slate-800 overflow-hidden transform transition-all flex flex-col max-h-[85vh]">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">Export Performance Report</h3>
                <p className="text-slate-500 dark:text-slate-400 text-xs mt-0.5 font-medium">Select columns to include in the exported Excel spreadsheet</p>
              </div>
              <button 
                onClick={() => setShowExportModal(false)}
                className="p-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-400 dark:text-slate-300 hover:text-slate-600 dark:hover:text-slate-300 rounded-xl transition-colors"
              >
                <LuX size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6">
              {/* File Name Input */}
              <div className="space-y-1.5 pb-3 border-b border-slate-100 dark:border-slate-800">
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">File Name</label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="e.g. Student_Performance_Report"
                    value={exportFileName}
                    onChange={(e) => setExportFileName(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none text-sm font-semibold"
                  />
                  <span className="absolute right-4 top-2.5 text-xs text-slate-400 dark:text-slate-300 font-bold font-mono select-none">.xlsx</span>
                </div>
              </div>

              {/* Select All / Deselect All Controls */}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => handleSelectAll(true)}
                  className="px-3 py-1.5 text-xs font-bold bg-primary-50 text-primary-700 hover:bg-primary-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectAll(false)}
                  className="px-3 py-1.5 text-xs font-bold bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors"
                >
                  Deselect All
                </button>
              </div>

              {/* Checkbox Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {availableFieldsList.map((field) => (
                  <label 
                    key={field.key}
                    className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50/50 cursor-pointer select-none transition-colors"
                  >
                    <input 
                      type="checkbox"
                      checked={selectedFields[field.key]}
                      onChange={() => handleFieldToggle(field.key)}
                      className="rounded text-primary-600 focus:ring-primary-500 h-4 w-4"
                    />
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{field.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 flex items-center justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                className="px-4 py-2 border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800 rounded-xl text-sm font-bold text-slate-700 dark:text-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExport}
                className="px-5 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-bold shadow-sm transition-colors flex items-center gap-2"
              >
                <LuFileDown size={18} />
                Generate Sheet
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

