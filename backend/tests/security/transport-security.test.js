import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import * as transportService from '../../src/modules/transport/transport.service.js';
import * as authRepository from '../../src/modules/auth/auth.repository.js';
import * as tokenService from '../../src/modules/auth/token.service.js';
import { SYSTEM_ROLES } from '../../src/config/constants.js';
import { NotFoundError, ConflictError } from '../../src/utils/app-error.js';

describe('Security & RBAC: Transport & Vehicle Fleet Domain (Phase TR.2)', () => {
  const app = createApp();

  const TENANT_A = '11111111-1111-4111-8111-111111111111';

  const ADMIN_USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const TEACHER_USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const PARENT_USER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const STUDENT_USER_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

  const VEHICLE_ID = '12121212-1212-4212-8212-121212121212';
  const ROUTE_ID = '34343434-3434-4434-8434-343434343434';
  const STUDENT_ID = '78787878-7878-4787-8787-787878787878';

  const adminUser = {
    id: ADMIN_USER_ID,
    schoolId: TENANT_A,
    email: 'admin@school-a.com',
    systemRole: SYSTEM_ROLES.SCHOOL_ADMIN,
    tokenVersion: 1,
    isActive: true,
    school: { id: TENANT_A, name: 'School A', code: 'SchoolA', status: 'active' }
  };

  const teacherUser = {
    id: TEACHER_USER_ID,
    schoolId: TENANT_A,
    email: 'teacher@school-a.com',
    systemRole: SYSTEM_ROLES.TEACHER,
    tokenVersion: 1,
    isActive: true,
    school: { id: TENANT_A, name: 'School A', code: 'SchoolA', status: 'active' }
  };

  const parentUser = {
    id: PARENT_USER_ID,
    schoolId: TENANT_A,
    email: 'parent@school-a.com',
    systemRole: SYSTEM_ROLES.PARENT,
    tokenVersion: 1,
    isActive: true,
    school: { id: TENANT_A, name: 'School A', code: 'SchoolA', status: 'active' }
  };

  const studentUser = {
    id: STUDENT_USER_ID,
    schoolId: TENANT_A,
    email: 'student@school-a.com',
    systemRole: SYSTEM_ROLES.STUDENT,
    tokenVersion: 1,
    isActive: true,
    school: { id: TENANT_A, name: 'School A', code: 'SchoolA', status: 'active' }
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const getAuthToken = (user, overrides = {}) => {
    return tokenService.issueAccessToken({
      sub: user.id,
      schoolId: user.schoolId,
      systemRole: user.systemRole,
      tokenVersion: user.tokenVersion,
      ...overrides
    });
  };

  describe('1. Unauthenticated Requests', () => {
    it('rejects unauthenticated GET /api/v1/transport/vehicles with 401', async () => {
      const res = await request(app).get('/api/v1/transport/vehicles');
      expect(res.status).toBe(401);
    });

    it('rejects unauthenticated GET /api/v1/transport/routes with 401', async () => {
      const res = await request(app).get('/api/v1/transport/routes');
      expect(res.status).toBe(401);
    });
  });

  describe('2. Vehicle RBAC & Mutations', () => {
    it('allows ADMIN to create a vehicle', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminUser);
      vi.spyOn(transportService, 'createVehicle').mockResolvedValue({
        id: VEHICLE_ID,
        registrationNumber: 'TN 56 K 1146',
        capacity: 32
      });

      const token = getAuthToken(adminUser);
      const res = await request(app)
        .post('/api/v1/transport/vehicles')
        .set('Authorization', `Bearer ${token}`)
        .send({
          registrationNumber: 'TN 56 K 1146',
          capacity: 32
        });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBe(VEHICLE_ID);
    });

    it('rejects TEACHER from creating a vehicle with 403', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(teacherUser);

      const token = getAuthToken(teacherUser);
      const res = await request(app)
        .post('/api/v1/transport/vehicles')
        .set('Authorization', `Bearer ${token}`)
        .send({
          registrationNumber: 'TN 56 K 1146',
          capacity: 32
        });

      expect(res.status).toBe(403);
    });

    it('rejects PARENT from creating a vehicle with 403', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(parentUser);

      const token = getAuthToken(parentUser);
      const res = await request(app)
        .post('/api/v1/transport/vehicles')
        .set('Authorization', `Bearer ${token}`)
        .send({
          registrationNumber: 'TN 56 K 1146',
          capacity: 32
        });

      expect(res.status).toBe(403);
    });
  });

  describe('3. Route RBAC & Mutations', () => {
    it('allows ADMIN to create a route', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminUser);
      vi.spyOn(transportService, 'createRoute').mockResolvedValue({
        id: ROUTE_ID,
        name: 'Route 4 - Erode North',
        capacity: 30
      });

      const token = getAuthToken(adminUser);
      const res = await request(app)
        .post('/api/v1/transport/routes')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Route 4 - Erode North',
          capacity: 30
        });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBe(ROUTE_ID);
    });

    it('rejects STUDENT from creating a route with 403', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(studentUser);

      const token = getAuthToken(studentUser);
      const res = await request(app)
        .post('/api/v1/transport/routes')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Route 4 - Erode North',
          capacity: 30
        });

      expect(res.status).toBe(403);
    });
  });

  describe('4. Student Assignment & Capacity Enforcement', () => {
    it('allows ADMIN to assign a student to a route', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminUser);
      vi.spyOn(transportService, 'assignStudentToRoute').mockResolvedValue({
        id: STUDENT_ID,
        transportRouteId: ROUTE_ID
      });

      const token = getAuthToken(adminUser);
      const res = await request(app)
        .post(`/api/v1/transport/routes/${ROUTE_ID}/assign`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          studentId: STUDENT_ID
        });

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(STUDENT_ID);
    });

    it('returns 409 Conflict when route capacity is exceeded', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminUser);
      vi.spyOn(transportService, 'assignStudentToRoute').mockRejectedValue(
        new ConflictError('Cannot assign student: route has reached maximum capacity')
      );

      const token = getAuthToken(adminUser);
      const res = await request(app)
        .post(`/api/v1/transport/routes/${ROUTE_ID}/assign`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          studentId: STUDENT_ID
        });

      expect(res.status).toBe(409);
    });

    it('rejects TEACHER and PARENT from modifying assignments with 403', async () => {
      vi.spyOn(authRepository, 'findUserById').mockImplementation(async (id) => {
        if (id === TEACHER_USER_ID) return teacherUser;
        if (id === PARENT_USER_ID) return parentUser;
        return null;
      });

      const teacherToken = getAuthToken(teacherUser);
      const teacherRes = await request(app)
        .post(`/api/v1/transport/routes/${ROUTE_ID}/assign`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({ studentId: STUDENT_ID });
      expect(teacherRes.status).toBe(403);

      const parentToken = getAuthToken(parentUser);
      const parentRes = await request(app)
        .post(`/api/v1/transport/routes/${ROUTE_ID}/assign`)
        .set('Authorization', `Bearer ${parentToken}`)
        .send({ studentId: STUDENT_ID });
      expect(parentRes.status).toBe(403);
    });
  });

  describe('5. Tenant Isolation & Cross-Tenant Safety', () => {
    it('returns 404 when querying a non-existent or foreign tenant vehicle', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminUser);
      vi.spyOn(transportService, 'getVehicleById').mockRejectedValue(
        new NotFoundError('Vehicle not found in active school')
      );

      const token = getAuthToken(adminUser);
      const res = await request(app)
        .get(`/api/v1/transport/vehicles/${VEHICLE_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });

    it('returns 404 when querying a non-existent or foreign tenant route', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminUser);
      vi.spyOn(transportService, 'getRouteById').mockRejectedValue(
        new NotFoundError('Route not found in active school')
      );

      const token = getAuthToken(adminUser);
      const res = await request(app)
        .get(`/api/v1/transport/routes/${ROUTE_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });
  });
});
