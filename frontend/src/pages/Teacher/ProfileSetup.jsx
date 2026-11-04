import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { staffApi } from '../../api/staff';
import { authApi } from '../../api/auth';
import { setAccessToken } from '../../services/tokenService';
import toast from 'react-hot-toast';
import {
  LuUser,
  LuMapPin,
  LuBriefcase,
  LuCreditCard,
  LuSave,
  LuBookOpen,
  LuShieldCheck,
  LuKeyRound,
  LuEye,
  LuEyeOff,
  LuLock,
  LuCircleCheck
} from 'react-icons/lu';
import { normalizeGender } from '../../utils/genderUtils';
import {
  validateProfile,
  sanitizeField,
  normalizePhone,
  computeProfileCompletion,
  BLOOD_GROUPS,
  GOVT_ID_TYPES
} from '../../utils/profileValidation';

export default function ProfileSetup() {
  const { currentUser, updateProfileData } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [staffId, setStaffId] = useState(null);
  const [errors, setErrors] = useState({});
  const [serverDoc, setServerDoc] = useState(null);

  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [passwordStatus, setPasswordStatus] = useState(null);

  const [formData, setFormData] = useState({
    // Name
    firstName: '',
    lastName: '',
    // Personal Info
    dob: '',
    bloodGroup: '',
    gender: 'Male',
    nationality: '',
    maritalStatus: 'Single',
    fatherGuardianName: '',
    languagesKnown: '',
    mobileNumber: '',
    residentialAddress: '',
    emergencyContact: '',

    // Educational Information
    highestQualification: '',
    degreeSpecialization: '',
    universityName: '',
    yearOfPassing: '',

    // Professional Information
    previousExperience: '0',
    previousOrganization: '',
    subjectSpecialization: '',
    gradesClassesHandled: '',
    professionalCertifications: '',

    // Government & Identity
    govtIdType: 'Aadhaar',
    govtIdNumber: '',
    aadharNumber: '',
    panNumber: '',
    pfNumber: '',
    esicNumber: '',
    uanNumber: '',
    taxIdDetails: '',

    // Banking Information
    bankAccountNumber: '',
    bankName: '',
    branchName: '',
    ifscCode: ''
  });

  useEffect(() => {
    const fetchTeacherProfile = async () => {
      try {
        const res = await staffApi.getStaffMe();
        const data = res?.data || {};

        if (data.id) {
          setStaffId(data.id);
        }
        setServerDoc(data);

        const custom = (typeof data.customData === 'object' && data.customData !== null)
          ? data.customData
          : {};
        const quals = (typeof data.qualifications === 'object' && data.qualifications !== null)
          ? data.qualifications
          : ((typeof custom.qualifications === 'object' && custom.qualifications !== null) ? custom.qualifications : {});
        const exp = (typeof data.experience === 'object' && data.experience !== null)
          ? data.experience
          : ((typeof custom.experience === 'object' && custom.experience !== null) ? custom.experience : {});
        const docs = (typeof data.documents === 'object' && data.documents !== null)
          ? data.documents
          : ((typeof custom.documents === 'object' && custom.documents !== null) ? custom.documents : {});
        const fin = (typeof data.financial === 'object' && data.financial !== null)
          ? data.financial
          : ((typeof custom.financial === 'object' && custom.financial !== null) ? custom.financial : {});

        const fullName = String(data.name || '').trim();
        const [derivedFirst, ...derivedRest] = fullName.split(/\s+/);

        setFormData(prev => ({
          ...prev,
          firstName: custom.firstName || derivedFirst || '',
          lastName: custom.lastName !== undefined && custom.firstName ? custom.lastName : derivedRest.join(' '),
          dob: data.dob || custom.dob || '',
          bloodGroup: data.bloodGroup || custom.bloodGroup || '',
          gender: normalizeGender(data.gender || custom.gender, 'Male'),
          nationality: data.nationality || custom.nationality || '',
          maritalStatus: data.maritalStatus || custom.maritalStatus || 'Single',
          fatherGuardianName: data.fatherGuardianName || custom.fatherGuardianName || custom.fatherName || '',
          languagesKnown: data.languagesKnown || custom.languagesKnown || '',
          mobileNumber: normalizePhone(data.phone || data.mobileNumber || ''),
          residentialAddress: data.address || data.residentialAddress || custom.address || '',
          emergencyContact: normalizePhone(data.emergencyContact || custom.emergencyContact || ''),

          highestQualification: quals.highestQualification || (typeof data.qualifications === 'string' ? data.qualifications : '') || '',
          degreeSpecialization: quals.degreeSpecialization || '',
          universityName: quals.universityName || '',
          yearOfPassing: quals.yearOfPassing || '',

          previousExperience: exp.previousExperience || (typeof data.experience === 'string' ? data.experience : '') || '0',
          previousOrganization: exp.previousOrganization || '',
          subjectSpecialization: exp.subjectSpecialization || '',
          gradesClassesHandled: exp.gradesClassesHandled || '',
          professionalCertifications: exp.professionalCertifications || '',

          govtIdType: fin.govtIdType || docs.govtIdType || 'Aadhaar',
          govtIdNumber: fin.govtIdNumber || docs.govtIdNumber || '',
          aadharNumber: fin.aadharNumber || docs.aadharNumber || '',
          panNumber: fin.panNumber || docs.panNumber || '',
          pfNumber: fin.pfNumber || docs.pfNumber || '',
          esicNumber: fin.esicNumber || docs.esicNumber || '',
          uanNumber: fin.uanNumber || docs.uanNumber || '',
          taxIdDetails: fin.taxIdDetails || docs.taxIdDetails || '',

          bankAccountNumber: fin.bankAccountNumber || custom.bankAccountNumber || custom.financial?.bankAccountNumber || '',
          bankName: fin.bankName || custom.bankName || custom.financial?.bankName || '',
          branchName: fin.branchName || custom.branchName || custom.financial?.branchName || '',
          ifscCode: fin.ifscCode || custom.ifscCode || custom.financial?.ifscCode || ''
        }));
      } catch (error) {
        console.error("Error fetching teacher profile", error);
      } finally {
        setLoading(false);
      }
    };
    fetchTeacherProfile();
  }, [currentUser]);

  // Sanitise while typing (no letters in mobile number, max 10 digits, etc.) and clear that field's error
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => {
      const next = { ...prev, [name]: sanitizeField(name, value, prev) };
      // Changing the ID type invalidates a previously typed ID number
      if (name === 'govtIdType') next.govtIdNumber = '';
      return next;
    });
    setErrors((prev) => {
      if (!prev[name] && !(name === 'govtIdType' && prev.govtIdNumber) && !(name === 'mobileNumber' && prev.emergencyContact)) return prev;
      const rest = { ...prev };
      delete rest[name];
      if (name === 'govtIdType') delete rest.govtIdNumber;
      return rest;
    });
  };

  // Validate a single field when the user leaves it
  const handleBlur = (e) => {
    const { name } = e.target;
    const all = validateProfile(formData);
    setErrors((prev) => {
      const next = { ...prev };
      if (all[name]) next[name] = all[name];
      else delete next[name];
      return next;
    });
  };

  // Completion of what is actually saved on the server (updates right after a successful save)
  const liveCompletion = computeProfileCompletion(serverDoc);

  const handleSave = async (e) => {
    e.preventDefault();

    // Block the save when anything is wrong and show every problem next to its field
    const validationErrors = validateProfile(formData);
    setErrors(validationErrors);
    const errorKeys = Object.keys(validationErrors);
    if (errorKeys.length > 0) {
      toast.error(`Please fix ${errorKeys.length} highlighted field${errorKeys.length > 1 ? 's' : ''} before saving.`);
      const firstEl = document.querySelector(`[name="${errorKeys[0]}"]`);
      if (firstEl) {
        firstEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        firstEl.focus({ preventScroll: true });
      }
      return;
    }

    setSaving(true);
    try {
      const financialData = {
        bankAccountNumber: formData.bankAccountNumber || '',
        bankName: formData.bankName || '',
        branchName: formData.branchName || '',
        ifscCode: formData.ifscCode || '',
        panNumber: formData.panNumber || '',
        aadharNumber: formData.aadharNumber || '',
        pfNumber: formData.pfNumber || '',
        esicNumber: formData.esicNumber || '',
        uanNumber: formData.uanNumber || '',
        govtIdType: formData.govtIdType || 'Aadhaar',
        govtIdNumber: formData.govtIdNumber || '',
        taxIdDetails: formData.taxIdDetails || ''
      };

      const payload = {
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        phone: formData.mobileNumber || null,
        address: formData.residentialAddress || null,
        emergencyContact: formData.emergencyContact || null,
        dob: formData.dob || null,
        gender: formData.gender || 'Male',
        bloodGroup: formData.bloodGroup || null,
        maritalStatus: formData.maritalStatus || 'Single',
        nationality: formData.nationality || null,
        languagesKnown: formData.languagesKnown || null,
        financial: financialData,
        qualifications: {
          highestQualification: formData.highestQualification || '',
          degreeSpecialization: formData.degreeSpecialization || '',
          universityName: formData.universityName || '',
          yearOfPassing: formData.yearOfPassing || ''
        },
        experience: {
          previousExperience: formData.previousExperience || '0',
          previousOrganization: formData.previousOrganization || '',
          subjectSpecialization: formData.subjectSpecialization || '',
          gradesClassesHandled: formData.gradesClassesHandled || '',
          professionalCertifications: formData.professionalCertifications || ''
        },
        documents: {
          govtIdType: formData.govtIdType || 'Aadhaar',
          govtIdNumber: formData.govtIdNumber || '',
          aadharNumber: formData.aadharNumber || '',
          panNumber: formData.panNumber || '',
          pfNumber: formData.pfNumber || '',
          esicNumber: formData.esicNumber || '',
          uanNumber: formData.uanNumber || '',
          taxIdDetails: formData.taxIdDetails || ''
        },
        customData: {
          firstName: formData.firstName.trim(),
          lastName: formData.lastName.trim(),
          fatherGuardianName: formData.fatherGuardianName || '',
          fatherName: formData.fatherGuardianName || '',
          bankAccountNumber: formData.bankAccountNumber || '',
          bankName: formData.bankName || '',
          branchName: formData.branchName || '',
          ifscCode: formData.ifscCode || '',
          financial: financialData
        }
      };

<<<<<<< HEAD
      const res = await staffApi.updateStaffSelf(payload);
      if (res?.data) {
        const updated = res.data;
        const uFin = (typeof updated.financial === 'object' && updated.financial !== null)
          ? updated.financial
          : ((typeof updated.customData?.financial === 'object' && updated.customData?.financial !== null)
              ? updated.customData.financial
              : {});
        setFormData(prev => ({
          ...prev,
          bankAccountNumber: uFin.bankAccountNumber ?? prev.bankAccountNumber,
          bankName: uFin.bankName ?? prev.bankName,
          branchName: uFin.branchName ?? prev.branchName,
          ifscCode: uFin.ifscCode ?? prev.ifscCode
        }));
      }

=======
      await staffApi.updateStaffSelf(payload);

      // Reload what the server actually stored, then tell the dashboard banner to recalculate
      try {
        const fresh = await staffApi.getStaffMe();
        if (fresh?.data) setServerDoc(fresh.data);
      } catch { /* non-fatal */ }
>>>>>>> a5f2e33a4713df2b76973061fe68511fdd38acd3
      if (updateProfileData) {
        await updateProfileData();
      }
      window.dispatchEvent(new CustomEvent('staff-profile-updated'));
      toast.success("Profile saved successfully!");
    } catch (error) {
      console.error("Error updating profile", error);
      // Surface server-side field errors next to the fields when the API returns them
      const details = error?.details || error?.errors || error?.data?.errors;
      if (Array.isArray(details)) {
        const mapped = {};
        details.forEach((d) => {
          const key = String(d.path || d.field || '').split('.').pop();
          if (key) mapped[key] = d.message;
        });
        if (Object.keys(mapped).length) setErrors((prev) => ({ ...prev, ...mapped }));
      }
      toast.error("Failed to update profile: " + (error.message || error));
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = (e) => {
    const { name, value } = e.target;
    setPasswordData(prev => ({ ...prev, [name]: value }));
  };

  const handleResetPassword = async (e) => {
    if (e) e.preventDefault();
    if (!passwordData.newPassword) {
      toast.error('Please enter a new password');
      return;
    }
    if (passwordData.newPassword.length < 8) {
      toast.error('Password must be at least 8 characters long');
      return;
    }
    if (!/[A-Z]/.test(passwordData.newPassword) || !/[a-z]/.test(passwordData.newPassword) || !/[0-9]/.test(passwordData.newPassword)) {
      toast.error('Password must contain uppercase, lowercase letters and numbers');
      return;
    }
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error('New password and confirm password do not match');
      return;
    }

    setResettingPassword(true);
    try {
      const res = await authApi.changePassword({
        currentPassword: passwordData.currentPassword.trim() || undefined,
        newPassword: passwordData.newPassword
      });

      if (res?.data?.accessToken) {
        setAccessToken(res.data.accessToken);
      }

      toast.success(res?.message || 'Password reset successfully! You can now log in with your new password.');
      setPasswordData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      });
      setPasswordStatus({
        type: 'success',
        message: 'Password successfully updated in database. You can now use this new password to log in.'
      });
      setTimeout(() => setPasswordStatus(null), 6000);
    } catch (err) {
      const msg = err?.message || 'Failed to reset password. Please check your current password and try again.';
      toast.error(msg);
      setPasswordStatus({
        type: 'error',
        message: msg
      });
    } finally {
      setResettingPassword(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto animate-fade-in-up">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Profile Setup</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">Complete your profile to update all professional, banking, and personal details.</p>
        <div className="mt-4 flex items-center gap-3">
          <div className="flex-1 h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
            <div className="h-full bg-primary-600 transition-all duration-500" style={{ width: `${liveCompletion}%` }} />
          </div>
          <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{liveCompletion}% complete</span>
        </div>
        <p className="text-xs text-slate-400 mt-2"><span className="text-red-500">*</span> Required. Details are checked before saving.</p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Personal Details */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 transition-all hover:shadow-md">
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 mb-4">
            <LuUser className="text-primary-500" /> Personal Details
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">First Name <span className="text-red-500">*</span></label>
              <input type="text" name="firstName" value={formData.firstName} onChange={handleChange} onBlur={handleBlur} aria-invalid={errors.firstName ? "true" : "false"} placeholder="First name" className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 outline-none transition-all text-sm" />
              {errors.firstName && <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-medium">{errors.firstName}</p>}
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Last Name</label>
              <input type="text" name="lastName" value={formData.lastName} onChange={handleChange} onBlur={handleBlur} aria-invalid={errors.lastName ? "true" : "false"} placeholder="Last name" className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 outline-none transition-all text-sm" />
              {errors.lastName && <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-medium">{errors.lastName}</p>}
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Date of Birth <span className="text-red-500">*</span></label>
              <input type="date" name="dob" max={new Date().toISOString().split("T")[0]} value={formData.dob} onChange={handleChange} onBlur={handleBlur} aria-invalid={errors.dob ? "true" : "false"} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 outline-none transition-all text-sm" />
              {errors.dob && <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-medium">{errors.dob}</p>}
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Gender</label>
              <select name="gender" value={normalizeGender(formData.gender, 'Male')} onChange={handleChange} onBlur={handleBlur} aria-invalid={errors.gender ? "true" : "false"} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 outline-none transition-all text-sm bg-white dark:bg-slate-900">
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
              {errors.gender && <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-medium">{errors.gender}</p>}
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Blood Group</label>
              <select name="bloodGroup" value={formData.bloodGroup} onChange={handleChange} onBlur={handleBlur} aria-invalid={errors.bloodGroup ? "true" : "false"} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 outline-none transition-all text-sm bg-white dark:bg-slate-900">
                <option value="">Select</option>
                {BLOOD_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
              {errors.bloodGroup && <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-medium">{errors.bloodGroup}</p>}
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Nationality</label>
              <input type="text" name="nationality" value={formData.nationality} onChange={handleChange} onBlur={handleBlur} aria-invalid={errors.nationality ? "true" : "false"} placeholder="e.g. Indian" className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 outline-none transition-all text-sm" />
              {errors.nationality && <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-medium">{errors.nationality}</p>}
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Marital Status</label>
              <select name="maritalStatus" value={formData.maritalStatus} onChange={handleChange} onBlur={handleBlur} aria-invalid={errors.maritalStatus ? "true" : "false"} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 outline-none transition-all text-sm bg-white dark:bg-slate-900">
                <option value="Single">Single</option>
                <option value="Married">Married</option>
                <option value="Divorced">Divorced</option>
                <option value="Widowed">Widowed</option>
              </select>
              {errors.maritalStatus && <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-medium">{errors.maritalStatus}</p>}
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Languages Known</label>
              <input type="text" name="languagesKnown" value={formData.languagesKnown} onChange={handleChange} onBlur={handleBlur} aria-invalid={errors.languagesKnown ? "true" : "false"} placeholder="e.g. English, Hindi" className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 outline-none transition-all text-sm" />
              {errors.languagesKnown && <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-medium">{errors.languagesKnown}</p>}
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Mobile Number <span className="text-red-500">*</span></label>
              <input type="tel" name="mobileNumber" inputMode="numeric" autoComplete="off" value={formData.mobileNumber} onChange={handleChange} onBlur={handleBlur} aria-invalid={errors.mobileNumber ? "true" : "false"} placeholder="9876543210" className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 outline-none transition-all text-sm" />
              {errors.mobileNumber && <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-medium">{errors.mobileNumber}</p>}
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Emergency Contact <span className="text-red-500">*</span></label>
              <input type="tel" name="emergencyContact" inputMode="numeric" autoComplete="off" value={formData.emergencyContact} onChange={handleChange} onBlur={handleBlur} aria-invalid={errors.emergencyContact ? "true" : "false"} placeholder="Emergency contact no." className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 outline-none transition-all text-sm" />
              {errors.emergencyContact && <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-medium">{errors.emergencyContact}</p>}
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Father / Guardian Name</label>
              <input type="text" name="fatherGuardianName" value={formData.fatherGuardianName} onChange={handleChange} onBlur={handleBlur} aria-invalid={errors.fatherGuardianName ? "true" : "false"} placeholder="Father or Guardian Name" className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 outline-none transition-all text-sm" />
              {errors.fatherGuardianName && <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-medium">{errors.fatherGuardianName}</p>}
            </div>
          </div>
        </div>

        {/* Address */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 transition-all hover:shadow-md">
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 mb-4">
            <LuMapPin className="text-indigo-500" /> Address Details
          </h2>
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Residential Address <span className="text-red-500">*</span></label>
            <textarea name="residentialAddress" value={formData.residentialAddress} onChange={handleChange} onBlur={handleBlur} aria-invalid={errors.residentialAddress ? "true" : "false"} rows="3" placeholder="Enter your full residential address" className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none resize-none transition-all text-sm"></textarea>
          </div>
        </div>

        {/* Educational details */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 transition-all hover:shadow-md">
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 mb-4">
            <LuBookOpen className="text-emerald-500" /> Educational Details
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Highest Qualification <span className="text-red-500">*</span></label>
              <input type="text" name="highestQualification" value={formData.highestQualification} onChange={handleChange} onBlur={handleBlur} aria-invalid={errors.highestQualification ? "true" : "false"} placeholder="e.g. M.Sc, B.Ed" className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-emerald-500 outline-none transition-all text-sm" />
              {errors.highestQualification && <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-medium">{errors.highestQualification}</p>}
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Degree & Specialization</label>
              <input type="text" name="degreeSpecialization" value={formData.degreeSpecialization} onChange={handleChange} onBlur={handleBlur} aria-invalid={errors.degreeSpecialization ? "true" : "false"} placeholder="e.g. Physics" className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-emerald-500 outline-none transition-all text-sm" />
              {errors.degreeSpecialization && <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-medium">{errors.degreeSpecialization}</p>}
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">University / College Name</label>
              <input type="text" name="universityName" value={formData.universityName} onChange={handleChange} onBlur={handleBlur} aria-invalid={errors.universityName ? "true" : "false"} placeholder="University / College Name" className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-emerald-500 outline-none transition-all text-sm" />
              {errors.universityName && <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-medium">{errors.universityName}</p>}
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Year of Passing</label>
              <input type="text" name="yearOfPassing" inputMode="numeric" autoComplete="off" value={formData.yearOfPassing} onChange={handleChange} onBlur={handleBlur} aria-invalid={errors.yearOfPassing ? "true" : "false"} placeholder="e.g. 2018" className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-emerald-500 outline-none transition-all text-sm" />
              {errors.yearOfPassing && <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-medium">{errors.yearOfPassing}</p>}
            </div>
          </div>
        </div>

        {/* Professional Details */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 transition-all hover:shadow-md">
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 mb-4">
            <LuBriefcase className="text-amber-500" /> Professional Details
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Years of Previous Experience</label>
              <input type="text" inputMode="decimal" name="previousExperience" value={formData.previousExperience} onChange={handleChange} onBlur={handleBlur} aria-invalid={errors.previousExperience ? "true" : "false"} placeholder="e.g. 5" className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-amber-500 outline-none transition-all text-sm" />
              {errors.previousExperience && <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-medium">{errors.previousExperience}</p>}
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Previous School / Organization</label>
              <input type="text" name="previousOrganization" value={formData.previousOrganization} onChange={handleChange} onBlur={handleBlur} aria-invalid={errors.previousOrganization ? "true" : "false"} placeholder="Previous school name" className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-amber-500 outline-none transition-all text-sm" />
              {errors.previousOrganization && <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-medium">{errors.previousOrganization}</p>}
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Subject Specialization</label>
              <input type="text" name="subjectSpecialization" value={formData.subjectSpecialization} onChange={handleChange} onBlur={handleBlur} aria-invalid={errors.subjectSpecialization ? "true" : "false"} placeholder="e.g. Mathematics" className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-amber-500 outline-none transition-all text-sm" />
              {errors.subjectSpecialization && <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-medium">{errors.subjectSpecialization}</p>}
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Grades/Classes Handled</label>
              <input type="text" name="gradesClassesHandled" value={formData.gradesClassesHandled} onChange={handleChange} onBlur={handleBlur} aria-invalid={errors.gradesClassesHandled ? "true" : "false"} placeholder="e.g. Class 8 - 10" className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-amber-500 outline-none transition-all text-sm" />
              {errors.gradesClassesHandled && <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-medium">{errors.gradesClassesHandled}</p>}
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Professional Certifications</label>
              <input type="text" name="professionalCertifications" value={formData.professionalCertifications} onChange={handleChange} onBlur={handleBlur} aria-invalid={errors.professionalCertifications ? "true" : "false"} placeholder="e.g. TEFL, Microsoft Certified Educator" className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-amber-500 outline-none transition-all text-sm" />
              {errors.professionalCertifications && <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-medium">{errors.professionalCertifications}</p>}
            </div>
          </div>
        </div>

        {/* Identity & Government IDs */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 transition-all hover:shadow-md">
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 mb-4">
            <LuShieldCheck className="text-rose-500" /> Government & Identity Details
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Government ID Type</label>
              <select name="govtIdType" value={formData.govtIdType} onChange={handleChange} onBlur={handleBlur} aria-invalid={errors.govtIdType ? "true" : "false"} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-rose-500 outline-none transition-all text-sm bg-white dark:bg-slate-900">
                {GOVT_ID_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              {errors.govtIdType && <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-medium">{errors.govtIdType}</p>}
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Government ID Number</label>
              <input type="text" name="govtIdNumber" value={formData.govtIdNumber} onChange={handleChange} onBlur={handleBlur} aria-invalid={errors.govtIdNumber ? "true" : "false"} placeholder="ID number" className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-rose-500 outline-none transition-all text-sm" />
              {errors.govtIdNumber && <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-medium">{errors.govtIdNumber}</p>}
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Aadhaar Number</label>
              <input type="text" name="aadharNumber" inputMode="numeric" autoComplete="off" value={formData.aadharNumber} onChange={handleChange} onBlur={handleBlur} aria-invalid={errors.aadharNumber ? "true" : "false"} placeholder="12-digit Aadhaar" className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-rose-500 outline-none transition-all text-sm" />
              {errors.aadharNumber && <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-medium">{errors.aadharNumber}</p>}
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">PAN Number</label>
              <input type="text" name="panNumber" value={formData.panNumber} onChange={handleChange} onBlur={handleBlur} aria-invalid={errors.panNumber ? "true" : "false"} placeholder="PAN number" className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-rose-500 outline-none uppercase transition-all text-sm" />
              {errors.panNumber && <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-medium">{errors.panNumber}</p>}
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">PF Number</label>
              <input type="text" name="pfNumber" value={formData.pfNumber} onChange={handleChange} onBlur={handleBlur} aria-invalid={errors.pfNumber ? "true" : "false"} placeholder="PF number" className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-rose-500 outline-none transition-all text-sm" />
              {errors.pfNumber && <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-medium">{errors.pfNumber}</p>}
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">ESIC Number</label>
              <input type="text" name="esicNumber" inputMode="numeric" autoComplete="off" value={formData.esicNumber} onChange={handleChange} onBlur={handleBlur} aria-invalid={errors.esicNumber ? "true" : "false"} placeholder="ESIC number" className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-rose-500 outline-none transition-all text-sm" />
              {errors.esicNumber && <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-medium">{errors.esicNumber}</p>}
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">UAN Number</label>
              <input type="text" name="uanNumber" inputMode="numeric" autoComplete="off" value={formData.uanNumber} onChange={handleChange} onBlur={handleBlur} aria-invalid={errors.uanNumber ? "true" : "false"} placeholder="UAN number" className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-rose-500 outline-none transition-all text-sm" />
              {errors.uanNumber && <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-medium">{errors.uanNumber}</p>}
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Tax Identification / PAN Details</label>
              <input type="text" name="taxIdDetails" value={formData.taxIdDetails} onChange={handleChange} onBlur={handleBlur} aria-invalid={errors.taxIdDetails ? "true" : "false"} placeholder="Tax Details" className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-rose-500 outline-none transition-all text-sm" />
              {errors.taxIdDetails && <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-medium">{errors.taxIdDetails}</p>}
            </div>
          </div>
        </div>

        {/* Bank Details */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 transition-all hover:shadow-md">
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 mb-4">
            <LuCreditCard className="text-blue-500" /> Bank Details
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Bank Name</label>
              <input type="text" name="bankName" value={formData.bankName} onChange={handleChange} onBlur={handleBlur} aria-invalid={errors.bankName ? "true" : "false"} placeholder="e.g. HDFC Bank" className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm" />
              {errors.bankName && <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-medium">{errors.bankName}</p>}
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Account Number</label>
              <input type="text" name="bankAccountNumber" inputMode="numeric" autoComplete="off" value={formData.bankAccountNumber} onChange={handleChange} onBlur={handleBlur} aria-invalid={errors.bankAccountNumber ? "true" : "false"} placeholder="Account number" className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm" />
              {errors.bankAccountNumber && <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-medium">{errors.bankAccountNumber}</p>}
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Branch Name</label>
              <input type="text" name="branchName" value={formData.branchName} onChange={handleChange} onBlur={handleBlur} aria-invalid={errors.branchName ? "true" : "false"} placeholder="Branch name" className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm" />
              {errors.branchName && <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-medium">{errors.branchName}</p>}
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">IFSC Code</label>
              <input type="text" name="ifscCode" value={formData.ifscCode} onChange={handleChange} onBlur={handleBlur} aria-invalid={errors.ifscCode ? "true" : "false"} placeholder="IFSC code" className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-blue-500 outline-none uppercase transition-all text-sm" />
              {errors.ifscCode && <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-medium">{errors.ifscCode}</p>}
            </div>
          </div>
        </div>

        {/* Reset Password Section */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 transition-all hover:shadow-md">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <LuKeyRound className="text-amber-500" /> Reset Password
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Update your account password. This will update your login credentials in the database immediately.
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200/50 dark:border-amber-800/40 w-fit">
              <LuLock size={13} /> Security Section
            </span>
          </div>

          {passwordStatus && (
            <div
              className={`mb-4 p-3.5 rounded-xl text-sm flex items-start gap-2.5 ${passwordStatus.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40'
                : 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/40'
                }`}
            >
              {passwordStatus.type === 'success' && <LuCircleCheck className="shrink-0 mt-0.5 text-emerald-600" size={17} />}
              <span>{passwordStatus.message}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">
                Current Password
                <span className="text-xs font-normal text-slate-400 ml-1.5">(leave blank if first setup)</span>
              </label>
              <div className="relative">
                <input
                  type={showCurrentPassword ? 'text' : 'password'}
                  name="currentPassword"
                  value={passwordData.currentPassword}
                  onChange={handlePasswordChange}
                  placeholder="Current password"
                  autoComplete="current-password"
                  className="w-full pl-4 pr-11 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-amber-500 outline-none transition-all text-sm bg-white dark:bg-slate-800"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
                  aria-label={showCurrentPassword ? 'Hide current password' : 'Show current password'}
                >
                  {showCurrentPassword ? <LuEyeOff size={16} /> : <LuEye size={16} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">
                New Password <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  name="newPassword"
                  value={passwordData.newPassword}
                  onChange={handlePasswordChange}
                  placeholder="Min. 8 characters"
                  autoComplete="new-password"
                  className="w-full pl-4 pr-11 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-amber-500 outline-none transition-all text-sm bg-white dark:bg-slate-800"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
                  aria-label={showNewPassword ? 'Hide new password' : 'Show new password'}
                >
                  {showNewPassword ? <LuEyeOff size={16} /> : <LuEye size={16} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">
                Confirm New Password <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  name="confirmPassword"
                  value={passwordData.confirmPassword}
                  onChange={handlePasswordChange}
                  placeholder="Repeat new password"
                  autoComplete="new-password"
                  className="w-full pl-4 pr-11 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-amber-500 outline-none transition-all text-sm bg-white dark:bg-slate-800"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
                  aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                >
                  {showConfirmPassword ? <LuEyeOff size={16} /> : <LuEye size={16} />}
                </button>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Must be at least 8 characters with at least one uppercase letter, one lowercase letter, and one number.
            </p>
            <button
              type="button"
              onClick={handleResetPassword}
              disabled={resettingPassword}
              className="flex items-center justify-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-xl shadow-sm hover:shadow transition-all disabled:opacity-50 text-sm shrink-0"
            >
              {resettingPassword ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <LuKeyRound size={16} />
              )}
              {resettingPassword ? 'Updating Database...' : 'Reset Password'}
            </button>
          </div>
        </div>

        <div className="flex justify-end pt-4">
          <button type="submit" disabled={saving} className="flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white font-bold rounded-xl shadow-[0_4px_14px_0_rgb(79,70,229,0.39)] hover:shadow-[0_6px_20px_rgba(79,70,229,0.23)] hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:hover:translate-y-0">
            {saving ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div> : <LuSave size={18} />}
            {saving ? 'Saving...' : 'Save Profile Details'}
          </button>
        </div>
      </form>
    </div>
  );
}