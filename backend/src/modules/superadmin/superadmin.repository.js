import { prisma } from '../../database/prisma.client.js';

/**
 * SuperAdmin Data Access Repository Layer
 */

export async function getPlatformStats() {
  const [
    totalSchools,
    approvedSchools,
    pendingSchools,
    suspendedSchools,
    rejectedSchools,
    totalUsers,
    totalStudents,
    totalStaff,
    activePlansWithSchools
  ] = await Promise.all([
    prisma.school.count(),
    prisma.school.count({ where: { status: 'approved' } }),
    prisma.school.count({ where: { status: 'pending' } }),
    prisma.school.count({ where: { status: 'suspended' } }),
    prisma.school.count({ where: { status: 'rejected' } }),
    prisma.user.count(),
    prisma.student.count(),
    prisma.staffProfile.count(),
    prisma.school.findMany({
      where: { status: 'approved', planId: { not: null } },
      select: {
        plan: {
          select: {
            id: true,
            name: true,
            pricePerUserPerYear: true
          }
        }
      }
    })
  ]);

  // Calculate estimated Monthly Recurring Revenue (MRR) based on active schools' plan price
  const estimatedMRR = activePlansWithSchools.reduce((acc, curr) => {
    if (curr.plan?.pricePerUserPerYear) {
      const yearly = Number(curr.plan.pricePerUserPerYear);
      return acc + Math.round(yearly / 12);
    }
    return acc;
  }, 0);

  return {
    totalSchools,
    activeSchools: approvedSchools,
    pendingSchools,
    suspendedSchools,
    rejectedSchools,
    totalUsers,
    totalStudents,
    totalStaff,
    estimatedMRR
  };
}

function buildTenantsWhereClause(filters = {}) {
  const where = {};

  if (filters.status && filters.status !== 'all') {
    where.status = filters.status;
  }

  if (filters.planId) {
    where.planId = filters.planId;
  }

  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: 'insensitive' } },
      { code: { contains: filters.search, mode: 'insensitive' } },
      { email: { contains: filters.search, mode: 'insensitive' } }
    ];
  }

  return where;
}

export async function findTenants(filters = {}, pagination = {}) {
  const where = buildTenantsWhereClause(filters);
  const skip = pagination.skip || 0;
  const take = pagination.take || 20;
  const orderBy = { [pagination.sort || 'createdAt']: pagination.order || 'desc' };

  return prisma.school.findMany({
    where,
    select: {
      id: true,
      name: true,
      code: true,
      type: true,
      status: true,
      email: true,
      phone: true,
      address: true,
      seatLimit: true,
      teacherLimit: true,
      createdAt: true,
      updatedAt: true,
      plan: {
        select: {
          id: true,
          name: true,
          userLimit: true,
          pricePerUserPerYear: true
        }
      },
      _count: {
        select: {
          students: true,
          staffProfiles: true,
          users: true
        }
      }
    },
    orderBy,
    skip,
    take
  });
}

export async function countTenants(filters = {}) {
  const where = buildTenantsWhereClause(filters);
  return prisma.school.count({ where });
}

export async function findTenantById(id) {
  return prisma.school.findUnique({
    where: { id },
    include: {
      plan: true,
      settings: true,
      users: {
        where: { systemRole: 'SCHOOL_ADMIN' },
        select: {
          id: true,
          email: true,
          createdAt: true
        }
      },
      _count: {
        select: {
          students: true,
          staffProfiles: true,
          classes: true,
          users: true
        }
      }
    }
  });
}

export async function findSchoolByCodeOrEmail(code, email) {
  return prisma.school.findFirst({
    where: {
      OR: [
        { code: code.toUpperCase() },
        { email: email.toLowerCase() }
      ]
    }
  });
}

export async function createTenantWithAdmin(data, tx = prisma) {
  // 1. Create School record
  const school = await tx.school.create({
    data: {
      name: data.name,
      code: data.code.toUpperCase(),
      email: data.email.toLowerCase(),
      phone: data.phone || '',
      address: data.address || '',
      type: data.type || 'K12',
      status: 'approved',
      seatLimit: data.seatLimit || 500,
      teacherLimit: data.teacherLimit || 50,
      planId: data.planId || null
    }
  });

  // 2. Create Initial School Admin User
  const adminUser = await tx.user.create({
    data: {
      schoolId: school.id,
      email: data.adminEmail.toLowerCase(),
      passwordHash: data.adminPasswordHash,
      passwordAlgorithm: 'argon2id',
      systemRole: 'SCHOOL_ADMIN',
      isActive: true
    }
  });

  // 3. Create Default SchoolSetting for modules
  await tx.schoolSetting.create({
    data: {
      schoolId: school.id,
      category: 'modulesConfig',
      data: {
        timetables: true,
        transport: true,
        library: true,
        exams: true,
        noticeboard: true,
        classes: true,
        'hr-payroll': true,
        attendance: true,
        calendar: true,
        fees: true,
        inventory: true
      }
    }
  });

  return { school, adminUser };
}

export async function updateTenantStatus(id, status, tx = prisma) {
  return tx.school.update({
    where: { id },
    data: { status },
    include: {
      plan: true
    }
  });
}

export async function updateTenantConfig(id, configData, tx = prisma) {
  const data = {};
  if (configData.seatLimit !== undefined) data.seatLimit = configData.seatLimit;
  if (configData.teacherLimit !== undefined) data.teacherLimit = configData.teacherLimit;
  if (configData.planId !== undefined) data.planId = configData.planId;

  const school = await tx.school.update({
    where: { id },
    data,
    include: { plan: true }
  });

  if (configData.modules) {
    await tx.schoolSetting.upsert({
      where: {
        schoolId_category: {
          schoolId: id,
          category: 'modulesConfig'
        }
      },
      create: {
        schoolId: id,
        category: 'modulesConfig',
        data: configData.modules
      },
      update: {
        data: configData.modules
      }
    });
  }

  return school;
}

export async function deleteTenant(id, tx = prisma) {
  return tx.school.delete({
    where: { id }
  });
}

export async function findPlans(filters = {}, pagination = {}) {
  const where = {};
  if (filters.isActive && filters.isActive !== 'all') {
    where.isActive = filters.isActive === 'true';
  }

  const skip = pagination.skip || 0;
  const take = pagination.take || 50;

  return prisma.subscriptionPlan.findMany({
    where,
    orderBy: { createdAt: 'asc' },
    skip,
    take,
    include: {
      _count: {
        select: { schools: true }
      }
    }
  });
}

export async function countPlans(filters = {}) {
  const where = {};
  if (filters.isActive && filters.isActive !== 'all') {
    where.isActive = filters.isActive === 'true';
  }
  return prisma.subscriptionPlan.count({ where });
}

export async function findPlanById(id) {
  return prisma.subscriptionPlan.findUnique({
    where: { id },
    include: {
      _count: {
        select: { schools: true }
      }
    }
  });
}

export async function findPlanByName(name) {
  return prisma.subscriptionPlan.findUnique({
    where: { name }
  });
}

export async function createPlan(data, tx = prisma) {
  return tx.subscriptionPlan.create({
    data: {
      name: data.name,
      userLimit: data.userLimit,
      pricePerUserPerYear: data.pricePerUserPerYear,
      cloudStorageGB: data.cloudStorageGB || 5,
      modules: data.modules || null,
      isActive: data.isActive !== undefined ? data.isActive : true
    }
  });
}

export async function updatePlan(id, data, tx = prisma) {
  return tx.subscriptionPlan.update({
    where: { id },
    data
  });
}

export async function countSchoolsWithPlan(planId) {
  return prisma.school.count({
    where: { planId }
  });
}

export async function deletePlan(id, tx = prisma) {
  return tx.subscriptionPlan.delete({
    where: { id }
  });
}
