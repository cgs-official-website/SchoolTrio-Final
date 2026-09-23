import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as rbacService from '../../../src/modules/rbac/rbac.service.js';
import * as rbacRepository from '../../../src/modules/rbac/rbac.repository.js';
import { RedisCacheService } from '../../../src/services/redis-cache.service.js';

describe('Unit: RBAC Effective Permissions & Redis Caching Suite', () => {
  const schoolId = '25e9637a-7fa4-4ac2-b43d-b4c0edcf2932';
  const userId = '3ce9236d-54d4-4e14-b6b5-f16e6849a681';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Redis Cache-Aside & Fallback Behavior', () => {
    it('21. Cache hit returns cached permissions without querying PostgreSQL', async () => {
      const cachedPermissions = {
        students: { canRead: true, canCreate: false, canEdit: false, canDelete: false },
        classes: { canRead: true, canCreate: true, canEdit: false, canDelete: false }
      };

      const getSpy = vi.spyOn(RedisCacheService, 'get').mockResolvedValue(cachedPermissions);
      const dbSpy = vi.spyOn(rbacRepository, 'findUserRoleAssignments');

      const result = await rbacService.getUserEffectivePermissions(schoolId, userId);

      expect(getSpy).toHaveBeenCalledWith(`rbac:perms:${schoolId}:${userId}`);
      expect(dbSpy).not.toHaveBeenCalled();
      expect(result).toEqual(cachedPermissions);
    });

    it('22 & 23. Cache miss queries PostgreSQL and attempts cache population', async () => {
      const getSpy = vi.spyOn(RedisCacheService, 'get').mockResolvedValue(null);
      const setSpy = vi.spyOn(RedisCacheService, 'set').mockResolvedValue(true);

      const dbSpy = vi.spyOn(rbacRepository, 'findUserRoleAssignments').mockResolvedValue([
        {
          id: 'assign-1',
          schoolRole: {
            id: 'role-1',
            name: 'Teacher',
            permissions: [
              { moduleKey: 'students', canRead: true, canCreate: false, canEdit: false, canDelete: false },
              { moduleKey: 'attendance', canRead: true, canCreate: true, canEdit: true, canDelete: false }
            ]
          }
        }
      ]);

      const result = await rbacService.getUserEffectivePermissions(schoolId, userId);

      expect(getSpy).toHaveBeenCalledWith(`rbac:perms:${schoolId}:${userId}`);
      expect(dbSpy).toHaveBeenCalledWith(schoolId, userId);
      expect(setSpy).toHaveBeenCalledWith(`rbac:perms:${schoolId}:${userId}`, expect.any(Object), 300);
      expect(result.students.canRead).toBe(true);
      expect(result.attendance.canEdit).toBe(true);
    });

    it('24 & 25. Redis unavailable/timeout falls back to PostgreSQL without failing open or crashing', async () => {
      vi.spyOn(RedisCacheService, 'get').mockRejectedValue(new Error('Redis connection timeout'));
      const dbSpy = vi.spyOn(rbacRepository, 'findUserRoleAssignments').mockResolvedValue([
        {
          id: 'assign-1',
          schoolRole: {
            id: 'role-1',
            permissions: [
              { moduleKey: 'students', canRead: true, canCreate: false, canEdit: false, canDelete: false }
            ]
          }
        }
      ]);

      const result = await rbacService.getUserEffectivePermissions(schoolId, userId);

      expect(dbSpy).toHaveBeenCalledWith(schoolId, userId);
      expect(result.students.canRead).toBe(true);
      expect(result.students.canDelete).toBe(false);
    });

    it('26. Malformed cached data falls back to PostgreSQL', async () => {
      vi.spyOn(RedisCacheService, 'get').mockResolvedValue('invalid-string-not-an-object');
      const dbSpy = vi.spyOn(rbacRepository, 'findUserRoleAssignments').mockResolvedValue([]);

      const result = await rbacService.getUserEffectivePermissions(schoolId, userId);

      expect(dbSpy).toHaveBeenCalledWith(schoolId, userId);
      expect(result.students.canRead).toBe(false);
    });

    it('27. Redis failure never causes authorization to grant permissions that do not exist', async () => {
      vi.spyOn(RedisCacheService, 'get').mockResolvedValue(null);
      // DB returns empty role assignments
      vi.spyOn(rbacRepository, 'findUserRoleAssignments').mockResolvedValue([]);

      const result = await rbacService.getUserEffectivePermissions(schoolId, userId);

      // All permissions must be false
      expect(result.students.canRead).toBe(false);
      expect(result.students.canCreate).toBe(false);
      expect(result.fees.canRead).toBe(false);
    });
  });

  describe('2. Multi-Role Union & Invariants', () => {
    it('19 & 20. Correctly computes logical OR union from multiple assigned roles', async () => {
      vi.spyOn(RedisCacheService, 'get').mockResolvedValue(null);
      vi.spyOn(RedisCacheService, 'set').mockResolvedValue(true);

      vi.spyOn(rbacRepository, 'findUserRoleAssignments').mockResolvedValue([
        {
          id: 'assign-1',
          schoolRole: {
            id: 'role-1',
            name: 'Class Coordinator',
            permissions: [
              { moduleKey: 'students', canRead: true, canCreate: true, canEdit: false, canDelete: false },
              { moduleKey: 'attendance', canRead: true, canCreate: true, canEdit: false, canDelete: false }
            ]
          }
        },
        {
          id: 'assign-2',
          schoolRole: {
            id: 'role-2',
            name: 'Transport Lead',
            permissions: [
              { moduleKey: 'students', canRead: false, canCreate: false, canEdit: true, canDelete: false },
              { moduleKey: 'transport', canRead: true, canCreate: false, canEdit: true, canDelete: false }
            ]
          }
        }
      ]);

      const result = await rbacService.getUserEffectivePermissions(schoolId, userId);

      // students: canRead (from role 1), canCreate (from role 1), canEdit (from role 2) -> all true!
      expect(result.students.canRead).toBe(true);
      expect(result.students.canCreate).toBe(true);
      expect(result.students.canEdit).toBe(true);
      expect(result.students.canDelete).toBe(false);

      // transport: canRead=true, canEdit=true
      expect(result.transport.canRead).toBe(true);
      expect(result.transport.canEdit).toBe(true);

      // unassigned modules remain false
      expect(result.fees.canRead).toBe(false);
    });

    it('Enforces write implies read invariant', async () => {
      vi.spyOn(RedisCacheService, 'get').mockResolvedValue(null);

      vi.spyOn(rbacRepository, 'findUserRoleAssignments').mockResolvedValue([
        {
          id: 'assign-1',
          schoolRole: {
            id: 'role-1',
            permissions: [
              { moduleKey: 'homework', canRead: false, canCreate: true, canEdit: false, canDelete: false }
            ]
          }
        }
      ]);

      const result = await rbacService.getUserEffectivePermissions(schoolId, userId);

      // canCreate=true implies canRead must be promoted to true
      expect(result.homework.canCreate).toBe(true);
      expect(result.homework.canRead).toBe(true);
    });
  });

  describe('3. Tenant Isolation & Cache Key Scoping', () => {
    it('28 & 29. User A and User B have separate, isolated cache keys', async () => {
      const getSpy = vi.spyOn(RedisCacheService, 'get').mockResolvedValue(null);
      vi.spyOn(rbacRepository, 'findUserRoleAssignments').mockResolvedValue([]);

      await rbacService.getUserEffectivePermissions(schoolId, 'user-a');
      await rbacService.getUserEffectivePermissions(schoolId, 'user-b');

      expect(getSpy).toHaveBeenNthCalledWith(1, `rbac:perms:${schoolId}:user-a`);
      expect(getSpy).toHaveBeenNthCalledWith(2, `rbac:perms:${schoolId}:user-b`);
    });

    it('30. Different schools use separate cache keys and isolated repository queries', async () => {
      const getSpy = vi.spyOn(RedisCacheService, 'get').mockResolvedValue(null);
      const dbSpy = vi.spyOn(rbacRepository, 'findUserRoleAssignments').mockResolvedValue([]);

      await rbacService.getUserEffectivePermissions('school-1', userId);
      await rbacService.getUserEffectivePermissions('school-2', userId);

      expect(getSpy).toHaveBeenNthCalledWith(1, `rbac:perms:school-1:${userId}`);
      expect(getSpy).toHaveBeenNthCalledWith(2, `rbac:perms:school-2:${userId}`);
      expect(dbSpy).toHaveBeenNthCalledWith(1, 'school-1', userId);
      expect(dbSpy).toHaveBeenNthCalledWith(2, 'school-2', userId);
    });
  });

  describe('4. Cache Invalidation Triggers', () => {
    it('Invalidates tenant pattern cache on role permissions update', async () => {
      vi.spyOn(rbacRepository, 'findRoleById').mockResolvedValue({
        id: 'role-1',
        name: 'Staffs',
        slug: 'staffs'
      });
      vi.spyOn(rbacRepository, 'upsertRolePermissions').mockResolvedValue([]);
      vi.spyOn(rbacRepository, 'createAuditLog').mockResolvedValue({});
      const delPatternSpy = vi.spyOn(RedisCacheService, 'delPattern').mockResolvedValue(5);

      await rbacService.updateRolePermissions(schoolId, 'role-1', [{ moduleKey: 'students', canRead: true }]);

      expect(delPatternSpy).toHaveBeenCalledWith(`rbac:perms:${schoolId}:*`);
    });

    it('Invalidates tenant pattern cache on role deletion', async () => {
      vi.spyOn(rbacRepository, 'findRoleById').mockResolvedValue({
        id: 'role-1',
        name: 'Custom',
        slug: 'custom',
        isSystemDefault: false
      });
      vi.spyOn(rbacRepository, 'deleteRole').mockResolvedValue({});
      vi.spyOn(rbacRepository, 'createAuditLog').mockResolvedValue({});
      const delPatternSpy = vi.spyOn(RedisCacheService, 'delPattern').mockResolvedValue(5);

      await rbacService.deleteRole(schoolId, 'role-1');

      expect(delPatternSpy).toHaveBeenCalledWith(`rbac:perms:${schoolId}:*`);
    });

    it('Invalidates user-specific cache on role assignment', async () => {
      vi.spyOn(rbacRepository, 'findUserById').mockResolvedValue({ id: userId, email: 't@s.edu' });
      vi.spyOn(rbacRepository, 'findRoleById').mockResolvedValue({ id: 'r1', name: 'Role 1', slug: 'r1' });
      vi.spyOn(rbacRepository, 'assignRoleToUser').mockResolvedValue({
        id: 'assign-1',
        assignedAt: new Date(),
        userId,
        schoolRole: { id: 'r1', name: 'Role 1', slug: 'r1' }
      });
      vi.spyOn(rbacRepository, 'createAuditLog').mockResolvedValue({});
      const delSpy = vi.spyOn(RedisCacheService, 'del').mockResolvedValue(true);

      await rbacService.assignUserRole(schoolId, userId, 'r1');

      expect(delSpy).toHaveBeenCalledWith(`rbac:perms:${schoolId}:${userId}`);
    });

    it('Invalidates user-specific cache on role removal', async () => {
      vi.spyOn(rbacRepository, 'findUserById').mockResolvedValue({ id: userId, email: 't@s.edu' });
      vi.spyOn(rbacRepository, 'findRoleById').mockResolvedValue({ id: 'r1', name: 'Role 1' });
      vi.spyOn(rbacRepository, 'findUserRoleAssignment').mockResolvedValue({ id: 'assign-1' });
      vi.spyOn(rbacRepository, 'removeRoleFromUser').mockResolvedValue({});
      vi.spyOn(rbacRepository, 'createAuditLog').mockResolvedValue({});
      const delSpy = vi.spyOn(RedisCacheService, 'del').mockResolvedValue(true);

      await rbacService.removeUserRole(schoolId, userId, 'r1');

      expect(delSpy).toHaveBeenCalledWith(`rbac:perms:${schoolId}:${userId}`);
    });
  });
});
