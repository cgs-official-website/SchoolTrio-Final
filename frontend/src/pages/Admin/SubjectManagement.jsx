import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  listSubjects,
  createSubject,
  updateSubject,
  deleteSubject,
  bulkImportSubjects
} from '../../api/subjects';
import { listStaff, assignStaff } from '../../api/staff';
import {
  LuBookOpen,
  LuPlus,
  LuX,
  LuTrash2,
  LuPencil,
  LuUpload,
  LuDownload,
  LuFileDown
} from 'react-icons/lu';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import ConfirmModal from '../../components/ConfirmModal';
import usePermissions from '../../hooks/usePermissions';

const EXPORT_FIELD_OPTIONS = [
  { id: 'name', label: 'Subject Name', defaultChecked: true },
  { id: 'code', label: 'Subject Code', defaultChecked: true },
  { id: 'teachers', label: 'Assigned Teachers', defaultChecked: true },
  { id: 'id', label: 'Subject UUID', defaultChecked: false },
  { id: 'createdAt', label: 'Created Date', defaultChecked: false }
];

export default function SubjectManagement() {
  const { userProfile } = useAuth();
  const { canCreate, canEdit, canDelete } = usePermissions();
  const hasCreatePermission = userProfile?.role?.toLowerCase() === 'admin' || userProfile?.role?.toLowerCase() === 'superadmin' || canCreate('subjects');
  const hasEditPermission = userProfile?.role?.toLowerCase() === 'admin' || userProfile?.role?.toLowerCase() === 'superadmin' || canEdit('subjects');
  const hasDeletePermission = userProfile?.role?.toLowerCase() === 'admin' || userProfile?.role?.toLowerCase() === 'superadmin' || canDelete('subjects');

  const [subjects, setSubjects] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Form Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [initialAssignedTeacherIds, setInitialAssignedTeacherIds] = useState([]);
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, onConfirm: null, message: '', title: '' });
  
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    assignedTeacherIds: []
  });

  const [saving, setSaving] = useState(false);

  // Bulk Import State
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);

  // Field-Selection Export State
  const [showExportModal, setShowExportModal] = useState(false);
  const [selectedExportFields, setSelectedExportFields] = useState(['name', 'code', 'teachers']);

  const getTeacherAssignedSubjectIds = useCallback((teacher) => {
    return teacher.assignments?.assignedSubjectIds || 
           teacher.customData?.assignments?.assignedSubjectIds || 
           [];
  }, []);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [subjectsRes, staffRes] = await Promise.all([
        listSubjects({ limit: 100 }),
        listStaff({ staffType: 'teaching', limit: 100 })
      ]);

      setSubjects(Array.isArray(subjectsRes?.data) ? subjectsRes.data : []);
      setTeachers(Array.isArray(staffRes?.data) ? staffRes.data : []);
    } catch (error) {
      console.error("Error fetching subjects and teaching staff:", error);
      toast.error(error.response?.data?.message || "Failed to load subjects");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleOpenModal = (subject = null) => {
    if (subject) {
      setEditingId(subject.id);
      const currentlyAssignedTeachers = teachers
        .filter(t => getTeacherAssignedSubjectIds(t).includes(subject.id))
        .map(t => t.id);

      setInitialAssignedTeacherIds(currentlyAssignedTeachers);
      setFormData({
        name: subject.name,
        code: subject.code || '',
        assignedTeacherIds: currentlyAssignedTeachers
      });
    } else {
      setEditingId(null);
      setInitialAssignedTeacherIds([]);
      setFormData({ name: '', code: '', assignedTeacherIds: [] });
    }
    setShowModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.name?.trim()) return;

    const normalizedName = formData.name.trim();
    const normalizedCode = formData.code?.trim() || null;

    const isDuplicate = subjects.some(s => 
      s.id !== editingId && (
        s.name?.toLowerCase() === normalizedName.toLowerCase() ||
        (normalizedCode && s.code?.toLowerCase() === normalizedCode.toLowerCase())
      )
    );

    if (isDuplicate) {
      toast.error("A subject with this Name or Code already exists.");
      return;
    }
    
    if (editingId && !hasEditPermission) {
      toast.error("You do not have permission to edit subjects.");
      return;
    }
    if (!editingId && !hasCreatePermission) {
      toast.error("You do not have permission to create subjects.");
      return;
    }

    setSaving(true);
    try {
      let targetSubjectId = editingId;

      if (editingId) {
        await updateSubject(editingId, {
          name: normalizedName,
          code: normalizedCode
        });
        toast.success("Subject updated successfully!");
      } else {
        const createdRes = await createSubject({
          name: normalizedName,
          code: normalizedCode
        });
        targetSubjectId = createdRes?.data?.id;
        toast.success("Subject created successfully!");
      }

      // Synchronize teacher subject assignments if changed
      if (targetSubjectId) {
        const selectedIds = new Set(formData.assignedTeacherIds || []);
        const initialIds = new Set(initialAssignedTeacherIds);

        const newlyAddedTeachers = teachers.filter(t => selectedIds.has(t.id) && !initialIds.has(t.id));
        const newlyRemovedTeachers = teachers.filter(t => !selectedIds.has(t.id) && initialIds.has(t.id));

        const syncPromises = [];

        newlyAddedTeachers.forEach(teacher => {
          const currentSubjects = getTeacherAssignedSubjectIds(teacher);
          const updatedSubjectIds = Array.from(new Set([...currentSubjects, targetSubjectId]));
          syncPromises.push(assignStaff(teacher.id, { assignedSubjectIds: updatedSubjectIds }));
        });

        newlyRemovedTeachers.forEach(teacher => {
          const currentSubjects = getTeacherAssignedSubjectIds(teacher);
          const updatedSubjectIds = currentSubjects.filter(id => id !== targetSubjectId);
          syncPromises.push(assignStaff(teacher.id, { assignedSubjectIds: updatedSubjectIds }));
        });

        if (syncPromises.length > 0) {
          await Promise.allSettled(syncPromises);
        }
      }

      setShowModal(false);
      await fetchData();
    } catch (error) {
      console.error("Error saving subject:", error);
      if (error.response?.status === 409) {
        toast.error(error.response?.data?.message || "A subject with this name or code already exists.");
      } else if (error.response?.status === 403) {
        toast.error("You do not have permission to perform this action.");
      } else {
        toast.error(error.response?.data?.message || "Failed to save subject.");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id) => {
    if (!hasDeletePermission) {
      toast.error("You do not have permission to delete subjects.");
      return;
    }
    setConfirmModal({
      isOpen: true,
      title: "Delete Subject",
      message: "Are you sure you want to delete this subject? Make sure no active classes or academic records are assigned to it.",
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        try {
          await deleteSubject(id);
          toast.success("Subject deleted successfully!");
          await fetchData();
        } catch (error) {
          console.error("Error deleting subject:", error);
          if (error.response?.status === 409) {
            toast.error(error.response?.data?.message || "Cannot delete this subject because it is being used by existing academic records.");
          } else if (error.response?.status === 403) {
            toast.error("You do not have permission to delete subjects.");
          } else if (error.response?.status === 404) {
            toast.error("Subject not found.");
          } else {
            toast.error(error.response?.data?.message || "Failed to delete subject.");
          }
        }
      }
    });
  };

  const toggleTeacherAssignment = (teacherId) => {
    setFormData(prev => {
      const ids = prev.assignedTeacherIds || [];
      if (ids.includes(teacherId)) {
        return { ...prev, assignedTeacherIds: ids.filter(id => id !== teacherId) };
      } else {
        return { ...prev, assignedTeacherIds: [...ids, teacherId] };
      }
    });
  };

  // Bulk Import Handlers
  const handleDownloadTemplate = () => {
    const templateData = [
      {
        "Subject Name": "Mathematics",
        "Subject Code": "MATH101"
      },
      {
        "Subject Name": "Physics",
        "Subject Code": "PHY201"
      },
      {
        "Subject Name": "English Literature",
        "Subject Code": ""
      }
    ];
    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Subjects Template");
    XLSX.writeFile(workbook, "Subject_Import_Template.xlsx");
  };

  const getFlexibleColumnValue = (row, possibleHeaders) => {
    if (!row || typeof row !== 'object') return '';
    const keys = Object.keys(row);
    for (const header of possibleHeaders) {
      const target = header.toLowerCase();
      for (const key of keys) {
        if (key.trim().toLowerCase() === target) {
          const val = row[key];
          return val !== undefined && val !== null ? String(val).trim() : '';
        }
      }
    }
    return '';
  };

  const handleFileUpload = async () => {
    if (!importFile) {
      toast.error("Please select a file first.");
      return;
    }

    setImporting(true);
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        if (jsonData.length === 0) {
          toast.error("The uploaded file is empty.");
          setImporting(false);
          return;
        }

        const rows = [];
        for (let i = 0; i < jsonData.length; i++) {
          const row = jsonData[i];
          const name = getFlexibleColumnValue(row, ['Subject Name', 'Subject', 'Name', 'Subject_Name', 'SubjectName', 'Title', 'Course']);
          const code = getFlexibleColumnValue(row, ['Subject Code', 'Code', 'Subject_Code', 'SubjectCode', 'Code_No', 'CodeNo']);

          if (name) {
            rows.push({
              name,
              code: code || undefined
            });
          }
        }

        if (rows.length === 0) {
          toast.error("No valid subject rows found in the uploaded file.");
          setImporting(false);
          return;
        }

        const response = await bulkImportSubjects({ rows });
        const result = response?.data || {};

        const addedCount = result.addedCount || 0;
        const skippedCount = result.skippedCount || 0;

        await fetchData();

        toast.success(`Imported ${addedCount} subjects. (Skipped: ${skippedCount})`);
        setShowImportModal(false);
        setImportFile(null);
      } catch (err) {
        console.error("Error during subject bulk import:", err);
        toast.error(err?.message || "Failed to process import file.");
      } finally {
        setImporting(false);
      }
    };

    reader.onerror = () => {
      toast.error("Failed to read file");
      setImporting(false);
    };

    reader.readAsArrayBuffer(importFile);
  };

  // Field-Selection Export Handlers
  const toggleExportField = (fieldId) => {
    setSelectedExportFields(prev => 
      prev.includes(fieldId) ? prev.filter(f => f !== fieldId) : [...prev, fieldId]
    );
  };

  const handleSelectAllExportFields = () => {
    setSelectedExportFields(EXPORT_FIELD_OPTIONS.map(f => f.id));
  };

  const handleDeselectAllExportFields = () => {
    setSelectedExportFields([]);
  };

  const handleExecuteExport = () => {
    if (!subjects || subjects.length === 0) {
      toast.error("No subject data available to export.");
      return;
    }

    if (selectedExportFields.length === 0) {
      toast.error("Please select at least one field to export.");
      return;
    }

    const exportData = subjects.map(subject => {
      const row = {};
      const assignedStaff = teachers.filter(t => getTeacherAssignedSubjectIds(t).includes(subject.id));
      const teacherNames = assignedStaff.map(t => t.name || `${t.firstName || ''} ${t.lastName || ''}`.trim()).join(', ') || 'Unassigned';

      if (selectedExportFields.includes('name')) {
        row['Subject Name'] = subject.name || '';
      }
      if (selectedExportFields.includes('code')) {
        row['Subject Code'] = subject.code || 'N/A';
      }
      if (selectedExportFields.includes('teachers')) {
        row['Assigned Teachers'] = teacherNames;
      }
      if (selectedExportFields.includes('id')) {
        row['Subject UUID'] = subject.id;
      }
      if (selectedExportFields.includes('createdAt')) {
        row['Created Date'] = subject.createdAt ? new Date(subject.createdAt).toLocaleDateString() : 'N/A';
      }

      return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Subjects");
    XLSX.writeFile(workbook, `Subjects_Export_${new Date().toISOString().slice(0, 10)}.xlsx`);

    setShowExportModal(false);
    toast.success("Subject data exported successfully!");
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-[80vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto pb-24 h-[calc(100vh-2rem)] flex flex-col print:p-0 print:h-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4 shrink-0 w-full">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white truncate">Subject Management</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Create subjects and assign them to teaching staff.</p>
        </div>
        <div className="flex gap-3 flex-wrap w-full md:w-auto">
          {hasCreatePermission && (
            <button 
              onClick={() => setShowImportModal(true)}
              className="px-4 py-2 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl font-medium hover:bg-slate-50 dark:hover:bg-slate-800 shadow-sm flex items-center gap-2 transition-colors"
            >
              <LuUpload size={18} /> Bulk Import
            </button>
          )}
          <button 
            onClick={() => setShowExportModal(true)}
            className="px-4 py-2 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl font-medium hover:bg-slate-50 dark:hover:bg-slate-800 shadow-sm flex items-center gap-2 transition-colors"
          >
            <LuDownload size={18} /> Export Data
          </button>
          {hasCreatePermission && (
            <button 
              onClick={() => handleOpenModal()}
              className="px-6 py-2 bg-primary-600 text-white rounded-xl font-bold hover:bg-primary-700 transition-colors flex items-center gap-2"
            >
              <LuPlus size={18} /> Add Subject
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 flex-1 overflow-y-auto custom-scrollbar">
        {subjects.length === 0 ? (
          <div className="col-span-full p-12 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700">
            <LuBookOpen size={48} className="mx-auto text-slate-300 mb-4" />
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">No Subjects Created</h3>
            <p className="text-slate-500 dark:text-slate-400 mt-1">Click the button above to add your first subject.</p>
          </div>
        ) : (
          subjects.map(subject => {
            const assignedStaff = teachers.filter(t => getTeacherAssignedSubjectIds(t).includes(subject.id));

            return (
              <div key={subject.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm hover:shadow-md transition-shadow relative group">
                <div className="flex justify-between items-start mb-4">
                  <div className="w-12 h-12 bg-primary-50 rounded-xl flex items-center justify-center text-primary-600">
                    <LuBookOpen size={24} />
                  </div>
                  <div className="flex gap-2">
                    {hasEditPermission && (
                      <button onClick={() => handleOpenModal(subject)} className="p-2 text-slate-400 dark:text-slate-300 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-slate-800 rounded-lg transition-colors" title="Edit Subject">
                        <LuPencil size={18} />
                      </button>
                    )}
                    {hasDeletePermission && (
                      <button onClick={() => handleDelete(subject.id)} className="p-2 text-slate-400 dark:text-slate-300 hover:text-red-600 hover:bg-red-50 dark:hover:bg-slate-800 rounded-lg transition-colors" title="Delete Subject">
                        <LuTrash2 size={18} />
                      </button>
                    )}
                  </div>
                </div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">{subject.name}</h3>
                {subject.code && <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-4">{subject.code}</p>}
                
                <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <p className="text-xs font-bold text-slate-400 dark:text-slate-300 uppercase mb-2">Assigned Teachers</p>
                  <div className="flex flex-wrap gap-2">
                    {assignedStaff.length > 0 ? (
                      assignedStaff.map(teacher => {
                        const name = teacher.name || `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim();
                        return (
                          <span key={teacher.id} className="px-2.5 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700">
                            {name}
                          </span>
                        );
                      })
                    ) : (
                      <span className="text-sm text-slate-400 dark:text-slate-300 italic">No teachers assigned</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add / Edit Subject Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center shrink-0">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                {editingId ? 'Edit Subject' : 'Add Subject'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-2 text-slate-400 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full">
                <LuX size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSave} className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Subject Name *</label>
                <input 
                  type="text" required
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  placeholder="e.g. Mathematics"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Subject Code (Optional)</label>
                <input 
                  type="text"
                  value={formData.code}
                  onChange={e => setFormData({ ...formData, code: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  placeholder="e.g. MATH101"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">Assign to Teaching Staff</label>
                <div className="space-y-2 border border-slate-200 dark:border-slate-700 rounded-xl p-4 max-h-60 overflow-y-auto custom-scrollbar bg-slate-50/50 dark:bg-slate-800/50">
                  {teachers.length === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400 italic">No teaching staff found.</p>
                  ) : (
                    teachers.map(teacher => {
                      const name = teacher.name || `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim();
                      const isAssigned = (formData.assignedTeacherIds || []).includes(teacher.id);
                      return (
                        <label key={teacher.id} className="flex items-center gap-3 p-2 hover:bg-white dark:hover:bg-slate-800 rounded-lg cursor-pointer transition-colors border border-transparent hover:border-slate-200">
                          <input 
                            type="checkbox"
                            checked={isAssigned}
                            onChange={() => toggleTeacherAssignment(teacher.id)}
                            className="w-4 h-4 text-primary-600 rounded border-slate-300 dark:border-slate-600 focus:ring-primary-500"
                          />
                          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{name}</span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            </form>

            <div className="p-6 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3 shrink-0 bg-slate-50 dark:bg-slate-800">
              <button 
                type="button" onClick={() => setShowModal(false)}
                className="px-5 py-2.5 text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-200 dark:hover:bg-slate-600 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleSave}
                disabled={saving}
                className="w-full sm:w-auto px-4 py-2 bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700 rounded-xl transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Subject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden border border-slate-100 dark:border-slate-800">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <LuUpload size={22} className="text-primary-600" /> Bulk Import Subjects
              </h2>
              <button 
                onClick={() => setShowImportModal(false)}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full transition-colors"
              >
                <LuX size={20} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
                <h4 className="font-semibold text-slate-900 dark:text-white mb-2">Instructions</h4>
                <ul className="text-sm text-slate-600 dark:text-slate-400 list-disc list-inside space-y-1">
                  <li>Download the sample template file below.</li>
                  <li>Fill in <b>Subject Name</b> (Mandatory).</li>
                  <li>Fill in <b>Subject Code</b> (Optional).</li>
                  <li>Upload the completed spreadsheet (.xlsx, .xls, .csv).</li>
                </ul>
                <button 
                  onClick={handleDownloadTemplate}
                  className="mt-3 text-primary-600 hover:text-primary-700 text-sm font-semibold flex items-center gap-1 transition-colors"
                >
                  <LuFileDown size={16} /> Download Template
                </button>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">Select Excel File</label>
                <input 
                  type="file" 
                  accept=".xlsx, .xls, .csv"
                  onChange={(e) => setImportFile(e.target.files[0])}
                  className="w-full text-sm text-slate-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100 transition-all border border-slate-200 dark:border-slate-700 rounded-xl"
                />
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 flex justify-end gap-3">
              <button 
                onClick={() => setShowImportModal(false)}
                className="px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleFileUpload}
                disabled={importing || !importFile}
                className="px-6 py-2 bg-primary-600 text-white rounded-xl font-bold hover:bg-primary-700 disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                {importing ? 'Importing...' : <><LuUpload size={18} /> Start Import</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export Field-Selection Modal */}
      {showExportModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-slate-100 dark:border-slate-800">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <LuDownload size={22} className="text-primary-600" /> Export Subjects
              </h2>
              <button 
                onClick={() => setShowExportModal(false)}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full transition-colors"
              >
                <LuX size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-800">
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Select Fields to Export</span>
                <div className="flex gap-3 text-xs font-semibold">
                  <button onClick={handleSelectAllExportFields} className="text-primary-600 hover:underline">Select All</button>
                  <span className="text-slate-300">|</span>
                  <button onClick={handleDeselectAllExportFields} className="text-slate-500 hover:underline">Deselect All</button>
                </div>
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
                {EXPORT_FIELD_OPTIONS.map(field => {
                  const isChecked = selectedExportFields.includes(field.id);
                  return (
                    <label 
                      key={field.id}
                      className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                    >
                      <input 
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleExportField(field.id)}
                        className="w-4 h-4 text-primary-600 rounded border-slate-300 focus:ring-primary-500"
                      />
                      <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{field.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 flex justify-end gap-3">
              <button 
                onClick={() => setShowExportModal(false)}
                className="px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleExecuteExport}
                className="px-6 py-2 bg-primary-600 text-white rounded-xl font-bold hover:bg-primary-700 transition-colors flex items-center gap-2"
              >
                <LuDownload size={18} /> Export Excel
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal 
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModal.onConfirm}
        message={confirmModal.message}
        title={confirmModal.title}
      />
    </div>
  );
}
