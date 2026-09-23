import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as transportApiModule from '../../../api/transport.js';
import * as firestoreModule from '../../../firebase/firestore.js';

describe('Teacher ClassRoster Transport REST Cutover Regression (Phase TR.3)', () => {
  const ROUTE_ID = '22222222-2222-4222-8222-222222222222';

  const MOCK_ROUTE = {
    id: ROUTE_ID,
    name: 'North Campus Route 4',
    routeNumber: 'R-04',
    vehicleNumber: 'TN 56 K 1146',
    vehicle: {
      registrationNumber: 'TN 56 K 1146'
    }
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches transport routes using REST listRoutes', async () => {
    const listSpy = vi.spyOn(transportApiModule, 'listRoutes').mockResolvedValue({
      status: 'success',
      data: [MOCK_ROUTE]
    });

    const res = await transportApiModule.listRoutes();

    expect(listSpy).toHaveBeenCalled();
    expect(res.data).toHaveLength(1);
    expect(res.data[0].vehicle.registrationNumber).toBe('TN 56 K 1146');
  });

  it('does NOT invoke legacy Firestore getTransportRoutes in ClassRoster', () => {
    const firestoreSpy = vi.spyOn(firestoreModule, 'getTransportRoutes');
    expect(firestoreSpy).not.toHaveBeenCalled();
  });
});
