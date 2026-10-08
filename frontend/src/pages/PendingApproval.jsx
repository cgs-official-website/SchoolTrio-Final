import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { authApi } from '../api/auth';
import { getAccessToken, clearAccessToken } from '../services/tokenService';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { LuClock as Clock, LuRefreshCcw as RefreshCcw, LuLogOut as LogOut, LuLogIn as LogIn, LuBuilding2 as Building2, LuArrowLeft as ArrowLeft } from 'react-icons/lu';
import toast from 'react-hot-toast';

export default function PendingApproval() {
  const { userProfile, logoutUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [status, setStatus] = useState(location.state?.status || 'pending');
  const [checking, setChecking] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  const schoolName = location.state?.schoolName || userProfile?.schoolName || userProfile?.school?.name;
  const schoolCode = location.state?.schoolCode || userProfile?.schoolCode || userProfile?.school?.code;

  const checkStatus = async (interactive = false) => {
    if (redirecting) return;

    // 1. Immediate bypass if current user profile already indicates approved/active
    const profileSchoolStatus = String(userProfile?.schoolStatus || userProfile?.school?.status || '').toLowerCase();
    if (profileSchoolStatus === 'approved' || profileSchoolStatus === 'active') {
      setRedirecting(true);
      navigate('/admin');
      return;
    }

    const token = getAccessToken();

    // If not authenticated and user clicked "Check Status", guide them to log in
    if (!token) {
      if (interactive) {
        toast.info("Please log in to check your approval status. If approved, your dashboard will open.");
        navigate('/login');
      }
      return;
    }

    setChecking(true);
    try {
      const res = await authApi.getMe();
      const userData = res?.data?.user || res?.data;
      const school = userData?.school || res?.data?.school;
      const currentStatus = school?.status || userData?.schoolStatus || 'pending';
      setStatus(currentStatus);
      const normalized = String(currentStatus).toLowerCase();
      if (normalized === 'approved' || normalized === 'active') {
        setRedirecting(true);
        toast.success("School approved! Redirecting to dashboard...");
        navigate('/admin');
      } else if (interactive) {
        toast.info("Registration is still awaiting Super Admin approval.");
      }
    } catch (error) {
      console.error("[PendingApproval] Error checking status:", error);
      if (error?.status === 401) {
        clearAccessToken();
      }
      if (interactive) {
        toast.error("Unable to check status right now. Please try logging in.");
      }
    } finally {
      if (interactive) setChecking(false);
    }
  };

  useEffect(() => {
    // Only check if an active authenticated token is already present in storage
    const token = getAccessToken();
    if (token) {
      checkStatus(false);
    }
  }, [userProfile]);

  const handleLogout = async () => {
    if (logoutUser) {
      await logoutUser();
    }
    navigate('/');
  };

  const hasActiveSession = Boolean(getAccessToken() || userProfile);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-800 flex flex-col justify-center items-center p-4">
      <div className="glass max-w-lg w-full p-8 sm:p-10 rounded-3xl text-center shadow-xl border border-slate-200/60 dark:border-slate-700/60 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md">
        <div className="w-20 h-20 bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
          <Clock size={40} className="animate-pulse" />
        </div>

        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 mb-3">
          <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
          Registration Submitted
        </div>
        
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-3 tracking-tight">Pending Approval</h1>
        
        <p className="text-slate-600 dark:text-slate-300 mb-2 leading-relaxed">
          Your school registration is currently awaiting Super Admin approval.
        </p>

        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
          Login will be available after your registration is approved.
        </p>

        {schoolName && (
          <div className="bg-slate-100 dark:bg-slate-800/80 rounded-xl p-4 mb-4 text-left border border-slate-200/50 dark:border-slate-700/50">
            <div className="flex items-center gap-2 text-slate-800 dark:text-slate-200 font-semibold">
              <Building2 size={18} className="text-primary-600 dark:text-primary-400 shrink-0" />
              <span className="truncate">{schoolName}</span>
            </div>
            {schoolCode && (
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 pl-6.5">
                School Code: <span className="font-mono font-medium text-slate-700 dark:text-slate-300">{schoolCode}</span>
              </div>
            )}
          </div>
        )}

        <div className="bg-slate-100 dark:bg-slate-800/80 rounded-xl p-4 mb-8 flex items-center justify-between border border-slate-200/50 dark:border-slate-700/50">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Approval Status:</span>
          <span className="px-3 py-1 bg-amber-200/80 text-amber-900 dark:bg-amber-900/60 dark:text-amber-200 text-xs font-bold uppercase rounded-full tracking-wider">
            {status}
          </span>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button 
            onClick={() => checkStatus(true)}
            disabled={checking}
            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors font-medium text-sm disabled:opacity-50"
          >
            <RefreshCcw size={16} className={checking ? "animate-spin" : ""} />
            {checking ? 'Checking...' : 'Check Status'}
          </button>
          
          <Link
            to="/login"
            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-white transition-colors font-medium text-sm shadow-sm"
          >
            <LogIn size={16} />
            Go to Login
          </Link>

          {hasActiveSession ? (
            <button 
              onClick={handleLogout}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 transition-colors font-medium text-sm"
            >
              <LogOut size={16} />
              Log out
            </button>
          ) : (
            <Link
              to="/"
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors font-medium text-sm"
            >
              <ArrowLeft size={16} />
              Home
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
