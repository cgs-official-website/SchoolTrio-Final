import { prisma } from '../../database/prisma.client.js';

/**
 * HR & Payroll Data Access Repository Layer
 *
 * Strict Multi-Tenant Safety Rules:
 * 1. Every query strictly scopes by schoolId.
 * 2. Cross-tenant access is impossible by construction.
 * 3. Supports transaction propagation via optional `tx` parameter.
 */

export const PAYROLL_SELECT_CONFIG = {
  id: true,
  schoolId: true,
  teacherId: true,
  month: true,
  baseSalary: true,
  pfCalculated: true,
  esiCalculated: true,
  deductions: true,
  netPay: true,
  status: true,
  paidAt: true,
  customData: true,
  createdAt: true,
  updatedAt: true,
  staffProfile: {
    select: {
      id: true,
      name: true,
      employeeId: true,
      designation: true,
      staffType: true,
      phone: true,
      email: true
    }
  }
};

/**
 * Finds paginated payroll records for a tenant matching query criteria.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} options
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Array>}
 */
export async function findPayrolls(schoolId, options = {}, tx = prisma) {
  const where = { schoolId };

  if (options.month) {
    where.month = { equals: options.month, mode: 'insensitive' };
  }

  if (options.status) {
    where.status = options.status;
  }

  if (options.staffId) {
    where.teacherId = options.staffId;
  }

  if (options.search) {
    where.staffProfile = {
      OR: [
        { name: { contains: options.search, mode: 'insensitive' } },
        { employeeId: { contains: options.search, mode: 'insensitive' } },
        { designation: { contains: options.search, mode: 'insensitive' } }
      ]
    };
  }

  return tx.hRPayrollRecord.findMany({
    where,
    select: PAYROLL_SELECT_CONFIG,
    skip: options.skip,
    take: options.take,
    orderBy: [
      { createdAt: 'desc' },
      { id: 'desc' }
    ]
  });
}

/**
 * Counts total payroll records for a tenant matching query criteria.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} options
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<number>}
 */
export async function countPayrolls(schoolId, options = {}, tx = prisma) {
  const where = { schoolId };

  if (options.month) {
    where.month = { equals: options.month, mode: 'insensitive' };
  }

  if (options.status) {
    where.status = options.status;
  }

  if (options.staffId) {
    where.teacherId = options.staffId;
  }

  if (options.search) {
    where.staffProfile = {
      OR: [
        { name: { contains: options.search, mode: 'insensitive' } },
        { employeeId: { contains: options.search, mode: 'insensitive' } },
        { designation: { contains: options.search, mode: 'insensitive' } }
      ]
    };
  }

  return tx.hRPayrollRecord.count({ where });
}

/**
 * Finds a single payroll record by ID within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} id - Payroll record UUID
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Object|null>}
 */
export async function findPayrollById(schoolId, id, tx = prisma) {
  return tx.hRPayrollRecord.findFirst({
    where: {
      id,
      schoolId
    },
    select: PAYROLL_SELECT_CONFIG
  });
}

/**
 * Acquires a row-level lock on a payroll record for safe concurrency transitions.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} id - Payroll record UUID
 * @param {Object} tx - Transaction client
 * @returns {Promise<Object|null>}
 */
export async function findPayrollByIdForUpdate(schoolId, id, tx) {
  const rows = await tx.$queryRaw`
    SELECT id, school_id, teacher_id, month, base_salary, status, paid_at
    FROM hr_payroll_records
    WHERE school_id = ${schoolId}::uuid AND id = ${id}::uuid
    FOR UPDATE
  `;
  return rows[0] || null;
}

/**
 * Finds payroll records for a specific staff profile (self-service).
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} staffProfileId - StaffProfile UUID
 * @param {Object} options
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Array>}
 */
export async function findPayrollsByStaffId(schoolId, staffProfileId, options = {}, tx = prisma) {
  const where = {
    schoolId,
    teacherId: staffProfileId
  };

  if (options.month) {
    where.month = { equals: options.month, mode: 'insensitive' };
  }

  return tx.hRPayrollRecord.findMany({
    where,
    select: PAYROLL_SELECT_CONFIG,
    orderBy: [
      { createdAt: 'desc' },
      { id: 'desc' }
    ]
  });
}

/**
 * Checks whether a payroll record already exists for the given staff member and month.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} teacherId - StaffProfile UUID
 * @param {string} month - Payroll month string
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<boolean>}
 */
export async function payrollExists(schoolId, teacherId, month, tx = prisma) {
  const count = await tx.hRPayrollRecord.count({
    where: {
      schoolId,
      teacherId,
      month
    }
  });
  return count > 0;
}

/**
 * Creates a single payroll record.
 *
 * @param {Object} data
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Object>}
 */
export async function createPayroll(data, tx = prisma) {
  return tx.hRPayrollRecord.create({
    data,
    select: PAYROLL_SELECT_CONFIG
  });
}

/**
 * Updates a payroll record by ID within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} id - Payroll record UUID
 * @param {Object} data
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Object>}
 */
export async function updatePayroll(schoolId, id, data, tx = prisma) {
  return tx.hRPayrollRecord.update({
    where: {
      schoolId_id: {
        schoolId,
        id
      }
    },
    data,
    select: PAYROLL_SELECT_CONFIG
  });
}

/**
 * Deletes a payroll record by ID within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} id - Payroll record UUID
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Object>}
 */
export async function deletePayroll(schoolId, id, tx = prisma) {
  return tx.hRPayrollRecord.delete({
    where: {
      schoolId_id: {
        schoolId,
        id
      }
    }
  });
}

/**
 * Finds HR configuration setting for a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Object|null>}
 */
export async function findHRConfig(schoolId, tx = prisma) {
  return tx.schoolSetting.findFirst({
    where: {
      schoolId,
      category: 'hrConfig'
    }
  });
}

/**
 * Upserts HR configuration setting for a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} configData
 * @param {Object} [tx] - Optional transaction client
 * @returns {Promise<Object>}
 */
export async function upsertHRConfig(schoolId, configData, tx = prisma) {
  return tx.schoolSetting.upsert({
    where: {
      schoolId_category: {
        schoolId,
        category: 'hrConfig'
      }
    },
    update: {
      data: configData
    },
    create: {
      schoolId,
      category: 'hrConfig',
      data: configData
    }
  });
}
