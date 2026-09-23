import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import * as authRepository from '../../src/modules/auth/auth.repository.js';
import * as tokenService from '../../src/modules/auth/token.service.js';
import * as studentHealthRepository from '../../src/modules/student-health/student-health.repository.js';
import * as parentRepository from '../../src/modules/parents/parent.repository.js';
import * as auditRepository from '../../src/modules/audit/audit.repository.js';
import * as rbacService from '../../src/modules/rbac/rbac.service.js';
import { SYSTEM_ROLES } from '../../src/config/constants.js';

describe('Student Health Security, Tenant Isolation & Privacy Test Suite', () => {
  const app = createApp();

  const TENANT_A_ID = '11111111-1111-4111-8111-111111111111';
  const TENANT_B_ID = '22222222-2222-4222-8222-222222222222';
  const STUDENT_A_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const STUDENT_B_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  const mockUsers = {
    superAdmin: {
      id: 'usr-superadmin',
      schoolId: null,
      email: 'superadmin@platform.com',
      systemRole: SYSTEM_ROLES.SUPER_ADMIN,
      tokenVersion: 1,
      isActive: true,
      school: null
    },
    tenantAdminA: {
      id: 'usr-admin-a',
      schoolId: TENANT_A_ID,
      email: 'admin@school-a.edu',
      systemRole: SYSTEM_ROLES.SCHOOL_ADMIN,
      tokenVersion: 1,
      isActive: true,
      school: { id: TENANT_A_ID, name: 'School A', status: 'approved' }
    },
    tenantAdminB: {
      id: 'usr-admin-b',
      schoolId: TENANT_B_ID,
      email: 'admin@school-b.edu',
      systemRole: SYSTEM_ROLES.SCHOOL_ADMIN,
      tokenVersion: 1,
      isActive: true,
      school: { id: TENANT_B_ID, name: 'School B', status: 'approved' }
    },
    teacherWithPerms: {
      id: 'usr-teacher-1',
      schoolId: TENANT_A_ID,
      email: 'teacher@school-a.edu',
      systemRole: SYSTEM_ROLES.TEACHER,
      tokenVersion: 1,
      isActive: true,
      school: { id: TENANT_A_ID, name: 'School A', status: 'approved' }
    },
    parentA: {
      id: 'usr-parent-a',
      schoolId: TENANT_A_ID,
      email: 'parent-a@family.com',
      systemRole: SYSTEM_ROLES.PARENT,
      tokenVersion: 1,
      isActive: true,
      school: { id: TENANT_A_ID, name: 'School A', status: 'approved' }
    },
    studentA: {
      id: 'usr-student-a',
      schoolId: TENANT_A_ID,
      email: 'student-a@school-a.edu',
      studentId: STUDENT_A_ID,
      systemRole: SYSTEM_ROLES.STUDENT,
      tokenVersion: 1,
      isActive: true,
      school: { id: TENANT_A_ID, name: 'School A', status: 'approved' }
    }
  };

  const mockStudentA = {
    id: STUDENT_A_ID,
    schoolId: TENANT_A_ID,
    bloodGroup: 'O+',
    customData: {
      secretNotes: 'Confidential administrative note',
      health: {
        allergies: ['Peanuts'],
        medicalConditions: ['Asthma'],
        medications: ['Albuterol'],
        emergencyContactName: 'John Doe',
        emergencyContactPhone: '555-0101',
        doctorName: 'Dr. Gregory',
        doctorPhone: '555-0102',
        notes: 'Keep inhaler accessible'
      }
    },
    updatedAt: new Date('2026-09-18T10:00:00.000Z')
  };

  const getToken = (user) => {
    return tokenService.issueAccessToken({
      sub: user.id,
      schoolId: user.schoolId,
      systemRole: user.systemRole,
      tokenVersion: user.tokenVersion
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(authRepository, 'findUserById').mockImplementation(async (id) => {
      return Object.values(mockUsers).find((u) => u.id === id) || null;
    });

    vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
      students: { canRead: true, canEdit: true }
    });
  });

  describe('1. Authentication Verification', () => {
    it('returns 401 Unauthorized when token is missing', async () => {
      const res = await request(app).get(`/api/v1/students/${STUDENT_A_ID}/health`);
      expect(res.status).toBe(401);
    });

    it('returns 401 Unauthorized when token is invalid or malformed', async () => {
      const res = await request(app)
        .get(`/api/v1/students/${STUDENT_A_ID}/health`)
        .set('Authorization', 'Bearer invalid-token');
      expect(res.status).toBe(401);
    });
  });

  describe('2. Multi-Tenant Isolation & Anti-Spoofing', () => {
    it('denies Tenant B admin from accessing Tenant A student health record', async () => {
      const tokenB = getToken(mockUsers.tenantAdminB);

      // Student A belongs to Tenant A; when queried by Tenant B repository finds nothing
      vi.spyOn(studentHealthRepository, 'findStudentHealth').mockImplementation(async (sId, stId) => {
        if (sId === TENANT_A_ID && stId === STUDENT_A_ID) return mockStudentA;
        return null;
      });

      const res = await request(app)
        .get(`/api/v1/students/${STUDENT_A_ID}/health`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(res.status).toBe(404);
    });

    it('denies Tenant B admin from updating Tenant A student health record', async () => {
      const tokenB = getToken(mockUsers.tenantAdminB);

      vi.spyOn(studentHealthRepository, 'findStudentHealth').mockResolvedValue(null);

      const res = await request(app)
        .patch(`/api/v1/students/${STUDENT_A_ID}/health`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ bloodGroup: 'B+' });

      expect(res.status).toBe(404);
    });

    it('strictly rejects non-SuperAdmin attempting to pass conflicting X-School-Id or query schoolId with 403', async () => {
      const tokenA = getToken(mockUsers.tenantAdminA);

      const res = await request(app)
        .get(`/api/v1/students/${STUDENT_A_ID}/health?schoolId=${TENANT_B_ID}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-School-Id', TENANT_B_ID);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('TENANT_ACCESS_ERROR');
    });
  });

  describe('3. Role Authorization Matrix', () => {
    it('allows Teacher with students:read permission to read student health', async () => {
      const token = getToken(mockUsers.teacherWithPerms);
      vi.spyOn(studentHealthRepository, 'findStudentHealth').mockResolvedValue(mockStudentA);

      const res = await request(app)
        .get(`/api/v1/students/${STUDENT_A_ID}/health`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('denies Teacher without students:read permission with 403 Forbidden', async () => {
      const token = getToken(mockUsers.teacherWithPerms);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        students: { canRead: false, canEdit: false }
      });

      const res = await request(app)
        .get(`/api/v1/students/${STUDENT_A_ID}/health`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });

    it('allows linked Parent to read child health', async () => {
      const token = getToken(mockUsers.parentA);
      vi.spyOn(studentHealthRepository, 'findStudentHealth').mockResolvedValue(mockStudentA);
      vi.spyOn(parentRepository, 'findParentByUserId').mockResolvedValue({ id: 'parent-prof-1' });
      vi.spyOn(parentRepository, 'findParentStudentLink').mockResolvedValue({ id: 'link-1' });

      const res = await request(app)
        .get(`/api/v1/students/${STUDENT_A_ID}/health`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
    });

    it('denies unlinked Parent with 403 Forbidden', async () => {
      const token = getToken(mockUsers.parentA);
      vi.spyOn(studentHealthRepository, 'findStudentHealth').mockResolvedValue(mockStudentA);
      vi.spyOn(parentRepository, 'findParentByUserId').mockResolvedValue({ id: 'parent-prof-1' });
      vi.spyOn(parentRepository, 'findParentStudentLink').mockResolvedValue(null);

      const res = await request(app)
        .get(`/api/v1/students/${STUDENT_A_ID}/health`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });

    it('blocks Parent from updating health record with 403 Forbidden', async () => {
      const token = getToken(mockUsers.parentA);

      const res = await request(app)
        .patch(`/api/v1/students/${STUDENT_A_ID}/health`)
        .set('Authorization', `Bearer ${token}`)
        .send({ bloodGroup: 'AB+' });

      expect(res.status).toBe(403);
    });
  });

  describe('4. Input Validation & Mass Assignment Defense', () => {
    it('rejects unknown fields in PATCH payload (e.g. role, maliciousField, customData)', async () => {
      const token = getToken(mockUsers.tenantAdminA);

      const res = await request(app)
        .patch(`/api/v1/students/${STUDENT_A_ID}/health`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          bloodGroup: 'A+',
          systemRole: 'SUPER_ADMIN',
          maliciousField: 'exploit',
          customData: { malicious: true }
        });

      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body.error)).toContain('Unknown fields are not allowed');
    });

    it('rejects SQL injection in student ID parameter', async () => {
      const token = getToken(mockUsers.tenantAdminA);

      const res = await request(app)
        .get("/api/v1/students/' OR '1'='1/health")
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body.error)).toContain('Invalid student ID format');
    });
  });

  describe('5. Data Minimization & Audit Privacy', () => {
    it('does not expose unrelated customData fields or sensitive internal records', async () => {
      const token = getToken(mockUsers.tenantAdminA);
      vi.spyOn(studentHealthRepository, 'findStudentHealth').mockResolvedValue(mockStudentA);

      const res = await request(app)
        .get(`/api/v1/students/${STUDENT_A_ID}/health`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.studentId).toBe(STUDENT_A_ID);
      expect(res.body.data.secretNotes).toBeUndefined();
      expect(res.body.data.passwordHash).toBeUndefined();
      expect(res.body.data.customData).toBeUndefined();
    });

    it('does not record sensitive health details in audit log modifiedFields', async () => {
      const token = getToken(mockUsers.tenantAdminA);
      vi.spyOn(studentHealthRepository, 'findStudentHealth').mockResolvedValue(mockStudentA);
      vi.spyOn(studentHealthRepository, 'updateStudentHealth').mockResolvedValue(mockStudentA);
      vi.spyOn(auditRepository, 'createAuditLog').mockResolvedValue({});

      await request(app)
        .patch(`/api/v1/students/${STUDENT_A_ID}/health`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          allergies: ['Peanuts'],
          medications: ['Steroids'],
          notes: 'Sensitive diagnosis notes'
        });

      expect(auditRepository.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actionPerformed: 'UPDATE_STUDENT_HEALTH',
          entityType: 'StudentHealth',
          entityId: STUDENT_A_ID,
          modifiedFields: {
            hasBloodGroup: false,
            updatedFields: ['allergies', 'medications', 'notes']
          }
        })
      );
    });
  });
});
