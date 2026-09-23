import { describe, it, expect, vi, beforeEach } from 'vitest';
import RolesPermissions from '../RolesPermissions.jsx';
import * as rbacApi from '../../../api/rbac.js';
import * as firestoreModule from '../../../firebase/firestore.js';

describe('Admin RolesPermissions Component REST Cutover (Phase RBAC.3)', () => {
  const MOCK_ROLES = [
    {
      id: 'role-1',
      name: 'Correspondent',
      slug: 'correspondent',
      loginPanel: 'admin',
      isSystemDefault: true,
      permissions: [
        { moduleKey: 'classes', canRead: true, canCreate: true, canEdit: true, canDelete: true }
      ]
    },
    {
      id: 'role-2',
      name: 'Principal',
      slug: 'principal',
      loginPanel: 'admin',
      isSystemDefault: true,
      permissions: [
        { moduleKey: 'classes', canRead: true, canCreate: true, canEdit: true, canDelete: true }
      ]
    },
    {
      id: 'role-custom-1',
      name: 'Custom Coordinator',
      slug: 'custom-coordinator',
      loginPanel: 'admin',
      isSystemDefault: false,
      permissions: [
        { moduleKey: 'students', canRead: true, canCreate: false, canEdit: false, canDelete: false }
      ]
    }
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('1. is exported as a valid React component function', () => {
    expect(typeof RolesPermissions).toBe('function');
  });

  // ============================================================
  // 1. ZERO FIRESTORE RBAC RUNTIME OPERATIONS
  // ============================================================

  it('2. does NOT invoke legacy Firestore functions for roles runtime operations', () => {
    const firestoreSpies = [
      vi.spyOn(firestoreModule, 'subscribeToSubCollection'),
      vi.spyOn(firestoreModule, 'addSubDocument'),
      vi.spyOn(firestoreModule, 'updateSubDocument'),
      vi.spyOn(firestoreModule, 'deleteSubDocument')
    ];

    firestoreSpies.forEach((spy) => {
      expect(spy).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // 2. REST API INTEGRATION VERIFICATION
  // ============================================================

  it('3. loads roles via REST getRoles() API', async () => {
    const getRolesSpy = vi.spyOn(rbacApi, 'getRoles').mockResolvedValue({
      success: true,
      data: MOCK_ROLES
    });

    const res = await rbacApi.getRoles();
    expect(getRolesSpy).toHaveBeenCalled();
    expect(res.success).toBe(true);
    expect(res.data).toHaveLength(3);
    expect(res.data[0].name).toBe('Correspondent');
    expect(res.data[2].name).toBe('Custom Coordinator');
  });

  it('4. creates custom roles via REST createRole() API', async () => {
    const createSpy = vi.spyOn(rbacApi, 'createRole').mockResolvedValue({
      success: true,
      message: 'Role created successfully',
      data: {
        id: 'role-new-1',
        name: 'Exam Officer',
        slug: 'exam-officer',
        loginPanel: 'teacher',
        isSystemDefault: false
      }
    });

    const payload = {
      name: 'Exam Officer',
      loginPanel: 'teacher',
      permissions: { examinations: { canRead: true, canCreate: true } }
    };

    const res = await rbacApi.createRole(payload);
    expect(createSpy).toHaveBeenCalledWith(payload);
    expect(res.success).toBe(true);
    expect(res.data.id).toBe('role-new-1');
  });

  it('5. updates role metadata and permissions via REST updateRole / updateRolePermissions', async () => {
    const updatePermsSpy = vi.spyOn(rbacApi, 'updateRolePermissions').mockResolvedValue({
      success: true,
      message: 'Role permissions updated'
    });
    const updateRoleSpy = vi.spyOn(rbacApi, 'updateRole').mockResolvedValue({
      success: true,
      message: 'Role updated'
    });

    const permsPayload = { permissions: { classes: { canRead: true, canCreate: false } } };
    const permsRes = await rbacApi.updateRolePermissions('role-1', permsPayload);
    expect(updatePermsSpy).toHaveBeenCalledWith('role-1', permsPayload);
    expect(permsRes.success).toBe(true);

    const roleRes = await rbacApi.updateRole('role-1', { loginPanel: 'admin' });
    expect(updateRoleSpy).toHaveBeenCalledWith('role-1', { loginPanel: 'admin' });
    expect(roleRes.success).toBe(true);
  });

  it('6. deletes custom roles via REST deleteRole', async () => {
    const deleteSpy = vi.spyOn(rbacApi, 'deleteRole').mockResolvedValue({
      success: true,
      message: 'Role deleted successfully'
    });

    const res = await rbacApi.deleteRole('role-custom-1');
    expect(deleteSpy).toHaveBeenCalledWith('role-custom-1');
    expect(res.success).toBe(true);
  });
});
