import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { authApi } from '../api/auth';
import { useNavigate } from 'react-router-dom';
import { LuClock as Clock, LuRefreshCcw as RefreshCcw, LuLogOut as LogOut } from 'react-icons/lu';
import toast from 'react-hot-toast';

export default function PendingApproval() {
  const { logoutUser } = useAuth();
  const [status, setStatus] = useState('pending');
  const navigate = useNavigate();

  const [checking, setChecking] = useState(false);

  const checkStatus = async () => {
    setChecking(true);
    try {
      const res = await authApi.getMe();
      const school = res?.data?.user?.school || res?.data?.school;
      const currentStatus = school?.status || 'pending';
      setStatus(currentStatus);
      const normalized = String(currentStatus).toLowerCase();
      if (normalized === 'approved' || normalized === 'active') {
        navigate('/admin');
      } else {
        toast.success("Status checked dynamically!");
      }
    } catch (error) {
      console.error("Error checking status:", error);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    checkStatus();
  }, []);

  const handleLogout = async () => {
    await logoutUser();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-800 flex flex-col justify-center items-center p-4">
      <div className="glass max-w-md w-full p-8 rounded-3xl text-center shadow-xl">
        <div className="w-20 h-20 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-6">
          <Clock size={40} className="animate-pulse" />
        </div>
        
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">Pending Approval</h1>
        <p className="text-slate-600 dark:text-slate-300 mb-8 leading-relaxed">
          Your school registration is currently under review by our team. 
          You will gain access to your dashboard once approved.
        </p>

        <div className="bg-slate-100 dark:bg-slate-700 rounded-xl p-4 mb-8 flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Current Status:</span>
          <span className="px-3 py-1 bg-amber-200 text-amber-800 text-xs font-bold uppercase rounded-full tracking-wider">
            {status}
          </span>
        </div>

        <div className="flex gap-4 justify-center">
          <button 
            onClick={checkStatus}
            disabled={checking}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors font-medium disabled:opacity-50"
          >
            <RefreshCcw size={18} className={checking ? "animate-spin" : ""} />
            {checking ? 'Checking...' : 'Check Status'}
          </button>
          <button 
            onClick={handleLogout}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition-colors font-medium"
          >
            <LogOut size={18} />
            Log out
          </button>
        </div>
      </div>
    </div>
  );
}
