import { prisma } from '../../database/prisma.client.js';

/**
 * Tenant Billing Repository Layer
 * Encapsulates all PostgreSQL / Prisma interactions for SubscriptionPlan, School, SchoolSetting, and Usage counting.
 */

export async function findActivePlans(tx = prisma) {
  return tx.subscriptionPlan.findMany({
    where: { isActive: true },
    orderBy: { pricePerUserPerYear: 'asc' }
  });
}

export async function findPlanById(planId, tx = prisma) {
  return tx.subscriptionPlan.findUnique({
    where: { id: planId }
  });
}

export async function findSchoolBillingInfo(schoolId, tx = prisma) {
  return tx.school.findUnique({
    where: { id: schoolId },
    include: {
      plan: true
    }
  });
}

export async function findBillingSetting(schoolId, tx = prisma) {
  return tx.schoolSetting.findFirst({
    where: {
      schoolId,
      category: 'billing'
    }
  });
}

export async function getTenantUsageCounts(schoolId, tx = prisma) {
  const [studentsCount, staffCount] = await Promise.all([
    tx.student.count({
      where: {
        schoolId,
        status: 'Active'
      }
    }),
    tx.staffProfile.count({
      where: {
        schoolId,
        status: 'Active'
      }
    })
  ]);

  return {
    studentsCount,
    staffCount
  };
}

export async function updateSchoolPlan(schoolId, planId, tx = prisma) {
  return tx.school.update({
    where: { id: schoolId },
    data: { planId }
  });
}

export async function upsertBillingSetting(schoolId, data, tx = prisma) {
  return tx.schoolSetting.upsert({
    where: {
      schoolId_category: {
        schoolId,
        category: 'billing'
      }
    },
    update: {
      data
    },
    create: {
      schoolId,
      category: 'billing',
      data
    }
  });
}

export async function executeTransaction(callback) {
  return prisma.$transaction(async (tx) => {
    return callback(tx);
  });
}
