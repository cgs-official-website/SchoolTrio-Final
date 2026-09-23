import { prisma } from '../../database/prisma.client.js';

/**
 * Student Health Data Access Repository Layer
 *
 * Enforces strict multi-tenant isolation by always querying with `schoolId`.
 */

export const STUDENT_HEALTH_SELECT = {
  id: true,
  schoolId: true,
  bloodGroup: true,
  customData: true,
  updatedAt: true
};

/**
 * Finds a student's health record within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} studentId - Student UUID
 * @param {import('@prisma/client').PrismaClient} [tx=prisma]
 * @returns {Promise<Object|null>}
 */
export async function findStudentHealth(schoolId, studentId, tx = prisma) {
  return tx.student.findFirst({
    where: {
      id: studentId,
      schoolId
    },
    select: STUDENT_HEALTH_SELECT
  });
}

/**
 * Atomically updates a student's health data and customData within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} studentId - Student UUID
 * @param {Object} updateData - Partial update payload
 * @param {import('@prisma/client').PrismaClient} [tx=prisma]
 * @returns {Promise<Object>}
 */
export async function updateStudentHealth(schoolId, studentId, updateData, tx = prisma) {
  const data = {};

  if (updateData.bloodGroup !== undefined) {
    data.bloodGroup = updateData.bloodGroup;
  }

  if (updateData.customData !== undefined) {
    data.customData = updateData.customData;
  }

  return tx.student.update({
    where: {
      schoolId_id: {
        schoolId,
        id: studentId
      }
    },
    data,
    select: STUDENT_HEALTH_SELECT
  });
}
