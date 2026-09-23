import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as registrationService from '../../src/modules/registration/registration.service.js';
import * as registrationRepo from '../../src/modules/registration/registration.repository.js';
import * as auditRepository from '../../src/modules/audit/audit.repository.js';
import { prisma } from '../../src/database/prisma.client.js';
import { ForbiddenError, NotFoundError, ConflictError } from '../../src/utils/app-error.js';

describe('Registration Security & Boundary Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================
  // 1. Sensitive Credential Non-Disclosure
  // ==========================================
  describe('Credential Non-Disclosure', () => {
    it('school registration returns zero password, passwordHash, or token fields', async () => {
      vi.spyOn(registrationRepo, 'findSchoolByCode').mockResolvedValue(null);
      vi.spyOn(registrationRepo, 'findSchoolByEmail').mockResolvedValue(null);
      vi.spyOn(registrationRepo, 'findUserByEmail').mockResolvedValue(null);

      const auditSpy = vi.spyOn(auditRepository, 'createAuditLog').mockResolvedValue({});

      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback) => {
        return callback({});
      });

      vi.spyOn(registrationRepo, 'createSchoolWithAdmin').mockResolvedValue({
        school: {
          id: 'school-1',
          name: 'Secure Academy',
          code: 'SEC-01',
          status: 'pending',
          createdAt: new Date()
        },
        admin: {
          id: 'admin-1',
          email: 'admin@secure.edu',
          passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$somehash'
        }
      });

      const res = await registrationService.registerSchool({
        name: 'Secure Academy',
        code: 'sec-01',
        admin: {
          name: 'Secure Admin',
          email: 'admin@secure.edu',
          password: 'ComplexPassword123'
        }
      });

      // Response assertions
      expect(res.admin).not.toHaveProperty('password');
      expect(res.admin).not.toHaveProperty('passwordHash');
      expect(res.school).not.toHaveProperty('password');
      expect(res.school).not.toHaveProperty('passwordHash');

      // Audit assertions
      expect(auditSpy).toHaveBeenCalled();
      const auditPayload = auditSpy.mock.calls[0][0];
      expect(JSON.stringify(auditPayload)).not.toContain('ComplexPassword123');
      expect(JSON.stringify(auditPayload)).not.toContain('$argon2id$');
    });

    it('teacher registration response excludes password and password hash', async () => {
      vi.spyOn(registrationRepo, 'findSchoolById').mockResolvedValue({ id: 's-1', status: 'approved' });
      vi.spyOn(registrationRepo, 'findStaffByEmailAndSchool').mockResolvedValue({
        id: 'st-1',
        name: 'Teacher Jane',
        email: 'jane@s.edu',
        user: { id: 'u-1', email: 'jane@s.edu', passwordHash: '!LOCKED_NO_PASSWORD_SET', systemRole: 'TEACHER' }
      });

      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback) => callback({}));
      vi.spyOn(registrationRepo, 'activateTeacherAccount').mockResolvedValue({
        staff: { id: 'st-1', name: 'Teacher Jane', email: 'jane@s.edu', status: 'Active' },
        user: { id: 'u-1', email: 'jane@s.edu', passwordHash: '$argon2id$hash' }
      });
      vi.spyOn(auditRepository, 'createAuditLog').mockResolvedValue({});

      const res = await registrationService.registerTeacher({
        schoolId: 's-1',
        email: 'jane@s.edu',
        password: 'NewPassword123'
      });

      expect(res.user).not.toHaveProperty('password');
      expect(res.user).not.toHaveProperty('passwordHash');
    });
  });

  // ==========================================
  // 2. Tenant Boundary & Cross-Tenant Isolation
  // ==========================================
  describe('Tenant Isolation & IDOR Protection', () => {
    it('prevents parent from linking a student registered in a different school', async () => {
      const attackingSchoolId = '11111111-1111-4111-8111-111111111111';
      const victimSchoolId = '22222222-2222-4222-8222-222222222222';

      vi.spyOn(registrationRepo, 'findSchoolById').mockResolvedValue({
        id: attackingSchoolId,
        status: 'approved'
      });

      // Student only exists in victimSchoolId, NOT in attackingSchoolId
      vi.spyOn(registrationRepo, 'findStudentByAdmissionAndDob').mockImplementation(
        async (schoolId, adm, dob) => {
          if (schoolId === victimSchoolId && adm === 'ADM-VICTIM' && dob === '2016-05-10') {
            return { id: 'victim-student-id', schoolId: victimSchoolId };
          }
          return null;
        }
      );

      await expect(registrationService.registerParent({
        schoolId: attackingSchoolId,
        name: 'Attacker Parent',
        email: 'attacker@evil.com',
        password: 'AttackerPassword123',
        admissionNumber: 'ADM-VICTIM',
        dob: '2016-05-10',
        relationship: 'Father'
      })).rejects.toThrow(NotFoundError);
    });

    it('rejects teacher registration attempt against an unapproved or suspended school', async () => {
      vi.spyOn(registrationRepo, 'findSchoolById').mockResolvedValue({
        id: 'suspended-school-id',
        status: 'suspended'
      });

      await expect(registrationService.registerTeacher({
        schoolId: 'suspended-school-id',
        email: 'teacher@school.edu',
        password: 'TeacherPassword123'
      })).rejects.toThrow(ForbiddenError);
    });
  });

  // ==========================================
  // 3. Privilege Escalation & Mass Assignment Prevention
  // ==========================================
  describe('Privilege Escalation Prevention', () => {
    it('forces initial registered administrator to SCHOOL_ADMIN regardless of client payload', async () => {
      vi.spyOn(registrationRepo, 'findSchoolByCode').mockResolvedValue(null);
      vi.spyOn(registrationRepo, 'findSchoolByEmail').mockResolvedValue(null);
      vi.spyOn(registrationRepo, 'findUserByEmail').mockResolvedValue(null);
      vi.spyOn(auditRepository, 'createAuditLog').mockResolvedValue({});

      let capturedAdminPayload = null;
      vi.spyOn(registrationRepo, 'createSchoolWithAdmin').mockImplementation(async ({ school, admin }) => {
        capturedAdminPayload = admin;
        return {
          school: { id: 's-1', name: school.name, code: school.code, status: 'pending', createdAt: new Date() },
          admin: { id: 'a-1', email: admin.email }
        };
      });

      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback) => callback({}));

      await registrationService.registerSchool({
        name: 'Test Academy',
        code: 'test-01',
        systemRole: 'SUPER_ADMIN', // Attempted escalation
        isSuperAdmin: true,        // Attempted escalation
        admin: {
          name: 'Test Admin',
          email: 'admin@test.edu',
          password: 'ValidPassword123',
          systemRole: 'SUPER_ADMIN' // Attempted escalation
        }
      });

      // The service must not forward untrusted escalation fields
      expect(capturedAdminPayload).not.toHaveProperty('systemRole');
      expect(capturedAdminPayload).not.toHaveProperty('isSuperAdmin');
    });
  });

  // ==========================================
  // 4. Account Takeover Protection
  // ==========================================
  describe('Account Takeover Protection', () => {
    it('prevents re-registration and password override of already activated accounts', async () => {
      vi.spyOn(registrationRepo, 'findSchoolById').mockResolvedValue({ id: 's-1', status: 'approved' });
      vi.spyOn(registrationRepo, 'findStaffByEmailAndSchool').mockResolvedValue({
        id: 'st-1',
        name: 'Already Active Teacher',
        email: 'active@school.edu',
        user: {
          id: 'u-1',
          email: 'active@school.edu',
          passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$existingvalidhash' // Active account
        }
      });

      await expect(registrationService.registerTeacher({
        schoolId: 's-1',
        email: 'active@school.edu',
        password: 'TakeoverPassword123'
      })).rejects.toThrow(ConflictError);
    });
  });
});
