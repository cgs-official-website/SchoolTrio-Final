import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getTenantById, updateTenantStatus } from '../../api/superadmin';
import { LuArrowLeft as ArrowLeft, LuBuilding2 as _Building2, LuMapPin as MapPin, LuMail as Mail, LuPhone as Phone, LuCalendar as Calendar, LuCircleUser as UserCircle, LuCircleCheck as CheckCircle2, LuCircleAlert as _AlertCircle, LuBan as Ban, LuUsers as _Users, LuActivity as Activity, LuHardDrive as _HardDrive } from 'react-icons/lu';
import toast from 'react-hot-toast';
import ConfirmModal from '../../components/ConfirmModal';

export default function TenantDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [school, setSchool] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [confirmModalState, setConfirmModalState] = useState({ isOpen: false, newStatus: null });

  const fetchTenant = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await getTenantById(id);
      const data = res?.data || res;
      setSchool(data);
    } catch (err) {
      console.error('Error loading tenant via REST:', err);
      setSchool(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchTenant();
  }, [fetchTenant]);

  const handleStatusChangeClick = (newStatus) => {
    setConfirmModalState({ isOpen: true, newStatus });
  };

  const executeStatusChange = async () => {
    const newStatus = confirmModalState.newStatus;
    if (!newStatus) return;
    
    setUpdating(true);
    try {
      await updateTenantStatus(id, { status: newStatus });
      toast.success(`Tenant status changed to ${newStatus.toUpperCase()}`);
      await fetchTenant();
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Failed to update status.');
    } finally {
      setUpdating(false);
      setConfirmModalState({ isOpen: false, newStatus: null });
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex justify-center items-center h-full">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent"></div>
      </div>
    );
  }

  if (!school) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Tenant not found</h2>
        <button onClick={() => navigate('/superadmin')} className="mt-4 text-primary-600 hover:underline">
          Return to Tenants List
        </button>
      </div>
    );
  }

  const getStatusColor = (status) => {
    const s = (status || '').toLowerCase();
    switch(s) {
      case 'approved': return 'bg-green-100 text-green-800 border-green-200';
      case 'pending': return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'suspended': return 'bg-red-100 text-red-800 border-red-200';
      case 'rejected': return 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-100 border-slate-300 dark:border-slate-600';
      default: return 'bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-100 border-slate-200 dark:border-slate-700';
    }
  };

  const displayName = school.name || school.schoolName || 'Unnamed School';
  const email = school.email || school.contactEmail || 'Not provided';
  const phone = school.phone || school.contactPhone || 'Not provided';
  const address = school.address || school.location || 'Not provided';
  const planName = school.plan?.name || school.plan || 'Standard';
  const currentUsers = school.counts?.users || school.userCount || 0;
  const seatLimit = school.seatLimit || 500;
  const usagePercent = Math.min(100, Math.round((currentUsers / seatLimit) * 100));

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/superadmin')}
            className="p-2 -ml-2 text-slate-400 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors"
          >
            <ArrowLeft size={24} />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-slate-900 dark:text-white">{displayName}</h1>
              <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${getStatusColor(school.status)}`}>
                {school.status}
              </span>
            </div>
            <p className="text-slate-500 dark:text-slate-400 mt-1 font-mono text-sm">Tenant ID: {school.id}</p>
          </div>
        </div>

        <div className="flex gap-3">
          {(school.status?.toLowerCase() === 'pending') && (
            <>
              <button 
                onClick={() => handleStatusChangeClick('approved')}
                disabled={updating}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium flex items-center gap-2 shadow-sm disabled:opacity-50"
              >
                <CheckCircle2 size={18} /> Approve
              </button>
              <button 
                onClick={() => handleStatusChangeClick('rejected')}
                disabled={updating}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 font-medium border border-slate-300 dark:border-slate-600 disabled:opacity-50"
              >
                Reject
              </button>
            </>
          )}
          
          {(school.status?.toLowerCase() === 'approved') && (
            <button 
              onClick={() => handleStatusChangeClick('suspended')}
              disabled={updating}
              className="px-4 py-2 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 font-medium border border-red-200 flex items-center gap-2 disabled:opacity-50"
            >
              <Ban size={18} /> Suspend Tenant
            </button>
          )}

          {(school.status?.toLowerCase() === 'suspended') && (
            <button 
              onClick={() => handleStatusChangeClick('approved')}
              disabled={updating}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium flex items-center gap-2 shadow-sm disabled:opacity-50"
            >
              <CheckCircle2 size={18} /> Reactivate
            </button>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left Column: Details */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4 border-b border-slate-100 dark:border-slate-800 pb-3">Contact & Location</h2>
            <div className="grid sm:grid-cols-2 gap-6">
              <div className="flex items-start gap-3">
                <Mail className="text-slate-400 dark:text-slate-300 mt-0.5" size={20} />
                <div>
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Contact Email</p>
                  <p className="text-slate-900 dark:text-white mt-1">{email}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Phone className="text-slate-400 dark:text-slate-300 mt-0.5" size={20} />
                <div>
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Phone Number</p>
                  <p className="text-slate-900 dark:text-white mt-1">{phone}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <MapPin className="text-slate-400 dark:text-slate-300 mt-0.5" size={20} />
                <div>
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Location</p>
                  <p className="text-slate-900 dark:text-white mt-1">{address}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Calendar className="text-slate-400 dark:text-slate-300 mt-0.5" size={20} />
                <div>
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Registered On</p>
                  <p className="text-slate-900 dark:text-white mt-1">{school.createdAt ? new Date(school.createdAt).toLocaleDateString('en-GB') : 'N/A'}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4 border-b border-slate-100 dark:border-slate-800 pb-3">Administrator Details</h2>
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center">
                <UserCircle size={32} />
              </div>
              <div>
                <p className="text-lg font-bold text-slate-900 dark:text-white">Admin Account</p>
                <p className="text-slate-500 dark:text-slate-400 font-mono text-sm mt-0.5">
                  {school.admins?.[0]?.email || school.email || `ID: ${school.id}`}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Metrics */}
        <div className="space-y-6">
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl shadow-lg p-6 text-white">
            <h2 className="text-lg font-bold mb-6 flex items-center gap-2">
              <Activity size={20} className="text-amber-400" /> Current Usage
            </h2>
            
            <div className="space-y-6">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-slate-300">Total Users</span>
                  <span className="font-bold">{currentUsers} / {seatLimit}</span>
                </div>
                <div className="h-2 w-full bg-slate-700 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-400 rounded-full" style={{ width: `${usagePercent}%` }}></div>
                </div>
              </div>
              
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-slate-300">License Ratio</span>
                  <span className="font-bold">{usagePercent}% Allocated</span>
                </div>
                <div className="h-2 w-full bg-slate-700 rounded-full overflow-hidden">
                  <div className="h-full bg-primary-500 rounded-full" style={{ width: `${usagePercent}%` }}></div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-amber-50 dark:bg-slate-800 rounded-2xl border border-amber-200 dark:border-slate-700 p-6">
            <h3 className="font-bold text-amber-900 dark:text-amber-300 mb-2">Subscription</h3>
            <p className="text-amber-700 dark:text-slate-300 text-sm mb-4">Currently on the <strong>{planName} Plan</strong>.</p>
          </div>
        </div>
      </div>
      <ConfirmModal 
        isOpen={confirmModalState.isOpen}
        onClose={() => setConfirmModalState({ isOpen: false, newStatus: null })}
        onConfirm={executeStatusChange}
        title="Confirm Status Change"
        message={`Are you sure you want to change this tenant's status to ${confirmModalState.newStatus?.toUpperCase()}?`}
        confirmText="Confirm"
        type="warning"
      />
    </div>
  );
}
