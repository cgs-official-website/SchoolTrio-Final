import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { getMyPermissions } from '../api/rbac.js';
import { useLiveDataRefresh } from './useLiveDataRefresh';

// Module-scoped cache and in-flight request deduplication map
let permissionsCache = {
  key: null, // `${userId}:${schoolId}`
  data: null,
  timestamp: 0
};
let inFlightPermissionsPromise = null;

// Cached permissions are re-checked with the server at least this often, so a role change
// made by the admin (possibly from another browser) shows up without logging in again.
const PERMISSIONS_TTL_MS = 30 * 1000;
const PERMISSIONS_POLL_MS = 60 * 1000;

export const clearPermissionsCache = () => {
  permissionsCache = { key: null, data: null, timestamp: 0 };
  inFlightPermissionsPromise = null;
};

/**
 * Hook to retrieve and evaluate active user RBAC permissions for the active tenant.
 *
 * Replaces legacy Firestore listeners with the PostgreSQL RBAC REST API (GET /api/v1/rbac/my-permissions).
 * Preserves backwards compatibility for all existing permission helpers and consumers.
 */
export default function usePermissions() {
  const { userProfile, currentUser } = useAuth();
  const [permissions, setPermissions] = useState(null);
  const [roles, setRoles] = useState([]);
  const [systemRole, setSystemRole] = useState(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isSchoolAdmin, setIsSchoolAdmin] = useState(false);
  const [isUnrestricted, setIsUnrestricted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchIdRef = useRef(0);

  const applyPermissionData = useCallback((data) => {
    const rawPerms = data.permissions || {};

    // Normalize permission dictionary to support both canRead/canCreate and read/create
    const normalized = {};
    for (const [key, perm] of Object.entries(rawPerms)) {
      if (!perm || typeof perm !== 'object') continue;
      const canReadVal = Boolean(perm.canRead ?? perm.read);
      const canCreateVal = Boolean(perm.canCreate ?? perm.create);
      const canEditVal = Boolean(perm.canEdit ?? perm.edit);
      const canDeleteVal = Boolean(perm.canDelete ?? perm.delete);

      normalized[key] = {
        canRead: canReadVal,
        canCreate: canCreateVal,
        canEdit: canEditVal,
        canDelete: canDeleteVal,
        read: canReadVal,
        create: canCreateVal,
        edit: canEditVal,
        delete: canDeleteVal
      };
    }

    const isUnres = Boolean(data.isUnrestricted || data.isSuperAdmin || data.isSchoolAdmin);
    setPermissions(isUnres ? 'ALL' : normalized);
    setRoles(data.roles || []);
    setSystemRole(data.systemRole || userProfile?.role || null);
    setIsSuperAdmin(Boolean(data.isSuperAdmin));
    setIsSchoolAdmin(Boolean(data.isSchoolAdmin));
    setIsUnrestricted(isUnres);
  }, [userProfile]);

  // silent = background refresh: no loading spinner, and a failed refresh keeps the current permissions
  const fetchPermissions = useCallback(async (forceRefresh = false, silent = false) => {
    const currentFetchId = ++fetchIdRef.current;

    if (!currentUser || !userProfile) {
      clearPermissionsCache();
      setPermissions(null);
      setRoles([]);
      setSystemRole(null);
      setIsSuperAdmin(false);
      setIsSchoolAdmin(false);
      setIsUnrestricted(false);
      setError(null);
      setLoading(false);
      return;
    }

    // Direct superadmin / school admin optimization from profile if already known
    const roleLower = String(userProfile.role || '').toLowerCase();
    const systemRoleLower = String(userProfile.systemRole || '').toLowerCase();
    const isDirectAdmin = ['admin', 'school_admin', 'schooladmin'].includes(roleLower) || ['admin', 'school_admin'].includes(systemRoleLower);
    const isDirectSuperAdmin = ['superadmin', 'super_admin'].includes(roleLower) || ['superadmin', 'super_admin'].includes(systemRoleLower);

    if (isDirectAdmin || isDirectSuperAdmin) {
      setIsSchoolAdmin(isDirectAdmin);
      setIsSuperAdmin(isDirectSuperAdmin);
      setIsUnrestricted(true);
      setPermissions('ALL');
      setError(null);
      setLoading(false);
      return;
    }

    const schoolId = userProfile.schoolId;
    if (!schoolId) {
      setPermissions({});
      setRoles([]);
      setIsUnrestricted(false);
      setError(null);
      setLoading(false);
      return;
    }

    const userId = currentUser.id || currentUser.uid || userProfile.id;
    const cacheKey = `${userId}:${schoolId}`;

    // Prevent stale permission results from old user or tenant after identity/school change
    if (permissionsCache.key && permissionsCache.key !== cacheKey) {
      clearPermissionsCache();
    }

    // Use cached permissions immediately (no spinner). If the cache is older than the TTL,
    // keep showing it and re-check with the server silently in the background.
    const hasCache = permissionsCache.key === cacheKey && permissionsCache.data;
    if (!forceRefresh && hasCache) {
      applyPermissionData(permissionsCache.data);
      setError(null);
      setLoading(false);
      if (Date.now() - permissionsCache.timestamp < PERMISSIONS_TTL_MS) {
        return;
      }
      silent = true;
    }

    try {
      if (!silent) setLoading(true);
      setError(null);

      // Single-flight deduplication across multiple concurrent mounts (e.g. nested route guards)
      if (!inFlightPermissionsPromise || inFlightPermissionsPromise.key !== cacheKey || forceRefresh) {
        inFlightPermissionsPromise = {
          key: cacheKey,
          promise: getMyPermissions().finally(() => {
            inFlightPermissionsPromise = null;
          })
        };
      }

      const res = await inFlightPermissionsPromise.promise;

      // Guard against race conditions from newer requests or unmounts
      if (currentFetchId !== fetchIdRef.current) return;

      if (res && res.success && res.data) {
        permissionsCache = {
          key: cacheKey,
          data: res.data,
          timestamp: Date.now()
        };
        applyPermissionData(res.data);
        setError(null);
      } else if (!silent) {
        setPermissions({});
        setRoles([]);
        setIsUnrestricted(false);
        setError(null);
      }
    } catch (err) {
      if (silent) {
        console.warn('[RBAC] Background permission refresh failed:', err);
      } else if (currentFetchId === fetchIdRef.current) {
        console.error('[RBAC] Error fetching permissions:', err);
        // Distinguish transient failure from confirmed permission denial:
        // Do NOT set permissions to {} (which would look like confirmed denial)
        // Set error so route guards know this was an unverified network failure
        setError(err);
        setPermissions(null);
        setRoles([]);
        setIsUnrestricted(false);
      }
    } finally {
      if (currentFetchId === fetchIdRef.current) {
        setLoading(false);
      }
    }
  }, [currentUser, userProfile, applyPermissionData]);

  useEffect(() => {
    fetchPermissions();

    const handleRbacUpdate = () => {
      clearPermissionsCache();
      fetchPermissions(true);
    };

    window.addEventListener('rbac-permissions-updated', handleRbacUpdate);
    return () => {
      // Invalidate current fetch to ignore in-flight response after unmount
      fetchIdRef.current++;
      window.removeEventListener('rbac-permissions-updated', handleRbacUpdate);
    };
  }, [fetchPermissions]);

  // Pick up role/permission changes made by an admin (even from another browser):
  // re-check when the tab gets focus again, and every minute while it stays open.
  useEffect(() => {
    if (!currentUser || !userProfile) return undefined;

    const refreshSilently = () => {
      if (document.visibilityState === 'hidden') return;
      fetchPermissions(true, true);
    };

    window.addEventListener('focus', refreshSilently);
    document.addEventListener('visibilitychange', refreshSilently);
    const timer = setInterval(refreshSilently, PERMISSIONS_POLL_MS);

    return () => {
      window.removeEventListener('focus', refreshSilently);
      document.removeEventListener('visibilitychange', refreshSilently);
      clearInterval(timer);
    };
  }, [fetchPermissions, currentUser, userProfile]);

  // Canonical live-data synchronization for RBAC permissions
  // silent=true: background refresh must never flip `loading` and unmount the whole portal
  useLiveDataRefresh(() => fetchPermissions(true, true), [fetchPermissions], ['rbac', 'permissions']);

  const canRead = useCallback((moduleKey) => {
    if (permissions === 'ALL' || isUnrestricted) return true;
    if (!permissions || !moduleKey) return false;
    return Boolean(permissions[moduleKey]?.canRead || permissions[moduleKey]?.read);
  }, [permissions, isUnrestricted]);

  const canCreate = useCallback((moduleKey) => {
    if (permissions === 'ALL' || isUnrestricted) return true;
    if (!permissions || !moduleKey) return false;
    return Boolean(permissions[moduleKey]?.canCreate || permissions[moduleKey]?.create);
  }, [permissions, isUnrestricted]);

  const canEdit = useCallback((moduleKey) => {
    if (permissions === 'ALL' || isUnrestricted) return true;
    if (!permissions || !moduleKey) return false;
    return Boolean(permissions[moduleKey]?.canEdit || permissions[moduleKey]?.edit);
  }, [permissions, isUnrestricted]);

  const canDelete = useCallback((moduleKey) => {
    if (permissions === 'ALL' || isUnrestricted) return true;
    if (!permissions || !moduleKey) return false;
    return Boolean(permissions[moduleKey]?.canDelete || permissions[moduleKey]?.delete);
  }, [permissions, isUnrestricted]);

  return {
    permissions,
    roles,
    systemRole,
    isSuperAdmin,
    isSchoolAdmin,
    isUnrestricted,
    loading,
    error,
    isError: Boolean(error),
    canRead,
    canCreate,
    canEdit,
    canDelete,
    refreshPermissions: () => fetchPermissions(true)
  };
}
