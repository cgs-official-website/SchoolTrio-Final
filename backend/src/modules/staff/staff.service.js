import * as staffRepository from './staff.repository.js';
import { prisma, basePrisma } from '../../database/prisma.client.js';
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
    assignedClassId: staff.customData?.assignments?.assignedClassId || staff.assignedClassId,
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
      assignedClassId: staff.assignedClassId || null,
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
    const uniqueSubjectIds = Array.from(new Set(data.assignedSubjectIds));
    const validSubjects = await prisma.subject.findMany({
      where: {
        id: { in: uniqueSubjectIds },
        schoolId
      },
      select: { id: true }
    });
    if (validSubjects.length !== uniqueSubjectIds.length) {
      throw new ValidationError('One or more subject IDs do not exist in the current tenant');
    }
  }

  // 2. Validate Subject Classes in current tenant if provided (accepts Class.id or Section.id)
  if (data.subjectClassIds && data.subjectClassIds.length > 0) {
    const uniqueSubjectClassIds = Array.from(new Set(data.subjectClassIds));

    const [matchingClasses, matchingSections] = await Promise.all([
      prisma.class.findMany({
        where: { id: { in: uniqueSubjectClassIds }, schoolId },
        select: { id: true }
      }),
      prisma.section?.findMany
        ? prisma.section.findMany({
            where: { id: { in: uniqueSubjectClassIds }, schoolId },
            select: { id: true }
          })
        : []
    ]);

    const validIdSet = new Set([
      ...matchingClasses.map(c => c.id),
      ...(Array.isArray(matchingSections) ? matchingSections.map(s => s.id) : [])
    ]);

    if (uniqueSubjectClassIds.some(cid => !validIdSet.has(cid))) {
      throw new ValidationError('One or more subject class or section IDs do not exist in the current tenant');
    }
  }

  const updatePayload = {};

  // Sanitize: filter subjectClassIds to valid UUIDs only (guards against legacy composite IDs)
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const sanitizedSubjectClassIds = data.subjectClassIds
    ? data.subjectClassIds.filter(id => UUID_REGEX.test(id))
    : undefined;
  const sanitizedSubjectIds = data.assignedSubjectIds
    ? data.assignedSubjectIds.filter(id => UUID_REGEX.test(id))
    : undefined;

  let assignedClassTeachingUnit = undefined;
  if (data.assignedClassId !== undefined) {
    if (data.assignedClassId) {
      // Check if it's a section
      let sectionRecord = null;
      if (prisma.section?.findFirst) {
        sectionRecord = await prisma.section.findFirst({
          where: { id: data.assignedClassId, schoolId },
          select: { id: true, classId: true }
        });
      }

      if (sectionRecord) {
        updatePayload.assignedClassId = sectionRecord.classId;
        assignedClassTeachingUnit = sectionRecord.id;
      } else {
        const classRecord = await prisma.class.findFirst({
          where: { id: data.assignedClassId, schoolId },
          select: { id: true }
        });
        if (classRecord) {
          updatePayload.assignedClassId = classRecord.id;
          assignedClassTeachingUnit = classRecord.id;
        } else {
          throw new ValidationError('Assigned class or section does not exist in the current tenant');
        }
      }
    } else {
      updatePayload.assignedClassId = null;
      assignedClassTeachingUnit = null;
    }
  }

  const existingAssignments = existingStaff.customData?.assignments || {};
  const newAssignments = {
    assignedClassId: assignedClassTeachingUnit !== undefined
      ? assignedClassTeachingUnit
      : (existingAssignments.assignedClassId || existingStaff.assignedClassId || null),
    assignedSubjectIds: sanitizedSubjectIds !== undefined
      ? Array.from(new Set(sanitizedSubjectIds))
      : (existingAssignments.assignedSubjectIds || []),
    subjectClassIds: sanitizedSubjectClassIds !== undefined
      ? Array.from(new Set(sanitizedSubjectClassIds))
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

/**
 * High-performance batch bulk import for staff.
 * Preloads existing records and roles to eliminate N+1 DB loop overhead.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Array<Object>} staffPayload - Array of staff objects to import
 * @param {Object} [actor] - Requesting actor context
 * @returns {Promise<Object>} Summary of created, updated, and failed staff
 */
export async function bulkImportStaff(schoolId, staffPayload = [], actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required for bulk import');
  }

  if (!Array.isArray(staffPayload) || staffPayload.length === 0) {
    throw new ValidationError('Bulk import payload must contain at least one staff object');
  }

  // 1. Extract unique email addresses, employee IDs, and class IDs
  const emails = Array.from(new Set(staffPayload.map(s => s.email?.trim()?.toLowerCase()).filter(Boolean)));
  const employeeIds = Array.from(new Set(staffPayload.map(s => s.employeeId?.trim()).filter(Boolean)));
  const assignedClassIds = Array.from(new Set(staffPayload.map(s => s.assignedClassId).filter(Boolean)));

  // 2. Pre-fetch existing staff, users, school roles, and classes in parallel
  const [existingStaffProfiles, existingUsers, schoolRoles, schoolClasses] = await Promise.all([
    prisma.staffProfile.findMany({
      where: {
        schoolId,
        OR: [
          emails.length > 0 ? { email: { in: emails, mode: 'insensitive' } } : undefined,
          employeeIds.length > 0 ? { employeeId: { in: employeeIds, mode: 'insensitive' } } : undefined
        ].filter(Boolean)
      },
      select: staffRepository.STAFF_SELECT_CONFIG
    }),
    prisma.user.findMany({
      where: {
        schoolId,
        email: { in: emails, mode: 'insensitive' }
      },
      select: {
        id: true,
        email: true,
        systemRole: true,
        isActive: true,
        roleAssignments: {
          select: {
            id: true,
            schoolRoleId: true
          }
        }
      }
    }),
    prisma.schoolRole.findMany({
      where: { schoolId }
    }),
    assignedClassIds.length > 0
      ? prisma.class.findMany({
          where: { schoolId, id: { in: assignedClassIds } }
        })
      : Promise.resolve([])
  ]);

  // Index existing records for O(1) in-memory lookups
  const existingByEmail = new Map();
  const existingByEmpId = new Map();
  for (const st of existingStaffProfiles) {
    if (st.email) existingByEmail.set(st.email.toLowerCase(), st);
    if (st.employeeId) existingByEmpId.set(st.employeeId.toLowerCase(), st);
  }

  const userByEmail = new Map();
  for (const u of existingUsers) {
    if (u.email) userByEmail.set(u.email.toLowerCase(), u);
  }

  // Index school roles
  const roleMap = new Map();
  for (const r of schoolRoles) {
    roleMap.set(r.id, r);
    if (r.name) roleMap.set(r.name.toLowerCase(), r);
    if (r.slug) roleMap.set(r.slug.toLowerCase(), r);
  }

  const classMap = new Map(schoolClasses.map(c => [c.id, c]));

  const resultStaff = [];
  const toCreatePayloads = [];
  const toUpdateItems = [];
  let createdCount = 0;
  let updatedCount = 0;
  const errors = [];

  // 3. Process rows in-memory and categorize into create vs update
  for (let i = 0; i < staffPayload.length; i++) {
    const data = staffPayload[i];
    const email = data.email?.trim()?.toLowerCase();
    const firstName = data.firstName?.trim();

    if (!email || !firstName) {
      errors.push({ index: i, email, message: 'Missing required email or first name' });
      continue;
    }

    const employeeId = data.employeeId ? data.employeeId.trim() : null;
    const existing = existingByEmail.get(email) || (employeeId ? existingByEmpId.get(employeeId.toLowerCase()) : null);

    const staffType = data.staffType || 'teaching';
    const status = data.status || 'Active';
    const isActive = status !== 'Inactive';
    const systemRole = staffType === 'teaching' ? SYSTEM_ROLES.TEACHER : SYSTEM_ROLES.STAFF;
    const name = `${firstName} ${data.lastName ? data.lastName.trim() : ''}`.trim();

    // Resolve School Role ID
    let assignedRoleId = data.roleId || null;
    if (assignedRoleId && !roleMap.has(assignedRoleId)) {
      assignedRoleId = null;
    }
    if (!assignedRoleId) {
      const roleName = data.designation || 'Staffs';
      const matchedRole = roleMap.get(roleName.toLowerCase()) || roleMap.get('staffs');
      if (matchedRole) {
        assignedRoleId = matchedRole.id;
      }
    }

    // Validate assigned class
    let assignedClassId = data.assignedClassId || null;
    if (assignedClassId && !classMap.has(assignedClassId)) {
      assignedClassId = null;
    }

    const customData = {
      ...(data.customData || {}),
      firstName,
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

    if (existing) {
      const updateData = {};
      if (name !== existing.name) updateData.name = name;
      if (data.phone !== undefined && data.phone !== existing.phone) updateData.phone = data.phone ? data.phone.trim() : null;
      if (employeeId && employeeId !== existing.employeeId) updateData.employeeId = employeeId;
      if (staffType !== existing.staffType) updateData.staffType = staffType;
      if (data.designation !== undefined && data.designation !== existing.designation) updateData.designation = data.designation ? data.designation.trim() : null;
      if (assignedClassId !== existing.assignedClassId) updateData.assignedClassId = assignedClassId;
      if (data.baseSalary !== undefined && data.baseSalary !== existing.baseSalary) updateData.baseSalary = Number(data.baseSalary) || 0;
      if (status !== existing.status) updateData.status = status;

      const mergedCustomData = { ...(existing.customData || {}), ...customData };
      if (JSON.stringify(mergedCustomData) !== JSON.stringify(existing.customData || {})) {
        updateData.customData = mergedCustomData;
      }

      toUpdateItems.push({
        id: existing.id,
        userId: existing.userId,
        existing,
        updateData,
        systemRole,
        isActive,
        assignedRoleId,
        assignedClassId
      });
    } else {
      toCreatePayloads.push({
        name,
        firstName,
        lastName: data.lastName ? data.lastName.trim() : '',
        email,
        phone: data.phone ? data.phone.trim() : null,
        employeeId,
        staffType,
        designation: data.designation ? data.designation.trim() : null,
        assignedClassId,
        baseSalary: Number(data.baseSalary) || 0,
        status,
        isActive,
        systemRole,
        assignedRoleId,
        customData
      });
    }
  }

  const affectedIds = [];

  // 4. Perform atomic batch transaction with 60s timeout option
  await basePrisma.$transaction(async (tx) => {
    // A. Handle updates
    for (const item of toUpdateItems) {
      let updatedProfile = item.existing;
      if (Object.keys(item.updateData).length > 0) {
        updatedProfile = await staffRepository.updateStaffProfile(schoolId, item.id, item.updateData, tx);
      }

      if (item.userId) {
        await staffRepository.updateUser(item.userId, {
          isActive: item.isActive,
          systemRole: item.systemRole
        }, tx);

        if (item.assignedRoleId) {
          await staffRepository.removeUserRoleAssignments(item.userId, tx);
          await staffRepository.assignUserRole(item.userId, item.assignedRoleId, schoolId, tx);
        }
      }

      if (item.assignedClassId && item.assignedClassId !== item.existing.assignedClassId) {
        await staffRepository.updateClassTeacher(schoolId, item.assignedClassId, item.id, tx);
      }

      affectedIds.push(item.id);
      updatedCount++;
    }

    // B. Handle creations
    for (const item of toCreatePayloads) {
      let user = userByEmail.get(item.email);
      if (!user) {
        user = await staffRepository.createUser({
          schoolId,
          email: item.email,
          passwordHash: '!LOCKED_NO_PASSWORD_SET',
          systemRole: item.systemRole,
          tokenVersion: 1,
          isActive: item.isActive
        }, tx);
      }

      const profile = await staffRepository.createStaffProfile({
        schoolId,
        userId: user.id,
        name: item.name,
        email: item.email,
        phone: item.phone,
        employeeId: item.employeeId,
        staffType: item.staffType,
        designation: item.designation,
        assignedClassId: item.assignedClassId,
        baseSalary: item.baseSalary,
        status: item.status,
        customData: item.customData
      }, tx);

      if (item.assignedRoleId) {
        await staffRepository.assignUserRole(user.id, item.assignedRoleId, schoolId, tx);
      }

      if (item.assignedClassId) {
        await staffRepository.updateClassTeacher(schoolId, item.assignedClassId, profile.id, tx);
      }

      affectedIds.push(profile.id);
      createdCount++;
    }
  }, { timeout: 60000, maxWait: 15000 });

  // 4b. Single batch query to re-fetch all created/updated staff with full relations
  if (affectedIds.length > 0) {
    const reloadedStaff = await staffRepository.findStaffByIds(schoolId, affectedIds);
    resultStaff.push(...reloadedStaff);
  }

  // 5. Non-blocking audit log
  createAuditLog({
    schoolId,
    entityType: 'StaffProfile',
    entityId: schoolId,
    actionPerformed: `BULK_IMPORT_STAFF: ${createdCount} created, ${updatedCount} updated`,
    userName: actor?.email || actor?.userId || 'Administrator',
    userRole: actor?.systemRole || null,
    modifiedFields: {
      createdCount,
      updatedCount,
      failedCount: errors.length
    }
  }).catch(() => {});

  const hasHRAccess = hasHRPayrollAccess(actor);
  const serialized = resultStaff.map(s => serializeStaff(s, hasHRAccess));

  return {
    success: true,
    totalProcessed: serialized.length,
    createdCount,
    updatedCount,
    failedCount: errors.length,
    staff: serialized,
    errors
  };
}


