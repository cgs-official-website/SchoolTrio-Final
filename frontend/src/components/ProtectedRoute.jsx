import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import usePermissions from '../hooks/usePermissions';

const ProtectedRoute = ({ children, allowedRoles, moduleKey }) => {
  const { currentUser, userProfile, loading: authLoading, authError, retrySession, logoutUser } = useAuth();
  const { canRead, loading: permissionsLoading, error: permissionsError, refreshPermissions } = usePermissions();

  // 1. Authentication Loading
  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 dark:bg-slate-800">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent"></div>
      </div>
    );
  }

  // 2. Unauthenticated check (Definitive rejection vs transient connection error)
  if (!currentUser) {
    if (authError) {
      return (
        <div className="flex h-screen flex-col items-center justify-center gap-4 bg-slate-50 p-6 text-center dark:bg-slate-900">
          <div className="rounded-full bg-amber-100 p-3 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            Unable to Connect to Server
          </h2>
          <p className="max-w-md text-sm text-slate-600 dark:text-slate-400">
            Could not verify your session due to a network connection issue. Your session is preserved.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => retrySession?.()}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              Retry Connection
            </button>
            <button
              onClick={() => logoutUser?.()}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              Sign In Again
            </button>
          </div>
        </div>
      );
    }

    return <Navigate to="/login" replace />;
  }

  // 3. User profile pending hydration
  if (!userProfile) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 dark:bg-slate-800">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent"></div>
      </div>
    );
  }

  // 4. Role Authorization Check
  if (allowedRoles && allowedRoles.length > 0) {
    const userRole = userProfile.role?.toLowerCase();
    const isCustomStaff = userRole !== 'teacher' && userRole !== 'parent' && userRole !== 'student' && userRole !== 'superadmin' && userRole !== 'admin';
    const effectiveRole = isCustomStaff ? 'staff' : userRole;
    
    const isAuthorized = allowedRoles.includes(effectiveRole) || (allowedRoles.includes('teacher') && effectiveRole === 'staff');
    
    if (!isAuthorized) {
      return <Navigate to="/unauthorized" replace />;
    }
  }

  // 5. If moduleKey is specified, check RBAC permission
  if (moduleKey) {
    const isSchoolAdmin = userProfile.role === 'admin';

    // School admin within own school has universal bypass for approved school modules
    if (!isSchoolAdmin) {
      // If permissions are still loading, show spinner
      if (permissionsLoading) {
        return (
          <div className="flex h-screen items-center justify-center bg-slate-50 dark:bg-slate-800">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent"></div>
          </div>
        );
      }

      // If permission loading failed transiently (network error, 429, 502, 503)
      if (permissionsError) {
        return (
          <div className="flex h-screen flex-col items-center justify-center gap-4 bg-slate-50 p-6 text-center dark:bg-slate-900">
            <div className="rounded-full bg-amber-100 p-3 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
              <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
              Unable to Verify Permissions
            </h2>
            <p className="max-w-md text-sm text-slate-600 dark:text-slate-400">
              A temporary network or server error occurred while verifying access permissions. Your session is active.
            </p>
            <button
              onClick={() => refreshPermissions?.()}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              Retry Connection
            </button>
          </div>
        );
      }

      // Permissions verified successfully: check read access
      if (!canRead(moduleKey)) {
        return <Navigate to="/unauthorized" replace />;
      }
    }
  }

  return children;
};

export default ProtectedRoute;
