import { prisma } from '../../database/prisma.client.js';

/**
 * Email Templates Repository Layer
 *
 * Encapsulates PostgreSQL / Prisma operations for email templates
 * stored under SchoolSetting with category = 'emailTemplates'.
 * Strictly enforces schoolId tenant scoping on all operations.
 */

export const CATEGORY_EMAIL_TEMPLATES = 'emailTemplates';

/**
 * Find the email templates setting for a school tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {import('@prisma/client').PrismaClient} [tx=prisma]
 * @returns {Promise<Object|null>}
 */
export async function findEmailTemplatesSetting(schoolId, tx = prisma) {
  return tx.schoolSetting.findFirst({
    where: {
      schoolId,
      category: CATEGORY_EMAIL_TEMPLATES
    }
  });
}

/**
 * Upsert the email templates setting for a school tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} data - Structured template data
 * @param {import('@prisma/client').PrismaClient} [tx=prisma]
 * @returns {Promise<Object>}
 */
export async function upsertEmailTemplatesSetting(schoolId, data, tx = prisma) {
  return tx.schoolSetting.upsert({
    where: {
      schoolId_category: {
        schoolId,
        category: CATEGORY_EMAIL_TEMPLATES
      }
    },
    update: {
      data
    },
    create: {
      schoolId,
      category: CATEGORY_EMAIL_TEMPLATES,
      data
    }
  });
}

/**
 * Remove custom email templates setting for a school tenant (reverting to system defaults).
 *
 * @param {string} schoolId - Tenant UUID
 * @param {import('@prisma/client').PrismaClient} [tx=prisma]
 * @returns {Promise<{ count: number }>}
 */
export async function deleteEmailTemplatesSetting(schoolId, tx = prisma) {
  return tx.schoolSetting.deleteMany({
    where: {
      schoolId,
      category: CATEGORY_EMAIL_TEMPLATES
    }
  });
}

/**
 * Executes a callback within a managed database transaction.
 *
 * @param {Function} callback
 * @returns {Promise<any>}
 */
export async function executeTransaction(callback) {
  return prisma.$transaction(async (tx) => {
    return callback(tx);
  });
}
