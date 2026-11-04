import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as rbacService from './rbac.service.js';
import * as rbacRepository from './rbac.repository.js';
import { RedisCacheService } from '../../services/redis-cache.service.js';

vi.mock('./rbac.repository.js');
vi.mock('../../services/redis-cache.service.js', () => ({
  RedisCacheService: {
    delPattern: vi.fn().mockResolvedValue(true)
  }
}));

describe('RBAC Roles & Permissions Service Suite', () => {
  const schoolId = '11111111-1111-4111-8111-111111111111';
  const roleId = '22222222-2222-4222-8222-222222222222';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates role permissions successfully using batch upsert and returns normalized map', async () => {
    const mockRole = {
      id: roleId,
      name: 'Academic Coordinator',
      slug: 'academic-coordinator',
      loginPanel: 'admin',
      isSystemDefault: false
    };

    rbacRepository.findRoleById.mockResolvedValueOnce(mockRole);
    rbacRepository.upsertRolePermissions.mockResolvedValueOnce([
      {
        id: 'perm-1',
        schoolRoleId: roleId,
        moduleKey: 'classes',
        canRead: true,
        canCreate: true,
        canEdit: true,
        canDelete: false
      },
      {
        id: 'perm-2',
        schoolRoleId: roleId,
        moduleKey: 'attendance',
        canRead: true,
        canCreate: false,
        canEdit: false,
        canDelete: false
      }
    ]);
    rbacRepository.createAuditLog.mockResolvedValueOnce({});

    const inputPermissions = {
      classes: { canRead: true, canCreate: true, canEdit: true, canDelete: false },
      attendance: { canRead: true, canCreate: false, canEdit: false, canDelete: false }
    };

    const result = await rbacService.updateRolePermissions(schoolId, roleId, inputPermissions);

    expect(result).toBeDefined();
    expect(result.role.id).toBe(roleId);
    expect(result.permissions.classes).toEqual({
      canRead: true,
      canCreate: true,
      canEdit: true,
      canDelete: false
    });
    expect(result.permissions.attendance).toEqual({
      canRead: true,
      canCreate: false,
      canEdit: false,
      canDelete: false
    });

    // Verified repository was called with normalized array
    expect(rbacRepository.upsertRolePermissions).toHaveBeenCalledWith(
      schoolId,
      roleId,
      expect.arrayContaining([
        expect.objectContaining({ moduleKey: 'classes', canRead: true }),
        expect.objectContaining({ moduleKey: 'attendance', canRead: true })
      ])
    );
  });

  it('handles Redis cache or AuditLog failure gracefully without throwing or timing out', async () => {
    const mockRole = {
      id: roleId,
      name: 'Class Incharge',
      slug: 'class-incharge',
      loginPanel: 'teacher',
      isSystemDefault: true
    };

    rbacRepository.findRoleById.mockResolvedValueOnce(mockRole);
    rbacRepository.upsertRolePermissions.mockResolvedValueOnce([
      {
        id: 'perm-1',
        schoolRoleId: roleId,
        moduleKey: 'students',
        canRead: true,
        canCreate: true,
        canEdit: false,
        canDelete: false
      }
    ]);

    // Simulate Redis failure
    RedisCacheService.delPattern.mockRejectedValueOnce(new Error('Redis connection lost'));
    // Simulate AuditLog failure
    rbacRepository.createAuditLog.mockRejectedValueOnce(new Error('Audit DB write error'));

    const result = await rbacService.updateRolePermissions(schoolId, roleId, {
      students: { canRead: true, canCreate: true }
    });

    expect(result).toBeDefined();
    expect(result.role.name).toBe('Class Incharge');
    expect(result.permissions.students.canRead).toBe(true);
  });
});
