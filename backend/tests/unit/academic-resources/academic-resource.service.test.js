import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as academicResourceService from '../../../src/modules/academic-resources/academic-resource.service.js';
import * as academicResourceRepo from '../../../src/modules/academic-resources/academic-resource.repository.js';
import * as auditRepo from '../../../src/modules/audit/audit.repository.js';
import { prisma } from '../../../src/database/prisma.client.js';
import {
  ValidationError,
  NotFoundError,
  ForbiddenError,
  TenantAccessError
} from '../../../src/utils/app-error.js';

describe('Academic Resource Service', () => {
  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
  const CLASS_ID = '22222222-2222-4222-8222-222222222222';
  const SUBJECT_ID = '33333333-3333-4333-8333-333333333333';
  const USER_ID_TEACHER_1 = '44444444-4444-4444-8444-444444444444';
  const USER_ID_TEACHER_2 = '55555555-5555-4555-8555-555555555555';
  const USER_ID_ADMIN = '66666666-6666-4666-8666-666666666666';
  const RESOURCE_ID = '77777777-7777-4777-8777-777777777777';

  const teacherActor = {
    id: USER_ID_TEACHER_1,
    role: 'TEACHER',
    email: 'teacher1@school.edu'
  };

  const staffActor = {
    id: USER_ID_TEACHER_1,
    role: 'STAFFS',
    email: 'staff1@school.edu'
  };

  const adminActor = {
    id: USER_ID_ADMIN,
    role: 'SCHOOL_ADMIN',
    email: 'admin@school.edu'
  };

  const principalActor = {
    id: USER_ID_ADMIN,
    role: 'PRINCIPAL',
    email: 'principal@school.edu'
  };

  const sampleResourceEntity = {
    id: RESOURCE_ID,
    schoolId: SCHOOL_ID,
    classId: CLASS_ID,
    subjectId: SUBJECT_ID,
    uploaderId: USER_ID_TEACHER_1,
    title: 'Biology Chapter 1 Notes',
    fileUrl: 'https://example.com/bio1.pdf',
    fileType: 'document',
    description: 'Detailed summary',
    createdAt: new Date('2026-09-01T10:00:00Z'),
    updatedAt: new Date('2026-09-01T10:00:00Z'),
    class: { id: CLASS_ID, name: 'Grade 10-A' },
    subject: { id: SUBJECT_ID, name: 'Biology', code: 'BIO101' }
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('isAcademicResourceAdmin', () => {
    it('returns true for administrative roles', () => {
      expect(academicResourceService.isAcademicResourceAdmin({ role: 'SUPER_ADMIN' })).toBe(true);
      expect(academicResourceService.isAcademicResourceAdmin({ role: 'SCHOOL_ADMIN' })).toBe(true);
      expect(academicResourceService.isAcademicResourceAdmin({ role: 'PRINCIPAL' })).toBe(true);
      expect(academicResourceService.isAcademicResourceAdmin({ role: 'CORRESPONDENT' })).toBe(true);
      expect(academicResourceService.isAcademicResourceAdmin({ role: 'ADMINISTRATIVE_OFFICER' })).toBe(true);
      expect(academicResourceService.isAcademicResourceAdmin({ role: 'VICE_PRINCIPAL' })).toBe(true);
      expect(academicResourceService.isAcademicResourceAdmin({ role: 'SUBJECT_WISE_HEAD' })).toBe(true);
      expect(academicResourceService.isAcademicResourceAdmin({ role: 'CLASS_INCHARGE' })).toBe(true);
    });

    it('returns false for operational roles: TEACHER, STAFFS, PARENT, STUDENT', () => {
      expect(academicResourceService.isAcademicResourceAdmin({ role: 'TEACHER' })).toBe(false);
      expect(academicResourceService.isAcademicResourceAdmin({ role: 'STAFFS' })).toBe(false);
      expect(academicResourceService.isAcademicResourceAdmin({ role: 'PARENT' })).toBe(false);
      expect(academicResourceService.isAcademicResourceAdmin({ role: 'STUDENT' })).toBe(false);
      expect(academicResourceService.isAcademicResourceAdmin(null)).toBe(false);
    });
  });

  describe('resolveUploaderNames', () => {
    it('resolves names from staff profiles and falls back to user emails', async () => {
      vi.spyOn(academicResourceRepo, 'findStaffProfilesByUserIds').mockResolvedValue([
        { userId: USER_ID_TEACHER_1, fullName: 'John Doe', user: { email: 'john@school.edu' } }
      ]);
      vi.spyOn(academicResourceRepo, 'findUsersByIds').mockResolvedValue([
        { id: USER_ID_TEACHER_1, email: 'john@school.edu' },
        { id: USER_ID_TEACHER_2, email: 'jane@school.edu' }
      ]);

      const nameMap = await academicResourceService.resolveUploaderNames(SCHOOL_ID, [
        USER_ID_TEACHER_1,
        USER_ID_TEACHER_2
      ]);

      expect(nameMap.get(USER_ID_TEACHER_1)).toBe('John Doe');
      expect(nameMap.get(USER_ID_TEACHER_2)).toBe('jane@school.edu');
    });

    it('returns empty map for empty userIds', async () => {
      const nameMap = await academicResourceService.resolveUploaderNames(SCHOOL_ID, []);
      expect(nameMap.size).toBe(0);
    });
  });

  describe('listAcademicResources', () => {
    it('requires tenant context', async () => {
      await expect(academicResourceService.listAcademicResources(null, {})).rejects.toThrow(TenantAccessError);
    });

    it('returns formatted DTO list with pagination metadata', async () => {
      vi.spyOn(academicResourceRepo, 'listAcademicResources').mockResolvedValue([sampleResourceEntity]);
      vi.spyOn(academicResourceRepo, 'countAcademicResources').mockResolvedValue(1);
      vi.spyOn(academicResourceRepo, 'findStaffProfilesByUserIds').mockResolvedValue([
        { userId: USER_ID_TEACHER_1, fullName: 'John Doe', user: { email: 'john@school.edu' } }
      ]);
      vi.spyOn(academicResourceRepo, 'findUsersByIds').mockResolvedValue([
        { id: USER_ID_TEACHER_1, email: 'john@school.edu' }
      ]);

      const result = await academicResourceService.listAcademicResources(SCHOOL_ID, {
        page: 1,
        limit: 20
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toEqual({
        id: RESOURCE_ID,
        title: 'Biology Chapter 1 Notes',
        classId: CLASS_ID,
        className: 'Grade 10-A',
        subjectId: SUBJECT_ID,
        subjectName: 'Biology',
        uploaderId: USER_ID_TEACHER_1,
        uploaderName: 'John Doe',
        fileUrl: 'https://example.com/bio1.pdf',
        type: 'document',
        description: 'Detailed summary',
        createdAt: sampleResourceEntity.createdAt,
        updatedAt: sampleResourceEntity.updatedAt
      });
      expect(result.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false
      });
    });
  });

  describe('getAcademicResourceById', () => {
    it('requires tenant context and ID', async () => {
      await expect(academicResourceService.getAcademicResourceById(null, RESOURCE_ID)).rejects.toThrow(TenantAccessError);
      await expect(academicResourceService.getAcademicResourceById(SCHOOL_ID, null)).rejects.toThrow(ValidationError);
    });

    it('throws NotFoundError if resource does not exist in tenant', async () => {
      vi.spyOn(academicResourceRepo, 'findAcademicResourceById').mockResolvedValue(null);
      await expect(academicResourceService.getAcademicResourceById(SCHOOL_ID, RESOURCE_ID)).rejects.toThrow(NotFoundError);
    });

    it('returns canonical resource DTO', async () => {
      vi.spyOn(academicResourceRepo, 'findAcademicResourceById').mockResolvedValue(sampleResourceEntity);
      vi.spyOn(academicResourceRepo, 'findStaffProfilesByUserIds').mockResolvedValue([
        { userId: USER_ID_TEACHER_1, fullName: 'John Doe', user: { email: 'john@school.edu' } }
      ]);
      vi.spyOn(academicResourceRepo, 'findUsersByIds').mockResolvedValue([
        { id: USER_ID_TEACHER_1, email: 'john@school.edu' }
      ]);

      const result = await academicResourceService.getAcademicResourceById(SCHOOL_ID, RESOURCE_ID);
      expect(result.id).toBe(RESOURCE_ID);
      expect(result.uploaderName).toBe('John Doe');
      expect(result.className).toBe('Grade 10-A');
      expect(result.subjectName).toBe('Biology');
    });
  });

  describe('createAcademicResource', () => {
    it('requires tenant context and actor id', async () => {
      await expect(
        academicResourceService.createAcademicResource(null, teacherActor, { title: 'Test', classId: CLASS_ID })
      ).rejects.toThrow(TenantAccessError);

      await expect(
        academicResourceService.createAcademicResource(SCHOOL_ID, {}, { title: 'Test', classId: CLASS_ID })
      ).rejects.toThrow(ForbiddenError);
    });

    it('throws NotFoundError if class does not belong to school', async () => {
      vi.spyOn(academicResourceRepo, 'findClassInTenant').mockResolvedValue(null);

      await expect(
        academicResourceService.createAcademicResource(SCHOOL_ID, teacherActor, {
          title: 'Notes',
          classId: CLASS_ID
        })
      ).rejects.toThrow(NotFoundError);
    });

    it('throws NotFoundError if subject does not belong to school', async () => {
      vi.spyOn(academicResourceRepo, 'findClassInTenant').mockResolvedValue({ id: CLASS_ID, name: 'Grade 10-A' });
      vi.spyOn(academicResourceRepo, 'findSubjectInTenant').mockResolvedValue(null);

      await expect(
        academicResourceService.createAcademicResource(SCHOOL_ID, teacherActor, {
          title: 'Notes',
          classId: CLASS_ID,
          subjectId: SUBJECT_ID
        })
      ).rejects.toThrow(NotFoundError);
    });

    it('creates resource, records audit log, and resolves uploader DTO', async () => {
      vi.spyOn(academicResourceRepo, 'findClassInTenant').mockResolvedValue({ id: CLASS_ID, name: 'Grade 10-A' });
      vi.spyOn(academicResourceRepo, 'findSubjectInTenant').mockResolvedValue({ id: SUBJECT_ID, name: 'Biology' });
      vi.spyOn(academicResourceRepo, 'createAcademicResource').mockResolvedValue(sampleResourceEntity);
      vi.spyOn(academicResourceRepo, 'findStaffProfilesByUserIds').mockResolvedValue([
        { userId: USER_ID_TEACHER_1, fullName: 'John Doe', user: { email: 'john@school.edu' } }
      ]);
      vi.spyOn(academicResourceRepo, 'findUsersByIds').mockResolvedValue([
        { id: USER_ID_TEACHER_1, email: 'john@school.edu' }
      ]);
      const auditSpy = vi.spyOn(auditRepo, 'createAuditLog').mockResolvedValue({});

      const payload = {
        title: 'Biology Chapter 1 Notes',
        classId: CLASS_ID,
        subjectId: SUBJECT_ID,
        fileUrl: 'https://example.com/bio1.pdf',
        type: 'document',
        description: 'Detailed summary'
      };

      const result = await academicResourceService.createAcademicResource(SCHOOL_ID, teacherActor, payload);

      expect(result.id).toBe(RESOURCE_ID);
      expect(result.title).toBe('Biology Chapter 1 Notes');
      expect(result.uploaderId).toBe(USER_ID_TEACHER_1);
      expect(result.uploaderName).toBe('John Doe');

      expect(academicResourceRepo.createAcademicResource).toHaveBeenCalledWith(SCHOOL_ID, {
        title: 'Biology Chapter 1 Notes',
        classId: CLASS_ID,
        subjectId: SUBJECT_ID,
        uploaderId: USER_ID_TEACHER_1,
        fileUrl: 'https://example.com/bio1.pdf',
        type: 'document',
        description: 'Detailed summary'
      });

      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          schoolId: SCHOOL_ID,
          actionPerformed: 'ACADEMIC_RESOURCE_CREATED',
          entityId: RESOURCE_ID
        })
      );
    });
  });

  describe('updateAcademicResource', () => {
    beforeEach(() => {
      vi.spyOn(prisma, '$transaction').mockImplementation(async cb => cb(prisma));
    });

    it('throws NotFoundError if resource does not exist', async () => {
      vi.spyOn(academicResourceRepo, 'findAcademicResourceWithLock').mockResolvedValue(null);

      await expect(
        academicResourceService.updateAcademicResource(SCHOOL_ID, teacherActor, RESOURCE_ID, { title: 'New Title' })
      ).rejects.toThrow(NotFoundError);
    });

    it('throws ForbiddenError if a teacher attempts to update another user resource', async () => {
      vi.spyOn(academicResourceRepo, 'findAcademicResourceWithLock').mockResolvedValue({
        id: RESOURCE_ID,
        uploaderId: USER_ID_TEACHER_2 // different uploader
      });

      await expect(
        academicResourceService.updateAcademicResource(SCHOOL_ID, teacherActor, RESOURCE_ID, { title: 'New Title' })
      ).rejects.toThrow(ForbiddenError);
    });

    it('allows a teacher to update their own resource', async () => {
      vi.spyOn(academicResourceRepo, 'findAcademicResourceWithLock').mockResolvedValue({
        id: RESOURCE_ID,
        uploaderId: USER_ID_TEACHER_1 // same uploader
      });
      vi.spyOn(academicResourceRepo, 'updateAcademicResource').mockResolvedValue(sampleResourceEntity);
      vi.spyOn(academicResourceRepo, 'findStaffProfilesByUserIds').mockResolvedValue([]);
      vi.spyOn(academicResourceRepo, 'findUsersByIds').mockResolvedValue([{ id: USER_ID_TEACHER_1, email: 't@s.edu' }]);
      const auditSpy = vi.spyOn(auditRepo, 'createAuditLog').mockResolvedValue({});

      const result = await academicResourceService.updateAcademicResource(
        SCHOOL_ID,
        teacherActor,
        RESOURCE_ID,
        { title: 'Updated Title' }
      );

      expect(result.id).toBe(RESOURCE_ID);
      expect(academicResourceRepo.updateAcademicResource).toHaveBeenCalled();
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          actionPerformed: 'ACADEMIC_RESOURCE_UPDATED'
        })
      );
    });

    it('allows an administrator to update any resource in tenant', async () => {
      vi.spyOn(academicResourceRepo, 'findAcademicResourceWithLock').mockResolvedValue({
        id: RESOURCE_ID,
        uploaderId: USER_ID_TEACHER_1 // teacher's resource
      });
      vi.spyOn(academicResourceRepo, 'updateAcademicResource').mockResolvedValue(sampleResourceEntity);
      vi.spyOn(academicResourceRepo, 'findStaffProfilesByUserIds').mockResolvedValue([]);
      vi.spyOn(academicResourceRepo, 'findUsersByIds').mockResolvedValue([{ id: USER_ID_TEACHER_1, email: 't@s.edu' }]);

      const result = await academicResourceService.updateAcademicResource(
        SCHOOL_ID,
        adminActor,
        RESOURCE_ID,
        { title: 'Admin Override Title' }
      );

      expect(result.id).toBe(RESOURCE_ID);
      expect(academicResourceRepo.updateAcademicResource).toHaveBeenCalled();
    });

    it('validates class and subject when updating relationships', async () => {
      vi.spyOn(academicResourceRepo, 'findAcademicResourceWithLock').mockResolvedValue({
        id: RESOURCE_ID,
        uploaderId: USER_ID_TEACHER_1
      });
      vi.spyOn(academicResourceRepo, 'findClassInTenant').mockResolvedValue(null);

      await expect(
        academicResourceService.updateAcademicResource(SCHOOL_ID, teacherActor, RESOURCE_ID, {
          classId: '88888888-8888-4888-8888-888888888888'
        })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('deleteAcademicResource', () => {
    beforeEach(() => {
      vi.spyOn(prisma, '$transaction').mockImplementation(async cb => cb(prisma));
    });

    it('throws NotFoundError if resource does not exist', async () => {
      vi.spyOn(academicResourceRepo, 'findAcademicResourceWithLock').mockResolvedValue(null);

      await expect(
        academicResourceService.deleteAcademicResource(SCHOOL_ID, teacherActor, RESOURCE_ID)
      ).rejects.toThrow(NotFoundError);
    });

    it('throws ForbiddenError if a teacher attempts to delete another user resource', async () => {
      vi.spyOn(academicResourceRepo, 'findAcademicResourceWithLock').mockResolvedValue({
        id: RESOURCE_ID,
        uploaderId: USER_ID_TEACHER_2
      });

      await expect(
        academicResourceService.deleteAcademicResource(SCHOOL_ID, teacherActor, RESOURCE_ID)
      ).rejects.toThrow(ForbiddenError);
    });

    it('allows a teacher to delete their own resource', async () => {
      vi.spyOn(academicResourceRepo, 'findAcademicResourceWithLock').mockResolvedValue({
        id: RESOURCE_ID,
        uploaderId: USER_ID_TEACHER_1,
        title: 'Notes to delete'
      });
      vi.spyOn(academicResourceRepo, 'deleteAcademicResource').mockResolvedValue({ id: RESOURCE_ID });
      const auditSpy = vi.spyOn(auditRepo, 'createAuditLog').mockResolvedValue({});

      const result = await academicResourceService.deleteAcademicResource(SCHOOL_ID, teacherActor, RESOURCE_ID);

      expect(result.success).toBe(true);
      expect(academicResourceRepo.deleteAcademicResource).toHaveBeenCalled();
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          actionPerformed: 'ACADEMIC_RESOURCE_DELETED'
        })
      );
    });

    it('allows an administrator to delete any resource in tenant', async () => {
      vi.spyOn(academicResourceRepo, 'findAcademicResourceWithLock').mockResolvedValue({
        id: RESOURCE_ID,
        uploaderId: USER_ID_TEACHER_1,
        title: 'Teacher notes'
      });
      vi.spyOn(academicResourceRepo, 'deleteAcademicResource').mockResolvedValue({ id: RESOURCE_ID });

      const result = await academicResourceService.deleteAcademicResource(SCHOOL_ID, principalActor, RESOURCE_ID);

      expect(result.success).toBe(true);
      expect(academicResourceRepo.deleteAcademicResource).toHaveBeenCalled();
    });
  });
});
