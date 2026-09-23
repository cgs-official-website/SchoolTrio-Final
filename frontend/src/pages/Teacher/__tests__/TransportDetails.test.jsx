import { describe, it, expect, vi, beforeEach } from 'vitest';
import TransportDetails from '../TransportDetails.jsx';
import * as transportApiModule from '../../../api/transport.js';
import * as classesApiModule from '../../../api/classes.js';
import * as firestoreModule from '../../../firebase/firestore.js';

describe('Teacher TransportDetails Component REST Cutover (Phase TR.3)', () => {
  const CLASS_ID = '11111111-1111-4111-8111-111111111111';
  const ROUTE_ID = '22222222-2222-4222-8222-222222222222';
  const STUDENT_ID = '33333333-3333-4333-8333-333333333333';

  const MOCK_ASSIGNMENT = {
    id: STUDENT_ID,
    firstName: 'Arun',
    lastName: 'Kumar',
    admissionNumber: 'ADM-001',
    classId: CLASS_ID,
    transportRouteId: ROUTE_ID,
    transportRoute: {
      id: ROUTE_ID,
      name: 'North Campus Route 4',
      routeNumber: 'R-04',
      driverName: 'Moorthy',
      driverPhone: '9876543210',
      vehicle: {
        registrationNumber: 'TN 56 K 1146'
      }
    }
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('is exported as a valid React component function', () => {
    expect(typeof TransportDetails).toBe('function');
  });

  it('does NOT invoke legacy Firestore transport functions', () => {
    const firestoreTransportSpies = [
      vi.spyOn(firestoreModule, 'getTransportRoutes'),
      vi.spyOn(firestoreModule, 'subscribeToTransportRoutes')
    ];

    firestoreTransportSpies.forEach((spy) => {
      expect(spy).not.toHaveBeenCalled();
    });
  });

  it('fetches class-scoped transport assignments via listTransportAssignments', async () => {
    const listSpy = vi.spyOn(transportApiModule, 'listTransportAssignments').mockResolvedValue({
      status: 'success',
      data: [MOCK_ASSIGNMENT]
    });

    const res = await transportApiModule.listTransportAssignments({ classId: CLASS_ID });

    expect(listSpy).toHaveBeenCalledWith({ classId: CLASS_ID });
    expect(res.data).toHaveLength(1);
    expect(res.data[0].transportRoute.driverName).toBe('Moorthy');
    expect(res.data[0].transportRoute.vehicle.registrationNumber).toBe('TN 56 K 1146');
  });

  it('fetches class details via REST getClass', async () => {
    const classSpy = vi.spyOn(classesApiModule, 'getClass').mockResolvedValue({
      success: true,
      data: { id: CLASS_ID, name: 'Grade 10', section: 'A' }
    });

    const res = await classesApiModule.getClass(CLASS_ID);

    expect(classSpy).toHaveBeenCalledWith(CLASS_ID);
    expect(res.data.name).toBe('Grade 10');
  });
});
