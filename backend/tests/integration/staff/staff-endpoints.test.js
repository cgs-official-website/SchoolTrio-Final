import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/app.js';
import * as staffService from '../../../src/modules/staff/staff.service.js';
import * as authRepository from '../../../src/modules/auth/auth.repository.js';
import * as tokenService from '../../../src/modules/auth/token.service.js';
import { SYSTEM_ROLES } from '../../../src/config/constants.js';
import { ConflictError, NotFoundError } from '../../../src/utils/app-error.js';

describe('Integration: Staff Endpoints — Phase 4C.4', () => {
  const app = createApp();
  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
  const STAFF_ID = '22222222-2222-4222-8222-222222222222';
  const CLASS_ID = '33333333-3333-4333-8333-333333333333';
  const USER_ID = '44444444-4444-4444-8444-444444444444';

  const mockAdminUser = {
    id: 'admin-1',
    schoolId: SCHOOL_ID,
    email: 'admin@school.edu',
    systemRole: SYSTEM_ROLES.SCHOOL_ADMIN,
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_ID, name: 'Spring Mount', code: 'SchoolS024', status: 'active' }
  };

  const mockStaffUser = {
    id: USER_ID,
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

  describe('1. GET /api/v1/staff', () => {
    it('returns paginated list of staff members', async () => {
      const mockStaffList = [{ id: STAFF_ID, name: 'Robert Doe', email: 'robert@school.edu', schoolId: SCHOOL_ID }];
      const mockPagination = { total: 1, page: 1, limit: 20, totalPages: 1 };

      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(staffService, 'listStaff').mockResolvedValue({ staff: mockStaffList, pagination: mockPagination });

      const token = getAuthToken();
      const res = await request(app)
        .get('/api/v1/staff')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockStaffList);
      expect(res.body.pagination).toBeDefined();
    });

    it('rejects unauthenticated request with 401', async () => {
      const res = await request(app).get('/api/v1/staff');
      expect(res.status).toBe(401);
    });
  });

  describe('2. GET /api/v1/staff/:id', () => {
    it('returns single staff member by ID', async () => {
      const mockStaffObj = { id: STAFF_ID, name: 'Robert Doe', email: 'robert@school.edu', schoolId: SCHOOL_ID };

      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(staffService, 'getStaffById').mockResolvedValue(mockStaffObj);

      const token = getAuthToken();
      const res = await request(app)
        .get(`/api/v1/staff/${STAFF_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(STAFF_ID);
    });

    it('returns 404 when staff member does not exist', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(staffService, 'getStaffById').mockRejectedValue(new NotFoundError('Staff profile'));

      const token = getAuthToken();
      const res = await request(app)
        .get(`/api/v1/staff/${STAFF_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('3. POST /api/v1/staff', () => {
    it('creates new staff member with 201', async () => {
      const payload = {
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane.doe@school.edu',
        phone: '9876543210',
        employeeId: 'EMP-002',
        staffType: 'teaching'
      };
      const createdObj = { id: 'new-id', name: 'Jane Doe', email: 'jane.doe@school.edu' };

      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(staffService, 'createStaff').mockResolvedValue(createdObj);

      const token = getAuthToken();
      const res = await request(app)
        .post('/api/v1/staff')
        .set('Authorization', `Bearer ${token}`)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Jane Doe');
    });

    it('returns 400 when required fields are missing', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);

      const token = getAuthToken();
      const res = await request(app)
        .post('/api/v1/staff')
        .set('Authorization', `Bearer ${token}`)
        .send({ phone: '9876543210' }); // missing firstName and email

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('returns 409 when email or employeeId conflicts', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(staffService, 'createStaff').mockRejectedValue(new ConflictError('Email address is already registered'));

      const token = getAuthToken();
      const res = await request(app)
        .post('/api/v1/staff')
        .set('Authorization', `Bearer ${token}`)
        .send({ firstName: 'Jane', email: 'duplicate@school.edu' });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
    });
  });

  describe('4. PATCH /api/v1/staff/:id', () => {
    it('updates staff member profile successfully', async () => {
      const updatedObj = { id: STAFF_ID, name: 'Robert J. Doe' };

      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(staffService, 'updateStaff').mockResolvedValue(updatedObj);

      const token = getAuthToken();
      const res = await request(app)
        .patch(`/api/v1/staff/${STAFF_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ firstName: 'Robert J.' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Robert J. Doe');
    });
  });

  describe('5. PATCH /api/v1/staff/:id/assignment', () => {
    it('updates class and subject assignments', async () => {
      const updatedObj = { id: STAFF_ID, assignedClassId: CLASS_ID };

      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(staffService, 'assignStaff').mockResolvedValue(updatedObj);

      const token = getAuthToken();
      const res = await request(app)
        .patch(`/api/v1/staff/${STAFF_ID}/assignment`)
        .set('Authorization', `Bearer ${token}`)
        .send({ assignedClassId: CLASS_ID });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.assignedClassId).toBe(CLASS_ID);
    });
  });

  describe('6. DELETE /api/v1/staff/:id', () => {
    it('deletes staff member with 200 OK', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(staffService, 'deleteStaff').mockResolvedValue(null);

      const token = getAuthToken();
      const res = await request(app)
        .delete(`/api/v1/staff/${STAFF_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('deleted');
    });

    it('returns 409 when historical dependencies prevent deletion', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockAdminUser);
      vi.spyOn(staffService, 'deleteStaff').mockRejectedValue(
        new ConflictError('Cannot delete staff member with existing activity history')
      );

      const token = getAuthToken();
      const res = await request(app)
        .delete(`/api/v1/staff/${STAFF_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
    });
  });

  describe('7. GET /api/v1/staff/me', () => {
    it('returns logged-in staff member own profile', async () => {
      const mockSelf = { id: STAFF_ID, name: 'Robert Doe', email: 'teacher@school.edu', baseSalary: 50000 };

      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockStaffUser);
      vi.spyOn(staffService, 'getStaffMe').mockResolvedValue(mockSelf);

      const token = getAuthToken(mockStaffUser);
      const res = await request(app)
        .get('/api/v1/staff/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(STAFF_ID);
      expect(res.body.data.baseSalary).toBe(50000);
    });
  });

  describe('8. PATCH /api/v1/staff/me', () => {
    it('updates logged-in staff member own profile fields', async () => {
      const updatedSelf = { id: STAFF_ID, name: 'Robert Doe', phone: '9999999999' };

      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockStaffUser);
      vi.spyOn(staffService, 'updateStaffSelf').mockResolvedValue(updatedSelf);

      const token = getAuthToken(mockStaffUser);
      const res = await request(app)
        .patch('/api/v1/staff/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ phone: '9999999999' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.phone).toBe('9999999999');
    });
  });
});
