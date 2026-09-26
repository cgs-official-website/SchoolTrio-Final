import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getMyChildren, linkChild, unlinkChild } from '../../api/parents';
import { 
  LuPlus as Plus, 
  LuPencil as Pencil, 
  LuTrash2 as Trash2, 
  LuUsers as Users, 
  LuX as X, 
  LuBaby as Baby, 
  LuLink as LinkIcon, 
  LuGraduationCap as GraduationCap,
  LuSchool as SchoolIcon,
  LuArrowUpRight as ArrowUpRight,
  LuSparkles as Sparkles,
  LuIdCard as IdCard,
  LuCheck as Check,
  LuUnlink as UnlinkIcon
} from 'react-icons/lu';
import { normalizeGender } from '../../utils/genderUtils';
import { formatDate } from '../../utils/dateUtils';
import toast from 'react-hot-toast';

const getStoredActiveStudentId = () => {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem('sms_active_student_id') : null;
  } catch {
    return null;
  }
};

const setStoredActiveStudentId = (id) => {
  try {
    if (typeof localStorage !== 'undefined') {
      if (id) {
        localStorage.setItem('sms_active_student_id', id);
      } else {
        localStorage.removeItem('sms_active_student_id');
      }
    }
  } catch {}
};

export default function MyChildren() {
  const { currentUser, userProfile } = useAuth();
  const mountedRef = useRef(true);

  // Data states
  const [enrolledStudents, setEnrolledStudents] = useState([]);
  const [manualChildren, setManualChildren] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeStudentId, setActiveStudentId] = useState(() => {
    return getStoredActiveStudentId() || userProfile?.linkedStudentId || null;
  });

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [activeModalTab, setActiveModalTab] = useState('link_enrolled'); // 'link_enrolled' | 'manual_sibling'
  const [editingIndex, setEditingIndex] = useState(null);

  // Unlink Confirmation State
  const [unlinkingStudent, setUnlinkingStudent] = useState(null);
  const [isUnlinking, setIsUnlinking] = useState(false);

  // Link Enrolled Form State
  const [linkForm, setLinkForm] = useState({
    admissionNumber: '',
    dob: '',
    relationship: 'Child'
  });
  const [linkError, setLinkError] = useState('');
  const [isLinking, setIsLinking] = useState(false);

  // Manual Sibling Form State
  const [manualFormData, setManualFormData] = useState({
    name: '',
    dob: '',
    gender: 'Male',
    bloodGroup: '',
    schoolName: '',
    relationship: 'Sibling'
  });

  // 1. Authoritative REST Loader for Enrolled Children
  const loadChildren = useCallback(async () => {
    try {
      const res = await getMyChildren();
      if (!mountedRef.current) return;

      const links = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
      const mapped = links.map(link => {
        const st = link.student || {};
        return {
          ...st,
          linkId: link.id,
          relationship: link.relationship,
          linkCreatedAt: link.createdAt
        };
      });

      setEnrolledStudents(mapped);

      // Active student reconciliation (validate against authoritative list)
      setActiveStudentId(prevActiveId => {
        const storedId = getStoredActiveStudentId();
        const candidateId = storedId || prevActiveId || userProfile?.linkedStudentId;
        const isCandidateValid = candidateId && mapped.some(s => s.id === candidateId);

        if (isCandidateValid) {
          return candidateId;
        }
        const fallbackId = mapped[0]?.id || null;
        setStoredActiveStudentId(fallbackId);
        return fallbackId;
      });
    } catch (err) {
      console.error('[MyChildren] Error loading enrolled children:', err);
      if (mountedRef.current) {
        toast.error('Failed to load linked children.');
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [userProfile?.linkedStudentId]);

  // Initial Load & Lifecycle Guard
  useEffect(() => {
    mountedRef.current = true;
    loadChildren();
    return () => {
      mountedRef.current = false;
    };
  }, [loadChildren]);

  // Handle Switch Active Child
  const handleSwitchActive = (studentId, studentName) => {
    if (studentId === activeStudentId) return;
    const child = enrolledStudents.find(s => s.id === studentId);
    if (!child) return;

    setActiveStudentId(studentId);
    setStoredActiveStudentId(studentId);
    toast.success(`Switched active view to ${studentName || child.firstName || 'selected child'}`);
  };

  // Handle Link Enrolled Student Submit (POST /api/v1/parents/me/link-child)
  const handleLinkEnrolledSubmit = async (e) => {
    e.preventDefault();
    setLinkError('');

    const adm = linkForm.admissionNumber.trim();
    const dob = linkForm.dob.trim();
    const relationship = linkForm.relationship?.trim() || 'Child';

    if (!adm || !dob) {
      setLinkError('Please provide both Admission Number and Date of Birth.');
      return;
    }

    if (isLinking) return;
    setIsLinking(true);

    try {
      const res = await linkChild({
        admissionNumber: adm,
        dob,
        relationship
      });

      const linkedStudent = res?.data?.student;
      const studentName = linkedStudent ? `${linkedStudent.firstName || ''} ${linkedStudent.lastName || ''}`.trim() : 'Student';

      toast.success(`${studentName || 'Student'} linked successfully!`);
      closeAddModal();
      await loadChildren();
    } catch (error) {
      console.error('[MyChildren] Link error:', error);
      const status = error?.status || error?.response?.status;
      const errorMsg = error?.message || error?.response?.data?.message || '';

      if (status === 404 || errorMsg.toLowerCase().includes('not found')) {
        setLinkError('No enrolled student found matching this Admission Number and Date of Birth.');
      } else if (status === 409 || errorMsg.toLowerCase().includes('already linked')) {
        setLinkError('This student is already linked to your account.');
      } else if (status === 400) {
        setLinkError(errorMsg || 'Invalid admission number or date of birth format.');
      } else if (status === 403) {
        setLinkError('You do not have permission to link this student.');
      } else {
        setLinkError('An error occurred while linking. Please try again.');
      }
    } finally {
      if (mountedRef.current) {
        setIsLinking(false);
      }
    }
  };

  // Handle Manual Sibling Submit (Add or Edit)
  const handleManualSubmit = async (e) => {
    e.preventDefault();
    if (!manualFormData.name.trim() || !manualFormData.dob) {
      toast.error('Name and Date of Birth are required.');
      return;
    }

    try {
      if (!currentUser?.uid || !db) {
        toast.error('Session not initialized.');
        return;
      }
      const userRef = doc(db, 'users', currentUser.uid);
      const docSnap = await getDoc(userRef);
      let existingChildren = docSnap.exists() ? (docSnap.data().children || []) : [];

      if (editingIndex !== null) {
        existingChildren[editingIndex] = { ...manualFormData };
      } else {
        existingChildren.push({
          ...manualFormData,
          id: Date.now().toString()
        });
      }

      await updateDoc(userRef, { children: existingChildren });
      toast.success(editingIndex !== null ? 'Sibling updated successfully!' : 'Sibling added successfully!');
      closeAddModal();
    } catch (error) {
      console.error('[MyChildren] Error saving manual sibling:', error);
      toast.error('Failed to save sibling details.');
    }
  };

  // Handle Edit Manual Sibling
  const handleEditManual = (index) => {
    setManualFormData({ ...manualChildren[index] });
    setEditingIndex(index);
    setActiveModalTab('manual_sibling');
    setIsAddModalOpen(true);
  };

  // Handle Delete Manual Sibling
  const handleDeleteManual = async (index) => {
    if (!window.confirm('Are you sure you want to remove this sibling record?')) return;
    try {
      if (!currentUser?.uid || !db) return;
      const userRef = doc(db, 'users', currentUser.uid);
      const docSnap = await getDoc(userRef);
      if (docSnap.exists()) {
        const existingChildren = docSnap.data().children || [];
        const target = manualChildren[index];
        const updated = existingChildren.filter(c => c.id !== target.id && c.name !== target.name);
        await updateDoc(userRef, { children: updated });
        toast.success('Sibling record removed.');
      }
    } catch (error) {
      console.error('[MyChildren] Error removing manual sibling:', error);
      toast.error('Failed to remove sibling.');
    }
  };

  // Handle Unlink Enrolled Student (DELETE /api/v1/parents/me/children/:studentId)
  const handleConfirmUnlink = async () => {
    if (!unlinkingStudent || isUnlinking) return;
    setIsUnlinking(true);

    try {
      await unlinkChild(unlinkingStudent.id);
      const studentName = unlinkingStudent.firstName || unlinkingStudent.name || 'Student';
      toast.success(`Unlinked ${studentName} from account.`);
      setUnlinkingStudent(null);
      await loadChildren();
    } catch (error) {
      console.error('[MyChildren] Error unlinking student:', error);
      toast.error('Failed to unlink student.');
    } finally {
      if (mountedRef.current) {
        setIsUnlinking(false);
      }
    }
  };

  // Quick verify from manual sibling card
  const handlePromptVerifyManual = (sibling) => {
    setLinkForm({
      admissionNumber: '',
      dob: sibling.dob || '',
      relationship: sibling.relationship || 'Child'
    });
    setLinkError('');
    setActiveModalTab('link_enrolled');
    setIsAddModalOpen(true);
  };

  const closeAddModal = () => {
    setIsAddModalOpen(false);
    setEditingIndex(null);
    setLinkForm({ admissionNumber: '', dob: '', relationship: 'Child' });
    setLinkError('');
    setManualFormData({
      name: '',
      dob: '',
      gender: 'Male',
      bloodGroup: '',
      schoolName: '',
      relationship: 'Sibling'
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-[80vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent"></div>
      </div>
    );
  }

  const activeStudent = enrolledStudents.find(s => s.id === activeStudentId);
  const totalChildrenCount = enrolledStudents.length + manualChildren.length;

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto pb-24 min-w-0 w-full font-sans">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4 w-full">
        <div className="min-w-0 w-full">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">My Children</h1>
            <span className="px-3 py-1 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-xs font-bold rounded-full border border-primary-100 dark:border-primary-800">
              {totalChildrenCount} {totalChildrenCount === 1 ? 'Child' : 'Children'} Linked
            </span>
          </div>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm font-medium">
            Manage your enrolled students and siblings. Switch active profile to view specific academic reports.
          </p>
        </div>

        <button 
          onClick={() => {
            setActiveModalTab('link_enrolled');
            setIsAddModalOpen(true);
          }}
          className="px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-bold shadow-md shadow-primary-500/20 flex items-center gap-2 transition-all active:scale-95 text-sm shrink-0"
        >
          <Plus size={18} /> Link / Add Child
        </button>
      </div>

      {/* KPI Overview Summary Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <GraduationCap size={24} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Enrolled in School</p>
            <h3 className="text-2xl font-black text-slate-900 dark:text-white mt-0.5">{enrolledStudents.length}</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
            <Users size={24} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Other Siblings</p>
            <h3 className="text-2xl font-black text-slate-900 dark:text-white mt-0.5">{manualChildren.length}</h3>
          </div>
        </div>

        <div className="bg-gradient-to-br from-primary-600 to-indigo-700 p-5 rounded-2xl shadow-md text-white flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center shrink-0">
            <Sparkles size={24} className="text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-white/80 uppercase tracking-wider">Currently Viewing</p>
            <h3 className="text-lg font-black text-white truncate mt-0.5">
              {activeStudent ? `${activeStudent.firstName || ''} ${activeStudent.lastName || ''}`.trim() : 'None Selected'}
            </h3>
          </div>
        </div>
      </div>

      {/* SECTION 1: Officially Enrolled Students (Current Child + Enrolled Siblings) */}
      <div className="mb-12">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <GraduationCap className="text-primary-600" size={22} /> Enrolled Students
            </h2>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-0.5">
              Active student profiles with synchronized attendance, homework, report cards, and fee records.
            </p>
          </div>
        </div>

        {enrolledStudents.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
            <div className="w-14 h-14 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-3">
              <Baby size={28} />
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">No Enrolled Child Linked Yet</h3>
            <p className="text-slate-500 dark:text-slate-400 text-sm max-w-md mx-auto mb-5">
              Link your child using their official Admission Number and Date of Birth to view live academic records.
            </p>
            <button 
              onClick={() => {
                setActiveModalTab('link_enrolled');
                setIsAddModalOpen(true);
              }}
              className="px-6 py-2.5 bg-primary-600 text-white rounded-xl font-bold hover:bg-primary-700 transition-colors text-sm shadow-sm"
            >
              Link Enrolled Student
            </button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {enrolledStudents.map((child) => {
              const fullName = child.name || `${child.firstName || ''} ${child.lastName || ''}`.trim() || 'Student';
              const isActive = child.id === activeStudentId;
              const className = child.class?.name 
                ? `${child.class.name}${child.section?.name ? ` - ${child.section.name}` : ''}`
                : 'Class not assigned';

              return (
                <div 
                  key={child.id}
                  className={`bg-white dark:bg-slate-900 rounded-3xl border transition-all relative overflow-hidden flex flex-col justify-between ${
                    isActive 
                      ? 'border-primary-500 dark:border-primary-500 ring-2 ring-primary-500/20 shadow-lg shadow-primary-500/5' 
                      : 'border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md'
                  }`}
                >
                  {/* Top glowing accent bar for active child */}
                  {isActive && (
                    <div className="h-1.5 w-full bg-gradient-to-r from-primary-500 to-indigo-600 absolute top-0 left-0"></div>
                  )}

                  <div className="p-6">
                    {/* Header Row */}
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div className="flex items-center gap-3.5 min-w-0">
                        {child.photoUrl ? (
                          <img 
                            src={child.photoUrl} 
                            alt={fullName} 
                            className="w-14 h-14 rounded-2xl object-cover border-2 border-slate-100 dark:border-slate-800 shrink-0 shadow-sm" 
                          />
                        ) : (
                          <div className="w-14 h-14 bg-gradient-to-br from-primary-500 to-indigo-600 text-white rounded-2xl flex items-center justify-center font-black text-lg shadow-md shadow-primary-500/20 shrink-0">
                            {fullName.substring(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <h3 className="text-lg font-bold text-slate-900 dark:text-white truncate leading-tight">
                            {fullName}
                          </h3>
                          <p className="text-xs font-semibold text-primary-600 dark:text-primary-400 mt-1 flex items-center gap-1.5">
                            <SchoolIcon size={13} /> {className}
                          </p>
                        </div>
                      </div>

                      {/* Unlink Action */}
                      <button 
                        onClick={() => setUnlinkingStudent(child)}
                        className="text-slate-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-slate-800 transition-colors shrink-0"
                        title="Unlink student"
                      >
                        <UnlinkIcon size={16} />
                      </button>
                    </div>

                    {/* Badges Row */}
                    <div className="flex flex-wrap items-center gap-2 mb-4">
                      {isActive ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> Active Child
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                          {child.relationship || 'Enrolled Sibling'}
                        </span>
                      )}

                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary-50 dark:bg-primary-950/30 text-primary-700 dark:text-primary-300 border border-primary-100 dark:border-primary-800">
                        <IdCard size={12} /> {child.admissionNumber || 'No Adm No'}
                      </span>
                    </div>

                    {/* Metadata Grid */}
                    <div className="space-y-2.5 text-xs pt-3 border-t border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-300">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400 dark:text-slate-500 font-medium">Roll Number</span>
                        <span className="font-bold text-slate-800 dark:text-slate-100">{child.rollNumber || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400 dark:text-slate-500 font-medium">Date of Birth</span>
                        <span className="font-bold text-slate-800 dark:text-slate-100">
                          {formatDate(child.dob)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400 dark:text-slate-500 font-medium">Gender / Blood</span>
                        <span className="font-bold text-slate-800 dark:text-slate-100">
                          {child.gender || 'N/A'}{child.bloodGroup ? ` • ${child.bloodGroup}` : ''}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Card Action Footer */}
                  <div className="p-4 bg-slate-50/80 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                    {isActive ? (
                      <div className="flex items-center gap-2 w-full">
                        <Link 
                          to="/parent"
                          className="flex-1 py-2 text-center text-xs font-bold bg-primary-600 hover:bg-primary-700 text-white rounded-xl transition-colors shadow-sm flex items-center justify-center gap-1.5"
                        >
                          Overview <ArrowUpRight size={14} />
                        </Link>
                        <Link 
                          to="/parent/grades"
                          className="px-3 py-2 text-center text-xs font-bold bg-white dark:bg-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl transition-colors"
                        >
                          Report Card
                        </Link>
                      </div>
                    ) : (
                      <button 
                        onClick={() => handleSwitchActive(child.id, fullName)}
                        className="w-full py-2.5 text-center text-xs font-bold bg-white dark:bg-slate-800 hover:bg-primary-50 dark:hover:bg-slate-700 text-primary-700 dark:text-primary-300 border border-primary-200 dark:border-primary-800 rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-sm active:scale-98"
                      >
                        <Check size={14} /> Set as Active Child
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SECTION 2: Manual Siblings & Dependents (Other Schools / Toddlers) */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Baby className="text-indigo-600" size={22} /> Other Siblings & Dependents
            </h2>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-0.5">
              Family members attending other schools or not yet enrolled. You can link them anytime.
            </p>
          </div>

          <button 
            onClick={() => {
              setActiveModalTab('manual_sibling');
              setIsAddModalOpen(true);
            }}
            className="text-xs font-bold text-primary-600 hover:text-primary-700 flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-primary-50 dark:hover:bg-slate-800 transition-colors"
          >
            <Plus size={14} /> Add Sibling Record
          </button>
        </div>

        {manualChildren.length === 0 ? (
          <div className="text-center py-8 bg-slate-50/50 dark:bg-slate-900/40 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-4">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              No extra sibling profiles registered. Click "Add Sibling Record" if you wish to record siblings in other institutions.
            </p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {manualChildren.map((child, index) => (
              <div 
                key={child.id || index} 
                className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 hover:shadow-md transition-all group relative flex flex-col justify-between"
              >
                {/* Actions */}
                <div className="absolute top-4 right-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={() => handleEditManual(index)}
                    className="p-1.5 text-slate-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
                    title="Edit"
                  >
                    <Pencil size={15} />
                  </button>
                  <button 
                    onClick={() => handleDeleteManual(index)}
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>

                <div>
                  <div className="flex items-center gap-3.5 mb-4">
                    <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-2xl flex items-center justify-center font-bold text-base shrink-0">
                      {child.name ? child.name.substring(0, 2).toUpperCase() : 'SB'}
                    </div>
                    <div className="min-w-0 pr-12">
                      <h3 className="text-base font-bold text-slate-900 dark:text-white truncate">{child.name}</h3>
                      <span className="inline-block mt-0.5 text-[11px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                        {child.relationship || 'Sibling'}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2 text-xs pt-3 border-t border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-300">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 dark:text-slate-500 font-medium">Date of Birth</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-100">
                        {formatDate(child.dob)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 dark:text-slate-500 font-medium">Gender</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-100">{child.gender || 'N/A'}</span>
                    </div>
                    {child.schoolName && (
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400 dark:text-slate-500 font-medium">Other School</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-100 truncate max-w-[130px]">{child.schoolName}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <button 
                    onClick={() => handlePromptVerifyManual(child)}
                    className="w-full py-2 text-xs font-bold text-primary-700 dark:text-primary-300 bg-primary-50 dark:bg-primary-950/40 hover:bg-primary-100 rounded-xl transition-colors flex items-center justify-center gap-1.5"
                  >
                    <LinkIcon size={14} /> Verify & Link to this School
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* MODAL: Link Enrolled Student OR Add Sibling */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl animate-scale-up flex flex-col max-h-[90vh] border border-slate-200 dark:border-slate-800">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
              <div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                  {editingIndex !== null ? 'Edit Sibling Details' : 'Add or Link a Child'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Link an enrolled school account or record family details.
                </p>
              </div>
              <button 
                onClick={closeAddModal} 
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Tab Selector (only when creating new) */}
            {editingIndex === null && (
              <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-1.5 gap-1.5">
                <button
                  type="button"
                  onClick={() => setActiveModalTab('link_enrolled')}
                  className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${
                    activeModalTab === 'link_enrolled'
                      ? 'bg-white dark:bg-slate-900 text-primary-600 dark:text-primary-400 shadow-sm'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <GraduationCap size={16} /> Link Enrolled Student
                </button>
                <button
                  type="button"
                  onClick={() => setActiveModalTab('manual_sibling')}
                  className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${
                    activeModalTab === 'manual_sibling'
                      ? 'bg-white dark:bg-slate-900 text-primary-600 dark:text-primary-400 shadow-sm'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Baby size={16} /> Other Sibling / Dependent
                </button>
              </div>
            )}

            {/* TAB 1: Link Enrolled Student */}
            {activeModalTab === 'link_enrolled' && editingIndex === null && (
              <form onSubmit={handleLinkEnrolledSubmit} className="p-6 space-y-4 overflow-y-auto custom-scrollbar">
                <div className="bg-primary-50 dark:bg-primary-950/40 text-primary-900 dark:text-primary-200 p-4 rounded-2xl text-xs font-medium border border-primary-100 dark:border-primary-800 leading-relaxed">
                  Enter your child's <strong>Admission Number</strong> and <strong>Date of Birth</strong> as registered in school records to securely link their profile.
                </div>

                {linkError && (
                  <div className="p-3.5 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 rounded-xl text-xs font-semibold border border-red-200 dark:border-red-800">
                    {linkError}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1.5">
                    Admission Number <span className="text-red-500">*</span>
                  </label>
                  <input 
                    type="text" 
                    required
                    value={linkForm.admissionNumber}
                    onChange={(e) => setLinkForm({ ...linkForm, admissionNumber: e.target.value })}
                    placeholder="e.g. ADM-2024-001 or 1001"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-primary-500 outline-none transition-all text-sm font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1.5">
                    Date of Birth <span className="text-red-500">*</span>
                  </label>
                  <input 
                    type="date" 
                    required
                    value={linkForm.dob}
                    onChange={(e) => setLinkForm({ ...linkForm, dob: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-primary-500 outline-none transition-all text-sm font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1.5">
                    Relationship
                  </label>
                  <select 
                    value={linkForm.relationship}
                    onChange={(e) => setLinkForm({ ...linkForm, relationship: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-primary-500 outline-none transition-all text-sm font-semibold"
                  >
                    <option value="Father">Father</option>
                    <option value="Mother">Mother</option>
                    <option value="Guardian">Guardian</option>
                    <option value="Child">Child</option>
                    <option value="Parent">Parent</option>
                  </select>
                </div>

                <div className="pt-4 flex justify-end gap-3 border-t border-slate-100 dark:border-slate-800">
                  <button 
                    type="button" 
                    onClick={closeAddModal}
                    className="px-5 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-bold hover:bg-slate-50 transition-colors text-xs"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    disabled={isLinking}
                    className="px-6 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-bold shadow-md shadow-primary-500/20 transition-all text-xs flex items-center gap-2 disabled:opacity-50"
                  >
                    {isLinking ? 'Verifying...' : 'Verify & Link Student'}
                  </button>
                </div>
              </form>
            )}

            {/* TAB 2: Manual Sibling Form */}
            {(activeModalTab === 'manual_sibling' || editingIndex !== null) && (
              <form onSubmit={handleManualSubmit} className="p-6 space-y-4 overflow-y-auto custom-scrollbar">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1.5">
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <input 
                    type="text" 
                    required
                    value={manualFormData.name}
                    onChange={(e) => setManualFormData({ ...manualFormData, name: e.target.value })}
                    placeholder="e.g. Sarah Doe"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-primary-500 outline-none transition-all text-sm font-semibold"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1.5">
                      Date of Birth <span className="text-red-500">*</span>
                    </label>
                    <input 
                      type="date" 
                      required
                      value={manualFormData.dob}
                      onChange={(e) => setManualFormData({ ...manualFormData, dob: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-primary-500 outline-none transition-all text-sm font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1.5">
                      Gender
                    </label>
                    <select 
                      value={normalizeGender(manualFormData.gender, 'Male')}
                      onChange={(e) => setManualFormData({ ...manualFormData, gender: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-primary-500 outline-none transition-all text-sm font-semibold"
                    >
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1.5">
                      Relationship
                    </label>
                    <select 
                      value={manualFormData.relationship}
                      onChange={(e) => setManualFormData({ ...manualFormData, relationship: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-primary-500 outline-none transition-all text-sm font-semibold"
                    >
                      <option value="Sibling">Sibling</option>
                      <option value="Child">Child</option>
                      <option value="Dependent">Dependent</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1.5">
                      Blood Group
                    </label>
                    <select 
                      value={manualFormData.bloodGroup}
                      onChange={(e) => setManualFormData({ ...manualFormData, bloodGroup: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-primary-500 outline-none transition-all text-sm font-semibold"
                    >
                      <option value="">Select...</option>
                      {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(bg => (
                        <option key={bg} value={bg}>{bg}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1.5">
                    School Name (Optional)
                  </label>
                  <input 
                    type="text" 
                    value={manualFormData.schoolName}
                    onChange={(e) => setManualFormData({ ...manualFormData, schoolName: e.target.value })}
                    placeholder="If studying at another school..."
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-primary-500 outline-none transition-all text-sm font-semibold"
                  />
                </div>

                <div className="pt-4 flex justify-end gap-3 border-t border-slate-100 dark:border-slate-800">
                  <button 
                    type="button" 
                    onClick={closeAddModal}
                    className="px-5 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-bold hover:bg-slate-50 transition-colors text-xs"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="px-6 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl font-bold hover:bg-slate-800 transition-colors text-xs"
                  >
                    {editingIndex !== null ? 'Save Changes' : 'Add Sibling'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* MODAL: Unlink Confirmation */}
      {unlinkingStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl p-6 border border-slate-200 dark:border-slate-800 text-center">
            <div className="w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <UnlinkIcon size={24} />
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Unlink Student?</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">
              Are you sure you want to unlink <strong>{unlinkingStudent.firstName} {unlinkingStudent.lastName}</strong> from this parent account? You can re-link them at any time with their Admission Number.
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setUnlinkingStudent(null)}
                className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold text-xs hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleConfirmUnlink}
                disabled={isUnlinking}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-xs transition-colors shadow-sm disabled:opacity-50"
              >
                {isUnlinking ? 'Unlinking...' : 'Yes, Unlink'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
