import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import * as authRepository from '../../src/modules/auth/auth.repository.js';
import * as tokenService from '../../src/modules/auth/token.service.js';
import * as emailTemplatesRepo from '../../src/modules/email-templates/email-templates.repository.js';
import * as auditRepo from '../../src/modules/audit/audit.repository.js';
import { SYSTEM_ROLES } from '../../src/config/constants.js';

describe('Integration: Email Templates REST Routes (/api/v1/email-templates)', () => {
  const app = createApp();

  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';

  const userSchoolAdmin = {
    id: 'user-school-admin',
    schoolId: SCHOOL_ID,
    email: 'admin@school.edu',
    systemRole: SYSTEM_ROLES.SCHOOL_ADMIN,
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_ID, name: 'Main Campus', code: 'MAIN', status: 'approved' }
  };

  const getAuthToken = () => {
    return tokenService.issueAccessToken({
      sub: userSchoolAdmin.id,
      schoolId: userSchoolAdmin.schoolId,
      systemRole: userSchoolAdmin.systemRole,
      tokenVersion: userSchoolAdmin.tokenVersion
    });
  };

  let inMemorySetting = null;

  beforeEach(() => {
    vi.restoreAllMocks();
    inMemorySetting = null;

    vi.spyOn(authRepository, 'findUserById').mockImplementation(async (id) => {
      if (id === userSchoolAdmin.id) return userSchoolAdmin;
      return null;
    });

    vi.spyOn(authRepository, 'findSchoolById').mockImplementation(async (id) => {
      if (id === SCHOOL_ID) return userSchoolAdmin.school;
      return null;
    });

    vi.spyOn(auditRepo, 'createAuditLog').mockResolvedValue({});

    vi.spyOn(emailTemplatesRepo, 'findEmailTemplatesSetting').mockImplementation(async () => {
      return inMemorySetting;
    });

    vi.spyOn(emailTemplatesRepo, 'upsertEmailTemplatesSetting').mockImplementation(async (schoolId, data) => {
      inMemorySetting = {
        id: 'setting-uuid-1',
        schoolId,
        category: 'emailTemplates',
        data
      };
      return inMemorySetting;
    });

    vi.spyOn(emailTemplatesRepo, 'executeTransaction').mockImplementation(async (cb) => {
      return cb({});
    });
  });

  describe('GET /api/v1/email-templates', () => {
    it('returns default templates when school has not customized any templates', async () => {
      const token = getAuthToken();
      const res = await request(app)
        .get('/api/v1/email-templates')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.templates).toHaveLength(3);
      expect(res.body.data.raw).toBeDefined();
      expect(res.body.data.raw.welcomeSubject).toBe('Welcome to Acme School');
    });

    it('filters templates by query parameters', async () => {
      const token = getAuthToken();
      const res = await request(app)
        .get('/api/v1/email-templates?search=welcome')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.templates).toHaveLength(1);
      expect(res.body.data.templates[0].id).toBe('welcome');
    });
  });

  describe('GET /api/v1/email-templates/:id', () => {
    it('returns a specific template by ID', async () => {
      const token = getAuthToken();
      const res = await request(app)
        .get('/api/v1/email-templates/forgotPassword')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe('forgotPassword');
      expect(res.body.data.variables).toContain('{{resetLink}}');
    });

    it('returns 404 when template is not found', async () => {
      const token = getAuthToken();
      const res = await request(app)
        .get('/api/v1/email-templates/non-existent-template')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('not found');
    });
  });

  describe('POST /api/v1/email-templates', () => {
    it('creates a custom template for the school with 201 Created', async () => {
      const token = getAuthToken();
      const payload = {
        name: 'Report Card Published',
        description: 'Sent when exam results are finalized',
        subject: 'Your Exam Report Card is Available',
        body: '<p>Dear Parent, {{studentName}} report card is available.</p>',
        variables: ['{{studentName}}', '{{examName}}']
      };

      const res = await request(app)
        .post('/api/v1/email-templates')
        .set('Authorization', `Bearer ${token}`)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe('report-card-published');
      expect(res.body.data.isSystem).toBe(false);
    });

    it('rejects attempt to shadow a system template via create with 409 Conflict', async () => {
      const token = getAuthToken();
      const payload = {
        id: 'welcome',
        name: 'Welcome Email',
        subject: 'Custom Welcome',
        body: '<p>Welcome</p>'
      };

      const res = await request(app)
        .post('/api/v1/email-templates')
        .set('Authorization', `Bearer ${token}`)
        .send(payload);

      expect(res.status).toBe(409);
      expect(res.body.error.message).toContain('protected system template');
    });
  });

  describe('PATCH /api/v1/email-templates/:id', () => {
    it('updates an existing template subject and body', async () => {
      const token = getAuthToken();
      const res = await request(app)
        .patch('/api/v1/email-templates/welcome')
        .set('Authorization', `Bearer ${token}`)
        .send({
          subject: 'Welcome to Main Campus High School',
          body: '<h2>Welcome {{userName}} to our community!</h2>'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.subject).toBe('Welcome to Main Campus High School');
      expect(res.body.data.isSystem).toBe(true);

      // Verify subsequent GET reflects the change
      const getRes = await request(app)
        .get('/api/v1/email-templates/welcome')
        .set('Authorization', `Bearer ${token}`);
      expect(getRes.body.data.subject).toBe('Welcome to Main Campus High School');
    });

    it('returns 404 when updating non-existent template', async () => {
      const token = getAuthToken();
      const res = await request(app)
        .patch('/api/v1/email-templates/unknown-tpl')
        .set('Authorization', `Bearer ${token}`)
        .send({ subject: 'New Subject' });

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/v1/email-templates/:id/reset', () => {
    it('resets a modified system template to default values', async () => {
      const token = getAuthToken();

      // First modify it
      await request(app)
        .patch('/api/v1/email-templates/welcome')
        .set('Authorization', `Bearer ${token}`)
        .send({ subject: 'Modified Welcome' });

      // Then reset it
      const resetRes = await request(app)
        .post('/api/v1/email-templates/welcome/reset')
        .set('Authorization', `Bearer ${token}`);

      expect(resetRes.status).toBe(200);
      expect(resetRes.body.data.subject).toBe('Welcome to Acme School');
    });

    it('returns 400 when attempting to reset a non-system template', async () => {
      const token = getAuthToken();
      const res = await request(app)
        .post('/api/v1/email-templates/custom-notice/reset')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('not a system template');
    });
  });

  describe('PUT /api/v1/email-templates', () => {
    it('supports legacy bulk update matching frontend EmailTemplates.jsx', async () => {
      const token = getAuthToken();
      const res = await request(app)
        .put('/api/v1/email-templates')
        .set('Authorization', `Bearer ${token}`)
        .send({
          welcomeSubject: 'Legacy Bulk Welcome Subject',
          welcomeHtml: '<p>Legacy HTML</p>',
          forgotPasswordSubject: 'Legacy Bulk Forgot Password'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.raw.welcomeSubject).toBe('Legacy Bulk Welcome Subject');
      expect(res.body.data.raw.forgotPasswordSubject).toBe('Legacy Bulk Forgot Password');
    });
  });

  describe('DELETE /api/v1/email-templates/:id', () => {
    it('strictly forbids deletion of system templates', async () => {
      const token = getAuthToken();
      const res = await request(app)
        .delete('/api/v1/email-templates/approval')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('System template');
      expect(res.body.error.message).toContain('cannot be deleted');
    });

    it('successfully deletes a custom template', async () => {
      const token = getAuthToken();

      // First create custom template
      await request(app)
        .post('/api/v1/email-templates')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Temporary Notice',
          subject: 'Notice',
          body: 'Content'
        });

      // Then delete it
      const delRes = await request(app)
        .delete('/api/v1/email-templates/temporary-notice')
        .set('Authorization', `Bearer ${token}`);

      expect(delRes.status).toBe(200);
      expect(delRes.body.data.deleted).toBe(true);

      // Verify it is gone
      const getRes = await request(app)
        .get('/api/v1/email-templates/temporary-notice')
        .set('Authorization', `Bearer ${token}`);
      expect(getRes.status).toBe(404);
    });
  });
});
