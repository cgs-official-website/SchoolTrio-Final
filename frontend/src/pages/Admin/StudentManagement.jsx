import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { listStudents, createStudent, updateStudent, deleteStudent, bulkImportStudents, getStudentHealth, updateStudentHealth } from '../../api/students';
import { listClasses } from '../../api/classes';

import { getStudentAttendance } from '../../api/attendance';
import { admissionsApi } from '../../api/admissions';
import { useAuth } from '../../context/AuthContext';
import { uploadFileToCloudinaryOrFirebase, uploadCustomDataFiles } from '../../utils/cloudinary';
import { 
  LuSearch as Search, LuFilter as Filter, LuUserPlus as UserPlus, LuCircleCheck as CheckCircle2, 
  LuGraduationCap as GraduationCap, LuCloudUpload as UploadCloud, LuFileText as FileText, 
  LuExternalLink as ExternalLink, LuX as X, LuEye as Eye, LuTrash2 as Trash, LuDownload as Download, 
  LuFileDown as FileDown, LuLink as LinkIcon, LuShare2 as Share2, LuCheck as Check, LuClock as Clock, 
  LuTriangleAlert as AlertTriangle, LuSparkles as Sparkles, LuCopy as Copy, LuMail as Mail, 
  LuUserCheck as UserCheck, LuBookOpen as BookOpen, LuPhone as Phone, LuMapPin as MapPin, 
  LuCalendar as Calendar, LuArrowRight as ArrowRight
} from 'react-icons/lu';
import { TableSkeleton } from '../../components/Skeleton';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import ConfirmModal from '../../components/ConfirmModal';
import ImageCropper from '../../components/ImageCropper';
import usePermissions from '../../hooks/usePermissions';
import { sortClassesAscending } from '../../utils/classSorting';
import { normalizeGender, isMale, isFemale } from '../../utils/genderUtils';
import { validateName, validateDateOfBirth, validateBloodGroup, validateAadhaarNumber, validatePhone, validateEmail, getTodayDateString } from '../../utils/validationUtils';
import { notifyDataChanged } from '../../utils/liveData';
import { useLiveDataRefresh } from '../../hooks/useLiveDataRefresh';
import { formatDate } from '../../utils/dateUtils';

export default function StudentManagement() {
  const { userProfile } = useAuth();
  const schoolId = userProfile?.schoolId;
  const { canCreate, canEdit, canDelete } = usePermissions();
  const hasCreatePermission = userProfile?.role?.toLowerCase() === 'admin' || userProfile?.role?.toLowerCase() === 'superadmin' || canCreate('students');
  const hasEditPermission = userProfile?.role?.toLowerCase() === 'admin' || userProfile?.role?.toLowerCase() === 'superadmin' || canEdit('students');
  const hasDeletePermission = userProfile?.role?.toLowerCase() === 'admin' || userProfile?.role?.toLowerCase() === 'superadmin' || canDelete('students');

  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [schoolName, setSchoolName] = useState('');
  const [schoolData, setSchoolData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Directory Tabs & Admission Applications State
  const [activeDirectoryTab, setActiveDirectoryTab] = useState('enrolled'); // 'enrolled' | 'applications'
  const [admissionApplications, setAdmissionApplications] = useState([]);
  const [appSearchQuery, setAppSearchQuery] = useState('');
  const [appStatusFilter, setAppStatusFilter] = useState('all'); // 'all', 'Pending', 'Approved', 'Rejected'
  const [selectedAppForReview, setSelectedAppForReview] = useState(null);
  const [reviewAppModalOpen, setReviewAppModalOpen] = useState(false);
  const [assigningAppClassId, setAssigningAppClassId] = useState('');
  const [assigningAppAdmissionNumber, setAssigningAppAdmissionNumber] = useState('');
  const [approvingApp, setApprovingApp] = useState(false);
  const [rejectingApp, setRejectingApp] = useState(false);
  const [shareLinkModalOpen, setShareLinkModalOpen] = useState(false);
  const [copiedAdmissionLink, setCopiedAdmissionLink] = useState(false);
  const [appCurrentPage, setAppCurrentPage] = useState(1);
  const [appRowsPerPage, setAppRowsPerPage] = useState(10);
  const [newAdmissionDropdownOpen, setNewAdmissionDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setNewAdmissionDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Form State
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    firstName: '', lastName: '', admissionNumber: '', classId: '', parentEmail: '', dob: '', gender: 'Male', status: 'Active',
    age: '', bloodGroup: '', nationality: '', religion: '', motherTongue: '', aadharNumber: '',
    homeAddress: '', parentName: '', parentPhone: '', parentOccupation: '', emergencyContact: '', annualIncome: '', siblingName: '',
    previousSchool: '', previousRecords: '', subjectsChosen: '', busRoute: '',
    tuitionFee: '', hostelFee: '', bookFee: '', otherFee: '', totalFee: ''
  });
  const [addErrors, setAddErrors] = useState({});
  const [customData, setCustomData] = useState({});
  const [formSchema, setFormSchema] = useState([]);
  const [photoFile, setPhotoFile] = useState(null);
  
  // Crop state
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [tempImageFile, setTempImageFile] = useState(null);
  const [cropTarget, setCropTarget] = useState(''); // 'add' or 'edit'
  // Upload Modal State
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [selectedStudentForUpload, setSelectedStudentForUpload] = useState(null);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  // Live Import Progress Modal State
  const [importProgressModalOpen, setImportProgressModalOpen] = useState(false);
  const [importProgressStats, setImportProgressStats] = useState({
    total: 0,
    processed: 0,
    currentBatch: 0,
    totalBatches: 0,
    successCount: 0,
    failedCount: 0,
    percentage: 0
  });


  // View Modal State
  const [viewStudentModalOpen, setViewStudentModalOpen] = useState(false);
  const [selectedStudentToView, setSelectedStudentToView] = useState(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editStudentData, setEditStudentData] = useState(null);
  const [editCustomData, setEditCustomData] = useState({});
  const [editErrors, setEditErrors] = useState({});
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [editPhotoFile, setEditPhotoFile] = useState(null);

  // Assign Modal State
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedStudentForAssign, setSelectedStudentForAssign] = useState(null);
  const [selectedClassIdForAssign, setSelectedClassIdForAssign] = useState('');
  const [assigning, setAssigning] = useState(false);

  const [confirmDeleteState, setConfirmDeleteState] = useState({ isOpen: false, id: null, name: '' });

  // Export State
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFileName, setExportFileName] = useState('');
  const [selectedFields, setSelectedFields] = useState({
    name: true,
    admissionNumber: true,
    classSection: true,
    dob: true,
    gender: true,
    parentName: true,
    parentPhone: true,
    parentEmail: true,
    homeAddress: true
  });

  const handleFieldToggle = (field) => {
    setSelectedFields(prev => ({
      ...prev,
      [field]: !prev[field]
    }));
  };

  const handleExport = () => {
    if (filteredStudents.length === 0) {
      toast.error("No student data available to export.");
      return;
    }

    const activeFields = Object.keys(selectedFields).filter(k => selectedFields[k]);
    if (activeFields.length === 0) {
      toast.error("Please select at least one column to export.");
      return;
    }

    const exportData = filteredStudents.map((student, index) => {
      const row = { "S.No": index + 1 };
      if (selectedFields.name) row["Student Name"] = `${student.firstName} ${student.lastName}`.trim();
      if (selectedFields.admissionNumber) row["Admission Number"] = student.admissionNumber || '';
      if (selectedFields.classSection) row["Class & Section"] = getClassName(student.classId, student);
      if (selectedFields.dob) row["Date of Birth"] = formatDate(student.dob);
      if (selectedFields.gender) row["Gender"] = student.gender || '';
      if (selectedFields.parentName) row["Parent Name"] = student.parentName || '';
      if (selectedFields.parentPhone) row["Parent Phone"] = student.parentPhone || '';
      if (selectedFields.parentEmail) row["Parent Email"] = student.parentEmail || '';
      if (selectedFields.homeAddress) row["Home Address"] = student.homeAddress || '';
      return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Students");

    const rawName = exportFileName.trim() || "Student_Directory";
    const finalFileName = rawName.toLowerCase().endsWith('.xlsx') ? rawName : `${rawName}.xlsx`;

    XLSX.writeFile(workbook, finalFileName);
    setShowExportModal(false);
    toast.success("Student directory exported successfully!");
  };

  const handleDeleteStudent = async (studentId) => {
    try {
      await deleteStudent(studentId);
      toast.success("Student deleted successfully!");
      setConfirmDeleteState({ isOpen: false, id: null, name: '' });
      await fetchData();
      notifyDataChanged('students');
    } catch (error) {
      console.error("Error deleting student:", error);
      const errorMsg = error.response?.data?.message || error.message || "Failed to delete student.";
      toast.error(errorMsg);
    }
  };

  // Filters & Pagination
  const [searchQuery, setSearchQuery] = useState('');
  const [classFilter, setClassFilter] = useState('all');
  const [genderFilter, setGenderFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // --- Attendance History states ---
  const [studentStats, setStudentStats] = useState(null);
  const [studentHistory, setStudentHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (!selectedStudentToView || !viewStudentModalOpen) {
      setStudentStats(null);
      setStudentHistory([]);
      return;
    }

    let isMounted = true;
    setLoadingHistory(true);

    getStudentAttendance(selectedStudentToView.id, { filter: 'monthly' })
      .then((res) => {
        if (!isMounted) return;
        if (res?.cumulativeStat) {
          setStudentStats(res.cumulativeStat);
        } else {
          setStudentStats(null);
        }
        if (Array.isArray(res?.timeline)) {
          setStudentHistory(res.timeline);
        } else {
          setStudentHistory([]);
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error("Error loading student attendance history:", err);
        setStudentStats(null);
        setStudentHistory([]);
      })
      .finally(() => {
        if (isMounted) setLoadingHistory(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedStudentToView, viewStudentModalOpen]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [studentsRes, classesRes, applicationsRes] = await Promise.all([
        listStudents({ limit: 1000 }),
        listClasses({ limit: 100 }),
        admissionsApi.getApplications({ limit: 500 }).catch(err => {
          console.warn("Could not load admission applications:", err);
          return { data: [] };
        })
      ]);

      const rawStudents = Array.isArray(studentsRes?.data) ? studentsRes.data : [];
      const normalizedStudents = rawStudents.map(s => {
        const cd = s.customData || {};
        return {
          ...cd,
          ...s,
          customData: cd,
          parentName: s.parentName || cd.parentName || '',
          parentPhone: s.parentPhone || cd.parentPhone || '',
          parentEmail: s.parentEmail || cd.parentEmail || '',
          parentOccupation: s.parentOccupation || cd.parentOccupation || '',
          homeAddress: s.homeAddress || cd.homeAddress || '',
          emergencyContact: s.emergencyContact || cd.emergencyContact || '',
          annualIncome: s.annualIncome || cd.annualIncome || '',
          siblingName: s.siblingName || cd.siblingName || '',
          previousSchool: s.previousSchool || cd.previousSchool || '',
          previousRecords: s.previousRecords || cd.previousRecords || '',
          subjectsChosen: s.subjectsChosen || cd.subjectsChosen || '',
          busRoute: s.busRoute || cd.busRoute || '',
          tuitionFee: s.tuitionFee || cd.tuitionFee || '',
          hostelFee: s.hostelFee || cd.hostelFee || '',
          bookFee: s.bookFee || cd.bookFee || '',
          otherFee: s.otherFee || cd.otherFee || '',
          totalFee: s.totalFee || cd.totalFee || '',
          nationality: s.nationality || cd.nationality || '',
          religion: s.religion || cd.religion || '',
          motherTongue: s.motherTongue || cd.motherTongue || '',
          aadharNumber: s.aadhaarNumber || cd.aadharNumber || cd.aadhaarNumber || '',
          attachmentUrl: cd.attachmentUrl || '',
          attachmentName: cd.attachmentName || ''
        };
      });
      setStudents(normalizedStudents);

      const rawClasses = Array.isArray(classesRes?.data) ? classesRes.data : [];
      const sortedClasses = sortClassesAscending(rawClasses);
      setClasses(sortedClasses);

      const rawApps = Array.isArray(applicationsRes?.data) ? applicationsRes.data : [];
      const normalizedApps = rawApps.map(app => {
        const cd = app.customData || {};
        return {
          ...cd,
          ...app,
          customData: cd,
          studentName: app.studentName || `${cd.firstName || ''} ${cd.lastName || ''}`.trim() || 'Student',
          firstName: cd.firstName || (app.studentName ? app.studentName.split(' ')[0] : 'Student'),
          lastName: cd.lastName || (app.studentName && app.studentName.split(' ').length > 1 ? app.studentName.split(' ').slice(1).join(' ') : ''),
          targetClassId: app.classId || cd.targetClassId || '',
          targetClassName: app.class ? `${app.class.name} - ${app.class.section}` : (cd.targetClassName || ''),
          parentName: app.parentName || cd.parentName || '',
          parentPhone: app.parentPhone || cd.parentPhone || '',
          parentEmail: app.parentEmail || cd.parentEmail || '',
          homeAddress: app.address || cd.homeAddress || '',
          photoUrl: app.photoUrl || cd.photoUrl || null
        };
      });
      setAdmissionApplications(normalizedApps);
    } catch (error) {
      console.error("Error loading students or classes:", error);
      toast.error(error.response?.data?.message || "Failed to load students");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useLiveDataRefresh(fetchData, [fetchData], ['students', 'classes', 'admissions']);

  // Handle Opening Application Review Modal
  const handleOpenReviewModal = (app) => {
    setSelectedAppForReview(app);
    setAssigningAppClassId(app.targetClassId || (classes[0]?.id || ''));
    
    // Auto-generate a clean admission number if one isn't already assigned
    const year = new Date().getFullYear();
    const existingNums = students.map(s => parseInt((s.admissionNumber || '').replace(/\D/g, ''))).filter(n => !isNaN(n));
    const maxNum = existingNums.length > 0 ? Math.max(...existingNums) : students.length;
    const nextSeq = (maxNum + 1).toString().padStart(3, '0');
    
    setAssigningAppAdmissionNumber(app.assignedAdmissionNumber || `ADM-${year}-${nextSeq}`);
    setReviewAppModalOpen(true);
  };

  // Handle Approving & Admitting Application via transactional backend endpoint
  const handleApproveApplication = async () => {
    if (!selectedAppForReview) return;
    const app = selectedAppForReview;

    const finalAdmNumber = (assigningAppAdmissionNumber || '').trim();
    if (!finalAdmNumber) {
      toast.error("Please enter a valid Admission Number.");
      return;
    }

    setApprovingApp(true);
    try {
      const targetClassId = assigningAppClassId || app.targetClassId || classes[0]?.id;
      if (!targetClassId) {
        toast.error("Please select a valid class for enrollment.");
        setApprovingApp(false);
        return;
      }

      await admissionsApi.enrollApplication(app.id, {
        admissionNumber: finalAdmNumber,
        classId: targetClassId
      });

      toast.success(`Student ${app.studentName || app.firstName} admitted successfully to the student directory!`, {
        icon: '🎓'
      });
      setReviewAppModalOpen(false);
      setSelectedAppForReview(null);
      fetchData();
    } catch (err) {
      console.error("Error approving admission:", err);
      toast.error("Failed to admit student: " + (err.response?.data?.message || err.message || 'Unknown error'));
    } finally {
      setApprovingApp(false);
    }
  };

  const handleRejectApplication = async (appId) => {
    setRejectingApp(true);
    try {
      await admissionsApi.updateApplicationStatus(appId, { status: 'Rejected' });
      setAdmissionApplications(prev => prev.map(a => a.id === appId ? { ...a, status: 'Rejected' } : a));
      toast.success("Application status marked as Rejected.");
      setReviewAppModalOpen(false);
      setSelectedAppForReview(null);
    } catch (err) {
      console.error("Error rejecting application:", err);
      toast.error(err.response?.data?.message || "Failed to reject application.");
    } finally {
      setRejectingApp(false);
    }
  };

  const handleDeleteApplication = async (appId) => {
    try {
      await admissionsApi.deleteApplication(appId);
      setAdmissionApplications(prev => prev.filter(a => a.id !== appId));
      toast.success("Application deleted.");
    } catch (err) {
      console.error("Error deleting application:", err);
      toast.error(err.response?.data?.message || "Failed to delete application.");
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();

    // Check Seat Limit
    const effectiveSeatLimit = schoolData?.seatLimit || (schoolData?.plan?.toLowerCase() === 'enterprise' ? 2000 : schoolData?.plan?.toLowerCase() === 'basic' ? 100 : 500);
    if (students.length >= effectiveSeatLimit) {
      toast.error(`School student capacity limit of ${effectiveSeatLimit} seats reached! Please contact SuperAdmin to expand your school license limit.`, {
        duration: 6000,
        icon: '⚠️'
      });
      return;
    }

    // Validation: Name, DOB, Blood Group, Aadhaar, Phone, Email, and Admission Number
    const firstNameError = validateName(formData.firstName, 'First name');
    const lastNameError = validateName(formData.lastName, 'Last name');
    const dobError = validateDateOfBirth(formData.dob, true);
    const bloodGroupError = validateBloodGroup(formData.bloodGroup, false);
    const aadhaarError = validateAadhaarNumber(formData.aadharNumber, false);
    const parentPhoneError = validatePhone(formData.parentPhone, true, 'Parent phone number');
    const parentEmailError = validateEmail(formData.parentEmail, false);

    let admissionNumberError = null;
    if (!formData.admissionNumber?.trim()) {
      admissionNumberError = "Admission number is required";
    } else {
      const isDuplicate = students.some(
        s => s.admissionNumber?.toLowerCase() === formData.admissionNumber.trim().toLowerCase()
      );
      if (isDuplicate) {
        admissionNumberError = `Student with Admission Number ${formData.admissionNumber} already exists.`;
      }
    }

    if (firstNameError || lastNameError || dobError || bloodGroupError || aadhaarError || parentPhoneError || parentEmailError || admissionNumberError) {
      const errors = {};
      if (firstNameError) errors.firstName = firstNameError;
      if (lastNameError) errors.lastName = lastNameError;
      if (dobError) errors.dob = dobError;
      if (bloodGroupError) errors.bloodGroup = bloodGroupError;
      if (aadhaarError) errors.aadharNumber = aadhaarError;
      if (parentPhoneError) errors.parentPhone = parentPhoneError;
      if (parentEmailError) errors.parentEmail = parentEmailError;
      if (admissionNumberError) errors.admissionNumber = admissionNumberError;
      setAddErrors(prev => ({ ...prev, ...errors }));
      toast.error(firstNameError || lastNameError || dobError || bloodGroupError || aadhaarError || parentPhoneError || parentEmailError || admissionNumberError);
      return;
    }

    setSaving(true);
    try {
      let photoUrl = '';
      if (photoFile) {
        const safeStudentName = `${formData.firstName} ${formData.lastName}`.replace(/[^a-z0-9]/gi, '_').trim();
        const safeSchoolName = (schoolName || 'School').replace(/[^a-z0-9]/gi, '_').trim();
        const safeFileName = photoFile.name.replace(/[^a-z0-9.]/gi, '_');
        const storagePath = `${safeSchoolName}/Students/${safeStudentName}/photo_${safeFileName}`;
        photoUrl = await uploadFileToCloudinaryOrFirebase(photoFile, schoolId, storagePath);
      }

      const uploadedCustomData = await uploadCustomDataFiles(customData, schoolId, 'students');

      const customDataPayload = {
        parentName: (formData.parentName || '').trim(),
        parentPhone: (formData.parentPhone || '').trim(),
        parentEmail: (formData.parentEmail || '').trim(),
        parentOccupation: (formData.parentOccupation || '').trim(),
        emergencyContact: (formData.emergencyContact || '').trim(),
        annualIncome: (formData.annualIncome || '').trim(),
        siblingName: (formData.siblingName || '').trim(),
        homeAddress: (formData.homeAddress || '').trim(),
        previousSchool: (formData.previousSchool || '').trim(),
        previousRecords: (formData.previousRecords || '').trim(),
        subjectsChosen: (formData.subjectsChosen || '').trim(),
        busRoute: (formData.busRoute || '').trim(),
        tuitionFee: (formData.tuitionFee || '').trim(),
        hostelFee: (formData.hostelFee || '').trim(),
        bookFee: (formData.bookFee || '').trim(),
        otherFee: (formData.otherFee || '').trim(),
        totalFee: (formData.totalFee || '').trim(),
        nationality: (formData.nationality || '').trim(),
        religion: (formData.religion || '').trim(),
        motherTongue: (formData.motherTongue || '').trim(),
        ...(uploadedCustomData || {})
      };

      const [cId, sId] = (formData.classId || '').split(':');

      const payload = {
        admissionNumber: formData.admissionNumber.trim(),
        firstName: formData.firstName.trim(),
        lastName: formData.lastName ? formData.lastName.trim() : null,
        dob: formData.dob || null,
        gender: formData.gender || null,
        bloodGroup: formData.bloodGroup ? formData.bloodGroup.trim().toUpperCase() : null,
        aadhaarNumber: formData.aadharNumber ? formData.aadharNumber.trim() : null,
        photoUrl: photoUrl || null,
        classId: cId || null,
        sectionId: sId || formData.sectionId || null,
        status: formData.status || 'Active',
        customData: customDataPayload
      };

      await createStudent(payload);
      notifyDataChanged('students');

      setFormData({
        firstName: '', lastName: '', admissionNumber: '', classId: '', parentEmail: '', dob: '', gender: 'Male', status: 'Active',
        age: '', bloodGroup: '', nationality: '', religion: '', motherTongue: '', aadharNumber: '',
        homeAddress: '', parentName: '', parentPhone: '', parentOccupation: '', emergencyContact: '', annualIncome: '', siblingName: '',
        previousSchool: '', previousRecords: '', subjectsChosen: '', busRoute: '',
        tuitionFee: '', hostelFee: '', bookFee: '', otherFee: '', totalFee: ''
      });
      setAddErrors({});
      setCustomData({});
      setPhotoFile(null);
      setShowForm(false);
      toast.success("Student admitted successfully!");
      fetchData();
    } catch (error) {
      console.error("Error creating student:", error);
      toast.error(error.response?.data?.message || "Failed to admit student.");
    } finally {
      setSaving(false);
    }
  };

  const openUploadModal = (student) => {
    setSelectedStudentForUpload(student);
    setUploadFile(null);
    setUploadModalOpen(true);
  };

  const parseExcelDob = (val) => {
    if (!val) return null;
    const str = String(val).trim();
    if (!str) return null;

    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
      return str;
    }

    const dmyMatch = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
    if (dmyMatch) {
      const [, day, month, year] = dmyMatch;
      const pad = (n) => String(n).padStart(2, '0');
      return `${year}-${pad(month)}-${pad(day)}`;
    }

    const parsedDate = new Date(str);
    if (!isNaN(parsedDate.getTime())) {
      const year = parsedDate.getFullYear();
      const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
      const day = String(parsedDate.getDate()).padStart(2, '0');
      if (year > 1900 && year <= new Date().getFullYear()) {
        return `${year}-${month}-${day}`;
      }
    }

    return null;
  };

  const parseExcelBloodGroup = (val) => {
    if (!val) return null;
    let bg = String(val).trim().toUpperCase();
    if (!bg) return null;
    bg = bg.replace(/POSITIVE/g, '+').replace(/NEGATIVE/g, '-').replace(/\s+/g, '');
    const VALID_BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
    return VALID_BLOOD_GROUPS.includes(bg) ? bg : null;
  };

  const parseExcelAadhaar = (val) => {
    if (!val) return null;
    const cleaned = String(val).replace(/\D/g, '');
    return cleaned.length === 12 ? cleaned : null;
  };

  const cleanClassStr = (str) => {
    if (!str) return '';
    return String(str)
      .toLowerCase()
      .replace(/^(class|grade|std|standard)\s+/i, '')
      .replace(/[^a-z0-9]/g, '')
      .trim();
  };

  const selectableClassOptions = useMemo(() => {
    if (!Array.isArray(classes)) return [];
    const options = [];

    for (const c of classes) {
      const classNameStr = (c.name || '').trim();
      if (Array.isArray(c.sections) && c.sections.length > 0) {
        for (const s of c.sections) {
          const secNameStr = (s.name || '').trim();
          const cleanCls = cleanClassStr(classNameStr);
          const cleanSec = cleanClassStr(secNameStr);
          const label = cleanCls.endsWith(cleanSec) ? classNameStr : `${classNameStr} - ${secNameStr}`;
          options.push({
            key: `${c.id}:${s.id}`,
            classId: c.id,
            sectionId: s.id,
            label,
            className: classNameStr,
            sectionName: secNameStr,
            stream: c.stream || ''
          });
        }
      } else if (c.section) {
        const secNameStr = String(c.section).trim();
        const cleanCls = cleanClassStr(classNameStr);
        const cleanSec = cleanClassStr(secNameStr);
        const label = cleanCls.endsWith(cleanSec) ? classNameStr : `${classNameStr} - ${secNameStr}`;
        options.push({
          key: `${c.id}:${c.section}`,
          classId: c.id,
          sectionId: null,
          sectionName: secNameStr,
          label,
          className: classNameStr,
          stream: c.stream || ''
        });
      } else {
        options.push({
          key: c.id,
          classId: c.id,
          sectionId: null,
          label: classNameStr,
          className: classNameStr,
          stream: c.stream || ''
        });
      }
    }

    return options;
  }, [classes]);

  const formatClassOptionLabel = (c) => {
    if (!c) return '';
    const nameStr = (c.name || '').trim();
    const secStr = (c.section || (Array.isArray(c.sections) && c.sections.length === 1 ? c.sections[0].name : '') || '').trim();
    if (secStr) {
      const cleanCls = cleanClassStr(nameStr);
      const cleanSec = cleanClassStr(secStr);
      if (cleanCls.endsWith(cleanSec)) {
        return nameStr;
      }
      return `${nameStr} - ${secStr}`;
    }
    if (Array.isArray(c.sections) && c.sections.length > 1) {
      return `${nameStr} (${c.sections.map(s => s.name).join(', ')})`;
    }
    return nameStr;
  };

  const findMatchingClass = (classNameRaw, sectionRaw, classesList) => {
    if (!classNameRaw || !Array.isArray(classesList) || classesList.length === 0) {
      return null;
    }

    const ROMAN_MAP = {
      '1': 'i', '2': 'ii', '3': 'iii', '4': 'iv', '5': 'v',
      '6': 'vi', '7': 'vii', '8': 'viii', '9': 'ix', '10': 'x',
      '11': 'xi', '12': 'xii'
    };
    const REVERSE_ROMAN_MAP = Object.fromEntries(Object.entries(ROMAN_MAP).map(([k, v]) => [v, k]));

    const rawNameStr = String(classNameRaw).trim();
    const rawSecStr = String(sectionRaw || '').trim();

    let targetClassPart = rawNameStr;
    let targetSecPart = rawSecStr;

    if (targetClassPart.includes('-') && !targetSecPart) {
      const parts = targetClassPart.split('-');
      targetClassPart = parts[0].trim();
      targetSecPart = parts.slice(1).join('-').trim();
    }

    const cleanClassName = cleanClassStr(targetClassPart);
    const cleanSecName = cleanClassStr(targetSecPart);
    const altClassName = ROMAN_MAP[cleanClassName] || REVERSE_ROMAN_MAP[cleanClassName] || cleanClassName;

    const resolveSectionId = (c) => {
      if (!c) return null;
      if (Array.isArray(c.sections) && c.sections.length > 0) {
        if (cleanSecName) {
          const matchSec = c.sections.find(s => cleanClassStr(s.name) === cleanSecName);
          if (matchSec) return matchSec.id;
        }
        return c.sections[0]?.id || null;
      }
      return null;
    };

    for (const c of classesList) {
      const dbNameRaw = String(c.name || '').trim();
      const dbSecRaw = String(c.section || '').trim();
      const cleanDbName = cleanClassStr(dbNameRaw);
      const cleanDbSec = cleanClassStr(dbSecRaw);

      // Level 1 Pass A: Exact name & matching section
      if (
        (cleanDbName === cleanClassName || cleanDbName === altClassName) &&
        cleanSecName && cleanDbSec && cleanDbSec === cleanSecName
      ) {
        return { ...c, sectionId: resolveSectionId(c) };
      }

      // Level 1 Pass B: DB section is empty or matches empty input section
      if (
        (cleanDbName === cleanClassName || cleanDbName === altClassName) &&
        !cleanSecName && (!cleanDbSec || cleanDbSec === 'undefined')
      ) {
        return { ...c, sectionId: resolveSectionId(c) };
      }

      // Level 1 Pass C: Combined class + section in DB name (e.g. c.name = "I - A")
      const combinedTarget1 = cleanClassStr(`${targetClassPart} ${targetSecPart}`);
      const combinedTarget2 = cleanClassStr(`${altClassName} ${targetSecPart}`);
      const combinedTarget3 = cleanClassStr(`${targetClassPart}${targetSecPart}`);
      const combinedTarget4 = cleanClassStr(`${altClassName}${targetSecPart}`);

      if (
        cleanDbName === combinedTarget1 ||
        cleanDbName === combinedTarget2 ||
        cleanDbName === combinedTarget3 ||
        cleanDbName === combinedTarget4
      ) {
        return { ...c, sectionId: resolveSectionId(c) };
      }

      const combinedDb = cleanClassStr(`${dbNameRaw} ${dbSecRaw}`);
      if (
        combinedDb === combinedTarget1 ||
        combinedDb === combinedTarget2 ||
        combinedDb === combinedTarget3 ||
        combinedDb === combinedTarget4
      ) {
        return { ...c, sectionId: resolveSectionId(c) };
      }
    }

    // Level 2 Fallback: Base class name match when DB class section is omitted/undefined (e.g. Don Bosco classes: name="I", section=undefined)
    for (const c of classesList) {
      const dbNameRaw = String(c.name || '').trim();
      const cleanDbName = cleanClassStr(dbNameRaw);

      if (cleanDbName === cleanClassName || cleanDbName === altClassName) {
        return { ...c, sectionId: resolveSectionId(c) };
      }
    }

    return null;
  };

  const handleUpload = async () => {
    if (!uploadFile) return;
    setUploading(true);

    if (!selectedStudentForUpload) {
      // HIGH-PERFORMANCE BATCH BULK IMPORT LOGIC
      setUploadModalOpen(false);

      const effectiveSeatLimit = schoolData?.seatLimit || (schoolData?.plan?.toLowerCase() === 'enterprise' ? 2000 : schoolData?.plan?.toLowerCase() === 'basic' ? 100 : 500);
      const availableCapacity = Math.max(0, effectiveSeatLimit - students.length);

      if (availableCapacity <= 0) {
        toast.error(`School student capacity limit of ${effectiveSeatLimit} seats reached. No more students can be imported. Contact SuperAdmin to expand limit.`, { duration: 6000 });
        setUploading(false);
        return;
      }

      try {
        const reader = new FileReader();
        reader.onload = async (evt) => {
          try {
            const bstr = evt.target.result;
            const wb = XLSX.read(bstr, { type: 'binary' });
            const wsname = wb.SheetNames[0];
            const ws = wb.Sheets[wsname];
            const rawData = XLSX.utils.sheet_to_json(ws, { raw: false, defval: '' });
            
            // Normalize keys
            const data = rawData.map(row => {
              const normalized = {};
              for (const key in row) {
                normalized[key.trim().toLowerCase()] = row[key];
              }
              return normalized;
            });

            const existingAdmissionsMap = new Map(students.map(s => [s.admissionNumber?.toLowerCase(), s]));
            const importedAdmissions = new Set();
            const payloads = [];
            let skipCount = 0;

            for (let i = 0; i < data.length; i++) {
              const row = data[i];
              const fullName = row['full name'] || row['name'] || row['student name'] || row['fullname'];
              const admissionNumberRaw = row['admission number'] || row['admission no'] || row['admission no.'] || row['roll number'] || row['id'];

              if (!fullName || !admissionNumberRaw) {
                skipCount++;
                continue;
              }

              const admissionNumber = admissionNumberRaw.toString().trim();
              if (!admissionNumber) {
                skipCount++;
                continue;
              }

              const lowerAdmission = admissionNumber.toLowerCase();
              if (importedAdmissions.has(lowerAdmission)) {
                skipCount++;
                continue;
              }
              importedAdmissions.add(lowerAdmission);

              const fullNameStr = fullName.toString().trim();
              const nameParts = fullNameStr.split(' ');
              const firstName = nameParts[0];
              const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
              
              const classNameRaw = row['class'] || row['grade'] || row['class name'] || row['grade/class'] || '';
              const sectionRaw = row['section'] || row['group'] || row['sec'] || '';
              const matchedClass = findMatchingClass(classNameRaw, sectionRaw, classes);
              const matchedClassId = matchedClass ? matchedClass.id : null;
              const matchedSectionId = matchedClass ? matchedClass.sectionId : null;

              const existingStudent = existingAdmissionsMap.get(lowerAdmission);
              const existingCustom = existingStudent?.customData || {};

              const customDataPayload = {
                ...existingCustom,
                parentName: row['parent/guardian name'] || row['parent name'] || existingCustom.parentName || '',
                parentPhone: row['parent/guardian phone number'] || row['parent phone'] || existingCustom.parentPhone || '',
                parentEmail: row['parent/guardian email address'] || row['parent email'] || existingCustom.parentEmail || '',
                parentOccupation: row['parent/guardian occupation'] || row['parent occupation'] || existingCustom.parentOccupation || '',
                emergencyContact: row['emergency contact number'] || row['emergency contact'] || existingCustom.emergencyContact || '',
                annualIncome: row['annual income (inr)'] || row['annual income'] || existingCustom.annualIncome || '',
                siblingName: row['sibling name (same school: y/n)'] || row['sibling name'] || existingCustom.siblingName || '',
                homeAddress: row['home address'] || existingCustom.homeAddress || '',
                previousSchool: row['previous school name'] || row['previous school'] || existingCustom.previousSchool || '',
                previousRecords: row['previous academic records/report card status'] || row['previous records'] || existingCustom.previousRecords || '',
                subjectsChosen: row['subjects chosen'] || existingCustom.subjectsChosen || '',
                busRoute: row['school bus route/stop'] || row['bus route'] || existingCustom.busRoute || '',
                tuitionFee: row['tuition fee (inr)'] || row['tuition fee'] || existingCustom.tuitionFee || '',
                hostelFee: row['hostel fee (inr)'] || row['hostel fee'] || existingCustom.hostelFee || '',
                bookFee: row['book fee (inr)'] || row['book fee'] || existingCustom.bookFee || '',
                otherFee: row['other fee (inr)'] || row['other fee'] || existingCustom.otherFee || '',
                totalFee: row['total fee (inr)'] || row['total fee'] || existingCustom.totalFee || '',
                nationality: row['nationality'] || existingCustom.nationality || '',
                religion: row['religion'] || existingCustom.religion || '',
                motherTongue: row['mother tongue'] || existingCustom.motherTongue || ''
              };

              const rawDob = row['date of birth'] || row['dob'];
              const rawBloodGroup = row['blood group'];
              const rawAadhaar = row['aadhar number'] || row['aadhaar number'] || row['aadhaar'];

              payloads.push({
                firstName,
                lastName: lastName || (existingStudent?.lastName || null),
                admissionNumber,
                dob: parseExcelDob(rawDob) || (existingStudent?.dob || null),
                gender: normalizeGender(row['gender'] || row['sex'] || row['student gender'] || row['student_gender'] || row['gender (male/female)'] || row['gender (boy/girl)'], existingStudent?.gender || 'Male'),
                bloodGroup: parseExcelBloodGroup(rawBloodGroup) || (existingStudent?.bloodGroup || null),
                aadhaarNumber: parseExcelAadhaar(rawAadhaar) || (existingStudent?.aadhaarNumber || null),
                status: 'Active',
                classId: matchedClassId || (existingStudent?.classId || null),
                sectionId: matchedSectionId || (existingStudent?.sectionId || null),
                customData: customDataPayload
              });
            }

            if (payloads.length === 0) {
              toast.error("No valid student rows found in Excel file.");
              setUploading(false);
              return;
            }

            // Chunk payloads into batches of 25 for parallel speed & live progress updates
            const BATCH_SIZE = 25;
            const batches = [];
            for (let b = 0; b < payloads.length; b += BATCH_SIZE) {
              batches.push(payloads.slice(b, b + BATCH_SIZE));
            }

            const toastId = toast.loading(`Processing bulk import... (0/${payloads.length})`);

            let totalCreated = 0;
            let totalUpdated = 0;
            let totalFailed = 0;

            for (let k = 0; k < batches.length; k++) {
              const currentBatchPayloads = batches[k];
              try {
                const res = await bulkImportStudents(currentBatchPayloads);
                const batchResult = res?.data || {};

                totalCreated += (batchResult.createdCount || 0);
                totalUpdated += (batchResult.updatedCount || 0);
                totalFailed += (batchResult.failedCount || 0);

                // INCREMENTAL REAL-TIME STATE UPDATE:
                // Merge newly imported/updated student records into React state LIVE!
                if (Array.isArray(batchResult.students) && batchResult.students.length > 0) {
                  const formatted = batchResult.students.map(s => {
                    const cd = s.customData || {};
                    return {
                      ...cd,
                      ...s,
                      customData: cd,
                      parentName: s.parentName || cd.parentName || '',
                      parentPhone: s.parentPhone || cd.parentPhone || '',
                      parentEmail: s.parentEmail || cd.parentEmail || '',
                      homeAddress: s.homeAddress || cd.homeAddress || ''
                    };
                  });

                  setStudents(prev => {
                    const map = new Map(prev.map(item => [item.id, item]));
                    for (const item of formatted) {
                      map.set(item.id, item);
                    }
                    return Array.from(map.values());
                  });
                }
              } catch (batchErr) {
                console.error(`Batch ${k + 1} bulk import error:`, batchErr);
                totalFailed += currentBatchPayloads.length;
              }

              const processedSoFar = Math.min(payloads.length, (k + 1) * BATCH_SIZE);
              toast.loading(`Processing bulk import... (${processedSoFar}/${payloads.length})`, { id: toastId });
            }

            // Finish and dispatch live refresh signal
            notifyDataChanged('students');
            await fetchData();

            toast.success(`Import complete! ${totalCreated} created, ${totalUpdated} updated${totalFailed > 0 ? `, ${totalFailed} failed` : ''}.`, { id: toastId, duration: 5000 });

          } catch (err) {
            console.error(err);
            toast.error("Failed to parse Excel file");
          } finally {
            setUploadFile(null);
            setUploading(false);
          }
        };
        reader.readAsBinaryString(uploadFile);
      } catch (err) {
        console.error(err);
        toast.error("Failed to process Excel file");
        setUploading(false);
        setImportProgressModalOpen(false);
      }
      return;
    }


    try {
      const safeSchoolName = (schoolName || 'School').replace(/[^a-z0-9]/gi, '_').trim();
      const studentName = `${selectedStudentForUpload.firstName} ${selectedStudentForUpload.lastName || ''}`.trim();
      const safeStudentName = studentName.replace(/[^a-z0-9]/gi, '_').trim();
      const safeFileName = uploadFile.name.replace(/[^a-z0-9.]/gi, '_');

      const storagePath = `${safeSchoolName}/Students/${safeStudentName}/${safeFileName}`;
      
      const downloadUrl = await uploadFileToCloudinaryOrFirebase(uploadFile, schoolId, storagePath);

      const existingCustom = selectedStudentForUpload.customData || {};
      const updatedCustom = {
        ...existingCustom,
        attachmentUrl: downloadUrl,
        attachmentName: uploadFile.name
      };

      await updateStudent(selectedStudentForUpload.id, {
        customData: updatedCustom
      });

      toast.success("Document uploaded successfully!");
      setUploadModalOpen(false);
      fetchData();
    } catch (error) {
      console.error("Error uploading file:", error);
      toast.error("Failed to upload document.");
    } finally {
      setUploading(false);
    }
  };

  const openAssignModal = (student) => {
    setSelectedStudentForAssign(student);
    setSelectedClassIdForAssign(student.classId || '');
    setAssignModalOpen(true);
  };

  const handleAssignClass = async () => {
    if (!selectedStudentForAssign) return;
    setAssigning(true);
    try {
      const [targetClassId, targetSectionId] = (selectedClassIdForAssign || '').split(':');
      await updateStudent(selectedStudentForAssign.id, {
        classId: targetClassId || null,
        sectionId: targetSectionId || null
      });
      toast.success("Class assigned successfully");
      setAssignModalOpen(false);
      fetchData();
    } catch (error) {
      console.error(error);
      toast.error(error.response?.data?.message || "Failed to assign class");
    } finally {
      setAssigning(false);
    }
  };

  // Handle field change in Edit Mode
  const handleEditFieldChange = (field, value) => {
    setEditStudentData(prev => ({ ...prev, [field]: value }));
    if (editErrors[field]) {
      setEditErrors(prev => {
        const updated = { ...prev };
        delete updated[field];
        return updated;
      });
    }
  };

  // Handle fee fields change and calculate total dynamically in Edit Mode
  const handleEditFeeChange = (field, value) => {
    const updated = { ...editStudentData, [field]: value };
    const tuition = Number(updated.tuitionFee || 0);
    const hostel = Number(updated.hostelFee || 0);
    const book = Number(updated.bookFee || 0);
    const other = Number(updated.otherFee || 0);
    updated.totalFee = (tuition + hostel + book + other).toString();
    setEditStudentData(updated);
  };

  // Check if any fields have been modified in Edit Mode
  const isStudentFormDirty = () => {
    if (!editStudentData) return false;
    const fieldsToCompare = [
      'firstName', 'lastName', 'middleName', 'admissionNumber', 'dob', 'gender',
      'bloodGroup', 'nationality', 'religion', 'motherTongue', 'aadharNumber',
      'studentPhone', 'studentEmail', 'classId', 'rollNumber', 'admissionDate', 'status',
      'parentName', 'parentPhone', 'parentOccupation', 'parentEmail',
      'motherName', 'motherPhone', 'motherOccupation', 'motherEmail',
      'guardianName', 'guardianPhone', 'guardianRelationship',
      'addressLine1', 'addressLine2', 'city', 'district', 'state', 'country', 'pincode',
      'previousSchool', 'identificationMarks', 'medicalInfo', 'transportDetails', 'hostelDetails',
      'tuitionFee', 'hostelFee', 'bookFee', 'otherFee', 'totalFee'
    ];
    for (const f of fieldsToCompare) {
      const v1 = (selectedStudentToView[f] || '').toString().trim();
      const v2 = (editStudentData[f] || '').toString().trim();
      if (v1 !== v2) return true;
    }
    if (formSchema.length > 0) {
      for (const field of formSchema) {
        const v1 = (selectedStudentToView.customData?.[field.id] || '').toString().trim();
        const v2 = (editCustomData[field.id] || '').toString().trim();
        if (v1 !== v2) return true;
      }
    }
    return false;
  };

  // Close or Cancel handler
  const handleModalCloseOrCancel = () => {
    if (isEditMode && isStudentFormDirty()) {
      setShowDiscardConfirm(true);
    } else {
      setViewStudentModalOpen(false);
      setIsEditMode(false);
    }
  };

  // Listen to Escape key globally when view modal is open
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && viewStudentModalOpen) {
        if (isEditMode && isStudentFormDirty()) {
          setShowDiscardConfirm(true);
        } else {
          setViewStudentModalOpen(false);
          setIsEditMode(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewStudentModalOpen, isEditMode, editStudentData, editCustomData, selectedStudentToView]);

  // Log audit helper
  
  // Validate fields in edit student form
  const validateEditStudent = () => {
    const errors = {};
    const firstNameError = validateName(editStudentData.firstName, 'First name');
    if (firstNameError) errors.firstName = firstNameError;

    const lastNameError = validateName(editStudentData.lastName, 'Last name');
    if (lastNameError) errors.lastName = lastNameError;
    
    if (!editStudentData.admissionNumber?.trim()) {
      errors.admissionNumber = "Admission number is required";
    } else {
      const isDuplicate = students.some(
        s => s.id !== selectedStudentToView.id && s.admissionNumber?.toLowerCase() === editStudentData.admissionNumber.trim().toLowerCase()
      );
      if (isDuplicate) {
        errors.admissionNumber = "Admission number must be unique";
      }
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (editStudentData.studentEmail?.trim() && !emailRegex.test(editStudentData.studentEmail)) {
      errors.studentEmail = "Invalid email format";
    }
    const parentEmailError = validateEmail(editStudentData.parentEmail, false);
    if (parentEmailError) {
      errors.parentEmail = parentEmailError;
    }
    if (editStudentData.motherEmail?.trim() && !emailRegex.test(editStudentData.motherEmail)) {
      errors.motherEmail = "Invalid email format";
    }

    const phoneRegex = /^\d{10}$/;
    if (editStudentData.studentPhone?.trim() && !phoneRegex.test(editStudentData.studentPhone)) {
      errors.studentPhone = "Mobile number must be 10 digits";
    }
    const parentPhoneError = validatePhone(editStudentData.parentPhone, true, 'Parent phone number');
    if (parentPhoneError) {
      errors.parentPhone = parentPhoneError;
    }
    if (editStudentData.motherPhone?.trim() && !phoneRegex.test(editStudentData.motherPhone)) {
      errors.motherPhone = "Mobile number must be 10 digits";
    }
    if (editStudentData.guardianPhone?.trim() && !phoneRegex.test(editStudentData.guardianPhone)) {
      errors.guardianPhone = "Mobile number must be 10 digits";
    }

    const aadhaarError = validateAadhaarNumber(editStudentData.aadharNumber, false);
    if (aadhaarError) {
      errors.aadharNumber = aadhaarError;
    }

    const dobError = validateDateOfBirth(editStudentData.dob, false);
    if (dobError) {
      errors.dob = dobError;
    }

    const bloodGroupError = validateBloodGroup(editStudentData.bloodGroup, false);
    if (bloodGroupError) {
      errors.bloodGroup = bloodGroupError;
    }

    if (editStudentData.rollNumber?.trim() && editStudentData.classId) {
      const isRollDuplicate = students.some(
        s => s.id !== selectedStudentToView.id &&
             s.classId === editStudentData.classId &&
             s.rollNumber?.toLowerCase() === editStudentData.rollNumber.trim().toLowerCase()
      );
      if (isRollDuplicate) {
        errors.rollNumber = "Roll Number already exists in this class";
      }
    }

    setEditErrors(errors);
    return errors;
  };

  // Save changes
  const handleSaveStudentEdit = async () => {
    const errors = validateEditStudent();
    if (Object.keys(errors).length > 0) {
      toast.error(Object.values(errors)[0] || "Please resolve the validation errors.");
      return;
    }

    try {
      setSaving(true);
      const cleanedData = {};
      const fieldsToSave = [
        'firstName', 'lastName', 'middleName', 'admissionNumber', 'dob', 'gender',
        'bloodGroup', 'nationality', 'religion', 'motherTongue', 'aadharNumber',
        'studentPhone', 'studentEmail', 'classId', 'rollNumber', 'admissionDate', 'status',
        'parentName', 'parentPhone', 'parentOccupation', 'parentEmail',
        'motherName', 'motherPhone', 'motherOccupation', 'motherEmail',
        'guardianName', 'guardianPhone', 'guardianRelationship',
        'addressLine1', 'addressLine2', 'city', 'district', 'state', 'country', 'pincode',
        'previousSchool', 'identificationMarks', 'medicalInfo', 'transportDetails', 'hostelDetails',
        'tuitionFee', 'hostelFee', 'bookFee', 'otherFee', 'totalFee'
      ];
      for (const f of fieldsToSave) {
        cleanedData[f] = (editStudentData[f] || '').toString().trim();
      }

      if (cleanedData.bloodGroup) {
        cleanedData.bloodGroup = cleanedData.bloodGroup.toUpperCase();
      }

      if (cleanedData.dob) {
        const birthDate = new Date(cleanedData.dob);
        const today = new Date();
        let calculatedAge = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
          calculatedAge--;
        }
        cleanedData.age = calculatedAge.toString();
      }

      let newPhotoUrl = selectedStudentToView.photoUrl || '';
      if (editPhotoFile) {
        const safeStudentName = `${cleanedData.firstName} ${cleanedData.lastName}`.replace(/[^a-z0-9]/gi, '_').trim();
        const safeSchoolName = (schoolName || 'School').replace(/[^a-z0-9]/gi, '_').trim();
        const safeFileName = editPhotoFile.name.replace(/[^a-z0-9.]/gi, '_');
        const storagePath = `${safeSchoolName}/Students/${safeStudentName}/photo_${safeFileName}`;
        newPhotoUrl = await uploadFileToCloudinaryOrFirebase(editPhotoFile, schoolId, storagePath);
      }

      const uploadedCustomData = await uploadCustomDataFiles(editCustomData, schoolId, 'students');

      const existingCustom = selectedStudentToView.customData || {};
      const customDataPayload = {
        ...existingCustom,
        parentName: cleanedData.parentName || '',
        parentPhone: cleanedData.parentPhone || '',
        parentEmail: cleanedData.parentEmail || '',
        parentOccupation: cleanedData.parentOccupation || '',
        motherName: cleanedData.motherName || '',
        motherPhone: cleanedData.motherPhone || '',
        motherEmail: cleanedData.motherEmail || '',
        motherOccupation: cleanedData.motherOccupation || '',
        guardianName: cleanedData.guardianName || '',
        guardianPhone: cleanedData.guardianPhone || '',
        guardianRelationship: cleanedData.guardianRelationship || '',
        emergencyContact: cleanedData.emergencyContact || '',
        annualIncome: cleanedData.annualIncome || '',
        homeAddress: cleanedData.homeAddress || '',
        addressLine1: cleanedData.addressLine1 || '',
        addressLine2: cleanedData.addressLine2 || '',
        city: cleanedData.city || '',
        district: cleanedData.district || '',
        state: cleanedData.state || '',
        country: cleanedData.country || '',
        pincode: cleanedData.pincode || '',
        previousSchool: cleanedData.previousSchool || '',
        identificationMarks: cleanedData.identificationMarks || '',
        medicalInfo: cleanedData.medicalInfo || '',
        transportDetails: cleanedData.transportDetails || '',
        hostelDetails: cleanedData.hostelDetails || '',
        tuitionFee: cleanedData.tuitionFee || '',
        hostelFee: cleanedData.hostelFee || '',
        bookFee: cleanedData.bookFee || '',
        otherFee: cleanedData.otherFee || '',
        totalFee: cleanedData.totalFee || '',
        nationality: cleanedData.nationality || '',
        religion: cleanedData.religion || '',
        motherTongue: cleanedData.motherTongue || '',
        ...(uploadedCustomData || {})
      };

      const updatePayload = {
        admissionNumber: cleanedData.admissionNumber,
        firstName: cleanedData.firstName,
        lastName: cleanedData.lastName || null,
        dob: cleanedData.dob || null,
        gender: cleanedData.gender || null,
        bloodGroup: cleanedData.bloodGroup || null,
        aadhaarNumber: cleanedData.aadharNumber || null,
        rollNumber: cleanedData.rollNumber || null,
        classId: cleanedData.classId || null,
        status: cleanedData.status || 'Active',
        photoUrl: newPhotoUrl || null,
        customData: customDataPayload
      };

      const updatedRes = await updateStudent(selectedStudentToView.id, updatePayload);

      if (cleanedData.bloodGroup || cleanedData.medicalInfo) {
        updateStudentHealth(selectedStudentToView.id, {
          bloodGroup: cleanedData.bloodGroup || undefined,
          doctorNotes: cleanedData.medicalInfo || undefined
        }).catch((healthErr) => {
          console.warn("Non-critical: could not sync student health record:", healthErr);
        });
      }

      toast.success("Student details updated successfully.");
      
      const updatedStudentObj = {
        ...selectedStudentToView,
        ...(updatedRes?.data || updatePayload),
        ...customDataPayload,
        customData: customDataPayload
      };
      setSelectedStudentToView(updatedStudentObj);
      setIsEditMode(false);
      setEditPhotoFile(null);
      fetchData();
    } catch (e) {
      console.error(e);
      toast.error(e.response?.data?.message || "Failed to save changes.");
    } finally {
      setSaving(false);
    }
  };

  const filteredStudents = students.filter(student => {
    const q = searchQuery.trim().toLowerCase();
    
    const matchesClass = classFilter === 'all' || (() => {
      const [fClassId, fSecId] = classFilter.split(':');
      if (fSecId) {
        return student.classId === fClassId && (!student.sectionId || student.sectionId === fSecId);
      }
      return student.classId === fClassId;
    })();
    const matchesGender = genderFilter === 'all' || normalizeGender(student.gender, '') === genderFilter;
    if (!matchesClass || !matchesGender) return false;

    if (!q) return true;

    const firstName = (student.firstName || '').toString().toLowerCase();
    const lastName = (student.lastName || '').toString().toLowerCase();
    const fullName = `${firstName} ${lastName}`.trim();
    const reverseFullName = `${lastName} ${firstName}`.trim();
    const directName = (student.name || student.fullName || student.studentName || '').toString().toLowerCase();
    const admissionNumber = (student.admissionNumber || student.admissionNo || student.rollNo || '').toString().toLowerCase();
    const parentName = (student.parentName || student.guardianName || '').toString().toLowerCase();
    const parentPhone = (student.parentPhone || student.phone || student.emergencyContact || '').toString().toLowerCase();
    const parentEmail = (student.parentEmail || student.email || '').toString().toLowerCase();

    // Direct substring matches
    if (
      fullName.includes(q) || 
      reverseFullName.includes(q) || 
      directName.includes(q) || 
      admissionNumber.includes(q) ||
      firstName.includes(q) ||
      lastName.includes(q)
    ) {
      return true;
    }

    // Multi-term matching (e.g. searching "John Doe" or "John 1001")
    const searchTerms = q.split(/\s+/).filter(Boolean);
    const matchesAllTerms = searchTerms.every(term => 
      firstName.includes(term) ||
      lastName.includes(term) ||
      fullName.includes(term) ||
      directName.includes(term) ||
      admissionNumber.includes(term) ||
      parentName.includes(term) ||
      parentPhone.includes(term) ||
      parentEmail.includes(term)
    );

    return matchesAllTerms;
  }).sort((a, b) => {
    const admA = (a.admissionNumber || a.admissionNo || '').toString();
    const admB = (b.admissionNumber || b.admissionNo || '').toString();
    return admA.localeCompare(admB, undefined, { numeric: true, sensitivity: 'base' });
  });

  // Enrolled Metrics
  const totalStudents = students.length;
  const activeStudents = students.filter(s => s.status === 'Active').length;
  const maleStudents = students.filter(s => isMale(s.gender)).length;
  const femaleStudents = students.filter(s => isFemale(s.gender)).length;

  // Applications Metrics & Filtering
  const pendingAppsCount = admissionApplications.filter(a => (a.status || 'Pending') === 'Pending').length;
  const approvedAppsCount = admissionApplications.filter(a => a.status === 'Approved').length;
  const rejectedAppsCount = admissionApplications.filter(a => a.status === 'Rejected').length;

  const filteredApplications = admissionApplications.filter(app => {
    const status = app.status || 'Pending';
    if (appStatusFilter !== 'all' && status !== appStatusFilter) return false;
    if (!appSearchQuery.trim()) return true;

    const q = appSearchQuery.trim().toLowerCase();
    const name = (app.studentName || `${app.firstName || ''} ${app.lastName || ''}`).toLowerCase();
    const appNo = (app.applicationNumber || '').toLowerCase();
    const parentName = (app.parentName || '').toLowerCase();
    const parentPhone = (app.parentPhone || '').toLowerCase();
    const parentEmail = (app.parentEmail || '').toLowerCase();
    const targetClass = (getClassName(app.targetClassId) || '').toLowerCase();

    return name.includes(q) || appNo.includes(q) || parentName.includes(q) || parentPhone.includes(q) || parentEmail.includes(q) || targetClass.includes(q);
  });

  const appTotalPages = Math.ceil(filteredApplications.length / appRowsPerPage) || 1;
  const paginatedApplications = filteredApplications.slice((appCurrentPage - 1) * appRowsPerPage, appCurrentPage * appRowsPerPage);

  useEffect(() => {
    setAppCurrentPage(1);
  }, [appSearchQuery, appStatusFilter, appRowsPerPage]);

  // Pagination Logic for Enrolled Students
  const totalPages = Math.ceil(filteredStudents.length / rowsPerPage) || 1;
  const paginatedStudents = filteredStudents.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, classFilter, genderFilter, rowsPerPage]);

  const getClassName = (classId, student = null) => {
    const studentObj = (typeof student === 'object' && student !== null) 
      ? student 
      : (typeof classId === 'object' && classId !== null ? classId : null);

    const targetClassId = studentObj?.classId || (typeof classId === 'string' ? classId : null);
    const targetSecId = studentObj?.sectionId || null;

    const classNameStr = (studentObj?.class?.name || classes.find(c => c.id === targetClassId)?.name || '').trim();
    const sectionNameStr = (
      studentObj?.section?.name || 
      studentObj?.class?.section || 
      (targetClassId && targetSecId ? classes.find(c => c.id === targetClassId)?.sections?.find(s => s.id === targetSecId)?.name : '') || 
      (targetClassId ? classes.find(c => c.id === targetClassId)?.section : '') || 
      ''
    ).trim();

    if (classNameStr && sectionNameStr) {
      const cleanCls = cleanClassStr(classNameStr);
      const cleanSec = cleanClassStr(sectionNameStr);
      if (cleanCls.endsWith(cleanSec)) {
        return classNameStr;
      }
      return `${classNameStr} - ${sectionNameStr}`;
    }

    if (classNameStr) return classNameStr;

    if (targetClassId) {
      const cls = classes.find(c => c.id === targetClassId);
      if (!cls) return 'Unknown';
      if (cls.section) {
        const cleanCls = cleanClassStr(cls.name);
        const cleanSec = cleanClassStr(cls.section);
        if (cleanCls.endsWith(cleanSec)) return cls.name;
        return `${cls.name} - ${cls.section}`;
      }
      if (Array.isArray(cls.sections) && cls.sections.length === 1) {
        const cleanCls = cleanClassStr(cls.name);
        const cleanSec = cleanClassStr(cls.sections[0].name);
        if (cleanCls.endsWith(cleanSec)) return cls.name;
        return `${cls.name} - ${cls.sections[0].name}`;
      }
      return cls.name;
    }

    return 'Unknown';
  };

  if (loading && !showForm) {
    return (
      <div className="p-8 max-w-7xl mx-auto animate-fade-in-up">
        <TableSkeleton rows={5} columns={4} />
      </div>
    );
  }

  const effectiveSeatLimit = schoolData?.seatLimit || (schoolData?.plan?.toLowerCase() === 'enterprise' ? 2000 : schoolData?.plan?.toLowerCase() === 'basic' ? 100 : 500);
  const seatUsagePercent = effectiveSeatLimit > 0 ? Math.min(Math.round((totalStudents / effectiveSeatLimit) * 100), 100) : 0;
  const isSeatLimitReached = totalStudents >= effectiveSeatLimit;
  const isSeatLimitWarning = !isSeatLimitReached && seatUsagePercent >= 85;

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Seat Limit Warning Banner */}
      {isSeatLimitReached && (
        <div className="mb-6 p-4 rounded-2xl bg-red-50 border border-red-200 text-red-800 flex items-center justify-between shadow-sm animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-xl text-red-600 font-bold">⚠️</div>
            <div>
              <p className="font-bold text-sm">School Student Capacity Limit Reached ({totalStudents} / {effectiveSeatLimit})</p>
              <p className="text-xs text-red-700 mt-0.5">
                Your school has filled all allocated student seats. Single admissions and bulk imports are locked. Please contact your SuperAdmin to expand your school license limit.
              </p>
            </div>
          </div>
          <span className="text-xs font-black bg-red-600 text-white px-3 py-1.5 rounded-xl uppercase tracking-wider whitespace-nowrap">
            Locked
          </span>
        </div>
      )}

      {isSeatLimitWarning && (
        <div className="mb-6 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 flex items-center justify-between shadow-sm animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-xl text-amber-600 font-bold">⚡</div>
            <div>
              <p className="font-bold text-sm">School Nearing Seat Capacity Limit ({totalStudents} / {effectiveSeatLimit} Seats, {seatUsagePercent}%)</p>
              <p className="text-xs text-amber-700 mt-0.5">
                You are approaching your plan's maximum capacity. Contact your SuperAdmin if you need to expand student limits.
              </p>
            </div>
          </div>
          <span className="text-xs font-black bg-amber-500 text-white px-3 py-1.5 rounded-xl uppercase tracking-wider whitespace-nowrap">
            {effectiveSeatLimit - totalStudents} Seats Left
          </span>
        </div>
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Student Directory & Admissions</h1>
            <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider border ${
              isSeatLimitReached 
                ? 'bg-red-100 text-red-700 border-red-200' 
                : isSeatLimitWarning 
                ? 'bg-amber-100 text-amber-700 border-amber-200' 
                : 'bg-primary-50 text-primary-700 border-primary-200'
            }`}>
              Seats: {totalStudents} / {effectiveSeatLimit}
            </span>
          </div>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Review public admission applications, admit verified students, and manage enrollment directory.</p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <button 
            onClick={() => {
              if (filteredStudents.length === 0) {
                toast.error("No student data available to export.");
                return;
              }
              setExportFileName('Student_Directory');
              setShowExportModal(true);
            }}
            className="px-4 py-2 bg-indigo-50 text-indigo-700 rounded-xl text-sm font-semibold hover:bg-indigo-100 shadow-sm flex items-center gap-2 transition-colors border border-indigo-200"
          >
            <FileDown size={18} /> Export
          </button>
          {hasCreatePermission && (
            <button 
              onClick={() => {
                setUploadFile(null);
                setSelectedStudentForUpload(null);
                setUploadModalOpen(true);
              }}
              className="px-4 py-2 bg-emerald-100 text-emerald-700 rounded-xl text-sm font-semibold hover:bg-emerald-200 shadow-sm flex items-center gap-2 transition-colors"
            >
              <UploadCloud size={18} /> Bulk Import
            </button>
          )}
          {hasCreatePermission && (
            showForm ? (
              <button 
                onClick={() => setShowForm(false)}
                className="px-4 py-2 bg-red-100 text-red-700 hover:bg-red-200 rounded-xl text-sm font-semibold shadow-sm flex items-center gap-2 transition-colors border border-red-200"
              >
                Cancel Admission
              </button>
            ) : (
              <div className="relative" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setNewAdmissionDropdownOpen(!newAdmissionDropdownOpen)}
                  className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-semibold shadow-sm flex items-center gap-2 transition-colors focus:outline-none"
                >
                  <UserPlus size={18} /> New Admission <span className="text-[10px]">▼</span>
                </button>
                {newAdmissionDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-52 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg z-50 py-1.5 animate-fade-in">
                    <button
                      type="button"
                      onClick={() => {
                        setShareLinkModalOpen(true);
                        setNewAdmissionDropdownOpen(false);
                      }}
                      className="w-full text-left px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 transition-colors"
                    >
                      <Share2 size={16} className="text-emerald-600" /> Share Admission Link
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowForm(true);
                        setAddErrors({});
                        setNewAdmissionDropdownOpen(false);
                      }}
                      className="w-full text-left px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 transition-colors"
                    >
                      <UserPlus size={16} className="text-primary-600" /> Add Student
                    </button>
                  </div>
                )}
              </div>
            )
          )}
        </div>
      </div>

      {/* Directory Tab Selector */}
      {!showForm && (
        <div className="flex items-center gap-3 mb-6 border-b border-slate-200 dark:border-slate-700 pb-3">
          <button
            onClick={() => setActiveDirectoryTab('enrolled')}
            className={`flex items-center gap-2.5 px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${
              activeDirectoryTab === 'enrolled'
                ? 'bg-primary-600 text-white shadow-md shadow-primary-500/20'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
          >
            <GraduationCap size={18} />
            <span>Enrolled Students</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
              activeDirectoryTab === 'enrolled' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
            }`}>
              {totalStudents}
            </span>
          </button>

          <button
            onClick={() => setActiveDirectoryTab('applications')}
            className={`flex items-center gap-2.5 px-5 py-2.5 rounded-xl font-bold text-sm transition-all relative ${
              activeDirectoryTab === 'applications'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/20'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
          >
            <UserCheck size={18} />
            <span>Admission Applications</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
              activeDirectoryTab === 'applications'
                ? 'bg-white/20 text-white'
                : pendingAppsCount > 0 ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
            }`}>
              {admissionApplications.length}
            </span>
            {pendingAppsCount > 0 && activeDirectoryTab !== 'applications' && (
              <span className="flex h-2.5 w-2.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
              </span>
            )}
          </button>
        </div>
      )}

      {showForm ? (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm p-8 mb-8 animate-fade-in-down">
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div className="p-2 bg-primary-50 text-primary-600 rounded-lg">
              <UserPlus size={24} />
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Admit New Student</h2>
          </div>

          <form onSubmit={handleCreate} className="space-y-6">
            <div className="bg-slate-50/50 dark:bg-slate-800/50 p-6 rounded-2xl border border-slate-200 dark:border-slate-700">
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 border-b border-slate-200 dark:border-slate-700 pb-3 mb-4">Personal Information</h3>
              <div className="grid md:grid-cols-3 gap-6">
                <div className="md:col-span-3">
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Profile Photo (JPG/PNG)</label>
                  <input type="file" accept="image/png, image/jpeg" onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      const file = e.target.files[0];
                      if (file.size > 3145728 && !file.type.startsWith('audio/')) {
                        toast.error(`File "${file.name}" exceeds the 3MB size limit.`);
                        e.target.value = '';
                        return;
                      }
                      setTempImageFile(URL.createObjectURL(file));
                      setNewStudent({ ...newStudent, photo: file });
                      setCropTarget('add');
                      setCropModalOpen(true);
                      e.target.value = null; // Reset input
                    }
                  }} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900" />
                  {photoFile && (
                    <div className="mt-2 text-sm text-slate-600 dark:text-slate-300 flex items-center gap-3">
                      <img src={URL.createObjectURL(photoFile)} alt="Preview" className="w-12 h-12 rounded-full object-cover border shadow-sm" />
                      <div className="flex flex-col">
                        <span className="truncate font-medium">{photoFile.name}</span>
                        <button type="button" onClick={() => setPhotoFile(null)} className="text-red-500 hover:text-red-700 font-bold self-start mt-0.5 px-2 py-1 rounded-md bg-red-50 text-xs">Remove</button>
                      </div>
                    </div>
                  )}
                </div>
                <div>
                  <label htmlFor="add-student-firstName" className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">First Name *</label>
                  <input 
                    type="text" 
                    id="add-student-firstName"
                    name="firstName"
                    required 
                    value={formData.firstName} 
                    onChange={(e) => {
                      setFormData(prev => ({ ...prev, firstName: e.target.value }));
                      if (addErrors.firstName) {
                        setAddErrors(prev => {
                          const updated = { ...prev };
                          delete updated.firstName;
                          return updated;
                        });
                      }
                    }} 
                    className={`w-full px-4 py-2.5 rounded-xl border bg-white dark:bg-slate-900 focus:ring-2 focus:ring-primary-500 ${addErrors.firstName ? 'border-red-500 focus:ring-red-500' : 'border-slate-200 dark:border-slate-700'}`} 
                  />
                  {addErrors.firstName && (
                    <span className="text-red-500 text-xs mt-1 block font-medium" data-testid="error-firstName">
                      {addErrors.firstName}
                    </span>
                  )}
                </div>
                <div>
                  <label htmlFor="add-student-lastName" className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Last Name *</label>
                  <input 
                    type="text" 
                    id="add-student-lastName"
                    name="lastName"
                    required 
                    value={formData.lastName} 
                    onChange={(e) => {
                      setFormData(prev => ({ ...prev, lastName: e.target.value }));
                      if (addErrors.lastName) {
                        setAddErrors(prev => {
                          const updated = { ...prev };
                          delete updated.lastName;
                          return updated;
                        });
                      }
                    }} 
                    className={`w-full px-4 py-2.5 rounded-xl border bg-white dark:bg-slate-900 focus:ring-2 focus:ring-primary-500 ${addErrors.lastName ? 'border-red-500 focus:ring-red-500' : 'border-slate-200 dark:border-slate-700'}`} 
                  />
                  {addErrors.lastName && (
                    <span className="text-red-500 text-xs mt-1 block font-medium" data-testid="error-lastName">
                      {addErrors.lastName}
                    </span>
                  )}
                </div>
                <div>
                  <label htmlFor="add-student-dob" className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Date of Birth *</label>
                  <input 
                    type="date" 
                    id="add-student-dob"
                    name="dob"
                    max={getTodayDateString()}
                    required 
                    value={formData.dob} 
                    onChange={(e) => {
                      setFormData(prev => ({ ...prev, dob: e.target.value }));
                      if (addErrors.dob) {
                        setAddErrors(prev => {
                          const updated = { ...prev };
                          delete updated.dob;
                          return updated;
                        });
                      }
                    }} 
                    className={`w-full px-4 py-2.5 rounded-xl border bg-white dark:bg-slate-900 focus:ring-2 focus:ring-primary-500 ${addErrors.dob ? 'border-red-500 focus:ring-red-500' : 'border-slate-200 dark:border-slate-700'}`} 
                  />
                  {addErrors.dob && (
                    <span className="text-red-500 text-xs mt-1 block font-medium" data-testid="error-dob">
                      {addErrors.dob}
                    </span>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Age</label>
                  <input type="number" value={formData.age} onChange={(e) => setFormData({...formData, age: e.target.value})} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Gender *</label>
                  <select value={normalizeGender(formData.gender, 'Male')} onChange={(e) => setFormData({...formData, gender: e.target.value})} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900">
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Blood Group</label>
                  <input
                    type="text"
                    id="add-student-bloodGroup"
                    value={formData.bloodGroup}
                    onChange={(e) => {
                      setFormData({...formData, bloodGroup: e.target.value});
                      if (addErrors.bloodGroup) {
                        setAddErrors(prev => {
                          const updated = { ...prev };
                          delete updated.bloodGroup;
                          return updated;
                        });
                      }
                    }}
                    className={`w-full px-4 py-2.5 rounded-xl border bg-white dark:bg-slate-900 focus:ring-2 focus:ring-primary-500 ${addErrors.bloodGroup ? 'border-red-500 focus:ring-red-500' : 'border-slate-200 dark:border-slate-700'}`}
                    placeholder="e.g. O+"
                  />
                  {addErrors.bloodGroup && (
                    <span className="text-xs text-red-500 font-semibold mt-1 block" data-testid="error-bloodGroup">
                      {addErrors.bloodGroup}
                    </span>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Nationality</label>
                  <input type="text" value={formData.nationality} onChange={(e) => setFormData({...formData, nationality: e.target.value})} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Religion</label>
                  <input type="text" value={formData.religion} onChange={(e) => setFormData({...formData, religion: e.target.value})} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Mother Tongue</label>
                  <input type="text" value={formData.motherTongue} onChange={(e) => setFormData({...formData, motherTongue: e.target.value})} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Aadhar Number</label>
                  <input
                    type="text"
                    id="add-student-aadhaar"
                    value={formData.aadharNumber}
                    onChange={(e) => {
                      setFormData({...formData, aadharNumber: e.target.value});
                      if (addErrors.aadharNumber) {
                        setAddErrors(prev => {
                          const updated = { ...prev };
                          delete updated.aadharNumber;
                          return updated;
                        });
                      }
                    }}
                    className={`w-full px-4 py-2.5 rounded-xl border bg-white dark:bg-slate-900 focus:ring-2 focus:ring-primary-500 ${addErrors.aadharNumber ? 'border-red-500 focus:ring-red-500' : 'border-slate-200 dark:border-slate-700'}`}
                    placeholder="12-digit number"
                  />
                  {addErrors.aadharNumber && (
                    <span className="text-xs text-red-500 font-semibold mt-1 block" data-testid="error-aadhaar">
                      {addErrors.aadharNumber}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-slate-50/50 dark:bg-slate-800/50 p-6 rounded-2xl border border-slate-200 dark:border-slate-700">
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 border-b border-slate-200 dark:border-slate-700 pb-3 mb-4">Contact Information</h3>
              <div className="grid md:grid-cols-3 gap-6">
                <div className="md:col-span-3">
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Home Address</label>
                  <textarea value={formData.homeAddress} onChange={(e) => setFormData({...formData, homeAddress: e.target.value})} rows="2" className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900"></textarea>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Parent/Guardian Name</label>
                  <input type="text" value={formData.parentName} onChange={(e) => setFormData({...formData, parentName: e.target.value})} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Parent Email *</label>
                  <input
                    type="email"
                    id="add-student-parentEmail"
                    required
                    value={formData.parentEmail}
                    onChange={(e) => {
                      setFormData({...formData, parentEmail: e.target.value});
                      if (addErrors.parentEmail) {
                        setAddErrors(prev => {
                          const updated = { ...prev };
                          delete updated.parentEmail;
                          return updated;
                        });
                      }
                    }}
                    className={`w-full px-4 py-2.5 rounded-xl border bg-white dark:bg-slate-900 focus:ring-2 focus:ring-primary-500 ${addErrors.parentEmail ? 'border-red-500 focus:ring-red-500' : 'border-slate-200 dark:border-slate-700'}`}
                  />
                  {addErrors.parentEmail && (
                    <span className="text-xs text-red-500 font-semibold mt-1 block" data-testid="error-parentEmail">
                      {addErrors.parentEmail}
                    </span>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">
                    Parent Phone Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="10-digit mobile number"
                    id="add-student-parentPhone"
                    value={formData.parentPhone}
                    onChange={(e) => {
                      setFormData({...formData, parentPhone: e.target.value});
                      if (addErrors.parentPhone) {
                        setAddErrors(prev => {
                          const updated = { ...prev };
                          delete updated.parentPhone;
                          return updated;
                        });
                      }
                    }}
                    className={`w-full px-4 py-2.5 rounded-xl border bg-white dark:bg-slate-900 focus:ring-2 focus:ring-primary-500 ${addErrors.parentPhone ? 'border-red-500 focus:ring-red-500' : 'border-slate-200 dark:border-slate-700'}`}
                  />
                  {addErrors.parentPhone && (
                    <span className="text-xs text-red-500 font-semibold mt-1 block" data-testid="error-parentPhone">
                      {addErrors.parentPhone}
                    </span>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Parent Occupation</label>
                  <input type="text" value={formData.parentOccupation} onChange={(e) => setFormData({...formData, parentOccupation: e.target.value})} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Emergency Contact Number</label>
                  <input type="text" value={formData.emergencyContact} onChange={(e) => setFormData({...formData, emergencyContact: e.target.value})} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Annual Income</label>
                  <input type="text" value={formData.annualIncome} onChange={(e) => setFormData({...formData, annualIncome: e.target.value})} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Sibling Name (Same School)</label>
                  <input type="text" value={formData.siblingName} onChange={(e) => setFormData({...formData, siblingName: e.target.value})} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900" />
                </div>
              </div>
            </div>

            <div className="bg-slate-50/50 dark:bg-slate-800/50 p-6 rounded-2xl border border-slate-200 dark:border-slate-700">
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 border-b border-slate-200 dark:border-slate-700 pb-3 mb-4">Academic Information</h3>
              <div className="grid md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Assign to Class *</label>
                  <select
                    required
                    value={formData.sectionId ? `${formData.classId}:${formData.sectionId}` : (formData.classId || '')}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (!val) {
                        setFormData({ ...formData, classId: '', sectionId: '' });
                      } else {
                        const parts = val.split(':');
                        setFormData({ ...formData, classId: parts[0], sectionId: parts[1] || '' });
                      }
                    }}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900"
                  >
                    <option value="">Select a Class...</option>
                    {selectableClassOptions.map(opt => <option key={opt.key} value={opt.key}>{opt.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Admission Number *</label>
                  <input
                    type="text"
                    id="add-student-admissionNumber"
                    required
                    value={formData.admissionNumber}
                    onChange={(e) => {
                      setFormData({...formData, admissionNumber: e.target.value});
                      if (addErrors.admissionNumber) {
                        setAddErrors(prev => {
                          const updated = { ...prev };
                          delete updated.admissionNumber;
                          return updated;
                        });
                      }
                    }}
                    className={`w-full px-4 py-2.5 rounded-xl border bg-white dark:bg-slate-900 uppercase font-mono focus:ring-2 focus:ring-primary-500 ${addErrors.admissionNumber ? 'border-red-500 focus:ring-red-500' : 'border-slate-200 dark:border-slate-700'}`}
                    placeholder="e.g. ADM-001"
                  />
                  {addErrors.admissionNumber && (
                    <span className="text-xs text-red-500 font-semibold mt-1 block" data-testid="error-admissionNumber">
                      {addErrors.admissionNumber}
                    </span>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Previous School Name</label>
                  <input type="text" value={formData.previousSchool} onChange={(e) => setFormData({...formData, previousSchool: e.target.value})} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Previous Records (Link/Note)</label>
                  <input type="text" value={formData.previousRecords} onChange={(e) => setFormData({...formData, previousRecords: e.target.value})} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Subjects Chosen (Higher Ed)</label>
                  <input type="text" value={formData.subjectsChosen} onChange={(e) => setFormData({...formData, subjectsChosen: e.target.value})} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900" />
                </div>
              </div>
            </div>

            <div className="bg-slate-50/50 dark:bg-slate-800/50 p-6 rounded-2xl border border-slate-200 dark:border-slate-700">
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 border-b border-slate-200 dark:border-slate-700 pb-3 mb-4">Transportation Details</h3>
              <div className="grid md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">School Bus Route/Stop</label>
                  <input type="text" value={formData.busRoute} onChange={(e) => setFormData({...formData, busRoute: e.target.value})} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900" placeholder="e.g. Route 4 - Main Street" />
                </div>
              </div>
            </div>

            <div className="bg-slate-50/50 dark:bg-slate-800/50 p-6 rounded-2xl border border-slate-200 dark:border-slate-700">
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 border-b border-slate-200 dark:border-slate-700 pb-3 mb-4">Fee Configuration</h3>
              <div className="grid md:grid-cols-4 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Tuition Fee</label>
                  <input type="number" value={formData.tuitionFee} onChange={(e) => setFormData({...formData, tuitionFee: e.target.value, totalFee: (Number(e.target.value || 0) + Number(formData.hostelFee || 0) + Number(formData.bookFee || 0) + Number(formData.otherFee || 0)).toString()})} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Hostel Fee (If Req)</label>
                  <input type="number" value={formData.hostelFee} onChange={(e) => setFormData({...formData, hostelFee: e.target.value, totalFee: (Number(formData.tuitionFee || 0) + Number(e.target.value || 0) + Number(formData.bookFee || 0) + Number(formData.otherFee || 0)).toString()})} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Book Fee</label>
                  <input type="number" value={formData.bookFee} onChange={(e) => setFormData({...formData, bookFee: e.target.value, totalFee: (Number(formData.tuitionFee || 0) + Number(formData.hostelFee || 0) + Number(e.target.value || 0) + Number(formData.otherFee || 0)).toString()})} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Other Fee</label>
                  <input type="number" value={formData.otherFee} onChange={(e) => setFormData({...formData, otherFee: e.target.value, totalFee: (Number(formData.tuitionFee || 0) + Number(formData.hostelFee || 0) + Number(formData.bookFee || 0) + Number(e.target.value || 0)).toString()})} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900" />
                </div>
                <div className="md:col-span-4 bg-primary-50 p-4 rounded-xl flex items-center justify-between border border-primary-100">
                  <span className="font-bold text-primary-800">Total Calculated Fee:</span>
                  <span className="font-black text-primary-700 text-lg">₹{formData.totalFee || '0'}</span>
                </div>
              </div>
            </div>



            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3">
              <button 
                type="button" onClick={() => { setShowForm(false); setAddErrors({}); }}
                className="px-6 py-2.5 text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button 
                type="submit" disabled={saving || classes.length === 0}
                className="px-8 py-2.5 bg-primary-600 text-white rounded-xl font-bold hover:bg-primary-700 shadow-sm disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Saving...
                  </>
                ) : 'Admit Student'}
              </button>
            </div>
          </form>
        </div>
      ) : activeDirectoryTab === 'enrolled' ? (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden animate-fade-in-up">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/30">
            <div className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl"><GraduationCap size={20} /></div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Seats Enrolled</p>
                  <p className="text-xl font-bold text-slate-900 dark:text-white">{totalStudents} <span className="text-xs font-normal text-slate-400 dark:text-slate-300">/ {effectiveSeatLimit}</span></p>
                </div>
              </div>
              <div className="mt-2.5">
                <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div 
                    className={`h-full transition-all ${isSeatLimitReached ? 'bg-red-500' : isSeatLimitWarning ? 'bg-amber-500' : 'bg-primary-600'}`} 
                    style={{ width: `${seatUsagePercent}%` }}
                  />
                </div>
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-slate-100 dark:border-slate-800 shadow-sm flex items-center gap-3">
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl"><CheckCircle2 size={20} /></div>
              <div><p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Active</p><p className="text-xl font-bold text-slate-900 dark:text-white">{activeStudents}</p></div>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-slate-100 dark:border-slate-800 shadow-sm flex items-center gap-3">
              <div className="p-3 bg-blue-50 text-blue-600 rounded-xl"><UserPlus size={20} /></div>
              <div><p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Boys</p><p className="text-xl font-bold text-slate-900 dark:text-white">{maleStudents}</p></div>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-slate-100 dark:border-slate-800 shadow-sm flex items-center gap-3">
              <div className="p-3 bg-pink-50 text-pink-600 rounded-xl"><UserPlus size={20} /></div>
              <div><p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Girls</p><p className="text-xl font-bold text-slate-900 dark:text-white">{femaleStudents}</p></div>
            </div>
          </div>

          <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex flex-wrap gap-4 items-center justify-between bg-white dark:bg-slate-900">
            <div className="relative flex-1 min-w-[250px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-300" size={18} />
              <input 
                type="text" 
                placeholder="Search by student name or admission number..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-300 hover:text-slate-600 dark:hover:text-slate-300 p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                  title="Clear search"
                >
                  <X size={16} />
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Filter size={18} className="text-slate-400 dark:text-slate-300 hidden sm:block" />
              <select 
                value={genderFilter}
                onChange={(e) => setGenderFilter(e.target.value)}
                className="px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="all">All Genders</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
              <select 
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value)}
                className="px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="all">All Classes</option>
                {selectableClassOptions.map(opt => (
                  <option key={opt.key} value={opt.key}>{opt.label}</option>
                ))}
              </select>
              <select 
                value={rowsPerPage}
                onChange={(e) => setRowsPerPage(Number(e.target.value))}
                className="px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value={10}>10 per page</option>
                <option value={20}>20 per page</option>
                <option value={50}>50 per page</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto w-full custom-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 text-slate-400 dark:text-slate-300 text-xs font-semibold uppercase tracking-wider">
                  <th className="py-4 px-6">Student</th>
                  <th className="py-4 px-6">Admission No</th>
                  <th className="py-4 px-6">Class</th>
                  <th className="py-4 px-6">Attachment</th>
                  <th className="py-4 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm text-slate-600 dark:text-slate-300 font-medium">
                {paginatedStudents.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="py-12 text-center text-slate-400 dark:text-slate-300">
                      <div className="flex flex-col items-center justify-center">
                        <GraduationCap size={44} className="text-slate-300 mb-2" />
                        <p className="font-semibold text-slate-700 dark:text-slate-200 text-base">
                          {searchQuery ? `No students matching "${searchQuery}"` : 'No enrolled students found'}
                        </p>
                        <p className="text-xs text-slate-400 dark:text-slate-300 mt-1">
                          {searchQuery 
                            ? 'Check the spelling of the student name or admission number, or reset your search.' 
                            : 'Try adjusting your filters, or admit a new student.'}
                        </p>
                        {searchQuery && (
                          <button
                            onClick={() => setSearchQuery('')}
                            className="mt-4 px-4 py-2 bg-primary-50 text-primary-700 hover:bg-primary-100 dark:hover:bg-slate-700 rounded-xl text-sm font-semibold transition-colors inline-flex items-center gap-2"
                          >
                            <X size={16} /> Clear Search Filter
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedStudents.map((student) => (
                    <tr key={student.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-4 pl-6">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 shrink-0 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-bold text-sm overflow-hidden border border-primary-200">
                            {student.photoUrl ? (
                              <img src={student.photoUrl} alt="Avatar" className="w-full h-full object-cover" />
                            ) : (
                              <>{(student.firstName?.charAt(0) || student.name?.charAt(0) || 'S')}{(student.lastName?.charAt(0) || '')}</>
                            )}
                          </div>
                          <div className="font-semibold text-slate-900 dark:text-white leading-snug">
                            {student.firstName || student.name || student.fullName || ''} {student.lastName || ''}
                          </div>
                        </div>
                      </td>
                      <td className="p-4 font-mono text-slate-600 dark:text-slate-300 font-medium">
                        {student.admissionNumber || student.admissionNo || student.rollNo || '-'}
                      </td>
                      <td className="p-4 text-slate-700 dark:text-slate-200">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
                          {getClassName(student.classId, student)}
                        </span>
                      </td>
                      <td className="p-4">
                        {student.attachmentUrl ? (
                          <a href={student.attachmentUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors tooltip-trigger" title={student.attachmentName}>
                            <ExternalLink size={12} /> View Doc
                          </a>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-300 text-xs italic">No attachment</span>
                        )}
                      </td>
                      <td className="p-4 pr-6 text-right">
                        <div className="flex justify-end gap-2">
                          <button 
                            onClick={() => {
                              setSelectedStudentToView(student);
                              setIsEditMode(false);
                              setEditStudentData(null);
                              setEditCustomData({});
                              setEditErrors({});
                              setShowDiscardConfirm(false);
                              setViewStudentModalOpen(true);
                              getStudentHealth(student.id).then((healthRes) => {
                                const hData = healthRes?.data || healthRes;
                                if (hData) {
                                  setSelectedStudentToView((prev) => (prev?.id === student.id ? {
                                    ...prev,
                                    bloodGroup: hData.bloodGroup || prev.bloodGroup,
                                    medicalInfo: hData.doctorNotes || prev.medicalInfo
                                  } : prev));
                                }
                              }).catch(() => {});
                            }}
                            className="p-2 text-slate-500 dark:text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
                            title="View Details"
                          >
                            <Eye size={18} />
                          </button>
                          {hasDeletePermission && (
                            <button 
                              onClick={() => setConfirmDeleteState({ isOpen: true, id: student.id, name: `${student.firstName} ${student.lastName}` })}
                              className="p-2 text-slate-500 dark:text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
                              title="Delete Student"
                            >
                              <Trash size={18} />
                            </button>
                          )}
                           <button 
                             onClick={() => openAssignModal(student)}
                             className="px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors"
                           >
                             {student.classId ? 'Change Class' : 'Assign'}
                           </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between bg-slate-50 dark:bg-slate-800 rounded-b-3xl">
              <span className="text-sm text-slate-500 dark:text-slate-400">
                Showing {(currentPage - 1) * rowsPerPage + 1} to {Math.min(currentPage * rowsPerPage, filteredStudents.length)} of {filteredStudents.length} entries
              </span>
              <div className="flex gap-2">
                <button 
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 disabled:opacity-50 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Previous
                </button>
                <div className="flex items-center justify-center px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
                  Page {currentPage} of {totalPages}
                </div>
                <button 
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 disabled:opacity-50 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ADMISSION APPLICATIONS TAB VIEW */
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden animate-fade-in-up">
          {/* Applications Stat Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/30">
            <div className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-slate-100 dark:border-slate-800 shadow-sm flex items-center gap-3">
              <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl"><UserCheck size={20} /></div>
              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Received</p>
                <p className="text-xl font-bold text-slate-900 dark:text-white">{admissionApplications.length}</p>
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-amber-100 bg-amber-50/40 shadow-sm flex items-center gap-3">
              <div className="p-3 bg-amber-100 text-amber-600 rounded-xl"><Clock size={20} /></div>
              <div>
                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider">Pending Review</p>
                <p className="text-xl font-bold text-amber-900">{pendingAppsCount}</p>
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-emerald-100 bg-emerald-50/40 shadow-sm flex items-center gap-3">
              <div className="p-3 bg-emerald-100 text-emerald-600 rounded-xl"><CheckCircle2 size={20} /></div>
              <div>
                <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">Approved & Admitted</p>
                <p className="text-xl font-bold text-emerald-900">{approvedAppsCount}</p>
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-slate-100 dark:border-slate-800 shadow-sm flex items-center gap-3">
              <div className="p-3 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl"><X size={20} /></div>
              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Rejected</p>
                <p className="text-xl font-bold text-slate-900 dark:text-white">{rejectedAppsCount}</p>
              </div>
            </div>
          </div>

          {/* Search & Filter Header */}
          <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex flex-wrap gap-4 items-center justify-between bg-white dark:bg-slate-900">
            <div className="relative flex-1 min-w-[250px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-300" size={18} />
              <input 
                type="text" 
                placeholder="Search by student name, application no, parent phone..." 
                value={appSearchQuery}
                onChange={(e) => setAppSearchQuery(e.target.value)}
                className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
              />
              {appSearchQuery && (
                <button 
                  onClick={() => setAppSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-300 hover:text-slate-600 dark:hover:text-slate-300 p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                  title="Clear search"
                >
                  <X size={16} />
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Filter size={18} className="text-slate-400 dark:text-slate-300 hidden sm:block" />
              <select 
                value={appStatusFilter}
                onChange={(e) => setAppStatusFilter(e.target.value)}
                className="px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="all">All Statuses</option>
                <option value="Pending">Pending Review</option>
                <option value="Approved">Approved & Admitted</option>
                <option value="Rejected">Rejected</option>
              </select>
              <select 
                value={appRowsPerPage}
                onChange={(e) => setAppRowsPerPage(Number(e.target.value))}
                className="px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value={10}>10 per page</option>
                <option value={20}>20 per page</option>
                <option value={50}>50 per page</option>
              </select>
            </div>
          </div>

          {/* Applications Table */}
          <div className="overflow-x-auto w-full custom-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 text-slate-400 dark:text-slate-300 text-xs font-semibold uppercase tracking-wider">
                  <th className="py-4 px-6">App ID</th>
                  <th className="py-4 px-6">Applicant Student</th>
                  <th className="py-4 px-6">Target Class</th>
                  <th className="py-4 px-6">Parent Details</th>
                  <th className="py-4 px-6">Submitted Date</th>
                  <th className="py-4 px-6">Status</th>
                  <th className="py-4 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm text-slate-600 dark:text-slate-300 font-medium">
                {paginatedApplications.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="py-16 text-center text-slate-400 dark:text-slate-300">
                      <div className="flex flex-col items-center justify-center max-w-md mx-auto">
                        <div className="w-16 h-16 rounded-3xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3">
                          <Share2 size={28} />
                        </div>
                        <p className="font-bold text-slate-800 dark:text-slate-100 text-base">No Admission Applications Found</p>
                        <p className="text-xs text-slate-400 dark:text-slate-300 mt-1 mb-4 text-center">
                          Share your school's public admission form link with parents or prospective students to receive online applications.
                        </p>
                        <button
                          onClick={() => setShareLinkModalOpen(true)}
                          className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-sm flex items-center gap-2 transition-colors"
                        >
                          <Share2 size={16} /> Share Admission Link
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedApplications.map((app) => (
                    <tr key={app.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-4 px-6">
                        <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-100 bg-slate-100 dark:bg-slate-700 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
                          {app.applicationNumber || app.id?.substring(0, 8)}
                        </span>
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          {app.photoUrl ? (
                            <img 
                              src={app.photoUrl} 
                              alt={app.studentName || `${app.firstName} ${app.lastName}`} 
                              className="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-sm shrink-0">
                              {(app.studentName?.[0] || app.firstName?.[0] || 'S')}
                            </div>
                          )}
                          <div>
                            <p className="font-semibold text-slate-900 dark:text-white">
                              {app.studentName || `${app.firstName || ''} ${app.lastName || ''}`.trim() || 'Prospective Student'}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs text-slate-400 dark:text-slate-300">{app.gender || 'N/A'}</span>
                              {app.age && (
                                <>
                                  <span className="text-slate-300">•</span>
                                  <span className="text-xs text-slate-400 dark:text-slate-300">{app.age} yrs</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <span className="inline-block px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                          {getClassName(app.targetClassId) !== 'Unknown' ? getClassName(app.targetClassId) : (app.targetClassName || 'Pending Assign')}
                        </span>
                      </td>
                      <td className="py-4 px-6">
                        <div>
                          <p className="text-slate-900 dark:text-white font-medium">{app.parentName || 'N/A'}</p>
                          <p className="text-xs text-slate-400 dark:text-slate-300">{app.parentPhone || app.parentEmail || 'No contact'}</p>
                        </div>
                      </td>
                      <td className="py-4 px-6 text-xs text-slate-500 dark:text-slate-400">
                        {app.submittedAt ? new Date(app.submittedAt).toLocaleDateString('en-GB') : 'Recent'}
                      </td>
                      <td className="py-4 px-6">
                        {app.status === 'Approved' ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <CheckCircle2 size={14} className="text-emerald-600" /> Approved & Admitted
                          </span>
                        ) : app.status === 'Rejected' ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
                            <X size={14} className="text-slate-500 dark:text-slate-400" /> Rejected
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                            <Clock size={14} className="text-amber-600" /> Pending Review
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button 
                            onClick={() => handleOpenReviewModal(app)}
                            className={`px-3.5 py-1.5 rounded-xl font-bold text-xs shadow-sm flex items-center gap-1.5 transition-all ${
                              app.status === 'Approved'
                                ? 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600'
                                : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                            }`}
                            title="Review Application Details & Admit"
                          >
                            <Eye size={14} />
                            {app.status === 'Approved' ? 'View Details' : 'Review & Admit'}
                          </button>
                          {hasDeletePermission && (
                            <button 
                              onClick={() => {
                                if (window.confirm(`Delete application for ${app.studentName || app.firstName}?`)) {
                                  handleDeleteApplication(app.id);
                                }
                              }}
                              className="p-2 text-slate-400 dark:text-slate-300 hover:text-red-600 hover:bg-red-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
                              title="Delete Application"
                            >
                              <Trash size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {appTotalPages > 1 && (
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between bg-slate-50 dark:bg-slate-800 rounded-b-3xl">
              <span className="text-sm text-slate-500 dark:text-slate-400">
                Showing {(appCurrentPage - 1) * appRowsPerPage + 1} to {Math.min(appCurrentPage * appRowsPerPage, filteredApplications.length)} of {filteredApplications.length} applications
              </span>
              <div className="flex gap-2">
                <button 
                  onClick={() => setAppCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={appCurrentPage === 1}
                  className="px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 disabled:opacity-50 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Previous
                </button>
                <div className="flex items-center justify-center px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
                  Page {appCurrentPage} of {appTotalPages}
                </div>
                <button 
                  onClick={() => setAppCurrentPage(prev => Math.min(prev + 1, appTotalPages))}
                  disabled={appCurrentPage === appTotalPages}
                  className="px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 disabled:opacity-50 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {uploadModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden animate-fade-in-up flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800 shrink-0">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <FileText className="text-primary-600" />
                {selectedStudentForUpload ? 'Upload Document' : 'Bulk Import Students'}
              </h2>
              <button onClick={() => setUploadModalOpen(false)} className="p-2 text-slate-400 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
              {selectedStudentForUpload ? (
                <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
                  Upload a document (e.g. Birth Certificate) for <span className="font-bold text-slate-900 dark:text-white">{selectedStudentForUpload.firstName} {selectedStudentForUpload.lastName}</span>. 
                  <br/><span className="text-xs text-slate-400 dark:text-slate-300 mt-1 block">File will be securely stored in: {schoolName}/Students/...</span>
                </p>
              ) : (
                <div className="flex flex-col gap-3 mb-6 bg-blue-50/50 dark:bg-blue-900/10 p-4 rounded-xl border border-blue-100 dark:border-blue-800/30">
                  <p className="text-sm text-slate-700 dark:text-slate-300">
                    Upload an Excel or CSV file to bulk import students. For best results, we highly recommend using our standard template.
                  </p>
                  <button
                    onClick={() => {
                      const ws_data = [
                        ['Full Name', 'Admission Number', 'Date of Birth', 'Gender', 'Blood Group', 'Nationality', 'Religion', 'Aadhar Number', 'Home Address', 'Parent/Guardian Name', 'Parent Phone', 'Parent Email', 'Parent Occupation', 'Emergency Contact', 'Previous School'],
                        ['Rahul Sharma', 'ADM1001', '2012-04-15', 'Male', 'O+', 'Indian', 'Hindu', '1234-5678-9012', '123 Park Street', 'Anil Sharma', '9876543210', 'parent@example.com', 'Business', '9876543210', 'St. Xavier School']
                      ];
                      const ws = XLSX.utils.aoa_to_sheet(ws_data);
                      const wb = XLSX.utils.book_new();
                      XLSX.utils.book_append_sheet(wb, ws, "Students");
                      XLSX.writeFile(wb, "Bulk_Import_Template.xlsx");
                    }}
                    className="self-start text-sm px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg font-medium text-primary-600 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center gap-2"
                  >
                    <FileDown size={16} /> Download Standard Template
                  </button>
                </div>
              )}

              <div className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl p-8 bg-slate-50 dark:bg-slate-800 relative overflow-hidden group hover:border-primary-400 dark:hover:border-slate-700 hover:bg-primary-50 dark:hover:bg-slate-800 transition-all text-center">
                <input 
                  type="file" 
                  accept={selectedStudentForUpload ? "image/*, .pdf" : ".xlsx, .csv"}
                  onChange={(e) => {
                    const file = e.target.files[0];
                    if (file) {
                      if (file.size > 3145728 && !file.type.startsWith('audio/')) {
                        toast.error(`File "${file.name}" exceeds the 3MB size limit.`);
                        e.target.value = '';
                        return;
                      }
                      setUploadFile(file);
                    }
                  }}
                  className="absolute inset-0 opacity-0 cursor-pointer z-10" 
                />
                <UploadCloud size={32} className={`mx-auto mb-3 ${uploadFile ? 'text-green-500' : 'text-slate-400 dark:text-slate-300 group-hover:text-primary-500'}`} />
                {uploadFile ? (
                  <div>
                    <p className="font-semibold text-green-700 text-sm truncate">{uploadFile.name}</p>
                    <p className="text-xs text-green-600 mt-1">Ready to upload</p>
                  </div>
                ) : (
                  <div>
                    <p className="font-semibold text-slate-700 dark:text-slate-200 text-sm">Click or drag file to upload</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{selectedStudentForUpload ? 'PDF, JPG, PNG up to 10MB' : 'Excel or CSV file'}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="p-6 bg-slate-50 dark:bg-slate-800 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3 shrink-0">
              <button 
                onClick={() => setUploadModalOpen(false)}
                className="px-5 py-2.5 text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-200 dark:hover:bg-slate-600 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleUpload}
                disabled={uploading || !uploadFile}
                className="px-6 py-2.5 bg-primary-600 text-white font-bold hover:bg-primary-700 rounded-xl shadow-sm disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                {uploading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Uploading...
                  </>
                ) : 'Upload File'}
              </button>
            </div>
          </div>
        </div>
      )}

      {viewStudentModalOpen && selectedStudentToView && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden animate-fade-in-up flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800 shrink-0">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <GraduationCap className="text-indigo-600" />
                {isEditMode ? 'Edit Student Details' : 'Student Details'}
              </h2>
              <button onClick={handleModalCloseOrCancel} className="p-2 text-slate-400 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
              <div className="flex items-center gap-4 mb-6 pb-6 border-b border-slate-100 dark:border-slate-800">
                <div className="w-16 h-16 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-2xl shrink-0 overflow-hidden border-2 border-white shadow-sm">
                  {selectedStudentToView.photoUrl ? (
                    <img src={selectedStudentToView.photoUrl} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    <>{selectedStudentToView.firstName?.charAt(0) || ''}{selectedStudentToView.lastName?.charAt(0) || ''}</>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white truncate">
                    {selectedStudentToView.firstName} {selectedStudentToView.middleName ? `${selectedStudentToView.middleName} ` : ''}{selectedStudentToView.lastName}
                  </h3>
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                    Admission No:{' '}
                    <span className="text-slate-800 dark:text-slate-100 font-mono font-bold">
                      {selectedStudentToView.admissionNumber}
                    </span>
                  </p>
                </div>
              </div>

              {!isEditMode ? (
                /* VIEW MODE */
                <div className="space-y-6">
                  {/* Personal Information */}
                  <div className="bg-slate-50 dark:bg-slate-800 p-6 rounded-2xl border border-slate-200/60">
                    <h4 className="text-sm font-extrabold text-slate-900 dark:text-white uppercase tracking-wider mb-4 pb-2 border-b border-slate-200/80">Personal Information</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider mb-1">First Name</label>
                        <p className="text-slate-950 font-semibold">{selectedStudentToView.firstName || '—'}</p>
                      </div>
                      {selectedStudentToView.middleName && (
                        <div>
                          <label className="block text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider mb-1">Middle Name</label>
                          <p className="text-slate-950 font-semibold">{selectedStudentToView.middleName}</p>
                        </div>
                      )}
                      <div>
                        <label className="block text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider mb-1">Last Name</label>
                        <p className="text-slate-950 font-semibold">{selectedStudentToView.lastName || '—'}</p>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider mb-1">Date of Birth</label>
                        <p className="text-slate-950 font-semibold">{formatDate(selectedStudentToView.dob)}</p>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider mb-1">Age</label>
                        <p className="text-slate-950 font-semibold">{selectedStudentToView.age || '—'}</p>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider mb-1">Gender</label>
                        <p className="text-slate-950 font-semibold">{normalizeGender(selectedStudentToView.gender, '—')}</p>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider mb-1">Blood Group</label>
                        <p className="text-slate-950 font-semibold">{selectedStudentToView.bloodGroup || '—'}</p>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider mb-1">Nationality</label>
                        <p className="text-slate-950 font-semibold">{selectedStudentToView.nationality || '—'}</p>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider mb-1">Religion</label>
                        <p className="text-slate-950 font-semibold">{selectedStudentToView.religion || '—'}</p>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider mb-1">Mother Tongue</label>
                        <p className="text-slate-950 font-semibold">{selectedStudentToView.motherTongue || '—'}</p>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider mb-1">Aadhaar Number</label>
                        <p className="text-slate-950 font-semibold">{selectedStudentToView.aadharNumber || '—'}</p>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider mb-1">Student Phone</label>
                        <p className="text-slate-950 font-semibold">{selectedStudentToView.studentPhone || '—'}</p>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider mb-1">Student Email</label>
                        <p className="text-slate-950 font-semibold">{selectedStudentToView.studentEmail || '—'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Academic Information */}
                  <div className="bg-slate-50 dark:bg-slate-800 p-6 rounded-2xl border border-slate-200/60">
                    <h4 className="text-sm font-extrabold text-slate-900 dark:text-white uppercase tracking-wider mb-4 pb-2 border-b border-slate-200/80">Academic Information</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider mb-1">Class & Section</label>
                        <p className="text-slate-950 font-semibold">{getClassName(selectedStudentToView.classId, selectedStudentToView)}</p>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider mb-1">Roll Number</label>
                        <p className="text-slate-950 font-semibold">{selectedStudentToView.rollNumber || '—'}</p>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider mb-1">Admission Date</label>
                        <p className="text-slate-950 font-semibold">{selectedStudentToView.admissionDate ? new Date(selectedStudentToView.admissionDate).toLocaleDateString('en-GB') : '—'}</p>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider mb-1">Status</label>
                        <div>
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                            selectedStudentToView.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {selectedStudentToView.status || 'Active'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Parent / Guardian Information */}
                  <div className="bg-slate-50 dark:bg-slate-800 p-6 rounded-2xl border border-slate-200/60">
                    <h4 className="text-sm font-extrabold text-slate-900 dark:text-white uppercase tracking-wider mb-4 pb-2 border-b border-slate-200/80">Parent / Guardian Information</h4>
                    <div className="space-y-4">
                      {/* Father info */}
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 pb-3 border-b border-slate-200/50">
                        <div>
                          <label className="block text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider mb-1">Father's Name</label>
                          <p className="text-slate-950 font-semibold">{selectedStudentToView.parentName || '—'}</p>
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider mb-1">Father's Phone</label>
                          <p className="text-slate-950 font-semibold">{selectedStudentToView.parentPhone || '—'}</p>
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider mb-1">Father's Email</label>
                          <p className="text-slate-950 font-semibold truncate">{selectedStudentToView.parentEmail || '—'}</p>
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider mb-1">Occupation</label>
                          <p className="text-slate-950 font-semibold">{selectedStudentToView.parentOccupation || '—'}</p>
                        </div>
                      </div>
                      {/* Mother info */}
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 pb-3 border-b border-slate-200/50">
                        <div>
                          <label className="block text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider mb-1">Mother's Name</label>
                          <p className="text-slate-950 font-semibold">{selectedStudentToView.motherName || '—'}</p>
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider mb-1">Mother's Phone</label>
                          <p className="text-slate-950 font-semibold">{selectedStudentToView.motherPhone || '—'}</p>
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider mb-1">Mother's Email</label>
                          <p className="text-slate-950 font-semibold truncate">{selectedStudentToView.motherEmail || '—'}</p>
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider mb-1">Occupation</label>
                          <p className="text-slate-950 font-semibold">{selectedStudentToView.motherOccupation || '—'}</p>
                        </div>
                      </div>
                      {/* Guardian info */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider mb-1">Guardian Name</label>
                          <p className="text-slate-950 font-semibold">{selectedStudentToView.guardianName || '—'}</p>
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider mb-1">Guardian Phone</label>
                          <p className="text-slate-950 font-semibold">{selectedStudentToView.guardianPhone || '—'}</p>
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider mb-1">Relationship</label>
                          <p className="text-slate-950 font-semibold">{selectedStudentToView.guardianRelationship || '—'}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Address Information */}
                  <div className="bg-slate-50 dark:bg-slate-800 p-6 rounded-2xl border border-slate-200/60">
                    <h4 className="text-sm font-extrabold text-slate-900 dark:text-white uppercase tracking-wider mb-4 pb-2 border-b border-slate-200/80">Address Information</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="col-span-1 sm:col-span-3">
                        <label className="block text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider mb-1">Address Line 1</label>
                        <p className="text-slate-950 font-semibold">{selectedStudentToView.addressLine1 || selectedStudentToView.homeAddress || '—'}</p>
                      </div>
                      <div className="col-span-1 sm:col-span-3">
                        <label className="block text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider mb-1">Address Line 2</label>
                        <p className="text-slate-950 font-semibold">{selectedStudentToView.addressLine2 || '—'}</p>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider mb-1">City</label>
                        <p className="text-slate-950 font-semibold">{selectedStudentToView.city || '—'}</p>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider mb-1">District</label>
                        <p className="text-slate-950 font-semibold">{selectedStudentToView.district || '—'}</p>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider mb-1">State</label>
                        <p className="text-slate-950 font-semibold">{selectedStudentToView.state || '—'}</p>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider mb-1">Country</label>
                        <p className="text-slate-950 font-semibold">{selectedStudentToView.country || '—'}</p>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider mb-1">Pincode</label>
                        <p className="text-slate-950 font-semibold">{selectedStudentToView.pincode || '—'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Other Details */}
                  <div className="bg-slate-50 dark:bg-slate-800 p-6 rounded-2xl border border-slate-200/60">
                    <h4 className="text-sm font-extrabold text-slate-900 dark:text-white uppercase tracking-wider mb-4 pb-2 border-b border-slate-200/80">Other Details</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider mb-1">Previous School</label>
                        <p className="text-slate-950 font-semibold">{selectedStudentToView.previousSchool || '—'}</p>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider mb-1">Identification Marks</label>
                        <p className="text-slate-950 font-semibold">{selectedStudentToView.identificationMarks || '—'}</p>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider mb-1">Transport Details</label>
                        <p className="text-slate-950 font-semibold">{selectedStudentToView.transportDetails || selectedStudentToView.busRoute || '—'}</p>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider mb-1">Hostel Details</label>
                        <p className="text-slate-950 font-semibold">{selectedStudentToView.hostelDetails || '—'}</p>
                      </div>
                      <div className="col-span-1 sm:col-span-2">
                        <label className="block text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider mb-1">Medical Information</label>
                        <p className="text-slate-950 font-semibold whitespace-pre-line">{selectedStudentToView.medicalInfo || '—'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Fee Configuration */}
                  <div className="bg-slate-50 dark:bg-slate-800 p-6 rounded-2xl border border-slate-200/60">
                    <h4 className="text-sm font-extrabold text-slate-900 dark:text-white uppercase tracking-wider mb-4 pb-2 border-b border-slate-200/80">Fee Configuration</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider mb-1">Tuition Fee</label>
                        <p className="text-slate-950 font-semibold">{selectedStudentToView.tuitionFee ? `₹${selectedStudentToView.tuitionFee}` : '—'}</p>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider mb-1">Hostel Fee</label>
                        <p className="text-slate-950 font-semibold">{selectedStudentToView.hostelFee ? `₹${selectedStudentToView.hostelFee}` : '—'}</p>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider mb-1">Book Fee</label>
                        <p className="text-slate-950 font-semibold">{selectedStudentToView.bookFee ? `₹${selectedStudentToView.bookFee}` : '—'}</p>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider mb-1">Other Fee</label>
                        <p className="text-slate-950 font-semibold">{selectedStudentToView.otherFee ? `₹${selectedStudentToView.otherFee}` : '—'}</p>
                      </div>
                      <div className="col-span-2 sm:col-span-4 pt-2 border-t border-slate-200/60 flex justify-between items-center">
                        <span className="text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider">Total Fee</span>
                        <span className="text-primary-700 font-black text-lg">{selectedStudentToView.totalFee ? `₹${selectedStudentToView.totalFee}` : '—'}</span>
                      </div>
                    </div>
                  </div>



                  {/* Attendance Analytics */}
                  <div className="bg-slate-50 dark:bg-slate-800 p-6 rounded-2xl border border-slate-200/60 space-y-6">
                    <h4 className="text-sm font-extrabold text-slate-900 dark:text-white uppercase tracking-wider pb-2 border-b border-slate-200/80">Attendance Analytics</h4>
                    {studentStats ? (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider">Running Rate</p>
                          {(() => {
                            const rate = studentStats.percentage !== undefined ? studentStats.percentage : (studentStats.attendancePercentage ?? 0);
                            return (
                              <span className={`inline-block mt-2 text-xl font-black px-2.5 py-0.5 rounded-full border ${
                                rate >= 75 ? 'bg-green-50 text-green-700 border-green-200' :
                                rate >= 50 ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                'bg-red-50 text-red-700 border-red-200'
                              }`}>
                                {rate}%
                              </span>
                            );
                          })()}
                        </div>
                        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider">Total Days</p>
                          <p className="text-xl font-extrabold text-slate-800 dark:text-slate-100 mt-2">{studentStats.totalDays}</p>
                        </div>
                        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider">Present / Late</p>
                          <p className="text-xl font-extrabold text-slate-800 dark:text-slate-100 mt-2">
                            <span className="text-green-600">{studentStats.presentDays}</span>
                            <span className="text-slate-300 font-light mx-1">/</span>
                            <span className="text-amber-600">{studentStats.lateDays}</span>
                          </p>
                        </div>
                        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider">Absences</p>
                          <p className="text-xl font-extrabold text-red-600 mt-2">{studentStats.absentDays}</p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 dark:text-slate-300 italic">No running statistics compiled yet for this student.</p>
                    )}

                    <div>
                      <h5 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">This Month's Daily Log</h5>
                      {loadingHistory ? (
                        <div className="flex justify-center py-4">
                          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-600 border-t-transparent"></div>
                        </div>
                      ) : studentHistory.length === 0 ? (
                        <p className="text-xs text-slate-400 dark:text-slate-300 italic">No daily logs found for the current month.</p>
                      ) : (
                        <div className="max-h-[200px] overflow-y-auto border border-slate-200/60 rounded-xl divide-y divide-slate-100 bg-white dark:bg-slate-900">
                          {studentHistory.map((item, idx) => (
                            <div key={idx} className="flex justify-between items-center px-4 py-2.5 text-xs">
                              <div>
                                <span className="font-bold text-slate-800 dark:text-slate-100">{new Date(item.date).toLocaleDateString('en-GB')}</span>
                                <span className="text-slate-400 dark:text-slate-300 ml-2 font-medium">({item.session})</span>
                              </div>
                              <span className={`px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border text-[10px] ${
                                item.status === 'Present' ? 'bg-green-50 text-green-700 border-green-100' :
                                item.status === 'Absent' ? 'bg-red-50 text-red-700 border-red-100' :
                                'bg-amber-50 text-amber-700 border-amber-100'
                              }`}>
                                {item.status}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* System & Metadata Information */}
                  <div className="bg-slate-100/50 dark:bg-slate-700/50 p-4 rounded-2xl border border-slate-200/40 text-xs text-slate-500 dark:text-slate-400 space-y-1">
                    <p>Student ID: <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">{selectedStudentToView.id}</span></p>
                    <p>Created Date: <span className="font-semibold text-slate-700 dark:text-slate-200">{selectedStudentToView.createdAt ? new Date(selectedStudentToView.createdAt).toLocaleString() : 'N/A'}</span></p>
                    {selectedStudentToView.createdBy && <p>Created By: <span className="font-semibold text-slate-700 dark:text-slate-200">{selectedStudentToView.createdBy}</span></p>}
                    {selectedStudentToView.lastUpdatedAt && <p>Last Updated Date: <span className="font-semibold text-slate-700 dark:text-slate-200">{new Date(selectedStudentToView.lastUpdatedAt).toLocaleString()}</span></p>}
                    {selectedStudentToView.lastUpdatedBy && <p>Last Updated By: <span className="font-semibold text-slate-700 dark:text-slate-200">{selectedStudentToView.lastUpdatedBy}</span></p>}
                  </div>
                </div>
              ) : (
                /* EDIT MODE */
                <div className="space-y-6 animate-fade-in">
                  {/* Personal Information Edit */}
                  <div className="bg-slate-50/50 dark:bg-slate-800/50 p-6 rounded-2xl border border-slate-200 dark:border-slate-700">
                    <h4 className="text-sm font-extrabold text-slate-900 dark:text-white uppercase tracking-wider mb-4 pb-2 border-b border-slate-200 dark:border-slate-700">Personal Information</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="sm:col-span-3">
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">Profile Photo (JPG/PNG)</label>
                        <input type="file" accept="image/png, image/jpeg" onChange={(e) => {
                          if (e.target.files && e.target.files.length > 0) {
                            const file = e.target.files[0];
                            if (file.size > 3145728 && !file.type.startsWith('audio/')) {
                              toast.error(`File "${file.name}" exceeds the 3MB size limit.`);
                              e.target.value = '';
                              return;
                            }
                            setTempImageFile(URL.createObjectURL(file));
                            setEditStudentData({ ...editStudentData, photo: file });
                            setCropTarget('edit');
                            setCropModalOpen(true);
                            e.target.value = null;
                          }
                        }} className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-primary-500" />
                        {editPhotoFile ? (
                          <div className="mt-2 text-xs text-slate-600 dark:text-slate-300 flex items-center gap-3">
                            <img src={URL.createObjectURL(editPhotoFile)} alt="Preview" className="w-10 h-10 rounded-full object-cover border shadow-sm" />
                            <div className="flex flex-col justify-center">
                              <span className="truncate font-medium">{editPhotoFile.name}</span>
                              <button type="button" onClick={() => setEditPhotoFile(null)} className="text-red-500 hover:text-red-700 font-bold self-start mt-0.5 px-2 py-1 rounded-md bg-red-50 text-xs">Remove</button>
                            </div>
                          </div>
                        ) : selectedStudentToView.photoUrl && (
                           <div className="mt-2 text-xs text-slate-600 dark:text-slate-300 flex items-center gap-3">
                             <img src={selectedStudentToView.photoUrl} alt="Current profile" className="w-10 h-10 rounded-full object-cover border shadow-sm" />
                             <span className="font-medium">Current photo</span>
                           </div>
                        )}
                      </div>
                      <div>
                        <label htmlFor="edit-student-firstName" className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">First Name *</label>
                        <input
                          type="text"
                          id="edit-student-firstName"
                          name="firstName"
                          value={editStudentData.firstName || ''}
                          onChange={e => handleEditFieldChange('firstName', e.target.value)}
                          className={`w-full px-3 py-2 rounded-xl border bg-white dark:bg-slate-900 focus:ring-2 focus:ring-primary-500 ${editErrors.firstName ? 'border-red-500 focus:ring-red-500' : 'border-slate-200 dark:border-slate-700'}`}
                        />
                        {editErrors.firstName && <span className="text-red-500 text-xs mt-1 block font-medium" data-testid="edit-error-firstName">{editErrors.firstName}</span>}
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">Middle Name</label>
                        <input
                          type="text"
                          value={editStudentData.middleName || ''}
                          onChange={e => handleEditFieldChange('middleName', e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                      <div>
                        <label htmlFor="edit-student-lastName" className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">Last Name *</label>
                        <input
                          type="text"
                          id="edit-student-lastName"
                          name="lastName"
                          value={editStudentData.lastName || ''}
                          onChange={e => handleEditFieldChange('lastName', e.target.value)}
                          className={`w-full px-3 py-2 rounded-xl border bg-white dark:bg-slate-900 focus:ring-2 focus:ring-primary-500 ${editErrors.lastName ? 'border-red-500 focus:ring-red-500' : 'border-slate-200 dark:border-slate-700'}`}
                        />
                        {editErrors.lastName && <span className="text-red-500 text-xs mt-1 block font-medium" data-testid="edit-error-lastName">{editErrors.lastName}</span>}
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">Admission Number *</label>
                        <input
                          type="text"
                          id="edit-student-admissionNumber"
                          value={editStudentData.admissionNumber || ''}
                          onChange={e => handleEditFieldChange('admissionNumber', e.target.value)}
                          className={`w-full px-3 py-2 rounded-xl border bg-white dark:bg-slate-900 focus:ring-2 focus:ring-primary-500 ${editErrors.admissionNumber ? 'border-red-500 focus:ring-red-500' : 'border-slate-200 dark:border-slate-700'}`}
                        />
                        {editErrors.admissionNumber && <span className="text-red-500 text-xs mt-1 block font-medium" data-testid="edit-error-admissionNumber">{editErrors.admissionNumber}</span>}
                      </div>
                      <div>
                        <label htmlFor="edit-student-dob" className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">Date of Birth</label>
                        <input
                          type="date"
                          id="edit-student-dob"
                          name="dob"
                          max={getTodayDateString()}
                          value={editStudentData.dob || ''}
                          onChange={e => handleEditFieldChange('dob', e.target.value)}
                          className={`w-full px-3 py-2 rounded-xl border bg-white dark:bg-slate-900 focus:ring-2 focus:ring-primary-500 ${editErrors.dob ? 'border-red-500 focus:ring-red-500' : 'border-slate-200 dark:border-slate-700'}`}
                        />
                        {editErrors.dob && <span className="text-red-500 text-xs mt-1 block font-medium" data-testid="edit-error-dob">{editErrors.dob}</span>}
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">Gender</label>
                        <select
                          value={normalizeGender(editStudentData.gender, 'Male')}
                          onChange={e => handleEditFieldChange('gender', e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-primary-500"
                        >
                          <option value="Male">Male</option>
                          <option value="Female">Female</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">Blood Group</label>
                        <input
                          type="text"
                          id="edit-student-bloodGroup"
                          value={editStudentData.bloodGroup || ''}
                          onChange={e => handleEditFieldChange('bloodGroup', e.target.value)}
                          placeholder="e.g. O+, A-"
                          className={`w-full px-3 py-2 rounded-xl border bg-white dark:bg-slate-900 focus:ring-2 focus:ring-primary-500 ${editErrors.bloodGroup ? 'border-red-500 focus:ring-red-500' : 'border-slate-200 dark:border-slate-700'}`}
                        />
                        {editErrors.bloodGroup && (
                          <span className="text-red-500 text-xs mt-1 block font-medium" data-testid="edit-error-bloodGroup">
                            {editErrors.bloodGroup}
                          </span>
                        )}
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">Nationality</label>
                        <input
                          type="text"
                          value={editStudentData.nationality || ''}
                          onChange={e => handleEditFieldChange('nationality', e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">Religion</label>
                        <input
                          type="text"
                          value={editStudentData.religion || ''}
                          onChange={e => handleEditFieldChange('religion', e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">Mother Tongue</label>
                        <input
                          type="text"
                          value={editStudentData.motherTongue || ''}
                          onChange={e => handleEditFieldChange('motherTongue', e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">Aadhaar Number</label>
                        <input
                          type="text"
                          id="edit-student-aadhaar"
                          value={editStudentData.aadharNumber || ''}
                          onChange={e => handleEditFieldChange('aadharNumber', e.target.value)}
                          className={`w-full px-3 py-2 rounded-xl border bg-white dark:bg-slate-900 focus:ring-2 focus:ring-primary-500 ${editErrors.aadharNumber ? 'border-red-500 focus:ring-red-500' : 'border-slate-200 dark:border-slate-700'}`}
                        />
                        {editErrors.aadharNumber && (
                          <span className="text-red-500 text-xs mt-1 block" data-testid="edit-error-aadhaar">
                            {editErrors.aadharNumber}
                          </span>
                        )}
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">Student Phone</label>
                        <input
                          type="text"
                          value={editStudentData.studentPhone || ''}
                          onChange={e => handleEditFieldChange('studentPhone', e.target.value)}
                          className={`w-full px-3 py-2 rounded-xl border bg-white dark:bg-slate-900 focus:ring-2 focus:ring-primary-500 ${editErrors.studentPhone ? 'border-red-500 focus:ring-red-500' : 'border-slate-200 dark:border-slate-700'}`}
                        />
                        {editErrors.studentPhone && <span className="text-red-500 text-xs mt-1 block">{editErrors.studentPhone}</span>}
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">Student Email</label>
                        <input
                          type="email"
                          value={editStudentData.studentEmail || ''}
                          onChange={e => handleEditFieldChange('studentEmail', e.target.value)}
                          className={`w-full px-3 py-2 rounded-xl border bg-white dark:bg-slate-900 focus:ring-2 focus:ring-primary-500 ${editErrors.studentEmail ? 'border-red-500 focus:ring-red-500' : 'border-slate-200 dark:border-slate-700'}`}
                        />
                        {editErrors.studentEmail && <span className="text-red-500 text-xs mt-1 block">{editErrors.studentEmail}</span>}
                      </div>
                    </div>
                  </div>

                  {/* Academic Information Edit */}
                  <div className="bg-slate-50/50 dark:bg-slate-800/50 p-6 rounded-2xl border border-slate-200 dark:border-slate-700">
                    <h4 className="text-sm font-extrabold text-slate-900 dark:text-white uppercase tracking-wider mb-4 pb-2 border-b border-slate-200 dark:border-slate-700">Academic Information</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">Class & Section</label>
                        <select
                          value={editStudentData.sectionId ? `${editStudentData.classId}:${editStudentData.sectionId}` : (editStudentData.classId || '')}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (!val) {
                              handleEditFieldChange('classId', '');
                              handleEditFieldChange('sectionId', null);
                            } else {
                              const parts = val.split(':');
                              handleEditFieldChange('classId', parts[0]);
                              handleEditFieldChange('sectionId', parts[1] || null);
                            }
                          }}
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-primary-500"
                        >
                          <option value="">-- Unassigned --</option>
                          {selectableClassOptions.map(opt => (
                            <option key={opt.key} value={opt.key}>{opt.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">Roll Number</label>
                        <input
                          type="text"
                          value={editStudentData.rollNumber || ''}
                          onChange={e => handleEditFieldChange('rollNumber', e.target.value)}
                          className={`w-full px-3 py-2 rounded-xl border bg-white dark:bg-slate-900 focus:ring-2 focus:ring-primary-500 ${editErrors.rollNumber ? 'border-red-500 focus:ring-red-500' : 'border-slate-200 dark:border-slate-700'}`}
                        />
                        {editErrors.rollNumber && <span className="text-red-500 text-xs mt-1 block">{editErrors.rollNumber}</span>}
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">Admission Date</label>
                        <input
                          type="date"
                          value={editStudentData.admissionDate || ''}
                          onChange={e => handleEditFieldChange('admissionDate', e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">Student Status</label>
                        <select
                          value={editStudentData.status || 'Active'}
                          onChange={e => handleEditFieldChange('status', e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-primary-500"
                        >
                          <option value="Active">Active</option>
                          <option value="Inactive">Inactive</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Parent / Guardian Information Edit */}
                  <div className="bg-slate-50/50 dark:bg-slate-800/50 p-6 rounded-2xl border border-slate-200 dark:border-slate-700">
                    <h4 className="text-sm font-extrabold text-slate-900 dark:text-white uppercase tracking-wider mb-4 pb-2 border-b border-slate-200 dark:border-slate-700">Parent / Guardian Information</h4>
                    <div className="space-y-4">
                      {/* Father details */}
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 pb-3 border-b border-slate-200/50">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">Father's Name</label>
                          <input
                            type="text"
                            value={editStudentData.parentName || ''}
                            onChange={e => handleEditFieldChange('parentName', e.target.value)}
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-primary-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">
                            Father's Phone <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            required
                            placeholder="10-digit mobile number"
                            id="edit-student-parentPhone"
                            value={editStudentData.parentPhone || ''}
                            onChange={e => handleEditFieldChange('parentPhone', e.target.value)}
                            className={`w-full px-3 py-2 rounded-xl border bg-white dark:bg-slate-900 focus:ring-2 focus:ring-primary-500 ${editErrors.parentPhone ? 'border-red-500 focus:ring-red-500' : 'border-slate-200 dark:border-slate-700'}`}
                          />
                          {editErrors.parentPhone && <span className="text-red-500 text-xs mt-1 block font-medium" data-testid="edit-error-parentPhone">{editErrors.parentPhone}</span>}
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">Father's Email</label>
                          <input
                            type="email"
                            id="edit-student-parentEmail"
                            value={editStudentData.parentEmail || ''}
                            onChange={e => handleEditFieldChange('parentEmail', e.target.value)}
                            className={`w-full px-3 py-2 rounded-xl border bg-white dark:bg-slate-900 focus:ring-2 focus:ring-primary-500 ${editErrors.parentEmail ? 'border-red-500 focus:ring-red-500' : 'border-slate-200 dark:border-slate-700'}`}
                          />
                          {editErrors.parentEmail && <span className="text-red-500 text-xs mt-1 block font-medium" data-testid="edit-error-parentEmail">{editErrors.parentEmail}</span>}
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">Occupation</label>
                          <input
                            type="text"
                            value={editStudentData.parentOccupation || ''}
                            onChange={e => handleEditFieldChange('parentOccupation', e.target.value)}
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-primary-500"
                          />
                        </div>
                      </div>

                      {/* Mother details */}
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 pb-3 border-b border-slate-200/50">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">Mother's Name</label>
                          <input
                            type="text"
                            value={editStudentData.motherName || ''}
                            onChange={e => handleEditFieldChange('motherName', e.target.value)}
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-primary-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">Mother's Phone</label>
                          <input
                            type="text"
                            value={editStudentData.motherPhone || ''}
                            onChange={e => handleEditFieldChange('motherPhone', e.target.value)}
                            className={`w-full px-3 py-2 rounded-xl border bg-white dark:bg-slate-900 focus:ring-2 focus:ring-primary-500 ${editErrors.motherPhone ? 'border-red-500 focus:ring-red-500' : 'border-slate-200 dark:border-slate-700'}`}
                          />
                          {editErrors.motherPhone && <span className="text-red-500 text-xs mt-1 block">{editErrors.motherPhone}</span>}
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">Mother's Email</label>
                          <input
                            type="email"
                            value={editStudentData.motherEmail || ''}
                            onChange={e => handleEditFieldChange('motherEmail', e.target.value)}
                            className={`w-full px-3 py-2 rounded-xl border bg-white dark:bg-slate-900 focus:ring-2 focus:ring-primary-500 ${editErrors.motherEmail ? 'border-red-500 focus:ring-red-500' : 'border-slate-200 dark:border-slate-700'}`}
                          />
                          {editErrors.motherEmail && <span className="text-red-500 text-xs mt-1 block">{editErrors.motherEmail}</span>}
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">Occupation</label>
                          <input
                            type="text"
                            value={editStudentData.motherOccupation || ''}
                            onChange={e => handleEditFieldChange('motherOccupation', e.target.value)}
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-primary-500"
                          />
                        </div>
                      </div>

                      {/* Guardian details */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">Guardian Name</label>
                          <input
                            type="text"
                            value={editStudentData.guardianName || ''}
                            onChange={e => handleEditFieldChange('guardianName', e.target.value)}
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-primary-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">Guardian Phone</label>
                          <input
                            type="text"
                            value={editStudentData.guardianPhone || ''}
                            onChange={e => handleEditFieldChange('guardianPhone', e.target.value)}
                            className={`w-full px-3 py-2 rounded-xl border bg-white dark:bg-slate-900 focus:ring-2 focus:ring-primary-500 ${editErrors.guardianPhone ? 'border-red-500 focus:ring-red-500' : 'border-slate-200 dark:border-slate-700'}`}
                          />
                          {editErrors.guardianPhone && <span className="text-red-500 text-xs mt-1 block">{editErrors.guardianPhone}</span>}
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">Relationship</label>
                          <input
                            type="text"
                            value={editStudentData.guardianRelationship || ''}
                            onChange={e => handleEditFieldChange('guardianRelationship', e.target.value)}
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-primary-500"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Address Information Edit */}
                  <div className="bg-slate-50/50 dark:bg-slate-800/50 p-6 rounded-2xl border border-slate-200 dark:border-slate-700">
                    <h4 className="text-sm font-extrabold text-slate-900 dark:text-white uppercase tracking-wider mb-4 pb-2 border-b border-slate-200 dark:border-slate-700">Address Information</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="col-span-1 sm:col-span-3">
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">Address Line 1</label>
                        <input
                          type="text"
                          value={editStudentData.addressLine1 || editStudentData.homeAddress || ''}
                          onChange={e => handleEditFieldChange('addressLine1', e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                      <div className="col-span-1 sm:col-span-3">
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">Address Line 2</label>
                        <input
                          type="text"
                          value={editStudentData.addressLine2 || ''}
                          onChange={e => handleEditFieldChange('addressLine2', e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">City</label>
                        <input
                          type="text"
                          value={editStudentData.city || ''}
                          onChange={e => handleEditFieldChange('city', e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">District</label>
                        <input
                          type="text"
                          value={editStudentData.district || ''}
                          onChange={e => handleEditFieldChange('district', e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">State</label>
                        <input
                          type="text"
                          value={editStudentData.state || ''}
                          onChange={e => handleEditFieldChange('state', e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">Country</label>
                        <input
                          type="text"
                          value={editStudentData.country || ''}
                          onChange={e => handleEditFieldChange('country', e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">Pincode</label>
                        <input
                          type="text"
                          value={editStudentData.pincode || ''}
                          onChange={e => handleEditFieldChange('pincode', e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Other Details Edit */}
                  <div className="bg-slate-50/50 dark:bg-slate-800/50 p-6 rounded-2xl border border-slate-200 dark:border-slate-700">
                    <h4 className="text-sm font-extrabold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-4 pb-2 border-b border-slate-200 dark:border-slate-700">Other Details</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">Previous School</label>
                        <input
                          type="text"
                          value={editStudentData.previousSchool || ''}
                          onChange={e => handleEditFieldChange('previousSchool', e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">Identification Marks</label>
                        <input
                          type="text"
                          value={editStudentData.identificationMarks || ''}
                          onChange={e => handleEditFieldChange('identificationMarks', e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">Transport Details</label>
                        <input
                          type="text"
                          value={editStudentData.transportDetails || editStudentData.busRoute || ''}
                          onChange={e => handleEditFieldChange('transportDetails', e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">Hostel Details</label>
                        <input
                          type="text"
                          value={editStudentData.hostelDetails || ''}
                          onChange={e => handleEditFieldChange('hostelDetails', e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                      <div className="col-span-1 sm:col-span-2">
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">Medical Information</label>
                        <textarea
                          rows={3}
                          value={editStudentData.medicalInfo || ''}
                          onChange={e => handleEditFieldChange('medicalInfo', e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Fee Configuration Edit */}
                  <div className="bg-slate-50/50 dark:bg-slate-800/50 p-6 rounded-2xl border border-slate-200 dark:border-slate-700">
                    <h4 className="text-sm font-extrabold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-4 pb-2 border-b border-slate-200 dark:border-slate-700">Fee Configuration</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">Tuition Fee</label>
                        <input
                          type="number"
                          value={editStudentData.tuitionFee || ''}
                          onChange={e => handleEditFeeChange('tuitionFee', e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">Hostel Fee</label>
                        <input
                          type="number"
                          value={editStudentData.hostelFee || ''}
                          onChange={e => handleEditFeeChange('hostelFee', e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">Book Fee</label>
                        <input
                          type="number"
                          value={editStudentData.bookFee || ''}
                          onChange={e => handleEditFeeChange('bookFee', e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">Other Fee</label>
                        <input
                          type="number"
                          value={editStudentData.otherFee || ''}
                          onChange={e => handleEditFeeChange('otherFee', e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                      <div className="col-span-2 sm:col-span-4 pt-2 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center bg-primary-50/50 p-3 rounded-xl">
                        <span className="text-xs font-bold text-primary-800 uppercase tracking-wider">Total Fee</span>
                        <span className="text-primary-700 font-black text-lg">₹{editStudentData.totalFee || '0'}</span>
                      </div>
                    </div>
                  </div>



                  {/* Read-Only System Metadata Section in Edit Mode */}
                  <div className="bg-slate-100/50 dark:bg-slate-700/50 p-4 rounded-2xl border border-slate-200/40 text-xs text-slate-400 dark:text-slate-300 space-y-1 select-none">
                    <p>Student ID: <span className="font-mono font-semibold">{selectedStudentToView.id}</span> (Read-only)</p>
                    <p>Created Date: <span>{selectedStudentToView.createdAt ? new Date(selectedStudentToView.createdAt).toLocaleString() : 'N/A'}</span> (Read-only)</p>
                    {selectedStudentToView.createdBy && <p>Created By: <span>{selectedStudentToView.createdBy}</span> (Read-only)</p>}
                    {selectedStudentToView.lastUpdatedAt && <p>Last Updated Date: <span>{new Date(selectedStudentToView.lastUpdatedAt).toLocaleString()}</span> (Read-only)</p>}
                    {selectedStudentToView.lastUpdatedBy && <p>Last Updated By: <span>{selectedStudentToView.lastUpdatedBy}</span> (Read-only)</p>}
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 bg-slate-50 dark:bg-slate-800 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3 shrink-0">
              {isEditMode ? (
                <>
                  <button 
                    onClick={handleModalCloseOrCancel}
                    className="px-6 py-2.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold hover:bg-slate-300 rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleSaveStudentEdit}
                    disabled={saving}
                    className="px-6 py-2.5 bg-primary-600 text-white font-bold hover:bg-primary-700 rounded-xl transition-colors shadow-sm disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {saving ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Saving...
                      </>
                    ) : 'Save'}
                  </button>
                </>
              ) : (
                <>
                  {hasEditPermission && (
                    <button 
                      onClick={() => {
                        setEditStudentData({ ...selectedStudentToView });
                        setEditCustomData({ ...selectedStudentToView.customData });
                        setEditErrors({});
                        setIsEditMode(true);
                      }}
                      className="px-6 py-2 bg-primary-600 text-white font-bold hover:bg-primary-700 rounded-xl transition-colors shadow-sm"
                    >
                      Edit
                    </button>
                  )}
                  <button 
                    onClick={handleModalCloseOrCancel}
                    className="px-6 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold hover:bg-slate-300 rounded-xl transition-colors"
                  >
                    Close
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Discard Unsaved Changes Warning Modal */}
      {showDiscardConfirm && (
        <ConfirmModal 
          isOpen={showDiscardConfirm}
          onClose={() => setShowDiscardConfirm(false)}
          onConfirm={() => {
            setShowDiscardConfirm(false);
            setIsEditMode(false);
            setViewStudentModalOpen(false);
          }}
          title="Unsaved Changes"
          message="You have unsaved changes. Are you sure you want to discard them?"
          confirmText="Discard Changes"
          cancelText="Continue Editing"
          type="danger"
        />
      )}

      {assignModalOpen && selectedStudentForAssign && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden animate-fade-in-up flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800 shrink-0">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Assign Class</h2>
              <button onClick={() => setAssignModalOpen(false)} className="p-2 text-slate-400 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
              <p className="text-slate-600 dark:text-slate-300 mb-6">
                Select a class to assign <span className="font-bold text-slate-900 dark:text-white">{selectedStudentForAssign.firstName} {selectedStudentForAssign.lastName}</span> to.
              </p>

              <div className="space-y-4">
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Select Class & Section</label>
                <select 
                  value={selectedClassIdForAssign}
                  onChange={(e) => setSelectedClassIdForAssign(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900"
                >
                  <option value="">-- Unassigned --</option>
                  {selectableClassOptions.map(opt => (
                    <option key={opt.key} value={opt.key}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 shrink-0 flex justify-end gap-3">
              <button 
                onClick={() => setAssignModalOpen(false)}
                className="px-6 py-2.5 text-slate-600 dark:text-slate-300 font-bold hover:bg-slate-200 dark:hover:bg-slate-600 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleAssignClass}
                disabled={assigning}
                className="px-6 py-2.5 bg-primary-600 text-white font-bold hover:bg-primary-700 rounded-xl transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2"
              >
                {assigning ? (
                  <><div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> Saving...</>
                ) : (
                  'Save Assignment'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={confirmDeleteState.isOpen}
        title="Delete Student"
        message={`Are you sure you want to delete the student "${confirmDeleteState.name}"? This action cannot be undone.`}
        onConfirm={() => handleDeleteStudent(confirmDeleteState.id)}
        onClose={() => setConfirmDeleteState({ isOpen: false, id: null, name: '' })}
        onCancel={() => setConfirmDeleteState({ isOpen: false, id: null, name: '' })}
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
      />

      {/* Image Cropper Modal */}
      {cropModalOpen && tempImageFile && (
        <ImageCropper
          imageSrc={tempImageFile}
          onCropComplete={(croppedFile) => {
            if (cropTarget === 'add') {
              setPhotoFile(croppedFile);
            } else if (cropTarget === 'edit') {
              setEditPhotoFile(croppedFile);
            }
            setCropModalOpen(false);
            setTempImageFile(null);
          }}
          onCancel={() => {
            setCropModalOpen(false);
            setTempImageFile(null);
          }}
        />
      )}

      {/* Export Columns & Filename Modal */}
      {showExportModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 z-50 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl animate-fade-in-up border border-slate-100 dark:border-slate-800">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Export Student Directory</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Customize file settings and select columns to export.</p>
              </div>
              <button 
                onClick={() => setShowExportModal(false)}
                className="p-2 text-slate-400 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* File Name Input */}
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Export File Name</label>
                <div className="relative">
                  <input
                    type="text"
                    value={exportFileName}
                    onChange={(e) => setExportFileName(e.target.value)}
                    placeholder="Enter file name"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm transition-all pr-12 font-medium"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-300 text-xs font-bold bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded-md">.xlsx</span>
                </div>
              </div>

              {/* Columns Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">Select Columns to Include</label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { key: 'name', label: 'Student Name' },
                    { key: 'admissionNumber', label: 'Admission No.' },
                    { key: 'classSection', label: 'Class & Section' },
                    { key: 'dob', label: 'Date of Birth' },
                    { key: 'gender', label: 'Gender' },
                    { key: 'parentName', label: 'Parent Name' },
                    { key: 'parentPhone', label: 'Parent Phone' },
                    { key: 'parentEmail', label: 'Parent Email' },
                    { key: 'homeAddress', label: 'Home Address' }
                  ].map(({ key, label }) => (
                    <label 
                      key={key} 
                      className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer select-none transition-all ${
                        selectedFields[key] 
                          ? 'border-primary-200 bg-primary-50/30 text-primary-900 font-semibold' 
                          : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedFields[key]}
                        onChange={() => handleFieldToggle(key)}
                        className="rounded border-slate-300 dark:border-slate-600 text-primary-600 focus:ring-primary-500 h-4 w-4"
                      />
                      <span className="text-xs">{label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-6 bg-slate-50 dark:bg-slate-800 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3">
              <button 
                onClick={() => setShowExportModal(false)}
                className="px-5 py-2.5 text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-200 dark:hover:bg-slate-600 rounded-xl transition-colors text-sm"
              >
                Cancel
              </button>
              <button 
                onClick={handleExport}
                className="px-6 py-2.5 bg-primary-600 hover:bg-primary-700 text-white font-bold rounded-xl shadow-sm transition-colors flex items-center gap-2 text-sm"
              >
                <Download size={18} />
                Generate Excel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REVIEW & ADMIT APPLICATION MODAL */}
      {reviewAppModalOpen && selectedAppForReview && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden animate-fade-in-up flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-100 text-emerald-700 rounded-2xl">
                  <UserCheck size={24} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    Review Admission Application
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                    App #{selectedAppForReview.applicationNumber || selectedAppForReview.id} • Submitted on {selectedAppForReview.submittedAt ? new Date(selectedAppForReview.submittedAt).toLocaleDateString('en-GB') : 'N/A'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {selectedAppForReview.status === 'Approved' ? (
                  <span className="px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full text-xs font-bold border border-emerald-200 flex items-center gap-1">
                    <CheckCircle2 size={14} /> Admitted
                  </span>
                ) : selectedAppForReview.status === 'Rejected' ? (
                  <span className="px-3 py-1 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-full text-xs font-bold border border-slate-200 dark:border-slate-700">
                    Rejected
                  </span>
                ) : (
                  <span className="px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-xs font-bold border border-amber-200 flex items-center gap-1">
                    <Clock size={14} /> Pending Review
                  </span>
                )}
                <button 
                  onClick={() => {
                    setReviewAppModalOpen(false);
                    setSelectedAppForReview(null);
                  }}
                  className="p-2 text-slate-400 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-full transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 sm:p-8 flex-1 overflow-y-auto space-y-6 custom-scrollbar">
              {/* Enrollment Assignment Card */}
              {selectedAppForReview.status !== 'Approved' && (
                <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border-2 border-emerald-200 p-6 rounded-2xl shadow-sm">
                  <div className="flex items-center gap-2 text-emerald-900 font-bold text-base mb-4">
                    <Sparkles size={20} className="text-emerald-600" />
                    <span>Admit to Student Directory - Assignment Configuration</span>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-emerald-950 uppercase tracking-wider mb-1.5">
                        Assign Class & Section *
                      </label>
                      <select
                        value={assigningAppClassId}
                        onChange={(e) => setAssigningAppClassId(e.target.value)}
                        className="w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-emerald-300 rounded-xl font-semibold text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                      >
                        {classes.length === 0 ? (
                          <option value="">No classes available - Please create a class first</option>
                        ) : (
                          selectableClassOptions.map(opt => (
                            <option key={opt.key} value={opt.key}>
                              {opt.label} {opt.stream ? `(${opt.stream})` : ''}
                            </option>
                          ))
                        )}
                      </select>
                      <p className="text-xs text-emerald-700 mt-1">Applicant requested: <strong>{getClassName(selectedAppForReview.targetClassId) !== 'Unknown' ? getClassName(selectedAppForReview.targetClassId) : (selectedAppForReview.targetClassName || 'N/A')}</strong></p>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-emerald-950 uppercase tracking-wider mb-1.5">
                        Assigned Admission Number *
                      </label>
                      <input
                        type="text"
                        value={assigningAppAdmissionNumber}
                        onChange={(e) => setAssigningAppAdmissionNumber(e.target.value)}
                        placeholder="e.g. ADM-2026-001"
                        className="w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-emerald-300 rounded-xl font-mono font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                      />
                      <p className="text-xs text-emerald-700 mt-1">Unique student identifier for directory & fees.</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Student Profile Overview */}
              <div className="bg-slate-50/70 p-6 rounded-2xl border border-slate-200 dark:border-slate-700">
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider mb-4 pb-2 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
                  <GraduationCap size={18} className="text-primary-600" /> Applicant Student Profile
                </h3>
                <div className="flex flex-col sm:flex-row gap-6 items-start">
                  {selectedAppForReview.photoUrl ? (
                    <img 
                      src={selectedAppForReview.photoUrl} 
                      alt="Student" 
                      className="w-24 h-24 rounded-2xl object-cover border-2 border-slate-300 dark:border-slate-600 shadow-sm shrink-0"
                    />
                  ) : (
                    <div className="w-24 h-24 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-2xl shrink-0 border border-emerald-200">
                      {selectedAppForReview.firstName?.[0] || selectedAppForReview.studentName?.[0] || 'S'}
                    </div>
                  )}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 flex-1">
                    <div>
                      <p className="text-xs font-semibold text-slate-400 dark:text-slate-300">Full Name</p>
                      <p className="text-sm font-bold text-slate-900 dark:text-white">{selectedAppForReview.studentName || `${selectedAppForReview.firstName || ''} ${selectedAppForReview.lastName || ''}`.trim() || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-400 dark:text-slate-300">Date of Birth</p>
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{formatDate(selectedAppForReview.dob)}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-400 dark:text-slate-300">Age & Gender</p>
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{selectedAppForReview.age ? `${selectedAppForReview.age} yrs` : '-'}, {selectedAppForReview.gender || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-400 dark:text-slate-300">Blood Group</p>
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{selectedAppForReview.bloodGroup || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-400 dark:text-slate-300">Religion & Mother Tongue</p>
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{selectedAppForReview.religion || 'N/A'} {selectedAppForReview.motherTongue ? `(${selectedAppForReview.motherTongue})` : ''}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-400 dark:text-slate-300">Aadhaar / Gov ID</p>
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 font-mono">{selectedAppForReview.aadharNumber || 'N/A'}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Parent & Contact Details */}
              <div className="bg-slate-50/70 p-6 rounded-2xl border border-slate-200 dark:border-slate-700">
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider mb-4 pb-2 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
                  <Phone size={18} className="text-indigo-600" /> Parent & Guardian Contact Information
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs font-semibold text-slate-400 dark:text-slate-300">Parent Name</p>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">{selectedAppForReview.parentName || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-400 dark:text-slate-300">Relationship</p>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{selectedAppForReview.parentRelationship || 'Father'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-400 dark:text-slate-300">Phone Number</p>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 font-mono">{selectedAppForReview.parentPhone || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-400 dark:text-slate-300">Email Address</p>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{selectedAppForReview.parentEmail || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-400 dark:text-slate-300">Occupation</p>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{selectedAppForReview.parentOccupation || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-400 dark:text-slate-300">Annual Income</p>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{selectedAppForReview.annualIncome ? `₹${selectedAppForReview.annualIncome}` : 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-400 dark:text-slate-300">Emergency Contact</p>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 font-mono">{selectedAppForReview.emergencyContact || selectedAppForReview.parentPhone || 'N/A'}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs font-semibold text-slate-400 dark:text-slate-300">Sibling in Same School</p>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{selectedAppForReview.siblingName || 'None'}</p>
                  </div>
                </div>
              </div>

              {/* Address & Academic Background */}
              <div className="grid sm:grid-cols-2 gap-6">
                <div className="bg-slate-50/70 p-6 rounded-2xl border border-slate-200 dark:border-slate-700">
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider mb-4 pb-2 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
                    <MapPin size={18} className="text-rose-600" /> Residential Address
                  </h3>
                  <p className="text-sm text-slate-800 dark:text-slate-100 font-medium whitespace-pre-line leading-relaxed">
                    {selectedAppForReview.homeAddress || 'No address provided'}
                    {(selectedAppForReview.city || selectedAppForReview.state || selectedAppForReview.pincode) && (
                      <span className="block text-xs text-slate-500 dark:text-slate-400 mt-1">
                        {[selectedAppForReview.city, selectedAppForReview.state, selectedAppForReview.pincode].filter(Boolean).join(', ')}
                      </span>
                    )}
                  </p>
                </div>

                <div className="bg-slate-50/70 p-6 rounded-2xl border border-slate-200 dark:border-slate-700">
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider mb-4 pb-2 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
                    <BookOpen size={18} className="text-amber-600" /> Academic & Transport
                  </h3>
                  <div className="space-y-2 text-sm">
                    <p><span className="text-slate-400 dark:text-slate-300 text-xs block">Previous School:</span> <strong className="text-slate-800 dark:text-slate-100">{selectedAppForReview.previousSchool || 'N/A'}</strong></p>
                    <p><span className="text-slate-400 dark:text-slate-300 text-xs block">Previous Records / Marks:</span> <strong className="text-slate-800 dark:text-slate-100">{selectedAppForReview.previousMarks || 'N/A'}</strong></p>
                    <p><span className="text-slate-400 dark:text-slate-300 text-xs block">Bus Route:</span> <strong className="text-slate-800 dark:text-slate-100">{selectedAppForReview.busRoute || 'Not requested'}</strong></p>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-6 bg-slate-50 dark:bg-slate-800 border-t border-slate-100 dark:border-slate-800 flex flex-wrap justify-between items-center gap-3 shrink-0">
              <div>
                {selectedAppForReview.status === 'Pending' && (
                  <button
                    onClick={() => handleRejectApplication(selectedAppForReview.id)}
                    disabled={rejectingApp || approvingApp}
                    className="px-4 py-2.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-xl font-bold text-sm transition-colors border border-red-200"
                  >
                    {rejectingApp ? 'Rejecting...' : 'Reject Application'}
                  </button>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setReviewAppModalOpen(false);
                    setSelectedAppForReview(null);
                  }}
                  className="px-5 py-2.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-slate-700 dark:text-slate-200 rounded-xl font-bold text-sm transition-colors"
                >
                  Close
                </button>

                {selectedAppForReview.status !== 'Approved' && (
                  <button
                    onClick={handleApproveApplication}
                    disabled={approvingApp || isSeatLimitReached}
                    className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm shadow-md transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {approvingApp ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Admitting Student...
                      </>
                    ) : (
                      <>
                        <UserPlus size={18} />
                        Approve & Admit Student
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SHARE ADMISSION LINK MODAL */}
      {shareLinkModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-fade-in-up">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-100 text-emerald-700 rounded-2xl">
                  <Share2 size={22} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">Share Public Admission Form</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Provide this link to prospective students and parents</p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setShareLinkModalOpen(false);
                  setCopiedAdmissionLink(false);
                }}
                className="p-2 text-slate-400 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div className="p-4 bg-emerald-50/60 rounded-2xl border border-emerald-200 text-xs text-emerald-900 leading-relaxed">
                Parents and students can open this link from any smartphone, tablet, or PC to fill out the admission form. Submitted applications will automatically appear in your <strong>Admission Applications</strong> tab for one-click review and admission!
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-2">
                  Official Online Admission Form Link
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={`${window.location.origin}/admission/${schoolId}`}
                    className="flex-1 px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono text-xs text-slate-700 dark:text-slate-200 select-all focus:outline-none"
                  />
                  <button
                    onClick={() => {
                      const link = `${window.location.origin}/admission/${schoolId}`;
                      navigator.clipboard.writeText(link);
                      setCopiedAdmissionLink(true);
                      toast.success("Admission form link copied to clipboard!");
                      setTimeout(() => setCopiedAdmissionLink(false), 3000);
                    }}
                    className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-sm ${
                      copiedAdmissionLink 
                        ? 'bg-emerald-600 text-white' 
                        : 'bg-primary-600 hover:bg-primary-700 text-white'
                    }`}
                  >
                    {copiedAdmissionLink ? <><Check size={16} /> Copied</> : <><Copy size={16} /> Copy</>}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <a
                  href={`/admission/${schoolId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-primary-300 dark:hover:border-slate-700 hover:bg-primary-50/30 text-center transition-all flex flex-col items-center gap-1.5 group"
                >
                  <ExternalLink size={20} className="text-primary-600 group-hover:scale-110 transition-transform" />
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-100">Preview Form</span>
                  <span className="text-[10px] text-slate-400 dark:text-slate-300">Open in new tab</span>
                </a>

                <a
                  href={`mailto:?subject=Online Admission Application - ${encodeURIComponent(schoolName || 'School')}&body=Dear Parent / Student,%0D%0A%0D%0APlease fill out our online school admission form using the following link:%0D%0A${encodeURIComponent(`${window.location.origin}/admission/${schoolId}`)}%0D%0A%0D%0ABest regards,%0D%0A${encodeURIComponent(schoolName || 'School Administration')}`}
                  className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-slate-700 hover:bg-indigo-50/30 text-center transition-all flex flex-col items-center gap-1.5 group"
                >
                  <Mail size={20} className="text-indigo-600 group-hover:scale-110 transition-transform" />
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-100">Send via Email</span>
                  <span className="text-[10px] text-slate-400 dark:text-slate-300">Compose invitation</span>
                </a>
              </div>
            </div>

            <div className="p-6 bg-slate-50 dark:bg-slate-800 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                onClick={() => {
                  setShareLinkModalOpen(false);
                  setCopiedAdmissionLink(false);
                }}
                className="px-6 py-2.5 bg-slate-900 hover:bg-black text-white rounded-xl font-bold text-sm transition-colors shadow-sm"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Live Import Progress Modal */}
      {importProgressModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-100 dark:border-slate-800 max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-primary-50 dark:bg-primary-950/50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-primary-100 dark:border-primary-800/50">
                <UploadCloud className="w-8 h-8 text-primary-600 dark:text-primary-400 animate-pulse" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-1">
                Importing Student Records...
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">
                Updating directory table live in real-time
              </p>

              {/* Progress Bar Container */}
              <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-3 mb-3 overflow-hidden p-0.5 border border-slate-200 dark:border-slate-700">
                <div
                  className="bg-gradient-to-r from-primary-500 to-emerald-500 h-full rounded-full transition-all duration-300 ease-out shadow-sm"
                  style={{ width: `${importProgressStats.percentage}%` }}
                />
              </div>

              {/* Stats Counters */}
              <div className="flex justify-between items-center text-xs font-semibold text-slate-600 dark:text-slate-400 mb-4 px-1">
                <span>Batch {importProgressStats.currentBatch} of {importProgressStats.totalBatches}</span>
                <span className="text-primary-600 dark:text-primary-400 font-bold">{importProgressStats.percentage}%</span>
              </div>

              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800/80 text-xs">
                <div>
                  <span className="text-slate-400 dark:text-slate-500 block text-[10px] uppercase font-bold tracking-wider">Processed</span>
                  <span className="font-extrabold text-slate-800 dark:text-slate-200 text-sm">
                    {importProgressStats.processed} / {importProgressStats.total}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 dark:text-slate-500 block text-[10px] uppercase font-bold tracking-wider">Success</span>
                  <span className="font-extrabold text-emerald-600 dark:text-emerald-400 text-sm">
                    {importProgressStats.successCount}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

