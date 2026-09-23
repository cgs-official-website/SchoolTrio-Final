import { describe, it, expect, vi, beforeEach } from 'vitest';
import TransportManagement from '../TransportManagement.jsx';
import * as transportApiModule from '../../../api/transport.js';
import * as firestoreModule from '../../../firebase/firestore.js';

describe('Admin TransportManagement Component REST Cutover (Phase TR.3)', () => {
  const VEHICLE_ID = '11111111-1111-4111-8111-111111111111';
  const ROUTE_ID = '22222222-2222-4222-8222-222222222222';
  const STUDENT_ID = '33333333-3333-4333-8333-333333333333';

  const MOCK_VEHICLE = {
    id: VEHICLE_ID,
    registrationNumber: 'TN 56 K 1146',
    model: 'Tata Starbus 32-seater',
    capacity: 32,
    status: 'Active',
    fitnessExpiry: '2026-12-31',
    insuranceExpiry: '2026-12-31',
    pollutionExpiry: '2026-12-31',
    customData: {
      vehicleName: 'Yellow Bus 04'
    }
  };

  const MOCK_ROUTE = {
    id: ROUTE_ID,
    name: 'North Campus Route 4',
    routeNumber: 'R-04',
    capacity: 30,
    driverName: 'Moorthy',
    driverPhone: '9876543210',
    vehicleId: VEHICLE_ID,
    vehicle: MOCK_VEHICLE
  };

  const MOCK_ASSIGNMENT = {
    id: STUDENT_ID,
    transportRouteId: ROUTE_ID,
    transportRoute: MOCK_ROUTE
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('is exported as a valid React component function', () => {
    expect(typeof TransportManagement).toBe('function');
  });

  // ============================================================
  // 1. ZERO FIRESTORE TRANSPORT OPERATIONS
  // ============================================================

  it('does NOT invoke legacy Firestore transport functions', () => {
    const firestoreTransportSpies = [
      vi.spyOn(firestoreModule, 'createTransportRoute'),
      vi.spyOn(firestoreModule, 'getTransportRoutes'),
      vi.spyOn(firestoreModule, 'assignStudentToRoute'),
      vi.spyOn(firestoreModule, 'subscribeToTransportRoutes')
    ];

    firestoreTransportSpies.forEach((spy) => {
      expect(spy).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // 2. VEHICLE REST OPERATIONS
  // ============================================================

  it('loads vehicles from REST listVehicles', async () => {
    const listSpy = vi.spyOn(transportApiModule, 'listVehicles').mockResolvedValue({
      status: 'success',
      data: [MOCK_VEHICLE]
    });

    const res = await transportApiModule.listVehicles({ status: 'Active' });

    expect(listSpy).toHaveBeenCalledWith({ status: 'Active' });
    expect(res.data).toHaveLength(1);
    expect(res.data[0].registrationNumber).toBe('TN 56 K 1146');
  });

  it('creates vehicle via REST createVehicle', async () => {
    const createSpy = vi.spyOn(transportApiModule, 'createVehicle').mockResolvedValue({
      status: 'success',
      data: MOCK_VEHICLE
    });

    const payload = {
      registrationNumber: 'TN 56 K 1146',
      model: 'Tata Starbus 32-seater',
      capacity: 32,
      status: 'Active'
    };

    const res = await transportApiModule.createVehicle(payload);

    expect(createSpy).toHaveBeenCalledWith(payload);
    expect(res.data.id).toBe(VEHICLE_ID);
  });

  it('updates vehicle via REST updateVehicle', async () => {
    const updateSpy = vi.spyOn(transportApiModule, 'updateVehicle').mockResolvedValue({
      status: 'success',
      data: { ...MOCK_VEHICLE, capacity: 36 }
    });

    const res = await transportApiModule.updateVehicle(VEHICLE_ID, { capacity: 36 });

    expect(updateSpy).toHaveBeenCalledWith(VEHICLE_ID, { capacity: 36 });
    expect(res.data.capacity).toBe(36);
  });

  it('deletes vehicle via REST deleteVehicle', async () => {
    const deleteSpy = vi.spyOn(transportApiModule, 'deleteVehicle').mockResolvedValue({
      status: 'success',
      data: { id: VEHICLE_ID }
    });

    const res = await transportApiModule.deleteVehicle(VEHICLE_ID);

    expect(deleteSpy).toHaveBeenCalledWith(VEHICLE_ID);
    expect(res.data.id).toBe(VEHICLE_ID);
  });

  // ============================================================
  // 3. ROUTE REST OPERATIONS
  // ============================================================

  it('loads routes from REST listRoutes', async () => {
    const listSpy = vi.spyOn(transportApiModule, 'listRoutes').mockResolvedValue({
      status: 'success',
      data: [MOCK_ROUTE]
    });

    const res = await transportApiModule.listRoutes();

    expect(listSpy).toHaveBeenCalled();
    expect(res.data).toHaveLength(1);
    expect(res.data[0].id).toBe(ROUTE_ID);
  });

  it('creates route via REST createRoute', async () => {
    const createSpy = vi.spyOn(transportApiModule, 'createRoute').mockResolvedValue({
      status: 'success',
      data: MOCK_ROUTE
    });

    const payload = {
      name: 'North Campus Route 4',
      capacity: 30,
      driverName: 'Moorthy'
    };

    const res = await transportApiModule.createRoute(payload);

    expect(createSpy).toHaveBeenCalledWith(payload);
    expect(res.data.id).toBe(ROUTE_ID);
  });

  it('updates route via REST updateRoute', async () => {
    const updateSpy = vi.spyOn(transportApiModule, 'updateRoute').mockResolvedValue({
      status: 'success',
      data: { ...MOCK_ROUTE, capacity: 35 }
    });

    const res = await transportApiModule.updateRoute(ROUTE_ID, { capacity: 35 });

    expect(updateSpy).toHaveBeenCalledWith(ROUTE_ID, { capacity: 35 });
    expect(res.data.capacity).toBe(35);
  });

  it('deletes route via REST deleteRoute', async () => {
    const deleteSpy = vi.spyOn(transportApiModule, 'deleteRoute').mockResolvedValue({
      status: 'success',
      data: { id: ROUTE_ID }
    });

    const res = await transportApiModule.deleteRoute(ROUTE_ID);

    expect(deleteSpy).toHaveBeenCalledWith(ROUTE_ID);
    expect(res.data.id).toBe(ROUTE_ID);
  });

  // ============================================================
  // 4. STUDENT ASSIGNMENT REST OPERATIONS
  // ============================================================

  it('loads student assignments from REST listTransportAssignments', async () => {
    const listSpy = vi.spyOn(transportApiModule, 'listTransportAssignments').mockResolvedValue({
      status: 'success',
      data: [MOCK_ASSIGNMENT]
    });

    const res = await transportApiModule.listTransportAssignments();

    expect(listSpy).toHaveBeenCalled();
    expect(res.data).toHaveLength(1);
  });

  it('assigns student to route via REST assignStudentToRoute', async () => {
    const assignSpy = vi.spyOn(transportApiModule, 'assignStudentToRoute').mockResolvedValue({
      status: 'success',
      data: { id: STUDENT_ID, transportRouteId: ROUTE_ID }
    });

    const res = await transportApiModule.assignStudentToRoute(ROUTE_ID, { studentId: STUDENT_ID });

    expect(assignSpy).toHaveBeenCalledWith(ROUTE_ID, { studentId: STUDENT_ID });
    expect(res.data.transportRouteId).toBe(ROUTE_ID);
  });

  it('unassigns student from route via REST unassignStudentFromRoute', async () => {
    const unassignSpy = vi.spyOn(transportApiModule, 'unassignStudentFromRoute').mockResolvedValue({
      status: 'success',
      data: { id: STUDENT_ID, transportRouteId: null }
    });

    const res = await transportApiModule.unassignStudentFromRoute(ROUTE_ID, { studentId: STUDENT_ID });

    expect(unassignSpy).toHaveBeenCalledWith(ROUTE_ID, { studentId: STUDENT_ID });
    expect(res.data.transportRouteId).toBeNull();
  });

  it('handles route capacity 409 conflict when assigning student', async () => {
    const error409 = new Error("Cannot assign student: route 'North Campus Route 4' has reached its maximum capacity of 30");
    error409.status = 409;
    vi.spyOn(transportApiModule, 'assignStudentToRoute').mockRejectedValue(error409);

    await expect(transportApiModule.assignStudentToRoute(ROUTE_ID, { studentId: STUDENT_ID }))
      .rejects.toThrow(/maximum capacity/);
  });

  // ============================================================
  // 5. STOP REST OPERATIONS
  // ============================================================

  it('supports addRouteStop, updateRouteStop, deleteRouteStop with exact PATCH and DELETE methods', async () => {
    const addSpy = vi.spyOn(transportApiModule, 'addRouteStop').mockResolvedValue({
      status: 'success',
      data: { id: 'stop-1', stopName: 'Stop A' }
    });
    const updateSpy = vi.spyOn(transportApiModule, 'updateRouteStop').mockResolvedValue({
      status: 'success',
      data: { id: 'stop-1', stopName: 'Updated Stop' }
    });
    const deleteSpy = vi.spyOn(transportApiModule, 'deleteRouteStop').mockResolvedValue({
      status: 'success',
      data: { id: 'stop-1' }
    });

    await transportApiModule.addRouteStop(ROUTE_ID, { stopName: 'Stop A' });
    expect(addSpy).toHaveBeenCalledWith(ROUTE_ID, { stopName: 'Stop A' });

    await transportApiModule.updateRouteStop('stop-1', { stopName: 'Updated Stop' });
    expect(updateSpy).toHaveBeenCalledWith('stop-1', { stopName: 'Updated Stop' });

    await transportApiModule.deleteRouteStop('stop-1');
    expect(deleteSpy).toHaveBeenCalledWith('stop-1');
  });
});
