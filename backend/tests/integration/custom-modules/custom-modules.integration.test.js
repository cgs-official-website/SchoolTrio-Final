import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/app.js';
import * as authRepository from '../../../src/modules/auth/auth.repository.js';
import * as tokenService from '../../../src/modules/auth/token.service.js';
import * as customModulesRepo from '../../../src/modules/custom-modules/custom-modules.repository.js';
import * as settingsRepo from '../../../src/modules/settings/settings.repository.js';
import * as auditRepo from '../../../src/modules/audit/audit.repository.js';
import { SYSTEM_ROLES } from '../../../src/config/constants.js';

describe('Custom Modules & Form Builder Integration Tests (Phase FORMBUILDER.2)', () => {
  const app = createApp();

  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
  const MODULE_ID = '22222222-2222-4222-8222-222222222222';
  const RECORD_ID = '33333333-3333-4333-8333-333333333333';

  const mockAdminUser = {
    id: 'user-admin-1',
    schoolId: SCHOOL_ID,
    email: 'admin@greenwood.edu',
    systemRole: SYSTEM_ROLES.SCHOOL_ADMIN,
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_ID, name: 'Greenwood High', code: 'GW-01', status: 'approved' }
  };

  const getAuthToken = (user = mockAdminUser) => {
    return tokenService.issueAccessToken({
      sub: user.id,
      schoolId: user.schoolId,
      systemRole: user.systemRole,
      tokenVersion: user.tokenVersion
    });
  };

  const mockModule = {
    id: MODULE_ID,
    schoolId: SCHOOL_ID,
    name: 'Alumni Network',
    icon: 'Folder',
    order: 0,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const mockSchema = {
    id: 'schema-1',
    schoolId: SCHOOL_ID,
    moduleKey: MODULE_ID,
    sections: [
      {
        id: 'sec_1',
        title: 'General Details',
        fields: [
          { id: 'f_name', label: 'Name', type: 'text', required: true, options: '', relationModule: '' },
          { id: 'f_year', label: 'Graduation Year', type: 'number', required: false, options: '', relationModule: '' }
        ]
      }
    ],
    createdAt: new Date(),
    updatedAt: new Date()
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
    vi.spyOn(auditRepo, 'createAuditLog').mockResolvedValue({});
  });

  describe('1. Custom Modules Endpoints', () => {
    it('GET /api/v1/custom-modules > lists all modules for tenant', async () => {
      vi.spyOn(customModulesRepo, 'findModules').mockResolvedValue([mockModule]);

      const res = await request(app)
        .get('/api/v1/custom-modules')
        .set('Authorization', `Bearer ${getAuthToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data[0].id).toBe(MODULE_ID);
    });

    it('POST /api/v1/custom-modules > creates a module with initial schema and sidebar update', async () => {
      vi.spyOn(customModulesRepo, 'findModuleByName').mockResolvedValue(null);
      vi.spyOn(customModulesRepo, 'countModules').mockResolvedValue(1);
      vi.spyOn(customModulesRepo, 'createModule').mockResolvedValue(mockModule);
      vi.spyOn(customModulesRepo, 'upsertSchema').mockResolvedValue({});
      vi.spyOn(settingsRepo, 'findSetting').mockResolvedValue({ data: { order: [] } });
      vi.spyOn(settingsRepo, 'upsertSetting').mockResolvedValue({});
      vi.spyOn(customModulesRepo, 'executeTransaction').mockImplementation(async (cb) => cb({}));

      const res = await request(app)
        .post('/api/v1/custom-modules')
        .set('Authorization', `Bearer ${getAuthToken()}`)
        .send({ name: 'Alumni Network', icon: 'Folder' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Alumni Network');
    });

    it('GET /api/v1/custom-modules/:id > gets module details', async () => {
      vi.spyOn(customModulesRepo, 'findModuleById').mockResolvedValue(mockModule);

      const res = await request(app)
        .get(`/api/v1/custom-modules/${MODULE_ID}`)
        .set('Authorization', `Bearer ${getAuthToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(MODULE_ID);
    });

    it('PATCH /api/v1/custom-modules/:id > updates module metadata', async () => {
      vi.spyOn(customModulesRepo, 'findModuleById').mockResolvedValue(mockModule);
      vi.spyOn(customModulesRepo, 'findModuleByName').mockResolvedValue(null);
      vi.spyOn(customModulesRepo, 'updateModule').mockResolvedValue({
        ...mockModule,
        name: 'Updated Alumni'
      });

      const res = await request(app)
        .patch(`/api/v1/custom-modules/${MODULE_ID}`)
        .set('Authorization', `Bearer ${getAuthToken()}`)
        .send({ name: 'Updated Alumni' });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Updated Alumni');
    });

    it('DELETE /api/v1/custom-modules/:id > deletes module atomically', async () => {
      vi.spyOn(customModulesRepo, 'findModuleById').mockResolvedValue(mockModule);
      vi.spyOn(customModulesRepo, 'deleteRecordsByModule').mockResolvedValue({});
      vi.spyOn(customModulesRepo, 'deleteSchema').mockResolvedValue({});
      vi.spyOn(customModulesRepo, 'deleteModule').mockResolvedValue({});
      vi.spyOn(settingsRepo, 'findSetting').mockResolvedValue({ data: { order: [MODULE_ID] } });
      vi.spyOn(settingsRepo, 'upsertSetting').mockResolvedValue({});
      vi.spyOn(customModulesRepo, 'executeTransaction').mockImplementation(async (cb) => cb({}));

      const res = await request(app)
        .delete(`/api/v1/custom-modules/${MODULE_ID}`)
        .set('Authorization', `Bearer ${getAuthToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('2. Form Schemas Endpoints', () => {
    it('GET /api/v1/custom-modules/schemas/:moduleKey > retrieves schema', async () => {
      vi.spyOn(customModulesRepo, 'findSchemaByModuleKey').mockResolvedValue(mockSchema);

      const res = await request(app)
        .get(`/api/v1/custom-modules/schemas/${MODULE_ID}`)
        .set('Authorization', `Bearer ${getAuthToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.data.sections.length).toBe(1);
    });

    it('PUT /api/v1/custom-modules/schemas/:moduleKey > saves updated schema', async () => {
      vi.spyOn(customModulesRepo, 'upsertSchema').mockResolvedValue({
        ...mockSchema,
        sections: [
          {
            id: 'sec_new',
            title: 'New Section',
            fields: [{ id: 'f_extra', label: 'Extra Field', type: 'text', required: false }]
          }
        ]
      });

      const res = await request(app)
        .put(`/api/v1/custom-modules/schemas/${MODULE_ID}`)
        .set('Authorization', `Bearer ${getAuthToken()}`)
        .send({
          sections: [
            {
              id: 'sec_new',
              title: 'New Section',
              fields: [{ id: 'f_extra', label: 'Extra Field', type: 'text', required: false }]
            }
          ]
        });

      expect(res.status).toBe(200);
      expect(res.body.data.sections[0].title).toBe('New Section');
    });
  });

  describe('3. Dynamic Records Endpoints', () => {
    it('POST /api/v1/custom-modules/:id/records > creates valid record', async () => {
      vi.spyOn(customModulesRepo, 'findModuleById').mockResolvedValue(mockModule);
      vi.spyOn(customModulesRepo, 'findSchemaByModuleKey').mockResolvedValue(mockSchema);
      vi.spyOn(customModulesRepo, 'createRecord').mockResolvedValue({
        id: RECORD_ID,
        schoolId: SCHOOL_ID,
        customModuleId: MODULE_ID,
        data: { f_name: 'Alice Smith', f_year: 2022 },
        createdAt: new Date(),
        updatedAt: new Date()
      });

      const res = await request(app)
        .post(`/api/v1/custom-modules/${MODULE_ID}/records`)
        .set('Authorization', `Bearer ${getAuthToken()}`)
        .send({
          data: {
            f_name: 'Alice Smith',
            f_year: 2022
          }
        });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBe(RECORD_ID);
    });

    it('GET /api/v1/custom-modules/:id/records > lists records paginated', async () => {
      vi.spyOn(customModulesRepo, 'findModuleById').mockResolvedValue(mockModule);
      vi.spyOn(customModulesRepo, 'findRecords').mockResolvedValue({
        records: [
          {
            id: RECORD_ID,
            schoolId: SCHOOL_ID,
            customModuleId: MODULE_ID,
            data: { f_name: 'Alice Smith' },
            createdAt: new Date()
          }
        ],
        total: 1
      });

      const res = await request(app)
        .get(`/api/v1/custom-modules/${MODULE_ID}/records?page=1&limit=10`)
        .set('Authorization', `Bearer ${getAuthToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.pagination.total).toBe(1);
    });

    it('DELETE /api/v1/custom-modules/:id/records/:recordId > deletes record', async () => {
      vi.spyOn(customModulesRepo, 'findModuleById').mockResolvedValue(mockModule);
      vi.spyOn(customModulesRepo, 'findRecordById').mockResolvedValue({
        id: RECORD_ID,
        schoolId: SCHOOL_ID,
        customModuleId: MODULE_ID
      });
      vi.spyOn(customModulesRepo, 'deleteRecord').mockResolvedValue({});

      const res = await request(app)
        .delete(`/api/v1/custom-modules/${MODULE_ID}/records/${RECORD_ID}`)
        .set('Authorization', `Bearer ${getAuthToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
