import crypto from 'crypto';
import * as parentRepository from './parent.repository.js';
import { createAuditLog } from '../audit/audit.repository.js';
import { prisma } from '../../database/prisma.client.js';
import {
  NotFoundError,
  ConflictError,
  TenantAccessError
} from '../../utils/app-error.js';
import { parsePagination, buildPaginationMetadata } from '../../utils/pagination.js';

/**
 * Parent and Parent-Student Link Business Logic Service Layer
 *
 * Enforces:
 * - Strict multi-tenant boundaries
 * - 1:1 User-ParentProfile relationship
 * - Atomic parent creation (User + ParentProfile + ParentStudentLink)
 * - Safe identity reuse for siblings
 * - Concurrency protection against duplicate links and emails
 * - Canonical non-blocking AuditLog integration
 */

/**
 * Lists parents with pagination, searching, and filtering.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} query - Express request query
 * @returns {Promise<{ parents: Array, pagination: Object }>}
 */
export async function listParents(schoolId, query = {}) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to list parents');
  }

  const paginationParams = parsePagination(query, {
    defaultSort: 'name',
    defaultOrder: 'asc'
  });

  const options = {
    search: query.search ? query.search.trim() : undefined,
    phone: query.phone ? query.phone.trim() : undefined,
    email: query.email ? query.email.trim() : undefined,
    skip: paginationParams.skip,
    take: paginationParams.take,
    sort: paginationParams.sort,
    order: paginationParams.order
  };

  const [parents, total] = await Promise.all([
    parentRepository.findParents(schoolId, options),
    parentRepository.countParents(schoolId, options)
  ]);

  const pagination = buildPaginationMetadata(total, paginationParams.page, paginationParams.limit);

  return { parents, pagination };
}

/**
 * Retrieves a single parent profile by ID within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} parentId - ParentProfile UUID
 * @returns {Promise<Object>}
 */
export async function getParentById(schoolId, parentId) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to retrieve parent');
  }

  const parent = await parentRepository.findParentById(schoolId, parentId);
  if (!parent) {
    throw new NotFoundError('Parent');
  }

  return parent;
}

/**
 * Updates a parent profile within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} parentId - ParentProfile UUID
 * @param {Object} data - Update payload
 * @param {Object} [actor] - Context of requesting user
 * @returns {Promise<Object>}
 */
export async function updateParent(schoolId, parentId, data, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to update parent');
  }

  const existingParent = await parentRepository.findParentById(schoolId, parentId);
  if (!existingParent) {
    throw new NotFoundError('Parent');
  }

  const profileUpdateData = {};
  const userUpdateData = {};
  const modifiedFields = {};

  // 1. Name
  if (data.name !== undefined) {
    const newName = data.name.trim();
    if (newName !== existingParent.name) {
      modifiedFields.name = { old: existingParent.name, new: newName };
      profileUpdateData.name = newName;
    }
  }

  // 2. Phone
  if (data.phone !== undefined) {
    const newPhone = data.phone ? data.phone.trim() : null;
    if (newPhone !== existingParent.phone) {
      modifiedFields.phone = { old: existingParent.phone, new: newPhone };
      profileUpdateData.phone = newPhone;
    }
  }

  // 3. Address
  if (data.address !== undefined) {
    const newAddress = data.address ? data.address.trim() : null;
    if (newAddress !== existingParent.address) {
      modifiedFields.address = { old: existingParent.address, new: newAddress };
      profileUpdateData.address = newAddress;
    }
  }

  // 4. Emergency Contact
  if (data.emergencyContact !== undefined) {
    const newEmergency = data.emergencyContact ? data.emergencyContact.trim() : null;
    if (newEmergency !== existingParent.emergencyContact) {
      modifiedFields.emergencyContact = { old: existingParent.emergencyContact, new: newEmergency };
      profileUpdateData.emergencyContact = newEmergency;
    }
  }

  // 5. Email & User.email synchronization
  if (data.email !== undefined) {
    const newEmail = data.email ? data.email.trim().toLowerCase() : null;
    if (newEmail !== existingParent.email) {
      if (newEmail) {
        // Check tenant user email conflict
        const conflictUser = await prisma.user.findFirst({
          where: { schoolId, email: newEmail, NOT: { id: existingParent.userId } }
        });
        if (conflictUser) {
          throw new ConflictError('Email address is already registered in this school');
        }
        userUpdateData.email = newEmail;
      }
      modifiedFields.email = { old: existingParent.email, new: newEmail };
      profileUpdateData.email = newEmail;
    }
  }

  // 6. Active state & token version bump
  if (data.isActive !== undefined) {
    if (data.isActive !== existingParent.user.isActive) {
      modifiedFields.isActive = { old: existingParent.user.isActive, new: data.isActive };
      userUpdateData.isActive = data.isActive;
      if (data.isActive === false) {
        userUpdateData.tokenVersion = { increment: 1 };
      }
    }
  }

  // 7. No-op check
  if (Object.keys(modifiedFields).length === 0) {
    return existingParent;
  }

  // 8. Atomic transaction update
  const updated = await prisma.$transaction(async (tx) => {
    if (Object.keys(profileUpdateData).length > 0) {
      await parentRepository.updateParentProfile(schoolId, parentId, profileUpdateData, tx);
    }
    if (Object.keys(userUpdateData).length > 0) {
      await parentRepository.updateUser(existingParent.userId, userUpdateData, tx);
    }
    return parentRepository.findParentById(schoolId, parentId, tx);
  });

  // 9. Canonical AuditLog integration
  const auditAction = modifiedFields.isActive
    ? (data.isActive ? `ENABLE_PARENT: ${updated.name}` : `DISABLE_PARENT: ${updated.name}`)
    : `UPDATE_PARENT: ${updated.name}`;

  await createAuditLog({
    schoolId,
    entityType: 'ParentProfile',
    entityId: parentId,
    actionPerformed: auditAction,
    userName: actor?.email || actor?.userId || 'Administrator',
    userRole: actor?.systemRole || null,
    modifiedFields
  });

  return updated;
}

/**
 * Retrieves all parent profiles linked to a specific student within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} studentId - Student UUID
 * @param {Object} [requester] - Authenticated user context
 * @returns {Promise<Array>}
 */
export async function getStudentParents(schoolId, studentId, requester = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to retrieve student parents');
  }

  // 1. Verify student exists in current tenant
  const student = await prisma.student.findFirst({
    where: { id: studentId, schoolId }
  });
  if (!student) {
    throw new NotFoundError('Student');
  }

  // 2. Parent self-service check: if requester is a PARENT, verify active link
  if (requester?.systemRole === 'PARENT') {
    const parentProfile = await parentRepository.findParentByUserId(requester.userId || requester.id);
    if (!parentProfile) {
      throw new NotFoundError('Student');
    }
    const link = await parentRepository.findParentStudentLink(schoolId, studentId, parentProfile.id);
    if (!link) {
      throw new NotFoundError('Student');
    }
  }

  return parentRepository.findStudentParents(schoolId, studentId);
}

/**
 * Links a parent to a student (supports Mode A: link existing, and Mode B: create new & link).
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} studentId - Student UUID
 * @param {Object} data - Link payload
 * @param {Object} [actor] - Context of requesting user
 * @returns {Promise<Object>}
 */
export async function linkParentToStudent(schoolId, studentId, data, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to link parent');
  }

  // 1. Verify student exists in current tenant
  const student = await prisma.student.findFirst({
    where: { id: studentId, schoolId },
    select: { id: true, firstName: true, lastName: true }
  });
  if (!student) {
    throw new NotFoundError('Student');
  }

  const relationship = data.relationship.trim();

  // MODE A: Link existing parent by ID
  if (data.parentProfileId) {
    const parentProfile = await parentRepository.findParentById(schoolId, data.parentProfileId);
    if (!parentProfile) {
      throw new NotFoundError('Parent');
    }

    // Check duplicate link
    const existingLink = await parentRepository.findParentStudentLink(schoolId, studentId, data.parentProfileId);
    if (existingLink) {
      throw new ConflictError('Parent is already linked to this student');
    }

    const createdLink = await parentRepository.createParentStudentLink({
      schoolId,
      studentId,
      parentProfileId: data.parentProfileId,
      relationship
    });

    await createAuditLog({
      schoolId,
      entityType: 'ParentStudentLink',
      entityId: createdLink.id,
      actionPerformed: `LINK_PARENT_STUDENT: ${parentProfile.name} linked to ${student.firstName}`,
      userName: actor?.email || actor?.userId || 'Administrator',
      userRole: actor?.systemRole || null,
      modifiedFields: {
        studentId,
        parentProfileId: data.parentProfileId,
        relationship
      }
    });

    return createdLink;
  }

  // MODE B: Create new parent or reuse by matching email/phone
  const name = data.name.trim();
  const phone = data.phone ? data.phone.trim() : null;
  const email = data.email ? data.email.trim().toLowerCase() : null;
  const address = data.address ? data.address.trim() : null;
  const emergencyContact = data.emergencyContact ? data.emergencyContact.trim() : null;

  // Identity reuse check in current tenant
  let matchedParent = null;
  if (email) {
    matchedParent = await parentRepository.findParentByEmail(schoolId, email);
  }
  if (!matchedParent && phone) {
    matchedParent = await parentRepository.findParentByPhone(schoolId, phone);
  }

  if (matchedParent) {
    // Reuse existing parent profile
    const existingLink = await parentRepository.findParentStudentLink(schoolId, studentId, matchedParent.id);
    if (existingLink) {
      throw new ConflictError('Parent is already linked to this student');
    }

    const createdLink = await parentRepository.createParentStudentLink({
      schoolId,
      studentId,
      parentProfileId: matchedParent.id,
      relationship
    });

    await createAuditLog({
      schoolId,
      entityType: 'ParentStudentLink',
      entityId: createdLink.id,
      actionPerformed: `LINK_PARENT_STUDENT: ${matchedParent.name} linked to ${student.firstName}`,
      userName: actor?.email || actor?.userId || 'Administrator',
      userRole: actor?.systemRole || null,
      modifiedFields: {
        studentId,
        parentProfileId: matchedParent.id,
        relationship
      }
    });

    return createdLink;
  }

  // Genuinely create new User + ParentProfile + ParentStudentLink atomically
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { code: true }
  });
  const schoolCode = school?.code || 'school';

  let userEmail;
  if (email) {
    userEmail = email;
    const existingUser = await prisma.user.findFirst({
      where: { schoolId, email: userEmail }
    });
    if (existingUser) {
      throw new ConflictError('Email address is already in use in this school');
    }
  } else {
    const randomHex = crypto.randomBytes(4).toString('hex');
    const identifier = phone ? phone.replace(/\D/g, '') : crypto.randomUUID().slice(0, 8);
    userEmail = `parent.${identifier}_${randomHex}@${schoolCode}.parent.internal`;
  }

  const { link, profile } = await prisma.$transaction(async (tx) => {
    // 1. Create User
    const user = await tx.user.create({
      data: {
        schoolId,
        email: userEmail,
        passwordHash: '!LOCKED_NO_PASSWORD_SET',
        passwordAlgorithm: 'argon2id',
        systemRole: 'PARENT',
        tokenVersion: 1,
        isActive: true
      }
    });

    // 2. Create ParentProfile
    const newProfile = await tx.parentProfile.create({
      data: {
        schoolId,
        userId: user.id,
        name,
        phone,
        email,
        address,
        emergencyContact
      }
    });

    // 3. Create Link
    const newLink = await tx.parentStudentLink.create({
      data: {
        schoolId,
        studentId,
        parentProfileId: newProfile.id,
        relationship
      },
      select: {
        id: true,
        schoolId: true,
        studentId: true,
        parentProfileId: true,
        relationship: true,
        createdAt: true,
        parent: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            user: {
              select: {
                id: true,
                email: true,
                isActive: true
              }
            }
          }
        }
      }
    });

    return { link: newLink, profile: newProfile };
  });

  // Post-transaction AuditLog dispatch
  await createAuditLog({
    schoolId,
    entityType: 'ParentProfile',
    entityId: profile.id,
    actionPerformed: `CREATE_PARENT: ${profile.name}`,
    userName: actor?.email || actor?.userId || 'Administrator',
    userRole: actor?.systemRole || null,
    modifiedFields: {
      name: profile.name,
      phone: profile.phone,
      email: profile.email
    }
  });

  await createAuditLog({
    schoolId,
    entityType: 'ParentStudentLink',
    entityId: link.id,
    actionPerformed: `LINK_PARENT_STUDENT: ${profile.name} linked to ${student.firstName}`,
    userName: actor?.email || actor?.userId || 'Administrator',
    userRole: actor?.systemRole || null,
    modifiedFields: {
      studentId,
      parentProfileId: profile.id,
      relationship
    }
  });

  return link;
}

/**
 * Unlinks a parent from a student within a tenant (removes link only).
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} studentId - Student UUID
 * @param {string} parentProfileId - ParentProfile UUID
 * @param {Object} [actor] - Context of requesting user
 * @returns {Promise<void>}
 */
export async function unlinkParentFromStudent(schoolId, studentId, parentProfileId, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to unlink parent');
  }

  const link = await parentRepository.findParentStudentLink(schoolId, studentId, parentProfileId);
  if (!link) {
    throw new NotFoundError('Parent link');
  }

  await parentRepository.deleteParentStudentLink(schoolId, studentId, parentProfileId);

  await createAuditLog({
    schoolId,
    entityType: 'ParentStudentLink',
    entityId: link.id,
    actionPerformed: `UNLINK_PARENT_STUDENT: ${link.parent?.name || 'Parent'} unlinked from ${link.student?.firstName || 'Student'}`,
    userName: actor?.email || actor?.userId || 'Administrator',
    userRole: actor?.systemRole || null,
    modifiedFields: {
      studentId,
      parentProfileId,
      relationship: link.relationship
    }
  });
}

/**
 * Retrieves children linked to the authenticated parent user within a tenant.
 *
 * @param {string} userId - Authenticated Parent User UUID
 * @param {string} schoolId - Tenant UUID
 * @returns {Promise<Array>}
 */
export async function getMyChildren(userId, schoolId) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to retrieve children');
  }

  return parentRepository.findChildrenByParentUserId(userId, schoolId);
}

/**
 * Self-service: Links a child to the authenticated parent using admission number and date of birth.
 *
 * @param {string} userId - Authenticated Parent User UUID
 * @param {string} schoolId - Tenant UUID
 * @param {Object} data - Payload containing { admissionNumber, dob, relationship }
 * @param {Object} [actor] - Context of requesting user
 * @returns {Promise<Object>}
 */
export async function linkChildSelfService(userId, schoolId, data, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to link child');
  }
  if (!userId) {
    throw new TenantAccessError('User context required to link child');
  }

  // 1. Resolve the parent's ParentProfile within this tenant
  const parentProfile = await parentRepository.findParentByUserId(userId);
  if (!parentProfile || parentProfile.schoolId !== schoolId) {
    throw new NotFoundError('Parent profile');
  }

  // 2. Lookup student in this tenant matching admissionNumber AND dob
  const normalizedAdmission = data.admissionNumber.trim();
  const normalizedDob = data.dob.trim();
  const relationship = data.relationship.trim();

  const student = await parentRepository.findStudentByAdmissionAndDob(schoolId, normalizedAdmission, normalizedDob);
  if (!student) {
    // Return generic not found to avoid student enumeration
    throw new NotFoundError('Student');
  }

  // 3. Check for existing link
  const existingLink = await parentRepository.findParentStudentLink(schoolId, student.id, parentProfile.id);
  if (existingLink) {
    throw new ConflictError('Parent is already linked to this student');
  }

  // 4. Create ParentStudentLink atomically with P2002 handling
  let createdLink;
  try {
    createdLink = await parentRepository.createParentStudentLink({
      schoolId,
      studentId: student.id,
      parentProfileId: parentProfile.id,
      relationship
    });
  } catch (err) {
    if (err.code === 'P2002') {
      throw new ConflictError('Parent is already linked to this student');
    }
    throw err;
  }

  // 5. Canonical AuditLog dispatch (non-blocking)
  try {
    await createAuditLog({
      schoolId,
      entityType: 'ParentStudentLink',
      entityId: createdLink.id,
      actionPerformed: `LINK_PARENT_STUDENT: ${parentProfile.name} linked to ${student.firstName}`,
      userName: actor?.email || actor?.userId || 'Parent',
      userRole: actor?.systemRole || 'PARENT',
      modifiedFields: {
        studentId: student.id,
        parentProfileId: parentProfile.id,
        relationship
      }
    });
  } catch (_auditErr) {
    // Non-blocking post-commit audit warning
  }

  return {
    id: createdLink.id,
    relationship: createdLink.relationship,
    createdAt: createdLink.createdAt,
    student: createdLink.student || {
      id: student.id,
      admissionNumber: student.admissionNumber,
      rollNumber: student.rollNumber,
      firstName: student.firstName,
      lastName: student.lastName,
      dob: student.dob,
      gender: student.gender,
      bloodGroup: student.bloodGroup,
      photoUrl: student.photoUrl,
      status: student.status,
      classId: student.classId,
      sectionId: student.sectionId,
      class: student.class,
      section: student.section
    }
  };
}

/**
 * Self-service: Unlinks a child from the authenticated parent.
 *
 * @param {string} userId - Authenticated Parent User UUID
 * @param {string} schoolId - Tenant UUID
 * @param {string} studentId - Student UUID
 * @param {Object} [actor] - Context of requesting user
 * @returns {Promise<void>}
 */
export async function unlinkChildSelfService(userId, schoolId, studentId, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to unlink child');
  }
  if (!userId) {
    throw new TenantAccessError('User context required to unlink child');
  }

  // 1. Resolve parent profile
  const parentProfile = await parentRepository.findParentByUserId(userId);
  if (!parentProfile || parentProfile.schoolId !== schoolId) {
    throw new NotFoundError('Parent profile');
  }

  // 2. Locate exact parent student link
  const link = await parentRepository.findParentStudentLink(schoolId, studentId, parentProfile.id);
  if (!link) {
    throw new NotFoundError('Parent link');
  }

  // 3. Delete link only
  await parentRepository.deleteParentStudentLink(schoolId, studentId, parentProfile.id);

  // 4. Canonical AuditLog dispatch (non-blocking)
  try {
    await createAuditLog({
      schoolId,
      entityType: 'ParentStudentLink',
      entityId: link.id,
      actionPerformed: `UNLINK_PARENT_STUDENT: ${parentProfile.name || 'Parent'} unlinked from ${link.student?.firstName || 'Student'}`,
      userName: actor?.email || actor?.userId || 'Parent',
      userRole: actor?.systemRole || 'PARENT',
      modifiedFields: {
        studentId,
        parentProfileId: parentProfile.id,
        relationship: link.relationship
      }
    });
  } catch (_auditErr) {
    // Non-blocking post-commit audit warning
  }
}
