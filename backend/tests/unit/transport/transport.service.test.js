import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as transportService from '../../../src/modules/transport/transport.service.js';
import * as transportRepository from '../../../src/modules/transport/transport.repository.js';
import * as auditRepository from '../../../src/modules/audit/audit.repository.js';
import {
  NotFoundError,
  ConflictError,
  ValidationError
} from '../../../src/utils/app-error.js';

describe('Transport Service Unit Tests (Phase TR.2)', () => {
  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
  const VEHICLE_ID = '22222222-2222-4222-8222-222222222222';
  const ROUTE_ID = '33333333-3333-4333-8333-333333333333';
  const STOP_ID = '44444444-4444-4444-8444-444444444444';
  const STUDENT_ID = '55555555-5555-4555-8555-555555555555';

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

  const MOCK_STUDENT = {
    id: STUDENT_ID,
    schoolId: SCHOOL_ID,
    firstName: 'Arun',
    lastName: 'Kumar',
    transportRouteId: null,
    pickupStopId: null
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(auditRepository, 'createAuditLog').mockResolvedValue({ id: 'audit-id' });
  });

  describe('Vehicle Operations', () => {
    it('creates vehicle and checks for duplicate registration number', async () => {
      vi.spyOn(transportRepository, 'findVehicleByRegistrationNumber').mockResolvedValue(null);
      vi.spyOn(transportRepository, 'createVehicle').mockResolvedValue(MOCK_VEHICLE);

      const res = await transportService.createVehicle(SCHOOL_ID, {
        registrationNumber: 'TN 56 K 1146',
        capacity: 32
      });

      expect(res.id).toBe(VEHICLE_ID);
      expect(transportRepository.createVehicle).toHaveBeenCalled();
    });

    it('throws ConflictError on duplicate vehicle registration number', async () => {
      vi.spyOn(transportRepository, 'findVehicleByRegistrationNumber').mockResolvedValue(MOCK_VEHICLE);

      await expect(
        transportService.createVehicle(SCHOOL_ID, {
          registrationNumber: 'TN 56 K 1146',
          capacity: 32
        })
      ).rejects.toThrow(ConflictError);
    });

    it('throws NotFoundError on missing vehicle get', async () => {
      vi.spyOn(transportRepository, 'findVehicleById').mockResolvedValue(null);

      await expect(transportService.getVehicleById(SCHOOL_ID, VEHICLE_ID)).rejects.toThrow(NotFoundError);
    });
  });

  describe('Route Operations', () => {
    it('creates route and verifies vehicle in tenant', async () => {
      vi.spyOn(transportRepository, 'findVehicleById').mockResolvedValue(MOCK_VEHICLE);
      vi.spyOn(transportRepository, 'createRoute').mockResolvedValue(MOCK_ROUTE);

      const res = await transportService.createRoute(SCHOOL_ID, {
        name: 'Route 4',
        vehicleId: VEHICLE_ID,
        capacity: 30
      });

      expect(res.id).toBe(ROUTE_ID);
    });

    it('throws NotFoundError if route vehicle does not exist in tenant', async () => {
      vi.spyOn(transportRepository, 'findVehicleById').mockResolvedValue(null);

      await expect(
        transportService.createRoute(SCHOOL_ID, {
          name: 'Route 4',
          vehicleId: 'non-existent-vehicle-id',
          capacity: 30
        })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('Student Assignment Operations & Capacity Check', () => {
    it('successfully assigns student within capacity limits', async () => {
      vi.spyOn(transportRepository, 'runTransaction').mockImplementation(async (callback) => {
        const mockTx = {
          transportRoute: { findFirst: vi.fn().mockResolvedValue(MOCK_ROUTE) },
          routeStop: { findFirst: vi.fn().mockResolvedValue({ id: STOP_ID, routeId: ROUTE_ID }) }
        };
        vi.spyOn(transportRepository, 'lockRouteForUpdate').mockResolvedValue(MOCK_ROUTE);
        vi.spyOn(transportRepository, 'findStudentInTenant').mockResolvedValue(MOCK_STUDENT);
        vi.spyOn(transportRepository, 'countStudentsOnRoute').mockResolvedValue(10); // 10 < 30 capacity
        vi.spyOn(transportRepository, 'assignStudentToRoute').mockResolvedValue({
          ...MOCK_STUDENT,
          transportRouteId: ROUTE_ID,
          pickupStopId: STOP_ID
        });

        return callback(mockTx);
      });

      const res = await transportService.assignStudentToRoute(SCHOOL_ID, ROUTE_ID, {
        studentId: STUDENT_ID,
        pickupStopId: STOP_ID
      });

      expect(res.transportRouteId).toBe(ROUTE_ID);
      expect(res.pickupStopId).toBe(STOP_ID);
    });

    it('throws ConflictError when route capacity is reached', async () => {
      vi.spyOn(transportRepository, 'runTransaction').mockImplementation(async (callback) => {
        const mockTx = {
          transportRoute: { findFirst: vi.fn().mockResolvedValue(MOCK_ROUTE) }
        };
        vi.spyOn(transportRepository, 'lockRouteForUpdate').mockResolvedValue(MOCK_ROUTE);
        vi.spyOn(transportRepository, 'findStudentInTenant').mockResolvedValue(MOCK_STUDENT);
        vi.spyOn(transportRepository, 'countStudentsOnRoute').mockResolvedValue(30); // 30 == 30 capacity

        return callback(mockTx);
      });

      await expect(
        transportService.assignStudentToRoute(SCHOOL_ID, ROUTE_ID, {
          studentId: STUDENT_ID
        })
      ).rejects.toThrow(ConflictError);
    });

    it('unassigns student successfully', async () => {
      vi.spyOn(transportRepository, 'findStudentInTenant').mockResolvedValue({
        ...MOCK_STUDENT,
        transportRouteId: ROUTE_ID
      });
      vi.spyOn(transportRepository, 'unassignStudentFromRoute').mockResolvedValue({
        ...MOCK_STUDENT,
        transportRouteId: null,
        pickupStopId: null
      });

      const res = await transportService.unassignStudentFromRoute(SCHOOL_ID, ROUTE_ID, {
        studentId: STUDENT_ID
      });

      expect(res.transportRouteId).toBeNull();
    });

    it('throws ValidationError when unassigning student assigned to a different route', async () => {
      vi.spyOn(transportRepository, 'findStudentInTenant').mockResolvedValue({
        ...MOCK_STUDENT,
        transportRouteId: 'other-route-id'
      });

      await expect(
        transportService.unassignStudentFromRoute(SCHOOL_ID, ROUTE_ID, {
          studentId: STUDENT_ID
        })
      ).rejects.toThrow(ValidationError);
    });
  });
});
