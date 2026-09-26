import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as parentService from '../../../src/modules/parents/parent.service.js';
import * as parentRepository from '../../../src/modules/parents/parent.repository.js';
import * as auditRepository from '../../../src/modules/audit/audit.repository.js';
import { prisma } from '../../../src/database/prisma.client.js';
import {
  NotFoundError,
  ConflictError,
  TenantAccessError
} from '../../../src/utils/app-error.js';

vi.mock('../../../src/modules/parents/parent.repository.js');
vi.mock('../../../src/modules/audit/audit.repository.js');
vi.mock('../../../src/database/prisma.client.js', () => {
  const mockPrisma = {
    student: {
      findFirst: vi.fn()
    },
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn()
    },

    parentProfile: {
      create: vi.fn()
    },
    parentStudentLink: {
      create: vi.fn()
    },
    school: {
      findUnique: vi.fn()
    },
    $transaction: vi.fn(async (cb) => cb(mockPrisma))
  };
  return { prisma: mockPrisma };
});

describe('Unit: Parent Service Layer — Phase 4C.3-B', () => {
  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
  const PARENT_ID = '22222222-2222-4222-8222-222222222222';
  const USER_ID = '33333333-3333-4333-8333-333333333333';
  const STUDENT_ID = '44444444-4444-4444-8444-444444444444';

  const ACTOR = {
    userId: '55555555-5555-4555-8555-555555555555',
    email: 'admin@school.edu',
    systemRole: 'SCHOOL_ADMIN'
  };

  const mockParent = {
    id: PARENT_ID,
    schoolId: SCHOOL_ID,
    userId: USER_ID,
    name: 'Robert Doe',
    phone: '9876543210',
    email: 'robert.doe@example.com',
    address: '123 Main St',
    emergencyContact: '9876543211',
    user: {
      id: USER_ID,
      email: 'robert.doe@example.com',
      systemRole: 'PARENT',
      isActive: true,
      tokenVersion: 1
    },
    children: []
  };

  const mockStudent = {
    id: STUDENT_ID,
    schoolId: SCHOOL_ID,
    firstName: 'John',
    lastName: 'Doe',
    admissionNumber: 'ADM-101'
  };

  beforeEach(() => {
    vi.clearAllMocks();
    parentRepository.findParentById.mockResolvedValue(mockParent);
    parentRepository.findParentByEmail.mockResolvedValue(null);
    parentRepository.findParentByPhone.mockResolvedValue(null);
    parentRepository.findParentStudentLink.mockResolvedValue(null);
    auditRepository.createAuditLog.mockResolvedValue({ id: 'audit-id' });
    prisma.student.findFirst.mockResolvedValue(mockStudent);
    prisma.school.findUnique.mockResolvedValue({ code: 'SchoolS024' });
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue(null);
  });


  describe('1. listParents', () => {
    it('returns paginated parents and metadata', async () => {
      parentRepository.findParents.mockResolvedValue([mockParent]);
      parentRepository.countParents.mockResolvedValue(1);

      const result = await parentService.listParents(SCHOOL_ID, { page: 1, limit: 20 });
      expect(result.parents).toEqual([mockParent]);
      expect(result.pagination.total).toBe(1);
    });

    it('throws TenantAccessError when schoolId is missing', async () => {
      await expect(parentService.listParents(null)).rejects.toThrow(TenantAccessError);
    });
  });

  describe('2. getParentById', () => {
    it('returns parent by ID when found in tenant', async () => {
      const result = await parentService.getParentById(SCHOOL_ID, PARENT_ID);
      expect(result).toEqual(mockParent);
    });

    it('throws NotFoundError when parent does not exist', async () => {
      parentRepository.findParentById.mockResolvedValue(null);
      await expect(parentService.getParentById(SCHOOL_ID, 'nonexistent')).rejects.toThrow(NotFoundError);
    });
  });

  describe('3. updateParent', () => {
    it('updates parent profile fields and dispatches UPDATE_PARENT AuditLog', async () => {
      const updatedParent = {
        ...mockParent,
        name: 'Robert J. Doe',
        phone: '9999999999'
      };
      parentRepository.findParentById
        .mockResolvedValueOnce(mockParent)
        .mockResolvedValueOnce(updatedParent);

      const result = await parentService.updateParent(
        SCHOOL_ID,
        PARENT_ID,
        { name: 'Robert J. Doe', phone: '9999999999' },
        ACTOR
      );

      expect(result).toEqual(updatedParent);
      expect(parentRepository.updateParentProfile).toHaveBeenCalledWith(
        SCHOOL_ID,
        PARENT_ID,
        expect.objectContaining({ name: 'Robert J. Doe', phone: '9999999999' }),
        expect.anything()
      );
      expect(auditRepository.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
        entityType: 'ParentProfile',
        actionPerformed: 'UPDATE_PARENT: Robert J. Doe'
      }));
    });

    it('handles deactivation by setting isActive=false and incrementing tokenVersion', async () => {
      const updatedParent = {
        ...mockParent,
        user: { ...mockParent.user, isActive: false, tokenVersion: 2 }
      };
      parentRepository.findParentById
        .mockResolvedValueOnce(mockParent)
        .mockResolvedValueOnce(updatedParent);

      await parentService.updateParent(SCHOOL_ID, PARENT_ID, { isActive: false }, ACTOR);

      expect(parentRepository.updateUser).toHaveBeenCalledWith(
        USER_ID,
        expect.objectContaining({
          isActive: false,
          tokenVersion: { increment: 1 }
        }),
        expect.anything()
      );
      expect(auditRepository.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
        actionPerformed: 'DISABLE_PARENT: Robert Doe'
      }));
    });

    it('handles no-op update without writing to database or AuditLog', async () => {
      const result = await parentService.updateParent(
        SCHOOL_ID,
        PARENT_ID,
        { name: 'Robert Doe', phone: '9876543210' },
        ACTOR
      );

      expect(result).toEqual(mockParent);
      expect(parentRepository.updateParentProfile).not.toHaveBeenCalled();
      expect(auditRepository.createAuditLog).not.toHaveBeenCalled();
    });

    it('rejects email change if new email conflicts globally with another user', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'another-user-id', email: 'taken@example.com' });

      await expect(parentService.updateParent(

        SCHOOL_ID,
        PARENT_ID,
        { email: 'taken@example.com' },
        ACTOR
      )).rejects.toThrow(ConflictError);
    });
  });

  describe('4. getStudentParents', () => {
    it('returns parents linked to a student for admin/staff', async () => {
      const mockLinks = [{ id: 'link-1', parentProfileId: PARENT_ID, relationship: 'Father', parent: mockParent }];
      parentRepository.findStudentParents.mockResolvedValue(mockLinks);

      const result = await parentService.getStudentParents(SCHOOL_ID, STUDENT_ID, ACTOR);
      expect(result).toEqual(mockLinks);
    });

    it('throws NotFoundError when student does not exist', async () => {
      prisma.student.findFirst.mockResolvedValue(null);
      await expect(parentService.getStudentParents(SCHOOL_ID, 'nonexistent', ACTOR)).rejects.toThrow(NotFoundError);
    });

    it('validates link for PARENT role requester (404 if not linked)', async () => {
      const parentRequester = { userId: USER_ID, systemRole: 'PARENT' };
      parentRepository.findParentByUserId.mockResolvedValue(mockParent);
      parentRepository.findParentStudentLink.mockResolvedValue(null); // Not linked!

      await expect(parentService.getStudentParents(SCHOOL_ID, STUDENT_ID, parentRequester)).rejects.toThrow(NotFoundError);
    });
  });

  describe('5. linkParentToStudent', () => {
    it('Mode A: links existing parent by parentProfileId', async () => {
      const mockLink = { id: 'link-uuid', schoolId: SCHOOL_ID, studentId: STUDENT_ID, parentProfileId: PARENT_ID, relationship: 'Father' };
      parentRepository.createParentStudentLink.mockResolvedValue(mockLink);

      const result = await parentService.linkParentToStudent(
        SCHOOL_ID,
        STUDENT_ID,
        { parentProfileId: PARENT_ID, relationship: 'Father' },
        ACTOR
      );

      expect(result).toEqual(mockLink);
      expect(parentRepository.createParentStudentLink).toHaveBeenCalledWith({
        schoolId: SCHOOL_ID,
        studentId: STUDENT_ID,
        parentProfileId: PARENT_ID,
        relationship: 'Father'
      });
      expect(auditRepository.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
        entityType: 'ParentStudentLink',
        actionPerformed: expect.stringContaining('LINK_PARENT_STUDENT')
      }));
    });

    it('Mode A: rejects duplicate parent link with ConflictError', async () => {
      parentRepository.findParentStudentLink.mockResolvedValue({ id: 'existing-link' });

      await expect(parentService.linkParentToStudent(
        SCHOOL_ID,
        STUDENT_ID,
        { parentProfileId: PARENT_ID, relationship: 'Father' },
        ACTOR
      )).rejects.toThrow(ConflictError);
    });

    it('Mode B: reuses existing parent by matching email', async () => {
      parentRepository.findParentByEmail.mockResolvedValue(mockParent);
      const mockLink = { id: 'link-uuid', schoolId: SCHOOL_ID, studentId: STUDENT_ID, parentProfileId: PARENT_ID, relationship: 'Mother' };
      parentRepository.createParentStudentLink.mockResolvedValue(mockLink);

      const result = await parentService.linkParentToStudent(
        SCHOOL_ID,
        STUDENT_ID,
        { name: 'Robert Doe', email: 'robert.doe@example.com', relationship: 'Mother' },
        ACTOR
      );

      expect(result).toEqual(mockLink);
      expect(parentRepository.createParentStudentLink).toHaveBeenCalledWith(expect.objectContaining({
        parentProfileId: PARENT_ID
      }));
    });

    it('Mode B: creates new User + ParentProfile + Link when parent is genuinely new', async () => {
      const mockNewUser = { id: 'new-user-id', email: 'newparent@example.com' };
      const mockNewProfile = { id: 'new-profile-id', name: 'Alice Smith', email: 'newparent@example.com' };
      const mockNewLink = { id: 'new-link-id', studentId: STUDENT_ID, parentProfileId: 'new-profile-id', relationship: 'Mother' };

      prisma.user.create.mockResolvedValue(mockNewUser);
      prisma.parentProfile.create.mockResolvedValue(mockNewProfile);
      prisma.parentStudentLink.create.mockResolvedValue(mockNewLink);

      const result = await parentService.linkParentToStudent(
        SCHOOL_ID,
        STUDENT_ID,
        { name: 'Alice Smith', email: 'newparent@example.com', relationship: 'Mother' },
        ACTOR
      );

      expect(result).toEqual(mockNewLink);
      expect(prisma.user.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          systemRole: 'PARENT',
          passwordHash: '!LOCKED_NO_PASSWORD_SET'
        })
      }));
      expect(auditRepository.createAuditLog).toHaveBeenCalledTimes(2); // CREATE_PARENT & LINK_PARENT_STUDENT
    });
  });

  describe('6. unlinkParentFromStudent', () => {
    it('unlinks parent from student without deleting parent profile or user', async () => {
      const mockLink = {
        id: 'link-id',
        relationship: 'Father',
        parent: { name: 'Robert Doe' },
        student: { firstName: 'John' }
      };
      parentRepository.findParentStudentLink.mockResolvedValue(mockLink);

      await parentService.unlinkParentFromStudent(SCHOOL_ID, STUDENT_ID, PARENT_ID, ACTOR);

      expect(parentRepository.deleteParentStudentLink).toHaveBeenCalledWith(SCHOOL_ID, STUDENT_ID, PARENT_ID);
      expect(auditRepository.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
        entityType: 'ParentStudentLink',
        actionPerformed: expect.stringContaining('UNLINK_PARENT_STUDENT')
      }));
    });

    it('throws NotFoundError when link does not exist', async () => {
      parentRepository.findParentStudentLink.mockResolvedValue(null);

      await expect(parentService.unlinkParentFromStudent(SCHOOL_ID, STUDENT_ID, PARENT_ID, ACTOR)).rejects.toThrow(NotFoundError);
      expect(parentRepository.deleteParentStudentLink).not.toHaveBeenCalled();
    });
  });

  describe('7. getMyChildren', () => {
    it('returns children linked to authenticated parent user', async () => {
      const mockChildren = [{ id: 'link-1', student: mockStudent }];
      parentRepository.findChildrenByParentUserId.mockResolvedValue(mockChildren);

      const result = await parentService.getMyChildren(USER_ID, SCHOOL_ID);
      expect(result).toEqual(mockChildren);
      expect(parentRepository.findChildrenByParentUserId).toHaveBeenCalledWith(USER_ID, SCHOOL_ID);
    });
  });

  describe('8. linkChildSelfService', () => {
    const linkPayload = {
      admissionNumber: 'ADM-101',
      dob: '2015-05-10',
      relationship: 'Mother'
    };

    it('links student successfully when admissionNumber and DOB match', async () => {
      const mockStudentWithDob = {
        ...mockStudent,
        dob: '2015-05-10',
        class: { id: 'class-1', name: 'Class 5' },
        section: { id: 'sec-1', name: 'A' }
      };
      const mockCreatedLink = {
        id: 'link-123',
        schoolId: SCHOOL_ID,
        studentId: STUDENT_ID,
        parentProfileId: PARENT_ID,
        relationship: 'Mother',
        createdAt: new Date(),
        student: mockStudentWithDob
      };

      parentRepository.findParentByUserId.mockResolvedValue(mockParent);
      parentRepository.findStudentByAdmissionAndDob.mockResolvedValue(mockStudentWithDob);
      parentRepository.findParentStudentLink.mockResolvedValue(null);
      parentRepository.createParentStudentLink.mockResolvedValue(mockCreatedLink);

      const result = await parentService.linkChildSelfService(USER_ID, SCHOOL_ID, linkPayload, {
        userId: USER_ID,
        email: 'parent@example.com',
        systemRole: 'PARENT'
      });

      expect(result.id).toBe('link-123');
      expect(result.relationship).toBe('Mother');
      expect(result.student).toEqual(mockStudentWithDob);
      expect(parentRepository.findStudentByAdmissionAndDob).toHaveBeenCalledWith(SCHOOL_ID, 'ADM-101', '2015-05-10');
      expect(parentRepository.createParentStudentLink).toHaveBeenCalledWith({
        schoolId: SCHOOL_ID,
        studentId: STUDENT_ID,
        parentProfileId: PARENT_ID,
        relationship: 'Mother'
      });
      expect(auditRepository.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
        entityType: 'ParentStudentLink',
        actionPerformed: expect.stringContaining('LINK_PARENT_STUDENT')
      }));
    });

    it('throws NotFoundError when parent profile does not exist in tenant', async () => {
      parentRepository.findParentByUserId.mockResolvedValue(null);

      await expect(parentService.linkChildSelfService(USER_ID, SCHOOL_ID, linkPayload))
        .rejects.toThrow(NotFoundError);
    });

    it('throws NotFoundError when student with admissionNumber + DOB is not found', async () => {
      parentRepository.findParentByUserId.mockResolvedValue(mockParent);
      parentRepository.findStudentByAdmissionAndDob.mockResolvedValue(null);

      await expect(parentService.linkChildSelfService(USER_ID, SCHOOL_ID, linkPayload))
        .rejects.toThrow(NotFoundError);
    });

    it('throws ConflictError when parent is already linked to student', async () => {
      parentRepository.findParentByUserId.mockResolvedValue(mockParent);
      parentRepository.findStudentByAdmissionAndDob.mockResolvedValue(mockStudent);
      parentRepository.findParentStudentLink.mockResolvedValue({ id: 'existing-link' });

      await expect(parentService.linkChildSelfService(USER_ID, SCHOOL_ID, linkPayload))
        .rejects.toThrow(ConflictError);
    });

    it('handles Prisma P2002 concurrent race condition gracefully as ConflictError', async () => {
      parentRepository.findParentByUserId.mockResolvedValue(mockParent);
      parentRepository.findStudentByAdmissionAndDob.mockResolvedValue(mockStudent);
      parentRepository.findParentStudentLink.mockResolvedValue(null);
      const p2002Error = new Error('Unique constraint failed');
      p2002Error.code = 'P2002';
      parentRepository.createParentStudentLink.mockRejectedValue(p2002Error);

      await expect(parentService.linkChildSelfService(USER_ID, SCHOOL_ID, linkPayload))
        .rejects.toThrow(ConflictError);
    });

    it('preserves successful link even if non-blocking audit logging fails', async () => {
      const mockStudentWithDob = { ...mockStudent, dob: '2015-05-10' };
      const mockCreatedLink = {
        id: 'link-123',
        relationship: 'Mother',
        createdAt: new Date(),
        student: mockStudentWithDob
      };

      parentRepository.findParentByUserId.mockResolvedValue(mockParent);
      parentRepository.findStudentByAdmissionAndDob.mockResolvedValue(mockStudentWithDob);
      parentRepository.findParentStudentLink.mockResolvedValue(null);
      parentRepository.createParentStudentLink.mockResolvedValue(mockCreatedLink);
      auditRepository.createAuditLog.mockRejectedValue(new Error('Audit DB Down'));

      const result = await parentService.linkChildSelfService(USER_ID, SCHOOL_ID, linkPayload);
      expect(result.id).toBe('link-123');
    });
  });

  describe('9. unlinkChildSelfService', () => {
    it('unlinks child successfully for authenticated parent', async () => {
      const mockLink = {
        id: 'link-123',
        relationship: 'Father',
        parent: { name: 'Robert Doe' },
        student: { firstName: 'John' }
      };

      parentRepository.findParentByUserId.mockResolvedValue(mockParent);
      parentRepository.findParentStudentLink.mockResolvedValue(mockLink);
      parentRepository.deleteParentStudentLink.mockResolvedValue(mockLink);

      await parentService.unlinkChildSelfService(USER_ID, SCHOOL_ID, STUDENT_ID, {
        userId: USER_ID,
        systemRole: 'PARENT'
      });

      expect(parentRepository.deleteParentStudentLink).toHaveBeenCalledWith(SCHOOL_ID, STUDENT_ID, PARENT_ID);
      expect(auditRepository.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
        entityType: 'ParentStudentLink',
        actionPerformed: expect.stringContaining('UNLINK_PARENT_STUDENT')
      }));
    });

    it('throws NotFoundError when link does not exist for authenticated parent', async () => {
      parentRepository.findParentByUserId.mockResolvedValue(mockParent);
      parentRepository.findParentStudentLink.mockResolvedValue(null);

      await expect(parentService.unlinkChildSelfService(USER_ID, SCHOOL_ID, STUDENT_ID))
        .rejects.toThrow(NotFoundError);
      expect(parentRepository.deleteParentStudentLink).not.toHaveBeenCalled();
    });

    it('throws NotFoundError when parent profile does not exist in tenant', async () => {
      parentRepository.findParentByUserId.mockResolvedValue(null);

      await expect(parentService.unlinkChildSelfService(USER_ID, SCHOOL_ID, STUDENT_ID))
        .rejects.toThrow(NotFoundError);
    });
  });
});
