import { prisma } from '../../database/prisma.client.js';
import * as complaintRepository from './complaint.repository.js';
import { createAuditLog } from '../audit/audit.repository.js';
import { SYSTEM_ROLES } from '../../config/constants.js';
import {
  ValidationError,
  NotFoundError,
  ForbiddenError,
  ConflictError
} from '../../utils/app-error.js';

/**
 * Checks whether the actor has administrative authority across the tenant.
 *
 * @param {Object} actor
 * @returns {boolean}
 */
function isTenantAdmin(actor) {
  const role = (actor?.systemRole || actor?.role || '').toUpperCase();
  return (
    role === SYSTEM_ROLES.SCHOOL_ADMIN ||
    role === SYSTEM_ROLES.PRINCIPAL ||
    role === SYSTEM_ROLES.SUPER_ADMIN ||
    role === 'ADMIN'
  );
}

/**
 * Maps a raw Complaint database row to a standardized client DTO.
 *
 * @param {Object|null} record
 * @returns {Object|null}
 */
export function formatComplaintDto(record) {
  if (!record) return null;
  return {
    id: record.id,
    schoolId: record.schoolId,
    title: record.title || '',
    description: record.description || '',
    status: record.status,
    submittedByUserId: record.submittedByUserId || null,
    assignedToUserId: record.assignedToUserId || null,
    resolutionNotes: record.resolutionNotes || null,
    resolvedAt: record.resolvedAt || null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

/**
 * Retrieves the count of pending complaints for the authoritative tenant.
 *
 * @param {string} schoolId - Validated School UUID from tenant context
 * @param {Object} [_actor] - Authenticated user context
 * @returns {Promise<{ count: number }>}
 */
export async function getPendingComplaintsCount(schoolId, _actor) {
  if (!schoolId) {
    throw new ValidationError('Tenant context required: schoolId is missing');
  }

  const count = await complaintRepository.countPendingComplaints(schoolId);

  return { count };
}

/**
 * Lists complaints for the tenant with pagination and optional status filter.
 * Admin/Principal can view all tenant complaints. Non-admin users can view only their own submitted complaints.
 *
 * @param {string} schoolId - Validated School UUID
 * @param {Object} actor - Authenticated user context
 * @param {Object} query - Validated query parameters
 * @returns {Promise<{ data: Array<Object>, pagination: Object }>}
 */
export async function listComplaints(schoolId, actor, query = {}) {
  if (!schoolId) {
    throw new ValidationError('Tenant context required: schoolId is missing');
  }

  const isAdmin = isTenantAdmin(actor);
  const submittedByUserId = isAdmin ? undefined : (actor.userId || actor.id);

  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 20;
  const skip = (page - 1) * limit;
  const take = limit;

  const { data, total } = await complaintRepository.listComplaints(schoolId, {
    status: query.status,
    submittedByUserId,
    skip,
    take
  });

  const totalPages = Math.ceil(total / limit) || 1;

  return {
    data: data.map(formatComplaintDto),
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
 * Retrieves a single complaint by ID.
 * Admin/Principal can view any complaint in tenant. Non-admin users can view only their own.
 *
 * @param {string} schoolId - Validated School UUID
 * @param {string} id - Complaint UUID
 * @param {Object} actor - Authenticated user context
 * @returns {Promise<Object>}
 */
export async function getComplaintById(schoolId, id, actor) {
  if (!schoolId) {
    throw new ValidationError('Tenant context required: schoolId is missing');
  }
  if (!id) {
    throw new ValidationError('Complaint ID is required');
  }

  const complaint = await complaintRepository.findComplaintById(schoolId, id);
  if (!complaint) {
    throw new NotFoundError('Complaint');
  }

  const isAdmin = isTenantAdmin(actor);
  const userId = actor.userId || actor.id;

  if (!isAdmin && complaint.submittedByUserId !== userId) {
    throw new ForbiddenError('You do not have permission to view this complaint');
  }

  return formatComplaintDto(complaint);
}

/**
 * Creates a new complaint for the tenant.
 *
 * @param {string} schoolId - Validated School UUID
 * @param {Object} actor - Authenticated user context
 * @param {Object} data - Validated creation payload ({ title, description })
 * @returns {Promise<Object>}
 */
export async function createComplaint(schoolId, actor, { title, description }) {
  if (!schoolId) {
    throw new ValidationError('Tenant context required: schoolId is missing');
  }
  if (!title || !description) {
    throw new ValidationError('Title and description are required');
  }

  const submittedByUserId = actor.userId || actor.id;

  const complaint = await complaintRepository.createComplaint(schoolId, {
    title: title.trim(),
    description: description.trim(),
    submittedByUserId
  });

  // Non-blocking post-create audit log
  createAuditLog({
    schoolId,
    entityType: 'Complaint',
    entityId: complaint.id,
    actionPerformed: 'COMPLAINT_CREATED',
    userName: actor.email || actor.name || 'User',
    userRole: actor.systemRole || actor.role || 'USER',
    modifiedFields: {
      title: complaint.title,
      status: complaint.status
    }
  }).catch(err => {
    console.error('[AUDIT LOG WARNING] Failed to record complaint creation audit log:', err.message);
  });

  return formatComplaintDto(complaint);
}

/**
 * Updates the status and resolution details of a complaint.
 * Enforces PostgreSQL row locking (FOR UPDATE) and state machine invariants.
 *
 * @param {string} schoolId - Validated School UUID
 * @param {string} id - Complaint UUID
 * @param {Object} actor - Authenticated user context
 * @param {Object} data - Validated status update payload ({ status, resolutionNotes })
 * @returns {Promise<Object>}
 */
export async function updateComplaintStatus(schoolId, id, actor, { status, resolutionNotes }) {
  if (!schoolId) {
    throw new ValidationError('Tenant context required: schoolId is missing');
  }
  if (!id) {
    throw new ValidationError('Complaint ID is required');
  }
  if (!['resolved', 'rejected'].includes(status)) {
    throw new ValidationError("Status must be 'resolved' or 'rejected'");
  }

  const resolvedAt = new Date();
  const trimmedNotes = resolutionNotes ? resolutionNotes.trim() : null;

  const updatedRecord = await prisma.$transaction(async (tx) => {
    // 1. Acquire row-level lock (FOR UPDATE) to guarantee race condition safety
    const existing = await complaintRepository.findComplaintByIdForUpdate(schoolId, id, tx);
    if (!existing) {
      throw new NotFoundError('Complaint');
    }

    // 2. Invariant: Only pending complaints can transition to resolved or rejected
    if (existing.status !== 'pending' && existing.status !== 'Pending') {
      throw new ConflictError(
        `Invalid status transition: complaint is already in '${existing.status}' status and cannot be changed`
      );
    }

    // 3. Execute update
    return complaintRepository.updateComplaintStatus(
      schoolId,
      id,
      {
        status,
        resolutionNotes: trimmedNotes,
        resolvedAt
      },
      tx
    );
  });

  // Non-blocking post-update audit log
  createAuditLog({
    schoolId,
    entityType: 'Complaint',
    entityId: id,
    actionPerformed: status === 'resolved' ? 'COMPLAINT_RESOLVED' : 'COMPLAINT_REJECTED',
    userName: actor.email || actor.name || 'Administrator',
    userRole: actor.systemRole || actor.role || 'ADMIN',
    modifiedFields: {
      status,
      resolutionNotes: trimmedNotes,
      resolvedAt: resolvedAt.toISOString()
    }
  }).catch(err => {
    console.error('[AUDIT LOG WARNING] Failed to record complaint status update audit log:', err.message);
  });

  return formatComplaintDto(updatedRecord);
}

export const complaintService = {
  formatComplaintDto,
  getPendingComplaintsCount,
  listComplaints,
  getComplaintById,
  createComplaint,
  updateComplaintStatus
};

export default complaintService;
