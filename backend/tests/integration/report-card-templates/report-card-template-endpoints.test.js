import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/app.js';
import * as reportCardTemplateService from '../../../src/modules/report-card-templates/report-card-template.service.js';
import * as authRepository from '../../../src/modules/auth/auth.repository.js';
import * as tokenService from '../../../src/modules/auth/token.service.js';
import { SYSTEM_ROLES } from '../../../src/config/constants.js';
import * as rbacService from '../../../src/modules/rbac/rbac.service.js';

describe('Report Card Template API Endpoints Integration & Security Tests (Phase 4C.7-C Batch 3B)', () => {
  const app = createApp();

  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
  const TEMPLATE_TYPE = 'report_card';

  const mockAdminUser = {
    id: 'admin-1',
    schoolId: SCHOOL_ID,
    email: 'admin@school.edu',
    systemRole: SYSTEM_ROLES.SCHOOL_ADMIN,
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_ID, name: 'Main School', status: 'active' }
  };

  const mockParentUser = {
    id: 'parent-1',
    schoolId: SCHOOL_ID,
    email: 'parent@school.edu',
    systemRole: SYSTEM_ROLES.PARENT,
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_ID, name: 'Main School', status: 'active' }
  };

  const getAuthToken = (user) => {
    return tokenService.issueAccessToken({
      sub: user.id,
      schoolId: user.schoolId,
      systemRole: user.systemRole,
      tokenVersion: user.tokenVersion
    });
  };

  beforeEach(() => {
    vi.restoreAllMocks();

    vi.spyOn(rbacService, 'getUserEffectivePermissions').mockImplementation(async (_schoolId, userId) => {
      if (userId === mockParentUser.id) {
        return {
          exams: { canRead: false, canCreate: false, canEdit: false, canDelete: false }
        };
      }
      return {
        exams: { canRead: true, canCreate: true, canEdit: true, canDelete: false }
      };
    });

    vi.spyOn(authRepository, 'findUserById').mockImplementation(async (id) => {
      if (id === mockAdminUser.id) return mockAdminUser;
      if (id === mockParentUser.id) return mockParentUser;
      return null;
    });
  });

  describe('GET /api/v1/report-card-templates/:templateType?', () => {
    it('allows Admin to retrieve report card template with 200 OK', async () => {
      const token = getAuthToken(mockAdminUser);
      const mockTemplate = {
        id: 'tpl-1',
        schoolId: SCHOOL_ID,
        templateType: TEMPLATE_TYPE,
        config: { themeColor: '#3b82f6' },
        isDefault: false
      };

      vi.spyOn(reportCardTemplateService, 'getReportCardTemplate').mockResolvedValue(mockTemplate);

      const res = await request(app)
        .get(`/api/v1/report-card-templates/${TEMPLATE_TYPE}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.config.themeColor).toBe('#3b82f6');
    });

    it('rejects unauthenticated request with 401 Unauthorized', async () => {
      const res = await request(app)
        .get(`/api/v1/report-card-templates/${TEMPLATE_TYPE}`);

      expect(res.status).toBe(401);
    });
  });

  describe('PUT /api/v1/report-card-templates/:templateType?', () => {
    it('allows Admin to save template configuration with 200 OK', async () => {
      const token = getAuthToken(mockAdminUser);
      const validConfig = {
        themeColor: '#c99bc1',
        header: { title: 'PROGRESS REPORT' },
        studentFields: { admissionNo: true },
        grading: { style: 'marks_and_grades' },
        footer: { remarks: true }
      };

      const mockSaved = {
        id: 'tpl-1',
        schoolId: SCHOOL_ID,
        templateType: TEMPLATE_TYPE,
        config: validConfig,
        isDefault: false
      };

      vi.spyOn(reportCardTemplateService, 'saveReportCardTemplate').mockResolvedValue(mockSaved);

      const res = await request(app)
        .put(`/api/v1/report-card-templates/${TEMPLATE_TYPE}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ config: validConfig });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.config.themeColor).toBe('#c99bc1');
    });

    it('rejects invalid themeColor format with 400 Bad Request', async () => {
      const token = getAuthToken(mockAdminUser);
      const invalidConfig = {
        themeColor: 'not-a-hex-color'
      };

      const res = await request(app)
        .put(`/api/v1/report-card-templates/${TEMPLATE_TYPE}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ config: invalidConfig });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('denies Parent from updating template with 403 Forbidden', async () => {
      const token = getAuthToken(mockParentUser);
      const validConfig = { themeColor: '#3b82f6' };

      const res = await request(app)
        .put(`/api/v1/report-card-templates/${TEMPLATE_TYPE}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ config: validConfig });

      expect(res.status).toBe(403);
    });
  });

  describe('DELETE /api/v1/report-card-templates/:templateType?', () => {
    it('allows Admin to reset template to default with 200 OK', async () => {
      const token = getAuthToken(mockAdminUser);
      const mockResult = {
        message: 'Report card template reset to default successfully',
        templateType: TEMPLATE_TYPE
      };

      vi.spyOn(reportCardTemplateService, 'deleteReportCardTemplate').mockResolvedValue(mockResult);

      const res = await request(app)
        .delete(`/api/v1/report-card-templates/${TEMPLATE_TYPE}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('reset to default');
    });

    it('denies Parent from deleting template with 403 Forbidden', async () => {
      const token = getAuthToken(mockParentUser);

      const res = await request(app)
        .delete(`/api/v1/report-card-templates/${TEMPLATE_TYPE}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });
  });
});
