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

    section: {
      findFirst: vi.fn(),
      findMany: vi.fn()
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

    it('creates staff without class assignment when assignedClassId is null', async () => {
      staffRepository.createUser.mockResolvedValue({ id: USER_ID, email: 'noclass@school.edu' });
      staffRepository.createStaffProfile.mockImplementation(async (data) => ({
        ...mockStaff,
        id: 'new-staff-noclass',
        name: 'No Class Teacher',
        assignedClassId: data.assignedClassId,
        customData: data.customData
      }));

      const payload = {
        firstName: 'No',
        lastName: 'Class',
        email: 'noclass@school.edu',
        assignedClassId: null
      };

      const result = await staffService.createStaff(SCHOOL_ID, payload, ACTOR_ADMIN);
      expect(result.assignedClassId).toBeNull();
      expect(staffRepository.lockClassForUpdate).not.toHaveBeenCalled();
      expect(staffRepository.updateClassTeacher).not.toHaveBeenCalled();
    });

    it('creates staff assigned to class without sections using Class.id', async () => {
      const NURSERY_CLASS_ID = '99999999-9999-4999-8999-999999999999';
      prisma.section.findFirst.mockResolvedValue(null);
      prisma.class.findFirst.mockResolvedValue({ id: NURSERY_CLASS_ID, name: 'Nursery' });
      prisma.class.findUnique.mockResolvedValue({ id: NURSERY_CLASS_ID, classTeacherId: null });

      staffRepository.createUser.mockResolvedValue({ id: USER_ID, email: 'nursery@school.edu' });
      staffRepository.createStaffProfile.mockImplementation(async (data) => ({
        ...mockStaff,
        id: 'staff-nursery',
        name: 'Nursery Teacher',
        assignedClassId: data.assignedClassId,
        customData: data.customData
      }));

      const payload = {
        firstName: 'Nursery',
        lastName: 'Teacher',
        email: 'nursery@school.edu',
        assignedClassId: NURSERY_CLASS_ID
      };

      const result = await staffService.createStaff(SCHOOL_ID, payload, ACTOR_ADMIN);
      expect(result.assignedClassId).toBe(NURSERY_CLASS_ID);
      expect(staffRepository.lockClassForUpdate).toHaveBeenCalledWith(SCHOOL_ID, NURSERY_CLASS_ID, expect.anything());
      expect(staffRepository.updateClassTeacher).toHaveBeenCalledWith(SCHOOL_ID, NURSERY_CLASS_ID, 'staff-nursery', expect.anything());
      expect(staffRepository.createStaffProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          assignedClassId: NURSERY_CLASS_ID,
          customData: expect.objectContaining({
            assignments: expect.objectContaining({
              assignedClassId: NURSERY_CLASS_ID
            })
          })
        }),
        expect.anything()
      );
    });

    it('creates staff assigned to Section 10-A, resolving Section -> parent Class.id while preserving Section.id in customData', async () => {
      const SECTION_10A = 'aaaaaaaa-10aa-4aaa-8aaa-aaaaaaaaaaaa';
      prisma.section.findFirst.mockResolvedValue({ id: SECTION_10A, classId: CLASS_ID });
      prisma.class.findUnique.mockResolvedValue({ id: CLASS_ID, classTeacherId: null });

      staffRepository.createUser.mockResolvedValue({ id: USER_ID, email: 'section10a@school.edu' });
      staffRepository.createStaffProfile.mockImplementation(async (data) => ({
        ...mockStaff,
        id: 'staff-10a',
        name: 'Teacher 10A',
        assignedClassId: data.assignedClassId,
        customData: data.customData
      }));

      const payload = {
        firstName: 'Teacher',
        lastName: '10A',
        email: 'section10a@school.edu',
        assignedClassId: SECTION_10A
      };

      const result = await staffService.createStaff(SCHOOL_ID, payload, ACTOR_ADMIN);
      expect(result.assignedClassId).toBe(SECTION_10A);
      expect(result.assignments.assignedClassId).toBe(SECTION_10A);
      expect(staffRepository.createStaffProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          assignedClassId: CLASS_ID,
          customData: expect.objectContaining({
            assignments: expect.objectContaining({
              assignedClassId: SECTION_10A
            })
          })
        }),
        expect.anything()
      );
      expect(staffRepository.lockClassForUpdate).toHaveBeenCalledWith(SCHOOL_ID, CLASS_ID, expect.anything());
      expect(staffRepository.updateClassTeacher).toHaveBeenCalledWith(SCHOOL_ID, CLASS_ID, 'staff-10a', expect.anything());
    });

    it('creates staff assigned to Section 10-B independently from Section 10-A', async () => {
      const SECTION_10B = 'bbbbbbbb-10bb-4bbb-8bbb-bbbbbbbbbbbb';
      prisma.section.findFirst.mockResolvedValue({ id: SECTION_10B, classId: CLASS_ID });
      prisma.class.findUnique.mockResolvedValue({ id: CLASS_ID, classTeacherId: null });

      staffRepository.createUser.mockResolvedValue({ id: USER_ID, email: 'section10b@school.edu' });
      staffRepository.createStaffProfile.mockImplementation(async (data) => ({
        ...mockStaff,
        id: 'staff-10b',
        name: 'Teacher 10B',
        assignedClassId: data.assignedClassId,
        customData: data.customData
      }));

      const payload = {
        firstName: 'Teacher',
        lastName: '10B',
        email: 'section10b@school.edu',
        assignedClassId: SECTION_10B
      };

      const result = await staffService.createStaff(SCHOOL_ID, payload, ACTOR_ADMIN);
      expect(result.assignedClassId).toBe(SECTION_10B);
      expect(result.assignments.assignedClassId).toBe(SECTION_10B);
    });

    it('rejects creation when assignedClassId does not exist in school with ValidationError', async () => {
      const NON_EXISTENT_ID = '00000000-0000-4000-8000-000000000000';
      prisma.section.findFirst.mockResolvedValue(null);
      prisma.class.findFirst.mockResolvedValue(null);

      await expect(staffService.createStaff(SCHOOL_ID, {
        firstName: 'Ghost',
        email: 'ghost@school.edu',
        assignedClassId: NON_EXISTENT_ID
      }, ACTOR_ADMIN)).rejects.toThrow(ValidationError);
    });

    it('rejects creation when assignedClassId belongs to a different school (cross-tenant)', async () => {
      const CROSS_TENANT_CLASS_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
      prisma.section.findFirst.mockResolvedValue(null);
      prisma.class.findFirst.mockResolvedValue(null);

      await expect(staffService.createStaff(SCHOOL_ID, {
        firstName: 'Intruder',
        email: 'intruder@school.edu',
        assignedClassId: CROSS_TENANT_CLASS_ID
      }, ACTOR_ADMIN)).rejects.toThrow('Assigned class or section does not exist in the current school');
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

    it('accepts section IDs in subjectClassIds and resolves section for class teacher', async () => {
      const SECTION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
      const mockStaffWithCustom = {
        ...mockStaff,
        customData: {
          assignments: {
            assignedClassId: SECTION_ID,
            assignedSubjectIds: [SUBJECT_ID],
            subjectClassIds: [SECTION_ID]
          }
        }
      };

      prisma.subject.findMany.mockResolvedValue([{ id: SUBJECT_ID }]);
      prisma.class.findMany.mockResolvedValue([]);
      prisma.section.findMany.mockResolvedValue([{ id: SECTION_ID }]);
      prisma.section.findFirst.mockResolvedValue({ id: SECTION_ID, classId: CLASS_ID });

      staffRepository.findStaffById
        .mockResolvedValueOnce(mockStaff)
        .mockResolvedValueOnce(mockStaff)
        .mockResolvedValueOnce(mockStaffWithCustom);

      const result = await staffService.assignStaff(
        SCHOOL_ID,
        STAFF_ID,
        {
          assignedClassId: SECTION_ID,
          assignedSubjectIds: [SUBJECT_ID],
          subjectClassIds: [SECTION_ID]
        },
        ACTOR_ADMIN
      );

      expect(result.assignedClassId).toBe(SECTION_ID);
      expect(result.assignments.subjectClassIds).toEqual([SECTION_ID]);
      expect(staffRepository.updateClassTeacher).toHaveBeenCalledWith(
        SCHOOL_ID,
        CLASS_ID,
        STAFF_ID,
        expect.anything()
      );
    });

    it('rejects assignment if section ID does not belong to tenant', async () => {
      const FOREIGN_SECTION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
      prisma.subject.findMany.mockResolvedValue([]);
      prisma.class.findMany.mockResolvedValue([]);
      prisma.section.findMany.mockResolvedValue([]);

      await expect(staffService.assignStaff(
        SCHOOL_ID,
        STAFF_ID,
        { subjectClassIds: [FOREIGN_SECTION_ID] },
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

  describe('serializeStaff and Staff Registration State Lifecycle', () => {
    it('marks isRegistered as true when user has a valid bcrypt password hash', () => {
      const staff = {
        id: STAFF_ID,
        schoolId: SCHOOL_ID,
        userId: USER_ID,
        name: 'Registered Teacher',
        user: {
          id: USER_ID,
          email: 'teacher@school.edu',
          passwordHash: '$2b$10$abcdefghijklmnopqrstuvwxyz1234567890ABCDEF',
          systemRole: 'TEACHER',
          isActive: true,
          roleAssignments: []
        }
      };

      const serialized = staffService.serializeStaff(staff);
      expect(serialized.isRegistered).toBe(true);
      expect(serialized.user.isRegistered).toBe(true);
      expect(serialized.user.passwordHash).toBeUndefined();
      expect(serialized.passwordHash).toBeUndefined();
    });

    it('marks isRegistered as false when user has a locked/unregistered password marker', () => {
      const staff = {
        id: STAFF_ID,
        schoolId: SCHOOL_ID,
        userId: USER_ID,
        name: 'Unregistered Teacher',
        user: {
          id: USER_ID,
          email: 'newteacher@school.edu',
          passwordHash: '!LOCKED_NO_PASSWORD_SET',
          systemRole: 'TEACHER',
          isActive: true,
          roleAssignments: []
        }
      };

      const serialized = staffService.serializeStaff(staff);
      expect(serialized.isRegistered).toBe(false);
      expect(serialized.user.isRegistered).toBe(false);
      expect(serialized.user.passwordHash).toBeUndefined();
    });

    it('marks isRegistered as false when user has no passwordHash or user is missing', () => {
      const staffWithoutHash = {
        id: STAFF_ID,
        schoolId: SCHOOL_ID,
        userId: USER_ID,
        name: 'Teacher Without Hash',
        user: {
          id: USER_ID,
          email: 'nohash@school.edu',
          systemRole: 'TEACHER',
          isActive: true
        }
      };
      expect(staffService.serializeStaff(staffWithoutHash).isRegistered).toBe(false);

      const staffWithoutUser = {
        id: STAFF_ID,
        schoolId: SCHOOL_ID,
        userId: null,
        name: 'Teacher Without User',
        user: null
      };
      expect(staffService.serializeStaff(staffWithoutUser).isRegistered).toBe(false);
      expect(staffService.serializeStaff(null)).toBeNull();
    });

    it('listStaff returns isRegistered true for registered staff and false for unregistered staff without leaking passwordHash', async () => {
      const registeredStaff = {
        id: 'staff-registered-1',
        schoolId: SCHOOL_ID,
        userId: 'user-reg-1',
        name: 'Arul Jothi',
        email: 'arul@school.com',
        user: {
          id: 'user-reg-1',
          email: 'arul@school.com',
          passwordHash: '$2b$10$validBcryptHashForArulJothi1234567890',
          systemRole: 'TEACHER',
          isActive: true,
          tokenVersion: 1
        }
      };

      const unregisteredStaff = {
        id: 'staff-unregistered-2',
        schoolId: SCHOOL_ID,
        userId: 'user-unreg-2',
        name: 'Priyanka S',
        email: 'priyanka@school.com',
        user: {
          id: 'user-unreg-2',
          email: 'priyanka@school.com',
          passwordHash: '!LOCKED_NO_PASSWORD_SET',
          systemRole: 'TEACHER',
          isActive: true,
          tokenVersion: 0
        }
      };

      staffRepository.findStaff.mockResolvedValue([registeredStaff, unregisteredStaff]);
      staffRepository.countStaff.mockResolvedValue(2);

      const result = await staffService.listStaff(SCHOOL_ID, {}, ACTOR_ADMIN);

      expect(result.staff).toHaveLength(2);
      expect(result.staff[0].name).toBe('Arul Jothi');
      expect(result.staff[0].isRegistered).toBe(true);
      expect(result.staff[0].user.isRegistered).toBe(true);
      expect(result.staff[0].user).not.toHaveProperty('passwordHash');

      expect(result.staff[1].name).toBe('Priyanka S');
      expect(result.staff[1].isRegistered).toBe(false);
      expect(result.staff[1].user.isRegistered).toBe(false);
      expect(result.staff[1].user).not.toHaveProperty('passwordHash');
    });
  });
});

