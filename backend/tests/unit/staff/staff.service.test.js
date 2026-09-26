import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as staffService from '../../../src/modules/staff/staff.service.js';
import * as staffRepository from '../../../src/modules/staff/staff.repository.js';
import * as auditRepository from '../../../src/modules/audit/audit.repository.js';
import { prisma } from '../../../src/database/prisma.client.js';
import {
  NotFoundError,
  ConflictError,
  TenantAccessError,
  ValidationError
} from '../../../src/utils/app-error.js';

vi.mock('../../../src/modules/staff/staff.repository.js');
vi.mock('../../../src/modules/audit/audit.repository.js');
vi.mock('../../../src/database/prisma.client.js', () => {
  const mockPrisma = {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn()
    },

    schoolRole: {
      findFirst: vi.fn()
    },
    class: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn()
    },

    subject: {
      findMany: vi.fn()
    },
    staffProfile: {
      update: vi.fn()
    },
    $transaction: vi.fn(async (cb) => cb(mockPrisma))
  };
  return { prisma: mockPrisma };
});

describe('Unit: Staff Service Layer — Phase 4C.4', () => {
  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
  const STAFF_ID = '22222222-2222-4222-8222-222222222222';
  const USER_ID = '33333333-3333-4333-8333-333333333333';
  const CLASS_ID = '44444444-4444-4444-8444-444444444444';
  const ROLE_ID = '55555555-5555-4555-8555-555555555555';
  const SUBJECT_ID = '66666666-6666-4666-8666-666666666666';

  const ACTOR_ADMIN = {
    userId: '77777777-7777-4777-8777-777777777777',
    email: 'admin@school.edu',
    systemRole: 'SCHOOL_ADMIN'
  };

  const ACTOR_TEACHER = {
    userId: USER_ID,
    email: 'teacher@school.edu',
    systemRole: 'TEACHER',
    permissions: ['staff:read']
  };

  const mockStaff = {
    id: STAFF_ID,
    schoolId: SCHOOL_ID,
    userId: USER_ID,
    name: 'Robert Doe',
    employeeId: 'EMP-001',
    staffType: 'teaching',
    designation: 'Senior Teacher',
    phone: '9876543210',
    email: 'robert.doe@school.edu',
    assignedClassId: null,
    baseSalary: 50000,
    status: 'Active',
    createdAt: new Date('2026-09-10'),
    updatedAt: new Date('2026-09-10'),
    user: {
      id: USER_ID,
      email: 'robert.doe@school.edu',
      systemRole: 'TEACHER',
      isActive: true,
      tokenVersion: 1,
      roleAssignments: [
        {
          id: 'assign-1',
          schoolRoleId: ROLE_ID,
          schoolRole: { id: ROLE_ID, name: 'Staffs', slug: 'staffs' }
        }
      ]
    },
    assignedClass: null,
    headedClasses: [],
    customData: {
      firstName: 'Robert',
      lastName: 'Doe',
      gender: 'Male',
      dob: '1990-01-01',
      financial: {
        panNumber: 'ABCDE1234F',
        bankAccountNumber: '123456789'
      },
      assignments: {
        assignedSubjectIds: [SUBJECT_ID],
        subjectClassIds: [CLASS_ID]
      }
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
    staffRepository.findStaffById.mockResolvedValue(mockStaff);
    staffRepository.findStaffByUserId.mockResolvedValue(mockStaff);
    staffRepository.findStaffByEmployeeId.mockResolvedValue(null);
    staffRepository.findStaffByEmail.mockResolvedValue(null);
    staffRepository.countStaffDependencies.mockResolvedValue({ total: 0, lessonPlans: 0, payroll: 0, chatRooms: 0, ptms: 0, timetables: 0 });
    auditRepository.createAuditLog.mockResolvedValue({ id: 'audit-id' });
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.schoolRole.findFirst.mockResolvedValue({ id: ROLE_ID, name: 'Staffs' });
    prisma.class.findFirst.mockResolvedValue({ id: CLASS_ID, name: 'Grade 10' });
    prisma.class.findUnique.mockResolvedValue({ id: CLASS_ID, classTeacherId: null });
    prisma.class.count.mockResolvedValue(0);
    prisma.subject.findMany.mockResolvedValue([{ id: SUBJECT_ID }]);
    prisma.class.findMany.mockResolvedValue([{ id: CLASS_ID }]);
  });

  describe('1. listStaff', () => {
    it('returns paginated staff and hides sensitive financial fields for non-privileged requester', async () => {
      staffRepository.findStaff.mockResolvedValue([mockStaff]);
      staffRepository.countStaff.mockResolvedValue(1);

      const result = await staffService.listStaff(SCHOOL_ID, { page: 1, limit: 20 }, ACTOR_TEACHER);
      expect(result.staff).toHaveLength(1);
      expect(result.staff[0].name).toBe('Robert Doe');
      expect(result.staff[0].baseSalary).toBeUndefined();
      expect(result.staff[0].financial).toBeUndefined();
      expect(result.pagination.total).toBe(1);
    });

    it('exposes baseSalary and financial fields for privileged SCHOOL_ADMIN requester', async () => {
      staffRepository.findStaff.mockResolvedValue([mockStaff]);
      staffRepository.countStaff.mockResolvedValue(1);

      const result = await staffService.listStaff(SCHOOL_ID, { page: 1, limit: 20 }, ACTOR_ADMIN);
      expect(result.staff[0].baseSalary).toBe(50000);
      expect(result.staff[0].financial).toBeDefined();
      expect(result.staff[0].financial.panNumber).toBe('ABCDE1234F');
    });

    it('throws TenantAccessError when schoolId is missing', async () => {
      await expect(staffService.listStaff(null)).rejects.toThrow(TenantAccessError);
    });
  });

  describe('2. getStaffById', () => {
    it('returns staff profile by ID', async () => {
      const result = await staffService.getStaffById(SCHOOL_ID, STAFF_ID, ACTOR_ADMIN);
      expect(result.id).toBe(STAFF_ID);
      expect(result.email).toBe('robert.doe@school.edu');
    });

    it('throws NotFoundError when staff member does not exist', async () => {
      staffRepository.findStaffById.mockResolvedValue(null);
      await expect(staffService.getStaffById(SCHOOL_ID, 'nonexistent')).rejects.toThrow(NotFoundError);
    });
  });

  describe('3. getStaffMe', () => {
    it('returns self-service view including financial fields', async () => {
      const result = await staffService.getStaffMe(SCHOOL_ID, USER_ID);
      expect(result.id).toBe(STAFF_ID);
      expect(result.baseSalary).toBe(50000);
      expect(result.financial.panNumber).toBe('ABCDE1234F');
    });

    it('throws NotFoundError when user has no linked staff profile', async () => {
      staffRepository.findStaffByUserId.mockResolvedValue(null);
      await expect(staffService.getStaffMe(SCHOOL_ID, 'other-user')).rejects.toThrow(NotFoundError);
    });
  });

  describe('4. createStaff', () => {
    it('creates User + StaffProfile + Role assignment atomically', async () => {
      staffRepository.createUser.mockResolvedValue({ id: USER_ID, email: 'new.teacher@school.edu' });
      staffRepository.createStaffProfile.mockResolvedValue({ id: 'new-staff-id', name: 'New Teacher' });
      staffRepository.findStaffById.mockResolvedValue({
        ...mockStaff,
        id: 'new-staff-id',
        name: 'New Teacher',
        email: 'new.teacher@school.edu'
      });

      const payload = {
        firstName: 'New',
        lastName: 'Teacher',
        email: 'new.teacher@school.edu',
        phone: '9999999999',
        employeeId: 'EMP-999',
        staffType: 'teaching',
        roleId: ROLE_ID
      };

      const result = await staffService.createStaff(SCHOOL_ID, payload, ACTOR_ADMIN);
      expect(result.name).toBe('New Teacher');
      expect(staffRepository.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'new.teacher@school.edu',
          systemRole: 'TEACHER',
          passwordHash: '!LOCKED_NO_PASSWORD_SET'
        }),
        expect.anything()
      );
      expect(auditRepository.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actionPerformed: 'CREATE_STAFF: New Teacher'
        })
      );
    });

    it('rejects duplicate email with ConflictError', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'existing-id', email: 'taken@school.edu' });

      await expect(staffService.createStaff(SCHOOL_ID, {
        firstName: 'Alex',
        email: 'taken@school.edu'
      }, ACTOR_ADMIN)).rejects.toThrow(ConflictError);
    });


    it('rejects duplicate employeeId in current school with ConflictError', async () => {
      staffRepository.findStaffByEmployeeId.mockResolvedValue({ id: 'another-staff', employeeId: 'EMP-001' });

      await expect(staffService.createStaff(SCHOOL_ID, {
        firstName: 'Alex',
        email: 'alex@school.edu',
        employeeId: 'EMP-001'
      }, ACTOR_ADMIN)).rejects.toThrow(ConflictError);
    });
  });

  describe('5. updateStaff', () => {
    it('updates staff details and dispatches UPDATE_STAFF audit log', async () => {
      const updatedStaff = {
        ...mockStaff,
        name: 'Robert J. Doe',
        phone: '9999999999'
      };
      staffRepository.findStaffById
        .mockResolvedValueOnce(mockStaff)
        .mockResolvedValueOnce(updatedStaff);

      const result = await staffService.updateStaff(
        SCHOOL_ID,
        STAFF_ID,
        { firstName: 'Robert J.', phone: '9999999999' },
        ACTOR_ADMIN
      );

      expect(result.name).toBe('Robert J. Doe');
      expect(staffRepository.updateStaffProfile).toHaveBeenCalledWith(
        SCHOOL_ID,
        STAFF_ID,
        expect.objectContaining({ name: 'Robert J. Doe', phone: '9999999999' }),
        expect.anything()
      );
      expect(auditRepository.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actionPerformed: 'UPDATE_STAFF: Robert J. Doe'
        })
      );
    });

    it('handles deactivation by setting isActive=false, bumping tokenVersion, and clearing class teacher assignment', async () => {
      const staffWithClass = {
        ...mockStaff,
        assignedClassId: CLASS_ID
      };
      const updatedStaff = {
        ...staffWithClass,
        status: 'Inactive',
        assignedClassId: null,
        user: { ...mockStaff.user, isActive: false, tokenVersion: 2 }
      };

      staffRepository.findStaffById
        .mockResolvedValueOnce(staffWithClass)
        .mockResolvedValueOnce(updatedStaff);

      await staffService.updateStaff(SCHOOL_ID, STAFF_ID, { status: 'Inactive' }, ACTOR_ADMIN);

      expect(staffRepository.updateUser).toHaveBeenCalledWith(
        USER_ID,
        expect.objectContaining({
          isActive: false,
          tokenVersion: { increment: 1 }
        }),
        expect.anything()
      );
      expect(staffRepository.updateClassTeacher).toHaveBeenCalledWith(
        SCHOOL_ID,
        CLASS_ID,
        null,
        expect.anything()
      );
      expect(auditRepository.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actionPerformed: 'DISABLE_STAFF: Robert Doe'
        })
      );
    });

    it('handles no-op update without writing to database', async () => {
      const result = await staffService.updateStaff(
        SCHOOL_ID,
        STAFF_ID,
        { designation: 'Senior Teacher' },
        ACTOR_ADMIN
      );

      expect(result.name).toBe('Robert Doe');
      expect(staffRepository.updateStaffProfile).not.toHaveBeenCalled();
      expect(auditRepository.createAuditLog).not.toHaveBeenCalled();
    });
  });

  describe('6. assignStaff', () => {
    it('updates class teacher and subject assignments in customData', async () => {
      const updatedStaff = {
        ...mockStaff,
        assignedClassId: CLASS_ID,
        customData: {
          ...mockStaff.customData,
          assignments: {
            assignedSubjectIds: [SUBJECT_ID],
            subjectClassIds: [CLASS_ID]
          }
        }
      };

      staffRepository.findStaffById
        .mockResolvedValueOnce(mockStaff)
        .mockResolvedValueOnce(mockStaff)
        .mockResolvedValueOnce(updatedStaff);

      const result = await staffService.assignStaff(
        SCHOOL_ID,
        STAFF_ID,
        {
          assignedClassId: CLASS_ID,
          assignedSubjectIds: [SUBJECT_ID],
          subjectClassIds: [CLASS_ID]
        },
        ACTOR_ADMIN
      );

      expect(result.assignedClassId).toBe(CLASS_ID);
      expect(staffRepository.updateClassTeacher).toHaveBeenCalledWith(
        SCHOOL_ID,
        CLASS_ID,
        STAFF_ID,
        expect.anything()
      );
    });

    it('rejects assignment if subject ID does not belong to tenant', async () => {
      prisma.subject.findMany.mockResolvedValue([]); // subject not found in tenant

      await expect(staffService.assignStaff(
        SCHOOL_ID,
        STAFF_ID,
        { assignedSubjectIds: ['non-tenant-subject'] },
        ACTOR_ADMIN
      )).rejects.toThrow(ValidationError);
    });
  });

  describe('7. deleteStaff', () => {
    it('deletes staff member when 0 historical dependencies and 0 class assignments exist', async () => {
      staffRepository.findStaffByIdForUpdate.mockResolvedValue({
        id: STAFF_ID,
        school_id: SCHOOL_ID,
        user_id: USER_ID,
        assigned_class_id: null
      });

      await staffService.deleteStaff(SCHOOL_ID, STAFF_ID, ACTOR_ADMIN);

      expect(staffRepository.deleteStaffProfile).toHaveBeenCalledWith(SCHOOL_ID, STAFF_ID, expect.anything());
      expect(staffRepository.removeUserRoleAssignments).toHaveBeenCalledWith(USER_ID, expect.anything());
      expect(staffRepository.deleteUser).toHaveBeenCalledWith(USER_ID, expect.anything());
      expect(auditRepository.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actionPerformed: `DELETE_STAFF: ${STAFF_ID}`
        })
      );
    });

    it('rejects deletion with ConflictError when staff has active class assignment', async () => {
      staffRepository.findStaffByIdForUpdate.mockResolvedValue({
        id: STAFF_ID,
        school_id: SCHOOL_ID,
        user_id: USER_ID,
        assigned_class_id: CLASS_ID
      });

      await expect(staffService.deleteStaff(SCHOOL_ID, STAFF_ID, ACTOR_ADMIN)).rejects.toThrow(ConflictError);
    });

    it('rejects deletion with ConflictError when historical dependencies exist', async () => {
      staffRepository.findStaffByIdForUpdate.mockResolvedValue({
        id: STAFF_ID,
        school_id: SCHOOL_ID,
        user_id: USER_ID,
        assigned_class_id: null
      });
      staffRepository.countStaffDependencies.mockResolvedValue({
        total: 2,
        lessonPlans: 2,
        payroll: 0,
        chatRooms: 0,
        ptms: 0,
        timetables: 0
      });

      await expect(staffService.deleteStaff(SCHOOL_ID, STAFF_ID, ACTOR_ADMIN)).rejects.toThrow(ConflictError);
    });
  });
});
