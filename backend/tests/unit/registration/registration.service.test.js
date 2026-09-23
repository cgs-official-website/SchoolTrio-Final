import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as registrationService from '../../../src/modules/registration/registration.service.js';
import * as registrationRepo from '../../../src/modules/registration/registration.repository.js';
import * as auditRepository from '../../../src/modules/audit/audit.repository.js';
import { prisma } from '../../../src/database/prisma.client.js';
import { ConflictError, NotFoundError, ForbiddenError } from '../../../src/utils/app-error.js';

describe('Registration Service Unit Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================
  // 1. School Registration Service Tests
  // ==========================================
  describe('registerSchool', () => {
    const validSchoolData = {
      name: 'Oakridge International',
      code: 'oakridge-01',
      type: 'School',
      email: 'contact@oakridge.edu',
      phone: '9876543210',
      admin: {
        name: 'Charles Xavier',
        email: 'charles@oakridge.edu',
        password: 'AdminPassword123'
      }
    };

    it('successfully registers a school with pending status and initial administrator', async () => {
      vi.spyOn(registrationRepo, 'findSchoolByCode').mockResolvedValue(null);
      vi.spyOn(registrationRepo, 'findSchoolByEmail').mockResolvedValue(null);
      vi.spyOn(registrationRepo, 'findUserByEmail').mockResolvedValue(null);
      vi.spyOn(auditRepository, 'createAuditLog').mockResolvedValue({});

      const mockSchool = {
        id: 'school-uuid-1',
        name: 'Oakridge International',
        code: 'OAKRIDGE-01',
        status: 'pending',
        createdAt: new Date('2026-09-18T10:00:00.000Z')
      };

      const mockAdmin = {
        id: 'admin-uuid-1',
        email: 'charles@oakridge.edu'
      };

      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback) => {
        return callback({
          school: { create: vi.fn().mockResolvedValue(mockSchool) },
          user: { create: vi.fn().mockResolvedValue(mockAdmin) }
        });
      });

      vi.spyOn(registrationRepo, 'createSchoolWithAdmin').mockResolvedValue({
        school: mockSchool,
        admin: mockAdmin
      });

      const res = await registrationService.registerSchool(validSchoolData);

      expect(res.school.status).toBe('pending');
      expect(res.school.code).toBe('OAKRIDGE-01');
      expect(res.admin.email).toBe('charles@oakridge.edu');
      expect(res.admin.name).toBe('Charles Xavier');
    });

    it('throws ConflictError if school code is already taken', async () => {
      vi.spyOn(registrationRepo, 'findSchoolByCode').mockResolvedValue({
        id: 'existing-school-id',
        code: 'OAKRIDGE-01'
      });

      await expect(registrationService.registerSchool(validSchoolData)).rejects.toThrow(ConflictError);
    });

    it('throws ConflictError if school contact email is already in use', async () => {
      vi.spyOn(registrationRepo, 'findSchoolByCode').mockResolvedValue(null);
      vi.spyOn(registrationRepo, 'findSchoolByEmail').mockResolvedValue({
        id: 'existing-school-id',
        email: 'contact@oakridge.edu'
      });

      await expect(registrationService.registerSchool(validSchoolData)).rejects.toThrow(ConflictError);
    });

    it('throws ConflictError if administrator user email already exists', async () => {
      vi.spyOn(registrationRepo, 'findSchoolByCode').mockResolvedValue(null);
      vi.spyOn(registrationRepo, 'findSchoolByEmail').mockResolvedValue(null);
      vi.spyOn(registrationRepo, 'findUserByEmail').mockResolvedValue({
        id: 'existing-user-id',
        email: 'charles@oakridge.edu'
      });

      await expect(registrationService.registerSchool(validSchoolData)).rejects.toThrow(ConflictError);
    });

    it('throws NotFoundError if specified planId does not exist or is inactive', async () => {
      vi.spyOn(registrationRepo, 'findSchoolByCode').mockResolvedValue(null);
      vi.spyOn(registrationRepo, 'findSchoolByEmail').mockResolvedValue(null);
      vi.spyOn(registrationRepo, 'findUserByEmail').mockResolvedValue(null);
      vi.spyOn(registrationRepo, 'findPlanById').mockResolvedValue(null);

      const dataWithPlan = { ...validSchoolData, planId: '22222222-2222-4222-8222-222222222222' };
      await expect(registrationService.registerSchool(dataWithPlan)).rejects.toThrow(NotFoundError);
    });
  });

  // ==========================================
  // 2. Teacher Registration Service Tests
  // ==========================================
  describe('registerTeacher', () => {
    const validTeacherData = {
      schoolId: 'school-uuid-1',
      email: 'teacher@school.edu',
      password: 'TeacherPassword123',
      employeeId: 'EMP-101',
      name: 'John Keating'
    };

    it('successfully activates a pre-invited teacher account', async () => {
      vi.spyOn(registrationRepo, 'findSchoolById').mockResolvedValue({
        id: 'school-uuid-1',
        status: 'approved'
      });

      vi.spyOn(registrationRepo, 'findStaffByEmailAndSchool').mockResolvedValue({
        id: 'staff-uuid-1',
        name: 'John Keating',
        email: 'teacher@school.edu',
        employeeId: 'EMP-101',
        user: {
          id: 'user-uuid-1',
          email: 'teacher@school.edu',
          passwordHash: '!LOCKED_NO_PASSWORD_SET',
          systemRole: 'TEACHER'
        }
      });

      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback) => {
        return callback({});
      });

      vi.spyOn(registrationRepo, 'activateTeacherAccount').mockResolvedValue({
        staff: {
          id: 'staff-uuid-1',
          name: 'John Keating',
          email: 'teacher@school.edu',
          employeeId: 'EMP-101',
          status: 'Active'
        },
        user: {
          id: 'user-uuid-1',
          email: 'teacher@school.edu'
        }
      });
      vi.spyOn(auditRepository, 'createAuditLog').mockResolvedValue({});

      const res = await registrationService.registerTeacher(validTeacherData);

      expect(res.staff.status).toBe('Active');
      expect(res.staff.id).toBe('staff-uuid-1');
      expect(res.user.email).toBe('teacher@school.edu');
    });

    it('throws NotFoundError if school does not exist', async () => {
      vi.spyOn(registrationRepo, 'findSchoolById').mockResolvedValue(null);

      await expect(registrationService.registerTeacher(validTeacherData)).rejects.toThrow(NotFoundError);
    });

    it('throws ForbiddenError if school is pending approval', async () => {
      vi.spyOn(registrationRepo, 'findSchoolById').mockResolvedValue({
        id: 'school-uuid-1',
        status: 'pending'
      });

      await expect(registrationService.registerTeacher(validTeacherData)).rejects.toThrow(ForbiddenError);
    });

    it('throws NotFoundError if no matching staff invitation exists', async () => {
      vi.spyOn(registrationRepo, 'findSchoolById').mockResolvedValue({
        id: 'school-uuid-1',
        status: 'approved'
      });
      vi.spyOn(registrationRepo, 'findStaffByEmailAndSchool').mockResolvedValue(null);

      await expect(registrationService.registerTeacher(validTeacherData)).rejects.toThrow(NotFoundError);
    });

    it('throws ConflictError if teacher account is already registered (activated)', async () => {
      vi.spyOn(registrationRepo, 'findSchoolById').mockResolvedValue({
        id: 'school-uuid-1',
        status: 'approved'
      });

      vi.spyOn(registrationRepo, 'findStaffByEmailAndSchool').mockResolvedValue({
        id: 'staff-uuid-1',
        name: 'John Keating',
        email: 'teacher@school.edu',
        employeeId: 'EMP-101',
        user: {
          id: 'user-uuid-1',
          email: 'teacher@school.edu',
          passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$already-active-hash',
          systemRole: 'TEACHER'
        }
      });

      await expect(registrationService.registerTeacher(validTeacherData)).rejects.toThrow(ConflictError);
    });
  });

  // ==========================================
  // 3. Parent Registration Service Tests
  // ==========================================
  describe('registerParent', () => {
    const validParentData = {
      schoolId: 'school-uuid-1',
      name: 'Sarah Connor',
      email: 'sarah.connor@cyberdyne.edu',
      password: 'ParentPassword123',
      admissionNumber: 'ADM-900',
      dob: '2016-02-28',
      relationship: 'Mother'
    };

    it('successfully registers parent and links enrolled student upon verified credentials', async () => {
      vi.spyOn(registrationRepo, 'findSchoolById').mockResolvedValue({
        id: 'school-uuid-1',
        status: 'approved'
      });

      vi.spyOn(registrationRepo, 'findStudentByAdmissionAndDob').mockResolvedValue({
        id: 'student-uuid-1',
        admissionNumber: 'ADM-900',
        firstName: 'John',
        lastName: 'Connor',
        dob: '2016-02-28'
      });

      vi.spyOn(registrationRepo, 'findUserByEmail').mockResolvedValue(null);
      vi.spyOn(auditRepository, 'createAuditLog').mockResolvedValue({});

      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback) => {
        return callback({});
      });

      vi.spyOn(registrationRepo, 'createParentWithStudentLink').mockResolvedValue({
        user: { id: 'parent-user-1', email: 'sarah.connor@cyberdyne.edu' },
        parent: { id: 'parent-profile-1', name: 'Sarah Connor', email: 'sarah.connor@cyberdyne.edu' },
        link: { id: 'link-1', relationship: 'Mother' }
      });

      const res = await registrationService.registerParent(validParentData);

      expect(res.parent.name).toBe('Sarah Connor');
      expect(res.parent.email).toBe('sarah.connor@cyberdyne.edu');
      expect(res.student.admissionNumber).toBe('ADM-900');
      expect(res.student.firstName).toBe('John');
    });

    it('throws NotFoundError if student admission number and date of birth do not match', async () => {
      vi.spyOn(registrationRepo, 'findSchoolById').mockResolvedValue({
        id: 'school-uuid-1',
        status: 'approved'
      });
      vi.spyOn(registrationRepo, 'findStudentByAdmissionAndDob').mockResolvedValue(null);

      await expect(registrationService.registerParent(validParentData)).rejects.toThrow(NotFoundError);
    });

    it('throws ConflictError if parent email is already registered in User table', async () => {
      vi.spyOn(registrationRepo, 'findSchoolById').mockResolvedValue({
        id: 'school-uuid-1',
        status: 'approved'
      });

      vi.spyOn(registrationRepo, 'findStudentByAdmissionAndDob').mockResolvedValue({
        id: 'student-uuid-1',
        admissionNumber: 'ADM-900',
        dob: '2016-02-28'
      });

      vi.spyOn(registrationRepo, 'findUserByEmail').mockResolvedValue({
        id: 'existing-parent-user-id',
        email: 'sarah.connor@cyberdyne.edu'
      });

      await expect(registrationService.registerParent(validParentData)).rejects.toThrow(ConflictError);
    });

    it('throws ForbiddenError if school is inactive or pending', async () => {
      vi.spyOn(registrationRepo, 'findSchoolById').mockResolvedValue({
        id: 'school-uuid-1',
        status: 'suspended'
      });

      await expect(registrationService.registerParent(validParentData)).rejects.toThrow(ForbiddenError);
    });
  });
});
