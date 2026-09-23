import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as clientModule from '../client.js';
import {
  listVehicles,
  getVehicle,
  createVehicle,
  updateVehicle,
  deleteVehicle,
  listRoutes,
  getRoute,
  createRoute,
  updateRoute,
  deleteRoute,
  addRouteStop,
  updateRouteStop,
  deleteRouteStop,
  listTransportAssignments,
  assignStudentToRoute,
  unassignStudentFromRoute
} from '../transport.js';

describe('Transport API Client Module (Phase TR.3)', () => {
  const VEHICLE_ID = '11111111-1111-4111-8111-111111111111';
  const ROUTE_ID = '22222222-2222-4222-8222-222222222222';
  const STOP_ID = '33333333-3333-4333-8333-333333333333';
  const STUDENT_ID = '44444444-4444-4444-8444-444444444444';
  const CLASS_ID = '55555555-5555-4555-8555-555555555555';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Vehicles API', () => {
    it('1. listVehicles sends GET with allowlisted query params', async () => {
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({ status: 'success', data: [] });

      await listVehicles({ status: 'Active', search: 'Bus 1', bogus: 'ignored' });

      expect(apiSpy).toHaveBeenCalledWith(
        '/api/v1/transport/vehicles?status=Active&search=Bus+1',
        { method: 'GET' }
      );
    });

    it('2. getVehicle sends GET /vehicles/:id with encoded ID', async () => {
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({ status: 'success', data: { id: VEHICLE_ID } });

      await getVehicle(VEHICLE_ID);

      expect(apiSpy).toHaveBeenCalledWith(
        `/api/v1/transport/vehicles/${VEHICLE_ID}`,
        { method: 'GET' }
      );
    });

    it('3. createVehicle sends POST /vehicles with payload', async () => {
      const payload = { registrationNumber: 'TN 56 K 1146', capacity: 32, status: 'Active' };
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({ status: 'success', data: { id: VEHICLE_ID, ...payload } });

      await createVehicle(payload);

      expect(apiSpy).toHaveBeenCalledWith(
        '/api/v1/transport/vehicles',
        { method: 'POST', body: JSON.stringify(payload) }
      );
    });

    it('4. updateVehicle sends PATCH /vehicles/:id with payload', async () => {
      const payload = { capacity: 35 };
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({ status: 'success', data: { id: VEHICLE_ID, ...payload } });

      await updateVehicle(VEHICLE_ID, payload);

      expect(apiSpy).toHaveBeenCalledWith(
        `/api/v1/transport/vehicles/${VEHICLE_ID}`,
        { method: 'PATCH', body: JSON.stringify(payload) }
      );
    });

    it('5. deleteVehicle sends DELETE /vehicles/:id', async () => {
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({ status: 'success', data: { id: VEHICLE_ID } });

      await deleteVehicle(VEHICLE_ID);

      expect(apiSpy).toHaveBeenCalledWith(
        `/api/v1/transport/vehicles/${VEHICLE_ID}`,
        { method: 'DELETE' }
      );
    });
  });

  describe('Routes API', () => {
    it('6. listRoutes sends GET /routes with allowlisted query params', async () => {
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({ status: 'success', data: [] });

      await listRoutes({ vehicleId: VEHICLE_ID, search: 'North', schoolId: 'should-be-omitted' });

      expect(apiSpy).toHaveBeenCalledWith(
        `/api/v1/transport/routes?vehicleId=${VEHICLE_ID}&search=North`,
        { method: 'GET' }
      );
    });

    it('7. getRoute sends GET /routes/:id with encoded ID', async () => {
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({ status: 'success', data: { id: ROUTE_ID } });

      await getRoute(ROUTE_ID);

      expect(apiSpy).toHaveBeenCalledWith(
        `/api/v1/transport/routes/${ROUTE_ID}`,
        { method: 'GET' }
      );
    });

    it('8. createRoute sends POST /routes with payload', async () => {
      const payload = { name: 'Route 1', capacity: 30, driverName: 'Moorthy' };
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({ status: 'success', data: { id: ROUTE_ID, ...payload } });

      await createRoute(payload);

      expect(apiSpy).toHaveBeenCalledWith(
        '/api/v1/transport/routes',
        { method: 'POST', body: JSON.stringify(payload) }
      );
    });

    it('9. updateRoute sends PATCH /routes/:id with payload', async () => {
      const payload = { capacity: 40 };
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({ status: 'success', data: { id: ROUTE_ID, ...payload } });

      await updateRoute(ROUTE_ID, payload);

      expect(apiSpy).toHaveBeenCalledWith(
        `/api/v1/transport/routes/${ROUTE_ID}`,
        { method: 'PATCH', body: JSON.stringify(payload) }
      );
    });

    it('10. deleteRoute sends DELETE /routes/:id', async () => {
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({ status: 'success', data: { id: ROUTE_ID } });

      await deleteRoute(ROUTE_ID);

      expect(apiSpy).toHaveBeenCalledWith(
        `/api/v1/transport/routes/${ROUTE_ID}`,
        { method: 'DELETE' }
      );
    });
  });

  describe('Route Stops API', () => {
    it('11. addRouteStop sends POST /routes/:routeId/stops with payload', async () => {
      const payload = { stopName: 'Main Junction', pickupTime: '07:30', dropTime: '16:00', stopOrder: 1 };
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({ status: 'success', data: { id: STOP_ID, ...payload } });

      await addRouteStop(ROUTE_ID, payload);

      expect(apiSpy).toHaveBeenCalledWith(
        `/api/v1/transport/routes/${ROUTE_ID}/stops`,
        { method: 'POST', body: JSON.stringify(payload) }
      );
    });

    it('12. updateRouteStop sends PATCH /stops/:id with payload', async () => {
      const payload = { stopName: 'Updated Stop' };
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({ status: 'success', data: { id: STOP_ID, ...payload } });

      await updateRouteStop(STOP_ID, payload);

      expect(apiSpy).toHaveBeenCalledWith(
        `/api/v1/transport/stops/${STOP_ID}`,
        { method: 'PATCH', body: JSON.stringify(payload) }
      );
    });

    it('13. deleteRouteStop sends DELETE /stops/:id', async () => {
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({ status: 'success', data: { id: STOP_ID } });

      await deleteRouteStop(STOP_ID);

      expect(apiSpy).toHaveBeenCalledWith(
        `/api/v1/transport/stops/${STOP_ID}`,
        { method: 'DELETE' }
      );
    });
  });

  describe('Student Transport Assignments API', () => {
    it('14. listTransportAssignments sends GET /assignments with query params', async () => {
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({ status: 'success', data: [] });

      await listTransportAssignments({ classId: CLASS_ID, routeId: ROUTE_ID, search: 'Kumar' });

      expect(apiSpy).toHaveBeenCalledWith(
        `/api/v1/transport/assignments?classId=${CLASS_ID}&routeId=${ROUTE_ID}&search=Kumar`,
        { method: 'GET' }
      );
    });

    it('15. assignStudentToRoute sends POST /routes/:routeId/assign with payload object', async () => {
      const payload = { studentId: STUDENT_ID, pickupStopId: STOP_ID };
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({ status: 'success', data: { id: STUDENT_ID, transportRouteId: ROUTE_ID } });

      await assignStudentToRoute(ROUTE_ID, payload);

      expect(apiSpy).toHaveBeenCalledWith(
        `/api/v1/transport/routes/${ROUTE_ID}/assign`,
        { method: 'POST', body: JSON.stringify(payload) }
      );
    });

    it('15b. assignStudentToRoute supports separate studentId and stopId args', async () => {
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({ status: 'success', data: { id: STUDENT_ID, transportRouteId: ROUTE_ID } });

      await assignStudentToRoute(ROUTE_ID, STUDENT_ID, STOP_ID);

      expect(apiSpy).toHaveBeenCalledWith(
        `/api/v1/transport/routes/${ROUTE_ID}/assign`,
        { method: 'POST', body: JSON.stringify({ studentId: STUDENT_ID, pickupStopId: STOP_ID }) }
      );
    });

    it('16. unassignStudentFromRoute sends POST /routes/:routeId/unassign with studentId', async () => {
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({ status: 'success', data: { id: STUDENT_ID, transportRouteId: null } });

      await unassignStudentFromRoute(ROUTE_ID, { studentId: STUDENT_ID });

      expect(apiSpy).toHaveBeenCalledWith(
        `/api/v1/transport/routes/${ROUTE_ID}/unassign`,
        { method: 'POST', body: JSON.stringify({ studentId: STUDENT_ID }) }
      );
    });

    it('16b. unassignStudentFromRoute supports string studentId argument', async () => {
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({ status: 'success', data: { id: STUDENT_ID, transportRouteId: null } });

      await unassignStudentFromRoute(ROUTE_ID, STUDENT_ID);

      expect(apiSpy).toHaveBeenCalledWith(
        `/api/v1/transport/routes/${ROUTE_ID}/unassign`,
        { method: 'POST', body: JSON.stringify({ studentId: STUDENT_ID }) }
      );
    });
  });
});
