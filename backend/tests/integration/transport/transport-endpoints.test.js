import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/app.js';
import * as transportService from '../../../src/modules/transport/transport.service.js';
import * as authRepository from '../../../src/modules/auth/auth.repository.js';
import * as tokenService from '../../../src/modules/auth/token.service.js';
import { SYSTEM_ROLES } from '../../../src/config/constants.js';

describe('Transport & Vehicle Fleet Endpoints Integration Tests (Phase TR.2)', () => {
  const app = createApp();

  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
  const ADMIN_USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const VEHICLE_ID = '12121212-1212-4212-8212-121212121212';
  const ROUTE_ID = '34343434-3434-4434-8434-343434343434';
  const STOP_ID = '56565656-5656-4656-8656-565656565656';
  const STUDENT_ID = '78787878-7878-4787-8787-787878787878';

  const adminUser = {
    id: ADMIN_USER_ID,
    schoolId: SCHOOL_ID,
    email: 'admin@school.com',
    systemRole: SYSTEM_ROLES.SCHOOL_ADMIN,
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_ID, name: 'School', code: 'SCH', status: 'active' }
  };

  const MOCK_VEHICLE = {
    id: VEHICLE_ID,
    schoolId: SCHOOL_ID,
    registrationNumber: 'TN 56 K 1146',
    model: 'Tata Starbus 2023',
    capacity: 32,
    status: 'Active'
  };

  const MOCK_ROUTE = {
    id: ROUTE_ID,
    schoolId: SCHOOL_ID,
    name: 'Route 4 - Erode North',
    routeNumber: 'R-04',
    capacity: 30,
    vehicleId: VEHICLE_ID
  };

  const MOCK_STOP = {
    id: STOP_ID,
    schoolId: SCHOOL_ID,
    routeId: ROUTE_ID,
    stopName: 'Central Bus Stand',
    pickupTime: '07:45',
    dropTime: '16:15',
    stopOrder: 1
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const getAuthToken = (user = adminUser) => {
    return tokenService.issueAccessToken({
      sub: user.id,
      schoolId: user.schoolId,
      systemRole: user.systemRole,
      tokenVersion: user.tokenVersion
    });
  };

  describe('Vehicles Endpoints', () => {
    it('GET /api/v1/transport/vehicles lists vehicles', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminUser);
      vi.spyOn(transportService, 'listVehicles').mockResolvedValue([MOCK_VEHICLE]);

      const token = getAuthToken();
      const res = await request(app)
        .get('/api/v1/transport/vehicles')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].id).toBe(VEHICLE_ID);
    });

    it('GET /api/v1/transport/vehicles/:id returns vehicle details', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminUser);
      vi.spyOn(transportService, 'getVehicleById').mockResolvedValue(MOCK_VEHICLE);

      const token = getAuthToken();
      const res = await request(app)
        .get(`/api/v1/transport/vehicles/${VEHICLE_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(VEHICLE_ID);
    });

    it('POST /api/v1/transport/vehicles registers new vehicle', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminUser);
      vi.spyOn(transportService, 'createVehicle').mockResolvedValue(MOCK_VEHICLE);

      const token = getAuthToken();
      const res = await request(app)
        .post('/api/v1/transport/vehicles')
        .set('Authorization', `Bearer ${token}`)
        .send({
          registrationNumber: 'TN 56 K 1146',
          capacity: 32,
          model: 'Tata Starbus 2023'
        });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBe(VEHICLE_ID);
    });

    it('PATCH /api/v1/transport/vehicles/:id updates vehicle', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminUser);
      vi.spyOn(transportService, 'updateVehicle').mockResolvedValue({
        ...MOCK_VEHICLE,
        capacity: 36
      });

      const token = getAuthToken();
      const res = await request(app)
        .patch(`/api/v1/transport/vehicles/${VEHICLE_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ capacity: 36 });

      expect(res.status).toBe(200);
      expect(res.body.data.capacity).toBe(36);
    });

    it('DELETE /api/v1/transport/vehicles/:id deletes vehicle', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminUser);
      vi.spyOn(transportService, 'deleteVehicle').mockResolvedValue({
        message: 'Vehicle deleted successfully',
        id: VEHICLE_ID
      });

      const token = getAuthToken();
      const res = await request(app)
        .delete(`/api/v1/transport/vehicles/${VEHICLE_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(VEHICLE_ID);
    });
  });

  describe('Routes Endpoints', () => {
    it('GET /api/v1/transport/routes lists routes', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminUser);
      vi.spyOn(transportService, 'listRoutes').mockResolvedValue([MOCK_ROUTE]);

      const token = getAuthToken();
      const res = await request(app)
        .get('/api/v1/transport/routes')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].id).toBe(ROUTE_ID);
    });

    it('GET /api/v1/transport/routes/:id returns route details', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminUser);
      vi.spyOn(transportService, 'getRouteById').mockResolvedValue({
        ...MOCK_ROUTE,
        vehicle: MOCK_VEHICLE,
        stops: [MOCK_STOP]
      });

      const token = getAuthToken();
      const res = await request(app)
        .get(`/api/v1/transport/routes/${ROUTE_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(ROUTE_ID);
      expect(res.body.data.stops).toHaveLength(1);
    });

    it('POST /api/v1/transport/routes creates route', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminUser);
      vi.spyOn(transportService, 'createRoute').mockResolvedValue(MOCK_ROUTE);

      const token = getAuthToken();
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

    it('PATCH /api/v1/transport/routes/:id updates route', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminUser);
      vi.spyOn(transportService, 'updateRoute').mockResolvedValue({
        ...MOCK_ROUTE,
        capacity: 35
      });

      const token = getAuthToken();
      const res = await request(app)
        .patch(`/api/v1/transport/routes/${ROUTE_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ capacity: 35 });

      expect(res.status).toBe(200);
      expect(res.body.data.capacity).toBe(35);
    });

    it('DELETE /api/v1/transport/routes/:id deletes route', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminUser);
      vi.spyOn(transportService, 'deleteRoute').mockResolvedValue({
        message: 'Route deleted successfully',
        id: ROUTE_ID
      });

      const token = getAuthToken();
      const res = await request(app)
        .delete(`/api/v1/transport/routes/${ROUTE_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(ROUTE_ID);
    });
  });

  describe('Route Stops Endpoints', () => {
    it('POST /api/v1/transport/routes/:routeId/stops adds stop to route', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminUser);
      vi.spyOn(transportService, 'createRouteStop').mockResolvedValue(MOCK_STOP);

      const token = getAuthToken();
      const res = await request(app)
        .post(`/api/v1/transport/routes/${ROUTE_ID}/stops`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          stopName: 'Central Bus Stand',
          pickupTime: '07:45',
          dropTime: '16:15',
          stopOrder: 1
        });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBe(STOP_ID);
    });

    it('PATCH /api/v1/transport/stops/:id updates stop', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminUser);
      vi.spyOn(transportService, 'updateRouteStop').mockResolvedValue({
        ...MOCK_STOP,
        stopName: 'Updated Central Bus Stand'
      });

      const token = getAuthToken();
      const res = await request(app)
        .patch(`/api/v1/transport/stops/${STOP_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          stopName: 'Updated Central Bus Stand'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.stopName).toBe('Updated Central Bus Stand');
    });

    it('DELETE /api/v1/transport/stops/:id deletes stop', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminUser);
      vi.spyOn(transportService, 'deleteRouteStop').mockResolvedValue({
        message: 'Route stop deleted successfully',
        id: STOP_ID
      });

      const token = getAuthToken();
      const res = await request(app)
        .delete(`/api/v1/transport/stops/${STOP_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(STOP_ID);
    });
  });

  describe('Student Transport Assignments Endpoints', () => {
    it('GET /api/v1/transport/assignments lists assignments', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminUser);
      vi.spyOn(transportService, 'listStudentAssignments').mockResolvedValue([
        {
          id: STUDENT_ID,
          firstName: 'Arun',
          lastName: 'Kumar',
          transportRoute: { id: ROUTE_ID, name: 'Route 4' }
        }
      ]);

      const token = getAuthToken();
      const res = await request(app)
        .get('/api/v1/transport/assignments')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });

    it('POST /api/v1/transport/routes/:routeId/assign assigns student', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminUser);
      vi.spyOn(transportService, 'assignStudentToRoute').mockResolvedValue({
        id: STUDENT_ID,
        transportRouteId: ROUTE_ID
      });

      const token = getAuthToken();
      const res = await request(app)
        .post(`/api/v1/transport/routes/${ROUTE_ID}/assign`)
        .set('Authorization', `Bearer ${token}`)
        .send({ studentId: STUDENT_ID });

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(STUDENT_ID);
    });

    it('POST /api/v1/transport/routes/:routeId/unassign unassigns student', async () => {
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue(adminUser);
      vi.spyOn(transportService, 'unassignStudentFromRoute').mockResolvedValue({
        id: STUDENT_ID,
        transportRouteId: null
      });

      const token = getAuthToken();
      const res = await request(app)
        .post(`/api/v1/transport/routes/${ROUTE_ID}/unassign`)
        .set('Authorization', `Bearer ${token}`)
        .send({ studentId: STUDENT_ID });

      expect(res.status).toBe(200);
      expect(res.body.data.transportRouteId).toBeNull();
    });
  });
});
