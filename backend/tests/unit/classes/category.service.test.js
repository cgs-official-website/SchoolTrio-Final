import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as categoryService from '../../../src/modules/class-categories/category.service.js';
import * as categoryRepository from '../../../src/modules/class-categories/category.repository.js';
import * as auditRepository from '../../../src/modules/audit/audit.repository.js';

describe('Unit: Class Category Service Layer — Phase 4C.2-A.2.2', () => {
  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
  const CATEGORY_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  const mockActor = {
    userId: 'user-admin-1',
    email: 'admin@school.edu',
    systemRole: 'SCHOOL_ADMIN'
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('listCategories', () => {
    it('throws TenantAccessError when schoolId is missing', async () => {
      await expect(categoryService.listCategories(null)).rejects.toThrow('Tenant context required');
    });

    it('returns list of categories', async () => {
      const mockCategories = [{ id: CATEGORY_ID, name: 'Primary', displayOrder: 1 }];
      vi.spyOn(categoryRepository, 'findCategories').mockResolvedValue(mockCategories);

      const result = await categoryService.listCategories(SCHOOL_ID);
      expect(result).toEqual(mockCategories);
    });
  });

  describe('createCategory', () => {
    it('creates category successfully and records canonical AuditLog', async () => {
      vi.spyOn(categoryRepository, 'findCategoryByName').mockResolvedValue(null);
      const createdCategory = {
        id: CATEGORY_ID,
        name: 'High School',
        displayOrder: 2
      };
      vi.spyOn(categoryRepository, 'createCategory').mockResolvedValue(createdCategory);
      const auditSpy = vi.spyOn(auditRepository, 'createAuditLog').mockResolvedValue({});

      const result = await categoryService.createCategory(
        SCHOOL_ID,
        {
          name: 'High School',
          displayOrder: 2
        },
        mockActor
      );

      expect(result.id).toBe(CATEGORY_ID);
      expect(categoryRepository.createCategory).toHaveBeenCalledWith({
        schoolId: SCHOOL_ID,
        name: 'High School',
        displayOrder: 2
      });

      expect(auditSpy).toHaveBeenCalledWith({
        schoolId: SCHOOL_ID,
        entityType: 'ClassCategory',
        entityId: CATEGORY_ID,
        actionPerformed: 'CREATE_CATEGORY: High School',
        userName: 'admin@school.edu',
        userRole: 'SCHOOL_ADMIN',
        modifiedFields: {
          name: 'High School',
          displayOrder: 2
        }
      });
    });

    it('rejects duplicate category name within tenant and produces no AuditLog', async () => {
      vi.spyOn(categoryRepository, 'findCategoryByName').mockResolvedValue({ id: 'existing', name: 'High School' });
      const auditSpy = vi.spyOn(auditRepository, 'createAuditLog');

      await expect(
        categoryService.createCategory(SCHOOL_ID, { name: 'High School' })
      ).rejects.toThrow('already exists in this institution');

      expect(auditSpy).not.toHaveBeenCalled();
    });

    it('tolerates non-blocking audit logging failure without failing category creation', async () => {
      vi.spyOn(categoryRepository, 'findCategoryByName').mockResolvedValue(null);
      vi.spyOn(categoryRepository, 'createCategory').mockResolvedValue({
        id: CATEGORY_ID,
        name: 'Primary',
        displayOrder: 1
      });
      vi.spyOn(auditRepository, 'createAuditLog').mockResolvedValue(null);

      const result = await categoryService.createCategory(
        SCHOOL_ID,
        { name: 'Primary', displayOrder: 1 },
        mockActor
      );

      expect(result.id).toBe(CATEGORY_ID);
    });
  });

  describe('deleteCategory', () => {
    it('throws NotFoundError when deleting non-existent category and produces no AuditLog', async () => {
      vi.spyOn(categoryRepository, 'findCategoryById').mockResolvedValue(null);
      const auditSpy = vi.spyOn(auditRepository, 'createAuditLog');

      await expect(categoryService.deleteCategory(SCHOOL_ID, CATEGORY_ID)).rejects.toThrow('ClassCategory not found');
      expect(auditSpy).not.toHaveBeenCalled();
    });

    it('blocks deletion when category is in use by existing classes and produces no AuditLog', async () => {
      vi.spyOn(categoryRepository, 'findCategoryById').mockResolvedValue({ id: CATEGORY_ID, name: 'Primary', displayOrder: 1 });
      vi.spyOn(categoryRepository, 'countClassesWithCategory').mockResolvedValue(3);
      const auditSpy = vi.spyOn(auditRepository, 'createAuditLog');

      await expect(categoryService.deleteCategory(SCHOOL_ID, CATEGORY_ID)).rejects.toThrow(
        'Cannot delete category in use by existing classes'
      );
      expect(auditSpy).not.toHaveBeenCalled();
    });

    it('successfully deletes category when not in use and records canonical AuditLog', async () => {
      vi.spyOn(categoryRepository, 'findCategoryById').mockResolvedValue({ id: CATEGORY_ID, name: 'Primary', displayOrder: 1 });
      vi.spyOn(categoryRepository, 'countClassesWithCategory').mockResolvedValue(0);
      vi.spyOn(categoryRepository, 'deleteCategory').mockResolvedValue({ id: CATEGORY_ID });
      const auditSpy = vi.spyOn(auditRepository, 'createAuditLog').mockResolvedValue({});

      await expect(categoryService.deleteCategory(SCHOOL_ID, CATEGORY_ID, mockActor)).resolves.toBeUndefined();

      expect(auditSpy).toHaveBeenCalledWith({
        schoolId: SCHOOL_ID,
        entityType: 'ClassCategory',
        entityId: CATEGORY_ID,
        actionPerformed: 'DELETE_CATEGORY: Primary',
        userName: 'admin@school.edu',
        userRole: 'SCHOOL_ADMIN',
        modifiedFields: {
          deletedCategory: {
            id: CATEGORY_ID,
            name: 'Primary',
            displayOrder: 1
          }
        }
      });
    });
  });
});
