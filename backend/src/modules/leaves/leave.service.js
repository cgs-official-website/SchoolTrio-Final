import * as leaveRepository from './leave.repository.js';
import { createAuditLog } from '../audit/audit.repository.js';
import { SYSTEM_ROLES } from '../../config/constants.js';
import {
  TenantAccessError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
  ValidationError
} from '../../utils/app-error.js';

/**
 * Serializes raw LeaveApplication database entity for safe student/parent client response.
 *
 * @param {Object} leave - Raw Prisma LeaveApplication record
 * @returns {Object} Safe DTO
 */
export function formatLeave(leave) {
  if (!leave) return null;

  const customData = leave.customData && typeof leave.customData === 'object' ? leave.customData : {};

  return {
    id: leave.id,
    studentId: leave.applicantId,
    leaveType: leave.leaveType,
    startDate: leave.startDate,
    endDate: leave.endDate,
    reason: leave.reason || null,
    status: leave.status,
    reviewedBy: leave.reviewedBy || null,
    supportingDoc: customData.supportingDoc || null,
    createdAt: leave.createdAt,
    updatedAt: leave.updatedAt
  };
}

/**
 * Serializes raw LeaveApplication entity enriched with resolved applicant metadata for Admin/Staff responses.
 *
 * @param {Object} leave - Raw Prisma LeaveApplication record
 * @param {Map<string, { applicantName: string, applicantRole: string }>} [applicantMap=new Map()]
 * @returns {Object} Enriched DTO
 */
export function formatTenantLeave(leave, applicantMap = new Map()) {
  if (!leave) return null;

  const customData = leave.customData && typeof leave.customData === 'object' ? leave.customData : {};
  const resolved = applicantMap.get(leave.applicantId) || {};

  const applicantName = resolved.applicantName || customData.applicantName || 'Applicant';
  const applicantRole = resolved.applicantRole || customData.applicantRole || 'student';

  return {
    id: leave.id,
    applicantId: leave.applicantId,
    applicantName,
    applicantRole,
    leaveType: leave.leaveType,
    startDate: leave.startDate,
    endDate: leave.endDate,
    reason: leave.reason || null,
    status: leave.status,
    reviewedBy: leave.reviewedBy || null,
    supportingDoc: customData.supportingDoc || null,
    submittedAt: leave.createdAt,
    createdAt: leave.createdAt,
    updatedAt: leave.updatedAt
  };
}

/**
 * Retrieves student leave applications for authenticated parent or authorized staff.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} studentId - Student UUID
 * @param {Object} [query={}] - Query parameters (page, limit, status, order)
 * @param {Object} [requester=null] - Authenticated user context
 * @returns {Promise<{ leaves: Array, pagination: Object }>}
 */
export async function getStudentLeaves(schoolId, studentId, query = {}, requester = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to retrieve student leaves');
  }

  // 1. Verify student exists in tenant
  const student = await leaveRepository.findStudentInTenant(schoolId, studentId);
  if (!student) {
    throw new NotFoundError('Student');
  }

  // 2. Check parent authorization
  const isParent = requester?.systemRole === SYSTEM_ROLES.PARENT || requester?.role === SYSTEM_ROLES.PARENT;
  if (isParent) {
    const userId = requester.userId || requester.id;
    const authorizedStudentIds = await leaveRepository.findAuthorizedStudentIdsForParent(schoolId, userId);

    if (!authorizedStudentIds.includes(studentId)) {
      throw new NotFoundError('Student');
    }
  }

  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(500, Math.max(1, Number(query.limit) || 50));

  const options = {
    page,
    limit,
    status: query.status,
    order: query.order || 'desc'
  };

  const { leaves, total } = await leaveRepository.findStudentLeaves(schoolId, studentId, options);
  const totalPages = Math.ceil(total / limit) || 1;

  return {
    leaves: leaves.map(formatLeave),
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1
    }
  };
}

/**
 * Creates a student leave application for an authenticated parent or authorized staff.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} studentId - Student UUID
 * @param {Object} data - Validated leave data ({ leaveType, startDate, endDate, reason, supportingDoc })
 * @param {Object} [requester=null] - Authenticated user context
 * @returns {Promise<Object>} Created leave DTO
 */
export async function createStudentLeave(schoolId, studentId, data, requester = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to create leave application');
  }

  // 1. Verify student exists in tenant
  const student = await leaveRepository.findStudentInTenant(schoolId, studentId);
  if (!student) {
    throw new NotFoundError('Student');
  }

  // 2. Check parent authorization
  const isParent = requester?.systemRole === SYSTEM_ROLES.PARENT || requester?.role === SYSTEM_ROLES.PARENT;
  if (isParent) {
    const userId = requester.userId || requester.id;
    const authorizedStudentIds = await leaveRepository.findAuthorizedStudentIdsForParent(schoolId, userId);

    if (!authorizedStudentIds.includes(studentId)) {
      throw new NotFoundError('Student');
    }
  }

  // 3. Create leave record with strictly enforced status: 'Pending'
  const createdLeave = await leaveRepository.createLeave(schoolId, studentId, {
    leaveType: data.leaveType,
    startDate: data.startDate,
    endDate: data.endDate,
    reason: data.reason,
    supportingDoc: data.supportingDoc || null
  });

  // 4. Non-blocking post-commit audit logging
  createAuditLog({
    schoolId,
    entityType: 'LeaveApplication',
    entityId: createdLeave.id,
    actionPerformed: 'CREATE_LEAVE_APPLICATION',
    userName: requester?.name || requester?.email || 'Parent',
    userRole: requester?.systemRole || requester?.role || 'PARENT',
    modifiedFields: {
      studentId,
      leaveType: createdLeave.leaveType,
      startDate: createdLeave.startDate,
      endDate: createdLeave.endDate
    }
  });

  return formatLeave(createdLeave);
}

/**
 * Retrieves the count of pending leave applications within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} [actor=null] - Authenticated user context
 * @returns {Promise<{ count: number }>}
 */
export async function getPendingLeavesCount(schoolId, _actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to retrieve pending leave count');
  }

  const count = await leaveRepository.countPendingLeaves(schoolId);
  return { count };
}

/**
 * Lists all leave applications across a tenant for administrative review.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} [query={}] - Query filters (page, limit, status, applicantRole, search, order)
 * @param {Object} [_actor=null] - Authenticated user context
 * @returns {Promise<{ leaves: Array, pagination: Object }>}
 */
export async function listTenantLeaves(schoolId, query = {}, _actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to list leaves');
  }

  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(500, Math.max(1, Number(query.limit) || 50));

  const options = {
    page,
    limit,
    status: query.status,
    applicantRole: query.applicantRole,
    search: query.search,
    order: query.order || 'desc'
  };

  const { leaves, total } = await leaveRepository.findTenantLeaves(schoolId, options);
  const applicantMap = await leaveRepository.resolveApplicantMap(schoolId, leaves);

  let formatted = leaves.map(l => formatTenantLeave(l, applicantMap));

  if (options.applicantRole && options.applicantRole !== 'all') {
    formatted = formatted.filter(l => l.applicantRole === options.applicantRole);
  }

  const totalPages = Math.ceil(total / limit) || 1;

  return {
    leaves: formatted,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1
    }
  };
}

/**
 * Retrieves a single leave application by ID within tenant context.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} leaveId - LeaveApplication UUID
 * @param {Object} [_actor=null]
 * @returns {Promise<Object>}
 */
export async function getLeaveById(schoolId, leaveId, _actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to retrieve leave application');
  }

  const leave = await leaveRepository.findLeaveById(schoolId, leaveId);
  if (!leave) {
    throw new NotFoundError('Leave application');
  }

  const applicantMap = await leaveRepository.resolveApplicantMap(schoolId, [leave]);
  return formatTenantLeave(leave, applicantMap);
}

/**
 * Updates the status of a pending leave application ('Approved' | 'Rejected') with concurrency conflict safety.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} leaveId - LeaveApplication UUID
 * @param {string} newStatus - 'Approved' | 'Rejected'
 * @param {Object} actor - Authenticated reviewer context
 * @returns {Promise<Object>} Updated leave DTO
 */
export async function updateLeaveStatus(schoolId, leaveId, newStatus, actor) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to update leave status');
  }

  const reviewerId = actor?.id || actor?.userId;

  const updateCount = await leaveRepository.updateLeaveStatus(schoolId, leaveId, newStatus, reviewerId);
  if (updateCount === 0) {
    const existing = await leaveRepository.findLeaveById(schoolId, leaveId);
    if (!existing) {
      throw new NotFoundError('Leave application');
    }
    throw new ConflictError(`Leave request has already been reviewed (current status: ${existing.status})`);
  }

  const updatedLeave = await leaveRepository.findLeaveById(schoolId, leaveId);
  const applicantMap = await leaveRepository.resolveApplicantMap(schoolId, [updatedLeave]);

  createAuditLog({
    schoolId,
    entityType: 'LeaveApplication',
    entityId: leaveId,
    actionPerformed: newStatus === 'Approved' ? 'APPROVE_LEAVE' : 'REJECT_LEAVE',
    userName: actor?.name || actor?.email || 'Admin',
    userRole: actor?.systemRole || actor?.role || 'ADMIN',
    modifiedFields: {
      status: newStatus,
      reviewedBy: reviewerId
    }
  });

  return formatTenantLeave(updatedLeave, applicantMap);
}

/**
 * Deletes a leave application within tenant context.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} leaveId - LeaveApplication UUID
 * @param {Object} actor - Authenticated user context
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export async function deleteLeave(schoolId, leaveId, actor) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to delete leave application');
  }

  const existing = await leaveRepository.findLeaveById(schoolId, leaveId);
  if (!existing) {
    throw new NotFoundError('Leave application');
  }

  await leaveRepository.deleteLeave(schoolId, leaveId);

  createAuditLog({
    schoolId,
    entityType: 'LeaveApplication',
    entityId: leaveId,
    actionPerformed: 'DELETE_LEAVE',
    userName: actor?.name || actor?.email || 'Admin',
    userRole: actor?.systemRole || actor?.role || 'ADMIN',
    modifiedFields: {
      deletedLeaveId: leaveId,
      leaveType: existing.leaveType,
      status: existing.status
    }
  });

  return { success: true, message: 'Leave application deleted successfully' };
}

/**
 * Lists leave applications for the authenticated staff member.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} actor - Authenticated staff user
 * @param {Object} [query={}] - Query filters
 * @returns {Promise<{ leaves: Array, pagination: Object }>}
 */
export async function getStaffLeaves(schoolId, actor, query = {}) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to list staff leaves');
  }

  const userId = actor?.id || actor?.userId;
  const staffProfile = await leaveRepository.findStaffProfileByUserId(schoolId, userId);
  if (!staffProfile) {
    throw new ForbiddenError('Staff profile not found for this user in current tenant');
  }

  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(500, Math.max(1, Number(query.limit) || 50));

  const options = {
    page,
    limit,
    status: query.status,
    order: query.order || 'desc'
  };

  const { leaves, total } = await leaveRepository.findStaffLeaves(schoolId, staffProfile.id, options);
  const totalPages = Math.ceil(total / limit) || 1;

  const applicantMap = new Map();
  applicantMap.set(staffProfile.id, {
    applicantName: staffProfile.name || 'Staff Member',
    applicantRole: staffProfile.staffType === 'teaching' ? 'teacher' : 'staff'
  });

  return {
    leaves: leaves.map(l => formatTenantLeave(l, applicantMap)),
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1
    }
  };
}

/**
 * Submits a new staff leave application for the authenticated staff member.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} actor - Authenticated staff user
 * @param {Object} data - Validated staff leave details
 * @returns {Promise<Object>} Created staff leave DTO
 */
export async function createStaffLeave(schoolId, actor, data) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to create staff leave');
  }

  const userId = actor?.id || actor?.userId;
  const staffProfile = await leaveRepository.findStaffProfileByUserId(schoolId, userId);
  if (!staffProfile) {
    throw new ForbiddenError('Staff profile not found for this user in current tenant');
  }

  const createdLeave = await leaveRepository.createStaffLeave(schoolId, staffProfile.id, {
    leaveType: data.leaveType,
    startDate: data.startDate,
    endDate: data.endDate,
    reason: data.reason,
    applicantRole: staffProfile.staffType === 'teaching' ? 'teacher' : 'staff',
    applicantName: staffProfile.name || actor.name || 'Staff Member',
    supportingDoc: data.supportingDoc || null
  });

  createAuditLog({
    schoolId,
    entityType: 'LeaveApplication',
    entityId: createdLeave.id,
    actionPerformed: 'CREATE_STAFF_LEAVE',
    userName: staffProfile.name || actor?.name || actor?.email || 'Staff',
    userRole: actor?.systemRole || actor?.role || 'TEACHER',
    modifiedFields: {
      staffProfileId: staffProfile.id,
      leaveType: createdLeave.leaveType,
      startDate: createdLeave.startDate,
      endDate: createdLeave.endDate
    }
  });

  const applicantMap = new Map();
  applicantMap.set(staffProfile.id, {
    applicantName: staffProfile.name || 'Staff Member',
    applicantRole: staffProfile.staffType === 'teaching' ? 'teacher' : 'staff'
  });

  return formatTenantLeave(createdLeave, applicantMap);
}

// ============================================================
// LEAVE APPROVAL RULES SERVICE METHODS
// ============================================================

/**
 * Formats a raw LeaveApprovalRule database record into a clean DTO.
 *
 * @param {Object} rule - Raw Prisma LeaveApprovalRule record
 * @returns {Object|null}
 */
export function formatLeaveApprovalRule(rule) {
  if (!rule) return null;

  return {
    id: rule.id,
    schoolId: rule.schoolId,
    roleId: rule.roleId,
    minDays: rule.minDays,
    maxDays: rule.maxDays,
    order: rule.order,
    role: rule.role
      ? {
          id: rule.role.id,
          name: rule.role.name,
          slug: rule.role.slug
        }
      : null,
    createdAt: rule.createdAt,
    updatedAt: rule.updatedAt
  };
}

/**
 * Lists all leave approval rules for the active tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @returns {Promise<Array>}
 */
export async function listLeaveApprovalRules(schoolId) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to list leave approval rules');
  }

  const rules = await leaveRepository.findLeaveApprovalRules(schoolId);
  return rules.map(formatLeaveApprovalRule);
}

/**
 * Creates a new leave approval rule within the tenant context.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} data - Validated rule payload { minDays, maxDays, roleId, order }
 * @param {Object} [actor=null] - Requesting user context
 * @returns {Promise<Object>}
 */
export async function createLeaveApprovalRule(schoolId, data, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to create leave approval rule');
  }

  // Verify role exists in the active tenant
  const role = await leaveRepository.findSchoolRoleInTenant(schoolId, data.roleId);
  if (!role) {
    throw new NotFoundError('Role not found for active school');
  }

  const rule = await leaveRepository.createLeaveApprovalRule(schoolId, data);

  // Non-blocking Audit Logging
  createAuditLog({
    schoolId,
    entityType: 'LeaveApprovalRule',
    entityId: rule.id,
    actionPerformed: 'CREATE_LEAVE_APPROVAL_RULE',
    userName: actor?.name || actor?.email || 'Admin User',
    userRole: actor?.systemRole || actor?.role || 'SCHOOL_ADMIN',
    modifiedFields: {
      ruleId: rule.id,
      roleId: data.roleId,
      roleName: role.name,
      minDays: data.minDays,
      maxDays: data.maxDays ?? null,
      order: data.order ?? 1
    }
  });

  return formatLeaveApprovalRule(rule);
}

/**
 * Updates an existing leave approval rule.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} ruleId - Rule UUID
 * @param {Object} data - Update payload
 * @param {Object} [actor=null] - Requesting user context
 * @returns {Promise<Object>}
 */
export async function updateLeaveApprovalRule(schoolId, ruleId, data, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to update leave approval rule');
  }

  const existing = await leaveRepository.findLeaveApprovalRuleById(schoolId, ruleId);
  if (!existing) {
    throw new NotFoundError('Leave approval rule');
  }

  // If roleId is being changed, verify the new role belongs to the active tenant
  if (data.roleId && data.roleId !== existing.roleId) {
    const role = await leaveRepository.findSchoolRoleInTenant(schoolId, data.roleId);
    if (!role) {
      throw new NotFoundError('Role not found for active school');
    }
  }

  // Cross-field min/max validation for partial updates
  const effectiveMin = data.minDays !== undefined ? data.minDays : existing.minDays;
  const effectiveMax = data.maxDays !== undefined ? data.maxDays : existing.maxDays;

  if (effectiveMax !== null && effectiveMax !== undefined && effectiveMax < effectiveMin) {
    throw new ValidationError('maxDays cannot be less than minDays');
  }

  const updated = await leaveRepository.updateLeaveApprovalRule(schoolId, ruleId, data);

  // Non-blocking Audit Logging
  createAuditLog({
    schoolId,
    entityType: 'LeaveApprovalRule',
    entityId: ruleId,
    actionPerformed: 'UPDATE_LEAVE_APPROVAL_RULE',
    userName: actor?.name || actor?.email || 'Admin User',
    userRole: actor?.systemRole || actor?.role || 'SCHOOL_ADMIN',
    modifiedFields: {
      ruleId,
      previous: {
        roleId: existing.roleId,
        minDays: existing.minDays,
        maxDays: existing.maxDays,
        order: existing.order
      },
      updated: {
        roleId: updated.roleId,
        minDays: updated.minDays,
        maxDays: updated.maxDays,
        order: updated.order
      }
    }
  });

  return formatLeaveApprovalRule(updated);
}

/**
 * Deletes an existing leave approval rule.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} ruleId - Rule UUID
 * @param {Object} [actor=null] - Requesting user context
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export async function deleteLeaveApprovalRule(schoolId, ruleId, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to delete leave approval rule');
  }

  const existing = await leaveRepository.findLeaveApprovalRuleById(schoolId, ruleId);
  if (!existing) {
    throw new NotFoundError('Leave approval rule');
  }

  await leaveRepository.deleteLeaveApprovalRule(schoolId, ruleId);

  // Non-blocking Audit Logging
  createAuditLog({
    schoolId,
    entityType: 'LeaveApprovalRule',
    entityId: ruleId,
    actionPerformed: 'DELETE_LEAVE_APPROVAL_RULE',
    userName: actor?.name || actor?.email || 'Admin User',
    userRole: actor?.systemRole || actor?.role || 'SCHOOL_ADMIN',
    modifiedFields: {
      ruleId,
      deletedRule: {
        roleId: existing.roleId,
        minDays: existing.minDays,
        maxDays: existing.maxDays,
        order: existing.order
      }
    }
  });

  return { success: true, message: 'Leave approval rule deleted successfully' };
}

