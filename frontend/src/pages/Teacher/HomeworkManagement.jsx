import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  listHomework,
  getHomework,
  createHomework,
  updateHomework,
  deleteHomework,
  updateSubmission
} from '../../api/homework';
import { listClasses } from '../../api/classes';
import { listSubjects } from '../../api/subjects';
import {
  LuPlus as Plus,
  LuUpload as Upload,
  LuFileText as FileText,
  LuSearch as Search,
  LuX as X,
  LuCircleCheck as CheckCircle,
  LuFileDown as FileDown,
  LuPaperclip as Paperclip,
  LuTrash2 as Trash2,
  LuRefreshCw as RefreshCw,
  LuPencil as Edit
} from 'react-icons/lu';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import { TableSkeleton } from '../../components/Skeleton';
import { uploadFileToCloudinaryOrFirebase } from '../../utils/cloudinary';
import usePermissions from '../../hooks/usePermissions';
import { sortClassesAscending } from '../../utils/classSorting';

export default function HomeworkManagement() {
  const { userProfile } = useAuth();
  const schoolId = userProfile?.schoolId;
  const { canCreate, canEdit, canDelete } = usePermissions();
  const hasCreatePermission = userProfile?.role?.toLowerCase() === 'admin' || userProfile?.role?.toLowerCase() === 'superadmin' || canCreate('homework');
  const hasEditPermission = userProfile?.role?.toLowerCase() === 'admin' || userProfile?.role?.toLowerCase() === 'superadmin' || canEdit('homework');
  const hasDeletePermission = userProfile?.role?.toLowerCase() === 'admin' || userProfile?.role?.toLowerCase() === 'superadmin' || canDelete('homework');

  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [homeworks, setHomeworks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClassFilter, setSelectedClassFilter] = useState('');

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showExcelModal, setShowExcelModal] = useState(false);
  const [showTrackingModal, setShowTrackingModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const [selectedHomework, setSelectedHomework] = useState(null);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Form states
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);

  const [newHomework, setNewHomework] = useState({
    title: '',
    description: '',
    classId: '',
    subjectId: '',
    dueDate: '',
    remarks: '',
    maxMarks: 100,
    attachment: null,
  });

  const [editingHomework, setEditingHomework] = useState(null);
  const [excelFile, setExcelFile] = useState(null);
  const [exportFileName, setExportFileName] = useState('');
  const [selectedFields, setSelectedFields] = useState({
    studentName: true,
    admissionNumber: true,
    rollNumber: true,
    status: true,
    grade: true,
    feedback: true,
    lastUpdated: true
  });

  const availableFieldsList = [
    { key: 'studentName', label: 'Student Name' },
    { key: 'admissionNumber', label: 'Admission Number' },
    { key: 'rollNumber', label: 'Roll Number' },
    { key: 'status', label: 'Submission Status' },
    { key: 'grade', label: 'Grade / Marks' },
    { key: 'feedback', label: 'Feedback' },
    { key: 'lastUpdated', label: 'Last Updated' }
  ];

  // ============================================================
  // DATA FETCHING (REST FOR HOMEWORK, CLASSES, AND SUBJECTS)
  // ============================================================

  const fetchMetadata = useCallback(async () => {
    if (!schoolId) return;
    try {
      const [classesRes, subjectsRes] = await Promise.all([
        listClasses({ limit: 100 }),
        listSubjects({ limit: 100 })
      ]);

      if (classesRes?.data) {
        setClasses(sortClassesAscending(classesRes.data));
      } else if (Array.isArray(classesRes)) {
        setClasses(sortClassesAscending(classesRes));
      }

      if (subjectsRes?.data) {
        setSubjects(subjectsRes.data);
      } else if (Array.isArray(subjectsRes)) {
        setSubjects(subjectsRes);
      }
    } catch (err) {
      console.error('Error fetching classes/subjects metadata:', err);
      toast.error('Failed to load classes or subjects');
    }
  }, [schoolId]);

  const fetchHomeworkList = useCallback(async (silent = false) => {
    if (!schoolId) return;
    if (!silent) setLoading(true);
    try {
      const res = await listHomework();
      if (res && res.data) {
        setHomeworks(res.data);
      } else if (Array.isArray(res)) {
        setHomeworks(res);
      } else {
        setHomeworks([]);
      }
    } catch (err) {
      console.error('Error fetching homework from REST API:', err);
      toast.error(err.message || 'Failed to load homework assignments');
      setHomeworks([]);
    } finally {
      if (!silent) setLoading(false);
      setRefreshing(false);
    }
  }, [schoolId]);

  useEffect(() => {
    if (!schoolId) return;

    fetchMetadata();
    fetchHomeworkList();
  }, [schoolId, fetchMetadata, fetchHomeworkList]);

  // ============================================================
  // FILE VALIDATION
  // ============================================================

  const validateFile = (file) => {
    if (!file) return true;
    const maxSize = 3 * 1024 * 1024; // 3MB
    if (file.size > maxSize) {
      toast.error('File size must not exceed 3 MB.');
      return false;
    }
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const extensionMatches = file.name.match(/\.(pdf|jpg|jpeg|png|webp)$/i);
    if (!allowedTypes.includes(file.type) && !extensionMatches) {
      toast.error('Only PDF, JPG, JPEG, PNG, and WEBP files are allowed.');
      return false;
    }
    return true;
  };

  // ============================================================
  // CREATE HOMEWORK (POST /api/v1/homework)
  // ============================================================

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newHomework.title.trim()) {
      toast.error('Please enter a homework title.');
      return;
    }
    if (!newHomework.classId) {
      toast.error('Please select a class.');
      return;
    }
    if (!newHomework.subjectId) {
      toast.error('Please select a subject.');
      return;
    }
    if (!newHomework.dueDate) {
      toast.error('Please specify a valid due date (YYYY-MM-DD).');
      return;
    }

    if (newHomework.attachment && !validateFile(newHomework.attachment)) {
      return;
    }

    setCreating(true);
    try {
      let attachments = [];
      if (newHomework.attachment) {
        const safeFileName = newHomework.attachment.name.replace(/[^a-z0-9.]/gi, '_');
        const fallbackPath = `HomeworkAttachments/${schoolId}/${Date.now()}_${safeFileName}`;
        const attachmentUrl = await uploadFileToCloudinaryOrFirebase(newHomework.attachment, schoolId, fallbackPath);
        if (attachmentUrl) {
          attachments.push({
            name: newHomework.attachment.name,
            url: attachmentUrl,
            size: newHomework.attachment.size
          });
        }
      }

      await createHomework({
        title: newHomework.title.trim(),
        description: newHomework.description?.trim() || null,
        classId: newHomework.classId,
        subjectId: newHomework.subjectId,
        dueDate: newHomework.dueDate,
        remarks: newHomework.remarks?.trim() || '',
        maxMarks: Number(newHomework.maxMarks) || 100,
        attachments
      });

      toast.success('Homework assigned successfully!');
      setShowCreateModal(false);
      setNewHomework({
        title: '',
        description: '',
        classId: '',
        subjectId: '',
        dueDate: '',
        remarks: '',
        maxMarks: 100,
        attachment: null
      });
      await fetchHomeworkList(true);
    } catch (err) {
      console.error('Error creating homework:', err);
      toast.error(err.message || 'Failed to create homework assignment');
    } finally {
      setCreating(false);
    }
  };

  // ============================================================
  // EDIT / UPDATE HOMEWORK (PUT /api/v1/homework/:id)
  // ============================================================

  const openEditModal = (hw) => {
    const existingAttachments = hw.attachments || [];
    const firstUrl = existingAttachments[0]?.url || hw.attachmentUrl || '';
    setEditingHomework({
      id: hw.id,
      title: hw.title || '',
      description: hw.description || '',
      classId: hw.classId || '',
      subjectId: hw.subjectId || '',
      dueDate: hw.dueDate || '',
      remarks: hw.remarks || '',
      maxMarks: hw.maxMarks || 100,
      attachments: existingAttachments,
      attachmentUrl: firstUrl,
      attachment: null
    });
    setShowEditModal(true);
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!editingHomework.title.trim()) {
      toast.error('Please enter a homework title.');
      return;
    }
    if (!editingHomework.classId) {
      toast.error('Please select a class.');
      return;
    }
    if (!editingHomework.subjectId) {
      toast.error('Please select a subject.');
      return;
    }
    if (!editingHomework.dueDate) {
      toast.error('Please specify a valid due date.');
      return;
    }

    if (editingHomework.attachment && !validateFile(editingHomework.attachment)) {
      return;
    }

    setUpdating(true);
    try {
      let attachments = [...(editingHomework.attachments || [])];
      
      if (editingHomework.attachment) {
        const safeFileName = editingHomework.attachment.name.replace(/[^a-z0-9.]/gi, '_');
        const fallbackPath = `HomeworkAttachments/${schoolId}/${Date.now()}_${safeFileName}`;
        const attachmentUrl = await uploadFileToCloudinaryOrFirebase(editingHomework.attachment, schoolId, fallbackPath);
        if (attachmentUrl) {
          attachments = [{
            name: editingHomework.attachment.name,
            url: attachmentUrl,
            size: editingHomework.attachment.size
          }];
        }
      } else if (!editingHomework.attachmentUrl) {
        attachments = [];
      }

      await updateHomework(editingHomework.id, {
        title: editingHomework.title.trim(),
        description: editingHomework.description?.trim() || null,
        classId: editingHomework.classId,
        subjectId: editingHomework.subjectId,
        dueDate: editingHomework.dueDate,
        remarks: editingHomework.remarks?.trim() || '',
        maxMarks: Number(editingHomework.maxMarks) || 100,
        attachments
      });

      toast.success('Homework updated successfully!');
      setShowEditModal(false);
      setEditingHomework(null);
      await fetchHomeworkList(true);
    } catch (err) {
      console.error('Error updating homework:', err);
      toast.error(err.message || 'Failed to update homework assignment');
    } finally {
      setUpdating(false);
    }
  };

  // ============================================================
  // DELETE HOMEWORK (DELETE /api/v1/homework/:id)
  // ============================================================

  const confirmDelete = (hwId) => {
    setDeletingId(hwId);
    setShowDeleteModal(true);
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    setDeleting(true);
    try {
      await deleteHomework(deletingId);
      toast.success('Homework assignment deleted successfully!');
      setShowDeleteModal(false);
      setDeletingId(null);
      await fetchHomeworkList(true);
    } catch (err) {
      console.error('Error deleting homework:', err);
      toast.error(err.message || 'Failed to delete homework assignment');
    } finally {
      setDeleting(false);
    }
  };

  // ============================================================
  // TRACKING MODAL (GET /api/v1/homework/:id)
  // ============================================================

  const openTracking = async (hw) => {
    setSelectedHomework(hw);
    setShowTrackingModal(true);
    setTrackingLoading(true);
    try {
      const res = await getHomework(hw.id);
      if (res && res.data) {
        setSelectedHomework(res.data);
      }
    } catch (err) {
      console.error('Error loading homework details and roster:', err);
      toast.error(err.message || 'Failed to load student roster');
    } finally {
      setTrackingLoading(false);
    }
  };

  // ============================================================
  // SUBMISSION EVALUATION (PATCH /api/v1/homework/:id/submissions/:studentId)
  // ============================================================

  const handleUpdateStudentSubmission = async (studentId, status, grade = null, feedback = null) => {
    if (!selectedHomework) return;
    try {
      await updateSubmission(selectedHomework.id, studentId, {
        status,
        grade: grade !== null ? grade : undefined,
        feedback: feedback !== null ? feedback : undefined
      });
      toast.success('Student submission updated!');
      
      // Update local state roster
      setSelectedHomework(prev => {
        if (!prev) return prev;
        const currentRoster = prev.roster || [];
        const updatedRoster = currentRoster.map(s => {
          if (s.studentId === studentId) {
            return {
              ...s,
              status,
              grade: grade !== null ? grade : s.grade,
              feedback: feedback !== null ? feedback : s.feedback,
              lastUpdated: new Date().toISOString()
            };
          }
          return s;
        });

        // Recalculate summary counts
        let subCount = 0, compCount = 0, progCount = 0, notCount = 0;
        updatedRoster.forEach(r => {
          if (r.status === 'Submitted') subCount++;
          else if (r.status === 'Completed') compCount++;
          else if (r.status === 'In Progress') progCount++;
          else notCount++;
        });

        return {
          ...prev,
          roster: updatedRoster,
          submittedCount: subCount,
          completedCount: compCount,
          inProgressCount: progCount,
          notStartedCount: notCount
        };
      });
    } catch (err) {
      console.error('Error updating student submission:', err);
      toast.error(err.message || 'Failed to update student submission');
    }
  };

  // ============================================================
  // EXCEL EVALUATION UPLOAD
  // ============================================================

  const handleExcelUpload = async (e) => {
    e.preventDefault();
    if (!excelFile) {
      toast.error('Please select an Excel file.');
      return;
    }

    setCreating(true);
    try {
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const bstr = evt.target.result;
          const wb = XLSX.read(bstr, { type: 'binary' });
          const wsname = wb.SheetNames[0];
          const ws = wb.Sheets[wsname];
          const data = XLSX.utils.sheet_to_json(ws);

          if (!data || data.length === 0) {
            toast.error('Excel sheet is empty.');
            setCreating(false);
            return;
          }

          let successCount = 0;
          const roster = selectedHomework?.roster || [];

          for (const row of data) {
            const admNo = String(row['Admission Number'] || row['AdmissionNo'] || row['ADM'] || '').trim();
            const statusVal = row['Status'] || row['Submission Status'] || 'Completed';
            const gradeVal = row['Grade'] || row['Marks'] || '';
            const feedbackVal = row['Feedback'] || row['Remarks'] || '';
            const hwTitle = row['Homework Title'] || row['Title'];

            let targetHwId = selectedHomework?.id;
            if (!targetHwId && hwTitle) {
              const matchedHw = homeworks.find(h => h.title.toLowerCase() === String(hwTitle).trim().toLowerCase());
              if (matchedHw) targetHwId = matchedHw.id;
            }

            if (!targetHwId) continue;

            let targetStudentId = null;
            if (roster.length > 0) {
              const matchedStudent = roster.find(s => String(s.admissionNumber).trim() === admNo);
              if (matchedStudent) targetStudentId = matchedStudent.studentId;
            }

            if (targetStudentId) {
              try {
                await updateSubmission(targetHwId, targetStudentId, {
                  status: statusVal,
                  grade: gradeVal ? String(gradeVal) : null,
                  feedback: feedbackVal ? String(feedbackVal) : null
                });
                successCount++;
              } catch (subErr) {
                console.warn(`Failed to update student ${admNo}:`, subErr);
              }
            }
          }

          toast.success(`Processed and updated ${successCount} student records successfully!`);
          setShowExcelModal(false);
          setExcelFile(null);
          
          if (selectedHomework) {
            const refreshed = await getHomework(selectedHomework.id);
            if (refreshed?.data) setSelectedHomework(refreshed.data);
          }
          fetchHomeworkList(true);
        } catch (parseErr) {
          console.error('Error parsing excel:', parseErr);
          toast.error('Failed to parse Excel file.');
        } finally {
          setCreating(false);
        }
      };
      reader.readAsBinaryString(excelFile);
    } catch (err) {
      console.error(err);
      toast.error('Failed to process Excel file.');
      setCreating(false);
    }
  };

  // ============================================================
  // EXPORT TO EXCEL
  // ============================================================

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
    const roster = selectedHomework?.roster || [];
    if (roster.length === 0) {
      toast.error('No student submission data available to export.');
      return;
    }

    const activeFields = Object.keys(selectedFields).filter(k => selectedFields[k]);
    if (activeFields.length === 0) {
      toast.error('Please select at least one column to export.');
      return;
    }

    const exportData = roster.map((student, index) => {
      const row = { 'S.No': index + 1 };
      if (selectedFields.studentName) row['Student Name'] = student.studentName || '';
      if (selectedFields.admissionNumber) row['Admission Number'] = student.admissionNumber || '';
      if (selectedFields.rollNumber) row['Roll Number'] = student.rollNumber || '';
      if (selectedFields.status) row['Submission Status'] = student.status || 'Not Started';
      if (selectedFields.grade) row['Grade / Marks'] = student.grade || '';
      if (selectedFields.feedback) row['Feedback'] = student.feedback || '';
      if (selectedFields.lastUpdated) {
        row['Last Updated'] = student.lastUpdated ? new Date(student.lastUpdated).toLocaleString() : 'N/A';
      }
      return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Submissions');

    const rawName = exportFileName.trim() || (selectedHomework ? selectedHomework.title.replace(/\s+/g, '_') : 'Homework') + '_Submissions';
    const finalFileName = rawName.toLowerCase().endsWith('.xlsx') ? rawName : `${rawName}.xlsx`;

    XLSX.writeFile(workbook, finalFileName);
    setShowExportModal(false);
    toast.success('Submissions roster exported successfully!');
  };

  // Filtered homework items
  const filteredHomeworks = homeworks.filter(hw => {
    const matchesSearch = !searchQuery || 
      hw.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      hw.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      hw.subjectName?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesClass = !selectedClassFilter || hw.classId === selectedClassFilter;
    return matchesSearch && matchesClass;
  });

  if (loading) {
    return (
      <div className="p-8 max-w-7xl mx-auto animate-fade-in-up">
        <TableSkeleton rows={5} columns={4} />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto animate-fade-in-up min-w-0 w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4 w-full">
        <div className="min-w-0">
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight truncate">
            Homework Management
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Assign tasks, manage submissions, and evaluate student progress.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto">
          <button
            onClick={() => { setRefreshing(true); fetchHomeworkList(false); }}
            disabled={refreshing}
            className="p-2.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors font-semibold"
            title="Refresh list"
          >
            <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
          </button>
          {hasCreatePermission && (
            <button
              onClick={() => setShowExcelModal(true)}
              className="w-full sm:w-auto justify-center flex items-center gap-2 bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 px-4 py-2.5 rounded-xl hover:bg-emerald-200 dark:hover:bg-emerald-900 transition-colors font-semibold"
            >
              <Upload size={18} />
              Evaluate via Excel
            </button>
          )}
          {hasCreatePermission && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="w-full sm:w-auto justify-center flex items-center gap-2 bg-primary-600 text-white px-4 py-2.5 rounded-xl hover:bg-primary-700 transition-colors font-semibold shadow-sm shadow-primary-600/20"
            >
              <Plus size={18} />
              Assign Homework
            </button>
          )}
        </div>
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3.5 top-3 text-slate-400 dark:text-slate-300" />
          <input
            type="text"
            placeholder="Search homework by title, description, or subject..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none text-sm font-semibold text-slate-800 dark:text-slate-100"
          />
        </div>
        {classes.length > 0 && (
          <select
            value={selectedClassFilter}
            onChange={(e) => setSelectedClassFilter(e.target.value)}
            className="px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none text-sm font-semibold text-slate-800 dark:text-slate-100"
          >
            <option value="">All Classes</option>
            {classes.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}{c.section ? ` - Section ${c.section}` : ''}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Homework Cards Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredHomeworks.length === 0 ? (
          <div className="col-span-full p-12 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <FileText size={48} className="mx-auto text-slate-300 mb-4" />
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">No homework assigned yet</h3>
            <p className="text-slate-500 dark:text-slate-400 mt-1">
              {searchQuery || selectedClassFilter
                ? 'No assignments match the selected filters.'
                : 'Click the button above to assign your first homework.'}
            </p>
          </div>
        ) : (
          filteredHomeworks.map(hw => {
            const cls = classes.find(c => c.id === hw.classId);
            const classNameDisplay = hw.className || (cls ? `${cls.name}${cls.section ? ` - ${cls.section}` : ''}` : 'Assigned Class');
            const sub = subjects.find(s => s.id === hw.subjectId);
            const subjectDisplay = hw.subjectName || (sub ? sub.name : (hw.subjectCode || 'General Subject'));
            const firstAttachmentUrl = hw.attachments?.[0]?.url || hw.attachmentUrl;

            return (
              <div
                key={hw.id}
                onClick={() => openTracking(hw)}
                className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group cursor-pointer flex flex-col justify-between"
              >
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <FileText size={64} className="text-primary-600 transform rotate-12" />
                </div>
                <div className="relative z-10">
                  <div className="flex justify-between items-start mb-4">
                    <span className="px-3 py-1 bg-primary-50 dark:bg-primary-950/60 text-primary-700 dark:text-primary-300 rounded-full text-xs font-bold">
                      {classNameDisplay} • {subjectDisplay}
                    </span>
                    <span className="text-xs font-semibold text-slate-400 dark:text-slate-300 flex items-center gap-2">
                      {firstAttachmentUrl && <Paperclip size={14} className="text-primary-500" />}
                      Due: {hw.dueDate ? new Date(hw.dueDate).toLocaleDateString('en-GB') : 'No date'}
                    </span>
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">{hw.title}</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-300 mb-4 line-clamp-2">
                    {hw.description || 'No description provided.'}
                  </p>

                  {/* Submission Summary Badges */}
                  <div className="grid grid-cols-3 gap-2 py-3 border-t border-slate-100 dark:border-slate-800 text-center">
                    <div className="bg-emerald-50 dark:bg-emerald-950/40 p-2 rounded-xl">
                      <span className="text-xs text-emerald-600 dark:text-emerald-400 font-bold block">Submitted</span>
                      <span className="text-sm font-extrabold text-emerald-700 dark:text-emerald-300">
                        {hw.submittedCount || 0}
                      </span>
                    </div>
                    <div className="bg-blue-50 dark:bg-blue-950/40 p-2 rounded-xl">
                      <span className="text-xs text-blue-600 dark:text-blue-400 font-bold block">Completed</span>
                      <span className="text-sm font-extrabold text-blue-700 dark:text-blue-300">
                        {hw.completedCount || 0}
                      </span>
                    </div>
                    <div className="bg-amber-50 dark:bg-amber-950/40 p-2 rounded-xl">
                      <span className="text-xs text-amber-600 dark:text-amber-400 font-bold block">In Progress</span>
                      <span className="text-sm font-extrabold text-amber-700 dark:text-amber-300">
                        {hw.inProgressCount || 0}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800 relative z-10 mt-2">
                  <span className="text-sm font-medium text-emerald-600 flex items-center gap-1">
                    <CheckCircle size={16} /> Active
                  </span>
                  <div className="flex items-center gap-3">
                    {hasEditPermission && (
                      <button
                        onClick={(e) => { e.stopPropagation(); openEditModal(hw); }}
                        className="text-xs font-bold text-amber-600 hover:text-amber-700 flex items-center gap-1"
                      >
                        <Edit size={13} /> Edit
                      </button>
                    )}
                    {hasDeletePermission && (
                      <button
                        onClick={(e) => { e.stopPropagation(); confirmDelete(hw.id); }}
                        className="text-xs font-bold text-red-500 hover:text-red-700 flex items-center gap-1"
                      >
                        <Trash2 size={13} /> Delete
                      </button>
                    )}
                    <span className="text-xs font-bold text-primary-600 group-hover:underline">
                      Roster &rarr;
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ============================================================ */}
      {/* CREATE MODAL */}
      {/* ============================================================ */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 z-50">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl animate-fade-in-up">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">New Homework Assignment</h2>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto custom-scrollbar">
                <div className="space-y-1">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-200">Homework Title *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Chapter 4 Polynomials Exercise 4.2"
                    value={newHomework.title}
                    onChange={(e) => setNewHomework({ ...newHomework, title: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 text-sm font-semibold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-200">Description</label>
                  <textarea
                    rows="3"
                    placeholder="Provide detailed instructions or problem numbers..."
                    value={newHomework.description}
                    onChange={(e) => setNewHomework({ ...newHomework, description: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 text-sm font-semibold"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-bold text-slate-700 dark:text-slate-200">Class *</label>
                    <select
                      required
                      value={newHomework.classId}
                      onChange={(e) => setNewHomework({ ...newHomework, classId: e.target.value })}
                      className="w-full px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none bg-white dark:bg-slate-800 text-sm font-semibold text-slate-800 dark:text-slate-100"
                    >
                      <option value="">Select a Class</option>
                      {classes.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name}{c.section ? ` - Section ${c.section}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-sm font-bold text-slate-700 dark:text-slate-200">Subject *</label>
                    <select
                      required
                      value={newHomework.subjectId}
                      onChange={(e) => setNewHomework({ ...newHomework, subjectId: e.target.value })}
                      className="w-full px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none bg-white dark:bg-slate-800 text-sm font-semibold text-slate-800 dark:text-slate-100"
                    >
                      <option value="">Select a Subject</option>
                      {subjects.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.name}{s.code ? ` (${s.code})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-bold text-slate-700 dark:text-slate-200">Due Date *</label>
                    <input
                      type="date"
                      required
                      value={newHomework.dueDate}
                      onChange={(e) => setNewHomework({ ...newHomework, dueDate: e.target.value })}
                      className="w-full px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 text-sm font-semibold"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-bold text-slate-700 dark:text-slate-200">Max Marks</label>
                    <input
                      type="number"
                      min="0"
                      value={newHomework.maxMarks}
                      onChange={(e) => setNewHomework({ ...newHomework, maxMarks: parseInt(e.target.value) || 0 })}
                      className="w-full px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 text-sm font-semibold"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-200">Remarks / Instructions</label>
                  <input
                    type="text"
                    placeholder="e.g. Bring notebooks on Monday"
                    value={newHomework.remarks}
                    onChange={(e) => setNewHomework({ ...newHomework, remarks: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 text-sm font-semibold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-200">Attachment (Optional)</label>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">Max size: 3MB. Allowed: PDF, JPG, PNG, WEBP.</p>
                  <div className="flex items-center gap-3">
                    <label className="cursor-pointer px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-semibold flex items-center gap-2">
                      <Upload size={16} />
                      Choose File
                      <input
                        type="file"
                        className="hidden"
                        accept=".jpg,.jpeg,.png,.webp,.pdf"
                        onChange={(e) => setNewHomework({ ...newHomework, attachment: e.target.files[0] })}
                      />
                    </label>
                    <span className="text-sm text-slate-600 dark:text-slate-300 font-medium truncate max-w-[200px]">
                      {newHomework.attachment ? newHomework.attachment.name : 'No file chosen'}
                    </span>
                    {newHomework.attachment && (
                      <button
                        type="button"
                        onClick={() => setNewHomework({ ...newHomework, attachment: null })}
                        className="p-1 hover:bg-red-50 text-red-500 rounded-lg transition-colors"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-5 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-5 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-bold shadow-md shadow-primary-600/10 transition-colors disabled:opacity-50"
                >
                  {creating ? 'Creating...' : 'Create Assignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* EDIT MODAL */}
      {/* ============================================================ */}
      {showEditModal && editingHomework && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 z-50">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl animate-fade-in-up">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Edit Homework Assignment</h2>
              <button onClick={() => setShowEditModal(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleUpdate}>
              <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto custom-scrollbar">
                <div className="space-y-1">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-200">Homework Title *</label>
                  <input
                    type="text"
                    required
                    value={editingHomework.title}
                    onChange={(e) => setEditingHomework({ ...editingHomework, title: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 text-sm font-semibold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-200">Description</label>
                  <textarea
                    rows="3"
                    value={editingHomework.description || ''}
                    onChange={(e) => setEditingHomework({ ...editingHomework, description: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 text-sm font-semibold"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-bold text-slate-700 dark:text-slate-200">Class *</label>
                    <select
                      required
                      value={editingHomework.classId}
                      onChange={(e) => setEditingHomework({ ...editingHomework, classId: e.target.value })}
                      className="w-full px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none bg-white dark:bg-slate-800 text-sm font-semibold text-slate-800 dark:text-slate-100"
                    >
                      <option value="">Select a Class</option>
                      {classes.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name}{c.section ? ` - Section ${c.section}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-sm font-bold text-slate-700 dark:text-slate-200">Subject *</label>
                    <select
                      required
                      value={editingHomework.subjectId}
                      onChange={(e) => setEditingHomework({ ...editingHomework, subjectId: e.target.value })}
                      className="w-full px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none bg-white dark:bg-slate-800 text-sm font-semibold text-slate-800 dark:text-slate-100"
                    >
                      <option value="">Select a Subject</option>
                      {subjects.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.name}{s.code ? ` (${s.code})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-bold text-slate-700 dark:text-slate-200">Due Date *</label>
                    <input
                      type="date"
                      required
                      value={editingHomework.dueDate}
                      onChange={(e) => setEditingHomework({ ...editingHomework, dueDate: e.target.value })}
                      className="w-full px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 text-sm font-semibold"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-bold text-slate-700 dark:text-slate-200">Max Marks</label>
                    <input
                      type="number"
                      min="0"
                      value={editingHomework.maxMarks || ''}
                      onChange={(e) => setEditingHomework({ ...editingHomework, maxMarks: parseInt(e.target.value) || 0 })}
                      className="w-full px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 text-sm font-semibold"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-200">Remarks / Instructions</label>
                  <input
                    type="text"
                    value={editingHomework.remarks || ''}
                    onChange={(e) => setEditingHomework({ ...editingHomework, remarks: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 text-sm font-semibold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-200">Attachment (Optional)</label>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">Max size: 3MB. Allowed: PDF, JPG, PNG, WEBP.</p>

                  {editingHomework.attachmentUrl && !editingHomework.attachment && (
                    <div className="flex items-center gap-2 mb-3 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                      <Paperclip size={16} className="text-primary-500" />
                      <a href={editingHomework.attachmentUrl} target="_blank" rel="noreferrer" className="text-sm text-primary-600 font-bold hover:underline truncate flex-1">
                        View Current Attachment
                      </a>
                      <button
                        type="button"
                        onClick={() => setEditingHomework({ ...editingHomework, attachmentUrl: '', attachments: [] })}
                        className="text-xs font-bold text-red-500 hover:underline px-2 py-1"
                      >
                        Remove
                      </button>
                    </div>
                  )}

                  <div className="flex items-center gap-3">
                    <label className="cursor-pointer px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-semibold flex items-center gap-2">
                      <Upload size={16} />
                      Choose New File
                      <input
                        type="file"
                        className="hidden"
                        accept=".jpg,.jpeg,.png,.webp,.pdf"
                        onChange={(e) => setEditingHomework({ ...editingHomework, attachment: e.target.files[0] })}
                      />
                    </label>
                    <span className="text-sm text-slate-600 dark:text-slate-300 font-medium truncate max-w-[200px]">
                      {editingHomework.attachment ? editingHomework.attachment.name : 'No new file chosen'}
                    </span>
                    {editingHomework.attachment && (
                      <button
                        type="button"
                        onClick={() => setEditingHomework({ ...editingHomework, attachment: null })}
                        className="p-1 hover:bg-red-50 text-red-500 rounded-lg transition-colors"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-5 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updating}
                  className="px-5 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-bold shadow-md shadow-primary-600/10 transition-colors disabled:opacity-50"
                >
                  {updating ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* DELETE CONFIRMATION MODAL */}
      {/* ============================================================ */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 shadow-2xl animate-fade-in-up border border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <div className="p-3 bg-red-50 dark:bg-red-950/50 rounded-2xl">
                <Trash2 size={24} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Delete Homework</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">This action cannot be undone.</p>
              </div>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-6">
              Are you sure you want to delete this homework assignment? All associated student submission records will be permanently removed.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setShowDeleteModal(false); setDeletingId(null); }}
                className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-600 dark:text-slate-300 font-bold hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold shadow-sm disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete Assignment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* EXCEL UPLOAD MODAL */}
      {/* ============================================================ */}
      {showExcelModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 z-50">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-2xl flex flex-col max-h-[90vh] overflow-hidden shadow-2xl animate-fade-in-up">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800 shrink-0">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Evaluate via Excel</h2>
              <button onClick={() => setShowExcelModal(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleExcelUpload} className="flex-1 overflow-y-auto custom-scrollbar flex flex-col">
              <div className="p-6 space-y-6 flex-1">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Upload an Excel (.xlsx) file containing student evaluations for automatic batch submission updating. <br />
                  <strong>Required Columns:</strong> Admission Number, Status (Not Started, In Progress, Completed, Submitted), Grade, Feedback
                </p>

                <div className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl p-8 text-center bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors relative">
                  <input
                    type="file"
                    required
                    accept=".xlsx, .xls, .csv"
                    onChange={e => setExcelFile(e.target.files[0])}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <Upload size={32} className="mx-auto text-primary-500 mb-3" />
                  <span className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
                    {excelFile ? excelFile.name : 'Click or drag Excel file here'}
                  </span>
                </div>
              </div>

              <div className="p-6 bg-slate-50 dark:bg-slate-800 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowExcelModal(false)}
                  className="px-5 py-2.5 text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !excelFile}
                  className="px-5 py-2.5 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700 disabled:opacity-50"
                >
                  {creating ? 'Processing...' : 'Process File'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* TRACKING & ROSTER MODAL */}
      {/* ============================================================ */}
      {showTrackingModal && selectedHomework && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 z-50">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-4xl flex flex-col max-h-[90vh] overflow-hidden shadow-2xl animate-fade-in-up">
            {/* Header */}
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-50 dark:bg-slate-800 shrink-0 w-full">
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2 truncate">
                  {selectedHomework.title}
                  {(selectedHomework.attachments?.[0]?.url || selectedHomework.attachmentUrl) && (
                    <a
                      href={selectedHomework.attachments?.[0]?.url || selectedHomework.attachmentUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400 rounded-full hover:bg-primary-100 transition-colors font-bold whitespace-nowrap"
                    >
                      <Paperclip size={14} /> View Attachment
                    </a>
                  )}
                </h2>
                <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                  {selectedHomework.className} • {selectedHomework.subjectName || 'Subject'} • Due: {selectedHomework.dueDate}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                <button
                  onClick={() => {
                    const defaultName = selectedHomework ? selectedHomework.title.replace(/\s+/g, '_') : 'Homework';
                    setExportFileName(`${defaultName}_Submissions`);
                    setShowExportModal(true);
                  }}
                  className="w-full sm:w-auto justify-center inline-flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-bold hover:bg-primary-700 shadow-md shadow-primary-600/10 transition-all active:scale-[0.98]"
                >
                  <FileDown size={18} />
                  Export Roster
                </button>
                <button
                  onClick={() => setShowTrackingModal(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-xl"
                >
                  <X size={24} />
                </button>
              </div>
            </div>

            {/* Content / Roster */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-4">
              {/* Stat Counters */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 text-center">
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400 block">Total Students</span>
                  <span className="text-lg font-extrabold text-slate-900 dark:text-white">
                    {selectedHomework.totalStudents || selectedHomework.roster?.length || 0}
                  </span>
                </div>
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-2xl border border-emerald-100 dark:border-emerald-800 text-center">
                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 block">Submitted</span>
                  <span className="text-lg font-extrabold text-emerald-700 dark:text-emerald-300">
                    {selectedHomework.submittedCount || 0}
                  </span>
                </div>
                <div className="p-3 bg-blue-50 dark:bg-blue-950/40 rounded-2xl border border-blue-100 dark:border-blue-800 text-center">
                  <span className="text-xs font-bold text-blue-600 dark:text-blue-400 block">Completed</span>
                  <span className="text-lg font-extrabold text-blue-700 dark:text-blue-300">
                    {selectedHomework.completedCount || 0}
                  </span>
                </div>
                <div className="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-2xl border border-amber-100 dark:border-amber-800 text-center">
                  <span className="text-xs font-bold text-amber-600 dark:text-amber-400 block">In Progress</span>
                  <span className="text-lg font-extrabold text-amber-700 dark:text-amber-300">
                    {selectedHomework.inProgressCount || 0}
                  </span>
                </div>
              </div>

              {trackingLoading ? (
                <div className="p-8 text-center text-slate-500">Loading student submission roster...</div>
              ) : !selectedHomework.roster || selectedHomework.roster.length === 0 ? (
                <p className="text-center text-slate-500 dark:text-slate-400 italic py-8">
                  No enrolled students found for this class.
                </p>
              ) : (
                <div className="space-y-3">
                  {selectedHomework.roster.map(student => {
                    const status = student.status || 'Not Started';
                    const lastUpdated = student.lastUpdated
                      ? new Date(student.lastUpdated).toLocaleString()
                      : (student.submittedAt ? new Date(student.submittedAt).toLocaleString() : 'N/A');

                    let statusColor = 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300';
                    if (status === 'In Progress') statusColor = 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300';
                    if (status === 'Completed') statusColor = 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300';
                    if (status === 'Submitted') statusColor = 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300';

                    return (
                      <div
                        key={student.studentId}
                        className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border border-slate-200 dark:border-slate-700 rounded-2xl hover:border-primary-300 dark:hover:border-slate-600 transition-colors gap-4 bg-white dark:bg-slate-900"
                      >
                        <div>
                          <p className="font-bold text-slate-900 dark:text-white">{student.studentName}</p>
                          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                            ADM: {student.admissionNumber || 'N/A'} {student.rollNumber ? `| Roll: ${student.rollNumber}` : ''} | Last Updated: {lastUpdated}
                          </p>
                          {student.grade && (
                            <p className="text-xs font-bold text-primary-600 mt-1">
                              Grade / Marks: {student.grade} {student.feedback ? `(${student.feedback})` : ''}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <select
                            value={status}
                            onChange={(e) => handleUpdateStudentSubmission(student.studentId, e.target.value)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 outline-none cursor-pointer ${statusColor}`}
                          >
                            <option value="Not Started">Not Started</option>
                            <option value="In Progress">In Progress</option>
                            <option value="Completed">Completed</option>
                            <option value="Submitted">Submitted</option>
                          </select>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* EXPORT MODAL */}
      {/* ============================================================ */}
      {showExportModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-100 dark:border-slate-800 overflow-hidden transform transition-all flex flex-col max-h-[85vh]">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">Export Submissions Roster</h3>
                <p className="text-slate-500 dark:text-slate-400 text-xs mt-0.5 font-medium">Select columns to include in the exported Excel spreadsheet</p>
              </div>
              <button
                onClick={() => setShowExportModal(false)}
                className="p-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-xl transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6">
              <div className="space-y-1.5 pb-3 border-b border-slate-100 dark:border-slate-800">
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">File Name</label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="e.g. Homework_Submissions"
                    value={exportFileName}
                    onChange={(e) => setExportFileName(e.target.value)}
                    className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none text-sm font-semibold text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800"
                  />
                  <span className="absolute right-4 top-2.5 text-xs text-slate-400 font-bold font-mono select-none">.xlsx</span>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => handleSelectAll(true)}
                  className="px-3 py-1.5 text-xs font-bold bg-primary-50 text-primary-700 hover:bg-primary-100 dark:bg-primary-950 dark:text-primary-300 rounded-lg transition-colors"
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

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {availableFieldsList.map((field) => (
                  <label
                    key={field.key}
                    className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 cursor-pointer select-none transition-colors"
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
                <FileDown size={18} />
                Generate Sheet
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
