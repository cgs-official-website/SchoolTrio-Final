import React, { useState, useEffect, useCallback } from 'react';
import { LuFolderDown, LuSearch, LuPlus, LuFileText, LuLink, LuVideo, LuImage, LuTrash2, LuDownload, LuExternalLink, LuX } from 'react-icons/lu';
import { useAuth } from '../../context/AuthContext';
import { listAcademicResources, createAcademicResource, deleteAcademicResource, uploadAcademicResourceFile, getResourceUploadConfig } from '../../api/academic-resources';
import { listClasses } from '../../api/classes';
import { listSubjects } from '../../api/subjects';
import toast from 'react-hot-toast';
import ConfirmModal from '../../components/ConfirmModal';
import usePermissions from '../../hooks/usePermissions';
import { sortClassesAscending, formatClassSection } from '../../utils/classSorting';
import { notifyDataChanged } from '../../utils/liveData';
import { useLiveDataRefresh } from '../../hooks/useLiveDataRefresh';

/** Turns an ApiError into a readable message (includes backend field-level validation details). */
function describeApiError(err, fallback) {
  if (!err) return fallback;
  if (err.code === 'NETWORK_ERROR' || err.status === 0) {
    return 'Cannot reach the server. Check that the backend is running and try again.';
  }
  const detail = Array.isArray(err.details) && err.details.length
    ? err.details.map(d => (d.field ? `${d.field}: ${d.message}` : d.message)).join('; ')
    : '';
  const base = err.message || fallback;
  return detail ? `${base} (${detail})` : base;
}

export default function ResourceSharing() {
  const { userProfile, currentUser } = useAuth();
  const schoolId = userProfile?.schoolId;
  const currentUserId = userProfile?.id || userProfile?.userId || currentUser?.id || currentUser?.uid;
  const { canDelete } = usePermissions();
  const isAdmin = userProfile?.role?.toLowerCase() === 'admin' ||
    userProfile?.role?.toLowerCase() === 'superadmin' ||
    userProfile?.systemRole?.toLowerCase() === 'admin' ||
    userProfile?.systemRole?.toLowerCase() === 'super_admin';
  const hasDeletePermission = isAdmin || canDelete('resources');

  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [resources, setResources] = useState([]);
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal & Form State
  const [showModal, setShowModal] = useState(false);
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, resourceId: null, resourceTitle: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submittingAudience, setSubmittingAudience] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  // Upload limit comes from the server (RESOURCE_MAX_UPLOAD_MB); null until loaded
  const [uploadLimit, setUploadLimit] = useState(null);
  // null => admin (every class/section/subject); array => only the targets this teacher may post to
  const [allowedTargets, setAllowedTargets] = useState(null);

  // One option per Class + Section (class without sections => single option)
  const targetOptions = [];
  for (const c of classes) {
    const sections = Array.isArray(c.sections) ? c.sections : [];
    const candidates = sections.length > 0
      ? sections.map(sec => ({
        key: `${c.id}:${sec.id}`,
        classId: c.id,
        sectionId: sec.id,
        label: formatClassSection({ name: c.name, section: sec.name })
      }))
      : [{ key: `${c.id}:`, classId: c.id, sectionId: null, label: formatClassSection({ name: c.name }) }];
    for (const opt of candidates) {
      if (!allowedTargets) { targetOptions.push({ ...opt, allSubjects: true, subjectIds: [] }); continue; }
      const match = allowedTargets.find(t => t.classId === opt.classId && (t.sectionId || null) === opt.sectionId);
      if (match) targetOptions.push({ ...opt, allSubjects: !!match.allSubjects, subjectIds: match.subjectIds || [] });
    }
  }
  const [formData, setFormData] = useState({
    title: '',
    type: 'document',
    classId: '',
    sectionId: '',
    subjectId: '',
    url: '',
    description: ''
  });

  // Section picked in the form + the subjects the user may choose for it
  const selectedTarget = targetOptions.find(
    o => o.classId === formData.classId && (o.sectionId || '') === (formData.sectionId || '')
  ) || null;
  const selectableSubjects = !allowedTargets || !selectedTarget || selectedTarget.allSubjects
    ? subjects
    : subjects.filter(sub => selectedTarget.subjectIds.includes(sub.id));
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
        setSubjects([...subjectsRes.data].sort((a, b) => (a.name || '').localeCompare(b.name || '')));
      } else if (Array.isArray(subjectsRes)) {
        setSubjects([...subjectsRes].sort((a, b) => (a.name || '').localeCompare(b.name || '')));
      }
    } catch (err) {
      console.error('Error fetching classes/subjects metadata:', err);
      toast.error('Failed to load classes or subjects');
    }
  }, [schoolId]);

  // Fetch academic resources via REST API (paginated fetch loop ensures complete collection)
  const fetchResources = useCallback(async (silent = false) => {
    if (!schoolId) return;
    if (!silent) setLoading(true);
    try {
      let allResources = [];
      let currentPage = 1;
      let totalPages = 1;

      do {
        const res = await listAcademicResources({
          page: currentPage,
          limit: 100
        });

        const pageData = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
        allResources = allResources.concat(pageData);

        const pagination = res?.pagination;
        totalPages = pagination?.totalPages || 1;
        currentPage += 1;
      } while (currentPage <= totalPages);

      // Default sort createdAt DESC
      const sorted = allResources.sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));
      setResources(sorted);
    } catch (err) {
      console.error('Error fetching academic resources from REST API:', err);
      toast.error(err.message || 'Failed to load resources');
      setResources([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => {
    let isMounted = true;

    const loadAll = async () => {
      if (!schoolId) return;
      if (!isMounted) return;
      await Promise.all([fetchMetadata(), fetchResources()]);
    };

    loadAll();

    return () => {
      isMounted = false;
    };
  }, [schoolId, fetchMetadata, fetchResources]);

  // Event-driven live synchronization for academic resources and metadata
  useLiveDataRefresh(() => fetchResources(true), [fetchResources], 'resources');
  useLiveDataRefresh(fetchMetadata, [fetchMetadata], ['classes', 'subjects']);

  useEffect(() => {
    if (!schoolId) return;
    getResourceUploadConfig()
      .then(res => {
        const d = res?.data || res;
        if (d?.maxFileSizeBytes) setUploadLimit({ bytes: d.maxFileSizeBytes, mb: d.maxFileSizeMb });
        // null => admin (everything); array => only the class/section/subject targets this teacher handles
        setAllowedTargets(Array.isArray(d?.allowedTargets) ? d.allowedTargets : null);
      })
      .catch(() => { }); // server still enforces the limit
  }, [schoolId]);

  const handleOpenCreate = () => {
    setFormData({
      title: '',
      type: 'document',
      classId: targetOptions[0]?.classId || '',
      sectionId: targetOptions[0]?.sectionId || '',
      subjectId: '',
      url: '',
      description: ''
    });
    setSelectedFile(null);
    setShowModal(true);
  };

  const handleDeleteClick = (resourceId, title) => {
    setConfirmModal({
      isOpen: true,
      resourceId,
      resourceTitle: title
    });
  };

  const handleConfirmDelete = async () => {
    const { resourceId } = confirmModal;
    if (!resourceId) return;

    // Close the popup immediately to provide instant feedback
    setConfirmModal({ isOpen: false, resourceId: null, resourceTitle: '' });

    try {
      await deleteAcademicResource(resourceId);
      toast.success("Resource deleted successfully!");
      setResources(prev => prev.filter(r => r.id !== resourceId));
      notifyDataChanged('resources');
    } catch (error) {
      console.error('Delete resource error:', error);
      toast.error(error.message || "Failed to delete resource.");
      // Refetch on error to restore authoritative state
      fetchResources(true);
    }
  };

  // audience: 'teachers' = class/subject teachers only; 'teachers_students' = teachers + students/parents of the section
  const handleSubmit = async (e, audience = 'teachers') => {
    e.preventDefault();
    if (!formData.title.trim()) {
      toast.error("Please provide a resource title.");
      return;
    }
    if (!formData.classId) {
      toast.error("Please select a class and section.");
      return;
    }
    if (selectedTarget && selectedTarget.sectionId && !formData.sectionId) {
      toast.error("Please select a section.");
      return;
    }
    const isLinkType = formData.type === 'link';
    const typedUrl = (formData.url || '').trim();
    if (isLinkType) {
      if (!typedUrl) {
        toast.error("Please paste the web link.");
        return;
      }
      if (!/^https?:\/\/\S+$/i.test(typedUrl)) {
        toast.error("Link must start with http:// or https://");
        return;
      }
    } else if (!selectedFile && !typedUrl) {
      toast.error("Please select a file or provide a link.");
      return;
    } else if (!selectedFile && typedUrl && !/^https?:\/\/\S+$/i.test(typedUrl)) {
      toast.error("Link must start with http:// or https://");
      return;
    }

    setSubmitting(true);
    setSubmittingAudience(audience);
    try {
      // Upload file through the backend to get a real http(s) URL
      let fileUrl = typedUrl;
      if (selectedFile && !isLinkType) {
        try {
          const uploadRes = await uploadAcademicResourceFile(selectedFile);
          fileUrl = uploadRes?.data?.fileUrl || uploadRes?.fileUrl || '';
          if (!fileUrl) throw new Error('Upload did not return a file URL');
        } catch (uploadError) {
          console.error('Resource file upload failed:', uploadError);
          toast.error(describeApiError(uploadError, 'File upload failed. Please try again.'));
          return; // do not save a resource without its file
        }
      }

      const payload = {
        title: formData.title.trim(),
        classId: formData.classId,
        sectionId: formData.sectionId || null,
        subjectId: formData.subjectId || null, // empty = General (shared with every teacher of the section)
        fileUrl: fileUrl || null,
        type: formData.type || 'document',
        audience,
        description: formData.description || null
      };

      const res = await createAcademicResource(payload);
      const createdRecord = res?.data || res;

      toast.success(audience === 'teachers_students'
        ? "Resource sent to teachers and students."
        : "Resource sent to teachers.");
      setSelectedFile(null);
      setShowModal(false);

      if (createdRecord?.id) {
        setResources(prev => [createdRecord, ...prev.filter(r => r.id !== createdRecord.id)]);
      }
      notifyDataChanged('resources');
      fetchResources(true);
    } catch (error) {
      console.error('Create resource error:', error);
      toast.error(describeApiError(error, "Failed to save resource."));
    } finally {
      setSubmitting(false);
      setSubmittingAudience(null);
    }
  };

  const filteredResources = resources.filter(r => {
    const term = searchTerm.trim().toLowerCase();
    const matchesSearch = !term || [
      r.title, r.subjectName, r.subject, r.className, r.sectionName, r.class,
      r.description, r.uploaderName, r.type, r.fileType
    ].some(v => String(v || '').toLowerCase().includes(term));

    const resourceType = (r.type || r.fileType || 'document').toLowerCase();
    if (activeTab === 'all') return matchesSearch;
    return matchesSearch && resourceType === activeTab;
  });

  const getTypeIcon = (type) => {
    const norm = (type || 'document').toLowerCase();
    switch (norm) {
      case 'document': return <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0"><LuFileText size={20} /></div>;
      case 'video': return <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shrink-0"><LuVideo size={20} /></div>;
      case 'image': return <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0"><LuImage size={20} /></div>;
      case 'link': return <div className="w-10 h-10 rounded-xl bg-green-50 text-green-600 flex items-center justify-center shrink-0"><LuLink size={20} /></div>;
      default: return <div className="w-10 h-10 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center shrink-0"><LuFileText size={20} /></div>;
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto h-full flex flex-col">
      <div className="mb-8 shrink-0 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
            <LuFolderDown className="text-primary-600" /> Digital Resources
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Upload study materials, notes, and links to share with your students.</p>
        </div>
        <button
          onClick={handleOpenCreate}
          className="px-6 py-2.5 bg-primary-600 text-white font-bold rounded-xl hover:bg-primary-700 transition-colors flex items-center gap-2"
        >
          <LuPlus size={18} /> Add Resource
        </button>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col flex-1 min-h-0 overflow-hidden">
        <div className="flex border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 px-6 pt-4 shrink-0 overflow-x-auto custom-scrollbar">
          {['all', 'document', 'video', 'link', 'image'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 font-bold text-sm border-b-2 transition-colors flex items-center gap-2 capitalize whitespace-nowrap ${activeTab === tab ? 'border-primary-600 text-primary-700 bg-white dark:bg-slate-900' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100/50'}`}
            >
              {tab === 'all' ? 'All Files' : `${tab}s`}
            </button>
          ))}
        </div>

        <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex gap-4 shrink-0">
          <div className="relative flex-1 max-w-md">
            <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-300" size={20} />
            <input
              type="text"
              placeholder="Search resources..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900"
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {loading ? (
            <div className="flex justify-center items-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent"></div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {filteredResources.map(resource => {
                const resourceUrl = resource.fileUrl || resource.url;
                const resourceClass = resource.className
                  ? formatClassSection({ name: resource.className, section: resource.sectionName })
                  : (resource.class || 'All Classes');
                const resourceSubject = resource.subjectName || resource.subject || 'General';
                const resourceType = resource.type || resource.fileType || 'document';
                const resourceDate = resource.createdAt || resource.date;
                const isOwner = currentUserId && (resource.uploaderId === currentUserId || resource.teacherId === currentUserId);
                const canDeleteThis = hasDeletePermission || isOwner;

                return (
                  <div key={resource.id} className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 hover:border-primary-300 dark:hover:border-slate-700 hover:shadow-md transition-all group flex flex-col">
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-3">
                        {getTypeIcon(resourceType)}
                        <div>
                          <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-tight line-clamp-2" title={resource.title}>
                            {resource.title}
                          </h3>
                          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                            {resource.uploaderName ? `By ${resource.uploaderName}` : (resource.size || resourceType.toUpperCase())}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 mb-6">
                      <span className="px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                        {resourceClass}
                      </span>
                      <span className="px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider bg-primary-50 text-primary-600">
                        {resourceSubject}
                      </span>
                      <span className={`px-2.5 py-1 rounded-lg text-xs font-bold tracking-wider ${resource.audience === 'teachers_students' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                        {resource.audience === 'teachers_students' ? 'Teachers + Students' : 'Teachers only'}
                      </span>
                    </div>

                    <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center mt-auto">
                      <span className="text-xs font-semibold text-slate-400 dark:text-slate-300">
                        {resourceDate ? new Date(resourceDate).toLocaleDateString('en-GB') : 'No Date'}
                      </span>
                      <div className="flex gap-2">
                        {canDeleteThis && (
                          <button
                            onClick={() => handleDeleteClick(resource.id, resource.title)}
                            className="p-2 text-slate-400 dark:text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
                            title="Delete"
                          >
                            <LuTrash2 size={16} />
                          </button>
                        )}
                        <a
                          href={resourceUrl || '#'}
                          onClick={(e) => {
                            if (!resourceUrl || resourceUrl === '#') {
                              e.preventDefault();
                              toast.error("This resource does not have a valid download link.");
                            }
                          }}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 text-slate-400 dark:text-slate-300 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
                          title={resourceType === 'link' || resourceType === 'video' ? 'Open Link' : 'Download File'}
                        >
                          {resourceType === 'link' || resourceType === 'video' ? (
                            <LuExternalLink size={16} />
                          ) : (
                            <LuDownload size={16} />
                          )}
                        </a>
                      </div>
                    </div>
                  </div>
                );
              })}

              {filteredResources.length === 0 && (
                <div className="col-span-full text-center py-12 text-slate-500 dark:text-slate-400">
                  <LuFolderDown size={48} className="mx-auto mb-4 text-slate-300" />
                  <p className="text-lg font-medium text-slate-700 dark:text-slate-200">
                    {searchTerm.trim() ? `No resources match "${searchTerm.trim()}".` : 'No resources found.'}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Add Resource Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
          <form
            onSubmit={(e) => e.preventDefault()} // sending is done with the two explicit buttons below
            className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full shadow-2xl border border-slate-100 dark:border-slate-800 overflow-hidden transform transition-all flex flex-col max-h-[90vh]"
          >
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">Add New Resource</h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="p-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-400 dark:text-slate-300 hover:text-slate-600 dark:hover:text-slate-300 rounded-xl transition-colors"
              >
                <LuX size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-200 mb-2">Resource Title</label>
                <input
                  type="text"
                  placeholder="e.g. Calculus Chapter 4 Notes"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 focus:outline-none text-sm font-medium"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-200 mb-2">Resource Type</label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 focus:outline-none text-sm font-medium"
                >
                  <option value="document">Document (PDF/Doc)</option>
                  <option value="video">Video Explainer</option>
                  <option value="image">Image / Diagram</option>
                  <option value="link">Web Link / Simulator</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-200 mb-2">Class / Section</label>
                {targetOptions.length > 0 ? (
                  <select
                    value={selectedTarget ? selectedTarget.key : ''}
                    onChange={(e) => {
                      const opt = targetOptions.find(o => o.key === e.target.value);
                      if (!opt) return;
                      const allowedForOpt = !allowedTargets || opt.allSubjects ? null : opt.subjectIds;
                      setFormData(prev => ({
                        ...prev,
                        classId: opt.classId,
                        sectionId: opt.sectionId || '',
                        // keep the subject only if it is still allowed for the new section
                        subjectId: prev.subjectId && (!allowedForOpt || allowedForOpt.includes(prev.subjectId)) ? prev.subjectId : ''
                      }));
                    }}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 focus:outline-none text-sm font-medium"
                  >
                    {targetOptions.map(o => (
                      <option key={o.key} value={o.key}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-xs text-slate-400">No classes available. You can only share with sections you handle (class teacher or subject teacher).</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-200 mb-2">Subject</label>
                <select
                  value={formData.subjectId}
                  onChange={(e) => setFormData({ ...formData, subjectId: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 focus:outline-none text-sm font-medium"
                >
                  <option value="">General / None</option>
                  {selectableSubjects.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-400 dark:text-slate-300 mt-1.5">
                  {formData.subjectId
                    ? "Shared only with this section's class teacher and the teacher of this subject."
                    : "General: shared with the class teacher and every teacher of this section."}
                </p>
              </div>

              {(formData.type === 'link' || formData.type === 'video') && (
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-200 mb-2">
                    {formData.type === 'link' ? 'Web Link' : 'Video Link (optional if you upload a file)'}
                  </label>
                  <input
                    type="url"
                    placeholder="https://..."
                    value={formData.url}
                    onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 focus:outline-none text-sm font-medium"
                  />
                </div>
              )}

              {formData.type !== 'link' && (
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-200 mb-2">Upload File</label>
                  <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-slate-200 dark:border-slate-700 border-dashed rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer relative group">
                    <div className="space-y-1 text-center">
                      <LuFolderDown className="mx-auto h-12 w-12 text-slate-400 dark:text-slate-300 group-hover:text-primary-500 transition-colors" />
                      <div className="flex text-sm text-slate-600 dark:text-slate-300 justify-center">
                        <label className="relative cursor-pointer bg-white dark:bg-slate-900 rounded-md font-bold text-primary-600 hover:text-primary-700 focus-within:outline-none">
                          <span>{selectedFile ? 'Change file' : 'Select a file'}</span>
                          <input
                            type="file"
                            className="sr-only"
                            onChange={(e) => {
                              const file = e.target.files[0];
                              if (file) {
                                if (uploadLimit && file.size > uploadLimit.bytes) {
                                  toast.error(`File "${file.name}" exceeds the ${uploadLimit.mb}MB size limit.`);
                                  e.target.value = '';
                                  return;
                                }
                                setSelectedFile(file);
                                if (!formData.title) {
                                  setFormData(prev => ({ ...prev, title: file.name.substring(0, file.name.lastIndexOf('.')) || file.name }));
                                }
                              }
                            }}
                          />
                        </label>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{uploadLimit ? `Any file up to ${uploadLimit.mb}MB` : 'Select a file to upload'}</p>
                      {selectedFile && (
                        <div className="mt-2 p-2 bg-slate-100/80 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center justify-between gap-3">
                          <span className="truncate max-w-[200px]">{selectedFile.name}</span>
                          <span className="text-slate-500 dark:text-slate-400 shrink-0">({selectedFile.size > 1024 * 1024 ? (selectedFile.size / (1024 * 1024)).toFixed(1) + ' MB' : (selectedFile.size / 1024).toFixed(0) + ' KB'})</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 flex items-center justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-4 py-2 border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800 rounded-xl text-sm font-bold text-slate-700 dark:text-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={(e) => handleSubmit(e, 'teachers')}
                title="Only the class teacher and the subject teacher of the selected section will get this"
                className="px-5 py-2 border border-primary-600 text-primary-700 hover:bg-primary-50 dark:hover:bg-slate-700 rounded-xl text-sm font-bold shadow-sm transition-colors disabled:opacity-50"
              >
                {submittingAudience === 'teachers' ? 'Sending...' : 'Send to Teachers'}
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={(e) => handleSubmit(e, 'teachers_students')}
                title="Teachers of the selected section, plus the students (and their parents) in that section"
                className="px-5 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-bold shadow-sm transition-colors disabled:opacity-50"
              >
                {submittingAudience === 'teachers_students' ? 'Sending...' : 'Send to Teachers & Students'}
              </button>
            </div>
          </form>
        </div>
      )}
      {/* Confirm Delete Modal */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ isOpen: false, resourceId: null, resourceTitle: '' })}
        onConfirm={handleConfirmDelete}
        title="Delete Resource"
        message={`Are you sure you want to delete the resource "${confirmModal.resourceTitle}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
      />
    </div>
  );
}
