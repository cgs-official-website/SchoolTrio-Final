import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as classService from '../../../src/modules/classes/class.service.js';
import * as classRepository from '../../../src/modules/classes/class.repository.js';
import * as auditRepository from '../../../src/modules/audit/audit.repository.js';
import { prisma } from '../../../src/database/prisma.client.js';
import {
  NotFoundError,
  ConflictError,
  RelationshipConflictError,
  TenantAccessError
} from '../../../src/utils/app-error.js';

describe('Unit: Class & Section Service Layer — Phase 4C.2-A.2.2 (AuditLog Integration)', () => {
  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
  const CLASS_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const CATEGORY_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const TEACHER_A_ID = 'cccccccc-cccc-4ccc-8ccc-aaaaaaaaaaaa';
  const TEACHER_B_ID = 'cccccccc-cccc-4ccc-8ccc-bbbbbbbbbbbb';
  const SECTION_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

  const mockActor = {
    userId: 'user-admin-1',
    email: 'admin@school.edu',
    systemRole: 'SCHOOL_ADMIN'
  };

  const zeroClassDependencies = {
    students: 0,
    attendanceSessions: 0,
    timetablePeriods: 0,
    feeStructures: 0,
    assessments: 0,
    homeworkAssignments: 0
  };

  const zeroSectionDependencies = {
    students: 0,
    attendanceSessions: 0,
    timetablePeriods: 0
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. CLASS QUERY & LIST TESTS
  // =========================================================================
  describe('listClasses', () => {
    it('throws TenantAccessError when schoolId is missing', async () => {
      await expect(classService.listClasses(null)).rejects.toThrow(TenantAccessError);
    });

    it('returns classes and pagination metadata', async () => {
      const mockClasses = [{ id: CLASS_ID, name: 'Grade 10', schoolId: SCHOOL_ID }];
      vi.spyOn(classRepository, 'findClasses').mockResolvedValue(mockClasses);
      vi.spyOn(classRepository, 'countClasses').mockResolvedValue(1);

      const result = await classService.listClasses(SCHOOL_ID, { page: '1', limit: '10' });
      expect(result.classes).toEqual(mockClasses);
      expect(result.pagination.total).toBe(1);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(10);
    });
  });

  describe('getClassById', () => {
    it('throws TenantAccessError when schoolId is missing', async () => {
      await expect(classService.getClassById(null, CLASS_ID)).rejects.toThrow(TenantAccessError);
    });

    it('throws NotFoundError when class does not exist in tenant', async () => {
      vi.spyOn(classRepository, 'findClassById').mockResolvedValue(null);
      await expect(classService.getClassById(SCHOOL_ID, CLASS_ID)).rejects.toThrow(NotFoundError);
    });

    it('returns class record when found', async () => {
      const mockClass = { id: CLASS_ID, name: 'Grade 10', schoolId: SCHOOL_ID };
      vi.spyOn(classRepository, 'findClassById').mockResolvedValue(mockClass);

      const result = await classService.getClassById(SCHOOL_ID, CLASS_ID);
      expect(result).toEqual(mockClass);
    });
  });

  // =========================================================================
  // 2. CLASS CREATION & TEACHER SYNC + AUDIT TESTS
  // =========================================================================
  describe('createClass', () => {
    it('throws TenantAccessError when schoolId is missing', async () => {
      await expect(classService.createClass(null, { name: 'Grade 10' })).rejects.toThrow(TenantAccessError);
    });

    it('rejects creation when referenced categoryId does not exist in tenant and produces no AuditLog', async () => {
      vi.spyOn(classRepository, 'findCategoryById').mockResolvedValue(null);
      const auditSpy = vi.spyOn(auditRepository, 'createAuditLog');

      await expect(
        classService.createClass(SCHOOL_ID, {
          name: 'Grade 10',
          categoryId: CATEGORY_ID
        })
      ).rejects.toThrow(RelationshipConflictError);

      expect(auditSpy).not.toHaveBeenCalled();
    });

    it('rejects creation when referenced classTeacherId does not exist in tenant and produces no AuditLog', async () => {
      vi.spyOn(classRepository, 'findStaffProfileById').mockResolvedValue(null);
      const auditSpy = vi.spyOn(auditRepository, 'createAuditLog');

      await expect(
        classService.createClass(SCHOOL_ID, {
          name: 'Grade 10',
          classTeacherId: TEACHER_A_ID
        })
      ).rejects.toThrow(RelationshipConflictError);

      expect(auditSpy).not.toHaveBeenCalled();
    });

    it('rejects creation when referenced classTeacherId is inactive and produces no AuditLog', async () => {
      vi.spyOn(classRepository, 'findStaffProfileById').mockResolvedValue({
        id: TEACHER_A_ID,
        schoolId: SCHOOL_ID,
        status: 'Inactive'
      });
      const auditSpy = vi.spyOn(auditRepository, 'createAuditLog');

      await expect(
        classService.createClass(SCHOOL_ID, {
          name: 'Grade 10',
          classTeacherId: TEACHER_A_ID
        })
      ).rejects.toThrow(ConflictError);

      expect(auditSpy).not.toHaveBeenCalled();
    });

    it('rejects duplicate class name within the tenant and produces no AuditLog', async () => {
      vi.spyOn(classRepository, 'findClassByName').mockResolvedValue({ id: 'existing-id', name: 'Grade 10' });
      const auditSpy = vi.spyOn(auditRepository, 'createAuditLog');

      await expect(
        classService.createClass(SCHOOL_ID, {
          name: 'Grade 10'
        })
      ).rejects.toThrow(ConflictError);

      expect(auditSpy).not.toHaveBeenCalled();
    });

    it('creates class atomically with default section, syncs teacher, and records canonical AuditLog', async () => {
      vi.spyOn(classRepository, 'findCategoryById').mockResolvedValue({ id: CATEGORY_ID, name: 'Primary' });
      vi.spyOn(classRepository, 'findStaffProfileById').mockResolvedValue({
        id: TEACHER_A_ID,
        schoolId: SCHOOL_ID,
        status: 'Active'
      });
      vi.spyOn(classRepository, 'findClassByName').mockResolvedValue(null);
      const createdClass = {
        id: CLASS_ID,
        name: 'Grade 10',
        schoolId: SCHOOL_ID,
        classTeacherId: TEACHER_A_ID,
        categoryId: CATEGORY_ID,
        gradeLevel: 10
      };
      const createdSection = { id: SECTION_ID, name: 'A', classId: CLASS_ID, schoolId: SCHOOL_ID };

      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback) => {
        return callback(prisma);
      });
      vi.spyOn(classRepository, 'findClassByClassTeacherId').mockResolvedValue(null);
      vi.spyOn(classRepository, 'createClass').mockResolvedValue(createdClass);
      vi.spyOn(classRepository, 'createSection').mockResolvedValue(createdSection);
      vi.spyOn(classRepository, 'updateStaffAssignedClass').mockResolvedValue({ id: TEACHER_A_ID, assignedClassId: CLASS_ID });
      vi.spyOn(classRepository, 'findClassById').mockResolvedValue({
        ...createdClass,
        sections: [createdSection]
      });
      const auditSpy = vi.spyOn(auditRepository, 'createAuditLog').mockResolvedValue({});

      const result = await classService.createClass(
        SCHOOL_ID,
        {
          name: 'Grade 10',
          defaultSection: 'A',
          classTeacherId: TEACHER_A_ID,
          categoryId: CATEGORY_ID,
          gradeLevel: 10
        },
        mockActor
      );

      expect(result.id).toBe(CLASS_ID);
      expect(classRepository.updateStaffAssignedClass).toHaveBeenCalledWith(SCHOOL_ID, TEACHER_A_ID, CLASS_ID, expect.anything());

      expect(auditSpy).toHaveBeenCalledWith({
        schoolId: SCHOOL_ID,
        entityType: 'Class',
        entityId: CLASS_ID,
        actionPerformed: 'CREATE_CLASS: Grade 10',
        userName: 'admin@school.edu',
        userRole: 'SCHOOL_ADMIN',
        modifiedFields: {
          name: 'Grade 10',
          categoryId: CATEGORY_ID,
          gradeLevel: 10,
          classTeacherId: TEACHER_A_ID,
          defaultSection: 'A'
        }
      });
    });

    it('tolerates non-blocking audit failure without failing class creation', async () => {
      vi.spyOn(classRepository, 'findClassByName').mockResolvedValue(null);
      const createdClass = { id: CLASS_ID, name: 'Grade 10', schoolId: SCHOOL_ID, classTeacherId: null };

      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback) => callback(prisma));
      vi.spyOn(classRepository, 'createClass').mockResolvedValue(createdClass);
      vi.spyOn(classRepository, 'findClassById').mockResolvedValue(createdClass);
      vi.spyOn(auditRepository, 'createAuditLog').mockResolvedValue(null);

      const result = await classService.createClass(SCHOOL_ID, { name: 'Grade 10' }, mockActor);
      expect(result.id).toBe(CLASS_ID);
    });

    it('does not create AuditLog if transaction fails during class creation', async () => {
      vi.spyOn(classRepository, 'findClassByName').mockResolvedValue(null);
      vi.spyOn(prisma, '$transaction').mockRejectedValue(new Error('Transaction aborted'));
      const auditSpy = vi.spyOn(auditRepository, 'createAuditLog');

      await expect(classService.createClass(SCHOOL_ID, { name: 'Grade 10' }, mockActor)).rejects.toThrow('Transaction aborted');
      expect(auditSpy).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 3. CLASS UPDATE & TEACHER AUDIT TESTS
  // =========================================================================
  describe('updateClass', () => {
    it('throws NotFoundError when updating non-existent class and produces no AuditLog', async () => {
      vi.spyOn(classRepository, 'findClassById').mockResolvedValue(null);
      const auditSpy = vi.spyOn(auditRepository, 'createAuditLog');

      await expect(
        classService.updateClass(SCHOOL_ID, CLASS_ID, { name: 'Grade 11' })
      ).rejects.toThrow(NotFoundError);

      expect(auditSpy).not.toHaveBeenCalled();
    });

    it('rejects update if new name duplicates another class and produces no AuditLog', async () => {
      vi.spyOn(classRepository, 'findClassById').mockResolvedValue({ id: CLASS_ID, name: 'Grade 10' });
      vi.spyOn(classRepository, 'findClassByName').mockResolvedValue({ id: 'other-id', name: 'Grade 11' });
      const auditSpy = vi.spyOn(auditRepository, 'createAuditLog');

      await expect(
        classService.updateClass(SCHOOL_ID, CLASS_ID, { name: 'Grade 11' })
      ).rejects.toThrow(ConflictError);

      expect(auditSpy).not.toHaveBeenCalled();
    });

    it('records UPDATE_CLASS audit log with delta modifiedFields', async () => {
      const existing = { id: CLASS_ID, name: 'Grade 10', gradeLevel: 10, categoryId: null, classTeacherId: null };
      const updated = { id: CLASS_ID, name: 'Grade 10 - Honors', gradeLevel: 10, categoryId: null, classTeacherId: null };

      vi.spyOn(classRepository, 'findClassById')
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce(updated);
      vi.spyOn(classRepository, 'findClassByName').mockResolvedValue(null);
      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback) => callback(prisma));
      vi.spyOn(classRepository, 'updateClass').mockResolvedValue(updated);
      const auditSpy = vi.spyOn(auditRepository, 'createAuditLog').mockResolvedValue({});

      await classService.updateClass(SCHOOL_ID, CLASS_ID, { name: 'Grade 10 - Honors' }, mockActor);

      expect(auditSpy).toHaveBeenCalledWith({
        schoolId: SCHOOL_ID,
        entityType: 'Class',
        entityId: CLASS_ID,
        actionPerformed: 'UPDATE_CLASS: Grade 10 - Honors',
        userName: 'admin@school.edu',
        userRole: 'SCHOOL_ADMIN',
        modifiedFields: {
          name: {
            old: 'Grade 10',
            new: 'Grade 10 - Honors'
          }
        }
      });
    });

    it('records teacher assignment audit with ASSIGNED action', async () => {
      const existing = { id: CLASS_ID, name: 'Grade 10', classTeacherId: null };
      const updated = { id: CLASS_ID, name: 'Grade 10', classTeacherId: TEACHER_A_ID };

      vi.spyOn(classRepository, 'findClassById')
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce(updated);
      vi.spyOn(classRepository, 'findStaffProfileById').mockResolvedValue({ id: TEACHER_A_ID, status: 'Active' });
      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback) => callback(prisma));
      vi.spyOn(classRepository, 'updateStaffAssignedClass').mockResolvedValue({});
      vi.spyOn(classRepository, 'findClassByClassTeacherId').mockResolvedValue(null);
      vi.spyOn(classRepository, 'updateClass').mockResolvedValue(updated);
      const auditSpy = vi.spyOn(auditRepository, 'createAuditLog').mockResolvedValue({});

      await classService.updateClass(SCHOOL_ID, CLASS_ID, { classTeacherId: TEACHER_A_ID }, mockActor);

      expect(auditSpy).toHaveBeenCalledWith({
        schoolId: SCHOOL_ID,
        entityType: 'Class',
        entityId: CLASS_ID,
        actionPerformed: 'UPDATE_CLASS: Grade 10',
        userName: 'admin@school.edu',
        userRole: 'SCHOOL_ADMIN',
        modifiedFields: {
          classTeacherId: {
            old: null,
            new: TEACHER_A_ID
          },
          teacherAction: 'ASSIGNED'
        }
      });
    });

    it('records teacher removal audit with REMOVED action', async () => {
      const existing = { id: CLASS_ID, name: 'Grade 10', classTeacherId: TEACHER_A_ID };
      const updated = { id: CLASS_ID, name: 'Grade 10', classTeacherId: null };

      vi.spyOn(classRepository, 'findClassById')
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce(updated);
      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback) => callback(prisma));
      vi.spyOn(classRepository, 'updateStaffAssignedClass').mockResolvedValue({});
      vi.spyOn(classRepository, 'updateClass').mockResolvedValue(updated);
      const auditSpy = vi.spyOn(auditRepository, 'createAuditLog').mockResolvedValue({});

      await classService.updateClass(SCHOOL_ID, CLASS_ID, { classTeacherId: null }, mockActor);

      expect(auditSpy).toHaveBeenCalledWith({
        schoolId: SCHOOL_ID,
        entityType: 'Class',
        entityId: CLASS_ID,
        actionPerformed: 'UPDATE_CLASS: Grade 10',
        userName: 'admin@school.edu',
        userRole: 'SCHOOL_ADMIN',
        modifiedFields: {
          classTeacherId: {
            old: TEACHER_A_ID,
            new: null
          },
          teacherAction: 'REMOVED'
        }
      });
    });

    it('records teacher replacement audit with REASSIGNED action', async () => {
      const existing = { id: CLASS_ID, name: 'Grade 10', classTeacherId: TEACHER_A_ID };
      const updated = { id: CLASS_ID, name: 'Grade 10', classTeacherId: TEACHER_B_ID };

      vi.spyOn(classRepository, 'findClassById')
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce(updated);
      vi.spyOn(classRepository, 'findStaffProfileById').mockResolvedValue({ id: TEACHER_B_ID, status: 'Active' });
      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback) => callback(prisma));
      vi.spyOn(classRepository, 'updateStaffAssignedClass').mockResolvedValue({});
      vi.spyOn(classRepository, 'findClassByClassTeacherId').mockResolvedValue(null);
      vi.spyOn(classRepository, 'updateClass').mockResolvedValue(updated);
      const auditSpy = vi.spyOn(auditRepository, 'createAuditLog').mockResolvedValue({});

      await classService.updateClass(SCHOOL_ID, CLASS_ID, { classTeacherId: TEACHER_B_ID }, mockActor);

      expect(auditSpy).toHaveBeenCalledWith({
        schoolId: SCHOOL_ID,
        entityType: 'Class',
        entityId: CLASS_ID,
        actionPerformed: 'UPDATE_CLASS: Grade 10',
        userName: 'admin@school.edu',
        userRole: 'SCHOOL_ADMIN',
        modifiedFields: {
          classTeacherId: {
            old: TEACHER_A_ID,
            new: TEACHER_B_ID
          },
          teacherAction: 'REASSIGNED'
        }
      });
    });

    it('does not record teacher field change when assigning same teacher (idempotent)', async () => {
      const existing = { id: CLASS_ID, name: 'Grade 10', classTeacherId: TEACHER_A_ID };
      const updated = { id: CLASS_ID, name: 'Grade 10', classTeacherId: TEACHER_A_ID };

      vi.spyOn(classRepository, 'findClassById')
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce(updated);
      vi.spyOn(classRepository, 'findStaffProfileById').mockResolvedValue({ id: TEACHER_A_ID, status: 'Active' });
      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback) => callback(prisma));
      vi.spyOn(classRepository, 'updateClass').mockResolvedValue(updated);
      const auditSpy = vi.spyOn(auditRepository, 'createAuditLog');

      await classService.updateClass(SCHOOL_ID, CLASS_ID, { classTeacherId: TEACHER_A_ID }, mockActor);

      // No modified fields -> no audit log called
      expect(auditSpy).not.toHaveBeenCalled();
    });

    it('does not create AuditLog if update transaction fails', async () => {
      vi.spyOn(classRepository, 'findClassById').mockResolvedValue({ id: CLASS_ID, name: 'Grade 10' });
      vi.spyOn(classRepository, 'findClassByName').mockResolvedValue(null);
      vi.spyOn(prisma, '$transaction').mockRejectedValue(new Error('Update failed'));
      const auditSpy = vi.spyOn(auditRepository, 'createAuditLog');

      await expect(classService.updateClass(SCHOOL_ID, CLASS_ID, { name: 'Grade 11' }, mockActor)).rejects.toThrow('Update failed');
      expect(auditSpy).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 4. CLASS DELETION & AUDIT TESTS
  // =========================================================================
  describe('deleteClass', () => {
    it('throws NotFoundError when deleting non-existent class and produces no AuditLog', async () => {
      vi.spyOn(classRepository, 'findClassById').mockResolvedValue(null);
      const auditSpy = vi.spyOn(auditRepository, 'createAuditLog');

      await expect(classService.deleteClass(SCHOOL_ID, CLASS_ID)).rejects.toThrow(NotFoundError);
      expect(auditSpy).not.toHaveBeenCalled();
    });

    it('rejects deletion when Class has assigned Students and produces no AuditLog', async () => {
      vi.spyOn(classRepository, 'findClassById').mockResolvedValue({ id: CLASS_ID, name: 'Grade 10' });
      vi.spyOn(classRepository, 'countClassDependencies').mockResolvedValue({
        ...zeroClassDependencies,
        students: 5
      });
      const auditSpy = vi.spyOn(auditRepository, 'createAuditLog');

      await expect(classService.deleteClass(SCHOOL_ID, CLASS_ID)).rejects.toThrow(
        'Cannot delete class with assigned students'
      );
      expect(auditSpy).not.toHaveBeenCalled();
    });

    it('successfully deletes class and records canonical DELETE_CLASS AuditLog', async () => {
      const existing = {
        id: CLASS_ID,
        name: 'Grade 10',
        gradeLevel: 10,
        categoryId: CATEGORY_ID,
        classTeacherId: TEACHER_A_ID,
        sections: [{ id: SECTION_ID, name: 'A' }]
      };

      vi.spyOn(classRepository, 'findClassById').mockResolvedValue(existing);
      vi.spyOn(classRepository, 'countClassDependencies').mockResolvedValue(zeroClassDependencies);
      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback) => callback(prisma));
      vi.spyOn(classRepository, 'updateStaffAssignedClass').mockResolvedValue({});
      vi.spyOn(classRepository, 'deleteSectionsByClassId').mockResolvedValue({ count: 1 });
      vi.spyOn(classRepository, 'deleteClass').mockResolvedValue({ id: CLASS_ID });
      const auditSpy = vi.spyOn(auditRepository, 'createAuditLog').mockResolvedValue({});

      await expect(classService.deleteClass(SCHOOL_ID, CLASS_ID, mockActor)).resolves.toBeUndefined();

      expect(auditSpy).toHaveBeenCalledWith({
        schoolId: SCHOOL_ID,
        entityType: 'Class',
        entityId: CLASS_ID,
        actionPerformed: 'DELETE_CLASS: Grade 10',
        userName: 'admin@school.edu',
        userRole: 'SCHOOL_ADMIN',
        modifiedFields: {
          deletedClass: {
            id: CLASS_ID,
            name: 'Grade 10',
            gradeLevel: 10,
            categoryId: CATEGORY_ID
          },
          deletedSectionsCount: 1,
          unlinkedTeacherId: TEACHER_A_ID
        }
      });
    });
  });

  // =========================================================================
  // 5. SECTION CRUD & AUDIT TESTS
  // =========================================================================
  describe('Sections Service', () => {
    it('creates a section successfully and records CREATE_SECTION AuditLog', async () => {
      const classRecord = { id: CLASS_ID, name: 'Grade 10' };
      vi.spyOn(classRepository, 'findClassById').mockResolvedValue(classRecord);
      vi.spyOn(classRepository, 'findSectionByName').mockResolvedValue(null);
      vi.spyOn(classRepository, 'createSection').mockResolvedValue({ id: SECTION_ID, name: 'B', classId: CLASS_ID });
      const auditSpy = vi.spyOn(auditRepository, 'createAuditLog').mockResolvedValue({});

      const result = await classService.createSection(SCHOOL_ID, CLASS_ID, { name: 'b' }, mockActor);
      expect(result.id).toBe(SECTION_ID);

      expect(auditSpy).toHaveBeenCalledWith({
        schoolId: SCHOOL_ID,
        entityType: 'Section',
        entityId: SECTION_ID,
        actionPerformed: 'CREATE_SECTION: Grade 10 - Section B',
        userName: 'admin@school.edu',
        userRole: 'SCHOOL_ADMIN',
        modifiedFields: {
          classId: CLASS_ID,
          className: 'Grade 10',
          name: 'B'
        }
      });
    });

    it('updates a section name and records UPDATE_SECTION AuditLog', async () => {
      const classRecord = { id: CLASS_ID, name: 'Grade 10' };
      vi.spyOn(classRepository, 'findClassById').mockResolvedValue(classRecord);
      vi.spyOn(classRepository, 'findSectionById').mockResolvedValue({ id: SECTION_ID, name: 'A' });
      vi.spyOn(classRepository, 'findSectionByName').mockResolvedValue(null);
      vi.spyOn(classRepository, 'updateSection').mockResolvedValue({ id: SECTION_ID, name: 'A - ADVANCED' });
      const auditSpy = vi.spyOn(auditRepository, 'createAuditLog').mockResolvedValue({});

      await classService.updateSection(SCHOOL_ID, CLASS_ID, SECTION_ID, { name: 'A - ADVANCED' }, mockActor);

      expect(auditSpy).toHaveBeenCalledWith({
        schoolId: SCHOOL_ID,
        entityType: 'Section',
        entityId: SECTION_ID,
        actionPerformed: 'UPDATE_SECTION: Grade 10 - Section A - ADVANCED',
        userName: 'admin@school.edu',
        userRole: 'SCHOOL_ADMIN',
        modifiedFields: {
          classId: CLASS_ID,
          className: 'Grade 10',
          name: {
            old: 'A',
            new: 'A - ADVANCED'
          }
        }
      });
    });

    it('does not record UPDATE_SECTION audit if section name is unchanged', async () => {
      const classRecord = { id: CLASS_ID, name: 'Grade 10' };
      vi.spyOn(classRepository, 'findClassById').mockResolvedValue(classRecord);
      vi.spyOn(classRepository, 'findSectionById').mockResolvedValue({ id: SECTION_ID, name: 'A' });
      vi.spyOn(classRepository, 'updateSection').mockResolvedValue({ id: SECTION_ID, name: 'A' });
      const auditSpy = vi.spyOn(auditRepository, 'createAuditLog');

      await classService.updateSection(SCHOOL_ID, CLASS_ID, SECTION_ID, { name: 'A' }, mockActor);

      expect(auditSpy).not.toHaveBeenCalled();
    });

    it('rejects section deletion when section has assigned Students and produces no AuditLog', async () => {
      vi.spyOn(classRepository, 'findClassById').mockResolvedValue({ id: CLASS_ID, name: 'Grade 10' });
      vi.spyOn(classRepository, 'findSectionById').mockResolvedValue({ id: SECTION_ID, name: 'A' });
      vi.spyOn(classRepository, 'countSectionDependencies').mockResolvedValue({
        ...zeroSectionDependencies,
        students: 15
      });
      const auditSpy = vi.spyOn(auditRepository, 'createAuditLog');

      await expect(classService.deleteSection(SCHOOL_ID, CLASS_ID, SECTION_ID)).rejects.toThrow(
        'Cannot delete section with assigned students'
      );

      expect(auditSpy).not.toHaveBeenCalled();
    });

    it('successfully deletes section and records DELETE_SECTION AuditLog', async () => {
      const classRecord = { id: CLASS_ID, name: 'Grade 10' };
      vi.spyOn(classRepository, 'findClassById').mockResolvedValue(classRecord);
      vi.spyOn(classRepository, 'findSectionById').mockResolvedValue({ id: SECTION_ID, name: 'A' });
      vi.spyOn(classRepository, 'countSectionDependencies').mockResolvedValue(zeroSectionDependencies);
      vi.spyOn(classRepository, 'deleteSection').mockResolvedValue({ id: SECTION_ID });
      const auditSpy = vi.spyOn(auditRepository, 'createAuditLog').mockResolvedValue({});

      await expect(classService.deleteSection(SCHOOL_ID, CLASS_ID, SECTION_ID, mockActor)).resolves.toBeUndefined();

      expect(auditSpy).toHaveBeenCalledWith({
        schoolId: SCHOOL_ID,
        entityType: 'Section',
        entityId: SECTION_ID,
        actionPerformed: 'DELETE_SECTION: Grade 10 - Section A',
        userName: 'admin@school.edu',
        userRole: 'SCHOOL_ADMIN',
        modifiedFields: {
          deletedSection: {
            id: SECTION_ID,
            classId: CLASS_ID,
            name: 'A'
          }
        }
      });
    });
  });
});
