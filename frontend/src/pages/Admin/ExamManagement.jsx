import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLocation } from 'react-router-dom';
import { listExams, createExam, updateExamStatus, getExamProgress } from '../../api/exams';
import { previewReportCards, publishReportCards } from '../../api/reportCards';
import { listClasses, listSections } from '../../api/classes';
import { listSubjects } from '../../api/subjects';
import { bulkUpsertAssessmentGrades } from '../../api/assessments';
import { getReportCardTemplate } from '../../api/reportCardTemplates';
import { useLiveDataRefresh } from '../../hooks/useLiveDataRefresh';
import { notifyDataChanged } from '../../utils/liveData';
import { 
  LuFileText as FileText, 
  LuPlus as Plus, 
  LuX as X, 
  LuGraduationCap as GraduationCap, 
  LuCalendar as Calendar, 
  LuFileChartColumn as FileBarChart, 
  LuLoaderCircle as Loader2, 
  LuPrinter as Printer, 
  LuPalette as Palette,
  LuCircleCheck as CheckCircle2,
  LuLock as Lock,
  LuSend as Send,
  LuPencil as Edit3,
  LuClock as Clock,
  LuArrowRight as ArrowRight,
  LuTrash2 as Trash2
} from 'react-icons/lu';
import toast from 'react-hot-toast';
import ReportTemplateBuilder from './ReportTemplateBuilder';
import CustomFieldsRenderer from '../../components/CustomFieldsRenderer';
import { sortClassesAscending, formatClassSection } from '../../utils/classSorting';

export default function ExamManagement() {
  const { userProfile } = useAuth();
  const schoolId = userProfile?.schoolId;
  const location = useLocation();

  const [activeTab, setActiveTab] = useState('manage'); // 'manage' | 'reports'
  const [exams, setExams] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);

  // Manage Exams State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [allSubjects, setAllSubjects] = useState([]);
  const [selectedClassSections, setSelectedClassSections] = useState([]);
  const [examProgress, setExamProgress] = useState(null);
  const [viewingProgressExam, setViewingProgressExam] = useState(null);
  const [loadingProgress, setLoadingProgress] = useState(false);
  const [updatingStatusId, setUpdatingStatusId] = useState(null);

  // Admin Mark Override State
  const [overrideModal, setOverrideModal] = useState({
    isOpen: false,
    student: null,
    assessment: null,
    currentMarks: '',
    newMarks: '',
    reason: ''
  });
  const [savingOverride, setSavingOverride] = useState(false);

  // Create Exam Form state with class, section, subjectsConfig
  const [newExam, setNewExam] = useState({
    name: '',
    startDate: '',
    endDate: '',
    examType: 'Final',
    term: '',
    classId: '',
    sectionId: '',
    subjectsConfig: []
  });

  const fetchExams = useCallback(async () => {
    try {
      const res = await listExams();
      setExams(res?.data || []);
    } catch (error) {
      console.error("Error fetching exams:", error);
      toast.error("Failed to load exams.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Real-time synchronization
  useLiveDataRefresh(fetchExams, [fetchExams], ['exams', 'marks']);

  // Fetch subjects for school tenant
  const fetchSubjects = useCallback(async () => {
    try {
      const res = await listSubjects({ limit: 100 });
      setAllSubjects(res?.data || []);
    } catch (err) {
      console.error("Error fetching subjects:", err);
    }
  }, []);

  // Refresh progress if active
  const refreshProgress = useCallback(async (examId) => {
    if (!examId) return;
    try {
      const res = await getExamProgress(examId);
      setExamProgress(res?.data || null);
    } catch (err) {
      console.error("Error fetching exam progress:", err);
    }
  }, []);

  // Poll / refresh progress when active
  useEffect(() => {
    if (viewingProgressExam?.id) {
      refreshProgress(viewingProgressExam.id);
    }
  }, [viewingProgressExam, refreshProgress]);

  const handleOpenProgress = async (exam) => {
    setViewingProgressExam(exam);
    setLoadingProgress(true);
    try {
      const res = await getExamProgress(exam.id);
      setExamProgress(res?.data || null);
    } catch (err) {
      console.error("Error loading progress:", err);
      toast.error("Failed to load exam progress.");
    } finally {
      setLoadingProgress(false);
    }
  };

  const handleUpdateStatus = async (examId, newStatus) => {
    setUpdatingStatusId(examId);
    try {
      await updateExamStatus(examId, newStatus);
      toast.success(`Exam marked as ${newStatus}!`);
      notifyDataChanged('exams');
      await fetchExams();
      if (viewingProgressExam?.id === examId) {
        setViewingProgressExam(prev => prev ? { ...prev, status: newStatus } : null);
        await refreshProgress(examId);
      }
    } catch (err) {
      console.error("Error updating exam status:", err);
      toast.error(err?.message || "Failed to update exam status");
    } finally {
      setUpdatingStatusId(null);
    }
  };

  // When class changes in Create Exam modal, load its sections and auto-populate subjects
  const handleCreateClassChange = async (classId) => {
    setNewExam(prev => ({ ...prev, classId, sectionId: '', subjectsConfig: [] }));
    if (!classId) {
      setSelectedClassSections([]);
      return;
    }

    try {
      const res = await listSections(classId);
      setSelectedClassSections(res?.data || []);
    } catch (err) {
      console.error("Error loading sections:", err);
      setSelectedClassSections([]);
    }

    // Default populate all subjects
    if (allSubjects.length > 0) {
      const defaultConfigs = allSubjects.map(s => ({
        subjectId: s.id,
        subjectName: s.name,
        maxMarks: 100,
        passMarks: 40,
        weightage: 100,
        examDate: ''
      }));
      setNewExam(prev => ({ ...prev, subjectsConfig: defaultConfigs }));
    }
  };

  const handleSubjectConfigChange = (index, field, value) => {
    setNewExam(prev => {
      const updated = [...prev.subjectsConfig];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, subjectsConfig: updated };
    });
  };

  const handleRemoveSubjectConfig = (index) => {
    setNewExam(prev => ({
      ...prev,
      subjectsConfig: prev.subjectsConfig.filter((_, i) => i !== index)
    }));
  };

  const handleAddSubjectConfig = (subjectId) => {
    const sub = allSubjects.find(s => s.id === subjectId);
    if (!sub) return;
    setNewExam(prev => {
      if (prev.subjectsConfig.some(s => s.subjectId === subjectId)) {
        toast.error("Subject already added");
        return prev;
      }
      return {
        ...prev,
        subjectsConfig: [
          ...prev.subjectsConfig,
          {
            subjectId: sub.id,
            subjectName: sub.name,
            maxMarks: 100,
            passMarks: 40,
            weightage: 100,
            examDate: ''
          }
        ]
      };
    });
  };

  const handleCreateExam = async (e) => {
    e.preventDefault();
    if (!newExam.name || !newExam.name.trim()) {
      toast.error("Exam name is required");
      return;
    }
    setCreating(true);
    try {
      const payload = {
        name: newExam.name.trim(),
        examType: newExam.examType || 'Final',
        startDate: newExam.startDate || null,
        endDate: newExam.endDate || null
      };

      if (newExam.term && newExam.term.trim()) {
        payload.term = newExam.term.trim();
      }
      if (newExam.classId) {
        payload.classId = newExam.classId;
      }
      if (newExam.sectionId) {
        payload.sectionId = newExam.sectionId;
      }
      if (newExam.subjectsConfig && newExam.subjectsConfig.length > 0) {
        payload.subjectsConfig = newExam.subjectsConfig.map(s => ({
          subjectId: s.subjectId,
          subjectName: s.subjectName,
          maxMarks: Number(s.maxMarks) || 100,
          passMarks: Number(s.passMarks) || 0,
          weightage: Number(s.weightage) || 100,
          examDate: s.examDate || null
        }));
      }

      await createExam(payload);
      await fetchExams();
      toast.success("Exam created with automated subject assessments!");
      notifyDataChanged('exams');
      setShowCreateModal(false);
      setNewExam({
        name: '',
        startDate: '',
        endDate: '',
        examType: 'Final',
        term: '',
        classId: '',
        sectionId: '',
        subjectsConfig: []
      });
    } catch (error) {
      console.error("Error creating exam:", error);
      toast.error(error?.message || "Failed to create exam");
    } finally {
      setCreating(false);
    }
  };

  // Report Card State
  const [selectedExamId, setSelectedExamId] = useState('');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [reportData, setReportData] = useState(null);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [isBuildingTemplate, setIsBuildingTemplate] = useState(false);
  const [reportTemplate, setReportTemplate] = useState(null);

  useEffect(() => {
    setIsBuildingTemplate(false);
    setActiveTab('manage');
    setSelectedExamId('');
    setSelectedClassId('');
    setReportData(null);
  }, [location.pathname]);

  const fetchTemplate = useCallback(async () => {
    try {
      const res = await getReportCardTemplate('report_card');
      const configData = res?.data?.config || res?.data;
      if (configData) {
        setReportTemplate(configData);
      }
    } catch (error) {
      console.error("Error fetching report card template:", error);
    }
  }, []);

  useEffect(() => {
    if (!schoolId) return;

    let isMounted = true;
    setLoading(true);

    fetchTemplate();
    fetchExams();
    fetchSubjects();

    listClasses()
      .then(res => {
        if (!isMounted) return;
        const data = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
        setClasses(sortClassesAscending(data));
      })
      .catch(err => console.error("Error fetching classes in ExamManagement:", err));

    return () => {
      isMounted = false;
    };
  }, [schoolId, fetchTemplate, fetchExams, fetchSubjects]);

  useEffect(() => {
    if (selectedClassId && classes.length > 0) {
      const classExists = classes.some(c => c.id === selectedClassId);
      if (!classExists) {
        setSelectedClassId('');
        setReportData(null);
      }
    }
  }, [classes, selectedClassId]);

  useEffect(() => {
    if (selectedExamId && exams.length > 0) {
      const examExists = exams.some(e => e.id === selectedExamId);
      if (!examExists) {
        setSelectedExamId('');
        setReportData(null);
      }
    }
  }, [exams, selectedExamId]);

  // Admin Override Submit Handler
  const handleSaveOverride = async () => {
    if (!overrideModal.assessment || !overrideModal.student) return;
    if (!overrideModal.reason || !overrideModal.reason.trim()) {
      toast.error("An override audit reason is mandatory for admin edits.");
      return;
    }

    setSavingOverride(true);
    try {
      const numericMarks = overrideModal.newMarks === '' ? 0 : Number(overrideModal.newMarks);
      await bulkUpsertAssessmentGrades(overrideModal.assessment.id, {
        grades: [
          {
            studentId: overrideModal.student.id,
            marksObtained: numericMarks,
            overrideReason: overrideModal.reason.trim()
          }
        ],
        overrideReason: overrideModal.reason.trim()
      });

      toast.success("Marks successfully updated with audit log override!");
      notifyDataChanged('exams');
      notifyDataChanged('marks');
      setOverrideModal({ isOpen: false, student: null, assessment: null, currentMarks: '', newMarks: '', reason: '' });
      if (selectedExamId && selectedClassId) {
        await generateReportCard();
      }
      if (viewingProgressExam?.id) {
        await refreshProgress(viewingProgressExam.id);
      }
    } catch (err) {
      console.error("Error saving admin override:", err);
      toast.error(err?.message || "Failed to override student marks.");
    } finally {
      setSavingOverride(false);
    }
  };

  const generateReportCard = async () => {
    if (!selectedExamId || !selectedClassId) return;
    
    setGeneratingReport(true);
    try {
      const res = await previewReportCards({
        classId: selectedClassId,
        examId: selectedExamId
      });

      const previewData = res?.data;
      if (!previewData) {
        throw new Error("No preview data returned from server");
      }

      const students = previewData.students || [];
      const assessments = students[0]?.marks
        ? Object.entries(students[0].marks).map(([id, m]) => ({
            id,
            title: m.title || 'Assessment',
            totalMarks: m.max
          }))
        : [];

      if (previewData.template) {
        setReportTemplate(previewData.template);
      }

      setReportData({
        students,
        assessments,
        className: previewData.className || classes.find(c => c.id === selectedClassId)?.className || classes.find(c => c.id === selectedClassId)?.name || '',
        examName: previewData.examName || exams.find(e => e.id === selectedExamId)?.name || ''
      });
    } catch (error) {
      console.error("Error generating report:", error);
      toast.error(error?.message || "Failed to generate report card data.");
    } finally {
      setGeneratingReport(false);
    }
  };

  const [publishing, setPublishing] = useState(false);

  const handlePublishReportCards = async () => {
    if (!reportData || !reportTemplate) {
      toast.error("Please generate report card data and customize/publish a template first.");
      return;
    }
    
    setPublishing(true);
    const loadingToast = toast.loading("Publishing report cards to parent portal...");
    try {
      const res = await publishReportCards({
        classId: selectedClassId,
        examId: selectedExamId
      });

      toast.dismiss(loadingToast);
      const count = res?.data?.publishedCount;
      toast.success(
        count !== undefined
          ? `Successfully published ${count} report card${count === 1 ? '' : 's'}! Parents can now view them.`
          : "Report cards published successfully! Parents can now view them."
      );
      notifyDataChanged('exams');
      notifyDataChanged('marks');
    } catch (error) {
      console.error("Error publishing report cards:", error);
      toast.dismiss(loadingToast);
      toast.error(error?.message || "Failed to publish report cards.");
    } finally {
      setPublishing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-[80vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent"></div>
      </div>
    );
  }

  if (isBuildingTemplate) {
    return <ReportTemplateBuilder onBack={() => {
      setIsBuildingTemplate(false);
      fetchTemplate(); // Refetch template in case they saved it
    }} />;
  }

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto pb-24">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white truncate">Examinations & Results</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Manage school-wide exams and generate report cards.</p>
        </div>
        {activeTab === 'manage' && (
          <button 
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-primary-600 text-white rounded-xl font-medium hover:bg-primary-700 shadow-sm flex items-center gap-2 transition-colors w-full sm:w-auto justify-center"
          >
            <Plus size={18} /> Create Exam
          </button>
        )}
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col min-h-[500px]">
        {/* Header Tabs */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex gap-2 bg-slate-50 dark:bg-slate-800 rounded-t-3xl overflow-x-auto custom-scrollbar">
          <button 
            onClick={() => setActiveTab('manage')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${activeTab === 'manage' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
          >
            Manage Exams
          </button>
          <button 
            onClick={() => setActiveTab('reports')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${activeTab === 'reports' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
          >
            Report Cards
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1">
          {activeTab === 'manage' ? (
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {exams.length === 0 ? (
                <div className="col-span-full p-12 text-center text-slate-500 dark:text-slate-400">
                  <FileText size={48} className="mx-auto mb-4 text-slate-300" />
                  <p className="text-lg font-medium text-slate-900 dark:text-white">No exams created yet</p>
                  <p>Click "Create Exam" to schedule a formal examination.</p>
                </div>
              ) : (
                exams.map(exam => {
                  const currentStatus = exam.status || 'DRAFT';
                  const isDraft = currentStatus === 'DRAFT';
                  const isPublished = currentStatus === 'PUBLISHED';
                  const isFinalized = currentStatus === 'FINALIZED';

                  return (
                    <div key={exam.id} className="border border-slate-200 dark:border-slate-700 rounded-2xl p-5 hover:shadow-md transition-shadow flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-start mb-3">
                          <div className="p-2.5 bg-primary-50 text-primary-600 rounded-xl">
                            <FileText size={24} />
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className={`px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider ${
                              isFinalized 
                                ? 'bg-purple-100 text-purple-800' 
                                : isPublished 
                                ? 'bg-emerald-100 text-emerald-800' 
                                : 'bg-amber-100 text-amber-800'
                            }`}>
                              {currentStatus}
                            </span>
                          </div>
                        </div>

                        <h3 className="font-bold text-lg text-slate-900 dark:text-white mb-2">{exam.name}</h3>
                        
                        <div className="flex flex-col gap-2 text-sm text-slate-500 dark:text-slate-400 mb-4">
                          <div className="flex items-center gap-2 font-medium text-slate-600 dark:text-slate-300">
                            <FileText size={16} className="text-primary-500" />
                            {exam.term ? `Term: ${exam.term}` : (exam.academicYear ? `Academic Year: ${exam.academicYear}` : (exam.examType || 'Standard Exam'))}
                          </div>
                          {(exam.startDate || exam.endDate) && (
                            <div className="flex items-center gap-2">
                              <Calendar size={16} />
                              {exam.startDate ? new Date(exam.startDate).toLocaleDateString('en-GB') : '-'} - {exam.endDate ? new Date(exam.endDate).toLocaleDateString('en-GB') : '-'}
                            </div>
                          )}
                          {exam.subjectsConfig && Array.isArray(exam.subjectsConfig) && exam.subjectsConfig.length > 0 && (
                            <div className="text-xs bg-slate-50 dark:bg-slate-800 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 mt-1">
                              <span className="font-bold text-slate-700 dark:text-slate-300">{exam.subjectsConfig.length} Subjects Configured</span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {exam.subjectsConfig.map((sc, i) => (
                                  <span key={i} className="px-1.5 py-0.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-[11px] text-slate-600 dark:text-slate-300">
                                    {sc.subjectName || 'Subject'} ({sc.maxMarks}m)
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Workflow Actions */}
                      <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-2 mt-auto">
                        <div className="flex items-center justify-between gap-2">
                          <button
                            onClick={() => handleOpenProgress(exam)}
                            className="flex-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5"
                          >
                            <FileBarChart size={14} /> Live Marks Monitoring
                          </button>
                        </div>

                        {/* Status Transition Button */}
                        <div className="flex items-center gap-2">
                          {isDraft && (
                            <button
                              onClick={() => handleUpdateStatus(exam.id, 'PUBLISHED')}
                              disabled={updatingStatusId === exam.id}
                              className="w-full px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                            >
                              <Send size={14} /> Publish for Staff Entry
                            </button>
                          )}
                          {isPublished && (
                            <div className="w-full flex gap-1.5">
                              <button
                                onClick={() => handleUpdateStatus(exam.id, 'FINALIZED')}
                                disabled={updatingStatusId === exam.id}
                                className="flex-1 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                              >
                                <Lock size={14} /> Finalize & Lock
                              </button>
                              <button
                                onClick={() => handleUpdateStatus(exam.id, 'DRAFT')}
                                disabled={updatingStatusId === exam.id}
                                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300 text-xs rounded-lg transition-colors"
                                title="Revert to Draft"
                              >
                                Revert
                              </button>
                            </div>
                          )}
                          {isFinalized && (
                            <div className="w-full flex items-center justify-between bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 px-3 py-1.5 rounded-lg text-purple-700 dark:text-purple-300 text-xs font-semibold">
                              <span className="flex items-center gap-1"><Lock size={12} /> Locked for Teachers</span>
                              <button
                                onClick={() => handleUpdateStatus(exam.id, 'PUBLISHED')}
                                disabled={updatingStatusId === exam.id}
                                className="text-[11px] underline hover:text-purple-900 dark:hover:text-purple-100 ml-2"
                              >
                                Unlock
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            <div className="flex flex-col h-full">
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col md:flex-row gap-4 items-end bg-slate-50/50 dark:bg-slate-800/50">
                <div className="flex-1 w-full">
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Select Exam</label>
                  <select 
                    value={selectedExamId}
                    onChange={(e) => {
                      setSelectedExamId(e.target.value);
                      setReportData(null);
                    }}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200! bg-white! text-black! focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="" className="text-black bg-white dark:bg-slate-900">-- Choose Exam --</option>
                    {exams.map(e => <option key={e.id} value={e.id} className="text-black bg-white dark:bg-slate-900">{e.name}</option>)}
                  </select>
                </div>
                <div className="flex-1 w-full">
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Select Class</label>
                  <select 
                    value={selectedClassId}
                    onChange={(e) => {
                      setSelectedClassId(e.target.value);
                      setReportData(null);
                    }}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200! bg-white! text-black! focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="" className="text-black bg-white dark:bg-slate-900">-- Choose Class --</option>
                    {classes.map(c => <option key={c.id} value={c.id} className="text-black bg-white dark:bg-slate-900">{formatClassSection(c)}</option>)}
                  </select>
                </div>
                <button 
                  onClick={generateReportCard}
                  disabled={!selectedExamId || !selectedClassId || generatingReport}
                  className="px-4 py-2 bg-primary-600 text-white text-sm font-semibold rounded-xl hover:bg-primary-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 h-11 shrink-0 w-full md:w-auto"
                >
                  {generatingReport ? <Loader2 size={18} className="animate-spin" /> : <FileBarChart size={18} />}
                  Generate View
                </button>
                <button 
                  onClick={() => setIsBuildingTemplate(true)}
                  className="px-6 py-2.5 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 h-11 shrink-0 w-full md:w-auto"
                >
                  <Palette size={18} />
                  Customize Design
                </button>
              </div>

              <div className="p-6 flex-1 overflow-x-auto">
                {!reportData ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-300 py-12">
                    <FileBarChart size={64} className="mb-4 text-slate-200" />
                    <p className="text-lg font-medium text-slate-600 dark:text-slate-300">Select an exam and class to view report cards</p>
                  </div>
                ) : (
                  <div>
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-6">
                      <div className="min-w-0">
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white truncate">{reportData.examName}</h2>
                        <p className="text-slate-500 dark:text-slate-400 font-medium flex items-center gap-2 mt-1">
                          <GraduationCap size={16} /> Class: {reportData.className}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 w-full md:w-auto">
                        <button 
                          onClick={handlePublishReportCards}
                          disabled={publishing}
                          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-colors flex items-center gap-2 disabled:opacity-50"
                        >
                          <FileText size={18} /> {publishing ? 'Publishing...' : 'Publish Report Cards'}
                        </button>
                        <button 
                          onClick={() => window.print()}
                          className="px-4 py-2 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-colors flex items-center gap-2"
                        >
                          <Printer size={18} /> Print Record
                        </button>
                      </div>
                    </div>

                    {reportData.assessments.length === 0 ? (
                      <div className="p-8 bg-amber-50 text-amber-700 rounded-2xl border border-amber-200">
                        <p className="font-bold mb-1">No grades found!</p>
                        <p className="text-sm">Teachers have not linked any assessments for this class to this exam yet.</p>
                      </div>
                    ) : (
                      <>
                        {!reportTemplate ? (
                          <div className="p-8 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-2xl border border-slate-200 dark:border-slate-700 text-center">
                            <Palette size={48} className="mx-auto mb-4 text-slate-400 dark:text-slate-300" />
                            <p className="font-bold mb-1">No Template Published</p>
                            <p className="text-sm mb-4">Please design and publish a Report Card Template first.</p>
                            <button onClick={() => setIsBuildingTemplate(true)} className="px-4 py-2 bg-slate-900 text-white rounded-xl font-bold">Customize Design</button>
                          </div>
                        ) : (
                          <div className="space-y-12">
                            {reportData.students.map((row) => (
                              <div key={row.student.id} className="bg-white dark:bg-slate-900 shadow-xl max-w-[794px] min-h-[1123px] mx-auto flex flex-col print:shadow-none print:break-after-page" style={{ fontFamily: "'Times New Roman', serif" }}>
                                {/* Report Card Header */}
                                <div className="p-8 pb-4 flex items-center border-b-[3px]" style={{ borderColor: reportTemplate.themeColor }}>
                                  {reportTemplate.header.showLogo && (
                                    <div className="w-24 h-24 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center border-2 shrink-0" style={{ borderColor: reportTemplate.themeColor }}>
                                      <span className="text-xs text-slate-400 dark:text-slate-300 font-sans font-bold">LOGO</span>
                                    </div>
                                  )}
                                  <div className={`flex-1 ${reportTemplate.header.showLogo ? 'text-center' : 'text-left'}`}>
                                    <h1 className="text-3xl font-black uppercase text-slate-900 dark:text-white" style={{ color: reportTemplate.themeColor }}>
                                      {reportTemplate.header.schoolName || userProfile?.schoolName || 'YOUR SCHOOL NAME'}
                                    </h1>
                                    <div className="text-sm mt-2 text-slate-700 dark:text-slate-200">
                                      {reportTemplate.header.showAddress && <span>123 Education Street, Learning City, 10001<br/></span>}
                                      <span className="font-medium">
                                        {reportTemplate.header.showPhone && <span>Tel: +1 234 567 8900 </span>}
                                        {reportTemplate.header.showPhone && reportTemplate.header.showEmail && <span> | </span>}
                                        {reportTemplate.header.showEmail && <span>Email: info@yourschool.edu</span>}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                {/* Title Section */}
                                <div className="py-6 text-center">
                                  <h2 className="text-2xl font-bold uppercase underline decoration-2 underline-offset-4" style={{ decorationColor: reportTemplate.themeColor }}>
                                    {reportTemplate.header.title}
                                  </h2>
                                  <p className="text-md font-semibold text-slate-600 dark:text-slate-300 mt-2">{reportTemplate.header.subtitle}</p>
                                </div>

                                {/* Student Details Grid */}
                                <div className="px-10 pb-8">
                                  <div className="grid grid-cols-2 gap-x-12 gap-y-3 p-4 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 font-sans">
                                    <div className="flex justify-between border-b border-slate-200 dark:border-slate-700 pb-1">
                                      <span className="font-bold text-slate-600 dark:text-slate-300 text-sm">Student Name:</span>
                                      <span className="font-bold text-slate-900 dark:text-white text-sm">{row.student.firstName} {row.student.lastName}</span>
                                    </div>
                                    <div className="flex justify-between border-b border-slate-200 dark:border-slate-700 pb-1">
                                      <span className="font-bold text-slate-600 dark:text-slate-300 text-sm">Class & Section:</span>
                                      <span className="font-bold text-slate-900 dark:text-white text-sm">{reportData.className}</span>
                                    </div>
                                    <div className="flex justify-between border-b border-slate-200 dark:border-slate-700 pb-1">
                                      <span className="font-bold text-slate-600 dark:text-slate-300 text-sm">Roll No:</span>
                                      <span className="font-bold text-slate-900 dark:text-white text-sm">{row.student.admissionNumber || 'N/A'}</span>
                                    </div>

                                    {reportTemplate.studentFields.admissionNo && (
                                      <div className="flex justify-between border-b border-slate-200 dark:border-slate-700 pb-1">
                                        <span className="font-bold text-slate-600 dark:text-slate-300 text-sm">Admission No:</span>
                                        <span className="font-bold text-slate-900 dark:text-white text-sm">{row.student.admissionNumber || '-'}</span>
                                      </div>
                                    )}
                                    {reportTemplate.studentFields.dob && (
                                      <div className="flex justify-between border-b border-slate-200 dark:border-slate-700 pb-1">
                                        <span className="font-bold text-slate-600 dark:text-slate-300 text-sm">Date of Birth:</span>
                                        <span className="font-bold text-slate-900 dark:text-white text-sm">{row.student.dateOfBirth || '-'}</span>
                                      </div>
                                    )}
                                    {reportTemplate.studentFields.fatherName && (
                                      <div className="flex justify-between border-b border-slate-200 dark:border-slate-700 pb-1">
                                        <span className="font-bold text-slate-600 dark:text-slate-300 text-sm">Father's Name:</span>
                                        <span className="font-bold text-slate-900 dark:text-white text-sm">{row.student.parentName || '-'}</span>
                                      </div>
                                    )}
                                    {reportTemplate.studentFields.motherName && (
                                      <div className="flex justify-between border-b border-slate-200 dark:border-slate-700 pb-1">
                                        <span className="font-bold text-slate-600 dark:text-slate-300 text-sm">Mother's Name:</span>
                                        <span className="font-bold text-slate-900 dark:text-white text-sm">-</span>
                                      </div>
                                    )}
                                    {reportTemplate.studentFields.attendance && (
                                      <div className="flex justify-between border-b border-slate-200 dark:border-slate-700 pb-1">
                                        <span className="font-bold text-slate-600 dark:text-slate-300 text-sm">Attendance:</span>
                                        <span className="font-bold text-slate-900 dark:text-white text-sm">
                                          {row.attendanceSummary ? `${row.attendanceSummary.present} / ${row.attendanceSummary.totalSessions}` : '- / -'}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Marks Table */}
                                <div className="px-10 flex-1">
                                  <table className="w-full border-collapse font-sans text-sm">
                                    <thead>
                                      <tr className="text-white" style={{ backgroundColor: reportTemplate.themeColor }}>
                                        {(reportTemplate.grading?.columns && reportTemplate.grading.columns.length > 0) ? (
                                          reportTemplate.grading.columns.map((col, idx) => (
                                            <th key={idx} className={`border border-slate-400 p-2 ${idx === 0 ? 'text-left' : 'text-center'}`}>
                                              {col}
                                            </th>
                                          ))
                                        ) : (
                                          <>
                                            <th className="border border-slate-400 p-2 text-left">Assessment</th>
                                            <th className="border border-slate-400 p-2 text-center w-24">Max Marks</th>
                                            {['marks', 'marks_and_grades'].includes(reportTemplate.grading.style) && <th className="border border-slate-400 p-2 text-center">Marks Obt.</th>}
                                            {['grades', 'marks_and_grades'].includes(reportTemplate.grading.style) && <th className="border border-slate-400 p-2 text-center">Grade</th>}
                                          </>
                                        )}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {reportData.assessments.map((a, i) => {
                                        const markObj = row.marks?.[a.id];
                                        const mark = markObj?.obtained !== undefined ? markObj.obtained : '-';
                                        const grade = markObj?.grade || '-';
                                        const cols = reportTemplate.grading?.columns && reportTemplate.grading.columns.length > 0
                                          ? reportTemplate.grading.columns
                                          : null;

                                        return (
                                          <tr key={a.id} className={i % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-slate-50 dark:bg-slate-800'}>
                                            {cols ? (
                                              cols.map((colName, cIdx) => {
                                                if (cIdx === 0) {
                                                  return <td key={cIdx} className="border border-slate-400 p-2 font-medium">{a.title}</td>;
                                                }
                                                const lower = colName.toLowerCase();
                                                if (lower.includes('max')) {
                                                  return <td key={cIdx} className="border border-slate-400 p-2 text-center">{a.totalMarks}</td>;
                                                }
                                                if (lower.includes('grade')) {
                                                  return <td key={cIdx} className="border border-slate-400 p-2 text-center font-bold text-slate-800 dark:text-slate-100">{grade}</td>;
                                                }
                                                // Marks column
                                                return (
                                                  <td key={cIdx} className="border border-slate-400 p-2 text-center font-bold text-slate-800 dark:text-slate-100">
                                                    <div className="flex items-center justify-center gap-1.5 group">
                                                      <span>{mark}</span>
                                                      <button
                                                        onClick={() => setOverrideModal({
                                                          isOpen: true,
                                                          student: row.student,
                                                          assessment: a,
                                                          currentMarks: mark === '-' ? '' : mark,
                                                          newMarks: mark === '-' ? '' : mark,
                                                          reason: ''
                                                        })}
                                                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-500 hover:text-primary-600 transition-all text-xs print:hidden"
                                                        title="Admin Override Marks"
                                                      >
                                                        <Edit3 size={13} />
                                                      </button>
                                                    </div>
                                                  </td>
                                                );
                                              })
                                            ) : (
                                              <>
                                                <td className="border border-slate-400 p-2 font-medium">{a.title}</td>
                                                <td className="border border-slate-400 p-2 text-center">{a.totalMarks}</td>
                                                {['marks', 'marks_and_grades'].includes(reportTemplate.grading.style) && (
                                                  <td className="border border-slate-400 p-2 text-center font-bold text-slate-800 dark:text-slate-100">
                                                    <div className="flex items-center justify-center gap-1.5 group">
                                                      <span>{mark}</span>
                                                      <button
                                                        onClick={() => setOverrideModal({
                                                          isOpen: true,
                                                          student: row.student,
                                                          assessment: a,
                                                          currentMarks: mark === '-' ? '' : mark,
                                                          newMarks: mark === '-' ? '' : mark,
                                                          reason: ''
                                                        })}
                                                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-500 hover:text-primary-600 transition-all text-xs print:hidden"
                                                        title="Admin Override Marks"
                                                      >
                                                        <Edit3 size={13} />
                                                      </button>
                                                    </div>
                                                  </td>
                                                )}
                                                {['grades', 'marks_and_grades'].includes(reportTemplate.grading.style) && <td className="border border-slate-400 p-2 text-center font-bold text-slate-800 dark:text-slate-100">{grade}</td>}
                                              </>
                                            )}
                                          </tr>
                                        );
                                      })}
                                      {/* Totals */}
                                      {(reportTemplate.grading.showTotal || reportTemplate.grading.showPercentage) && (
                                        <tr className="bg-slate-100 dark:bg-slate-700 font-bold">
                                          {(reportTemplate.grading?.columns && reportTemplate.grading.columns.length > 0) ? (
                                            reportTemplate.grading.columns.map((colName, cIdx) => {
                                              if (cIdx === 0) {
                                                return <td key={cIdx} className="border border-slate-400 p-2 text-right">TOTAL</td>;
                                              }
                                              const lower = colName.toLowerCase();
                                              if (lower.includes('grade')) {
                                                return <td key={cIdx} className="border border-slate-400 p-2 text-center text-primary-700" style={{ color: reportTemplate.themeColor }}>{row.overallGrade || '-'}</td>;
                                              }
                                              if (lower.includes('max')) {
                                                return <td key={cIdx} className="border border-slate-400 p-2 text-center">{row.totalMax}</td>;
                                              }
                                              return (
                                                <td key={cIdx} className="border border-slate-400 p-2 text-center text-primary-700" style={{ color: reportTemplate.themeColor }}>
                                                  {row.totalObtained}
                                                </td>
                                              );
                                            })
                                          ) : (
                                            <>
                                              <td className="border border-slate-400 p-2 text-right">TOTAL</td>
                                              <td className="border border-slate-400 p-2 text-center">{row.totalMax}</td>
                                              {['marks', 'marks_and_grades'].includes(reportTemplate.grading.style) && <td className="border border-slate-400 p-2 text-center text-primary-700" style={{ color: reportTemplate.themeColor }}>{row.totalObtained}</td>}
                                              {['grades', 'marks_and_grades'].includes(reportTemplate.grading.style) && <td className="border border-slate-400 p-2 text-center text-primary-700" style={{ color: reportTemplate.themeColor }}>{row.overallGrade || '-'}</td>}
                                            </>
                                          )}
                                        </tr>
                                      )}
                                    </tbody>
                                  </table>
                                  
                                  {reportTemplate.grading.showPercentage && (
                                    <div className="mt-4 text-right font-sans font-bold text-lg">
                                      Percentage: <span style={{ color: reportTemplate.themeColor }}>{row.percentage}%</span>
                                    </div>
                                  )}
                                </div>

                                {/* Remarks Area */}
                                {reportTemplate.footer.remarks && (
                                  <div className="px-10 mt-8">
                                    <div className="border-2 border-slate-300 dark:border-slate-600 p-4 rounded-xl min-h-[80px]">
                                      <span className="font-bold text-sm text-slate-700 dark:text-slate-200 block mb-1">Class Teacher's Remarks:</span>
                                      <span className="text-sm font-medium italic text-slate-500 dark:text-slate-400 block h-8 border-b border-dashed border-slate-300 dark:border-slate-600"></span>
                                      <span className="text-sm font-medium italic text-slate-500 dark:text-slate-400 block h-8 border-b border-dashed border-slate-300 dark:border-slate-600 mt-2"></span>
                                    </div>
                                  </div>
                                )}

                                {/* Footer Section */}
                                <div className="px-10 pt-16 pb-8 mt-auto flex flex-col font-sans">
                                  {/* Signatures */}
                                  <div className="flex justify-between w-full mb-8">
                                    {reportTemplate.footer.signatures.map((sig, index) => (
                                      <div key={index} className="flex flex-col items-center">
                                        <div className="w-32 border-b-2 border-slate-900 mb-2"></div>
                                        <span className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase">{sig}</span>
                                      </div>
                                    ))}
                                  </div>

                                  {/* Grading Scale */}
                                  {reportTemplate.footer.gradingScaleText && (
                                    <div className="border-t border-slate-300 dark:border-slate-600 pt-4 text-center">
                                      <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest block mb-1">Grading Scale</span>
                                      <p className="text-xs text-slate-600 dark:text-slate-300 font-medium">
                                        {reportTemplate.footer.gradingScaleText}
                                      </p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Live Marks Progress Modal */}
      {viewingProgressExam && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800 shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                    {viewingProgressExam.name} — Live Marks Monitoring
                  </h2>
                  <span className={`px-2.5 py-0.5 rounded text-xs font-bold uppercase tracking-wider ${
                    viewingProgressExam.status === 'FINALIZED'
                      ? 'bg-purple-100 text-purple-800'
                      : viewingProgressExam.status === 'PUBLISHED'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}>
                    {viewingProgressExam.status || 'DRAFT'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Real-time status of staff mark-entry submissions.</p>
              </div>
              <button 
                onClick={() => { setViewingProgressExam(null); setExamProgress(null); }} 
                className="p-2 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
              {loadingProgress ? (
                <div className="py-20 flex justify-center items-center">
                  <Loader2 size={32} className="animate-spin text-primary-600" />
                </div>
              ) : !examProgress || !examProgress.progress || examProgress.progress.length === 0 ? (
                <div className="py-16 text-center text-slate-500 dark:text-slate-400">
                  <FileText size={48} className="mx-auto mb-3 text-slate-300" />
                  <p className="font-semibold text-slate-800 dark:text-slate-200">No subject assessments linked yet.</p>
                  <p className="text-xs mt-1">Create an exam specifying subjects, or publish the exam to generate tasks.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Total Subjects</span>
                      <span className="text-2xl font-black text-slate-900 dark:text-white mt-1 block">{examProgress.progress.length}</span>
                    </div>
                    <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
                      <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider block">Completed</span>
                      <span className="text-2xl font-black text-emerald-700 dark:text-emerald-300 mt-1 block">
                        {examProgress.progress.filter(p => p.completionPercentage === 100).length} / {examProgress.progress.length}
                      </span>
                    </div>
                    <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800">
                      <span className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider block">Pending / In Progress</span>
                      <span className="text-2xl font-black text-amber-700 dark:text-amber-300 mt-1 block">
                        {examProgress.progress.filter(p => p.completionPercentage < 100).length}
                      </span>
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
                    <table className="w-full text-left border-collapse text-sm">
                      <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 uppercase text-xs font-bold border-b border-slate-200 dark:border-slate-700">
                        <tr>
                          <th className="p-3.5 pl-4">Subject</th>
                          <th className="p-3.5">Assigned Staff</th>
                          <th className="p-3.5 text-center">Status</th>
                          <th className="p-3.5">Completion</th>
                          <th className="p-3.5 text-right pr-4">Entered</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {examProgress.progress.map((row) => (
                          <tr key={row.assessmentId} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                            <td className="p-3.5 pl-4 font-bold text-slate-900 dark:text-white">
                              {row.subjectName}
                              <span className="block text-xs font-normal text-slate-500">{row.className} (Max: {row.totalMarks}m)</span>
                            </td>
                            <td className="p-3.5 font-medium text-slate-700 dark:text-slate-300">
                              {row.assignedStaffName}
                              {row.assignedStaffEmail && <span className="block text-xs text-slate-400">{row.assignedStaffEmail}</span>}
                            </td>
                            <td className="p-3.5 text-center">
                              <span className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider ${
                                row.status === 'LOCKED'
                                  ? 'bg-purple-100 text-purple-800'
                                  : row.status === 'SUBMITTED'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : row.status === 'IN_PROGRESS'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-slate-100 text-slate-700'
                              }`}>
                                {row.status}
                              </span>
                            </td>
                            <td className="p-3.5 w-48">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                                  <div 
                                    className={`h-full rounded-full transition-all duration-300 ${
                                      row.completionPercentage === 100 ? 'bg-emerald-500' : 'bg-primary-600'
                                    }`}
                                    style={{ width: `${row.completionPercentage}%` }}
                                  />
                                </div>
                                <span className="font-mono text-xs font-bold w-10 text-right">{row.completionPercentage}%</span>
                              </div>
                            </td>
                            <td className="p-3.5 pr-4 text-right font-mono text-xs font-bold text-slate-600 dark:text-slate-300">
                              {row.gradesEntered} / {row.totalStudents}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-800 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center">
              <span className="text-xs text-slate-500">Live sync is active. Updates from teachers reflect automatically.</span>
              <button
                onClick={() => { setViewingProgressExam(null); setExamProgress(null); }}
                className="px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl hover:bg-slate-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Override Marks Modal */}
      {overrideModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-fade-in-up">
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800">
              <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <Edit3 size={18} className="text-amber-600" /> Admin Mark Override
              </h3>
              <button 
                onClick={() => setOverrideModal({ isOpen: false, student: null, assessment: null, currentMarks: '', newMarks: '', reason: '' })}
                className="p-1.5 text-slate-400 hover:bg-slate-200 rounded-full"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-800 dark:text-amber-300 font-medium">
                Administrative overrides are recorded in the institutional audit log and can alter locked grades.
              </div>

              <div>
                <span className="text-xs text-slate-500 font-bold uppercase block">Student</span>
                <span className="text-sm font-bold text-slate-900 dark:text-white">
                  {overrideModal.student?.firstName} {overrideModal.student?.lastName} ({overrideModal.student?.admissionNumber})
                </span>
              </div>

              <div>
                <span className="text-xs text-slate-500 font-bold uppercase block">Subject / Assessment</span>
                <span className="text-sm font-bold text-slate-900 dark:text-white">
                  {overrideModal.assessment?.title} (Max: {overrideModal.assessment?.totalMarks}m)
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">New Marks Obtained</label>
                <input
                  type="number"
                  min="0"
                  max={overrideModal.assessment?.totalMarks || 100}
                  value={overrideModal.newMarks}
                  onChange={(e) => setOverrideModal(prev => ({ ...prev, newMarks: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 font-mono font-bold text-base focus:ring-2 focus:ring-primary-500"
                  placeholder="e.g. 85"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Reason for Override <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  value={overrideModal.reason}
                  onChange={(e) => setOverrideModal(prev => ({ ...prev, reason: e.target.value }))}
                  placeholder="e.g. Recount approved by Principal, re-evaluation request #102"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-800 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOverrideModal({ isOpen: false, student: null, assessment: null, currentMarks: '', newMarks: '', reason: '' })}
                className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-xl text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveOverride}
                disabled={savingOverride}
                className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                {savingOverride ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                {savingOverride ? 'Saving...' : 'Confirm Override'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Exam Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-3xl shadow-2xl overflow-hidden animate-fade-in-up flex flex-col max-h-[92vh]">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800 shrink-0">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <FileText className="text-primary-600" /> Create Exam & Configure Subjects
              </h2>
              <button onClick={() => setShowCreateModal(false)} className="p-2 text-slate-400 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateExam} className="flex-1 overflow-y-auto custom-scrollbar flex flex-col">
              <div className="p-6 space-y-6 flex-1">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Exam Name *</label>
                  <input 
                    type="text" required
                    value={newExam.name}
                    onChange={(e) => setNewExam({...newExam, name: e.target.value})}
                    placeholder="e.g. Mid-Term Examination 2026"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Exam Type</label>
                    <select
                      value={newExam.examType}
                      onChange={(e) => setNewExam({...newExam, examType: e.target.value})}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                    >
                      <option value="Unit Test">Unit Test</option>
                      <option value="Mid-term">Mid-term</option>
                      <option value="Semester">Semester</option>
                      <option value="Model">Model</option>
                      <option value="Final">Final</option>
                      <option value="Custom Exam">Custom Exam</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Term (Optional)</label>
                    <input 
                      type="text"
                      value={newExam.term || ''}
                      onChange={(e) => setNewExam({...newExam, term: e.target.value})}
                      placeholder="e.g. Term 1, Semester 1"
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Target Class</label>
                    <select
                      value={newExam.classId}
                      onChange={(e) => handleCreateClassChange(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                    >
                      <option value="">-- All Classes / Unassigned --</option>
                      {classes.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Target Section (Optional)</label>
                    <select
                      value={newExam.sectionId}
                      onChange={(e) => setNewExam({...newExam, sectionId: e.target.value})}
                      disabled={!newExam.classId}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 disabled:opacity-50"
                    >
                      <option value="">-- All Sections --</option>
                      {selectedClassSections.map(sec => (
                        <option key={sec.id} value={sec.id}>Section {sec.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Start Date</label>
                    <input 
                      type="date"
                      value={newExam.startDate}
                      onChange={(e) => setNewExam({...newExam, startDate: e.target.value})}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">End Date</label>
                    <input 
                      type="date"
                      value={newExam.endDate}
                      min={newExam.startDate}
                      onChange={(e) => setNewExam({...newExam, endDate: e.target.value})}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900"
                    />
                  </div>
                </div>

                {/* Subject Configuration Table */}
                <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex justify-between items-center mb-3">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white">Subjects & Mark Scheme</h4>
                      <p className="text-xs text-slate-500">Configured subjects will automatically generate teacher grading assessments upon exam publish.</p>
                    </div>
                    {allSubjects.length > 0 && (
                      <select
                        onChange={(e) => {
                          if (e.target.value) {
                            handleAddSubjectConfig(e.target.value);
                            e.target.value = '';
                          }
                        }}
                        className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 font-semibold"
                        defaultValue=""
                      >
                        <option value="" disabled>+ Add Subject</option>
                        {allSubjects.map(sub => (
                          <option key={sub.id} value={sub.id}>{sub.name}</option>
                        ))}
                      </select>
                    )}
                  </div>

                  {newExam.subjectsConfig.length === 0 ? (
                    <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl text-center text-xs text-slate-500">
                      Select a class or use "+ Add Subject" to specify subjects for this exam.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {newExam.subjectsConfig.map((sc, idx) => (
                        <div key={sc.subjectId || idx} className="grid grid-cols-12 gap-2 items-center p-2.5 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
                          <span className="col-span-4 font-bold text-slate-900 dark:text-white truncate">
                            {sc.subjectName || 'Subject'}
                          </span>
                          <div className="col-span-2">
                            <label className="text-[10px] text-slate-400 block font-semibold">Max</label>
                            <input
                              type="number"
                              min="1"
                              value={sc.maxMarks}
                              onChange={(e) => handleSubjectConfigChange(idx, 'maxMarks', e.target.value)}
                              className="w-full px-2 py-1 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-bold"
                            />
                          </div>
                          <div className="col-span-2">
                            <label className="text-[10px] text-slate-400 block font-semibold">Pass</label>
                            <input
                              type="number"
                              min="0"
                              value={sc.passMarks}
                              onChange={(e) => handleSubjectConfigChange(idx, 'passMarks', e.target.value)}
                              className="w-full px-2 py-1 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-bold"
                            />
                          </div>
                          <div className="col-span-3">
                            <label className="text-[10px] text-slate-400 block font-semibold">Weightage %</label>
                            <input
                              type="number"
                              min="1"
                              max="100"
                              value={sc.weightage}
                              onChange={(e) => handleSubjectConfigChange(idx, 'weightage', e.target.value)}
                              className="w-full px-2 py-1 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-bold"
                            />
                          </div>
                          <div className="col-span-1 text-right">
                            <button
                              type="button"
                              onClick={() => handleRemoveSubjectConfig(idx)}
                              className="p-1 text-red-500 hover:bg-red-50 rounded"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="p-6 bg-slate-50 dark:bg-slate-800 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3 shrink-0">
                <button type="button" onClick={() => setShowCreateModal(false)} className="px-5 py-2.5 text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-200 dark:hover:bg-slate-600 rounded-xl transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={creating} className="w-full sm:w-auto flex justify-center items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700 rounded-xl shadow-sm transition-colors">
                  {creating ? 'Saving...' : 'Create Exam'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
