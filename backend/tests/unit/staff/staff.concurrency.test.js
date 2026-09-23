import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as staffService from '../../../src/modules/staff/staff.service.js';
import * as staffRepository from '../../../src/modules/staff/staff.repository.js';
import { prisma } from '../../../src/database/prisma.client.js';
import { ConflictError } from '../../../src/utils/app-error.js';

vi.mock('../../../src/modules/staff/staff.repository.js');
vi.mock('../../../src/modules/audit/audit.repository.js');
vi.mock('../../../src/database/prisma.client.js', () => {
  const mockPrisma = {
    user: {
      findUnique: vi.fn(),
      create: vi.fn()
    },
    schoolRole: {
      findFirst: vi.fn()
    },
    class: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn()
    },
    staffProfile: {
      update: vi.fn()
    },
    $transaction: vi.fn(async (cb) => cb(mockPrisma))
  };
  return { prisma: mockPrisma };
});

describe('Unit: Staff Concurrency & Constraint Safety — Phase 4C.4', () => {
  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
  const STAFF_ID = '22222222-2222-4222-8222-222222222222';
  const ACTOR = { userId: 'admin-1', email: 'admin@school.edu', systemRole: 'SCHOOL_ADMIN' };

  beforeEach(() => {
    vi.clearAllMocks();
    staffRepository.findStaffByEmployeeId.mockResolvedValue(null);
    staffRepository.findStaffByEmail.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue(null);
  });

  it('catches Prisma P2002 duplicate employee ID race condition and maps to clean ConflictError', async () => {
    const p2002Error = new Error('Unique constraint failed on the fields: (`school_id`,`employee_id`)');
    p2002Error.code = 'P2002';
    p2002Error.meta = { target: ['school_id', 'employee_id'] };

    staffRepository.createUser.mockResolvedValue({ id: 'user-1' });
    staffRepository.createStaffProfile.mockRejectedValue(p2002Error);

    await expect(
      staffService.createStaff(
        SCHOOL_ID,
        {
          firstName: 'Robert',
          email: 'robert@school.edu',
          employeeId: 'EMP-DUPLICATE'
        },
        ACTOR
      )
    ).rejects.toThrow(ConflictError);
  });

  it('catches Prisma P2002 duplicate user email race condition and maps to clean ConflictError', async () => {
    const p2002Error = new Error('Unique constraint failed on the fields: (`email`)');
    p2002Error.code = 'P2002';
    p2002Error.meta = { target: ['email'] };

    staffRepository.createUser.mockRejectedValue(p2002Error);

    await expect(
      staffService.createStaff(
        SCHOOL_ID,
        {
          firstName: 'Jane',
          email: 'jane@school.edu'
        },
        ACTOR
      )
    ).rejects.toThrow(ConflictError);
  });

  it('guarantees atomic rollback if class teacher assignment fails during staff creation', async () => {
    staffRepository.createUser.mockResolvedValue({ id: 'user-1' });
    staffRepository.createStaffProfile.mockResolvedValue({ id: STAFF_ID, name: 'Teacher' });
    staffRepository.updateClassTeacher.mockRejectedValue(new Error('Database write failure on class'));

    prisma.class.findFirst.mockResolvedValue({ id: 'class-1' });
    prisma.class.findUnique.mockResolvedValue({ id: 'class-1', classTeacherId: null });

    await expect(
      staffService.createStaff(
        SCHOOL_ID,
        {
          firstName: 'Teacher',
          email: 'teacher@school.edu',
          assignedClassId: 'class-1'
        },
        ACTOR
      )
    ).rejects.toThrow('Database write failure on class');
  });
});
