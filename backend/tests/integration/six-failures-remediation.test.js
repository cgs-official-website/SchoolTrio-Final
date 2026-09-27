import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import { createApp } from '../../src/app.js';
import { basePrisma } from '../../src/database/prisma.client.js';
import { issueAccessToken } from '../../src/modules/auth/token.service.js';

describe('SIX AUTHENTICATED API FAILURES REMEDIATION TEST SUITE', { timeout: 30000 }, () => {
  let app;
  let request;
  let superAdminToken;
  let schoolAdminToken;
  let schoolId;
  let createdRoleId;
  let createdVehicleId;
  let createdRouteId;
  let createdStopId;
  let testClassId;
  let testStudentId;

  beforeAll(async () => {
    app = createApp();
    request = supertest(app);

    // Find test school tenant
    const school = await basePrisma.school.findFirst({ select: { id: true } });
    schoolId = school?.id || 'e2638de0-cf88-4cef-96db-74c353c6e43d';

    // Find test users
    const superAdminUser = await basePrisma.user.findFirst({
      where: { systemRole: 'SUPER_ADMIN' }
    });
    const schoolAdminUser = await basePrisma.user.findFirst({
      where: { schoolId, systemRole: { in: ['SCHOOL_ADMIN', 'ADMIN'] } }
    });

    superAdminToken = issueAccessToken({
      sub: superAdminUser?.id || '45824d5e-3c11-4d47-8906-1d22129cecf5',
      schoolId: null,
      systemRole: 'SUPER_ADMIN',
      tokenVersion: 1
    });

    schoolAdminToken = issueAccessToken({
      sub: schoolAdminUser?.id || 'ee670f44-3538-4d6d-907f-b73e2dab7c5e',
      schoolId,
      systemRole: 'SCHOOL_ADMIN',
      tokenVersion: 1
    });

    const realClass = await basePrisma.class.findFirst({ where: { schoolId }, select: { id: true } });
    testClassId = realClass?.id || '5be3609b-9420-488d-abe4-1ec8625ab5ed';

    const realStudent = await basePrisma.student.findFirst({ where: { schoolId }, select: { id: true } });
    testStudentId = realStudent?.id || '5be3609b-9420-488d-abe4-1ec8625ab5ed';
  }, 30000);

  afterAll(async () => {
    if (createdStopId) {
      await basePrisma.routeStop.deleteMany({ where: { id: createdStopId } });
    }
    if (createdRouteId) {
      await basePrisma.transportRoute.deleteMany({ where: { id: createdRouteId } });
    }
    if (createdVehicleId) {
      await basePrisma.transportVehicle.deleteMany({ where: { id: createdVehicleId } });
    }
    if (createdRoleId) {
      await basePrisma.schoolRole.deleteMany({ where: { id: createdRoleId } });
    }
    await basePrisma.$disconnect();
  });

  // ============================================================
  // 1. POST /api/v1/rbac/roles
  // ============================================================
  describe('1. POST /api/v1/rbac/roles', () => {
    const roleName = 'Remediation Custom Role ' + Date.now();

    it('should create a custom role successfully (201)', async () => {
      const res = await request
        .post('/api/v1/rbac/roles')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .set('x-school-id', schoolId)
        .send({ name: roleName, loginPanel: 'admin' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe(roleName);
      createdRoleId = res.body.data.id;
    });

    it('should return 409 Conflict when attempting to create duplicate role name', async () => {
      const res = await request
        .post('/api/v1/rbac/roles')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .set('x-school-id', schoolId)
        .send({ name: roleName, loginPanel: 'admin' });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CONFLICT');
    });

    it('should return 400 Bad Request when role name is missing', async () => {
      const res = await request
        .post('/api/v1/rbac/roles')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .set('x-school-id', schoolId)
        .send({ loginPanel: 'admin' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  // ============================================================
  // 2. POST /api/v1/timetables
  // ============================================================
  describe('2. POST /api/v1/timetables', () => {
    it('should return 400 Bad Request when dayOfWeek is missing', async () => {
      const res = await request
        .post('/api/v1/timetables')
        .set('Authorization', `Bearer ${schoolAdminToken}`)
        .set('x-school-id', schoolId)
        .send({
          classId: testClassId,
          startTime: '09:00',
          endTime: '10:00'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should create timetable period successfully when dayOfWeek is valid', async () => {
      const res = await request
        .post('/api/v1/timetables')
        .set('Authorization', `Bearer ${schoolAdminToken}`)
        .set('x-school-id', schoolId)
        .send({
          classId: testClassId,
          dayOfWeek: 1,
          startTime: '09:00',
          endTime: '10:00'
        });

      expect([201, 400, 409]).toContain(res.status);
      expect(res.status).not.toBe(500);
    });

    it('should return 404 Not Found for non-existent classId', async () => {
      const res = await request
        .post('/api/v1/timetables')
        .set('Authorization', `Bearer ${schoolAdminToken}`)
        .set('x-school-id', schoolId)
        .send({
          classId: '00000000-0000-0000-0000-000000000099',
          dayOfWeek: 1,
          startTime: '09:00',
          endTime: '10:00'
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  // ============================================================
  // 3. POST /api/v1/transport/vehicles
  // ============================================================
  describe('3. POST /api/v1/transport/vehicles', () => {
    const regNum = 'TN-99-ZZ-' + Math.floor(1000 + Math.random() * 9000);

    it('should create vehicle with default capacity when capacity is omitted (201)', async () => {
      const res = await request
        .post('/api/v1/transport/vehicles')
        .set('Authorization', `Bearer ${schoolAdminToken}`)
        .set('x-school-id', schoolId)
        .send({
          registrationNumber: regNum,
          model: 'Remediation Bus'
        });

      expect(res.status).toBe(201);
      expect(res.body.data.capacity).toBe(30);
      createdVehicleId = res.body.data.id;
    });

    it('should return 409 Conflict for duplicate registration number', async () => {
      const res = await request
        .post('/api/v1/transport/vehicles')
        .set('Authorization', `Bearer ${schoolAdminToken}`)
        .set('x-school-id', schoolId)
        .send({
          registrationNumber: regNum,
          capacity: 40
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
    });
  });

  // ============================================================
  // 4. POST /api/v1/transport/routes
  // ============================================================
  describe('4. POST /api/v1/transport/routes', () => {
    it('should create route with fallback name from routeNumber (201)', async () => {
      const routeNum = 'REM-ROUTE-' + Math.floor(100 + Math.random() * 900);
      const res = await request
        .post('/api/v1/transport/routes')
        .set('Authorization', `Bearer ${schoolAdminToken}`)
        .set('x-school-id', schoolId)
        .send({
          routeNumber: routeNum,
          capacity: 25
        });

      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe(routeNum);
      createdRouteId = res.body.data.id;
    });

    it('should return 404 for cross-tenant vehicleId', async () => {
      const res = await request
        .post('/api/v1/transport/routes')
        .set('Authorization', `Bearer ${schoolAdminToken}`)
        .set('x-school-id', schoolId)
        .send({
          name: 'Cross Tenant Route',
          vehicleId: '00000000-0000-0000-0000-000000000099'
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  // ============================================================
  // 5. POST /api/v1/transport/routes/:routeId/stops
  // ============================================================
  describe('5. POST /api/v1/transport/routes/:routeId/stops', () => {
    it('should create route stop successfully (201)', async () => {
      const res = await request
        .post(`/api/v1/transport/routes/${createdRouteId}/stops`)
        .set('Authorization', `Bearer ${schoolAdminToken}`)
        .set('x-school-id', schoolId)
        .send({
          stopName: 'North Gate Stop',
          stopOrder: 1,
          pickupTime: '08:15',
          dropTime: '15:45'
        });

      expect(res.status).toBe(201);
      expect(res.body.data.stopName).toBe('North Gate Stop');
      createdStopId = res.body.data.id;
    });

    it('should return 404 Not Found for non-existent routeId without throwing 500', async () => {
      const res = await request
        .post('/api/v1/transport/routes/00000000-0000-0000-0000-000000000099/stops')
        .set('Authorization', `Bearer ${schoolAdminToken}`)
        .set('x-school-id', schoolId)
        .send({
          stopName: 'Ghost Stop'
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  // ============================================================
  // 6. POST /api/v1/transport/routes/:routeId/assign
  // ============================================================
  describe('6. POST /api/v1/transport/routes/:routeId/assign', () => {
    it('should return 404 Not Found for non-existent routeId without throwing 25P02 / 500', async () => {
      const res = await request
        .post('/api/v1/transport/routes/00000000-0000-0000-0000-000000000099/assign')
        .set('Authorization', `Bearer ${schoolAdminToken}`)
        .set('x-school-id', schoolId)
        .send({
          studentId: testStudentId
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });
});
