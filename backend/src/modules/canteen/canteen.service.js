import * as canteenRepository from './canteen.repository.js';
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
 * Checks if actor is a Parent.
 */
function isParent(actor) {
  const role = (actor?.systemRole || actor?.role || '').toUpperCase();
  return role === SYSTEM_ROLES.PARENT || role === 'PARENT';
}

/**
 * Checks if actor is a Teacher.
 */
function isTeacher(actor) {
  const role = (actor?.systemRole || actor?.role || '').toUpperCase();
  return role === SYSTEM_ROLES.TEACHER || role === 'TEACHER' || actor?.loginPanel === 'teacher';
}

/**
 * Maps a raw CanteenRequest database row to client DTO.
 */
export function formatCanteenRequestDto(record) {
  if (!record) return null;
  const details = record.itemDetails || {};
  const student = record.student || {};
  const studentClass = student.class || null;
  const studentSection = student.section || null;

  return {
    id: record.id,
    schoolId: record.schoolId,
    studentId: record.studentId,
    mealType: details.mealType || 'Meal',
    date: details.date || (record.createdAt ? new Date(record.createdAt).toISOString().split('T')[0] : ''),
    status: record.status,
    totalAmount: record.totalAmount !== null ? Number(record.totalAmount) : 0,
    itemDetails: details,
    resolvedAt: details.resolvedAt || null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    student: {
      id: student.id,
      name: `${student.firstName || ''} ${student.lastName || ''}`.trim() || 'Unknown Student',
      firstName: student.firstName || '',
      lastName: student.lastName || '',
      admissionNumber: student.admissionNumber || 'N/A',
      classId: student.classId || null,
      sectionId: student.sectionId || null,
      className: studentClass ? (studentSection ? `${studentClass.name} - Section ${studentSection.name}` : studentClass.name) : 'N/A'
    }
  };
}

/**
 * Retrieves the count of pending canteen meal requests for the authoritative tenant.
 *
 * @param {string} schoolId - Validated School UUID from tenant context
 * @param {Object} [_actor] - Authenticated user context
 * @returns {Promise<{ count: number }>}
 */
export async function getPendingCanteenCount(schoolId, _actor) {
  if (!schoolId) {
    throw new ValidationError('Tenant context required: schoolId is missing');
  }

  const count = await canteenRepository.countPendingCanteenRequests(schoolId);

  return { count };
}

/**
 * Lists canteen meal requests scoped by tenant and role/custody.
 *
 * @param {string} schoolId - School UUID
 * @param {Object} [query={}] - Query filters (status, date, mealType, search, studentId, limit, page)
 * @param {Object} [actor={}] - Authenticated user context
 * @returns {Promise<Array<Object>>}
 */
export async function listCanteenRequests(schoolId, query = {}, actor = {}) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to list canteen requests');
  }

  const filterOptions = { ...query };

  // 1. Parent Scope Enforcement: restrict strictly to linked children
  if (isParent(actor)) {
    const parentUserId = actor.id || actor.userId;
    const authorizedStudentIds = await canteenRepository.findAuthorizedStudentIdsForParent(schoolId, parentUserId);

    if (authorizedStudentIds.length === 0) {
      return [];
    }

    if (query.studentId) {
      if (!authorizedStudentIds.includes(query.studentId)) {
        throw new ForbiddenError('Access denied: Requested student is not linked to your parent account');
      }
      filterOptions.studentId = query.studentId;
    } else {
      filterOptions.studentIds = authorizedStudentIds;
    }
  }

  // 2. Teacher Scope Enforcement
  if (isTeacher(actor) && !actor.hasPermission) {
    const profile = await canteenRepository.findStaffProfileByUserId(schoolId, actor.id || actor.userId);
    if (profile?.assignedClassId) {
      filterOptions.classId = profile.assignedClassId;
    }
  }

  const rawRecords = await canteenRepository.findCanteenRequests(schoolId, filterOptions);

  return rawRecords.map(formatCanteenRequestDto);
}

/**
 * Creates a new Canteen meal request.
 *
 * @param {string} schoolId - School UUID
 * @param {Object} data - Request data ({ studentId, mealType, date })
 * @param {Object} [actor={}] - Authenticated user context
 * @returns {Promise<Object>}
 */
export async function createCanteenRequest(schoolId, data, actor = {}) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to create canteen request');
  }

  const { studentId, mealType } = data;
  const date = data.date || new Date().toISOString().split('T')[0];

  // 1. Parent Custody Authorization Check
  if (isParent(actor)) {
    const parentUserId = actor.id || actor.userId;
    const authorizedStudentIds = await canteenRepository.findAuthorizedStudentIdsForParent(schoolId, parentUserId);

    if (!authorizedStudentIds.includes(studentId)) {
      throw new ForbiddenError('You are not authorized to create canteen requests for this student');
    }
  } else {
    // 2. Staff / Admin Verification: Ensure student exists in tenant
    const student = await canteenRepository.findStudentInTenant(schoolId, studentId);
    if (!student) {
      throw new NotFoundError('Student not found in active school');
    }
  }

  // 3. Atomically check and insert within transaction
  const createdRecord = await canteenRepository.runTransaction(async (tx) => {
    // Acquire PostgreSQL advisory lock on student + date + mealType
    try {
      await canteenRepository.acquireAdvisoryLock(schoolId, studentId, date, mealType, tx);
    } catch {}

    // Acquire exclusive row lock on the student
    try {
      await canteenRepository.lockStudentForUpdate(schoolId, studentId, tx);
    } catch {}

    // Check for existing active request
    const existing = await canteenRepository.findActiveCanteenRequest(schoolId, studentId, date, mealType, tx);
    if (existing) {
      throw new ConflictError(
        `A canteen request of type '${mealType}' for this student on ${date} already exists (status: ${existing.status})`
      );
    }

    return canteenRepository.createCanteenRequest(
      schoolId,
      {
        studentId,
        mealType,
        date
      },
      tx
    );
  });

  // 4. Non-blocking audit logging
  createAuditLog({
    schoolId,
    entityType: 'CanteenRequest',
    entityId: createdRecord.id,
    actionPerformed: 'CREATE_CANTEEN_REQUEST',
    userName: actor?.name || actor?.email || 'User',
    userRole: actor?.role || actor?.systemRole || null,
    modifiedFields: {
      studentId,
      mealType,
      date,
      status: 'Pending'
    }
  }).catch(() => {});

  return formatCanteenRequestDto(createdRecord);
}

/**
 * Updates status of an existing Canteen request.
 *
 * @param {string} schoolId - School UUID
 * @param {string} id - CanteenRequest UUID
 * @param {Object} data - Update data ({ status })
 * @param {Object} [actor={}] - Authenticated user context
 * @returns {Promise<Object>}
 */
export async function updateCanteenRequestStatus(schoolId, id, data, actor = {}) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to update canteen request');
  }

  const newStatus = data.status;
  let previousStatus = null;

  const updatedRecord = await canteenRepository.runTransaction(async (tx) => {
    // 1. Lock the canteen request row FOR UPDATE
    let row;
    try {
      row = await canteenRepository.lockCanteenRequestForUpdate(schoolId, id, tx);
    } catch {
      row = await tx.canteenRequest.findFirst({
        where: { schoolId, id }
      });
    }

    if (!row) {
      throw new NotFoundError('Canteen request not found in active school');
    }

    previousStatus = row.status;

    // 2. Parent Scope & Cancellation Gate
    if (isParent(actor)) {
      const parentUserId = actor.id || actor.userId;
      const authorizedStudentIds = await canteenRepository.findAuthorizedStudentIdsForParent(schoolId, parentUserId, tx);

      if (!authorizedStudentIds.includes(row.studentId)) {
        throw new ForbiddenError('You are not authorized to modify this canteen request');
      }

      if (newStatus !== 'Cancelled') {
        throw new ForbiddenError('Parents are only permitted to cancel pending meal requests');
      }

      if (row.status !== 'Pending') {
        throw new ConflictError(`Cannot cancel canteen request: current status is '${row.status}'`);
      }
    } else {
      // 3. Admin / Staff State-Machine Transition Rules
      const ALLOWED_TRANSITIONS = {
        Pending: ['Approved', 'Delivered', 'Cancelled'],
        Approved: ['Delivered']
      };

      const allowedNext = ALLOWED_TRANSITIONS[row.status];
      if (!allowedNext || !allowedNext.includes(newStatus)) {
        throw new ConflictError(
          `Cannot transition canteen request status from '${row.status}' to '${newStatus}'`
        );
      }
    }

    // 4. Merge itemDetails with server-side resolvedAt
    const currentDetails = (row.itemDetails && typeof row.itemDetails === 'object') ? row.itemDetails : {};
    const updatedDetails = {
      ...currentDetails,
      resolvedAt: new Date().toISOString()
    };

    return canteenRepository.updateCanteenRequestStatus(schoolId, id, newStatus, updatedDetails, tx);
  });

  // 5. Non-blocking audit logging
  createAuditLog({
    schoolId,
    entityType: 'CanteenRequest',
    entityId: updatedRecord.id,
    actionPerformed: newStatus === 'Cancelled' ? 'CANCEL_CANTEEN_REQUEST' : 'UPDATE_CANTEEN_REQUEST_STATUS',
    userName: actor?.name || actor?.email || 'User',
    userRole: actor?.role || actor?.systemRole || null,
    modifiedFields: {
      previousStatus,
      newStatus
    }
  }).catch(() => {});

  return formatCanteenRequestDto(updatedRecord);
}

export const canteenService = {
  getPendingCanteenCount,
  listCanteenRequests,
  createCanteenRequest,
  updateCanteenRequestStatus,
  formatCanteenRequestDto
};

export default canteenService;
