import * as studentHealthRepository from './student-health.repository.js';
import * as parentRepository from '../parents/parent.repository.js';
import { createAuditLog } from '../audit/audit.repository.js';
import {
  NotFoundError,
  ForbiddenError,
  TenantAccessError
} from '../../utils/app-error.js';
import { SYSTEM_ROLES, ERROR_CODES } from '../../config/constants.js';

/**
 * Formats student health record into a clean, typed DTO with data minimization.
 * Never exposes sensitive auth tokens, passwords, or unrelated academic/personal records.
 *
 * @param {Object} student - Student record with bloodGroup and customData
 * @returns {Object} Typed health record DTO
 */
export function formatStudentHealthDto(student) {
  const customData = student.customData && typeof student.customData === 'object' ? student.customData : {};
  const health = customData.health && typeof customData.health === 'object' ? customData.health : {};

  return {
    studentId: student.id,
    bloodGroup: student.bloodGroup || null,
    allergies: Array.isArray(health.allergies) ? health.allergies : [],
    medicalConditions: Array.isArray(health.medicalConditions) ? health.medicalConditions : [],
    medications: Array.isArray(health.medications) ? health.medications : [],
    emergencyContactName: health.emergencyContactName || null,
    emergencyContactPhone: health.emergencyContactPhone || null,
    doctorName: health.doctorName || null,
    doctorPhone: health.doctorPhone || null,
    notes: health.notes || customData.medicalInfo || null,
    updatedAt: student.updatedAt instanceof Date ? student.updatedAt.toISOString() : student.updatedAt
  };
}

/**
 * Retrieves a student's typed health record within tenant context with strict authorization.
 *
 * Access Rules:
 * - SUPER_ADMIN, SCHOOL_ADMIN: universal access within tenant
 * - Institutional Staff/Teacher: requires students:read or health:read
 * - PARENT: only permitted if active ParentStudentLink exists for this student
 * - STUDENT: only permitted for own student record
 *
 * @param {string} schoolId - Authoritative tenant UUID
 * @param {string} studentId - Target student UUID
 * @param {Object} actor - Authenticated user context
 * @returns {Promise<Object>} Formatted health DTO
 */
export async function getStudentHealth(schoolId, studentId, actor = {}) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to access student health records');
  }

  const student = await studentHealthRepository.findStudentHealth(schoolId, studentId);
  if (!student) {
    throw new NotFoundError('Student');
  }

  const role = actor.systemRole || actor.role;
  const userId = actor.userId || actor.id;

  // 1. Parent authorization: verify relationship link
  if (role === SYSTEM_ROLES.PARENT) {
    const parentProfile = await parentRepository.findParentByUserId(schoolId, userId);
    if (!parentProfile) {
      throw new ForbiddenError(
        'Access denied: parent profile not found for authenticated user',
        ERROR_CODES.FORBIDDEN
      );
    }

    const link = await parentRepository.findParentStudentLink(schoolId, studentId, parentProfile.id);
    if (!link) {
      throw new ForbiddenError(
        'Access denied: parent is not linked to this student',
        ERROR_CODES.FORBIDDEN
      );
    }
  }

  // 2. Student self-service authorization: verify matching user
  if (role === SYSTEM_ROLES.STUDENT) {
    const actorStudentId = actor.studentId || actor.sub;
    if (actorStudentId !== studentId && actor.id !== studentId) {
      throw new ForbiddenError(
        'Access denied: student can only access their own health record',
        ERROR_CODES.FORBIDDEN
      );
    }
  }

  return formatStudentHealthDto(student);
}

/**
 * Updates a student's health record within tenant context.
 *
 * Privacy & Safety:
 * - Safely deep-merges health data into customData.health without destroying other customData keys.
 * - Updates bloodGroup column on Student model.
 * - Prevents modification of ownership fields (schoolId, studentId, userId).
 * - Creates a privacy-safe audit record without sensitive health values.
 *
 * @param {string} schoolId - Authoritative tenant UUID
 * @param {string} studentId - Target student UUID
 * @param {Object} updateData - Validated health fields
 * @param {Object} actor - Authenticated user context
 * @returns {Promise<Object>} Formatted updated health DTO
 */
export async function updateStudentHealth(schoolId, studentId, updateData, actor = {}) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to update student health records');
  }

  const student = await studentHealthRepository.findStudentHealth(schoolId, studentId);
  if (!student) {
    throw new NotFoundError('Student');
  }

  const role = actor.systemRole || actor.role;
  if (role === SYSTEM_ROLES.PARENT || role === SYSTEM_ROLES.STUDENT) {
    throw new ForbiddenError(
      'Access denied: parents and students cannot edit health records',
      ERROR_CODES.FORBIDDEN
    );
  }

  // 1. Safely clone and preserve existing customData
  const currentCustomData = student.customData && typeof student.customData === 'object'
    ? { ...student.customData }
    : {};

  const currentHealth = currentCustomData.health && typeof currentCustomData.health === 'object'
    ? { ...currentCustomData.health }
    : {};

  const newHealth = { ...currentHealth };

  if (updateData.allergies !== undefined) newHealth.allergies = updateData.allergies;
  if (updateData.medicalConditions !== undefined) newHealth.medicalConditions = updateData.medicalConditions;
  if (updateData.medications !== undefined) newHealth.medications = updateData.medications;
  if (updateData.emergencyContactName !== undefined) newHealth.emergencyContactName = updateData.emergencyContactName;
  if (updateData.emergencyContactPhone !== undefined) newHealth.emergencyContactPhone = updateData.emergencyContactPhone;
  if (updateData.doctorName !== undefined) newHealth.doctorName = updateData.doctorName;
  if (updateData.doctorPhone !== undefined) newHealth.doctorPhone = updateData.doctorPhone;
  if (updateData.notes !== undefined) {
    newHealth.notes = updateData.notes;
    // Keep legacy medicalInfo in sync
    currentCustomData.medicalInfo = updateData.notes;
  }

  currentCustomData.health = newHealth;

  const repoUpdatePayload = {
    customData: currentCustomData
  };

  if (updateData.bloodGroup !== undefined) {
    repoUpdatePayload.bloodGroup = updateData.bloodGroup;
  }

  const updatedStudent = await studentHealthRepository.updateStudentHealth(
    schoolId,
    studentId,
    repoUpdatePayload
  );

  // 2. Write privacy-safe audit record (no sensitive medical details in modifiedFields)
  try {
    await createAuditLog({
      schoolId,
      entityType: 'StudentHealth',
      entityId: studentId,
      actionPerformed: 'UPDATE_STUDENT_HEALTH',
      userName: actor.email || 'User',
      userRole: actor.systemRole || actor.role || 'STAFF',
      modifiedFields: {
        hasBloodGroup: updateData.bloodGroup !== undefined,
        updatedFields: Object.keys(updateData)
      }
    });
  } catch (auditErr) {
    // Non-blocking audit failure logging
    console.warn('[AUDIT LOG WARNING] Failed to record student health audit log:', auditErr.message);
  }

  return formatStudentHealthDto(updatedStudent);
}
