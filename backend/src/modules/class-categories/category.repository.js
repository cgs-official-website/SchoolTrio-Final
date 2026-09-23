import { prisma } from '../../database/prisma.client.js';

/**
 * Class Category Data Access Repository Layer
 *
 * Strict Tenant Safety Rules:
 * 1. Every query must explicitly filter by schoolId.
 * 2. Cross-tenant reads and mutations are strictly prevented.
 * 3. Supports transaction propagation via optional `tx` parameter.
 */

/**
 * Finds all class categories for a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Array>}
 */
export async function findCategories(schoolId, tx = prisma) {
  return tx.classCategory.findMany({
    where: { schoolId },
    select: {
      id: true,
      schoolId: true,
      name: true,
      displayOrder: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          classes: true
        }
      }
    },
    orderBy: [
      { displayOrder: 'asc' },
      { name: 'asc' }
    ]
  });
}

/**
 * Finds a single class category by ID within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} id - Category UUID
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Object|null>}
 */
export async function findCategoryById(schoolId, id, tx = prisma) {
  return tx.classCategory.findFirst({
    where: {
      id,
      schoolId
    },
    select: {
      id: true,
      schoolId: true,
      name: true,
      displayOrder: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          classes: true
        }
      }
    }
  });
}

/**
 * Finds a class category by name (case-insensitive) within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} name - Category name
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Object|null>}
 */
export async function findCategoryByName(schoolId, name, tx = prisma) {
  return tx.classCategory.findFirst({
    where: {
      schoolId,
      name: { equals: name, mode: 'insensitive' }
    }
  });
}

/**
 * Creates a new class category for a tenant.
 *
 * @param {Object} data
 * @param {string} data.schoolId - Tenant UUID
 * @param {string} data.name - Category name
 * @param {number} [data.displayOrder=0] - Display order
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Object>}
 */
export async function createCategory(data, tx = prisma) {
  return tx.classCategory.create({
    data: {
      schoolId: data.schoolId,
      name: data.name,
      displayOrder: data.displayOrder ?? 0
    },
    select: {
      id: true,
      schoolId: true,
      name: true,
      displayOrder: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          classes: true
        }
      }
    }
  });
}

/**
 * Deletes a class category within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} id - Category UUID
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Object>}
 */
export async function deleteCategory(schoolId, id, tx = prisma) {
  return tx.classCategory.delete({
    where: {
      schoolId_id: {
        schoolId,
        id
      }
    }
  });
}

/**
 * Counts how many classes in a tenant are currently referencing a category.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} categoryId - Category UUID
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<number>}
 */
export async function countClassesWithCategory(schoolId, categoryId, tx = prisma) {
  return tx.class.count({
    where: {
      schoolId,
      categoryId
    }
  });
}
