import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { getMyPermissions } from '../api/rbac.js';

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

  const fetchIdRef = useRef(0);

  const fetchPermissions = useCallback(async () => {
    const currentFetchId = ++fetchIdRef.current;

    if (!currentUser || !userProfile) {
      setPermissions(null);
      setRoles([]);
      setSystemRole(null);
      setIsSuperAdmin(false);
      setIsSchoolAdmin(false);
      setIsUnrestricted(false);
      setLoading(false);
      return;
    }

    // Direct superadmin / school admin optimization from profile if already known
    if (userProfile.role === 'admin' || userProfile.role === 'superadmin') {
      setIsSchoolAdmin(userProfile.role === 'admin');
      setIsSuperAdmin(userProfile.role === 'superadmin');
      setIsUnrestricted(true);
      setPermissions('ALL');
      setLoading(false);
      return;
    }

    const schoolId = userProfile.schoolId;
    if (!schoolId) {
      setPermissions({});
      setRoles([]);
      setIsUnrestricted(false);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const res = await getMyPermissions();

      // Guard against race conditions from newer requests or unmounts
      if (currentFetchId !== fetchIdRef.current) return;

      if (res && res.success && res.data) {
        const data = res.data;
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
        setSystemRole(data.systemRole || userProfile.role || null);
        setIsSuperAdmin(Boolean(data.isSuperAdmin));
        setIsSchoolAdmin(Boolean(data.isSchoolAdmin));
        setIsUnrestricted(isUnres);
      } else {
        setPermissions({});
        setRoles([]);
        setIsUnrestricted(false);
      }
    } catch (error) {
      if (currentFetchId === fetchIdRef.current) {
        console.error('Error fetching RBAC permissions:', error);
        // Fail-closed: restricted state on error
        setPermissions({});
        setRoles([]);
        setIsUnrestricted(false);
      }
    } finally {
      if (currentFetchId === fetchIdRef.current) {
        setLoading(false);
      }
    }
  }, [currentUser, userProfile]);

  useEffect(() => {
    fetchPermissions();

    const handleRbacUpdate = () => {
      fetchPermissions();
    };

    window.addEventListener('rbac-permissions-updated', handleRbacUpdate);
    return () => {
      window.removeEventListener('rbac-permissions-updated', handleRbacUpdate);
    };
  }, [fetchPermissions]);

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
    canRead,
    canCreate,
    canEdit,
    canDelete,
    refreshPermissions: fetchPermissions
  };
}
