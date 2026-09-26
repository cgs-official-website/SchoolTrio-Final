import * as staffRepository from './staff.repository.js';
import { prisma } from '../../database/prisma.client.js';
import { createAuditLog } from '../audit/audit.repository.js';
import {
  NotFoundError,
  ConflictError,
  TenantAccessError,
  ValidationError
} from '../../utils/app-error.js';
import { SYSTEM_ROLES } from '../../config/constants.js';
import { RedisCacheService } from '../../services/redis-cache.service.js';

/**
 * Staff and Staff Profiles Business Logic Service Layer
 */

/**
 * Serializes staff profile for directory listing.
 * Omits sensitive HR and financial fields unless privileged.
 */
export function serializeStaff(staff, hasHRPrivilege = false) {
  if (!staff) return null;

  const isRegistered = Boolean(staff.user && typeof staff.user.passwordHash === 'string' && !staff.user.passwordHash.startsWith('!'));

  const serialized = {
    id: staff.id,
    schoolId: staff.schoolId,
    userId: staff.userId,
    employeeId: staff.employeeId,
    name: staff.name,
    staffType: staff.staffType,
    designation: staff.designation,
    phone: staff.phone,
    email: staff.email,
    status: staff.status,
    isRegistered,
    assignedClassId: staff.assignedClassId,
    assignedClass: staff.assignedClass || null,
    headedClasses: staff.headedClasses || [],
    createdAt: staff.createdAt,
    updatedAt: staff.updatedAt,
    user: staff.user ? {
      id: staff.user.id,
      email: staff.user.email,
      systemRole: staff.user.systemRole,
      isActive: staff.user.isActive,
      isRegistered,
      roleAssignments: staff.user.roleAssignments || []
    } : null,
    assignments: staff.customData?.assignments || {
      assignedSubjectIds: [],
      subjectClassIds: []
    }
  };

  // Directory metadata from customData
  if (staff.customData) {
    serialized.photoUrl = staff.customData.photoUrl || staff.customData.documents?.photoUrl || null;
    serialized.gender = staff.customData.gender || null;
    serialized.bloodGroup = staff.customData.bloodGroup || null;
    serialized.dob = staff.customData.dob || null;
    serialized.maritalStatus = staff.customData.maritalStatus || null;
    serialized.nationality = staff.customData.nationality || null;
    serialized.address = staff.customData.address || staff.customData.residentialAddress || null;
    serialized.emergencyContact = staff.customData.emergencyContact || null;
    serialized.fatherGuardianName = staff.customData.fatherGuardianName || staff.customData.fatherName || null;
    serialized.languagesKnown = staff.customData.languagesKnown || null;
    serialized.qualifications = staff.customData.qualifications || null;
    serialized.experience = staff.customData.experience || null;
    serialized.documents = staff.customData.documents || null;
  }

  // Privileged HR and Financial Fields
  if (hasHRPrivilege) {
    serialized.baseSalary = staff.baseSalary;
    serialized.financial = staff.customData?.financial || {
      panNumber: staff.customData?.panNumber || null,
      aadharNumber: staff.customData?.aadharNumber || null,
      bankName: staff.customData?.bankName || null,
      bankAccountNumber: staff.customData?.bankAccountNumber || null,
      branchName: staff.customData?.branchName || null,
      ifscCode: staff.customData?.ifscCode || null,
      pfNumber: staff.customData?.pfNumber || null,
      esicNumber: staff.customData?.esicNumber || null,
      uanNumber: staff.customData?.uanNumber || null,
      govtIdType: staff.customData?.govtIdType || null,
      govtIdNumber: staff.customData?.govtIdNumber || null,
      taxIdDetails: staff.customData?.taxIdDetails || null
    };
  }

  return serialized;
}

/**
 * Checks if requester has privileged HR/Payroll access.
 */
function hasHRPayrollAccess(requester) {
  if (!requester) return false;
  const role = requester.systemRole || requester.role;
  if (role === SYSTEM_ROLES.SUPER_ADMIN || role === SYSTEM_ROLES.SCHOOL_ADMIN || role === 'admin' || role === 'superadmin') {
    return true;
  }
  const permissions = requester.permissions || [];
  return permissions.includes('hr-payroll:read') || permissions.includes('hr-payroll:edit');
}

/**
 * Lists paginated staff members for a tenant.
 */
export async function listStaff(schoolId, query = {}, requester = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to list staff');
  }

  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(1000, Math.max(1, parseInt(query.limit, 10) || 20));
  const skip = (page - 1) * limit;

  const options = {
    search: query.search?.trim(),
    phone: query.phone?.trim(),
    email: query.email?.trim()?.toLowerCase(),
    staffType: query.staffType,
    status: query.status,
    roleId: query.roleId,
    classId: query.classId,
    skip,
    take: limit,
    sort: query.sort,
    order: query.order
  };

  const [staffList, total] = await Promise.all([
    staffRepository.findStaff(schoolId, options),
    staffRepository.countStaff(schoolId, options)
  ]);

  const hasHRAccess = hasHRPayrollAccess(requester);
  const serialized = staffList.map(s => serializeStaff(s, hasHRAccess));

  return {
    staff: serialized,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1
    }
  };
}

/**
 * Retrieves a single staff profile by ID within a tenant.
 */
export async function getStaffById(schoolId, id, requester = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to retrieve staff');
  }

  const staff = await staffRepository.findStaffById(schoolId, id);
  if (!staff) {
    throw new NotFoundError('Staff profile');
  }

  const hasHRAccess = hasHRPayrollAccess(requester);
  return serializeStaff(staff, hasHRAccess);
}

/**
 * Self-service retrieval for logged-in staff member.
 */
/**
 * Ensures a staff profile exists for the user, auto-linking or auto-creating if needed.
 */
export async function ensureStaffProfile(schoolId, userId) {
  let staff = await staffRepository.findStaffByUserId(schoolId, userId);
  if (staff) return staff;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, systemRole: true }
  });

  if (!user) {
    throw new NotFoundError('User account');
  }

  const userEmail = user.email ? user.email.trim().toLowerCase() : null;
  if (userEmail) {
    const staffByEmail = await staffRepository.findStaffByEmail(schoolId, userEmail);
    if (staffByEmail) {
      await prisma.staffProfile.update({
        where: { schoolId_id: { schoolId, id: staffByEmail.id } },
        data: { userId }
      });
      return staffRepository.findStaffById(schoolId, staffByEmail.id);
    }
  }

  // Auto-provision staff profile if none exists for this user
  const created = await staffRepository.createStaffProfile({
    schoolId,
    userId,
    name: userEmail ? userEmail.split('@')[0] : 'Staff Member',
    email: userEmail || `${userId.slice(0, 8)}@school.local`,
    staffType: user.systemRole === SYSTEM_ROLES.TEACHER ? 'teaching' : 'non-teaching',
    status: 'Active'
  });

  return staffRepository.findStaffById(schoolId, created.id);
}

/**
 * Self-service retrieval for logged-in staff member.
 */
export async function getStaffMe(schoolId, userId) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required');
  }
  if (!userId) {
    throw new ValidationError('User context required');
  }

  const staff = await ensureStaffProfile(schoolId, userId);
  return serializeStaff(staff, true);
}

/**
 * Creates a new staff member atomically (User + StaffProfile + UserRoleAssignment + ClassTeacher linkage).
 */
export async function createStaff(schoolId, data, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to create staff');
  }

  const email = data.email.trim().toLowerCase();
  const name = `${data.firstName.trim()} ${data.lastName ? data.lastName.trim() : ''}`.trim();
  const employeeId = data.employeeId ? data.employeeId.trim() : null;
  const staffType = data.staffType || 'teaching';
  const status = data.status || 'Active';
  const isActive = status !== 'Inactive';

  // 1. Determine System Role
  const systemRole = staffType === 'teaching' ? SYSTEM_ROLES.TEACHER : SYSTEM_ROLES.STAFF;

  // 2. Validate Tenant Email Uniqueness
  const existingUser = await prisma.user.findFirst({
    where: { schoolId, email }
  });
  if (existingUser) {
    throw new ConflictError('Email address is already registered in this school');
  }

  // 3. Validate Tenant Employee ID Uniqueness
  if (employeeId) {
    const existingEmp = await staffRepository.findStaffByEmployeeId(schoolId, employeeId);
    if (existingEmp) {
      throw new ConflictError(`Employee ID '${employeeId}' is already in use in this school`);
    }
  }

  // 4. Validate / Resolve Role ID
  let assignedRoleId = data.roleId || null;
  if (assignedRoleId) {
    const role = await prisma.schoolRole.findFirst({
      where: {
        schoolId,
        OR: [
          { id: assignedRoleId },
          { name: { equals: assignedRoleId, mode: 'insensitive' } },
          { slug: { equals: assignedRoleId.toLowerCase(), mode: 'insensitive' } }
        ]
      }
    });
    if (!role) {
      throw new NotFoundError('School role');
    }
    assignedRoleId = role.id;
  } else {
    const roleName = data.designation || 'Staffs';
    const fallbackRole = await prisma.schoolRole.findFirst({
      where: {
        schoolId,
        OR: [
          { name: { equals: roleName, mode: 'insensitive' } },
          { slug: { equals: roleName.toLowerCase(), mode: 'insensitive' } },
          { slug: 'staffs' }
        ]
      }
    });
    if (fallbackRole) {
      assignedRoleId = fallbackRole.id;
    }
  }

  // 5. Validate Assigned Class ID if provided
  if (data.assignedClassId) {
    const cls = await prisma.class.findFirst({
      where: { id: data.assignedClassId, schoolId }
    });
    if (!cls) {
      throw new NotFoundError('Class');
    }
  }

  // 6. Build structured customData
  const customData = {
    ...(data.customData || {}),
    firstName: data.firstName.trim(),
    lastName: data.lastName ? data.lastName.trim() : '',
    gender: data.gender || 'Male',
    dob: data.dob || null,
    bloodGroup: data.bloodGroup || null,
    maritalStatus: data.maritalStatus || null,
    nationality: data.nationality || null,
    address: data.address || null,
    emergencyContact: data.emergencyContact || null,
    fatherGuardianName: data.fatherGuardianName || null,
    languagesKnown: data.languagesKnown || null,
    qualifications: data.qualifications || null,
    experience: data.experience || null,
    financial: data.financial || null,
    documents: data.documents || null,
    assignments: data.assignments || {
      assignedSubjectIds: data.assignedSubjectIds || [],
      subjectClassIds: data.subjectClassIds || []
    }
  };

  let createdStaffProfile;

  try {
    // 7. Atomic Transaction Execution
    createdStaffProfile = await prisma.$transaction(async (tx) => {
      // Step A: Lock Class row if assignedClassId provided
      if (data.assignedClassId) {
        await staffRepository.lockClassForUpdate(schoolId, data.assignedClassId, tx);
      }

      // Step B: Create User entity
      const user = await staffRepository.createUser({
        schoolId,
        email,
        passwordHash: '!LOCKED_NO_PASSWORD_SET',
        systemRole,
        tokenVersion: 1,
        isActive
      }, tx);

      // Step C: Create StaffProfile entity
      const profile = await staffRepository.createStaffProfile({
        schoolId,
        userId: user.id,
        name,
        email,
        phone: data.phone ? data.phone.trim() : null,
        employeeId,
        staffType,
        designation: data.designation ? data.designation.trim() : null,
        assignedClassId: data.assignedClassId || null,
        baseSalary: data.baseSalary !== undefined && data.baseSalary !== null ? data.baseSalary : 0,
        status,
        customData
      }, tx);

      // Step D: Assign School Role if provided or resolved
      if (assignedRoleId) {
        await staffRepository.assignUserRole(user.id, assignedRoleId, schoolId, tx);
      }

      // Step E: Update Class.classTeacherId if assigned
      if (data.assignedClassId) {
        // Clear previous teacher on that class if any
        const existingClass = await tx.class.findUnique({
          where: { id: data.assignedClassId },
          select: { classTeacherId: true }
        });
        if (existingClass?.classTeacherId && existingClass.classTeacherId !== profile.id) {
          await tx.staffProfile.update({
            where: { schoolId_id: { schoolId, id: existingClass.classTeacherId } },
            data: { assignedClassId: null }
          });
        }
        await staffRepository.updateClassTeacher(schoolId, data.assignedClassId, profile.id, tx);
      }

      return profile;
    }, { maxWait: 15000, timeout: 30000 });
  } catch (error) {
    if (error.code === 'P2002') {
      const target = error.meta?.target;
      if (Array.isArray(target) && target.includes('employee_id')) {
        throw new ConflictError(`Employee ID '${employeeId}' is already in use in this school`);
      }
      throw new ConflictError('A unique constraint conflict occurred while creating the staff profile');
    }
    throw error;
  }

  // 8. Canonical Audit Logging
  await createAuditLog({
    schoolId,
    entityType: 'StaffProfile',
    entityId: createdStaffProfile.id,
    actionPerformed: `CREATE_STAFF: ${createdStaffProfile.name}`,
    userName: actor?.email || actor?.userId || 'Administrator',
    userRole: actor?.systemRole || null,
    modifiedFields: {
      name: { old: null, new: createdStaffProfile.name },
      email: { old: null, new: createdStaffProfile.email },
      employeeId: { old: null, new: createdStaffProfile.employeeId },
      staffType: { old: null, new: createdStaffProfile.staffType },
      status: { old: null, new: createdStaffProfile.status }
    }
  });

  if (data.assignedClassId) {
    await createAuditLog({
      schoolId,
      entityType: 'Class',
      entityId: data.assignedClassId,
      actionPerformed: `ASSIGN_CLASS_TEACHER: ${createdStaffProfile.name}`,
      userName: actor?.email || actor?.userId || 'Administrator',
      userRole: actor?.systemRole || null,
      modifiedFields: {
        classTeacherId: { old: null, new: createdStaffProfile.id }
      }
    });
  }

  if (data.roleId && createdStaffProfile?.userId) {
    await RedisCacheService.del(`rbac:perms:${schoolId}:${createdStaffProfile.userId}`);
  }

  return serializeStaff(createdStaffProfile, hasHRPayrollAccess(actor));
}

/**
 * Updates a staff member profile, role, status, email, and class assignments.
 */
export async function updateStaff(schoolId, id, data, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to update staff');
  }

  const existingStaff = await staffRepository.findStaffById(schoolId, id);
  if (!existingStaff) {
    throw new NotFoundError('Staff profile');
  }

  const profileUpdateData = {};
  const userUpdateData = {};
  const modifiedFields = {};
  let roleUpdateRequired = false;
  let classAssignmentUpdate = null; // null | { unassign: true } | { assignClassId: string }

  // 1. Name updates
  if (data.firstName !== undefined || data.lastName !== undefined) {
    const currentFirst = existingStaff.customData?.firstName || existingStaff.name.split(' ')[0] || '';
    const currentLast = existingStaff.customData?.lastName || existingStaff.name.split(' ').slice(1).join(' ') || '';
    const newFirst = data.firstName !== undefined ? data.firstName.trim() : currentFirst;
    const newLast = data.lastName !== undefined ? (data.lastName ? data.lastName.trim() : '') : currentLast;
    const newFullName = `${newFirst} ${newLast}`.trim();

    if (newFullName !== existingStaff.name) {
      modifiedFields.name = { old: existingStaff.name, new: newFullName };
      profileUpdateData.name = newFullName;
    }
  }

  // 2. Phone
  if (data.phone !== undefined) {
    const newPhone = data.phone ? data.phone.trim() : null;
    if (newPhone !== existingStaff.phone) {
      modifiedFields.phone = { old: existingStaff.phone, new: newPhone };
      profileUpdateData.phone = newPhone;
    }
  }

  // 3. Designation
  if (data.designation !== undefined) {
    const newDesig = data.designation ? data.designation.trim() : null;
    if (newDesig !== existingStaff.designation) {
      modifiedFields.designation = { old: existingStaff.designation, new: newDesig };
      profileUpdateData.designation = newDesig;
    }
  }

  // 4. Staff Type
  if (data.staffType !== undefined) {
    if (data.staffType !== existingStaff.staffType) {
      modifiedFields.staffType = { old: existingStaff.staffType, new: data.staffType };
      profileUpdateData.staffType = data.staffType;
      userUpdateData.systemRole = data.staffType === 'teaching' ? SYSTEM_ROLES.TEACHER : SYSTEM_ROLES.STAFF;
    }
  }

  // 5. Employee ID
  if (data.employeeId !== undefined) {
    const newEmpId = data.employeeId ? data.employeeId.trim() : null;
    if (newEmpId !== existingStaff.employeeId) {
      if (newEmpId) {
        const empConflict = await staffRepository.findStaffByEmployeeId(schoolId, newEmpId);
        if (empConflict && empConflict.id !== id) {
          throw new ConflictError(`Employee ID '${newEmpId}' is already in use in this school`);
        }
      }
      modifiedFields.employeeId = { old: existingStaff.employeeId, new: newEmpId };
      profileUpdateData.employeeId = newEmpId;
    }
  }

  // 6. Base Salary
  if (data.baseSalary !== undefined) {
    const newSalary = data.baseSalary !== null ? Number(data.baseSalary) : 0;
    const oldSalary = existingStaff.baseSalary !== null ? Number(existingStaff.baseSalary) : 0;
    if (newSalary !== oldSalary) {
      modifiedFields.baseSalary = { old: oldSalary, new: newSalary };
      profileUpdateData.baseSalary = newSalary;
    }
  }

  // 7. Email & User.email sync
  if (data.email !== undefined) {
    const newEmail = data.email.trim().toLowerCase();
    if (newEmail !== existingStaff.email) {
      const conflictUser = await prisma.user.findFirst({
        where: { schoolId, email: newEmail, NOT: { id: existingStaff.userId } }
      });
      if (conflictUser) {
        throw new ConflictError('Email address is already registered in this school');
      }
      modifiedFields.email = { old: existingStaff.email, new: newEmail };
      profileUpdateData.email = newEmail;
      userUpdateData.email = newEmail;
    }
  }

  // 8. Status & Deactivation Invariants
  if (data.status !== undefined) {
    if (data.status !== existingStaff.status) {
      modifiedFields.status = { old: existingStaff.status, new: data.status };
      profileUpdateData.status = data.status;

      if (data.status === 'Inactive') {
        userUpdateData.isActive = false;
        userUpdateData.tokenVersion = { increment: 1 };
        // Clear class teacher assignment automatically upon deactivation
        if (existingStaff.assignedClassId) {
          classAssignmentUpdate = { unassign: true };
        }
      } else if (existingStaff.status === 'Inactive' && data.status === 'Active') {
        userUpdateData.isActive = true;
      }
    }
  }

  // 9. Role Assignment
  let targetRoleId = data.roleId !== undefined ? (data.roleId || null) : null;
  if (data.roleId !== undefined) {
    if (data.roleId) {
      const role = await prisma.schoolRole.findFirst({
        where: {
          schoolId,
          OR: [
            { id: data.roleId },
            { name: { equals: data.roleId, mode: 'insensitive' } },
            { slug: { equals: data.roleId.toLowerCase(), mode: 'insensitive' } }
          ]
        }
      });
      if (!role) {
        throw new NotFoundError('School role');
      }
      targetRoleId = role.id;
    } else if (data.designation || existingStaff.designation) {
      const roleName = data.designation || existingStaff.designation || 'Staffs';
      const fallbackRole = await prisma.schoolRole.findFirst({
        where: {
          schoolId,
          OR: [
            { name: { equals: roleName, mode: 'insensitive' } },
            { slug: { equals: roleName.toLowerCase(), mode: 'insensitive' } },
            { slug: 'staffs' }
          ]
        }
      });
      if (fallbackRole) {
        targetRoleId = fallbackRole.id;
      }
    }
    roleUpdateRequired = true;
    modifiedFields.roleId = { old: existingStaff.user?.roleAssignments?.[0]?.schoolRoleId || null, new: targetRoleId };
  } else if (existingStaff.userId && existingStaff.user?.roleAssignments?.length === 0) {
    const roleName = data.designation || existingStaff.designation || 'Staffs';
    const fallbackRole = await prisma.schoolRole.findFirst({
      where: {
        schoolId,
        OR: [
          { name: { equals: roleName, mode: 'insensitive' } },
          { slug: { equals: roleName.toLowerCase(), mode: 'insensitive' } },
          { slug: 'staffs' }
        ]
      }
    });
    if (fallbackRole) {
      targetRoleId = fallbackRole.id;
      roleUpdateRequired = true;
    }
  }

  // 10. Class Teacher Assignment
  if (data.assignedClassId !== undefined && !classAssignmentUpdate) {
    const newClassId = data.assignedClassId || null;
    if (newClassId) {
      const cls = await prisma.class.findFirst({
        where: { id: newClassId, schoolId }
      });
      if (!cls) {
        throw new NotFoundError('Class');
      }
      if (newClassId !== existingStaff.assignedClassId || cls.classTeacherId !== id) {
        classAssignmentUpdate = { assignClassId: newClassId };
        modifiedFields.assignedClassId = { old: existingStaff.assignedClassId, new: newClassId };
      }
    } else if (existingStaff.assignedClassId) {
      classAssignmentUpdate = { unassign: true };
      modifiedFields.assignedClassId = { old: existingStaff.assignedClassId, new: null };
    }
  }

  // 11. CustomData deep merge
  const existingCustom = existingStaff.customData || {};
  const newCustom = { ...existingCustom };
  let customDataChanged = false;

  const directCustomKeys = [
    'dob', 'gender', 'bloodGroup', 'maritalStatus', 'nationality',
    'address', 'emergencyContact', 'fatherGuardianName', 'languagesKnown',
    'qualifications', 'experience', 'financial', 'documents', 'assignments'
  ];

  directCustomKeys.forEach(k => {
    if (data[k] !== undefined) {
      newCustom[k] = data[k];
      customDataChanged = true;
    }
  });

  if (data.customData) {
    Object.assign(newCustom, data.customData);
    customDataChanged = true;
  }

  if (customDataChanged) {
    profileUpdateData.customData = newCustom;
  }

  // No-op check
  if (
    Object.keys(profileUpdateData).length === 0 &&
    Object.keys(userUpdateData).length === 0 &&
    !roleUpdateRequired &&
    !classAssignmentUpdate
  ) {
    return serializeStaff(existingStaff, hasHRPayrollAccess(actor));
  }

  let updatedStaff;

  try {
    updatedStaff = await prisma.$transaction(async (tx) => {
      // Step A: Row lock staff profile
      await staffRepository.findStaffByIdForUpdate(schoolId, id, tx);

      // Step B: Update StaffProfile
      if (Object.keys(profileUpdateData).length > 0) {
        await staffRepository.updateStaffProfile(schoolId, id, profileUpdateData, tx);
      }

      // Step C: Update User entity
      if (Object.keys(userUpdateData).length > 0) {
        await staffRepository.updateUser(existingStaff.userId, userUpdateData, tx);
      }

      // Step D: Update Role Assignment
      if (roleUpdateRequired) {
        await staffRepository.removeUserRoleAssignments(existingStaff.userId, tx);
        if (targetRoleId) {
          await staffRepository.assignUserRole(existingStaff.userId, targetRoleId, schoolId, tx);
        }
      }

      // Step E: Update Class Teacher Assignment
      if (classAssignmentUpdate) {
        if (classAssignmentUpdate.unassign) {
          // Clear current class if any
          if (existingStaff.assignedClassId) {
            await staffRepository.lockClassForUpdate(schoolId, existingStaff.assignedClassId, tx);
            await staffRepository.updateClassTeacher(schoolId, existingStaff.assignedClassId, null, tx);
          }
          await staffRepository.updateStaffProfile(schoolId, id, { assignedClassId: null }, tx);
        } else if (classAssignmentUpdate.assignClassId) {
          const targetClassId = classAssignmentUpdate.assignClassId;
          // Lock target class
          await staffRepository.lockClassForUpdate(schoolId, targetClassId, tx);

          // Clear previous teacher on target class if any
          const targetClass = await tx.class.findUnique({
            where: { id: targetClassId },
            select: { classTeacherId: true }
          });
          if (targetClass?.classTeacherId && targetClass.classTeacherId !== id) {
            await tx.staffProfile.update({
              where: { schoolId_id: { schoolId, id: targetClass.classTeacherId } },
              data: { assignedClassId: null }
            });
          }

          // Clear previous class headed by this staff if any
          if (existingStaff.assignedClassId && existingStaff.assignedClassId !== targetClassId) {
            await staffRepository.lockClassForUpdate(schoolId, existingStaff.assignedClassId, tx);
            await staffRepository.updateClassTeacher(schoolId, existingStaff.assignedClassId, null, tx);
          }

          // Apply assignment
          await staffRepository.updateClassTeacher(schoolId, targetClassId, id, tx);
          await staffRepository.updateStaffProfile(schoolId, id, { assignedClassId: targetClassId }, tx);
        }
      }

      return staffRepository.findStaffById(schoolId, id, tx);
    }, { maxWait: 10000, timeout: 20000 });
  } catch (error) {
    if (error.code === 'P2002') {
      const target = error.meta?.target;
      if (Array.isArray(target) && target.includes('employee_id')) {
        throw new ConflictError(`Employee ID '${data.employeeId}' is already in use in this school`);
      }
      throw new ConflictError('A unique constraint conflict occurred while updating the staff profile');
    }
    throw error;
  }

  // Canonical Audit Logging
  const auditAction = modifiedFields.status
    ? (data.status === 'Inactive' ? `DISABLE_STAFF: ${updatedStaff.name}` : `ENABLE_STAFF: ${updatedStaff.name}`)
    : `UPDATE_STAFF: ${updatedStaff.name}`;

  await createAuditLog({
    schoolId,
    entityType: 'StaffProfile',
    entityId: id,
    actionPerformed: auditAction,
    userName: actor?.email || actor?.userId || 'Administrator',
    userRole: actor?.systemRole || null,
    modifiedFields
  });

  if (roleUpdateRequired && updatedStaff?.userId) {
    await RedisCacheService.del(`rbac:perms:${schoolId}:${updatedStaff.userId}`);
  }

  return serializeStaff(updatedStaff, hasHRPayrollAccess(actor));
}

/**
 * Updates staff assignments (class teacher and subject metadata).
 */
export async function assignStaff(schoolId, id, data, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required');
  }

  const existingStaff = await staffRepository.findStaffById(schoolId, id);
  if (!existingStaff) {
    throw new NotFoundError('Staff profile');
  }

  // 1. Validate Subjects in current tenant if provided
  if (data.assignedSubjectIds && data.assignedSubjectIds.length > 0) {
    const validSubjects = await prisma.subject.findMany({
      where: {
        id: { in: data.assignedSubjectIds },
        schoolId
      },
      select: { id: true }
    });
    if (validSubjects.length !== new Set(data.assignedSubjectIds).size) {
      throw new ValidationError('One or more subject IDs do not exist in the current tenant');
    }
  }

  // 2. Validate Subject Classes in current tenant if provided
  if (data.subjectClassIds && data.subjectClassIds.length > 0) {
    const validClasses = await prisma.class.findMany({
      where: {
        id: { in: data.subjectClassIds },
        schoolId
      },
      select: { id: true }
    });
    if (validClasses.length !== new Set(data.subjectClassIds).size) {
      throw new ValidationError('One or more subject class IDs do not exist in the current tenant');
    }
  }

  const updatePayload = {};

  if (data.assignedClassId !== undefined) {
    updatePayload.assignedClassId = data.assignedClassId;
  }

  const existingAssignments = existingStaff.customData?.assignments || {};
  const newAssignments = {
    assignedSubjectIds: data.assignedSubjectIds !== undefined
      ? Array.from(new Set(data.assignedSubjectIds))
      : (existingAssignments.assignedSubjectIds || []),
    subjectClassIds: data.subjectClassIds !== undefined
      ? Array.from(new Set(data.subjectClassIds))
      : (existingAssignments.subjectClassIds || [])
  };

  updatePayload.assignments = newAssignments;

  return updateStaff(schoolId, id, updatePayload, actor);
}

/**
 * Self-service staff profile update (non-privileged fields only).
 */
export async function updateStaffSelf(schoolId, userId, data) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required');
  }

  const existingStaff = await ensureStaffProfile(schoolId, userId);

  // Safe subset allowed for self-service
  const allowedData = {
    phone: data.phone,
    address: data.address,
    emergencyContact: data.emergencyContact,
    dob: data.dob,
    gender: data.gender,
    bloodGroup: data.bloodGroup,
    maritalStatus: data.maritalStatus,
    nationality: data.nationality,
    languagesKnown: data.languagesKnown,
    qualifications: data.qualifications,
    experience: data.experience,
    documents: data.documents,
    customData: data.customData
  };

  return updateStaff(schoolId, existingStaff.id, allowedData, {
    userId,
    email: existingStaff.email,
    systemRole: existingStaff.user?.systemRole
  });
}

export async function deleteStaff(schoolId, id, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to delete staff');
  }

  try {
    await prisma.$transaction(async (tx) => {
      // 1. Acquire row lock on StaffProfile
      const lockedStaff = await staffRepository.findStaffByIdForUpdate(schoolId, id, tx);
      if (!lockedStaff) {
        throw new NotFoundError('Staff profile');
      }

      const userId = lockedStaff.userId || lockedStaff.user_id;
      const assignedClassId = lockedStaff.assignedClassId || lockedStaff.assigned_class_id;

      // 2. Check active class assignments
      if (assignedClassId) {
        throw new ConflictError('Cannot delete staff member who is currently assigned to a class. Please unassign or deactivate first.');
      }

      const headedClasses = await tx.class.count({
        where: { schoolId, classTeacherId: id }
      });
      if (headedClasses > 0) {
        throw new ConflictError('Cannot delete staff member who is currently heading one or more classes. Please unassign or deactivate first.');
      }

      // 3. Check historical dependencies
      const deps = await staffRepository.countStaffDependencies(schoolId, id, tx);
      if (deps.total > 0) {
        const details = [];
        if (deps.lessonPlans > 0) details.push(`${deps.lessonPlans} lesson plan(s)`);
        if (deps.payroll > 0) details.push(`${deps.payroll} payroll record(s)`);
        if (deps.chatRooms > 0) details.push(`${deps.chatRooms} chat room(s)`);
        if (deps.ptms > 0) details.push(`${deps.ptms} PTM appointment(s)`);
        if (deps.timetables > 0) details.push(`${deps.timetables} timetable period(s)`);

        throw new ConflictError(
          `Cannot delete staff member with existing activity history (${details.join(', ')}). Please deactivate the account instead.`
        );
      }

      // 4. Safely clear class teacher references if any
      await tx.class.updateMany({
        where: { schoolId, classTeacherId: id },
        data: { classTeacherId: null }
      });

      // 5. Delete StaffProfile, UserRoleAssignment, and User atomically
      await staffRepository.deleteStaffProfile(schoolId, id, tx);
      if (userId) {
        await staffRepository.removeUserRoleAssignments(userId, tx);
        await staffRepository.deleteUser(userId, tx);
      }
    }, { maxWait: 15000, timeout: 30000 });
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ConflictError || error instanceof TenantAccessError) {
      throw error;
    }
    if (error.code === 'P2003') {
      throw new ConflictError('Cannot delete staff member because active foreign key references exist in other modules. Please deactivate the account instead.');
    }
    if (error.code === 'P2025') {
      throw new NotFoundError('Staff profile');
    }
    throw error;
  }

  // 6. Canonical Audit Logging
  await createAuditLog({
    schoolId,
    entityType: 'StaffProfile',
    entityId: id,
    actionPerformed: `DELETE_STAFF: ${id}`,
    userName: actor?.email || actor?.userId || 'Administrator',
    userRole: actor?.systemRole || null,
    modifiedFields: {
      id: { old: id, new: null }
    }
  });

  return null;
}

