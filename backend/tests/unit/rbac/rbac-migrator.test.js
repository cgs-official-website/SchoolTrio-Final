import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RbacMigrator } from '../../../src/migration/rbac-migrator.js';

describe('RbacMigrator Unit Tests (rbac-migrator.js)', () => {
  const TENANT_UUID = '11111111-1111-4111-8111-111111111111';
  const USER_UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const ROLE_UUID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  const mockSchool = {
    id: TENANT_UUID,
    code: 'SchoolS024',
    name: 'Spring Mount Public School',
    legacyFirestoreId: 'SchoolS024'
  };

  const mockUser = {
    id: USER_UUID,
    schoolId: TENANT_UUID,
    email: 'teacher@springmount.edu',
    legacyFirestoreId: 'firebase_teacher_uid_123'
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('Dry-Run Mode: Calculates migration metrics with ZERO database writes', async () => {
    const mockPrisma = {
      school: {
        findFirst: vi.fn().mockResolvedValue(mockSchool)
      },
      schoolRole: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn()
      },
      rolePermission: {
        createMany: vi.fn(),
        upsert: vi.fn()
      },
      user: {
        findMany: vi.fn().mockResolvedValue([mockUser])
      },
      userRoleAssignment: {
        findMany: vi.fn().mockResolvedValue([]),
        upsert: vi.fn()
      },
      $transaction: vi.fn()
    };

    const mockFirestore = {
      collection: vi.fn().mockReturnValue({
        doc: vi.fn().mockReturnValue({
          collection: vi.fn((colName) => {
            if (colName === 'roles') {
              return {
                get: vi.fn().mockResolvedValue({
                  docs: [
                    {
                      id: 'Library',
                      data: () => ({
                        name: 'Library',
                        loginPanel: 'admin',
                        permissions: { library: { read: true, create: true } }
                      })
                    }
                  ]
                })
              };
            }
            if (colName === 'teachers') {
              return {
                get: vi.fn().mockResolvedValue({
                  docs: [
                    {
                      id: 't_001',
                      data: () => ({
                        userId: 'firebase_teacher_uid_123',
                        name: 'Jane Doe',
                        roles: ['Library']
                      })
                    }
                  ]
                })
              };
            }
            return { get: vi.fn().mockResolvedValue({ docs: [] }) };
          })
        })
      })
    };

    const migrator = new RbacMigrator({
      prismaClient: mockPrisma,
      firestoreDb: mockFirestore,
      dryRun: true
    });

    const report = await migrator.migrateTenantRbac('SchoolS024');

    expect(report.isDryRun).toBe(true);
    expect(report.sourceRolesCount).toBe(1);
    expect(report.rolesToCreate).toBe(1);
    expect(report.teachersProcessed).toBe(1);
    expect(report.userAssignmentsToCreate).toBe(1);
    expect(report.unresolvedUsers).toHaveLength(0);
    expect(report.unresolvedRoles).toHaveLength(0);

    // Verify ZERO writes occurred
    expect(mockPrisma.schoolRole.create).not.toHaveBeenCalled();
    expect(mockPrisma.rolePermission.createMany).not.toHaveBeenCalled();
    expect(mockPrisma.userRoleAssignment.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('Identifies UNRESOLVED users when Firebase UID does not match any PostgreSQL User.legacyFirestoreId', async () => {
    const mockPrisma = {
      school: {
        findFirst: vi.fn().mockResolvedValue(mockSchool)
      },
      schoolRole: {
        findMany: vi.fn().mockResolvedValue([{ id: ROLE_UUID, slug: 'library', name: 'Library' }])
      },
      user: {
        findMany: vi.fn().mockResolvedValue([]) // No PostgreSQL users
      },
      userRoleAssignment: {
        findMany: vi.fn().mockResolvedValue([])
      }
    };

    const mockFirestore = {
      collection: vi.fn().mockReturnValue({
        doc: vi.fn().mockReturnValue({
          collection: vi.fn((colName) => {
            if (colName === 'roles') {
              return { get: vi.fn().mockResolvedValue({ docs: [] }) };
            }
            if (colName === 'teachers') {
              return {
                get: vi.fn().mockResolvedValue({
                  docs: [
                    {
                      id: 'orphan_teacher',
                      data: () => ({
                        userId: 'nonexistent_firebase_uid',
                        name: 'Orphan Teacher',
                        roles: ['Library']
                      })
                    }
                  ]
                })
              };
            }
            return { get: vi.fn().mockResolvedValue({ docs: [] }) };
          })
        })
      })
    };

    const migrator = new RbacMigrator({
      prismaClient: mockPrisma,
      firestoreDb: mockFirestore,
      dryRun: true
    });

    const report = await migrator.migrateTenantRbac('SchoolS024');

    expect(report.unresolvedUsers).toHaveLength(1);
    expect(report.unresolvedUsers[0]).toEqual({
      teacherId: 'orphan_teacher',
      firebaseUid: 'nonexistent_firebase_uid',
      name: 'Orphan Teacher',
      email: 'Unknown'
    });
    expect(report.userAssignmentsToCreate).toBe(0);
  });

  it('Idempotent Execution: Detects already mapped roles and assignments', async () => {
    const mockExistingRole = {
      id: ROLE_UUID,
      schoolId: TENANT_UUID,
      name: 'Library',
      slug: 'library',
      permissions: []
    };

    const mockExistingAssignment = {
      id: 'assign_1',
      schoolId: TENANT_UUID,
      userId: USER_UUID,
      schoolRoleId: ROLE_UUID
    };

    const mockPrisma = {
      school: { findFirst: vi.fn().mockResolvedValue(mockSchool) },
      schoolRole: { findMany: vi.fn().mockResolvedValue([mockExistingRole]) },
      user: { findMany: vi.fn().mockResolvedValue([mockUser]) },
      userRoleAssignment: { findMany: vi.fn().mockResolvedValue([mockExistingAssignment]) }
    };

    const mockFirestore = {
      collection: vi.fn().mockReturnValue({
        doc: vi.fn().mockReturnValue({
          collection: vi.fn((colName) => {
            if (colName === 'roles') {
              return {
                get: vi.fn().mockResolvedValue({
                  docs: [{ id: 'Library', data: () => ({ name: 'Library', permissions: {} }) }]
                })
              };
            }
            if (colName === 'teachers') {
              return {
                get: vi.fn().mockResolvedValue({
                  docs: [{ id: 't_001', data: () => ({ userId: 'firebase_teacher_uid_123', roles: ['Library'] }) }]
                })
              };
            }
            return { get: vi.fn().mockResolvedValue({ docs: [] }) };
          })
        })
      })
    };

    const migrator = new RbacMigrator({
      prismaClient: mockPrisma,
      firestoreDb: mockFirestore,
      dryRun: true
    });

    const report = await migrator.migrateTenantRbac('SchoolS024');

    expect(report.rolesAlreadyMapped).toBe(1);
    expect(report.rolesToCreate).toBe(0);
    expect(report.userAssignmentsAlreadyMapped).toBe(1);
    expect(report.userAssignmentsToCreate).toBe(0);
  });
});
