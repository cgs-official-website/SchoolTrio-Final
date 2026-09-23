import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import * as authRepository from '../../src/modules/auth/auth.repository.js';
import * as tokenService from '../../src/modules/auth/token.service.js';
import * as customModulesRepo from '../../src/modules/custom-modules/custom-modules.repository.js';
import * as settingsRepo from '../../src/modules/settings/settings.repository.js';
import * as rbacService from '../../src/modules/rbac/rbac.service.js';
import * as auditRepo from '../../src/modules/audit/audit.repository.js';
import { SYSTEM_ROLES } from '../../src/config/constants.js';

describe('Security: Custom Dynamic Modules & Form Builder (Phase FORMBUILDER.4)', () => {
  const app = createApp();

  const TENANT_A_ID = '11111111-1111-4111-8111-111111111111';
  const TENANT_B_ID = '22222222-2222-4222-8222-222222222222';
  const MODULE_A_ID = '33333333-3333-4333-8333-333333333333';
  const MODULE_B_ID = '44444444-4444-4444-8444-444444444444';
  const RECORD_A_ID = '55555555-5555-4555-8555-555555555555';
  const RECORD_B_ID = '66666666-6666-4666-8666-666666666666';

  const mockAdminUserA = {
    id: 'user-admin-a',
    schoolId: TENANT_A_ID,
    email: 'admin@school-a.edu',
    systemRole: SYSTEM_ROLES.SCHOOL_ADMIN,
    tokenVersion: 1,
    isActive: true,
    school: { id: TENANT_A_ID, name: 'School A', code: 'SCH-A', status: 'approved' }
  };

  const mockSuperAdmin = {
    id: 'user-superadmin',
    schoolId: null,
    email: 'superadmin@system.local',
    systemRole: SYSTEM_ROLES.SUPER_ADMIN,
    tokenVersion: 1,
    isActive: true
  };

  const mockTeacherUserA = {
    id: 'user-teacher-a',
    schoolId: TENANT_A_ID,
    email: 'teacher@school-a.edu',
    systemRole: SYSTEM_ROLES.TEACHER,
    tokenVersion: 1,
    isActive: true,
    school: { id: TENANT_A_ID, name: 'School A', code: 'SCH-A', status: 'approved' }
  };

  const mockStudentUserA = {
    id: 'user-student-a',
    schoolId: TENANT_A_ID,
    email: 'student@school-a.edu',
    systemRole: SYSTEM_ROLES.STUDENT,
    tokenVersion: 1,
    isActive: true,
    school: { id: TENANT_A_ID, name: 'School A', code: 'SCH-A', status: 'approved' }
  };

  const mockParentUserA = {
    id: 'user-parent-a',
    schoolId: TENANT_A_ID,
    email: 'parent@school-a.edu',
    systemRole: SYSTEM_ROLES.PARENT,
    tokenVersion: 1,
    isActive: true,
    school: { id: TENANT_A_ID, name: 'School A', code: 'SCH-A', status: 'approved' }
  };

  const getAuthToken = (user, customClaims = {}) => {
    return tokenService.issueAccessToken({
      sub: user.id,
      schoolId: user.schoolId,
      systemRole: user.systemRole,
      tokenVersion: user.tokenVersion,
      ...customClaims
    });
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(auditRepo, 'createAuditLog').mockResolvedValue({});
  });

  describe('1. Authentication Guards', () => {
    it('rejects unauthenticated requests with missing token (401)', async () => {
      const endpoints = [
        { method: 'get', path: '/api/v1/custom-modules' },
        { method: 'post', path: '/api/v1/custom-modules' },
        { method: 'get', path: `/api/v1/custom-modules/${MODULE_A_ID}` },
        { method: 'patch', path: `/api/v1/custom-modules/${MODULE_A_ID}` },
        { method: 'delete', path: `/api/v1/custom-modules/${MODULE_A_ID}` },
        { method: 'get', path: `/api/v1/custom-modules/schemas/${MODULE_A_ID}` },
        { method: 'put', path: `/api/v1/custom-modules/schemas/${MODULE_A_ID}` },
        { method: 'delete', path: `/api/v1/custom-modules/schemas/${MODULE_A_ID}` },
        { method: 'get', path: `/api/v1/custom-modules/${MODULE_A_ID}/records` },
        { method: 'post', path: `/api/v1/custom-modules/${MODULE_A_ID}/records` },
        { method: 'get', path: `/api/v1/custom-modules/${MODULE_A_ID}/records/${RECORD_A_ID}` },
        { method: 'patch', path: `/api/v1/custom-modules/${MODULE_A_ID}/records/${RECORD_A_ID}` },
        { method: 'delete', path: `/api/v1/custom-modules/${MODULE_A_ID}/records/${RECORD_A_ID}` }
      ];

      for (const ep of endpoints) {
        const res = await request(app)[ep.method](ep.path);
        expect(res.status).toBe(401);
        expect(res.body.success).toBe(false);
      }
    });

    it('rejects requests with malformed or invalid token (401)', async () => {
      const res = await request(app)
        .get('/api/v1/custom-modules')
        .set('Authorization', 'Bearer invalid-token-sig');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('2. RBAC Enforcement Matrix', () => {
    it('allows School Admin full access to list custom modules', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUserA);
      vi.spyOn(customModulesRepo, 'findModules').mockResolvedValue([]);

      const res = await request(app)
        .get('/api/v1/custom-modules')
        .set('Authorization', `Bearer ${getAuthToken(mockAdminUserA)}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('allows SuperAdmin to access with explicit x-school-id header', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockSuperAdmin);
      vi.spyOn(authRepository, 'findSchoolById').mockResolvedValue({ id: TENANT_A_ID, name: 'School A', status: 'approved' });
      vi.spyOn(customModulesRepo, 'findModules').mockResolvedValue([]);

      const res = await request(app)
        .get('/api/v1/custom-modules')
        .set('Authorization', `Bearer ${getAuthToken(mockSuperAdmin)}`)
        .set('x-school-id', TENANT_A_ID);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('rejects Student from accessing custom modules with 403 Forbidden', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockStudentUserA);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        'form-builder': { canRead: false, canCreate: false, canEdit: false, canDelete: false }
      });

      const res = await request(app)
        .get('/api/v1/custom-modules')
        .set('Authorization', `Bearer ${getAuthToken(mockStudentUserA)}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('rejects Parent from accessing custom modules with 403 Forbidden', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockParentUserA);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        'form-builder': { canRead: false, canCreate: false, canEdit: false, canDelete: false }
      });

      const res = await request(app)
        .get('/api/v1/custom-modules')
        .set('Authorization', `Bearer ${getAuthToken(mockParentUserA)}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('allows user with form-builder:read to list modules and view schema', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockTeacherUserA);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        'form-builder': { canRead: true, canCreate: false, canEdit: false, canDelete: false }
      });
      vi.spyOn(customModulesRepo, 'findModules').mockResolvedValue([]);

      const res = await request(app)
        .get('/api/v1/custom-modules')
        .set('Authorization', `Bearer ${getAuthToken(mockTeacherUserA)}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('rejects user without form-builder:create from creating a module (403)', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockTeacherUserA);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        'form-builder': { canRead: true, canCreate: false, canEdit: false, canDelete: false }
      });

      const res = await request(app)
        .post('/api/v1/custom-modules')
        .set('Authorization', `Bearer ${getAuthToken(mockTeacherUserA)}`)
        .send({ name: 'Unauthorized Module' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('rejects user without form-builder:edit from updating a module (403)', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockTeacherUserA);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        'form-builder': { canRead: true, canCreate: true, canEdit: false, canDelete: false }
      });

      const res = await request(app)
        .patch(`/api/v1/custom-modules/${MODULE_A_ID}`)
        .set('Authorization', `Bearer ${getAuthToken(mockTeacherUserA)}`)
        .send({ name: 'Updated Name' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('rejects user without form-builder:delete from deleting a module (403)', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockTeacherUserA);
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        'form-builder': { canRead: true, canCreate: true, canEdit: true, canDelete: false }
      });

      const res = await request(app)
        .delete(`/api/v1/custom-modules/${MODULE_A_ID}`)
        .set('Authorization', `Bearer ${getAuthToken(mockTeacherUserA)}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('3. Strict Multi-Tenant Isolation & IDOR Protection', () => {
    it('prevents Tenant A from reading Tenant B module by ID (returns 404)', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUserA);
      vi.spyOn(customModulesRepo, 'findModuleById').mockResolvedValue(null);

      const res = await request(app)
        .get(`/api/v1/custom-modules/${MODULE_B_ID}`)
        .set('Authorization', `Bearer ${getAuthToken(mockAdminUserA)}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Custom module not found');
    });

    it('prevents Tenant A from updating Tenant B module by ID (returns 404)', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUserA);
      vi.spyOn(customModulesRepo, 'findModuleById').mockResolvedValue(null);

      const res = await request(app)
        .patch(`/api/v1/custom-modules/${MODULE_B_ID}`)
        .set('Authorization', `Bearer ${getAuthToken(mockAdminUserA)}`)
        .send({ name: 'Hacked Name' });

      expect(res.status).toBe(404);
    });

    it('prevents Tenant A from deleting Tenant B module by ID (returns 404)', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUserA);
      vi.spyOn(customModulesRepo, 'findModuleById').mockResolvedValue(null);

      const res = await request(app)
        .delete(`/api/v1/custom-modules/${MODULE_B_ID}`)
        .set('Authorization', `Bearer ${getAuthToken(mockAdminUserA)}`);

      expect(res.status).toBe(404);
    });

    it('prevents Tenant A from accessing Tenant B records by ID (returns 404)', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUserA);
      vi.spyOn(customModulesRepo, 'findModuleById').mockResolvedValue(null);

      const res = await request(app)
        .get(`/api/v1/custom-modules/${MODULE_B_ID}/records/${RECORD_B_ID}`)
        .set('Authorization', `Bearer ${getAuthToken(mockAdminUserA)}`);

      expect(res.status).toBe(404);
    });
  });

  describe('4. Client Tenant Spoofing & Mass Assignment Rejection', () => {
    it('rejects client-supplied schoolId in POST body with 403 Forbidden', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUserA);

      const res = await request(app)
        .post('/api/v1/custom-modules')
        .set('Authorization', `Bearer ${getAuthToken(mockAdminUserA)}`)
        .send({
          name: 'Safe Module',
          schoolId: TENANT_B_ID // Malicious spoof attempt
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('rejects client-supplied tenantId in POST body with 400 Bad Request', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUserA);

      const res = await request(app)
        .post('/api/v1/custom-modules')
        .set('Authorization', `Bearer ${getAuthToken(mockAdminUserA)}`)
        .send({
          name: 'Safe Module',
          tenantId: TENANT_B_ID // Malicious spoof attempt
        });

      expect([400, 403]).toContain(res.status);
      expect(res.body.success).toBe(false);
    });

    it('rejects client-supplied schoolId in PUT schema body with 403 Forbidden', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUserA);

      const res = await request(app)
        .put(`/api/v1/custom-modules/schemas/${MODULE_A_ID}`)
        .set('Authorization', `Bearer ${getAuthToken(mockAdminUserA)}`)
        .send({
          schoolId: TENANT_B_ID,
          sections: [{ id: 'sec_1', title: 'Details', fields: [] }]
        });

      expect(res.status).toBe(403);
    });
  });

  describe('5. Schema Validation, Dangerous Types & Prototype Pollution', () => {
    it('rejects schema containing dangerous executable field types with 400', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUserA);

      const res = await request(app)
        .put(`/api/v1/custom-modules/schemas/${MODULE_A_ID}`)
        .set('Authorization', `Bearer ${getAuthToken(mockAdminUserA)}`)
        .send({
          sections: [
            {
              id: 'sec_1',
              title: 'Exploit Section',
              fields: [
                {
                  id: 'f_hack',
                  label: 'Hack Component',
                  type: 'dangerousComponent' // Not in supported enum
                }
              ]
            }
          ]
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('rejects schema containing prototype pollution payloads (constructor/prototype)', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUserA);

      const res = await request(app)
        .put(`/api/v1/custom-modules/schemas/${MODULE_A_ID}`)
        .set('Authorization', `Bearer ${getAuthToken(mockAdminUserA)}`)
        .send({
          constructor: { prototype: { polluted: true } },
          sections: [{ id: 'sec_1', title: 'Pollute', fields: [] }]
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('stores XSS and SQL injection characters safely as plain text without execution', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUserA);
      vi.spyOn(customModulesRepo, 'upsertSchema').mockResolvedValue({
        id: 'schema-1',
        moduleKey: MODULE_A_ID,
        sections: [
          {
            id: 'sec_1',
            title: '<script>alert("XSS")</script>',
            fields: [
              {
                id: 'f_1',
                label: "'; DROP TABLE custom_modules; --",
                type: 'text'
              }
            ]
          }
        ]
      });

      const res = await request(app)
        .put(`/api/v1/custom-modules/schemas/${MODULE_A_ID}`)
        .set('Authorization', `Bearer ${getAuthToken(mockAdminUserA)}`)
        .send({
          sections: [
            {
              id: 'sec_1',
              title: '<script>alert("XSS")</script>',
              fields: [
                {
                  id: 'f_1',
                  label: "'; DROP TABLE custom_modules; --",
                  type: 'text'
                }
              ]
            }
          ]
        });

      expect(res.status).toBe(200);
      expect(res.body.data.sections[0].title).toBe('<script>alert("XSS")</script>');
      expect(res.body.data.sections[0].fields[0].label).toBe("'; DROP TABLE custom_modules; --");
    });
  });

  describe('6. Dynamic Record Validation & Type Checking', () => {
    beforeEach(() => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUserA);
      vi.spyOn(customModulesRepo, 'findModuleById').mockResolvedValue({
        id: MODULE_A_ID,
        schoolId: TENANT_A_ID,
        name: 'Staff Registry'
      });
      vi.spyOn(customModulesRepo, 'findSchemaByModuleKey').mockResolvedValue({
        id: 'schema-1',
        moduleKey: MODULE_A_ID,
        sections: [
          {
            id: 'sec_1',
            title: 'Personal Info',
            fields: [
              { id: 'f_name', label: 'Full Name', type: 'text', required: true },
              { id: 'f_age', label: 'Age', type: 'number', required: true },
              { id: 'f_email', label: 'Email', type: 'email', required: false },
              { id: 'f_role', label: 'Role', type: 'select', options: 'Admin, Teacher, Staff', required: true },
              { id: 'f_active', label: 'Active Status', type: 'checkbox', required: false },
              { id: 'f_doc', label: 'Document', type: 'file', required: false }
            ]
          }
        ]
      });
    });

    it('rejects record submission omitting required fields (400)', async () => {
      const res = await request(app)
        .post(`/api/v1/custom-modules/${MODULE_A_ID}/records`)
        .set('Authorization', `Bearer ${getAuthToken(mockAdminUserA)}`)
        .send({
          data: {
            f_name: 'John Doe'
            // f_age and f_role missing
          }
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('cannot be empty');
    });

    it('rejects record submission containing unknown field IDs (400)', async () => {
      const res = await request(app)
        .post(`/api/v1/custom-modules/${MODULE_A_ID}/records`)
        .set('Authorization', `Bearer ${getAuthToken(mockAdminUserA)}`)
        .send({
          data: {
            f_name: 'John Doe',
            f_age: 30,
            f_role: 'Teacher',
            unauthorizedKey: 'malicious value'
          }
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Unknown field key: "unauthorizedKey"');
    });

    it('rejects invalid email format in record data (400)', async () => {
      const res = await request(app)
        .post(`/api/v1/custom-modules/${MODULE_A_ID}/records`)
        .set('Authorization', `Bearer ${getAuthToken(mockAdminUserA)}`)
        .send({
          data: {
            f_name: 'John Doe',
            f_age: 30,
            f_role: 'Teacher',
            f_email: 'not-an-email'
          }
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('must be a valid email address');
    });

    it('rejects invalid select option outside configured options (400)', async () => {
      const res = await request(app)
        .post(`/api/v1/custom-modules/${MODULE_A_ID}/records`)
        .set('Authorization', `Bearer ${getAuthToken(mockAdminUserA)}`)
        .send({
          data: {
            f_name: 'John Doe',
            f_age: 30,
            f_role: 'InvalidRoleChoice'
          }
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('Invalid option');
    });

    it('rejects prototype pollution keys in record data (400)', async () => {
      const res = await request(app)
        .post(`/api/v1/custom-modules/${MODULE_A_ID}/records`)
        .set('Authorization', `Bearer ${getAuthToken(mockAdminUserA)}`)
        .set('Content-Type', 'application/json')
        .send('{"data": {"constructor": {"prototype": {"polluted": true}}, "f_name": "John", "f_age": 30, "f_role": "Teacher"}}');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('7. Atomic Cascade Module Deletion & Sidebar Cleanup', () => {
    it('deletes module, schema, records and cleans sidebar in single atomic transaction', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUserA);
      vi.spyOn(customModulesRepo, 'findModuleById').mockResolvedValue({
        id: MODULE_A_ID,
        schoolId: TENANT_A_ID,
        name: 'Obsolete Module'
      });

      const txSpy = vi.spyOn(customModulesRepo, 'executeTransaction').mockImplementation(async (cb) => {
        return cb({});
      });
      const deleteRecordsSpy = vi.spyOn(customModulesRepo, 'deleteRecordsByModule').mockResolvedValue({ count: 5 });
      const deleteSchemaSpy = vi.spyOn(customModulesRepo, 'deleteSchema').mockResolvedValue({});
      const deleteModuleSpy = vi.spyOn(customModulesRepo, 'deleteModule').mockResolvedValue({});
      const findSettingSpy = vi.spyOn(settingsRepo, 'findSetting').mockResolvedValue({
        data: { order: ['staff', MODULE_A_ID, 'students'] }
      });
      const upsertSettingSpy = vi.spyOn(settingsRepo, 'upsertSetting').mockResolvedValue({});

      const res = await request(app)
        .delete(`/api/v1/custom-modules/${MODULE_A_ID}`)
        .set('Authorization', `Bearer ${getAuthToken(mockAdminUserA)}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(txSpy).toHaveBeenCalled();
      expect(deleteRecordsSpy).toHaveBeenCalledWith(TENANT_A_ID, MODULE_A_ID, expect.anything());
      expect(deleteSchemaSpy).toHaveBeenCalledWith(TENANT_A_ID, MODULE_A_ID, expect.anything());
      expect(deleteModuleSpy).toHaveBeenCalledWith(TENANT_A_ID, MODULE_A_ID, expect.anything());
      expect(upsertSettingSpy).toHaveBeenCalledWith(
        TENANT_A_ID,
        'sidebar',
        { order: ['staff', 'students'] },
        expect.anything()
      );
    });
  });

  describe('8. Audit Logging Verification', () => {
    it('logs audit event on module creation with non-sensitive metadata', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUserA);
      vi.spyOn(customModulesRepo, 'findModuleByName').mockResolvedValue(null);
      vi.spyOn(customModulesRepo, 'countModules').mockResolvedValue(0);
      vi.spyOn(customModulesRepo, 'executeTransaction').mockImplementation(async (cb) => {
        return cb({});
      });
      vi.spyOn(customModulesRepo, 'createModule').mockResolvedValue({
        id: MODULE_A_ID,
        name: 'New Module',
        order: 0
      });
      vi.spyOn(customModulesRepo, 'upsertSchema').mockResolvedValue({});
      vi.spyOn(settingsRepo, 'findSetting').mockResolvedValue({ data: { order: [] } });
      vi.spyOn(settingsRepo, 'upsertSetting').mockResolvedValue({});
      const auditSpy = vi.spyOn(auditRepo, 'createAuditLog').mockResolvedValue({});

      const res = await request(app)
        .post('/api/v1/custom-modules')
        .set('Authorization', `Bearer ${getAuthToken(mockAdminUserA)}`)
        .send({ name: 'New Module', icon: 'Folder' });

      expect(res.status).toBe(201);
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          schoolId: TENANT_A_ID,
          entityType: 'CustomModule',
          entityId: MODULE_A_ID,
          actionPerformed: 'Created custom module'
        }),
        expect.anything()
      );
    });
  });
});
