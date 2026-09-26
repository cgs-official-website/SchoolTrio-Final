import { prisma } from '../../database/prisma.client.js';

/**
 * Registration Repository
 * Handles all database operations for public registration flows.
 */

/**
 * Finds a school by uppercase code.
 */
export async function findSchoolByCode(code, tx = prisma) {
  return tx.school.findUnique({
    where: { code: code.toUpperCase() }
  });
}

/**
 * Finds a school by lowercase email.
 */
export async function findSchoolByEmail(email, tx = prisma) {
  return tx.school.findFirst({
    where: { email: email.toLowerCase() }
  });
}

/**
 * Finds a school by UUID.
 */
export async function findSchoolById(id, tx = prisma) {
  return tx.school.findUnique({
    where: { id },
    include: { plan: true }
  });
}

/**
 * Finds a user by unique lowercase email.
 */
export async function findUserByEmail(email, tx = prisma) {
  return tx.user.findFirst({
    where: { email: email.toLowerCase() }
  });
}


/**
 * Finds an active subscription plan by UUID.
 */
export async function findPlanById(id, tx = prisma) {
  return tx.subscriptionPlan.findFirst({
    where: { id, isActive: true }
  });
}

/**
 * Finds a StaffProfile and its linked User within a school by email.
 */
export async function findStaffByEmailAndSchool(schoolId, email, tx = prisma) {
  return tx.staffProfile.findFirst({
    where: {
      schoolId,
      email: { equals: email.toLowerCase(), mode: 'insensitive' }
    },
    include: {
      user: true
    }
  });
}

/**
 * Finds an enrolled student within a school by admission number and date of birth.
 */
export async function findStudentByAdmissionAndDob(schoolId, admissionNumber, dob, tx = prisma) {
  return tx.student.findFirst({
    where: {
      schoolId,
      admissionNumber: { equals: admissionNumber, mode: 'insensitive' },
      dob
    }
  });
}

/**
 * Finds an existing ParentStudentLink.
 */
export async function findParentStudentLink(schoolId, studentId, parentProfileId, tx = prisma) {
  return tx.parentStudentLink.findFirst({
    where: {
      schoolId,
      studentId,
      parentProfileId
    }
  });
}

/**
 * Atomically creates a School, initial Admin User, modulesConfig, and admin SchoolRole.
 */
export async function createSchoolWithAdmin({ school, admin }, tx = prisma) {
  // 1. Create School record with status: "pending"
  const createdSchool = await tx.school.create({
    data: {
      name: school.name,
      code: school.code.toUpperCase(),
      type: school.type || 'School',
      status: 'pending',
      email: school.email ? school.email.toLowerCase() : null,
      phone: school.phone || null,
      address: school.address || null,
      planId: school.planId || null,
      seatLimit: school.seatLimit || 500,
      teacherLimit: school.teacherLimit || 50
    }
  });

  // 2. Create Initial Administrator User record
  const createdAdminUser = await tx.user.create({
    data: {
      schoolId: createdSchool.id,
      email: admin.email.toLowerCase(),
      passwordHash: admin.passwordHash,
      passwordAlgorithm: 'argon2id',
      systemRole: 'SCHOOL_ADMIN',
      isActive: true,
      tokenVersion: 1
    }
  });

  // 3. Create Default SchoolSetting for module configuration
  await tx.schoolSetting.create({
    data: {
      schoolId: createdSchool.id,
      category: 'modulesConfig',
      data: {
        timetables: true,
        transport: true,
        library: true,
        exams: true,
        noticeboard: true,
        classes: true,
        'hr-payroll': true,
        attendance: true,
        calendar: true,
        fees: true,
        inventory: true
      }
    }
  });

  // 4. Create default SchoolRole for Administrator
  const adminRole = await tx.schoolRole.create({
    data: {
      schoolId: createdSchool.id,
      name: 'School Administrator',
      slug: 'admin',
      loginPanel: 'admin',
      isSystemDefault: true
    }
  });

  // 5. Assign Administrator Role to the Admin User
  await tx.userRoleAssignment.create({
    data: {
      schoolId: createdSchool.id,
      userId: createdAdminUser.id,
      schoolRoleId: adminRole.id
    }
  });

  return {
    school: createdSchool,
    admin: createdAdminUser
  };
}

/**
 * Activates a pre-created staff account with a new password and marks staff profile Active.
 */
export async function activateTeacherAccount({ schoolId, staffId, userId, passwordHash, name, phone, customData }, tx = prisma) {
  // 1. Update User password and active status
  const updatedUser = await tx.user.update({
    where: { id: userId },
    data: {
      passwordHash,
      passwordAlgorithm: 'argon2id',
      isActive: true,
      tokenVersion: { increment: 1 }
    }
  });

  // 2. Update StaffProfile
  const staffUpdateData = {
    status: 'Active'
  };
  if (name) staffUpdateData.name = name;
  if (phone) staffUpdateData.phone = phone;
  if (customData) staffUpdateData.customData = customData;

  const updatedStaff = await tx.staffProfile.update({
    where: {
      schoolId_id: {
        schoolId,
        id: staffId
      }
    },
    data: staffUpdateData
  });

  return {
    staff: updatedStaff,
    user: updatedUser
  };
}

/**
 * Atomically creates Parent User, ParentProfile, default parent role, and links student.
 */
export async function createParentWithStudentLink({ schoolId, parentUser, parentProfile, studentId, relationship }, tx = prisma) {
  // 1. Create User
  const createdUser = await tx.user.create({
    data: {
      schoolId,
      email: parentUser.email.toLowerCase(),
      passwordHash: parentUser.passwordHash,
      passwordAlgorithm: 'argon2id',
      systemRole: 'PARENT',
      isActive: true,
      tokenVersion: 1
    }
  });

  // 2. Create ParentProfile
  const createdProfile = await tx.parentProfile.create({
    data: {
      schoolId,
      userId: createdUser.id,
      name: parentProfile.name,
      email: parentProfile.email ? parentProfile.email.toLowerCase() : null,
      phone: parentProfile.phone || null
    }
  });

  // 3. Find or create default Parent SchoolRole
  let parentRole = await tx.schoolRole.findFirst({
    where: { schoolId, slug: 'parent' }
  });
  if (!parentRole) {
    parentRole = await tx.schoolRole.create({
      data: {
        schoolId,
        name: 'Parent',
        slug: 'parent',
        loginPanel: 'parent',
        isSystemDefault: true
      }
    });
  }

  // 4. Assign role
  await tx.userRoleAssignment.create({
    data: {
      schoolId,
      userId: createdUser.id,
      schoolRoleId: parentRole.id
    }
  });

  // 5. Create ParentStudentLink
  const link = await tx.parentStudentLink.create({
    data: {
      schoolId,
      parentProfileId: createdProfile.id,
      studentId,
      relationship
    }
  });

  return {
    user: createdUser,
    parent: createdProfile,
    link
  };
}
