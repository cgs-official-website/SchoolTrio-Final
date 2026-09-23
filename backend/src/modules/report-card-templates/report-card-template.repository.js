import { prisma } from '../../database/prisma.client.js';

/**
 * Report Card Template Repository
 * Tenant-scoped data access operations for ReportCardTemplate.
 */

/**
 * Finds a report card template by school ID and template type.
 *
 * @param {string} schoolId - Tenant school UUID
 * @param {string} [templateType='report_card'] - Template type identifier
 * @param {Object} [tx=prisma] - Optional Prisma transaction client
 * @returns {Promise<Object|null>}
 */
export async function findTemplateByType(schoolId, templateType = 'report_card', tx = prisma) {
  return tx.reportCardTemplate.findUnique({
    where: {
      schoolId_templateType: {
        schoolId,
        templateType
      }
    }
  });
}

/**
 * Finds a report card template by internal UUID within tenant scope.
 *
 * @param {string} schoolId - Tenant school UUID
 * @param {string} id - Template UUID
 * @param {Object} [tx=prisma] - Optional Prisma transaction client
 * @returns {Promise<Object|null>}
 */
export async function findTemplateById(schoolId, id, tx = prisma) {
  return tx.reportCardTemplate.findFirst({
    where: {
      id,
      schoolId
    }
  });
}

/**
 * Atomically creates or updates a report card template for a tenant.
 *
 * @param {string} schoolId - Tenant school UUID
 * @param {string} templateType - Template type identifier
 * @param {Object} config - Template JSON configuration
 * @param {Object} [tx=prisma] - Optional Prisma transaction client
 * @returns {Promise<Object>}
 */
export async function upsertTemplate(schoolId, templateType, config, tx = prisma) {
  return tx.reportCardTemplate.upsert({
    where: {
      schoolId_templateType: {
        schoolId,
        templateType
      }
    },
    create: {
      schoolId,
      templateType,
      config
    },
    update: {
      config
    }
  });
}

/**
 * Deletes a report card template for a tenant.
 *
 * @param {string} schoolId - Tenant school UUID
 * @param {string} templateType - Template type identifier
 * @param {Object} [tx=prisma] - Optional Prisma transaction client
 * @returns {Promise<{ count: number }>}
 */
export async function deleteTemplate(schoolId, templateType, tx = prisma) {
  return tx.reportCardTemplate.deleteMany({
    where: {
      schoolId,
      templateType
    }
  });
}
