import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { complaintRoutes } from '../../../src/modules/complaints/complaint.routes.js';
import * as complaintRepository from '../../../src/modules/complaints/complaint.repository.js';
import * as complaintService from '../../../src/modules/complaints/complaint.service.js';
import { SYSTEM_ROLES } from '../../../src/config/constants.js';

vi.mock('../../../src/middleware/auth.middleware.js', () => ({
  authenticate: (req, _res, next) => {
    if (req.headers['x-mock-unauthenticated'] === 'true') {
      return _res.status(401).json({ success: false, error: 'Authentication required' });
    }
    const role = req.headers['x-mock-role'] || SYSTEM_ROLES.SCHOOL_ADMIN;
    const schoolId = req.headers['x-mock-school-id'] || '11111111-1111-4111-8111-111111111111';
    const userId = req.headers['x-mock-user-id'] || 'user-123';
    req.auth = { userId, schoolId, systemRole: role, role };
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

describe('Complaint Routes RBAC & Security (CO.2-R2 Remediation)', () => {
  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
  const COMPLAINT_ID = '22222222-2222-4222-8222-222222222222';
  let app;

  beforeEach(() => {
    vi.restoreAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/v1/complaints', complaintRoutes);
  });

  // 1. GET /pending-count
  describe('1. GET /pending-count', () => {
    it('allows SCHOOL_ADMIN', async () => {
      vi.spyOn(complaintRepository, 'countPendingComplaints').mockResolvedValue(5);
      const res = await request(app)
        .get('/api/v1/complaints/pending-count')
        .set('x-mock-role', SYSTEM_ROLES.SCHOOL_ADMIN)
        .set('x-mock-school-id', SCHOOL_ID);
      expect(res.status).toBe(200);
      expect(res.body.data.count).toBe(5);
    });

    it('allows PRINCIPAL', async () => {
      vi.spyOn(complaintRepository, 'countPendingComplaints').mockResolvedValue(3);
      const res = await request(app)
        .get('/api/v1/complaints/pending-count')
        .set('x-mock-role', SYSTEM_ROLES.PRINCIPAL)
        .set('x-mock-school-id', SCHOOL_ID);
      expect(res.status).toBe(200);
    });

    it('allows SUPER_ADMIN via platform bypass', async () => {
      vi.spyOn(complaintRepository, 'countPendingComplaints').mockResolvedValue(0);
      const res = await request(app)
        .get('/api/v1/complaints/pending-count')
        .set('x-mock-role', SYSTEM_ROLES.SUPER_ADMIN)
        .set('x-mock-school-id', SCHOOL_ID);
      expect(res.status).toBe(200);
    });

    it('rejects TEACHER (403)', async () => {
      const res = await request(app)
        .get('/api/v1/complaints/pending-count')
        .set('x-mock-role', SYSTEM_ROLES.TEACHER)
        .set('x-mock-school-id', SCHOOL_ID);
      expect(res.status).toBe(403);
    });

    it('rejects STAFF (403)', async () => {
      const res = await request(app)
        .get('/api/v1/complaints/pending-count')
        .set('x-mock-role', SYSTEM_ROLES.STAFF)
        .set('x-mock-school-id', SCHOOL_ID);
      expect(res.status).toBe(403);
    });

    it('rejects PARENT (403)', async () => {
      const res = await request(app)
        .get('/api/v1/complaints/pending-count')
        .set('x-mock-role', SYSTEM_ROLES.PARENT)
        .set('x-mock-school-id', SCHOOL_ID);
      expect(res.status).toBe(403);
    });

    it('rejects STUDENT (403)', async () => {
      const res = await request(app)
        .get('/api/v1/complaints/pending-count')
        .set('x-mock-role', SYSTEM_ROLES.STUDENT)
        .set('x-mock-school-id', SCHOOL_ID);
      expect(res.status).toBe(403);
    });

    it('rejects unauthenticated request (401)', async () => {
      const res = await request(app)
        .get('/api/v1/complaints/pending-count')
        .set('x-mock-unauthenticated', 'true');
      expect(res.status).toBe(401);
    });
  });

  // 2. GET / (List complaints)
  describe('2. GET / (List complaints)', () => {
    it('allows SCHOOL_ADMIN', async () => {
      vi.spyOn(complaintService, 'listComplaints').mockResolvedValue({
        data: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 1 }
      });
      const res = await request(app)
        .get('/api/v1/complaints')
        .set('x-mock-role', SYSTEM_ROLES.SCHOOL_ADMIN)
        .set('x-mock-school-id', SCHOOL_ID);
      expect(res.status).toBe(200);
    });

    it('allows PRINCIPAL', async () => {
      vi.spyOn(complaintService, 'listComplaints').mockResolvedValue({
        data: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 1 }
      });
      const res = await request(app)
        .get('/api/v1/complaints')
        .set('x-mock-role', SYSTEM_ROLES.PRINCIPAL)
        .set('x-mock-school-id', SCHOOL_ID);
      expect(res.status).toBe(200);
    });

    it('allows SUPER_ADMIN', async () => {
      vi.spyOn(complaintService, 'listComplaints').mockResolvedValue({
        data: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 1 }
      });
      const res = await request(app)
        .get('/api/v1/complaints')
        .set('x-mock-role', SYSTEM_ROLES.SUPER_ADMIN)
        .set('x-mock-school-id', SCHOOL_ID);
      expect(res.status).toBe(200);
    });

    it('rejects TEACHER (403)', async () => {
      const res = await request(app)
        .get('/api/v1/complaints')
        .set('x-mock-role', SYSTEM_ROLES.TEACHER)
        .set('x-mock-school-id', SCHOOL_ID);
      expect(res.status).toBe(403);
    });

    it('rejects STAFF (403)', async () => {
      const res = await request(app)
        .get('/api/v1/complaints')
        .set('x-mock-role', SYSTEM_ROLES.STAFF)
        .set('x-mock-school-id', SCHOOL_ID);
      expect(res.status).toBe(403);
    });

    it('rejects PARENT (403)', async () => {
      const res = await request(app)
        .get('/api/v1/complaints')
        .set('x-mock-role', SYSTEM_ROLES.PARENT)
        .set('x-mock-school-id', SCHOOL_ID);
      expect(res.status).toBe(403);
    });

    it('rejects STUDENT (403)', async () => {
      const res = await request(app)
        .get('/api/v1/complaints')
        .set('x-mock-role', SYSTEM_ROLES.STUDENT)
        .set('x-mock-school-id', SCHOOL_ID);
      expect(res.status).toBe(403);
    });

    it('rejects unauthenticated request (401)', async () => {
      const res = await request(app)
        .get('/api/v1/complaints')
        .set('x-mock-unauthenticated', 'true');
      expect(res.status).toBe(401);
    });
  });

  // 3. GET /:id (Get detail)
  describe('3. GET /:id (Complaint detail)', () => {
    it('allows SCHOOL_ADMIN', async () => {
      vi.spyOn(complaintService, 'getComplaintById').mockResolvedValue({ id: COMPLAINT_ID, title: 'Issue' });
      const res = await request(app)
        .get(`/api/v1/complaints/${COMPLAINT_ID}`)
        .set('x-mock-role', SYSTEM_ROLES.SCHOOL_ADMIN)
        .set('x-mock-school-id', SCHOOL_ID);
      expect(res.status).toBe(200);
    });

    it('allows PRINCIPAL', async () => {
      vi.spyOn(complaintService, 'getComplaintById').mockResolvedValue({ id: COMPLAINT_ID, title: 'Issue' });
      const res = await request(app)
        .get(`/api/v1/complaints/${COMPLAINT_ID}`)
        .set('x-mock-role', SYSTEM_ROLES.PRINCIPAL)
        .set('x-mock-school-id', SCHOOL_ID);
      expect(res.status).toBe(200);
    });

    it('allows SUPER_ADMIN', async () => {
      vi.spyOn(complaintService, 'getComplaintById').mockResolvedValue({ id: COMPLAINT_ID, title: 'Issue' });
      const res = await request(app)
        .get(`/api/v1/complaints/${COMPLAINT_ID}`)
        .set('x-mock-role', SYSTEM_ROLES.SUPER_ADMIN)
        .set('x-mock-school-id', SCHOOL_ID);
      expect(res.status).toBe(200);
    });

    it('rejects TEACHER (403)', async () => {
      const res = await request(app)
        .get(`/api/v1/complaints/${COMPLAINT_ID}`)
        .set('x-mock-role', SYSTEM_ROLES.TEACHER)
        .set('x-mock-school-id', SCHOOL_ID);
      expect(res.status).toBe(403);
    });

    it('rejects STAFF (403)', async () => {
      const res = await request(app)
        .get(`/api/v1/complaints/${COMPLAINT_ID}`)
        .set('x-mock-role', SYSTEM_ROLES.STAFF)
        .set('x-mock-school-id', SCHOOL_ID);
      expect(res.status).toBe(403);
    });

    it('rejects PARENT (403)', async () => {
      const res = await request(app)
        .get(`/api/v1/complaints/${COMPLAINT_ID}`)
        .set('x-mock-role', SYSTEM_ROLES.PARENT)
        .set('x-mock-school-id', SCHOOL_ID);
      expect(res.status).toBe(403);
    });

    it('rejects STUDENT (403)', async () => {
      const res = await request(app)
        .get(`/api/v1/complaints/${COMPLAINT_ID}`)
        .set('x-mock-role', SYSTEM_ROLES.STUDENT)
        .set('x-mock-school-id', SCHOOL_ID);
      expect(res.status).toBe(403);
    });
  });

  // 4. POST / (Create complaint)
  describe('4. POST / (Create complaint)', () => {
    it('allows SCHOOL_ADMIN and ignores client spoofed schoolId and status', async () => {
      const createSpy = vi.spyOn(complaintService, 'createComplaint').mockResolvedValue({
        id: COMPLAINT_ID,
        schoolId: SCHOOL_ID,
        title: 'Broken desk',
        status: 'pending'
      });

      const res = await request(app)
        .post('/api/v1/complaints')
        .set('x-mock-role', SYSTEM_ROLES.SCHOOL_ADMIN)
        .set('x-mock-school-id', SCHOOL_ID)
        .set('x-mock-user-id', 'admin-123')
        .send({
          title: 'Broken desk',
          description: 'Desk leg is fractured',
          schoolId: 'spoofed-school-id',
          status: 'resolved',
          submittedByUserId: 'spoofed-user-id'
        });

      expect(res.status).toBe(201);
      expect(createSpy).toHaveBeenCalledWith(
        SCHOOL_ID,
        expect.objectContaining({ userId: 'admin-123' }),
        expect.objectContaining({ title: 'Broken desk', description: 'Desk leg is fractured' })
      );
    });

    it('allows PRINCIPAL', async () => {
      vi.spyOn(complaintService, 'createComplaint').mockResolvedValue({
        id: COMPLAINT_ID,
        title: 'Issue',
        status: 'pending'
      });

      const res = await request(app)
        .post('/api/v1/complaints')
        .set('x-mock-role', SYSTEM_ROLES.PRINCIPAL)
        .set('x-mock-school-id', SCHOOL_ID)
        .send({
          title: 'Issue',
          description: 'Description'
        });

      expect(res.status).toBe(201);
    });

    it('allows SUPER_ADMIN', async () => {
      vi.spyOn(complaintService, 'createComplaint').mockResolvedValue({
        id: COMPLAINT_ID,
        title: 'Issue',
        status: 'pending'
      });

      const res = await request(app)
        .post('/api/v1/complaints')
        .set('x-mock-role', SYSTEM_ROLES.SUPER_ADMIN)
        .set('x-mock-school-id', SCHOOL_ID)
        .send({
          title: 'Issue',
          description: 'Description'
        });

      expect(res.status).toBe(201);
    });

    it('rejects TEACHER (403)', async () => {
      const res = await request(app)
        .post('/api/v1/complaints')
        .set('x-mock-role', SYSTEM_ROLES.TEACHER)
        .set('x-mock-school-id', SCHOOL_ID)
        .send({ title: 'Issue', description: 'Desc' });
      expect(res.status).toBe(403);
    });

    it('rejects STAFF (403)', async () => {
      const res = await request(app)
        .post('/api/v1/complaints')
        .set('x-mock-role', SYSTEM_ROLES.STAFF)
        .set('x-mock-school-id', SCHOOL_ID)
        .send({ title: 'Issue', description: 'Desc' });
      expect(res.status).toBe(403);
    });

    it('rejects PARENT (403)', async () => {
      const res = await request(app)
        .post('/api/v1/complaints')
        .set('x-mock-role', SYSTEM_ROLES.PARENT)
        .set('x-mock-school-id', SCHOOL_ID)
        .send({ title: 'Issue', description: 'Desc' });
      expect(res.status).toBe(403);
    });

    it('rejects STUDENT (403)', async () => {
      const res = await request(app)
        .post('/api/v1/complaints')
        .set('x-mock-role', SYSTEM_ROLES.STUDENT)
        .set('x-mock-school-id', SCHOOL_ID)
        .send({ title: 'Issue', description: 'Desc' });
      expect(res.status).toBe(403);
    });
  });

  // 5. PATCH /:id/status (Resolve / Reject)
  describe('5. PATCH /:id/status (Resolve / Reject)', () => {
    it('allows SCHOOL_ADMIN to resolve a complaint', async () => {
      vi.spyOn(complaintService, 'updateComplaintStatus').mockResolvedValue({
        id: COMPLAINT_ID,
        status: 'resolved',
        resolutionNotes: 'Fixed'
      });

      const res = await request(app)
        .patch(`/api/v1/complaints/${COMPLAINT_ID}/status`)
        .set('x-mock-role', SYSTEM_ROLES.SCHOOL_ADMIN)
        .set('x-mock-school-id', SCHOOL_ID)
        .send({
          status: 'resolved',
          resolutionNotes: 'Fixed'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('allows PRINCIPAL to resolve a complaint', async () => {
      vi.spyOn(complaintService, 'updateComplaintStatus').mockResolvedValue({
        id: COMPLAINT_ID,
        status: 'resolved',
        resolutionNotes: 'Fixed'
      });

      const res = await request(app)
        .patch(`/api/v1/complaints/${COMPLAINT_ID}/status`)
        .set('x-mock-role', SYSTEM_ROLES.PRINCIPAL)
        .set('x-mock-school-id', SCHOOL_ID)
        .send({
          status: 'resolved',
          resolutionNotes: 'Fixed'
        });

      expect(res.status).toBe(200);
    });

    it('allows SUPER_ADMIN to resolve a complaint', async () => {
      vi.spyOn(complaintService, 'updateComplaintStatus').mockResolvedValue({
        id: COMPLAINT_ID,
        status: 'resolved',
        resolutionNotes: 'Fixed'
      });

      const res = await request(app)
        .patch(`/api/v1/complaints/${COMPLAINT_ID}/status`)
        .set('x-mock-role', SYSTEM_ROLES.SUPER_ADMIN)
        .set('x-mock-school-id', SCHOOL_ID)
        .send({
          status: 'resolved',
          resolutionNotes: 'Fixed'
        });

      expect(res.status).toBe(200);
    });

    it('rejects TEACHER (403)', async () => {
      const res = await request(app)
        .patch(`/api/v1/complaints/${COMPLAINT_ID}/status`)
        .set('x-mock-role', SYSTEM_ROLES.TEACHER)
        .set('x-mock-school-id', SCHOOL_ID)
        .send({ status: 'resolved' });
      expect(res.status).toBe(403);
    });

    it('rejects STAFF (403)', async () => {
      const res = await request(app)
        .patch(`/api/v1/complaints/${COMPLAINT_ID}/status`)
        .set('x-mock-role', SYSTEM_ROLES.STAFF)
        .set('x-mock-school-id', SCHOOL_ID)
        .send({ status: 'resolved' });
      expect(res.status).toBe(403);
    });

    it('rejects PARENT (403)', async () => {
      const res = await request(app)
        .patch(`/api/v1/complaints/${COMPLAINT_ID}/status`)
        .set('x-mock-role', SYSTEM_ROLES.PARENT)
        .set('x-mock-school-id', SCHOOL_ID)
        .send({ status: 'resolved' });
      expect(res.status).toBe(403);
    });

    it('rejects STUDENT (403)', async () => {
      const res = await request(app)
        .patch(`/api/v1/complaints/${COMPLAINT_ID}/status`)
        .set('x-mock-role', SYSTEM_ROLES.STUDENT)
        .set('x-mock-school-id', SCHOOL_ID)
        .send({ status: 'resolved' });
      expect(res.status).toBe(403);
    });
  });
});
