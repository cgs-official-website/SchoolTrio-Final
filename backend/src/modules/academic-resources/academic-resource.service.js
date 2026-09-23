import { prisma } from '../../database/prisma.client.js';
import * as academicResourceRepo from './academic-resource.repository.js';
import { createAuditLog } from '../audit/audit.repository.js';
import {
  ValidationError,
  NotFoundError,
  ForbiddenError,
  TenantAccessError
} from '../../utils/app-error.js';

const ADMIN_ROLE_SET = new Set([
  'SUPER_ADMIN',
  'SCHOOL_ADMIN',
  'PRINCIPAL',
  'CORRESPONDENT',
  'ADMINISTRATIVE_OFFICER',
  'ADMINISTRATIVE-OFFICER',
  'VICE_PRINCIPAL',
  'VICE-PRINCIPAL',
  'SUBJECT_WISE_HEAD',
  'SUBJECT-WISE-HEAD',
  'CLASS_INCHARGE',
  'CLASS-INCHARGE',
  'ADMIN'
]);

/**
 * Checks if the authenticated user has administrative management privileges over academic resources.
 *
 * @param {Object} actor - Authenticated user context
 * @returns {boolean}
 */
export function isAcademicResourceAdmin(actor) {
  if (!actor) return false;

  const systemRole = (actor.systemRole || actor.role || '').toUpperCase().replace(/\s+/g, '_');
  if (ADMIN_ROLE_SET.has(systemRole)) {
    return true;
  }

  const roles = Array.isArray(actor.roles) ? actor.roles : [];
  return roles.some(r => {
    const normalized = String(r).toUpperCase().replace(/\s+/g, '_');
    return ADMIN_ROLE_SET.has(normalized);
  });
}

/**
 * Builds a lookup map of user IDs to display names (StaffProfile.fullName -> User.email -> 'Unknown').
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Array<string>} userIds - User UUIDs
 * @param {Object} [tx=prisma] - Optional transaction client
 * @returns {Promise<Map<string, string>>}
 */
export async function resolveUploaderNames(schoolId, userIds, tx = prisma) {
  const nameMap = new Map();
  if (!userIds || userIds.length === 0) return nameMap;

  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  if (uniqueIds.length === 0) return nameMap;

  const [staffProfiles, users] = await Promise.all([
    academicResourceRepo.findStaffProfilesByUserIds(schoolId, uniqueIds, tx),
    academicResourceRepo.findUsersByIds(schoolId, uniqueIds, tx)
  ]);

  for (const user of users) {
    nameMap.set(user.id, user.email || 'Unknown');
  }

  for (const profile of staffProfiles) {
    const profileName = profile.name || profile.fullName;
    if (profileName) {
      nameMap.set(profile.userId, profileName);
    } else if (profile.user?.email && !nameMap.has(profile.userId)) {
      nameMap.set(profile.userId, profile.user.email);
    }
  }

  return nameMap;
}

/**
 * Formats an AcademicResource database entity into the authoritative REST DTO.
 *
 * @param {Object} resource - Raw database record
 * @param {Map<string, string>|string} [uploaderNameOrMap] - Map or resolved name
 * @returns {Object} Canonical REST DTO
 */
export function formatAcademicResourceDto(resource, uploaderNameOrMap) {
  if (!resource) return null;

  let uploaderName = 'Unknown';
  if (typeof uploaderNameOrMap === 'string') {
    uploaderName = uploaderNameOrMap;
  } else if (uploaderNameOrMap instanceof Map) {
    uploaderName = uploaderNameOrMap.get(resource.uploaderId) || 'Unknown';
  }

  return {
    id: resource.id,
    title: resource.title,
    classId: resource.classId,
    className: resource.class?.name || null,
    subjectId: resource.subjectId || null,
    subjectName: resource.subject?.name || null,
    uploaderId: resource.uploaderId,
    uploaderName,
    fileUrl: resource.fileUrl || null,
    type: resource.fileType || 'document',
    description: resource.description || null,
    createdAt: resource.createdAt,
    updatedAt: resource.updatedAt
  };
}

/**
 * Lists Academic Resources for a tenant with filtering and pagination.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} query - Validated query parameters
 * @returns {Promise<{ data: Array<Object>, pagination: Object }>}
 */
export async function listAcademicResources(schoolId, query = {}) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to list academic resources');
  }

  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 20;

  const filters = {
    classId: query.classId,
    subjectId: query.subjectId,
    type: query.type,
    uploaderId: query.uploaderId,
    search: query.search
  };

  const [records, total] = await Promise.all([
    academicResourceRepo.listAcademicResources(schoolId, filters, { page, limit }),
    academicResourceRepo.countAcademicResources(schoolId, filters)
  ]);

  const uploaderIds = records.map(r => r.uploaderId);
  const uploaderNameMap = await resolveUploaderNames(schoolId, uploaderIds);

  const totalPages = Math.ceil(total / limit) || 1;

  return {
    data: records.map(r => formatAcademicResourceDto(r, uploaderNameMap)),
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
 * Retrieves a single Academic Resource by ID within tenant context.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} id - AcademicResource UUID
 * @returns {Promise<Object>} AcademicResource DTO
 */
export async function getAcademicResourceById(schoolId, id) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to get academic resource');
  }
  if (!id) {
    throw new ValidationError('Resource ID is required');
  }

  const record = await academicResourceRepo.findAcademicResourceById(schoolId, id);
  if (!record) {
    throw new NotFoundError('Academic resource not found');
  }

  const nameMap = await resolveUploaderNames(schoolId, [record.uploaderId]);
  return formatAcademicResourceDto(record, nameMap);
}

/**
 * Creates a new Academic Resource.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} actor - Authenticated user context
 * @param {Object} payload - Validated create payload
 * @returns {Promise<Object>} Created AcademicResource DTO
 */
export async function createAcademicResource(schoolId, actor, payload) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to create academic resource');
  }
  const uploaderId = actor?.id || actor?.userId;
  if (!uploaderId) {
    throw new ForbiddenError('Authenticated user identifier missing');
  }

  // 1. Verify Class belongs to tenant
  const classRecord = await academicResourceRepo.findClassInTenant(schoolId, payload.classId);
  if (!classRecord) {
    throw new NotFoundError('Class not found in this school');
  }

  // 2. Verify Subject belongs to tenant if provided
  if (payload.subjectId) {
    const subjectRecord = await academicResourceRepo.findSubjectInTenant(schoolId, payload.subjectId);
    if (!subjectRecord) {
      throw new NotFoundError('Subject not found in this school');
    }
  }

  const created = await academicResourceRepo.createAcademicResource(schoolId, {
    title: payload.title,
    classId: payload.classId,
    subjectId: payload.subjectId || null,
    uploaderId,
    fileUrl: payload.fileUrl || null,
    type: payload.type || 'document',
    description: payload.description || null
  });

  // Non-blocking Audit Logging
  createAuditLog({
    schoolId,
    entityType: 'AcademicResource',
    entityId: created.id,
    actionPerformed: 'ACADEMIC_RESOURCE_CREATED',
    userName: actor.email || actor.name || 'User',
    userRole: actor.systemRole || actor.role || 'TEACHER',
    modifiedFields: {
      title: created.title,
      classId: created.classId,
      subjectId: created.subjectId,
      fileType: created.fileType
    }
  }).catch(err => {
    console.error('[AUDIT LOG WARNING] Failed to record academic resource creation audit log:', err.message);
  });

  const nameMap = await resolveUploaderNames(schoolId, [uploaderId]);
  return formatAcademicResourceDto(created, nameMap);
}

/**
 * Updates an existing Academic Resource within an isolated transaction with row locking and custody checks.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} actor - Authenticated user context
 * @param {string} id - AcademicResource UUID
 * @param {Object} payload - Validated update payload
 * @returns {Promise<Object>} Updated AcademicResource DTO
 */
export async function updateAcademicResource(schoolId, actor, id, payload) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to update academic resource');
  }
  if (!id) {
    throw new ValidationError('Resource ID is required');
  }

  const userId = actor?.id || actor?.userId;
  if (!userId) {
    throw new ForbiddenError('Authenticated user identifier missing');
  }
  const isAdmin = isAcademicResourceAdmin(actor);

  const updated = await prisma.$transaction(
    async tx => {
      // 1. Fetch resource with row lock for race safety
      const existing = await academicResourceRepo.findAcademicResourceWithLock(schoolId, id, tx);
      if (!existing) {
        throw new NotFoundError('Academic resource not found');
      }

      // 2. Custody check: Teachers and staff can only update their own resources
      if (!isAdmin && existing.uploaderId !== userId) {
        throw new ForbiddenError('You are only authorized to update your own resources');
      }

      // 3. Class validation if changing class
      if (payload.classId) {
        const classRecord = await academicResourceRepo.findClassInTenant(schoolId, payload.classId, tx);
        if (!classRecord) {
          throw new NotFoundError('Class not found in this school');
        }
      }

      // 4. Subject validation if changing subject
      if (payload.subjectId) {
        const subjectRecord = await academicResourceRepo.findSubjectInTenant(schoolId, payload.subjectId, tx);
        if (!subjectRecord) {
          throw new NotFoundError('Subject not found in this school');
        }
      }

      return academicResourceRepo.updateAcademicResource(schoolId, id, payload, tx);
    },
    { timeout: 15000, maxWait: 10000 }
  );

  // Non-blocking Audit Logging
  createAuditLog({
    schoolId,
    entityType: 'AcademicResource',
    entityId: updated.id,
    actionPerformed: 'ACADEMIC_RESOURCE_UPDATED',
    userName: actor.email || actor.name || 'User',
    userRole: actor.systemRole || actor.role || 'USER',
    modifiedFields: payload
  }).catch(err => {
    console.error('[AUDIT LOG WARNING] Failed to record academic resource update audit log:', err.message);
  });

  const nameMap = await resolveUploaderNames(schoolId, [updated.uploaderId]);
  return formatAcademicResourceDto(updated, nameMap);
}

/**
 * Deletes an Academic Resource within an isolated transaction with row locking and custody checks.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} actor - Authenticated user context
 * @param {string} id - AcademicResource UUID
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export async function deleteAcademicResource(schoolId, actor, id) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to delete academic resource');
  }
  if (!id) {
    throw new ValidationError('Resource ID is required');
  }

  const userId = actor?.id || actor?.userId;
  if (!userId) {
    throw new ForbiddenError('Authenticated user identifier missing');
  }
  const isAdmin = isAcademicResourceAdmin(actor);

  const existing = await prisma.$transaction(
    async tx => {
      // 1. Fetch resource with row lock
      const record = await academicResourceRepo.findAcademicResourceWithLock(schoolId, id, tx);
      if (!record) {
        throw new NotFoundError('Academic resource not found');
      }

      // 2. Custody check: Teachers and staff can only delete their own resources
      if (!isAdmin && record.uploaderId !== userId) {
        throw new ForbiddenError('You are only authorized to delete your own resources');
      }

      await academicResourceRepo.deleteAcademicResource(schoolId, id, tx);
      return record;
    },
    { timeout: 15000, maxWait: 10000 }
  );

  // Non-blocking Audit Logging
  createAuditLog({
    schoolId,
    entityType: 'AcademicResource',
    entityId: id,
    actionPerformed: 'ACADEMIC_RESOURCE_DELETED',
    userName: actor.email || actor.name || 'User',
    userRole: actor.systemRole || actor.role || 'USER',
    modifiedFields: { id, title: existing.title }
  }).catch(err => {
    console.error('[AUDIT LOG WARNING] Failed to record academic resource deletion audit log:', err.message);
  });

  return {
    success: true,
    message: 'Academic resource deleted successfully'
  };
}
