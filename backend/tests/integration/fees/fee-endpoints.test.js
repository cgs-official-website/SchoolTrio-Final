import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/app.js';
import * as feeService from '../../../src/modules/fees/fee.service.js';
import * as authRepository from '../../../src/modules/auth/auth.repository.js';
import * as tokenService from '../../../src/modules/auth/token.service.js';
import { SYSTEM_ROLES } from '../../../src/config/constants.js';
import { NotFoundError, RelationshipConflictError } from '../../../src/utils/app-error.js';

describe('Integration: Fee Collection Periods & Fee Structures Endpoints — Phase 4C.6-A', () => {
  const app = createApp();
  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
  const CLASS_ID = '22222222-2222-4222-8222-222222222222';
  const PERIOD_ID = '33333333-3333-4333-8333-333333333333';
  const FEE_STRUCTURE_ID = '44444444-4444-4444-8444-444444444444';

  const ADMIN_USER_ID = '77777777-7777-4777-8777-777777777777';
  const TEACHER_USER_ID = '88888888-8888-4888-8888-888888888888';

  const mockAdminUser = {
    id: ADMIN_USER_ID,
    schoolId: SCHOOL_ID,
    email: 'admin@school.edu',
    systemRole: SYSTEM_ROLES.SCHOOL_ADMIN,
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_ID, name: 'Spring Mount', code: 'SchoolS024', status: 'active' }
  };

  const mockTeacherUser = {
    id: TEACHER_USER_ID,
    schoolId: SCHOOL_ID,
    email: 'teacher@school.edu',
    systemRole: SYSTEM_ROLES.TEACHER,
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_ID, name: 'Spring Mount', code: 'SchoolS024', status: 'active' }
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const getAuthToken = (user = mockAdminUser) => {
    return tokenService.issueAccessToken({
      sub: user.id,
      schoolId: user.schoolId,
      systemRole: user.systemRole,
      tokenVersion: user.tokenVersion
    });
  };

  // ============================================================
  // 1. Fee Collection Period Endpoints
  // ============================================================
  describe('Fee Collection Periods API (/api/v1/fee-collection-periods)', () => {
    it('GET / -> returns paginated fee collection periods', async () => {
      const mockPeriods = [{ id: PERIOD_ID, name: 'Term 1 2026', dueDate: '2026-10-15', displayOrder: 1 }];
      const mockPagination = { total: 1, page: 1, limit: 20, totalPages: 1, hasNextPage: false, hasPrevPage: false };

      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(feeService, 'listCollectionPeriods').mockResolvedValue({ periods: mockPeriods, pagination: mockPagination });

      const token = getAuthToken();
      const res = await request(app)
        .get('/api/v1/fee-collection-periods')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockPeriods);
      expect(res.body.pagination).toBeDefined();
    });

    it('GET /:id -> returns single collection period by ID', async () => {
      const mockPeriod = { id: PERIOD_ID, name: 'Term 1 2026', dueDate: '2026-10-15', displayOrder: 1 };
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(feeService, 'getCollectionPeriodById').mockResolvedValue(mockPeriod);

      const token = getAuthToken();
      const res = await request(app)
        .get(`/api/v1/fee-collection-periods/${PERIOD_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockPeriod);
    });

    it('GET /:id -> returns 404 when period does not exist', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(feeService, 'getCollectionPeriodById').mockRejectedValue(new NotFoundError('Fee collection period'));

      const token = getAuthToken();
      const res = await request(app)
        .get(`/api/v1/fee-collection-periods/${PERIOD_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('POST / -> creates new collection period and returns 201', async () => {
      const payload = { name: 'Term 1 2026', dueDate: '2026-10-15', displayOrder: 1 };
      const created = { id: PERIOD_ID, schoolId: SCHOOL_ID, ...payload };

      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(feeService, 'createCollectionPeriod').mockResolvedValue(created);

      const token = getAuthToken();
      const res = await request(app)
        .post('/api/v1/fee-collection-periods')
        .set('Authorization', `Bearer ${token}`)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(created);
    });

    it('POST / -> rejects invalid payload with 400', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);

      const token = getAuthToken();
      const res = await request(app)
        .post('/api/v1/fee-collection-periods')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '', dueDate: 'invalid-date' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('PATCH /:id -> updates collection period and returns 200', async () => {
      const updated = { id: PERIOD_ID, name: 'Term 1 Renamed', dueDate: '2026-10-20', displayOrder: 1 };
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(feeService, 'updateCollectionPeriod').mockResolvedValue(updated);

      const token = getAuthToken();
      const res = await request(app)
        .patch(`/api/v1/fee-collection-periods/${PERIOD_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Term 1 Renamed', dueDate: '2026-10-20' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(updated);
    });

    it('DELETE /:id -> deletes collection period and returns 200', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(feeService, 'deleteCollectionPeriod').mockResolvedValue({ id: PERIOD_ID, deleted: true });

      const token = getAuthToken();
      const res = await request(app)
        .delete(`/api/v1/fee-collection-periods/${PERIOD_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.deleted).toBe(true);
    });

    it('DELETE /:id -> returns 409 when period is referenced by fee structures or invoices', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(feeService, 'deleteCollectionPeriod').mockRejectedValue(
        new RelationshipConflictError('Cannot delete fee collection period because it is referenced by existing fee structures or invoices')
      );

      const token = getAuthToken();
      const res = await request(app)
        .delete(`/api/v1/fee-collection-periods/${PERIOD_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
    });
  });

  // ============================================================
  // 2. Fee Structure Endpoints
  // ============================================================
  describe('Fee Structures API (/api/v1/fee-structures)', () => {
    it('GET / -> returns paginated fee structures with relations', async () => {
      const mockStructures = [{
        id: FEE_STRUCTURE_ID,
        name: 'Tuition Fee Grade 10',
        amount: 50000,
        dueDate: '2026-10-15',
        class: { id: CLASS_ID, name: 'Grade 10' },
        collectionPeriod: { id: PERIOD_ID, name: 'Term 1' },
        _count: { invoices: 25 }
      }];
      const mockPagination = { total: 1, page: 1, limit: 20, totalPages: 1, hasNextPage: false, hasPrevPage: false };

      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(feeService, 'listFeeStructures').mockResolvedValue({ feeStructures: mockStructures, pagination: mockPagination });

      const token = getAuthToken();
      const res = await request(app)
        .get('/api/v1/fee-structures')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockStructures);
    });

    it('GET /:id -> returns single fee structure by ID', async () => {
      const mockStructure = {
        id: FEE_STRUCTURE_ID,
        name: 'Tuition Fee Grade 10',
        amount: 50000,
        dueDate: '2026-10-15',
        class: { id: CLASS_ID, name: 'Grade 10' }
      };

      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(feeService, 'getFeeStructureById').mockResolvedValue(mockStructure);

      const token = getAuthToken();
      const res = await request(app)
        .get(`/api/v1/fee-structures/${FEE_STRUCTURE_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockStructure);
    });

    it('POST / -> creates fee structure and automatically generates invoices, returning 201', async () => {
      const payload = {
        name: 'Tuition Fee Grade 10',
        amount: 50000,
        dueDate: '2026-10-15',
        classId: CLASS_ID,
        collectionPeriodId: PERIOD_ID
      };
      const created = { id: FEE_STRUCTURE_ID, schoolId: SCHOOL_ID, ...payload, invoicesGenerated: 30 };

      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(feeService, 'createFeeStructure').mockResolvedValue(created);

      const token = getAuthToken();
      const res = await request(app)
        .post('/api/v1/fee-structures')
        .set('Authorization', `Bearer ${token}`)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.invoicesGenerated).toBe(30);
    });

    it('PATCH /:id -> updates fee structure template and returns 200', async () => {
      const updated = { id: FEE_STRUCTURE_ID, amount: 55000, dueDate: '2026-11-01' };
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(feeService, 'updateFeeStructure').mockResolvedValue(updated);

      const token = getAuthToken();
      const res = await request(app)
        .patch(`/api/v1/fee-structures/${FEE_STRUCTURE_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 55000, dueDate: '2026-11-01' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(updated);
    });

    it('DELETE /:id -> deletes fee structure and returns 200', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(feeService, 'deleteFeeStructure').mockResolvedValue({ id: FEE_STRUCTURE_ID, deleted: true });

      const token = getAuthToken();
      const res = await request(app)
        .delete(`/api/v1/fee-structures/${FEE_STRUCTURE_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.deleted).toBe(true);
    });

    it('rejects unauthenticated request with 401', async () => {
      const res = await request(app).get('/api/v1/fee-structures');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('rejects unauthorized user without fee permission with 403 Forbidden', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockTeacherUser);

      const token = getAuthToken(mockTeacherUser);
      const res = await request(app)
        .post('/api/v1/fee-structures')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Tuition Fee',
          amount: 5000,
          dueDate: '2026-10-15',
          classId: CLASS_ID
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });
});
