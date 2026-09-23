import * as superAdminRepository from './superadmin.repository.js';
import { createAuditLog } from '../audit/audit.repository.js';
import { hashPassword } from '../auth/password.service.js';
import { prisma } from '../../database/prisma.client.js';
import { parsePagination, buildPaginationMetadata } from '../../utils/pagination.js';
import { NotFoundError, ValidationError, ConflictError } from '../../utils/app-error.js';
import { SYSTEM_ROLES } from '../../config/constants.js';

/**
 * SuperAdmin Platform Business Logic Service
 */

function formatTenantSummaryDto(school) {
  return {
    id: school.id,
    name: school.name,
    code: school.code,
    type: school.type,
    status: school.status,
    email: school.email,
    phone: school.phone,
    address: school.address,
    seatLimit: school.seatLimit,
    teacherLimit: school.teacherLimit,
    plan: school.plan
      ? {
          id: school.plan.id,
          name: school.plan.name,
          userLimit: school.plan.userLimit,
          pricePerUserPerYear: Number(school.plan.pricePerUserPerYear)
        }
      : null,
    counts: {
      students: school._count?.students || 0,
      teachers: school._count?.staffProfiles || 0,
      users: school._count?.users || 0
    },
    createdAt: school.createdAt instanceof Date ? school.createdAt.toISOString() : school.createdAt,
    updatedAt: school.updatedAt instanceof Date ? school.updatedAt.toISOString() : school.updatedAt
  };
}

function formatPlanDto(plan) {
  return {
    id: plan.id,
    name: plan.name,
    userLimit: plan.userLimit,
    pricePerUserPerYear: Number(plan.pricePerUserPerYear),
    cloudStorageGB: plan.cloudStorageGB,
    modules: plan.modules,
    isActive: plan.isActive,
    schoolsCount: plan._count?.schools || 0,
    createdAt: plan.createdAt instanceof Date ? plan.createdAt.toISOString() : plan.createdAt,
    updatedAt: plan.updatedAt instanceof Date ? plan.updatedAt.toISOString() : plan.updatedAt
  };
}

/**
 * 1. Global Platform KPI Metrics
 */
export async function getStats() {
  return superAdminRepository.getPlatformStats();
}

/**
 * 2. List All Tenants with Search & Pagination
 */
export async function listTenants(query = {}) {
  const { page, limit, skip, take, sort, order } = parsePagination(query, {
    defaultSort: 'createdAt',
    defaultOrder: 'desc'
  });

  const filterOptions = {
    status: query.status,
    planId: query.planId,
    search: query.search
  };

  const [schools, total] = await Promise.all([
    superAdminRepository.findTenants(filterOptions, { skip, take, sort, order }),
    superAdminRepository.countTenants(filterOptions)
  ]);

  const pagination = buildPaginationMetadata(total, page, limit);

  return {
    tenants: schools.map(formatTenantSummaryDto),
    pagination
  };
}

/**
 * 3. Get Tenant Details by ID
 */
export async function getTenantById(id) {
  const school = await superAdminRepository.findTenantById(id);
  if (!school) {
    throw new NotFoundError('Tenant school not found');
  }

  // Extract modules config from settings if present
  const modulesSetting = school.settings?.find((s) => s.category === 'modulesConfig');
  const modules = modulesSetting?.data || null;

  return {
    ...formatTenantSummaryDto(school),
    modules,
    admins: (school.users || []).map((u) => ({
      id: u.id,
      email: u.email,
      createdAt: u.createdAt instanceof Date ? u.createdAt.toISOString() : u.createdAt
    }))
  };
}

/**
 * 4. Manually Provision Tenant & Initial Admin User
 */
export async function createTenant(data, actor) {
  // Check unique constraints for code and email
  const existing = await superAdminRepository.findSchoolByCodeOrEmail(data.code, data.email);
  if (existing) {
    if (existing.code.toUpperCase() === data.code.toUpperCase()) {
      throw new ConflictError(`School with code '${data.code}' already exists`);
    }
    if (existing.email.toLowerCase() === data.email.toLowerCase()) {
      throw new ConflictError(`School with email '${data.email}' already exists`);
    }
  }

  // Verify plan if supplied
  if (data.planId) {
    const plan = await superAdminRepository.findPlanById(data.planId);
    if (!plan) {
      throw new NotFoundError(`Subscription plan with ID '${data.planId}' not found`);
    }
  }

  // Hash initial school admin password
  const adminPasswordHash = await hashPassword(data.adminPassword);

  const result = await prisma.$transaction(async (tx) => {
    const { school, adminUser } = await superAdminRepository.createTenantWithAdmin(
      {
        ...data,
        adminPasswordHash
      },
      tx
    );

    await createAuditLog(
      {
        schoolId: school.id,
        entityType: 'School',
        entityId: school.id,
        actionPerformed: 'PROVISION_TENANT',
        userName: actor.email || 'SuperAdmin',
        userRole: SYSTEM_ROLES.SUPER_ADMIN,
        modifiedFields: {
          name: school.name,
          code: school.code,
          adminEmail: adminUser.email
        }
      },
      tx
    );

    return school;
  });

  return formatTenantSummaryDto(result);
}

/**
 * 5. Update Tenant Status (Approved, Suspended, Rejected, Pending)
 */
export async function updateTenantStatus(id, data, actor) {
  const existing = await superAdminRepository.findTenantById(id);
  if (!existing) {
    throw new NotFoundError('Tenant school not found');
  }

  const updated = await prisma.$transaction(async (tx) => {
    const school = await superAdminRepository.updateTenantStatus(id, data.status, tx);

    await createAuditLog(
      {
        schoolId: id,
        entityType: 'School',
        entityId: id,
        actionPerformed: 'UPDATE_TENANT_STATUS',
        userName: actor.email || 'SuperAdmin',
        userRole: SYSTEM_ROLES.SUPER_ADMIN,
        modifiedFields: {
          previousStatus: existing.status,
          newStatus: data.status,
          reason: data.reason || null
        }
      },
      tx
    );

    return school;
  });

  return formatTenantSummaryDto(updated);
}

/**
 * 6. Update Tenant Configuration (Quotas & Modules)
 */
export async function updateTenantConfig(id, configData, actor) {
  const existing = await superAdminRepository.findTenantById(id);
  if (!existing) {
    throw new NotFoundError('Tenant school not found');
  }

  if (configData.planId) {
    const plan = await superAdminRepository.findPlanById(configData.planId);
    if (!plan) {
      throw new NotFoundError(`Subscription plan '${configData.planId}' not found`);
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const school = await superAdminRepository.updateTenantConfig(id, configData, tx);

    await createAuditLog(
      {
        schoolId: id,
        entityType: 'School',
        entityId: id,
        actionPerformed: 'UPDATE_TENANT_CONFIG',
        userName: actor.email || 'SuperAdmin',
        userRole: SYSTEM_ROLES.SUPER_ADMIN,
        modifiedFields: configData
      },
      tx
    );

    return school;
  });

  return formatTenantSummaryDto(updated);
}

/**
 * 7. Safe Tenant Offboarding / Deletion
 */
export async function deleteTenant(id, actor) {
  const existing = await superAdminRepository.findTenantById(id);
  if (!existing) {
    throw new NotFoundError('Tenant school not found');
  }

  await prisma.$transaction(async (tx) => {
    // Record audit before cascade deletion
    await createAuditLog(
      {
        schoolId: id,
        entityType: 'School',
        entityId: id,
        actionPerformed: 'DELETE_TENANT',
        userName: actor.email || 'SuperAdmin',
        userRole: SYSTEM_ROLES.SUPER_ADMIN,
        modifiedFields: {
          name: existing.name,
          code: existing.code
        }
      },
      tx
    );

    await superAdminRepository.deleteTenant(id, tx);
  });

  return { message: `Tenant '${existing.name}' (${existing.code}) was successfully deleted` };
}

/**
 * 8. Subscription Plans Management (List, Create, Update, Delete)
 */
export async function listPlans(query = {}) {
  const { page, limit, skip, take } = parsePagination(query, {
    defaultSort: 'createdAt',
    defaultOrder: 'asc'
  });

  const [plans, total] = await Promise.all([
    superAdminRepository.findPlans(query, { skip, take }),
    superAdminRepository.countPlans(query)
  ]);

  const pagination = buildPaginationMetadata(total, page, limit);

  return {
    plans: plans.map(formatPlanDto),
    pagination
  };
}

export async function createPlan(data, actor) {
  const existing = await superAdminRepository.findPlanByName(data.name);
  if (existing) {
    throw new ConflictError(`Subscription plan with name '${data.name}' already exists`);
  }

  const plan = await superAdminRepository.createPlan(data);
  return formatPlanDto(plan);
}

export async function updatePlan(id, data, actor) {
  const existing = await superAdminRepository.findPlanById(id);
  if (!existing) {
    throw new NotFoundError('Subscription plan not found');
  }

  if (data.name && data.name !== existing.name) {
    const duplicate = await superAdminRepository.findPlanByName(data.name);
    if (duplicate) {
      throw new ConflictError(`Plan name '${data.name}' is already taken`);
    }
  }

  const updated = await superAdminRepository.updatePlan(id, data);
  return formatPlanDto(updated);
}

export async function deletePlan(id, actor) {
  const existing = await superAdminRepository.findPlanById(id);
  if (!existing) {
    throw new NotFoundError('Subscription plan not found');
  }

  const assignedSchoolsCount = await superAdminRepository.countSchoolsWithPlan(id);
  if (assignedSchoolsCount > 0) {
    // If active schools are assigned, safely deactivate rather than breaking FK
    await superAdminRepository.updatePlan(id, { isActive: false });
    return {
      message: `Plan '${existing.name}' has ${assignedSchoolsCount} assigned tenant(s) and was deactivated rather than deleted.`
    };
  }

  await superAdminRepository.deletePlan(id);
  return { message: `Plan '${existing.name}' was successfully deleted.` };
}

/**
 * 9. Subscriptions Overview
 */
export async function getSubscriptions(query = {}) {
  const { page, limit, skip, take } = parsePagination(query, {
    defaultSort: 'createdAt',
    defaultOrder: 'desc'
  });

  const [schools, total] = await Promise.all([
    superAdminRepository.findTenants(query, { skip, take }),
    superAdminRepository.countTenants(query)
  ]);

  const pagination = buildPaginationMetadata(total, page, limit);

  const subscriptions = schools.map((s) => {
    const pricePerYear = s.plan ? Number(s.plan.pricePerUserPerYear) : 0;
    const pricePerMonth = Math.round(pricePerYear / 12);
    return {
      schoolId: s.id,
      schoolName: s.name,
      schoolCode: s.code,
      status: s.status,
      plan: s.plan ? { id: s.plan.id, name: s.plan.name, pricePerYear, pricePerMonth } : null,
      userLimit: s.seatLimit,
      currentUsers: s._count?.users || 0,
      createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : s.createdAt
    };
  });

  return {
    subscriptions,
    pagination
  };
}

/**
 * 10. License & Quota Usage
 */
export async function getLicenseUsage(query = {}) {
  const { page, limit, skip, take } = parsePagination(query, {
    defaultSort: 'name',
    defaultOrder: 'asc'
  });

  const [schools, total] = await Promise.all([
    superAdminRepository.findTenants(query, { skip, take, sort: 'name', order: 'asc' }),
    superAdminRepository.countTenants(query)
  ]);

  const pagination = buildPaginationMetadata(total, page, limit);

  const usageData = schools.map((school) => {
    const studentCount = school._count?.students || 0;
    const teacherCount = school._count?.staffProfiles || 0;
    const studentLimit = school.seatLimit || 500;
    const teacherLimit = school.teacherLimit || 50;

    const studentRatio = studentLimit > 0 ? studentCount / studentLimit : 0;
    const teacherRatio = teacherLimit > 0 ? teacherCount / teacherLimit : 0;

    let status = 'healthy';
    if (studentRatio >= 1.0 || teacherRatio >= 1.0) {
      status = 'exceeded';
    } else if (studentRatio >= 0.85 || teacherRatio >= 0.85) {
      status = 'warning';
    }

    return {
      schoolId: school.id,
      schoolName: school.name,
      schoolCode: school.code,
      planName: school.plan?.name || 'Standard',
      students: {
        current: studentCount,
        limit: studentLimit,
        usagePercentage: Math.min(100, Math.round(studentRatio * 100))
      },
      teachers: {
        current: teacherCount,
        limit: teacherLimit,
        usagePercentage: Math.min(100, Math.round(teacherRatio * 100))
      },
      status
    };
  });

  return {
    licenses: usageData,
    pagination
  };
}
