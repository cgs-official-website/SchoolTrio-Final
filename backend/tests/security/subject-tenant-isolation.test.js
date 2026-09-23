import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import * as subjectRepository from '../../src/modules/subjects/subject.repository.js';
import * as rbacService from '../../src/modules/rbac/rbac.service.js';
import * as authRepository from '../../src/modules/auth/auth.repository.js';
import * as auditRepository from '../../src/modules/audit/audit.repository.js';
import * as tokenService from '../../src/modules/auth/token.service.js';
import { SYSTEM_ROLES } from '../../src/config/constants.js';

describe('Security: Subjects Multi-Tenant Isolation & RBAC Access Control Tests', () => {
  const app = createApp();
  const SCHOOL_A = '11111111-1111-4111-8111-111111111111';
  const SCHOOL_B = '22222222-2222-4222-8222-222222222222';
  const SUBJECT_B_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  const schoolAAdmin = {
    id: 'admin-a-id',
    schoolId: SCHOOL_A,
    email: 'admina@schoola.com',
    systemRole: SYSTEM_ROLES.SCHOOL_ADMIN,
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_A, name: 'School A', code: 'SchoolA', status: 'active' }
  };

  const restrictedStaff = {
    id: 'staff-a-id',
    schoolId: SCHOOL_A,
    email: 'staffa@schoola.com',
    systemRole: SYSTEM_ROLES.STAFF,
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_A, name: 'School A', code: 'SchoolA', status: 'active' }
  };

  const superAdmin = {
    id: 'super-admin-id',
    schoolId: null,
    email: 'superadmin@platform.com',
    systemRole: SYSTEM_ROLES.SUPER_ADMIN,
    tokenVersion: 1,
    isActive: true
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(auditRepository, 'createAuditLog').mockResolvedValue({ id: 'mock-audit-id' });
  });

  const getAuthToken = (user) => {
    return tokenService.issueAccessToken({
      sub: user.id,
      schoolId: user.schoolId,
      systemRole: user.systemRole,
      tokenVersion: user.tokenVersion
    });
  };

  describe('1. Authentication Checks', () => {
    it('unauthenticated GET /api/v1/subjects returns 401 Unauthorized', async () => {
      const res = await request(app).get('/api/v1/subjects');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('unauthenticated POST /api/v1/subjects returns 401 Unauthorized', async () => {
      const res = await request(app)
        .post('/api/v1/subjects')
        .send({ name: 'Mathematics' });
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('2. Cross-Tenant Subject Isolation', () => {
    it('School A cannot read School B subjects (returns 404)', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(schoolAAdmin);
      vi.spyOn(subjectRepository, 'findSubjectById').mockImplementation(async (schoolId, subjectId) => {
        if (schoolId === SCHOOL_A && subjectId === SUBJECT_B_ID) return null;
        if (schoolId === SCHOOL_B && subjectId === SUBJECT_B_ID) {
          return { id: SUBJECT_B_ID, schoolId: SCHOOL_B, name: 'Subject in School B' };
        }
        return null;
      });

      const token = getAuthToken(schoolAAdmin);
      const res = await request(app)
        .get(`/api/v1/subjects/${SUBJECT_B_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(subjectRepository.findSubjectById).toHaveBeenCalledWith(SCHOOL_A, SUBJECT_B_ID);
    });

    it('School A cannot update School B subject (returns 404)', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(schoolAAdmin);
      vi.spyOn(subjectRepository, 'findSubjectById').mockResolvedValue(null);

      const token = getAuthToken(schoolAAdmin);
      const res = await request(app)
        .patch(`/api/v1/subjects/${SUBJECT_B_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Tampered Name' });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('School A cannot delete School B subject (returns 404)', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(schoolAAdmin);
      vi.spyOn(subjectRepository, 'findSubjectById').mockResolvedValue(null);

      const token = getAuthToken(schoolAAdmin);
      const res = await request(app)
        .delete(`/api/v1/subjects/${SUBJECT_B_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('rejects creation when client provides conflicting schoolId in request body (returns 403)', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(schoolAAdmin);

      const token = getAuthToken(schoolAAdmin);
      const res = await request(app)
        .post('/api/v1/subjects')
        .set('Authorization', `Bearer ${token}`)
        .send({
          schoolId: SCHOOL_B, // Malicious spoof attempt
          name: 'Geography',
          code: 'GEO101'
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('TENANT_ACCESS_ERROR');
    });

    it('enforces authenticated tenant schoolId on created subject', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(schoolAAdmin);
      vi.spyOn(subjectRepository, 'findSubjectByName').mockResolvedValue(null);
      vi.spyOn(subjectRepository, 'findSubjectByCode').mockResolvedValue(null);
      vi.spyOn(subjectRepository, 'createSubject').mockImplementation(async (data) => {
        return { id: 'created-id', ...data };
      });

      const token = getAuthToken(schoolAAdmin);
      const res = await request(app)
        .post('/api/v1/subjects')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Geography',
          code: 'GEO101'
        });

      expect(res.status).toBe(201);
      expect(subjectRepository.createSubject).toHaveBeenCalledWith(
        expect.objectContaining({
          schoolId: SCHOOL_A, // Must enforce authenticated School A
          name: 'Geography'
        })
      );
    });
  });

  describe('3. RBAC Access Control', () => {
    it('restricts staff without subjects.create permission from creating subjects', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(restrictedStaff);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        subjects: { canRead: true, canCreate: false, canEdit: false, canDelete: false }
      });

      const token = getAuthToken(restrictedStaff);
      const res = await request(app)
        .post('/api/v1/subjects')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Unauthorized Subject' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('restricts staff without subjects.edit permission from updating subjects', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(restrictedStaff);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        subjects: { canRead: true, canCreate: false, canEdit: false, canDelete: false }
      });

      const token = getAuthToken(restrictedStaff);
      const res = await request(app)
        .patch(`/api/v1/subjects/${SUBJECT_B_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Unauthorized Update' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('restricts staff without subjects.delete permission from deleting subjects', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(restrictedStaff);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        subjects: { canRead: true, canCreate: false, canEdit: false, canDelete: false }
      });

      const token = getAuthToken(restrictedStaff);
      const res = await request(app)
        .delete(`/api/v1/subjects/${SUBJECT_B_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('4. SuperAdmin Tenant Switching', () => {
    it('allows SuperAdmin to access subject when X-Tenant-Id is provided', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(superAdmin);
      vi.spyOn(authRepository, 'findSchoolById').mockResolvedValue({
        id: SCHOOL_A,
        name: 'School A',
        status: 'active'
      });
      vi.spyOn(subjectRepository, 'findSubjects').mockResolvedValue([]);
      vi.spyOn(subjectRepository, 'countSubjects').mockResolvedValue(0);

      const token = getAuthToken(superAdmin);
      const res = await request(app)
        .get('/api/v1/subjects')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Tenant-Id', SCHOOL_A);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(subjectRepository.findSubjects).toHaveBeenCalledWith(SCHOOL_A, expect.anything());
    });

    it('rejects SuperAdmin request when X-Tenant-Id is missing for tenant-scoped endpoint', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(superAdmin);

      const token = getAuthToken(superAdmin);
      const res = await request(app)
        .get('/api/v1/subjects')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('TENANT_ACCESS_ERROR');
    });
  });
});
