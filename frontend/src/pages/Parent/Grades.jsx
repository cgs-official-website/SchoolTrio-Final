import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useOutletContext } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getStudentReportCards } from '../../api/reportCards';
import { getReportCardTemplate } from '../../api/reportCardTemplates';
import { adaptReportCards, normalizeReportCardTemplate } from '../../utils/reportCardAdapter';
import { useLiveDataRefresh } from '../../hooks/useLiveDataRefresh';
import { LuFileSpreadsheet as FileIcon, LuPrinter as Printer, LuArrowLeft as ArrowLeft, LuCalendar as Calendar, LuAward as Award, LuEye as Eye, LuSparkles as Sparkles } from 'react-icons/lu';
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
  const [activePreviewTab, setActivePreviewTab] = useState('pdf');

  const mountedRef = useRef(true);
  const currentStudentRef = useRef(studentId);

  useEffect(() => {
    setSelectedReport(null);
    setActivePreviewTab('pdf');
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

  const fetchReportCards = useCallback(async (targetStudentId, silent = false) => {
    if (!targetStudentId) {
      setReportCards([]);
      setLoading(false);
      return;
    }

    if (!silent) setLoading(true);

    try {
      const res = await getStudentReportCards(targetStudentId, { limit: 50, sortBy: 'publishedAt', sortOrder: 'desc' });
      if (!mountedRef.current || currentStudentRef.current !== targetStudentId) return;

      const rawList = res?.data || [];
      const adaptedList = adaptReportCards(rawList);
      adaptedList.sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));
      setReportCards(adaptedList);
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

  useEffect(() => {
    mountedRef.current = true;
    currentStudentRef.current = studentId;

    if (!studentId) {
      setReportCards([]);
      setLoading(false);
      return;
    }

    setSelectedReport(null);
    fetchReportCards(studentId, false);

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
          <div className="flex items-center gap-2">
            <button 
              onClick={() => { setSelectedReport(null); setActivePreviewTab('pdf'); }}
              className="flex items-center gap-2 px-4 py-2 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-sm"
            >
              <ArrowLeft size={16} /> Back to List
            </button>
            {template.rawHtmlTemplate && (
              <div className="flex items-center gap-1.5 ml-2 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setActivePreviewTab('pdf')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                    activePreviewTab === 'pdf'
                      ? 'bg-primary-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  <Eye size={14} /> Report Card View
                </button>
                <button
                  type="button"
                  onClick={() => setActivePreviewTab('original')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                    activePreviewTab === 'original'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  <Sparkles size={14} /> Uploaded Template ({template.originalDocxName || 'Word'})
                </button>
              </div>
            )}
          </div>
          <button 
            onClick={() => window.print()}
            className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-colors shadow-sm"
          >
            <Printer size={16} /> Print Report Card
          </button>
        </div>

        {/* Uploaded HTML Document View (if active) */}
        {activePreviewTab === 'original' && template.rawHtmlTemplate ? (
          <div className="bg-white dark:bg-slate-900 shadow-xl w-full max-w-[794px] min-h-[1123px] mx-auto p-10 font-sans text-slate-900 dark:text-white rounded-3xl overflow-x-auto border border-slate-100 dark:border-slate-800 print:shadow-none print:border-none print:p-0">
            <div className="mb-4 pb-2 border-b border-indigo-200 dark:border-indigo-800 flex items-center justify-between print:hidden">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                Official School Template: {template.originalDocxName || 'Uploaded Layout'}
              </span>
              <span className="text-xs text-slate-400">Published Design</span>
            </div>
            <div 
              className="prose dark:prose-invert max-w-none [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-slate-300 [&_th]:p-2 [&_td]:border [&_td]:border-slate-300 [&_td]:p-2 [&_p]:mb-2"
              dangerouslySetInnerHTML={{ __html: template.rawHtmlTemplate }} 
            />
          </div>
        ) : (
          /* Paper Report Card Layout matching Published Admin Template */
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
                <div className="flex justify-between border-b border-slate-150 dark:border-slate-700 pb-1">
                  <span className="font-bold text-slate-500 dark:text-slate-400 text-xs uppercase">Roll No:</span>
                  <span className="font-bold text-slate-900 dark:text-white text-xs">{selectedReport.rollNumber || selectedReport.admissionNumber || 'N/A'}</span>
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
                              const lower = colName.toLowerCase();
                              if (lower.includes('max')) {
                                return (
                                  <td key={cIdx} className="p-3 border border-slate-300 dark:border-slate-600 text-center text-slate-500 dark:text-slate-400">
                                    {maxMark}
                                  </td>
                                );
                              }
                              if (lower.includes('grade')) {
                                return (
                                  <td key={cIdx} className="p-3 border border-slate-300 dark:border-slate-600 text-center font-bold text-slate-800 dark:text-slate-100">
                                    {autoGrade}
                                  </td>
                                );
                              }
                              return (
                                <td key={cIdx} className="p-3 border border-slate-300 dark:border-slate-600 text-center font-bold text-slate-800 dark:text-slate-100">
                                  {mark}
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
                              return (
                                <td key={cIdx} className="p-3 border border-slate-300 dark:border-slate-600 text-center text-primary-700" style={{ color: template.themeColor }}>
                                  {selectedReport.overallGrade || (selectedReport.percentage >= 90 ? 'A1' : selectedReport.percentage >= 80 ? 'A2' : selectedReport.percentage >= 70 ? 'B1' : 'B2')}
                                </td>
                              );
                            }
                            if (lower.includes('max')) {
                              return <td key={cIdx} className="p-3 border border-slate-300 dark:border-slate-600 text-center">{selectedReport.totalMax}</td>;
                            }
                            return (
                              <td key={cIdx} className="p-3 border border-slate-300 dark:border-slate-600 text-center text-primary-700" style={{ color: template.themeColor }}>
                                {selectedReport.totalObtained}
                              </td>
                            );
                          })
                        ) : (
                          <>
                            <td className="p-3 border border-slate-300 dark:border-slate-600 text-right">TOTAL</td>
                            <td className="p-3 border border-slate-300 dark:border-slate-600 text-center">{selectedReport.totalMax}</td>
                            {['marks', 'marks_and_grades'].includes(template.grading?.style) && (
                              <td className="p-3 border border-slate-300 dark:border-slate-600 text-center text-primary-700" style={{ color: template.themeColor }}>
                                {selectedReport.totalObtained}
                              </td>
                            )}
                            {['grades', 'marks_and_grades'].includes(template.grading?.style) && (
                              <td className="p-3 border border-slate-300 dark:border-slate-600 text-center text-primary-700" style={{ color: template.themeColor }}>
                                {selectedReport.overallGrade || (selectedReport.percentage >= 90 ? 'A1' : selectedReport.percentage >= 80 ? 'A2' : selectedReport.percentage >= 70 ? 'B1' : 'B2')}
                              </td>
                            )}
                          </>
                        )}
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Performance Summary / Percentage */}
              {template.grading?.showPercentage && (
                <div className="mt-6 flex justify-between items-center p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-sans">
                  <div>
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Obtained Marks:</span>
                    <p className="text-lg font-black text-slate-900 dark:text-white">{selectedReport.totalObtained} / {selectedReport.totalMax}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Overall Percentage:</span>
                    <p className="text-2xl font-black" style={{ color: template.themeColor }}>{selectedReport.percentage}%</p>
                  </div>
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
        )}
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto pb-24 min-w-0 w-full">
      <div className="flex items-center gap-3 mb-8 w-full">
        <div className="w-12 h-12 bg-primary-50 text-primary-600 rounded-2xl flex items-center justify-center shadow-sm shrink-0">
          <Award size={24} />
        </div>
        <div className="min-w-0">
          <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight truncate">Academic Report Cards</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5 font-medium">View and download your child's published academic progress records</p>
        </div>
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
