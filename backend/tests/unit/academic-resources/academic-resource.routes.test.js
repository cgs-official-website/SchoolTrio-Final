import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { academicResourceRoutes } from '../../../src/modules/academic-resources/academic-resource.routes.js';
import * as academicResourceService from '../../../src/modules/academic-resources/academic-resource.service.js';
import * as rbacService from '../../../src/modules/rbac/rbac.service.js';
import { errorMiddleware } from '../../../src/middleware/error.middleware.js';

vi.mock('../../../src/middleware/auth.middleware.js', () => ({
  authenticate: (req, _res, next) => {
    if (req.headers['x-mock-unauthenticated'] === 'true') {
      return _res.status(401).json({ success: false, error: 'Authentication required' });
    }
    const role = req.headers['x-mock-role'] || 'SCHOOL_ADMIN';
    const schoolId = req.headers['x-mock-school-id'] || '11111111-1111-4111-8111-111111111111';
    const userId = req.headers['x-mock-user-id'] || '22222222-2222-4222-8222-222222222222';
    req.auth = { userId, id: userId, schoolId, systemRole: role, role };
    req.user = req.auth;
    next();
  }
}));

vi.mock('../../../src/middleware/tenant.middleware.js', () => ({
  tenantContext: () => (req, _res, next) => {
    if (!req.auth?.schoolId) {
      return _res.status(400).json({ success: false, error: 'Tenant required' });
    }
    req.tenant = { schoolId: req.auth.schoolId };
    next();
  }
}));

describe('Academic Resource Routes & RBAC Integration', () => {
  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
  const CLASS_ID = '33333333-3333-4333-8333-333333333333';
  const RESOURCE_ID = '44444444-4444-4444-8444-444444444444';
  let app;

  beforeEach(() => {
    vi.restoreAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/v1/academic-resources', academicResourceRoutes);
    app.use(errorMiddleware);
  });

  describe('Authentication & Tenant isolation', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app)
        .get('/api/v1/academic-resources')
        .set('x-mock-unauthenticated', 'true');

      expect(res.status).toBe(401);
    });

    it('rejects cross-tenant conflict parameter', async () => {
      const FOREIGN_SCHOOL_ID = '99999999-9999-4999-8999-999999999999';
      const res = await request(app)
        .get(`/api/v1/academic-resources?schoolId=${FOREIGN_SCHOOL_ID}`)
        .set('x-mock-role', 'TEACHER')
        .set('x-mock-school-id', SCHOOL_ID);

      expect(res.status).toBe(403);
      expect(res.body.error?.message).toContain('Cross-tenant');
    });
  });

  describe('RBAC Matrix on GET /api/v1/academic-resources', () => {
    const allowedRoles = [
      'SUPER_ADMIN',
      'SCHOOL_ADMIN',
      'PRINCIPAL',
      'CORRESPONDENT',
      'ADMINISTRATIVE_OFFICER',
      'VICE_PRINCIPAL',
      'SUBJECT_WISE_HEAD',
      'CLASS_INCHARGE',
      'TEACHER',
      'STAFFS'
    ];

    for (const role of allowedRoles) {
      it(`allows ${role} to read academic resources`, async () => {
        vi.spyOn(academicResourceService, 'listAcademicResources').mockResolvedValue({
          data: [],
          pagination: { page: 1, limit: 20, total: 0, totalPages: 1 }
        });

        // Mock functional permission for non-superadmin/schooladmin roles
        vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
          resources: { canRead: true, canCreate: true, canEdit: true, canDelete: true }
        });

        const res = await request(app)
          .get('/api/v1/academic-resources')
          .set('x-mock-role', role)
          .set('x-mock-school-id', SCHOOL_ID);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
      });
    }

    it('rejects PARENT with 403 Forbidden', async () => {
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        resources: { canRead: false, canCreate: false, canEdit: false, canDelete: false }
      });

      const res = await request(app)
        .get('/api/v1/academic-resources')
        .set('x-mock-role', 'PARENT')
        .set('x-mock-school-id', SCHOOL_ID);

      expect(res.status).toBe(403);
    });

    it('rejects STUDENT with 403 Forbidden', async () => {
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        resources: { canRead: false, canCreate: false, canEdit: false, canDelete: false }
      });

      const res = await request(app)
        .get('/api/v1/academic-resources')
        .set('x-mock-role', 'STUDENT')
        .set('x-mock-school-id', SCHOOL_ID);

      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/v1/academic-resources', () => {
    it('creates resource when authorized', async () => {
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        resources: { canRead: true, canCreate: true, canEdit: true, canDelete: true }
      });
      vi.spyOn(academicResourceService, 'createAcademicResource').mockResolvedValue({
        id: RESOURCE_ID,
        title: 'Math Worksheet',
        classId: CLASS_ID,
        type: 'document'
      });

      const res = await request(app)
        .post('/api/v1/academic-resources')
        .set('x-mock-role', 'TEACHER')
        .set('x-mock-school-id', SCHOOL_ID)
        .send({
          title: 'Math Worksheet',
          classId: CLASS_ID,
          type: 'Document'
        });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBe(RESOURCE_ID);
    });

    it('rejects payload with invalid schema (missing classId)', async () => {
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        resources: { canRead: true, canCreate: true, canEdit: true, canDelete: true }
      });

      const res = await request(app)
        .post('/api/v1/academic-resources')
        .set('x-mock-role', 'TEACHER')
        .set('x-mock-school-id', SCHOOL_ID)
        .send({
          title: 'Math Worksheet'
        });

      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /api/v1/academic-resources/:id', () => {
    it('updates resource when authorized', async () => {
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        resources: { canRead: true, canCreate: true, canEdit: true, canDelete: true }
      });
      vi.spyOn(academicResourceService, 'updateAcademicResource').mockResolvedValue({
        id: RESOURCE_ID,
        title: 'Updated Math Worksheet'
      });

      const res = await request(app)
        .patch(`/api/v1/academic-resources/${RESOURCE_ID}`)
        .set('x-mock-role', 'TEACHER')
        .set('x-mock-school-id', SCHOOL_ID)
        .send({
          title: 'Updated Math Worksheet'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.title).toBe('Updated Math Worksheet');
    });
  });

  describe('DELETE /api/v1/academic-resources/:id', () => {
    it('deletes resource when authorized', async () => {
      vi.spyOn(rbacService, 'getUserEffectivePermissions').mockResolvedValue({
        resources: { canRead: true, canCreate: true, canEdit: true, canDelete: true }
      });
      vi.spyOn(academicResourceService, 'deleteAcademicResource').mockResolvedValue({
        success: true,
        message: 'Academic resource deleted successfully'
      });

      const res = await request(app)
        .delete(`/api/v1/academic-resources/${RESOURCE_ID}`)
        .set('x-mock-role', 'TEACHER')
        .set('x-mock-school-id', SCHOOL_ID);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Academic resource deleted successfully');
    });
  });
});
