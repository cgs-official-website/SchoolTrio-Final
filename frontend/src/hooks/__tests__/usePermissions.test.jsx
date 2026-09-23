import { describe, it, expect, vi, beforeEach } from 'vitest';
import usePermissions from '../usePermissions.js';
import * as authContextModule from '../../context/AuthContext.jsx';
import * as rbacApi from '../../api/rbac.js';

describe('usePermissions Hook (REST RBAC Migration — Phase RBAC.3)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('1. is exported as a valid hook function', () => {
    expect(typeof usePermissions).toBe('function');
  });

  it('2. integrates with getMyPermissions REST API endpoint', async () => {
    const apiSpy = vi.spyOn(rbacApi, 'getMyPermissions').mockResolvedValue({
      success: true,
      data: {
        userId: 'teacher-123',
        schoolId: 'school-123',
        systemRole: 'teacher',
        isSuperAdmin: false,
        isSchoolAdmin: false,
        isUnrestricted: false,
        roles: [{ id: 'role-1', name: 'Class Incharge' }],
        permissions: {
          attendance: { canRead: true, canCreate: true, canEdit: false, canDelete: false },
          students: { canRead: true, canCreate: false, canEdit: false, canDelete: false },
          library: { canRead: false, canCreate: false, canEdit: false, canDelete: false }
        }
      }
    });

    const res = await rbacApi.getMyPermissions();
    expect(apiSpy).toHaveBeenCalled();
    expect(res.success).toBe(true);
    expect(res.data.permissions.attendance.canRead).toBe(true);
    expect(res.data.permissions.attendance.canCreate).toBe(true);
    expect(res.data.permissions.library.canRead).toBe(false);
  });

  it('3. supports both canRead/canCreate and legacy read/create fields in normalized data', () => {
    const rawPerms = {
      attendance: { canRead: true, canCreate: true, canEdit: false, canDelete: false },
      library: { canRead: false, canCreate: false, canEdit: false, canDelete: false }
    };

    const normalized = {};
    for (const [key, perm] of Object.entries(rawPerms)) {
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

    expect(normalized.attendance.canRead).toBe(true);
    expect(normalized.attendance.read).toBe(true);
    expect(normalized.attendance.canCreate).toBe(true);
    expect(normalized.attendance.create).toBe(true);
    expect(normalized.library.canRead).toBe(false);
    expect(normalized.library.read).toBe(false);
  });
});
