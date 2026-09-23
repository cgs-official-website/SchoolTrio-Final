import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/app.js';
import * as authRepository from '../../../src/modules/auth/auth.repository.js';
import * as tokenService from '../../../src/modules/auth/token.service.js';
import * as studentHealthRepository from '../../../src/modules/student-health/student-health.repository.js';
import * as parentRepository from '../../../src/modules/parents/parent.repository.js';
import * as auditRepository from '../../../src/modules/audit/audit.repository.js';
import { SYSTEM_ROLES } from '../../../src/config/constants.js';

describe('Student Health Integration Tests', () => {
  const app = createApp();

  const TENANT_A_ID = '11111111-1111-4111-8111-111111111111';
  const STUDENT_A_ID = '22222222-2222-4222-8222-222222222222';
  const PARENT_USER_ID = '33333333-3333-4333-8333-333333333333';
  const PARENT_PROFILE_ID = '44444444-4444-4444-8444-444444444444';

  const mockAdminUser = {
    id: 'user-admin-1',
    schoolId: TENANT_A_ID,
    email: 'admin@school.edu',
    systemRole: SYSTEM_ROLES.SCHOOL_ADMIN,
    tokenVersion: 1,
    isActive: true,
    school: { id: TENANT_A_ID, name: 'Greenwood High', code: 'GREENWOOD', status: 'approved' }
  };

  const mockParentUser = {
    id: PARENT_USER_ID,
    schoolId: TENANT_A_ID,
    email: 'parent@greenwood.edu',
    systemRole: SYSTEM_ROLES.PARENT,
    tokenVersion: 1,
    isActive: true,
    school: { id: TENANT_A_ID, name: 'Greenwood High', code: 'GREENWOOD', status: 'approved' }
  };

  const mockStudent = {
    id: STUDENT_A_ID,
    schoolId: TENANT_A_ID,
    bloodGroup: 'O+',
    customData: {
      health: {
        allergies: ['Peanuts'],
        medicalConditions: ['Asthma'],
        medications: ['Inhaler'],
        emergencyContactName: 'Mary Doe',
        emergencyContactPhone: '555-1234',
        doctorName: 'Dr. Evans',
        doctorPhone: '555-5678',
        notes: 'Emergency inhaler in classroom'
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
      if (id === mockAdminUser.id) return mockAdminUser;
      if (id === mockParentUser.id) return mockParentUser;
      return null;
    });
  });

  describe('GET /api/v1/students/:id/health', () => {
    it('returns student health record for school administrator', async () => {
      const token = getToken(mockAdminUser);
      vi.spyOn(studentHealthRepository, 'findStudentHealth').mockResolvedValue(mockStudent);

      const res = await request(app)
        .get(`/api/v1/students/${STUDENT_A_ID}/health`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.studentId).toBe(STUDENT_A_ID);
      expect(res.body.data.bloodGroup).toBe('O+');
      expect(res.body.data.allergies).toEqual(['Peanuts']);
      expect(res.body.data.doctorName).toBe('Dr. Evans');
    });

    it('returns student health record for linked parent', async () => {
      const token = getToken(mockParentUser);
      vi.spyOn(studentHealthRepository, 'findStudentHealth').mockResolvedValue(mockStudent);
      vi.spyOn(parentRepository, 'findParentByUserId').mockResolvedValue({ id: PARENT_PROFILE_ID });
      vi.spyOn(parentRepository, 'findParentStudentLink').mockResolvedValue({ id: 'link-123' });

      const res = await request(app)
        .get(`/api/v1/students/${STUDENT_A_ID}/health`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.studentId).toBe(STUDENT_A_ID);
    });

    it('denies unlinked parent with 403 Forbidden', async () => {
      const token = getToken(mockParentUser);
      vi.spyOn(studentHealthRepository, 'findStudentHealth').mockResolvedValue(mockStudent);
      vi.spyOn(parentRepository, 'findParentByUserId').mockResolvedValue({ id: PARENT_PROFILE_ID });
      vi.spyOn(parentRepository, 'findParentStudentLink').mockResolvedValue(null);

      const res = await request(app)
        .get(`/api/v1/students/${STUDENT_A_ID}/health`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('returns 404 for nonexistent student in tenant', async () => {
      const token = getToken(mockAdminUser);
      vi.spyOn(studentHealthRepository, 'findStudentHealth').mockResolvedValue(null);

      const res = await request(app)
        .get(`/api/v1/students/${STUDENT_A_ID}/health`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });

    it('returns 401 when token is missing', async () => {
      const res = await request(app).get(`/api/v1/students/${STUDENT_A_ID}/health`);
      expect(res.status).toBe(401);
    });
  });

  describe('PATCH /api/v1/students/:id/health', () => {
    it('successfully updates health record and returns updated DTO', async () => {
      const token = getToken(mockAdminUser);
      vi.spyOn(studentHealthRepository, 'findStudentHealth').mockResolvedValue(mockStudent);
      vi.spyOn(studentHealthRepository, 'updateStudentHealth').mockResolvedValue({
        ...mockStudent,
        bloodGroup: 'A+',
        customData: {
          ...mockStudent.customData,
          health: {
            ...mockStudent.customData.health,
            allergies: ['Peanuts', 'Strawberries']
          }
        }
      });
      vi.spyOn(auditRepository, 'createAuditLog').mockResolvedValue({});

      const res = await request(app)
        .patch(`/api/v1/students/${STUDENT_A_ID}/health`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          bloodGroup: 'A+',
          allergies: ['Peanuts', 'Strawberries']
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.bloodGroup).toBe('A+');
      expect(res.body.data.allergies).toEqual(['Peanuts', 'Strawberries']);
    });

    it('blocks parent from editing health record with 403 Forbidden', async () => {
      const token = getToken(mockParentUser);

      const res = await request(app)
        .patch(`/api/v1/students/${STUDENT_A_ID}/health`)
        .set('Authorization', `Bearer ${token}`)
        .send({ bloodGroup: 'A+' });

      expect(res.status).toBe(403);
    });
  });
});
