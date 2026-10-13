import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as staffService from './staff.service.js';
import * as staffRepository from './staff.repository.js';
import * as authRepository from '../auth/auth.repository.js';
import { RedisCacheService } from '../../services/redis-cache.service.js';
import { prisma } from '../../database/prisma.client.js';
import { ValidationError, TenantAccessError, NotFoundError, ConflictError } from '../../utils/app-error.js';

vi.mock('./staff.repository.js');
vi.mock('../auth/auth.repository.js', () => ({
  revokeAllRefreshSessions: vi.fn().mockResolvedValue({ count: 1 })
}));
vi.mock('../../services/redis-cache.service.js', () => ({
  RedisCacheService: {
    del: vi.fn().mockResolvedValue(true)
  }
}));
vi.mock('../../database/prisma.client.js', () => ({
  prisma: {
    $transaction: vi.fn(async (cb) => cb(prisma)),
    subject: {
      findMany: vi.fn()
    },
    class: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
      updateMany: vi.fn().mockResolvedValue({ count: 0 })
    },
    section: {
      findMany: vi.fn(),
      findFirst: vi.fn()
    },
    schoolRole: {
      findFirst: vi.fn()
    }
  }
}));
vi.mock('../audit/audit.repository.js', () => ({
  createAuditLog: vi.fn().mockResolvedValue({})
}));
vi.mock('../cache/redis.cache.service.js', () => ({
  default: {
    del: vi.fn().mockResolvedValue(true)
  }
}));

describe('BUG-002: Staff Assignment Tenant Validation & Stale ID Security Tests', () => {
  const tenantA = '11111111-1111-4111-8111-111111111111';
  const tenantB = '22222222-2222-4222-8222-222222222222';
  const staffId = '33333333-3333-4333-8333-333333333333';
  const classId = '44444444-4444-4444-8444-444444444444';
  const subject1Id = '55555555-5555-4555-8555-555555555555';
  const subject2Id = '66666666-6666-4666-8666-666666666666';
  const staleOrphanSubjectId = '77777777-7777-4777-8777-777777777777';

  const mockStaffProfile = {
    id: staffId,
    schoolId: tenantA,
    userId: '11111111-1111-4111-8111-999999999999',
    name: 'John Doe',
    assignedClassId: null,
    customData: {
      assignments: {
        assignedClassId: null,
        assignedSubjectIds: [subject1Id],
        subjectClassIds: []
      }
    }
  };

  const adminActor = {
    id: 'admin-id',
    userId: 'admin-id',
    email: 'admin@school.com',
    systemRole: 'ADMIN'
  };

  beforeEach(() => {
    vi.clearAllMocks();
    staffRepository.findStaffById.mockResolvedValue({ ...mockStaffProfile });
    staffRepository.findStaffByIdForUpdate.mockResolvedValue({ ...mockStaffProfile });
    staffRepository.updateStaffProfile.mockResolvedValue({ ...mockStaffProfile });
    staffRepository.updateUser.mockResolvedValue({});
    prisma.class.findFirst.mockResolvedValue({ id: classId, classTeacherId: null });
    prisma.class.findUnique.mockResolvedValue({ id: classId, classTeacherId: null });
  });

  it('1. A valid single-subject assignment succeeds within current tenant context', async () => {
    prisma.subject.findMany.mockResolvedValue([{ id: subject1Id }]);

    const result = await staffService.assignStaff(
      tenantA,
      staffId,
      { assignedSubjectIds: [subject1Id] },
      adminActor
    );

    expect(prisma.subject.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: [subject1Id] },
        schoolId: tenantA
      },
      select: { id: true }
    });
    expect(staffRepository.updateStaffProfile).toHaveBeenCalled();
    const updateCall = staffRepository.updateStaffProfile.mock.calls[0];
    expect(updateCall[0]).toBe(tenantA);
    expect(updateCall[1]).toBe(staffId);
    expect(updateCall[2].customData.assignments.assignedSubjectIds).toEqual([subject1Id]);
  });

  it('2. A valid multi-subject assignment succeeds and deduplicates submitted IDs', async () => {
    prisma.subject.findMany.mockResolvedValue([
      { id: subject1Id },
      { id: subject2Id }
    ]);

    const result = await staffService.assignStaff(
      tenantA,
      staffId,
      { assignedSubjectIds: [subject1Id, subject2Id, subject1Id] },
      adminActor
    );

    expect(prisma.subject.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: [subject1Id, subject2Id] },
        schoolId: tenantA
      },
      select: { id: true }
    });
    expect(staffRepository.updateStaffProfile).toHaveBeenCalled();
    const updateCall = staffRepository.updateStaffProfile.mock.calls[0];
    expect(updateCall[2].customData.assignments.assignedSubjectIds).toEqual([subject1Id, subject2Id]);
  });

  it('3. Rejects genuinely invalid/orphaned subject IDs with ValidationError', async () => {
    // Subject repository returns only subject1Id; staleOrphanSubjectId does not exist
    prisma.subject.findMany.mockResolvedValue([{ id: subject1Id }]);

    await expect(
      staffService.assignStaff(
        tenantA,
        staffId,
        { assignedSubjectIds: [subject1Id, staleOrphanSubjectId] },
        adminActor
      )
    ).rejects.toThrow(new ValidationError('One or more subject IDs do not exist in the current tenant'));

    expect(staffRepository.updateStaffProfile).not.toHaveBeenCalled();
  });

  it('4. Rejects cross-tenant subject IDs (tenant isolation security invariant)', async () => {
    // Cross-tenant subject ID exists in tenantB, but query is scoped to tenantA so returns empty
    prisma.subject.findMany.mockResolvedValue([]);

    await expect(
      staffService.assignStaff(
        tenantA,
        staffId,
        { assignedSubjectIds: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'] },
        adminActor
      )
    ).rejects.toThrow(new ValidationError('One or more subject IDs do not exist in the current tenant'));

    expect(staffRepository.updateStaffProfile).not.toHaveBeenCalled();
  });

  it('5. Rejects cross-tenant or invalid class IDs for subject classes', async () => {
    prisma.class.findMany.mockResolvedValue([]);
    prisma.section.findMany.mockResolvedValue([]);

    await expect(
      staffService.assignStaff(
        tenantA,
        staffId,
        { subjectClassIds: ['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'] },
        adminActor
      )
    ).rejects.toThrow(new ValidationError('One or more subject class or section IDs do not exist in the current tenant'));

    expect(staffRepository.updateStaffProfile).not.toHaveBeenCalled();
  });

  it('6. Existing class-teacher and subject-class assignments remain functional', async () => {
    prisma.subject.findMany.mockResolvedValue([{ id: subject1Id }]);
    prisma.class.findMany.mockResolvedValue([{ id: classId }]);
    prisma.class.findFirst.mockResolvedValue({ id: classId, classTeacherId: null });
    prisma.class.findUnique.mockResolvedValue({ id: classId, classTeacherId: null });

    const result = await staffService.assignStaff(
      tenantA,
      staffId,
      {
        assignedClassId: classId,
        assignedSubjectIds: [subject1Id],
        subjectClassIds: [classId]
      },
      adminActor
    );

    expect(staffRepository.updateStaffProfile).toHaveBeenCalled();
    const updateCall = staffRepository.updateStaffProfile.mock.calls[0];
    expect(updateCall[2].customData.assignments.assignedSubjectIds).toEqual([subject1Id]);
    expect(updateCall[2].customData.assignments.subjectClassIds).toEqual([classId]);
    expect(updateCall[2].customData.assignments.assignedClassId).toBe(classId);
    expect(staffRepository.updateClassTeacher).toHaveBeenCalledWith(tenantA, classId, staffId, expect.anything());
  });

  it('7. Rejects assignment when tenant context is missing (TenantAccessError)', async () => {
    await expect(
      staffService.assignStaff(
        null,
        staffId,
        { assignedSubjectIds: [subject1Id] },
        adminActor
      )
    ).rejects.toThrow(new TenantAccessError('Tenant context required'));

    expect(staffRepository.findStaffById).not.toHaveBeenCalled();
    expect(staffRepository.updateStaffProfile).not.toHaveBeenCalled();
  });

  it('8. Preserves valid existing assignments when a request fails validation', async () => {
    prisma.subject.findMany.mockResolvedValue([]); // Fails validation

    await expect(
      staffService.assignStaff(
        tenantA,
        staffId,
        { assignedSubjectIds: [staleOrphanSubjectId] },
        adminActor
      )
    ).rejects.toThrow(ValidationError);

    // Profile update was aborted; existing assignments untouched
    expect(staffRepository.updateStaffProfile).not.toHaveBeenCalled();
    expect(mockStaffProfile.customData.assignments.assignedSubjectIds).toEqual([subject1Id]);
  });
});

describe('SD-DEL-001: Staff Directory Deletion & Deactivation Invariants and Security', () => {
  const schoolId = '11111111-1111-4111-8111-111111111111';
  const targetStaffId = '33333333-3333-4333-8333-333333333333';
  const targetUserId = '99999999-9999-4999-8999-999999999999';

  const mockActiveStaff = {
    id: targetStaffId,
    schoolId,
    userId: targetUserId,
    name: 'Jane Doe',
    status: 'Active',
    assignedClassId: null,
    customData: {
      assignments: { assignedClassId: null }
    },
    user: {
      id: targetUserId,
      email: 'jane@school.com',
      isActive: true,
      roleAssignments: []
    }
  };

  const adminActor = {
    id: 'admin-id',
    userId: 'admin-id',
    email: 'admin@school.com',
    systemRole: 'ADMIN'
  };

  beforeEach(() => {
    vi.clearAllMocks();
    staffRepository.findStaffById.mockResolvedValue({ ...mockActiveStaff });
    staffRepository.findStaffByIdForUpdate.mockResolvedValue({ ...mockActiveStaff });
    staffRepository.updateStaffProfile.mockResolvedValue({ ...mockActiveStaff });
    staffRepository.updateUser.mockResolvedValue({});
    staffRepository.deleteStaffProfile.mockResolvedValue({});
    staffRepository.deleteUser.mockResolvedValue({});
    staffRepository.removeUserRoleAssignments.mockResolvedValue({});
    staffRepository.updateClassTeacher.mockResolvedValue({});
    prisma.class.count.mockResolvedValue(0);
    prisma.class.updateMany.mockResolvedValue({ count: 0 });
    authRepository.revokeAllRefreshSessions.mockResolvedValue({ count: 1 });
    RedisCacheService.del.mockResolvedValue(true);
  });

  it('1. Permanent deletion succeeds for a staff member with 0 protected dependencies', async () => {
    staffRepository.countStaffDependencies.mockResolvedValue({
      total: 0,
      lessonPlans: 0,
      payroll: 0,
      chatRooms: 0,
      ptms: 0,
      timetables: 0
    });

    const result = await staffService.deleteStaff(schoolId, targetStaffId, adminActor);

    expect(result).toBeNull();
    expect(staffRepository.findStaffByIdForUpdate).toHaveBeenCalledWith(schoolId, targetStaffId, expect.anything());
    expect(staffRepository.countStaffDependencies).toHaveBeenCalledWith(schoolId, targetStaffId, expect.anything());
    expect(staffRepository.deleteStaffProfile).toHaveBeenCalledWith(schoolId, targetStaffId, expect.anything());
    expect(staffRepository.removeUserRoleAssignments).toHaveBeenCalledWith(targetUserId, expect.anything());
    expect(staffRepository.deleteUser).toHaveBeenCalledWith(targetUserId, expect.anything());
  });

  it('2. Permanent deletion returns ConflictError (409) when payroll history exists', async () => {
    staffRepository.countStaffDependencies.mockResolvedValue({
      total: 2,
      lessonPlans: 0,
      payroll: 2,
      chatRooms: 0,
      ptms: 0,
      timetables: 0
    });

    await expect(
      staffService.deleteStaff(schoolId, targetStaffId, adminActor)
    ).rejects.toThrow(ConflictError);

    await expect(
      staffService.deleteStaff(schoolId, targetStaffId, adminActor)
    ).rejects.toThrow(/payroll record\(s\).*Please deactivate the account instead/);

    expect(staffRepository.deleteStaffProfile).not.toHaveBeenCalled();
    expect(staffRepository.deleteUser).not.toHaveBeenCalled();
  });

  it('3. Permanent deletion returns ConflictError (409) when chat rooms or timetables exist', async () => {
    staffRepository.countStaffDependencies.mockResolvedValue({
      total: 4,
      lessonPlans: 0,
      payroll: 0,
      chatRooms: 1,
      ptms: 0,
      timetables: 3
    });

    await expect(
      staffService.deleteStaff(schoolId, targetStaffId, adminActor)
    ).rejects.toThrow(ConflictError);

    await expect(
      staffService.deleteStaff(schoolId, targetStaffId, adminActor)
    ).rejects.toThrow(/1 chat room\(s\), 3 timetable period\(s\)/);

    expect(staffRepository.deleteStaffProfile).not.toHaveBeenCalled();
    expect(staffRepository.deleteUser).not.toHaveBeenCalled();
  });

  it('4. Deactivation sets status to Inactive, sets user.isActive to false, increments tokenVersion, and revokes refresh sessions', async () => {
    const inactiveStaffProfile = {
      ...mockActiveStaff,
      status: 'Inactive',
      user: {
        ...mockActiveStaff.user,
        isActive: false
      }
    };
    staffRepository.findStaffById
      .mockResolvedValueOnce({ ...mockActiveStaff, status: 'Active' })
      .mockResolvedValueOnce(inactiveStaffProfile);

    await staffService.updateStaff(
      schoolId,
      targetStaffId,
      { status: 'Inactive' },
      adminActor
    );

    expect(staffRepository.updateStaffProfile).toHaveBeenCalledWith(
      schoolId,
      targetStaffId,
      expect.objectContaining({ status: 'Inactive' }),
      expect.anything()
    );

    expect(staffRepository.updateUser).toHaveBeenCalledWith(
      targetUserId,
      expect.objectContaining({
        isActive: false,
        tokenVersion: { increment: 1 }
      }),
      expect.anything()
    );

    expect(authRepository.revokeAllRefreshSessions).toHaveBeenCalledWith(
      targetUserId,
      expect.objectContaining({ tx: expect.anything() })
    );

    expect(RedisCacheService.del).toHaveBeenCalledWith(`rbac:perms:${schoolId}:${targetUserId}`);
  });

  it('5. Deactivation unassigns active class-teacher responsibilities while preserving custom data history', async () => {
    const staffWithClass = {
      ...mockActiveStaff,
      status: 'Active',
      assignedClassId: 'class-123',
      customData: {
        assignments: { assignedClassId: 'class-123' },
        payrollHistory: [{ month: 'Jan', amount: 5000 }]
      }
    };
    staffRepository.findStaffById
      .mockResolvedValueOnce(staffWithClass)
      .mockResolvedValueOnce({
        ...staffWithClass,
        status: 'Inactive',
        assignedClassId: null
      });
    staffRepository.findStaffByIdForUpdate.mockResolvedValue(staffWithClass);

    await staffService.updateStaff(
      schoolId,
      targetStaffId,
      { status: 'Inactive' },
      adminActor
    );

    expect(staffRepository.updateClassTeacher).toHaveBeenCalledWith(
      schoolId,
      'class-123',
      null,
      expect.anything()
    );
    expect(staffRepository.updateStaffProfile).toHaveBeenCalledWith(
      schoolId,
      targetStaffId,
      expect.objectContaining({
        status: 'Inactive'
      }),
      expect.anything()
    );
  });

  it('6. Reactivation restores account activity according to existing policy', async () => {
    const currentlyInactiveStaff = {
      ...mockActiveStaff,
      status: 'Inactive',
      user: { ...mockActiveStaff.user, isActive: false }
    };
    staffRepository.findStaffById
      .mockResolvedValueOnce(currentlyInactiveStaff)
      .mockResolvedValueOnce({
        ...currentlyInactiveStaff,
        status: 'Active',
        user: { ...currentlyInactiveStaff.user, isActive: true }
      });
    staffRepository.findStaffByIdForUpdate.mockResolvedValue(currentlyInactiveStaff);

    await staffService.updateStaff(
      schoolId,
      targetStaffId,
      { status: 'Active' },
      adminActor
    );

    expect(staffRepository.updateStaffProfile).toHaveBeenCalledWith(
      schoolId,
      targetStaffId,
      expect.objectContaining({ status: 'Active' }),
      expect.anything()
    );

    expect(staffRepository.updateUser).toHaveBeenCalledWith(
      targetUserId,
      expect.objectContaining({ isActive: true }),
      expect.anything()
    );

    // Refresh sessions are NOT revoked upon reactivation (only on deactivation)
    expect(authRepository.revokeAllRefreshSessions).not.toHaveBeenCalled();

    // Cache is cleared on status change
    expect(RedisCacheService.del).toHaveBeenCalledWith(`rbac:perms:${schoolId}:${targetUserId}`);
  });

  it('7. Enforces tenant isolation for deletion and deactivation (TenantAccessError)', async () => {
    await expect(
      staffService.deleteStaff(null, targetStaffId, adminActor)
    ).rejects.toThrow(TenantAccessError);

    await expect(
      staffService.updateStaff(null, targetStaffId, { status: 'Inactive' }, adminActor)
    ).rejects.toThrow(TenantAccessError);

    expect(staffRepository.deleteStaffProfile).not.toHaveBeenCalled();
    expect(staffRepository.updateStaffProfile).not.toHaveBeenCalled();
  });

  it('8. Transaction rollback: failure of session revocation aborts deactivation cleanly', async () => {
    authRepository.revokeAllRefreshSessions.mockRejectedValueOnce(
      new Error('Redis/DB connection failed during session revocation')
    );

    await expect(
      staffService.updateStaff(
        schoolId,
        targetStaffId,
        { status: 'Inactive' },
        adminActor
      )
    ).rejects.toThrow('Redis/DB connection failed during session revocation');
  });
});

