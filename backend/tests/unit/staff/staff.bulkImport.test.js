import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as staffService from '../../../src/modules/staff/staff.service.js';
import * as staffRepository from '../../../src/modules/staff/staff.repository.js';
import * as auditRepository from '../../../src/modules/audit/audit.repository.js';
import { prisma, basePrisma } from '../../../src/database/prisma.client.js';

vi.mock('../../../src/modules/staff/staff.repository.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    createUser: vi.fn(),
    createStaffProfile: vi.fn(),
    updateStaffProfile: vi.fn(),
    updateUser: vi.fn(),
    removeUserRoleAssignments: vi.fn(),
    assignUserRole: vi.fn(),
    findStaffById: vi.fn()
  };
});

vi.mock('../../../src/modules/audit/audit.repository.js', () => ({
  createAuditLog: vi.fn().mockResolvedValue(true),
  logAuditEvent: vi.fn().mockResolvedValue(true)
}));

vi.mock('../../../src/database/prisma.client.js', () => {
  const mockPrisma = {
    $transaction: vi.fn(async (cb) => cb(mockPrisma)),
    user: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn()
    },
    staffProfile: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn()
    },
    schoolRole: {
      findMany: vi.fn(),
      findFirst: vi.fn()
    },
    userRoleAssignment: {
      deleteMany: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn()
    },
    classTeacherAssignment: {
      deleteMany: vi.fn(),
      create: vi.fn()
    },
    staffSubjectAssignment: {
      deleteMany: vi.fn(),
      createMany: vi.fn()
    }
  };
  return {
    prisma: mockPrisma,
    basePrisma: {
      $transaction: vi.fn(async (cb) => cb(mockPrisma))
    }
  };
});

describe('Staff Service - High-Performance Bulk Import', () => {
  const schoolId = 'school-123';
  const actor = { id: 'admin-1', role: 'SchoolAdmin' };

  beforeEach(() => {
    vi.clearAllMocks();
    auditRepository.createAuditLog.mockResolvedValue(true);
  });

  it('should process new staff creations and existing staff updates in batch', async () => {
    const rawStaffList = [
      {
        firstName: 'Alice',
        lastName: 'Smith',
        email: 'alice@school.com',
        employeeId: 'EMP001',
        designation: 'Teacher',
        staffType: 'teaching'
      },
      {
        firstName: 'Bob',
        lastName: 'Jones',
        email: 'bob@school.com',
        employeeId: 'EMP002',
        designation: 'Accountant',
        staffType: 'non-teaching'
      }
    ];

    prisma.schoolRole.findMany.mockResolvedValue([
      { id: 'role-teacher', name: 'Teacher', slug: 'teacher', isSystemRole: true },
      { id: 'role-staff', name: 'Staffs', slug: 'staffs', isSystemRole: true }
    ]);

    prisma.user.findMany.mockResolvedValue([
      {
        id: 'user-bob',
        email: 'bob@school.com',
        schoolId,
        staffProfile: { id: 'staff-bob', employeeId: 'EMP002', schoolId }
      }
    ]);

    prisma.staffProfile.findMany.mockResolvedValue([
      { id: 'staff-bob', employeeId: 'EMP002', schoolId, userId: 'user-bob' }
    ]);

    staffRepository.createUser.mockResolvedValue({
      id: 'user-alice',
      email: 'alice@school.com',
      schoolId
    });

    staffRepository.createStaffProfile.mockResolvedValue({
      id: 'staff-alice',
      schoolId,
      userId: 'user-alice',
      employeeId: 'EMP001',
      staffType: 'TEACHING'
    });

    staffRepository.findStaffById.mockImplementation(async (schoolId, id) => {
      if (id === 'staff-alice') {
        return {
          id: 'staff-alice',
          schoolId,
          user: {
            id: 'user-alice',
            email: 'alice@school.com',
            name: 'Alice Smith',
            roleAssignments: [{ schoolRoleId: 'role-teacher', schoolRole: { name: 'Teacher' } }]
          }
        };
      }
      return {
        id: 'staff-bob',
        schoolId,
        user: {
          id: 'user-bob',
          email: 'bob@school.com',
          name: 'Bob Jones',
          roleAssignments: [{ schoolRoleId: 'role-staff', schoolRole: { name: 'Staffs' } }]
        }
      };
    });

    const result = await staffService.bulkImportStaff(schoolId, rawStaffList, actor);

    expect(result.totalProcessed).toBe(2);
    expect(result.createdCount).toBe(1);
    expect(result.updatedCount).toBe(1);
    expect(result.failedCount).toBe(0);
    expect(staffRepository.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'alice@school.com' }),
      expect.anything()
    );
    expect(staffRepository.createStaffProfile).toHaveBeenCalledWith(
      expect.objectContaining({ employeeId: 'EMP001' }),
      expect.anything()
    );
    expect(staffRepository.updateStaffProfile).toHaveBeenCalledWith(
      schoolId,
      'staff-bob',
      expect.objectContaining({ designation: 'Accountant' }),
      expect.anything()
    );
  });
});
