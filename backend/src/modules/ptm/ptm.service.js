import { prisma } from '../../database/prisma.client.js';
import * as ptmRepository from './ptm.repository.js';
import { createAuditLog } from '../audit/audit.repository.js';
import { SYSTEM_ROLES } from '../../config/constants.js';
import {
  ValidationError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  TenantAccessError
} from '../../utils/app-error.js';
import { PTM_STATUS, PTM_TYPES } from './ptm.schema.js';

/**
 * Normalizes and formats a raw PtmAppointment record into a safe, rich client DTO.
 *
 * @param {Object} ptm - Raw Prisma PtmAppointment entity with relations
 * @returns {Object} Safe DTO
 */
export function formatPtm(ptm) {
  if (!ptm) return null;

  const studentName = ptm.student
    ? `${ptm.student.firstName} ${ptm.student.lastName || ''}`.trim()
    : 'Unknown Student';

  const parent = ptm.student?.parents?.[0]?.parent;
  const parentName = parent?.name || 'Parent';
  const parentPhone = parent?.phone || null;

  const teacherName = ptm.teacher?.name || 'Class Teacher';
  const className = ptm.class?.name || null;

  return {
    id: ptm.id,
    schoolId: ptm.schoolId,
    studentId: ptm.studentId,
    studentName,
    studentAdmissionNumber: ptm.student?.admissionNumber || null,
    teacherId: ptm.teacherId,
    teacherName,
    teacherEmail: ptm.teacher?.email || null,
    teacherPhone: ptm.teacher?.phone || null,
    parentName,
    parentPhone,
    classId: ptm.classId,
    className,
    date: ptm.date,
    timeSlot: ptm.timeSlot,
    time: ptm.timeSlot, // Frontend compatibility alias
    type: ptm.type || PTM_TYPES.IN_PERSON,
    status: ptm.status,
    notes: ptm.notes || null,
    createdAt: ptm.createdAt,
    updatedAt: ptm.updatedAt
  };
}

/**
 * Validates whether an actor role is an Administrative role.
 */
function isAdministrator(actor) {
  const role = (actor?.systemRole || actor?.role || '').toUpperCase();
  return (
    role === SYSTEM_ROLES.SUPER_ADMIN ||
    role === SYSTEM_ROLES.SCHOOL_ADMIN ||
    role === SYSTEM_ROLES.ADMIN ||
    role === 'SUPER_ADMIN' ||
    role === 'SCHOOL_ADMIN' ||
    role === 'ADMIN'
  );
}

/**
 * Validates whether an actor role is a Parent role.
 */
function isParent(actor) {
  const role = (actor?.systemRole || actor?.role || '').toUpperCase();
  return role === SYSTEM_ROLES.PARENT || role === 'PARENT';
}

/**
 * Resolves teacher StaffProfile and verifies active status.
 */
async function resolveTeacherProfile(schoolId, actor, tx = prisma) {
  const userId = actor.id || actor.userId;
  const profile = await ptmRepository.findStaffProfileByUserId(schoolId, userId, tx);

  if (!profile) {
    throw new ForbiddenError('Staff profile not found for authenticated teacher');
  }

  if (profile.user?.isActive === false || profile.status !== 'Active') {
    throw new ForbiddenError('Teacher account is deactivated or inactive');
  }

  return profile;
}

/**
 * Lists PTM appointments for the authenticated teacher's assigned class / schedule.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} query - Validated query parameters
 * @param {Object} actor - Authenticated teacher context
 * @returns {Promise<{ data: Array, pagination: Object }>}
 */
export async function listTeacherPtms(schoolId, query = {}, actor) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required');
  }

  const isAdmin = isAdministrator(actor);
  let teacherId = null;
  let targetClassId = query.classId || null;

  if (!isAdmin) {
    const teacherProfile = await resolveTeacherProfile(schoolId, actor);
    teacherId = teacherProfile.id;

    if (!targetClassId) {
      targetClassId = teacherProfile.assignedClassId || null;
    }
  }

  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 50));
  const skip = (page - 1) * limit;

  const todayStr = new Date().toISOString().split('T')[0];

  const filterOptions = {
    teacherId,
    classId: targetClassId,
    tab: query.tab,
    date: query.date,
    status: query.status,
    todayStr,
    skip,
    limit,
    sort: query.sort || 'date',
    order: query.order || 'asc'
  };

  const [appointments, total] = await Promise.all([
    ptmRepository.findTeacherAppointments(schoolId, filterOptions),
    ptmRepository.countTeacherAppointments(schoolId, filterOptions)
  ]);

  const totalPages = Math.ceil(total / limit) || 1;

  return {
    data: appointments.map(formatPtm),
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
 * Lists PTM appointments for a specific student (Parent custody verified).
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} studentId - Student UUID
 * @param {Object} query - Validated query parameters
 * @param {Object} actor - Authenticated parent/staff context
 * @returns {Promise<{ data: Array, pagination: Object }>}
 */
export async function listStudentPtms(schoolId, studentId, query = {}, actor) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required');
  }

  // 1. Verify student exists in tenant
  const student = await ptmRepository.findStudentById(schoolId, studentId);
  if (!student) {
    throw new NotFoundError('Student');
  }

  // 2. Parent Custody Check
  if (isParent(actor)) {
    const userId = actor.id || actor.userId;
    const authorizedStudentIds = await ptmRepository.findAuthorizedStudentIdsForParent(schoolId, userId);

    if (!authorizedStudentIds.includes(studentId)) {
      throw new NotFoundError('Student');
    }
  }

  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 50));
  const skip = (page - 1) * limit;

  const todayStr = new Date().toISOString().split('T')[0];

  const filterOptions = {
    studentId,
    tab: query.tab,
    status: query.status,
    todayStr,
    skip,
    limit,
    sort: query.sort || 'date',
    order: query.order || 'asc'
  };

  const [appointments, total] = await Promise.all([
    ptmRepository.findStudentAppointments(schoolId, filterOptions),
    ptmRepository.countStudentAppointments(schoolId, filterOptions)
  ]);

  const totalPages = Math.ceil(total / limit) || 1;

  return {
    data: appointments.map(formatPtm),
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
 * Retrieves a single PTM appointment by ID with role-based ownership checks.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} id - Appointment UUID
 * @param {Object} actor - Authenticated user context
 * @returns {Promise<Object>} Formatted PTM DTO
 */
export async function getPtmById(schoolId, id, actor) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required');
  }

  const appointment = await ptmRepository.findAppointmentById(schoolId, id);
  if (!appointment) {
    throw new NotFoundError('PTM Appointment');
  }

  // Ownership verification
  if (isParent(actor)) {
    const userId = actor.id || actor.userId;
    const authorizedStudentIds = await ptmRepository.findAuthorizedStudentIdsForParent(schoolId, userId);
    if (!authorizedStudentIds.includes(appointment.studentId)) {
      throw new NotFoundError('PTM Appointment');
    }
  } else if (!isAdministrator(actor)) {
    const teacherProfile = await resolveTeacherProfile(schoolId, actor);
    if (appointment.teacherId !== teacherProfile.id && appointment.classId !== teacherProfile.assignedClassId) {
      throw new ForbiddenError('You are not authorized to view this appointment');
    }
  }

  return formatPtm(appointment);
}

/**
 * Creates a new PTM appointment with transactional conflict & double-booking prevention.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} inputData - Validated appointment creation data
 * @param {Object} actor - Authenticated user context
 * @returns {Promise<Object>} Created PTM DTO
 */
export async function createPtm(schoolId, inputData, actor) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required');
  }

  const isAdmin = isAdministrator(actor);
  const timeSlot = inputData.timeSlot || inputData.time;

  // Execute entire booking sequence in an isolated database transaction
  const created = await prisma.$transaction(async (tx) => {
    // 1. Verify student exists in tenant
    const student = await ptmRepository.findStudentById(schoolId, inputData.studentId, tx);
    if (!student) {
      throw new NotFoundError('Student');
    }

    // 2. Resolve Teacher ID and verify assignment
    let teacherId = inputData.teacherId;
    let classId = inputData.classId || student.classId;

    if (!isAdmin) {
      const teacherProfile = await resolveTeacherProfile(schoolId, actor, tx);
      teacherId = teacherProfile.id;

      // Ensure student belongs to teacher's class
      const isAssigned = teacherProfile.assignedClassId && teacherProfile.assignedClassId === student.classId;
      const isHeading = teacherProfile.headedClasses?.some((c) => c.id === student.classId);

      if (!isAssigned && !isHeading) {
        throw new ForbiddenError('Teachers are only authorized to book meetings for students in their assigned class');
      }

      classId = student.classId;
    } else {
      if (!teacherId) {
        // Fallback to student's class teacher if available
        if (student.classId) {
          const classTeacher = await tx.staffProfile.findFirst({
            where: {
              schoolId,
              assignedClassId: student.classId,
              status: 'Active'
            },
            select: { id: true }
          });
          teacherId = classTeacher?.id;
        }
      }

      if (!teacherId) {
        throw new ValidationError('teacherId is required when creating an appointment as administrator');
      }

      // Verify teacher exists and is active
      const teacherStaff = await ptmRepository.findStaffProfileById(schoolId, teacherId, tx);
      if (!teacherStaff || teacherStaff.status !== 'Active') {
        throw new ValidationError('Specified teacher profile is invalid or inactive');
      }
    }

    // 3. Acquire row-level locks on Teacher & Student for strict concurrency serialization
    await ptmRepository.lockTeacherAndStudentForBooking(schoolId, teacherId, student.id, tx);

    // 4. Concurrency & Double-Booking Verification
    const conflicts = await ptmRepository.checkAppointmentConflicts(
      schoolId,
      {
        teacherId,
        studentId: student.id,
        date: inputData.date,
        timeSlot
      },
      tx
    );

    if (conflicts.teacherConflict) {
      throw new ConflictError('Teacher is already booked for an appointment at this date and time slot');
    }

    if (conflicts.studentConflict) {
      throw new ConflictError('Student already has an appointment scheduled at this date and time slot');
    }

    // 4. Create record
    return ptmRepository.createAppointment(
      {
        schoolId,
        studentId: student.id,
        teacherId,
        classId,
        date: inputData.date,
        timeSlot,
        type: inputData.type || PTM_TYPES.IN_PERSON,
        status: inputData.status || PTM_STATUS.CONFIRMED,
        notes: inputData.notes || null
      },
      tx
    );
  });

  // Non-blocking Audit Log
  createAuditLog({
    schoolId,
    entityType: 'PtmAppointment',
    entityId: created.id,
    actionPerformed: `CREATE_PTM: ${created.date} ${created.timeSlot}`,
    userName: actor.name || actor.email || 'Teacher',
    userRole: actor.systemRole || actor.role,
    modifiedFields: {
      studentId: created.studentId,
      teacherId: created.teacherId,
      classId: created.classId,
      date: created.date,
      timeSlot: created.timeSlot,
      type: created.type,
      status: created.status
    }
  });

  return formatPtm(created);
}

/**
 * Allowed status state machine transitions
 */
const ALLOWED_STATUS_TRANSITIONS = {
  [PTM_STATUS.PENDING]: [PTM_STATUS.CONFIRMED, PTM_STATUS.CANCELLED],
  [PTM_STATUS.SCHEDULED]: [PTM_STATUS.CONFIRMED, PTM_STATUS.CANCELLED, PTM_STATUS.COMPLETED],
  [PTM_STATUS.CONFIRMED]: [PTM_STATUS.CANCELLED, PTM_STATUS.COMPLETED],
  [PTM_STATUS.COMPLETED]: [], // Terminal
  [PTM_STATUS.CANCELLED]: []  // Terminal
};

/**
 * Updates the status of an existing PTM appointment with state machine & custody checks.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} id - Appointment UUID
 * @param {Object} inputData - { status, notes }
 * @param {Object} actor - Authenticated user context
 * @returns {Promise<Object>} Updated PTM DTO
 */
export async function updatePtmStatus(schoolId, id, inputData, actor) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required');
  }

  const newStatus = inputData.status;

  const updated = await prisma.$transaction(async (tx) => {
    const appointment = await ptmRepository.findAppointmentById(schoolId, id, tx);
    if (!appointment) {
      throw new NotFoundError('PTM Appointment');
    }

    const currentStatus = appointment.status;

    // 1. Role Authorization and Custody Check
    if (isParent(actor)) {
      const userId = actor.id || actor.userId;
      const authorizedStudentIds = await ptmRepository.findAuthorizedStudentIdsForParent(schoolId, userId, tx);
      if (!authorizedStudentIds.includes(appointment.studentId)) {
        throw new NotFoundError('PTM Appointment');
      }

      // Parents can only cancel appointments
      if (newStatus !== PTM_STATUS.CANCELLED) {
        throw new ForbiddenError('Parents are only permitted to cancel appointments');
      }
    } else if (!isAdministrator(actor)) {
      const teacherProfile = await resolveTeacherProfile(schoolId, actor, tx);
      if (appointment.teacherId !== teacherProfile.id && appointment.classId !== teacherProfile.assignedClassId) {
        throw new ForbiddenError('You are not authorized to update this appointment');
      }
    }

    // 2. Status Transition Validation
    if (currentStatus === newStatus) {
      // No-op status change
      return appointment;
    }

    const allowedNext = ALLOWED_STATUS_TRANSITIONS[currentStatus] || [];
    if (!allowedNext.includes(newStatus)) {
      throw new ValidationError(
        `Cannot change appointment status from '${currentStatus}' to '${newStatus}'`
      );
    }

    // 3. Execute Update
    return ptmRepository.updateAppointment(
      schoolId,
      id,
      {
        status: newStatus,
        notes: inputData.notes !== undefined ? inputData.notes : appointment.notes
      },
      tx
    );
  });

  // Non-blocking Audit Log
  createAuditLog({
    schoolId,
    entityType: 'PtmAppointment',
    entityId: updated.id,
    actionPerformed: `UPDATE_PTM_STATUS: ${updated.status}`,
    userName: actor.name || actor.email || 'User',
    userRole: actor.systemRole || actor.role,
    modifiedFields: {
      status: { old: updated.status !== newStatus ? updated.status : null, new: newStatus },
      notes: inputData.notes
    }
  });

  return formatPtm(updated);
}

/**
 * Cancels a PTM appointment (soft-cancel: sets status to 'Cancelled').
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} id - Appointment UUID
 * @param {Object} actor - Authenticated user context
 * @returns {Promise<{ message: string, id: string, status: string }>}
 */
export async function cancelPtm(schoolId, id, actor) {
  const updated = await updatePtmStatus(
    schoolId,
    id,
    { status: PTM_STATUS.CANCELLED },
    actor
  );

  return {
    message: 'PTM appointment successfully cancelled',
    id: updated.id,
    status: updated.status
  };
}
