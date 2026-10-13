import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useOutletContext } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getStudentReportCards } from '../../api/reportCards';
import { getReportCardTemplate } from '../../api/reportCardTemplates';
import { adaptReportCards, normalizeReportCardTemplate } from '../../utils/reportCardAdapter';
import { useLiveDataRefresh } from '../../hooks/useLiveDataRefresh';
import { LuFileSpreadsheet as FileIcon, LuPrinter as Printer, LuArrowLeft as ArrowLeft, LuCalendar as Calendar, LuAward as Award } from 'react-icons/lu';
import toast from 'react-hot-toast';

export default function ParentGrades() {
  const { userProfile } = useAuth();
  const outletContext = useOutletContext();
  const activeStudentIdFromContext = outletContext?.activeStudentId || outletContext?.activeChild?.id;
  const studentId = activeStudentIdFromContext || userProfile?.linkedStudentId;
  const location = useLocation();

  const [loading, setLoading] = useState(true);
  const [reportCards, setReportCards] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [activeTemplate, setActiveTemplate] = useState(null);
  const [selectedExamId, setSelectedExamId] = useState('');
  const [availableExams, setAvailableExams] = useState([]);

  const mountedRef = useRef(true);
  const currentStudentRef = useRef(studentId);

  useEffect(() => {
    setSelectedReport(null);
    setSelectedExamId('');
  }, [location.pathname]);

  // Load the active published template configured by the school admin as fallback/context
  const fetchActiveTemplate = useCallback(async () => {
    try {
      const res = await getReportCardTemplate('report_card');
      const configData = res?.data?.config || res?.data;
      if (configData && mountedRef.current) {
        setActiveTemplate(configData);
      }
    } catch (error) {
      // Non-blocking template fallback
      console.warn("Could not fetch default report template:", error);
    }
  }, []);

  useEffect(() => {
    fetchActiveTemplate();
  }, [fetchActiveTemplate]);

  const fetchReportCards = useCallback(async (targetStudentId, silent = false, examFilter = '') => {
    if (!targetStudentId) {
      setReportCards([]);
      setLoading(false);
      return;
    }

    if (!silent) setLoading(true);

    try {
      const queryParams = { limit: 50, sortBy: 'publishedAt', sortOrder: 'desc' };
      if (examFilter) {
        queryParams.examId = examFilter;
      }

      const res = await getStudentReportCards(targetStudentId, queryParams);
      if (!mountedRef.current || currentStudentRef.current !== targetStudentId) return;

      const rawList = res?.data || [];
      const adaptedList = adaptReportCards(rawList);
      adaptedList.sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));
      setReportCards(adaptedList);

      // Populate distinct published exams from full list (when not filtered)
      if (!examFilter) {
        const examsMap = new Map();
        adaptedList.forEach(r => {
          if (r.examId && r.examName) {
            examsMap.set(r.examId, r.examName);
          }
        });
        setAvailableExams(Array.from(examsMap.entries()).map(([id, name]) => ({ id, name })));
      }
    } catch (error) {
      if (mountedRef.current && currentStudentRef.current === targetStudentId) {
        console.error("Error fetching report cards:", error);
        toast.error(error.message || "Failed to load report cards.");
        setReportCards([]);
      }
    } finally {
      if (mountedRef.current && currentStudentRef.current === targetStudentId) {
        if (!silent) setLoading(false);
      }
    }
  }, []);

  const handleExamChange = (newExamId) => {
    setSelectedExamId(newExamId);
    setSelectedReport(null);
    if (studentId) {
      fetchReportCards(studentId, false, newExamId);
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    currentStudentRef.current = studentId;

    if (!studentId) {
      setReportCards([]);
      setLoading(false);
      return;
    }

    setSelectedReport(null);
    setSelectedExamId('');
    fetchReportCards(studentId, false, '');

    return () => {
      mountedRef.current = false;
    };
  }, [studentId, fetchReportCards]);

  // Live data synchronization for exams / report cards
  const handleLiveRefresh = useCallback(() => {
    if (studentId) {
      fetchReportCards(studentId, true);
    }
  }, [fetchReportCards, studentId]);

  useLiveDataRefresh(handleLiveRefresh, [handleLiveRefresh], ['exams', 'marks']);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-[80vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent"></div>
      </div>
    );
  }

  if (!studentId) {
    return (
      <div className="p-8 text-center text-slate-500 dark:text-slate-400">
        You must link a student to your account to view report cards.
      </div>
    );
  }

  if (selectedReport) {
    const rawTemplate = selectedReport.reportTemplate || activeTemplate;
    const template = normalizeReportCardTemplate(rawTemplate) || {
      themeColor: '#c99bc1',
      rawHtmlTemplate: null,
      originalDocxName: null,
      header: {
        schoolName: '',
        showLogo: true,
        showAddress: true,
        showPhone: true,
        showEmail: true,
        title: 'PROGRESS REPORT',
        subtitle: 'Academic Session 2024-2025'
      },
      studentFields: {
        admissionNo: true,
        dob: true,
        fatherName: true,
        motherName: true,
        attendance: true
      },
      grading: {
        style: 'marks_and_grades',
        columns: null,
        showTotal: true,
        showPercentage: true,
        showRank: false
      },
      footer: {
        signatures: ['Class Teacher', 'Principal', 'Parent'],
        gradingScaleText: 'A1: 91-100 | A2: 81-90 | B1: 71-80 | B2: 61-70 | C1: 51-60 | C2: 41-50 | D: 33-40 | E: Below 33',
        remarks: true
      }
    };
    
    // Sort assessments/subjects keys
    const assessmentIds = Object.keys(selectedReport.marks || {});
    const hasCustomColumns = Array.isArray(template.grading?.columns) && template.grading.columns.length > 0;

    return (
      <div className="p-4 sm:p-8 max-w-4xl mx-auto pb-24 min-w-0 w-full">
        {/* Actions bar */}
        <div className="flex justify-between items-center mb-6 print:hidden w-full">
          <button 
            onClick={() => setSelectedReport(null)}
            className="flex items-center gap-2 px-4 py-2 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-sm"
          >
            <ArrowLeft size={16} /> Back to List
          </button>
          <button 
            onClick={() => window.print()}
            className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-colors shadow-sm"
          >
            <Printer size={16} /> Print Report Card
          </button>
        </div>

        {/* Paper Report Card Layout */}
        <div className="bg-white dark:bg-slate-900 shadow-xl max-w-[794px] min-h-[1050px] mx-auto flex flex-col p-8 print:shadow-none border border-slate-100 dark:border-slate-800 rounded-3xl print:border-none print:p-0" style={{ fontFamily: "'Times New Roman', serif" }}>
            {/* Header */}
            <div className="pb-4 flex items-center border-b-[3px]" style={{ borderColor: template.themeColor }}>
              {template.header.showLogo && (
                <div className="w-20 h-20 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center border-2 shrink-0 mr-6" style={{ borderColor: template.themeColor }}>
                  <span className="text-[10px] text-slate-400 dark:text-slate-300 font-sans font-extrabold">LOGO</span>
                </div>
              )}
              <div className={`flex-1 ${template.header.showLogo ? 'text-center' : 'text-left'}`}>
                <h1 className="text-2xl font-black uppercase text-slate-900 dark:text-white" style={{ color: template.themeColor }}>
                  {template.header.schoolName || userProfile?.schoolName || 'YOUR SCHOOL NAME'}
                </h1>
                <div className="text-xs mt-1.5 text-slate-600 dark:text-slate-300 font-sans">
                  {template.header.showAddress && <span>123 Education Street, Learning City, 10001<br/></span>}
                  <span className="font-semibold">
                    {template.header.showPhone && <span>Tel: +1 234 567 8900 </span>}
                    {template.header.showPhone && template.header.showEmail && <span> | </span>}
                    {template.header.showEmail && <span>Email: info@yourschool.edu</span>}
                  </span>
                </div>
              </div>
            </div>

            {/* Title */}
            <div className="py-6 text-center">
              <h2 className="text-xl font-bold uppercase underline decoration-2 underline-offset-4" style={{ decorationColor: template.themeColor }}>
                {template.header.title || selectedReport.examName || 'PROGRESS REPORT'}
              </h2>
              <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 mt-1">{template.header.subtitle}</p>
            </div>

            {/* Student Info */}
            <div className="pb-6">
              <div className="grid grid-cols-2 gap-x-8 gap-y-2.5 p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-sans">
                <div className="flex justify-between border-b border-slate-150 dark:border-slate-700 pb-1">
                  <span className="font-bold text-slate-500 dark:text-slate-400 text-xs uppercase">Student Name:</span>
                  <span className="font-bold text-slate-900 dark:text-white text-xs">{selectedReport.studentName}</span>
                </div>
                <div className="flex justify-between border-b border-slate-150 dark:border-slate-700 pb-1">
                  <span className="font-bold text-slate-500 dark:text-slate-400 text-xs uppercase">Class & Section:</span>
                  <span className="font-bold text-slate-900 dark:text-white text-xs">{selectedReport.className}</span>
                </div>
                <div className="flex justify-between border-b border-slate-150 dark:border-slate-700 pb-1">
                  <span className="font-bold text-slate-500 dark:text-slate-400 text-xs uppercase">Examination:</span>
                  <span className="font-bold text-slate-900 dark:text-white text-xs">{selectedReport.examName || selectedReport.title}</span>
                </div>

                {template.studentFields?.admissionNo && (
                  <div className="flex justify-between border-b border-slate-150 dark:border-slate-700 pb-1">
                    <span className="font-bold text-slate-500 dark:text-slate-400 text-xs uppercase">Admission No:</span>
                    <span className="font-bold text-slate-900 dark:text-white text-xs">{selectedReport.admissionNumber || '-'}</span>
                  </div>
                )}
                {template.studentFields?.dob && (
                  <div className="flex justify-between border-b border-slate-150 dark:border-slate-700 pb-1">
                    <span className="font-bold text-slate-500 dark:text-slate-400 text-xs uppercase">Date of Birth:</span>
                    <span className="font-bold text-slate-900 dark:text-white text-xs">{selectedReport.dateOfBirth || '-'}</span>
                  </div>
                )}
                {template.studentFields?.fatherName && (
                  <div className="flex justify-between border-b border-slate-150 dark:border-slate-700 pb-1">
                    <span className="font-bold text-slate-500 dark:text-slate-400 text-xs uppercase">Father's Name:</span>
                    <span className="font-bold text-slate-900 dark:text-white text-xs">{selectedReport.fatherName || '-'}</span>
                  </div>
                )}
                {template.studentFields?.motherName && (
                  <div className="flex justify-between border-b border-slate-150 dark:border-slate-700 pb-1">
                    <span className="font-bold text-slate-500 dark:text-slate-400 text-xs uppercase">Mother's Name:</span>
                    <span className="font-bold text-slate-900 dark:text-white text-xs">{selectedReport.motherName || '-'}</span>
                  </div>
                )}
                {template.studentFields?.attendance && (
                  <div className="flex justify-between border-b border-slate-150 dark:border-slate-700 pb-1">
                    <span className="font-bold text-slate-500 dark:text-slate-400 text-xs uppercase">Attendance:</span>
                    <span className="font-bold text-slate-900 dark:text-white text-xs">
                      {selectedReport.attendanceSummary ? `${selectedReport.attendanceSummary.present} / ${selectedReport.attendanceSummary.totalSessions}` : '- / -'}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Grades Table */}
            <div className="flex-1 min-w-0 w-full">
              <div className="w-full min-w-0 overflow-x-auto">
                <table className="w-full text-left border-collapse border border-slate-300 dark:border-slate-600 font-sans text-xs min-w-max">
                  <thead>
                    <tr className="text-white uppercase" style={{ backgroundColor: template.themeColor }}>
                      {hasCustomColumns ? (
                        template.grading.columns.map((col, idx) => (
                          <th key={idx} className={`p-3 border border-slate-300 dark:border-slate-600 font-bold ${idx === 0 ? 'text-left' : 'text-center'}`}>
                            {col}
                          </th>
                        ))
                      ) : (
                        <>
                          <th className="p-3 border border-slate-300 dark:border-slate-600 font-bold">Assessment / Subject</th>
                          <th className="p-3 border border-slate-300 dark:border-slate-600 text-center font-bold">Max Marks</th>
                          {['marks', 'marks_and_grades'].includes(template.grading?.style) && (
                            <th className="p-3 border border-slate-300 dark:border-slate-600 text-center font-bold">Marks Obtained</th>
                          )}
                          {['grades', 'marks_and_grades'].includes(template.grading?.style) && (
                            <th className="p-3 border border-slate-300 dark:border-slate-600 text-center font-bold">Grade</th>
                          )}
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {(() => {
                      // Helper to get display value for a cell in assessment row
                      const getColDisplayValue = (item, colName, cIdx) => {
                        if (cIdx === 0) return item.title || '';
                        const lower = colName.toLowerCase();
                        if (lower.includes('max')) {
                          return item.max !== undefined ? item.max : '-';
                        }
                        if (lower.includes('grade')) {
                          const mark = item.obtained !== undefined ? item.obtained : '-';
                          const maxMark = item.max !== undefined ? item.max : '-';
                          return item.grade || (mark !== '-' && Number(maxMark) > 0 
                            ? (Number(mark) / Number(maxMark) >= 0.9 ? 'A1' : Number(mark) / Number(maxMark) >= 0.8 ? 'A2' : Number(mark) / Number(maxMark) >= 0.7 ? 'B1' : 'B2') 
                            : '-');
                        }

                        // Total column check
                        const isTotalCol = lower.startsWith('total') || lower === 'total' || lower.includes('total/') || lower.includes('/total') || lower.includes('aggregate');
                        if (isTotalCol) {
                          // If componentMarks has valid numbers for real non-total components, compute clean sum
                          if (item.componentMarks && typeof item.componentMarks === 'object') {
                            const realComps = (template.assessmentComponents || []).filter(c => {
                              const cLower = (c.label || c.key || '').toLowerCase();
                              return !c.isCalculated && c.type !== 'calculated_total' && c.type !== 'grade' && !cLower.includes('total') && !cLower.includes('grade');
                            });
                            if (realComps.length > 0) {
                              let sum = 0;
                              let hasVal = false;
                              realComps.forEach(c => {
                                const v = item.componentMarks[c.key];
                                if (v !== undefined && v !== null && v !== '' && !isNaN(Number(v))) {
                                  sum += Number(v);
                                  hasVal = true;
                                }
                              });
                              if (hasVal) return sum;
                            }
                          }
                          return item.obtained !== undefined ? item.obtained : '-';
                        }

                        // Component matching (excluding any component whose key or label is total or grade)
                        const matchedComponent = (template.assessmentComponents || []).find(comp => {
                          const cKey = (comp.key || '').toLowerCase();
                          const cLabel = (comp.label || '').toLowerCase();
                          if (cKey.includes('total') || cKey.includes('grade') || cLabel.includes('total') || cLabel.includes('grade')) return false;
                          return (cLabel && lower.includes(cLabel)) || (cKey && lower.includes(cKey));
                        });
                        const compKey = matchedComponent?.key;
                        if (compKey && item.componentMarks?.[compKey] !== undefined) {
                          return item.componentMarks[compKey];
                        }

                        // Fallback matching by column name prefix
                        if (item.componentMarks && typeof item.componentMarks === 'object') {
                          const cleanKey = lower.split('/')[0].trim().replace(/[^a-z0-9]/g, '_');
                          for (const [k, v] of Object.entries(item.componentMarks)) {
                            const kLower = k.toLowerCase();
                            if (kLower === cleanKey || kLower.startsWith(cleanKey)) {
                              return v;
                            }
                          }
                        }

                        return item.obtained !== undefined ? item.obtained : '-';
                      };

                      const computedTotalMax = assessmentIds.reduce((sum, id) => {
                        const m = selectedReport?.marks?.[id]?.max;
                        return m !== undefined && !isNaN(Number(m)) ? sum + Number(m) : sum;
                      }, 0) || selectedReport?.totalMax || 0;

                      const computedTotalObtained = assessmentIds.reduce((sum, id) => {
                        const itm = selectedReport?.marks?.[id] || {};
                        const val = getColDisplayValue(itm, 'total', 999);
                        return (val !== '-' && !isNaN(Number(val))) ? sum + Number(val) : sum;
                      }, 0);

                      const computedPercentage = computedTotalMax > 0 
                        ? ((computedTotalObtained / computedTotalMax) * 100).toFixed(1) 
                        : (selectedReport?.percentage || 0);

                      return (
                        <>
                          {assessmentIds.map((id, i) => {
                            const item = selectedReport.marks[id] || {};
                            const mark = item.obtained !== undefined ? item.obtained : '-';
                            const maxMark = item.max !== undefined ? item.max : '-';
                            const autoGrade = item.grade || (mark !== '-' && Number(maxMark) > 0 
                              ? (Number(mark) / Number(maxMark) >= 0.9 ? 'A1' : Number(mark) / Number(maxMark) >= 0.8 ? 'A2' : Number(mark) / Number(maxMark) >= 0.7 ? 'B1' : 'B2') 
                              : '-');

                            return (
                              <tr key={id} className={i % 2 === 0 ? 'bg-white dark:bg-slate-900 hover:bg-slate-50/50' : 'bg-slate-50 dark:bg-slate-800 hover:bg-slate-100/50'}>
                                {hasCustomColumns ? (
                                  template.grading.columns.map((colName, cIdx) => {
                                    if (cIdx === 0) {
                                      return (
                                        <td key={cIdx} className="p-3 border border-slate-300 dark:border-slate-600 font-semibold text-slate-900 dark:text-white">
                                          {item.title || id}
                                        </td>
                                      );
                                    }
                                    const displayMark = getColDisplayValue(item, colName, cIdx);

                                    return (
                                      <td key={cIdx} className="p-3 border border-slate-300 dark:border-slate-600 text-center font-bold text-slate-800 dark:text-slate-100">
                                        {displayMark}
                                      </td>
                                    );
                                  })
                                ) : (
                                  <>
                                    <td className="p-3 border border-slate-300 dark:border-slate-600 font-semibold text-slate-900 dark:text-white">{item.title || id}</td>
                                    <td className="p-3 border border-slate-300 dark:border-slate-600 text-center text-slate-500 dark:text-slate-400">{maxMark}</td>
                                    {['marks', 'marks_and_grades'].includes(template.grading?.style) && (
                                      <td className="p-3 border border-slate-300 dark:border-slate-600 text-center font-bold text-slate-800 dark:text-slate-100">{mark}</td>
                                    )}
                                    {['grades', 'marks_and_grades'].includes(template.grading?.style) && (
                                      <td className="p-3 border border-slate-300 dark:border-slate-600 text-center font-bold text-slate-800 dark:text-slate-100">{autoGrade}</td>
                                    )}
                                  </>
                                )}
                              </tr>
                            );
                          })}

                          {/* Totals Row */}
                          {(template.grading?.showTotal || template.grading?.showPercentage) && (
                            <tr className="bg-slate-100 dark:bg-slate-700 font-bold">
                              {hasCustomColumns ? (
                                template.grading.columns.map((colName, cIdx) => {
                                  if (cIdx === 0) {
                                    return <td key={cIdx} className="p-3 border border-slate-300 dark:border-slate-600 text-right">TOTAL</td>;
                                  }
                                  const lower = colName.toLowerCase();
                                  if (lower.includes('grade')) {
                                    const overallPct = computedTotalMax > 0 ? (computedTotalObtained / computedTotalMax) * 100 : selectedReport.percentage;
                                    return (
                                      <td key={cIdx} className="p-3 border border-slate-300 dark:border-slate-600 text-center text-primary-700" style={{ color: template.themeColor }}>
                                        {selectedReport.overallGrade || (overallPct >= 90 ? 'A1' : overallPct >= 80 ? 'A2' : overallPct >= 70 ? 'B1' : 'B2')}
                                      </td>
                                    );
                                  }
                                  if (lower.includes('max')) {
                                    let maxColSum = 0;
                                    assessmentIds.forEach(id => {
                                      const itm = selectedReport.marks[id] || {};
                                      if (itm.max !== undefined && !isNaN(Number(itm.max))) {
                                        maxColSum += Number(itm.max);
                                      }
                                    });
                                    return <td key={cIdx} className="p-3 border border-slate-300 dark:border-slate-600 text-center">{maxColSum || computedTotalMax}</td>;
                                  }

                                  // Calculate column total strictly from each cell above it in this column
                                  let colSum = 0;
                                  let hasValidVal = false;
                                  assessmentIds.forEach(id => {
                                    const itm = selectedReport.marks[id] || {};
                                    const cellVal = getColDisplayValue(itm, colName, cIdx);
                                    if (cellVal !== '-' && cellVal !== '' && cellVal !== null && cellVal !== undefined && !isNaN(Number(cellVal))) {
                                      colSum += Number(cellVal);
                                      hasValidVal = true;
                                    }
                                  });

                                  return (
                                    <td key={cIdx} className="p-3 border border-slate-300 dark:border-slate-600 text-center text-primary-700" style={{ color: template.themeColor }}>
                                      {hasValidVal ? colSum : '-'}
                                    </td>
                                  );
                                })
                              ) : (
                                <>
                                  <td className="p-3 border border-slate-300 dark:border-slate-600 text-right">TOTAL</td>
                                  <td className="p-3 border border-slate-300 dark:border-slate-600 text-center">{computedTotalMax}</td>
                                  {['marks', 'marks_and_grades'].includes(template.grading?.style) && (
                                    <td className="p-3 border border-slate-300 dark:border-slate-600 text-center text-primary-700" style={{ color: template.themeColor }}>
                                      {computedTotalObtained}
                                    </td>
                                  )}
                                  {['grades', 'marks_and_grades'].includes(template.grading?.style) && (
                                    <td className="p-3 border border-slate-300 dark:border-slate-600 text-center text-primary-700" style={{ color: template.themeColor }}>
                                      {selectedReport.overallGrade || (computedPercentage >= 91 ? 'A1' : computedPercentage >= 81 ? 'A2' : computedPercentage >= 71 ? 'B1' : computedPercentage >= 61 ? 'B2' : computedPercentage >= 51 ? 'C1' : computedPercentage >= 41 ? 'C2' : computedPercentage >= 33 ? 'D' : 'E')}
                                    </td>
                                  )}
                                </>
                              )}
                            </tr>
                          )}
                        </>
                      );
                    })()}
                  </tbody>
                </table>
              </div>

              {/* Performance Summary / Total Marks & Grade */}
              {(template.grading?.showPercentage !== false || template.grading?.showTotal !== false) && (
                <div className="mt-6 flex justify-between items-center p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-sans print:bg-white print:border-slate-300">
                  {(() => {
                    const compTotalMax = assessmentIds.reduce((sum, id) => {
                      const m = selectedReport?.marks?.[id]?.max;
                      return m !== undefined && !isNaN(Number(m)) ? sum + Number(m) : sum;
                    }, 0) || selectedReport?.totalMax || 0;

                    const compTotalObt = assessmentIds.reduce((sum, id) => {
                      const itm = selectedReport?.marks?.[id] || {};
                      if (itm.componentMarks && typeof itm.componentMarks === 'object') {
                        const realComps = (template.assessmentComponents || []).filter(c => {
                          const cLower = (c.label || c.key || '').toLowerCase();
                          return !c.isCalculated && c.type !== 'calculated_total' && c.type !== 'grade' && !cLower.includes('total') && !cLower.includes('grade');
                        });
                        if (realComps.length > 0) {
                          let s = 0;
                          let h = false;
                          realComps.forEach(c => {
                            const v = itm.componentMarks[c.key];
                            if (v !== undefined && v !== null && v !== '' && !isNaN(Number(v))) {
                              s += Number(v);
                              h = true;
                            }
                          });
                          if (h) return sum + s;
                        }
                      }
                      return (itm.obtained !== undefined && !isNaN(Number(itm.obtained))) ? sum + Number(itm.obtained) : sum;
                    }, 0);

                    const compPct = compTotalMax > 0 
                      ? ((compTotalObt / compTotalMax) * 100).toFixed(1) 
                      : (selectedReport?.percentage || 0);

                    const compGrade = selectedReport.overallGrade || (
                      compPct >= 91 ? 'A1' : compPct >= 81 ? 'A2' : compPct >= 71 ? 'B1' : compPct >= 61 ? 'B2' : compPct >= 51 ? 'C1' : compPct >= 41 ? 'C2' : compPct >= 33 ? 'D' : 'E'
                    );

                    return (
                      <>
                        <div className="flex items-center gap-6">
                          <div>
                            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Total Marks:</span>
                            <p className="text-lg font-black text-slate-900 dark:text-white">{compTotalObt} / {compTotalMax}</p>
                          </div>
                          <div className="border-l border-slate-300 dark:border-slate-600 pl-6">
                            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Grade:</span>
                            <p className="text-lg font-black" style={{ color: template.themeColor }}>{compGrade}</p>
                          </div>
                        </div>
                        {template.grading?.showPercentage !== false && (
                          <div className="text-right">
                            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Overall Percentage:</span>
                            <p className="text-2xl font-black" style={{ color: template.themeColor }}>{compPct}%</p>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* Remarks Area */}
            {template.footer?.remarks && (
              <div className="mt-8">
                <div className="border-2 border-slate-200 dark:border-slate-700 p-4 rounded-xl min-h-[70px] bg-slate-50/50 dark:bg-slate-800/40">
                  <span className="font-bold text-xs text-slate-700 dark:text-slate-200 block mb-1">Class Teacher's Remarks:</span>
                  <span className="text-xs font-medium italic text-slate-500 dark:text-slate-400">Student demonstrated consistent academic engagement throughout this term.</span>
                </div>
              </div>
            )}

            {/* Dynamic Signatures */}
            <div className="pt-10 grid grid-cols-2 sm:grid-cols-3 gap-6 text-center font-sans text-xs mt-auto">
              {(template.footer?.signatures && template.footer.signatures.length > 0
                ? template.footer.signatures
                : ['Class Teacher', 'Principal', 'Parent']
              ).map((sig, sIdx) => (
                <div key={sIdx} className="flex flex-col items-center">
                  <div className="border-b border-slate-400 dark:border-slate-600 mx-auto w-36 h-6"></div>
                  <p className="text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider mt-2">{sig}</p>
                </div>
              ))}
            </div>

            {/* Grading Scale Text */}
            {template.footer?.gradingScaleText && (
              <div className="mt-8 pt-4 border-t border-slate-200 dark:border-slate-700 text-center font-sans">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider block mb-1">Grading Scale</span>
                <p className="text-[11px] text-slate-600 dark:text-slate-300 font-medium">{template.footer.gradingScaleText}</p>
              </div>
            )}
          </div>
        </div>
    );
  }

  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto pb-24 min-w-0 w-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 w-full">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-primary-50 text-primary-600 rounded-2xl flex items-center justify-center shadow-sm shrink-0">
            <Award size={24} />
          </div>
          <div className="min-w-0">
            <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight truncate">Academic Report Cards</h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5 font-medium">View and download your child's published academic progress records</p>
          </div>
        </div>

        {availableExams.length > 0 && (
          <div className="flex items-center gap-2 self-start sm:self-auto bg-white dark:bg-slate-900 p-2 px-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">Exam:</label>
            <select
              value={selectedExamId}
              onChange={(e) => handleExamChange(e.target.value)}
              className="bg-transparent text-sm font-bold text-slate-900 dark:text-white focus:outline-none cursor-pointer pr-2"
            >
              <option value="" className="text-slate-900 dark:text-white bg-white dark:bg-slate-900">All Published Exams</option>
              {availableExams.map(ex => (
                <option key={ex.id} value={ex.id} className="text-slate-900 dark:text-white bg-white dark:bg-slate-900">
                  {ex.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {reportCards.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-3xl p-12 text-center shadow-sm">
          <FileIcon className="mx-auto text-slate-300 mb-4" size={56} />
          <h3 className="text-slate-900 dark:text-white font-bold text-lg mb-1">No Report Cards Published</h3>
          <p className="text-slate-500 dark:text-slate-400 text-sm max-w-sm mx-auto">
            Official term-end report cards will appear here once finalized and published by the school administration.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {reportCards.map((report) => (
            <div 
              key={report.id} 
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-3xl p-6 shadow-sm hover:shadow-md hover:border-slate-300 transition-all duration-200 flex flex-col justify-between"
            >
              <div>
                <div className="flex justify-between items-start gap-4">
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-primary-50 text-primary-700 border border-primary-100">
                    {report.className}
                  </span>
                  <span className="text-[11px] font-bold text-slate-400 dark:text-slate-300 flex items-center gap-1">
                    <Calendar size={12} />
                    {report.publishedAt ? new Date(report.publishedAt).toLocaleDateString('en-GB') : 'N/A'}
                  </span>
                </div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mt-4">{report.examName}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-semibold">Published by: {report.publishedBy}</p>

                <div className="mt-6 flex items-baseline gap-1">
                  <span className="text-3xl font-black text-slate-900 dark:text-white">{report.percentage}%</span>
                  <span className="text-xs font-bold text-slate-400 dark:text-slate-300 uppercase">Overall Result</span>
                </div>
              </div>

              <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800 flex gap-3">
                <button 
                  onClick={() => setSelectedReport(report)}
                  className="flex-1 py-2.5 bg-primary-600 hover:bg-primary-700 text-white font-bold rounded-xl transition-colors text-center text-sm shadow-sm"
                >
                  View Details
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
