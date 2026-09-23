import * as hrPayrollRepository from './hr-payroll.repository.js';
import * as staffRepository from '../staff/staff.repository.js';
import { prisma } from '../../database/prisma.client.js';
import { createAuditLog } from '../audit/audit.repository.js';
import {
  NotFoundError,
  ConflictError,
  TenantAccessError,
  ValidationError
} from '../../utils/app-error.js';

/**
 * HR & Payroll Business Logic Service Layer
 */

/**
 * Calculates statutory PF and ESI deductions based on confirmed application business rules.
 *
 * Rules:
 * - PF: 12% on salary capped at ₹15,000 (Math.round(min(salary, 15000) * 0.12), max ₹1,800).
 * - ESI: 0.75% on salary if salary <= ₹21,000 (Math.round(salary * 0.0075)), otherwise 0.
 * - Total = PF + ESI.
 *
 * @param {number} salary - Base salary amount
 * @returns {{ pf: number, esi: number, total: number }}
 */
export function calculateDeductions(salary) {
  const numericSalary = Math.max(0, Number(salary) || 0);
  const pfCeiling = 15000;
  const pfApplicable = Math.min(numericSalary, pfCeiling);
  const pf = Math.round(pfApplicable * 0.12);

  const esiCeiling = 21000;
  const esi = numericSalary <= esiCeiling ? Math.round(numericSalary * 0.0075) : 0;

  return { pf, esi, total: pf + esi };
}

/**
 * Lists paginated payroll records for admin view.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} query - Query options
 * @returns {Promise<{ records: Array, total: number }>}
 */
export async function listPayrolls(schoolId, query = {}) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to list payroll records');
  }

  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 50));
  const skip = (page - 1) * limit;

  const options = {
    skip,
    take: limit,
    month: query.month?.trim(),
    status: query.status,
    staffId: query.staffId,
    search: query.search?.trim()
  };

  const [records, total] = await Promise.all([
    hrPayrollRepository.findPayrolls(schoolId, options),
    hrPayrollRepository.countPayrolls(schoolId, options)
  ]);

  return { records, total };
}

/**
 * Returns payroll records for the authenticated staff/teacher (self-service).
 * Resolves user.id -> StaffProfile -> teacherId server-side.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} userId - Authenticated User UUID
 * @param {Object} query - Query options (month)
 * @returns {Promise<Array>}
 */
export async function getMySalary(schoolId, userId, query = {}) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required');
  }

  const staffProfile = await staffRepository.findStaffByUserId(schoolId, userId);
  if (!staffProfile) {
    throw new NotFoundError('Staff profile not found for this user account');
  }

  const options = {
    month: query.month?.trim()
  };

  return hrPayrollRepository.findPayrollsByStaffId(schoolId, staffProfile.id, options);
}

/**
 * Generates monthly payroll records for tenant staff members.
 * Executes inside a Prisma interactive transaction.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} body - Generation request payload
 * @param {Object} actor - Authenticated user context
 * @returns {Promise<{ count: number, records: Array }>}
 */
export async function generatePayroll(schoolId, body, actor = {}) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to generate payroll');
  }

  const month = body.month.trim();

  // Execute atomically
  const createdRecords = await prisma.$transaction(async (tx) => {
    let staffList = [];

    if (body.records && body.records.length > 0) {
      // Overrides provided: validate all staff IDs belong to this tenant
      const staffIds = body.records.map((r) => r.staffId);
      const fetchedStaff = await tx.staffProfile.findMany({
        where: {
          schoolId,
          id: { in: staffIds }
        }
      });

      if (fetchedStaff.length !== staffIds.length) {
        throw new ValidationError('One or more staff members not found in this tenant');
      }

      staffList = body.records.map((rec) => {
        const staff = fetchedStaff.find((s) => s.id === rec.staffId);
        return {
          staff,
          override: rec
        };
      });
    } else if (body.staffIds && body.staffIds.length > 0) {
      // Specific staff IDs without manual overrides
      const fetchedStaff = await tx.staffProfile.findMany({
        where: {
          schoolId,
          id: { in: body.staffIds },
          status: 'Active'
        }
      });

      if (fetchedStaff.length !== body.staffIds.length) {
        throw new ValidationError('One or more selected staff members not found or inactive');
      }

      staffList = fetchedStaff.map((staff) => ({ staff, override: null }));
    } else {
      // All active staff in tenant
      const fetchedStaff = await tx.staffProfile.findMany({
        where: {
          schoolId,
          status: 'Active'
        }
      });

      if (fetchedStaff.length === 0) {
        throw new ValidationError('No active staff members found in this tenant to generate payroll');
      }

      staffList = fetchedStaff.map((staff) => ({ staff, override: null }));
    }

    const results = [];

    for (const item of staffList) {
      const { staff, override } = item;

      // Duplicate check
      const alreadyExists = await hrPayrollRepository.payrollExists(schoolId, staff.id, month, tx);
      if (alreadyExists) {
        throw new ConflictError(
          `Payroll for staff ${staff.name} (${staff.employeeId || staff.id}) already exists for ${month}`
        );
      }

      const authoritativeBase = Number(staff.baseSalary || 0);
      const baseSalary =
        override && override.baseSalary !== undefined ? Math.max(0, override.baseSalary) : authoritativeBase;

      const calculated = calculateDeductions(baseSalary);

      const pfCalculated =
        override && override.pfCalculated !== undefined ? Math.max(0, override.pfCalculated) : calculated.pf;
      const esiCalculated =
        override && override.esiCalculated !== undefined ? Math.max(0, override.esiCalculated) : calculated.esi;
      const deductions =
        override && override.deductions !== undefined ? Math.max(0, override.deductions) : calculated.total;

      const netPay =
        override && override.netPay !== undefined ? override.netPay : baseSalary - deductions;

      const recordData = {
        schoolId,
        teacherId: staff.id,
        month,
        baseSalary,
        pfCalculated,
        esiCalculated,
        deductions,
        netPay,
        status: 'Pending',
        customData: override?.customData || null
      };

      const created = await hrPayrollRepository.createPayroll(recordData, tx);
      results.push(created);
    }

    return results;
  });

  // Non-blocking Audit log
  createAuditLog({
    schoolId,
    entityType: 'HRPayrollRecord',
    entityId: createdRecords.map((r) => r.id).join(','),
    actionPerformed: `Generated payroll for ${createdRecords.length} staff member(s) for ${month}`,
    userName: actor.email || actor.name || 'Administrator',
    userRole: actor.systemRole || actor.role || 'Admin',
    modifiedFields: { count: createdRecords.length, month }
  }).catch(() => {});

  return {
    count: createdRecords.length,
    records: createdRecords
  };
}

/**
 * Updates status of a payroll record.
 * Uses interactive transaction and row-level locking.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} id - Payroll record UUID
 * @param {Object} body - Status update payload
 * @param {Object} actor - Authenticated user context
 * @returns {Promise<Object>}
 */
export async function updatePayrollStatus(schoolId, id, body, actor = {}) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required');
  }

  const { status, paidAt } = body;

  const updated = await prisma.$transaction(async (tx) => {
    // Acquire row-level lock
    const locked = await hrPayrollRepository.findPayrollByIdForUpdate(schoolId, id, tx);
    if (!locked) {
      throw new NotFoundError('Payroll record not found');
    }

    // Handle timestamp updates
    let updatedPaidAt = locked.paid_at;
    if (status === 'Paid' || status === 'Payslip Released') {
      updatedPaidAt = paidAt ? new Date(paidAt) : (locked.paid_at || new Date());
    } else if (status === 'Pending') {
      updatedPaidAt = null;
    }

    return hrPayrollRepository.updatePayroll(
      schoolId,
      id,
      {
        status,
        paidAt: updatedPaidAt
      },
      tx
    );
  });

  // Non-blocking Audit log
  createAuditLog({
    schoolId,
    entityType: 'HRPayrollRecord',
    entityId: id,
    actionPerformed: `Updated payroll status to '${status}'`,
    userName: actor.email || actor.name || 'Administrator',
    userRole: actor.systemRole || actor.role || 'Admin',
    modifiedFields: { status, paidAt: updated.paidAt }
  }).catch(() => {});

  return updated;
}

/**
 * Deletes a draft payroll record.
 * Allowed ONLY if status is 'Pending'.
 * Uses transaction and row-level locking to prevent race with concurrent payment.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} id - Payroll record UUID
 * @param {Object} actor - Authenticated user context
 * @returns {Promise<void>}
 */
export async function deletePayroll(schoolId, id, actor = {}) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required');
  }

  await prisma.$transaction(async (tx) => {
    const locked = await hrPayrollRepository.findPayrollByIdForUpdate(schoolId, id, tx);
    if (!locked) {
      throw new NotFoundError('Payroll record not found');
    }

    if (locked.status !== 'Pending') {
      throw new ValidationError(
        `Cannot delete payroll record in '${locked.status}' status. Only draft records in 'Pending' status can be deleted.`
      );
    }

    await hrPayrollRepository.deletePayroll(schoolId, id, tx);
  });

  // Non-blocking Audit log
  createAuditLog({
    schoolId,
    entityType: 'HRPayrollRecord',
    entityId: id,
    actionPerformed: 'Deleted pending payroll draft record',
    userName: actor.email || actor.name || 'Administrator',
    userRole: actor.systemRole || actor.role || 'Admin',
    modifiedFields: { id }
  }).catch(() => {});
}

/**
 * Retrieves HR configuration settings for tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @returns {Promise<{ authorizedSignature: string|null }>}
 */
export async function getHRConfig(schoolId) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required');
  }

  const setting = await hrPayrollRepository.findHRConfig(schoolId);
  return {
    authorizedSignature: setting?.data?.authorizedSignature || null
  };
}

/**
 * Updates HR configuration settings for tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} data - Configuration payload
 * @param {Object} actor - Authenticated user context
 * @returns {Promise<{ authorizedSignature: string|null }>}
 */
export async function updateHRConfig(schoolId, data, actor = {}) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required');
  }

  const configData = {
    authorizedSignature: data.authorizedSignature || null
  };

  const updatedSetting = await hrPayrollRepository.upsertHRConfig(schoolId, configData);

  // Non-blocking Audit log
  createAuditLog({
    schoolId,
    entityType: 'SchoolSetting',
    entityId: updatedSetting.id,
    actionPerformed: 'Updated HR configuration / authorized signature',
    userName: actor.email || actor.name || 'Administrator',
    userRole: actor.systemRole || actor.role || 'Admin',
    modifiedFields: { category: 'hrConfig', authorizedSignature: configData.authorizedSignature ? 'UPDATED' : 'REMOVED' }
  }).catch(() => {});

  return {
    authorizedSignature: updatedSetting.data?.authorizedSignature || null
  };
}
