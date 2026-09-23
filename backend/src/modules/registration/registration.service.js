import { prisma, runWithTenantContext } from '../../database/prisma.client.js';
import * as registrationRepo from './registration.repository.js';
import { hashPassword } from '../auth/password.service.js';
import { createAuditLog } from '../audit/audit.repository.js';
import { ConflictError, NotFoundError, ForbiddenError, ValidationError } from '../../utils/app-error.js';
import { SYSTEM_ROLES } from '../../config/constants.js';

/**
 * Registration Service
 * Orchestrates business logic, invariants, security checks, and transactional mutations for public registrations.
 */

/**
 * 1. Public School Self-Registration
 * Creates a pending tenant, administrative credentials, initial configuration, and audit event atomically.
 */
export async function registerSchool(data) {
  return runWithTenantContext({ schoolId: null, bypassTenant: true }, async () => {
    const normalizedCode = data.code.trim().toUpperCase();
    const normalizedSchoolEmail = data.email ? data.email.trim().toLowerCase() : null;
    const normalizedAdminEmail = data.admin.email.trim().toLowerCase();

    // 1. Verify School Code Uniqueness
    const existingSchoolCode = await registrationRepo.findSchoolByCode(normalizedCode);
    if (existingSchoolCode) {
      throw new ConflictError(`School code '${normalizedCode}' is already registered`);
    }

    // 2. Verify School Email Uniqueness (if provided)
    if (normalizedSchoolEmail) {
      const existingSchoolEmail = await registrationRepo.findSchoolByEmail(normalizedSchoolEmail);
      if (existingSchoolEmail) {
        throw new ConflictError(`School email '${normalizedSchoolEmail}' is already in use`);
      }
    }

    // 3. Verify Administrator Email Uniqueness in User table
    const existingAdminUser = await registrationRepo.findUserByEmail(normalizedAdminEmail);
    if (existingAdminUser) {
      throw new ConflictError(`Administrator email '${normalizedAdminEmail}' is already registered`);
    }

    // 4. Validate Subscription Plan if provided
    let validatedPlanId = null;
    if (data.planId) {
      const plan = await registrationRepo.findPlanById(data.planId);
      if (!plan) {
        throw new NotFoundError('Active subscription plan');
      }
      validatedPlanId = plan.id;
    }

    // 5. Hash Administrator Password with Argon2id
    const adminPasswordHash = await hashPassword(data.admin.password);

    // 6. Execute Atomic Multi-Table Transaction
    const result = await prisma.$transaction(async (tx) => {
      const { school, admin } = await registrationRepo.createSchoolWithAdmin(
        {
          school: {
            name: data.name.trim(),
            code: normalizedCode,
            type: data.type ? data.type.trim() : 'School',
            email: normalizedSchoolEmail,
            phone: data.phone ? data.phone.trim() : null,
            address: data.address ? data.address.trim() : null,
            planId: validatedPlanId,
            seatLimit: data.seatLimit,
            teacherLimit: data.teacherLimit
          },
          admin: {
            name: data.admin.name.trim(),
            email: normalizedAdminEmail,
            passwordHash: adminPasswordHash
          }
        },
        tx
      );

      // Record Audit Event
      await createAuditLog(
        {
          schoolId: school.id,
          entityType: 'School',
          entityId: school.id,
          actionPerformed: 'REGISTER_SCHOOL',
          userName: admin.email,
          userRole: SYSTEM_ROLES.SCHOOL_ADMIN,
          modifiedFields: {
            name: school.name,
            code: school.code,
            adminEmail: admin.email,
            status: school.status
          }
        },
        tx
      );

      return { school, admin };
    });

    return {
      school: {
        id: result.school.id,
        name: result.school.name,
        code: result.school.code,
        status: result.school.status,
        createdAt: result.school.createdAt
      },
      admin: {
        id: result.admin.id,
        email: result.admin.email,
        name: data.admin.name.trim()
      }
    };
  });
}

/**
 * 2. Public Teacher / Staff Registration
 * Activates an invited staff account with user-chosen credentials.
 */
export async function registerTeacher(data) {
  return runWithTenantContext({ schoolId: data.schoolId, bypassTenant: true }, async () => {
    const normalizedEmail = data.email.trim().toLowerCase();

    // 1. Verify School exists and is active/approved
    const school = await registrationRepo.findSchoolById(data.schoolId);
    if (!school) {
      throw new NotFoundError('School');
    }

    const schoolStatus = school.status.toLowerCase();
    if (schoolStatus !== 'approved' && schoolStatus !== 'active') {
      throw new ForbiddenError('Staff registration is only permitted for active and approved schools');
    }

    // 2. Find pre-created StaffProfile and linked User
    const staffProfile = await registrationRepo.findStaffByEmailAndSchool(data.schoolId, normalizedEmail);
    if (!staffProfile) {
      throw new NotFoundError('Matching staff invitation');
    }

    // 3. Verify Employee ID matching if record has one configured
    if (data.employeeId && staffProfile.employeeId) {
      const inputEmpId = data.employeeId.trim().toLowerCase();
      const docEmpId = staffProfile.employeeId.trim().toLowerCase();
      if (inputEmpId !== docEmpId) {
        throw new NotFoundError('Matching staff invitation');
      }
    }

    // 4. Check whether account is already activated
    const linkedUser = staffProfile.user;
    if (!linkedUser) {
      throw new NotFoundError('Linked staff user account');
    }

    if (typeof linkedUser.passwordHash === 'string' && !linkedUser.passwordHash.startsWith('!')) {
      throw new ConflictError('This account has already been registered. Please login instead.');
    }

    // 5. Hash new password
    const passwordHash = await hashPassword(data.password);

    // 6. Execute Atomic Activation Transaction
    const result = await prisma.$transaction(async (tx) => {
      const { staff, user } = await registrationRepo.activateTeacherAccount(
        {
          schoolId: data.schoolId,
          staffId: staffProfile.id,
          userId: linkedUser.id,
          passwordHash,
          name: data.name ? data.name.trim() : undefined,
          phone: data.phone ? data.phone.trim() : undefined,
          customData: data.customData ? data.customData : undefined
        },
        tx
      );

      // Record Audit Event
      await createAuditLog(
        {
          schoolId: data.schoolId,
          entityType: 'StaffProfile',
          entityId: staff.id,
          actionPerformed: 'REGISTER_TEACHER',
          userName: user.email,
          userRole: user.systemRole,
          modifiedFields: {
            staffId: staff.id,
            email: user.email,
            status: staff.status
          }
        },
        tx
      );

      return { staff, user };
    });

    return {
      staff: {
        id: result.staff.id,
        name: result.staff.name,
        email: result.staff.email,
        employeeId: result.staff.employeeId,
        status: result.staff.status
      },
      user: {
        id: result.user.id,
        email: result.user.email
      }
    };
  });
}

/**
 * 3. Public Parent Registration
 * Registers a parent account and securely links the enrolled student after two-factor verification.
 */
export async function registerParent(data) {
  return runWithTenantContext({ schoolId: data.schoolId, bypassTenant: true }, async () => {
    const normalizedEmail = data.email.trim().toLowerCase();
    const normalizedAdmission = data.admissionNumber.trim();
    const normalizedDob = data.dob.trim();
    const relationship = data.relationship.trim();

    // 1. Verify School exists and is active/approved
    const school = await registrationRepo.findSchoolById(data.schoolId);
    if (!school) {
      throw new NotFoundError('School');
    }

    const schoolStatus = school.status.toLowerCase();
    if (schoolStatus !== 'approved' && schoolStatus !== 'active') {
      throw new ForbiddenError('Parent registration is only permitted for active and approved schools');
    }

    // 2. Two-Factor Relationship Verification: Verify Student by admissionNumber AND dob
    const student = await registrationRepo.findStudentByAdmissionAndDob(data.schoolId, normalizedAdmission, normalizedDob);
    if (!student) {
      throw new NotFoundError('Student verification details');
    }

    // 3. Verify Email uniqueness in User table
    const existingUser = await registrationRepo.findUserByEmail(normalizedEmail);
    if (existingUser) {
      throw new ConflictError('An account is already registered for this email address. Please login instead.');
    }

    // 4. Hash Parent Password
    const passwordHash = await hashPassword(data.password);

    // 5. Execute Atomic Creation and Student Linking Transaction
    const result = await prisma.$transaction(async (tx) => {
      const { user, parent, link } = await registrationRepo.createParentWithStudentLink(
        {
          schoolId: data.schoolId,
          parentUser: {
            email: normalizedEmail,
            passwordHash
          },
          parentProfile: {
            name: data.name.trim(),
            email: normalizedEmail,
            phone: data.phone ? data.phone.trim() : null
          },
          studentId: student.id,
          relationship
        },
        tx
      );

      // Record Audit Event
      await createAuditLog(
        {
          schoolId: data.schoolId,
          entityType: 'ParentProfile',
          entityId: parent.id,
          actionPerformed: 'REGISTER_PARENT',
          userName: user.email,
          userRole: SYSTEM_ROLES.PARENT,
          modifiedFields: {
            parentId: parent.id,
            studentId: student.id,
            relationship: link.relationship
          }
        },
        tx
      );

      return { user, parent, link };
    });

    return {
      parent: {
        id: result.parent.id,
        name: result.parent.name,
        email: result.parent.email
      },
      student: {
        id: student.id,
        admissionNumber: student.admissionNumber,
        firstName: student.firstName,
        lastName: student.lastName
      }
    };
  });
}
