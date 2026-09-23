import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as rbacService from '../../../src/modules/rbac/rbac.service.js';
import * as rbacRepository from '../../../src/modules/rbac/rbac.repository.js';
import {
  ValidationError,
  ConflictError,
  ForbiddenError,
  TenantAccessError
} from '../../../src/utils/app-error.js';
import { SYSTEM_ROLES } from '../../../src/config/constants.js';

describe('RBAC Service Layer Unit Tests (rbac.service.js)', () => {
  const TENANT_A = '11111111-1111-4111-8111-111111111111';
  const ROLE_ID_1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const ROLE_ID_2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const USER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('listRoles()', () => {
    it('throws TenantAccessError when schoolId is missing', async () => {
      await expect(rbacService.listRoles(null)).rejects.toThrow(TenantAccessError);
    });

    it('returns roles list for active tenant', async () => {
      const mockRoles = [{ id: ROLE_ID_1, name: 'Principal', schoolId: TENANT_A }];
      vi.spyOn(rbacRepository, 'findRolesBySchoolId').mockResolvedValue(mockRoles);

      const result = await rbacService.listRoles(TENANT_A);
      expect(result).toEqual(mockRoles);
      expect(rbacRepository.findRolesBySchoolId).toHaveBeenCalledWith(TENANT_A);
    });
  });

  describe('createRole()', () => {
    it('creates custom role with deterministic slug and normalized permissions', async () => {
      vi.spyOn(rbacRepository, 'findRoleBySlug').mockResolvedValue(null);
      vi.spyOn(rbacRepository, 'findRoleByName').mockResolvedValue(null);
      vi.spyOn(rbacRepository, 'createRoleWithPermissions').mockResolvedValue({
        id: ROLE_ID_1,
        schoolId: TENANT_A,
        name: 'Science Coordinator',
        slug: 'science-coordinator',
        loginPanel: 'teacher',
        isSystemDefault: false,
        permissions: [{ moduleKey: 'classes', canRead: true, canCreate: true, canEdit: false, canDelete: false }]
      });
      vi.spyOn(rbacRepository, 'createAuditLog').mockResolvedValue({});

      const result = await rbacService.createRole(TENANT_A, {
        name: 'Science Coordinator',
        loginPanel: 'teacher',
        permissions: {
          classes: { canRead: false, canCreate: true, canEdit: false, canDelete: false }
        }
      }, { userId: 'admin-1', systemRole: 'SCHOOL_ADMIN' });

      expect(result.slug).toBe('science-coordinator');
      expect(rbacRepository.findRoleBySlug).toHaveBeenCalledWith(TENANT_A, 'science-coordinator');
      expect(rbacRepository.createRoleWithPermissions).toHaveBeenCalledWith(expect.objectContaining({
        schoolId: TENANT_A,
        name: 'Science Coordinator',
        slug: 'science-coordinator',
        loginPanel: 'teacher',
        isSystemDefault: false,
        permissions: expect.arrayContaining([
          expect.objectContaining({ moduleKey: 'classes', canRead: true, canCreate: true })
        ])
      }));
    });

    it('rejects duplicate slug with ConflictError', async () => {
      vi.spyOn(rbacRepository, 'findRoleBySlug').mockResolvedValue({ id: 'existing-id', slug: 'library' });

      await expect(
        rbacService.createRole(TENANT_A, { name: 'Library' })
      ).rejects.toThrow(ConflictError);
    });

    it('rejects duplicate role name with ConflictError', async () => {
      vi.spyOn(rbacRepository, 'findRoleBySlug').mockResolvedValue(null);
      vi.spyOn(rbacRepository, 'findRoleByName').mockResolvedValue({ id: 'existing-id', name: 'Custom Library' });

      await expect(
        rbacService.createRole(TENANT_A, { name: 'Custom Library' })
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('updateRole()', () => {
    it('updates custom role successfully', async () => {
      vi.spyOn(rbacRepository, 'findRoleById').mockResolvedValue({
        id: ROLE_ID_1,
        schoolId: TENANT_A,
        name: 'Senior Coordinator',
        slug: 'senior-coordinator',
        isSystemDefault: false
      });
      vi.spyOn(rbacRepository, 'findRoleByName').mockResolvedValue(null);
      vi.spyOn(rbacRepository, 'findRoleBySlug').mockResolvedValue(null);
      vi.spyOn(rbacRepository, 'updateRole').mockResolvedValue({
        id: ROLE_ID_1,
        name: 'Lead Coordinator',
        slug: 'lead-coordinator'
      });
      vi.spyOn(rbacRepository, 'createAuditLog').mockResolvedValue({});

      const result = await rbacService.updateRole(TENANT_A, ROLE_ID_1, {
        name: 'Lead Coordinator'
      });

      expect(result.name).toBe('Lead Coordinator');
      expect(rbacRepository.updateRole).toHaveBeenCalledWith(
        TENANT_A,
        ROLE_ID_1,
        expect.objectContaining({ name: 'Lead Coordinator', slug: 'lead-coordinator' })
      );
    });

    it('rejects modifying slug of system default role', async () => {
      vi.spyOn(rbacRepository, 'findRoleById').mockResolvedValue({
        id: ROLE_ID_1,
        schoolId: TENANT_A,
        name: 'Principal',
        slug: 'principal',
        isSystemDefault: true
      });

      await expect(
        rbacService.updateRole(TENANT_A, ROLE_ID_1, { slug: 'new-principal' })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('deleteRole()', () => {
    it('deletes custom role successfully', async () => {
      vi.spyOn(rbacRepository, 'findRoleById').mockResolvedValue({
        id: ROLE_ID_1,
        schoolId: TENANT_A,
        name: 'Custom Assistant',
        slug: 'custom-assistant',
        isSystemDefault: false
      });
      vi.spyOn(rbacRepository, 'deleteRole').mockResolvedValue({});
      vi.spyOn(rbacRepository, 'createAuditLog').mockResolvedValue({});

      await expect(rbacService.deleteRole(TENANT_A, ROLE_ID_1)).resolves.not.toThrow();
      expect(rbacRepository.deleteRole).toHaveBeenCalledWith(TENANT_A, ROLE_ID_1);
    });

    it('strictly prevents deletion of system default role with ValidationError', async () => {
      vi.spyOn(rbacRepository, 'findRoleById').mockResolvedValue({
        id: ROLE_ID_1,
        schoolId: TENANT_A,
        name: 'Transport',
        slug: 'transport',
        isSystemDefault: true
      });
      vi.spyOn(rbacRepository, 'deleteRole').mockResolvedValue({});

      await expect(
        rbacService.deleteRole(TENANT_A, ROLE_ID_1)
      ).rejects.toThrow(ValidationError);
      expect(rbacRepository.deleteRole).not.toHaveBeenCalled();
    });
  });

  describe('assignUserRole()', () => {
    it('assigns role to valid tenant user', async () => {
      vi.spyOn(rbacRepository, 'findUserById').mockResolvedValue({ id: USER_ID, schoolId: TENANT_A });
      vi.spyOn(rbacRepository, 'findRoleById').mockResolvedValue({ id: ROLE_ID_1, schoolId: TENANT_A, name: 'Library' });
      vi.spyOn(rbacRepository, 'assignRoleToUser').mockResolvedValue({
        id: 'assign-1',
        userId: USER_ID,
        assignedAt: new Date(),
        schoolRole: { id: ROLE_ID_1, name: 'Library', slug: 'library', loginPanel: 'admin', isSystemDefault: true }
      });
      vi.spyOn(rbacRepository, 'createAuditLog').mockResolvedValue({});

      const result = await rbacService.assignUserRole(TENANT_A, USER_ID, ROLE_ID_1, {
        userId: 'admin-1',
        systemRole: SYSTEM_ROLES.SCHOOL_ADMIN
      });

      expect(result.userId).toBe(USER_ID);
      expect(rbacRepository.assignRoleToUser).toHaveBeenCalledWith(TENANT_A, USER_ID, ROLE_ID_1);
    });

    it('rejects self-assignment when ordinary staff attempts to escalate themselves', async () => {
      vi.spyOn(rbacRepository, 'findUserById').mockResolvedValue({ id: USER_ID, schoolId: TENANT_A });
      vi.spyOn(rbacRepository, 'findRoleById').mockResolvedValue({ id: ROLE_ID_1, schoolId: TENANT_A, name: 'Principal' });

      await expect(
        rbacService.assignUserRole(TENANT_A, USER_ID, ROLE_ID_1, {
          userId: USER_ID,
          systemRole: SYSTEM_ROLES.TEACHER
        })
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe('getMyEffectivePermissions() — Multi-Role Union', () => {
    it('returns unrestricted permissions for SUPER_ADMIN', async () => {
      const auth = { userId: 'sa-1', systemRole: SYSTEM_ROLES.SUPER_ADMIN };
      const tenant = { schoolId: TENANT_A };

      const result = await rbacService.getMyEffectivePermissions(auth, tenant);
      expect(result.isSuperAdmin).toBe(true);
      expect(result.isUnrestricted).toBe(true);
      expect(result.permissions.classes).toEqual({
        canRead: true,
        canCreate: true,
        canEdit: true,
        canDelete: true
      });
    });

    it('returns unrestricted permissions for SCHOOL_ADMIN', async () => {
      const auth = { userId: 'admin-1', schoolId: TENANT_A, systemRole: SYSTEM_ROLES.SCHOOL_ADMIN };

      const result = await rbacService.getMyEffectivePermissions(auth);
      expect(result.isSchoolAdmin).toBe(true);
      expect(result.isUnrestricted).toBe(true);
      expect(result.permissions.fees).toEqual({
        canRead: true,
        canCreate: true,
        canEdit: true,
        canDelete: true
      });
    });

    it('computes logical OR multi-role union across 2 assigned functional roles', async () => {
      const auth = { userId: USER_ID, schoolId: TENANT_A, systemRole: SYSTEM_ROLES.STAFF };

      // Role A: Library (read/create on library, read on students)
      // Role B: Transport (read/edit on transport, edit on students)
      const mockAssignments = [
        {
          schoolRole: {
            id: ROLE_ID_1,
            name: 'Library',
            slug: 'library',
            loginPanel: 'admin',
            isSystemDefault: true,
            permissions: [
              { moduleKey: 'library', canRead: true, canCreate: true, canEdit: false, canDelete: false },
              { moduleKey: 'students', canRead: true, canCreate: false, canEdit: false, canDelete: false }
            ]
          }
        },
        {
          schoolRole: {
            id: ROLE_ID_2,
            name: 'Transport',
            slug: 'transport',
            loginPanel: 'admin',
            isSystemDefault: true,
            permissions: [
              { moduleKey: 'transport', canRead: true, canCreate: false, canEdit: true, canDelete: false },
              { moduleKey: 'students', canRead: false, canCreate: false, canEdit: true, canDelete: false }
            ]
          }
        }
      ];

      vi.spyOn(rbacRepository, 'findUserRoleAssignments').mockResolvedValue(mockAssignments);

      const result = await rbacService.getMyEffectivePermissions(auth);

      expect(result.roles).toHaveLength(2);
      // library: canRead=true, canCreate=true
      expect(result.permissions.library).toEqual({
        canRead: true,
        canCreate: true,
        canEdit: false,
        canDelete: false
      });
      // transport: canRead=true, canEdit=true
      expect(result.permissions.transport).toEqual({
        canRead: true,
        canCreate: false,
        canEdit: true,
        canDelete: false
      });
      // students union: Role A gave read, Role B gave edit -> result is read: true, edit: true
      expect(result.permissions.students).toEqual({
        canRead: true,
        canCreate: false,
        canEdit: true,
        canDelete: false
      });
    });

    it('returns empty matrix when user has zero assigned roles', async () => {
      const auth = { userId: USER_ID, schoolId: TENANT_A, systemRole: SYSTEM_ROLES.STAFF };
      vi.spyOn(rbacRepository, 'findUserRoleAssignments').mockResolvedValue([]);

      const result = await rbacService.getMyEffectivePermissions(auth);
      expect(result.roles).toEqual([]);
      expect(result.permissions).toEqual({});
    });
  });
});
