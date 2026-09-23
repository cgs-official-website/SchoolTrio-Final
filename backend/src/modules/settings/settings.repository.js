import { prisma } from '../../database/prisma.client.js';

/**
 * Settings Repository Layer
 * Encapsulates all PostgreSQL / Prisma interactions for School and SchoolSetting models.
 */

export async function findSchoolById(schoolId, tx = prisma) {
  return tx.school.findUnique({
    where: { id: schoolId }
  });
}

export async function updateSchool(schoolId, data, tx = prisma) {
  return tx.school.update({
    where: { id: schoolId },
    data
  });
}

export async function findSetting(schoolId, category, tx = prisma) {
  return tx.schoolSetting.findFirst({
    where: {
      schoolId,
      category
    }
  });
}

export async function findSettingsByCategories(schoolId, categories, tx = prisma) {
  return tx.schoolSetting.findMany({
    where: {
      schoolId,
      category: { in: categories }
    }
  });
}

export async function upsertSetting(schoolId, category, data, tx = prisma) {
  return tx.schoolSetting.upsert({
    where: {
      schoolId_category: {
        schoolId,
        category
      }
    },
    update: {
      data
    },
    create: {
      schoolId,
      category,
      data
    }
  });
}

export async function executeTransaction(callback) {
  return prisma.$transaction(async (tx) => {
    return callback(tx);
  });
}
