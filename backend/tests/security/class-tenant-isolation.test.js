import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import * as classRepository from '../../src/modules/classes/class.repository.js';
import * as rbacService from '../../src/modules/rbac/rbac.service.js';
import * as authRepository from '../../src/modules/auth/auth.repository.js';
import * as tokenService from '../../src/modules/auth/token.service.js';
import { SYSTEM_ROLES } from '../../src/config/constants.js';

describe('Security: Classes & Sections Multi-Tenant Isolation & RBAC Access Control Tests', () => {
  const app = createApp();
  const SCHOOL_A = '11111111-1111-4111-8111-111111111111';
  const SCHOOL_B = '22222222-2222-4222-8222-222222222222';
  const CLASS_A_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const CLASS_B_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const SECTION_B_ID = 'dddddddd-dddd-4ddd-8ddd-bbbbbbbbbbbb';
  const CATEGORY_B_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  const STAFF_B_ID = '99999999-9999-4999-8999-999999999999';

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

  beforeEach(() => {
    vi.restoreAllMocks();
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
    it('unauthenticated GET /api/v1/classes returns 401 Unauthorized', async () => {
      const res = await request(app).get('/api/v1/classes');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('unauthenticated POST /api/v1/classes returns 401 Unauthorized', async () => {
      const res = await request(app)
        .post('/api/v1/classes')
        .send({ name: 'Grade 10' });
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('2. Cross-Tenant Class Isolation', () => {
    it('School A cannot read School B classes (returns 404)', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(schoolAAdmin);
      vi.spyOn(classRepository, 'findClassById').mockImplementation(async (schoolId, classId) => {
        if (schoolId === SCHOOL_A && classId === CLASS_B_ID) return null;
        if (schoolId === SCHOOL_B && classId === CLASS_B_ID) {
          return { id: CLASS_B_ID, schoolId: SCHOOL_B, name: 'Class in School B' };
        }
        return null;
      });

      const token = getAuthToken(schoolAAdmin);
      const res = await request(app)
        .get(`/api/v1/classes/${CLASS_B_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(classRepository.findClassById).toHaveBeenCalledWith(SCHOOL_A, CLASS_B_ID);
    });

    it('School A cannot update School B class (returns 404)', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(schoolAAdmin);
      vi.spyOn(classRepository, 'findClassById').mockResolvedValue(null);

      const token = getAuthToken(schoolAAdmin);
      const res = await request(app)
        .patch(`/api/v1/classes/${CLASS_B_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Tampered Name' });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('School A cannot delete School B class (returns 404)', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(schoolAAdmin);
      vi.spyOn(classRepository, 'findClassById').mockResolvedValue(null);

      const token = getAuthToken(schoolAAdmin);
      const res = await request(app)
        .delete(`/api/v1/classes/${CLASS_B_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('3. Cross-Tenant Relational Injection Protection', () => {
    it('rejects creating class in School A with categoryId belonging to School B', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(schoolAAdmin);
      // Category exists in School B, not School A
      vi.spyOn(classRepository, 'findCategoryById').mockImplementation(async (schoolId, catId) => {
        if (schoolId === SCHOOL_A && catId === CATEGORY_B_ID) return null;
        return { id: CATEGORY_B_ID, schoolId: SCHOOL_B };
      });

      const token = getAuthToken(schoolAAdmin);
      const res = await request(app)
        .post('/api/v1/classes')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Grade 10',
          categoryId: CATEGORY_B_ID
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('RELATIONSHIP_CONFLICT');
      expect(classRepository.findCategoryById).toHaveBeenCalledWith(SCHOOL_A, CATEGORY_B_ID);
    });

    it('rejects creating class in School A with classTeacherId belonging to School B', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(schoolAAdmin);
      // Staff exists in School B, not School A
      vi.spyOn(classRepository, 'findStaffProfileById').mockImplementation(async (schoolId, staffId) => {
        if (schoolId === SCHOOL_A && staffId === STAFF_B_ID) return null;
        return { id: STAFF_B_ID, schoolId: SCHOOL_B };
      });

      const token = getAuthToken(schoolAAdmin);
      const res = await request(app)
        .post('/api/v1/classes')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Grade 10',
          classTeacherId: STAFF_B_ID
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('RELATIONSHIP_CONFLICT');
    });

    it('rejects updating class in School A with classTeacherId belonging to School B', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(schoolAAdmin);
      vi.spyOn(classRepository, 'findClassById').mockResolvedValue({ id: CLASS_A_ID, name: 'Grade 10', schoolId: SCHOOL_A });
      vi.spyOn(classRepository, 'findStaffProfileById').mockImplementation(async (schoolId, staffId) => {
        if (schoolId === SCHOOL_A && staffId === STAFF_B_ID) return null;
        return { id: STAFF_B_ID, schoolId: SCHOOL_B };
      });

      const token = getAuthToken(schoolAAdmin);
      const res = await request(app)
        .patch(`/api/v1/classes/${CLASS_A_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          classTeacherId: STAFF_B_ID
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('RELATIONSHIP_CONFLICT');
      expect(classRepository.findStaffProfileById).toHaveBeenCalledWith(SCHOOL_A, STAFF_B_ID);
    });

    it('rejects section update when sectionId belongs to a different class', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(schoolAAdmin);
      vi.spyOn(classRepository, 'findClassById').mockResolvedValue({ id: CLASS_A_ID, schoolId: SCHOOL_A });
      // Section is not found in CLASS_A
      vi.spyOn(classRepository, 'findSectionById').mockImplementation(async (schoolId, classId, sectionId) => {
        if (classId === CLASS_A_ID && sectionId === SECTION_B_ID) return null;
        return { id: SECTION_B_ID, classId: CLASS_B_ID };
      });

      const token = getAuthToken(schoolAAdmin);
      const res = await request(app)
        .patch(`/api/v1/classes/${CLASS_A_ID}/sections/${SECTION_B_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'X' });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('rejects section delete when section belongs to a different tenant (returns 404)', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(schoolAAdmin);
      vi.spyOn(classRepository, 'findClassById').mockResolvedValue({ id: CLASS_A_ID, schoolId: SCHOOL_A });
      // Section is in School B, so findSectionById in School A returns null
      vi.spyOn(classRepository, 'findSectionById').mockResolvedValue(null);

      const token = getAuthToken(schoolAAdmin);
      const res = await request(app)
        .delete(`/api/v1/classes/${CLASS_A_ID}/sections/${SECTION_B_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('4. RBAC Permission Checks', () => {
    it('rejects GET /api/v1/classes when user lacks classes.read permission', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(restrictedStaff);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        classes: { canRead: false, canCreate: false, canEdit: false, canDelete: false }
      });

      const token = getAuthToken(restrictedStaff);
      const res = await request(app)
        .get('/api/v1/classes')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('rejects POST /api/v1/classes when user has classes.read but lacks classes.create', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(restrictedStaff);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        classes: { canRead: true, canCreate: false, canEdit: false, canDelete: false }
      });

      const token = getAuthToken(restrictedStaff);
      const res = await request(app)
        .post('/api/v1/classes')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Grade 10' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('rejects PATCH /api/v1/classes/:id when user lacks classes.edit', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(restrictedStaff);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        classes: { canRead: true, canCreate: false, canEdit: false, canDelete: false }
      });

      const token = getAuthToken(restrictedStaff);
      const res = await request(app)
        .patch(`/api/v1/classes/${CLASS_A_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Grade 10' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('rejects DELETE /api/v1/classes/:id when user lacks classes.delete', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(restrictedStaff);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        classes: { canRead: true, canCreate: true, canEdit: true, canDelete: false }
      });

      const token = getAuthToken(restrictedStaff);
      const res = await request(app)
        .delete(`/api/v1/classes/${CLASS_A_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('5. Input Validation', () => {
    it('rejects invalid UUID in GET /api/v1/classes/:id with 400', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(schoolAAdmin);

      const token = getAuthToken(schoolAAdmin);
      const res = await request(app)
        .get('/api/v1/classes/invalid-uuid-format')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects empty class name in POST /api/v1/classes with 400', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(schoolAAdmin);

      const token = getAuthToken(schoolAAdmin);
      const res = await request(app)
        .post('/api/v1/classes')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects invalid gradeLevel out of range with 400', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(schoolAAdmin);

      const token = getAuthToken(schoolAAdmin);
      const res = await request(app)
        .post('/api/v1/classes')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Grade 25', gradeLevel: 50 });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });
});
