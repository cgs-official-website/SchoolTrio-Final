import * as categoryRepository from './category.repository.js';
import { createAuditLog } from '../audit/audit.repository.js';
import {
  NotFoundError,
  ConflictError,
  TenantAccessError
} from '../../utils/app-error.js';

/**
 * Class Category Business Logic Service Layer
 *
 * Enforces:
 * - Strict tenant boundaries
 * - Unique category naming
 * - Safe deletion guards
 * - Canonical AuditLog integration for category mutations
 */

/**
 * Lists all class categories for a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @returns {Promise<Array>}
 */
export async function listCategories(schoolId) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to list categories');
  }
  return categoryRepository.findCategories(schoolId);
}

/**
 * Creates a custom class category for a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} data - Category creation payload
 * @param {Object} [actor] - Context of requesting user
 * @returns {Promise<Object>}
 */
export async function createCategory(schoolId, data, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to create category');
  }

  const categoryName = data.name.trim();

  // Prevent duplicate category name within tenant
  const existing = await categoryRepository.findCategoryByName(schoolId, categoryName);
  if (existing) {
    throw new ConflictError(`Category "${categoryName}" already exists in this institution`);
  }

  const createdCategory = await categoryRepository.createCategory({
    schoolId,
    name: categoryName,
    displayOrder: data.displayOrder ?? 0
  });

  // Canonical AuditLog integration (non-blocking, post-mutation)
  await createAuditLog({
    schoolId,
    entityType: 'ClassCategory',
    entityId: createdCategory.id,
    actionPerformed: `CREATE_CATEGORY: ${createdCategory.name}`,
    userName: actor?.email || actor?.userId || 'Administrator',
    userRole: actor?.systemRole || null,
    modifiedFields: {
      name: createdCategory.name,
      displayOrder: createdCategory.displayOrder
    }
  });

  return createdCategory;
}

/**
 * Deletes a class category within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} id - Category UUID
 * @param {Object} [actor] - Context of requesting user
 * @returns {Promise<void>}
 */
export async function deleteCategory(schoolId, id, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to delete category');
  }

  const category = await categoryRepository.findCategoryById(schoolId, id);
  if (!category) {
    throw new NotFoundError('ClassCategory');
  }

  // Prevent deletion if category is currently referenced by any classes
  const classesUsingCategory = await categoryRepository.countClassesWithCategory(schoolId, id);
  if (classesUsingCategory > 0) {
    throw new ConflictError('Cannot delete category in use by existing classes');
  }

  await categoryRepository.deleteCategory(schoolId, id);

  // Canonical AuditLog integration (non-blocking, post-mutation)
  await createAuditLog({
    schoolId,
    entityType: 'ClassCategory',
    entityId: id,
    actionPerformed: `DELETE_CATEGORY: ${category.name}`,
    userName: actor?.email || actor?.userId || 'Administrator',
    userRole: actor?.systemRole || null,
    modifiedFields: {
      deletedCategory: {
        id: category.id,
        name: category.name,
        displayOrder: category.displayOrder
      }
    }
  });
}
