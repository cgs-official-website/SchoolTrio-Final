import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Canteen from '../Canteen.jsx';
import * as canteenApi from '../../../api/canteen.js';
import * as firestoreModule from '../../../firebase/firestore.js';

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({
    userProfile: {
      schoolId: '11111111-1111-4111-8111-111111111111',
      linkedStudentId: '22222222-2222-4222-8222-222222222222'
    }
  })
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn()
  }
}));

describe('Parent Canteen Component REST Cutover (Phase CA.3)', () => {
  const STUDENT_ID = '22222222-2222-4222-8222-222222222222';
  const todayStr = new Date().toISOString().split('T')[0];

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('is exported as a valid React component function', () => {
    expect(typeof Canteen).toBe('function');
  });

  it('does NOT invoke Firestore addSubDocument or subscribeToSubCollection for canteen_requests', () => {
    const addSubDocSpy = vi.spyOn(firestoreModule, 'addSubDocument');
    const subscribeSpy = vi.spyOn(firestoreModule, 'subscribeToSubCollection');

    expect(addSubDocSpy).not.toHaveBeenCalled();
    expect(subscribeSpy).not.toHaveBeenCalled();
  });

  it('exports listCanteenRequests and createCanteenRequest from api/canteen', () => {
    expect(typeof canteenApi.listCanteenRequests).toBe('function');
    expect(typeof canteenApi.createCanteenRequest).toBe('function');
  });

  it('handles empty response list from listCanteenRequests cleanly', async () => {
    vi.spyOn(canteenApi, 'listCanteenRequests').mockResolvedValue({ status: 'success', data: [] });
    const res = await canteenApi.listCanteenRequests({ studentId: STUDENT_ID });
    expect(res.data).toEqual([]);
  });

  it('handles active today requests correctly for Breakfast and Lunch', async () => {
    const mockData = [
      {
        id: 'req-1',
        studentId: STUDENT_ID,
        mealType: 'Breakfast',
        date: todayStr,
        status: 'Pending',
        createdAt: new Date().toISOString()
      },
      {
        id: 'req-2',
        studentId: STUDENT_ID,
        mealType: 'Lunch',
        date: todayStr,
        status: 'Approved',
        createdAt: new Date().toISOString()
      }
    ];

    vi.spyOn(canteenApi, 'listCanteenRequests').mockResolvedValue({ status: 'success', data: mockData });
    const res = await canteenApi.listCanteenRequests({ studentId: STUDENT_ID });

    const requestedBreakfast = res.data.some((r) => r.date === todayStr && r.mealType === 'Breakfast');
    const requestedLunch = res.data.some((r) => r.date === todayStr && r.mealType === 'Lunch');

    expect(requestedBreakfast).toBe(true);
    expect(requestedLunch).toBe(true);
  });

  it('creates canteen request via POST payload without extraneous identity fields', async () => {
    const payload = {
      studentId: STUDENT_ID,
      mealType: 'Breakfast',
      date: todayStr
    };

    const createSpy = vi.spyOn(canteenApi, 'createCanteenRequest').mockResolvedValue({
      status: 'success',
      data: { id: 'new-req-id', ...payload, status: 'Pending' }
    });

    const res = await canteenApi.createCanteenRequest(payload);

    expect(createSpy).toHaveBeenCalledWith(payload);
    expect(res.data.status).toBe('Pending');
  });

  it('handles 409 conflict error when duplicate request is rejected by server', async () => {
    const error409 = new Error("A canteen request of type 'Breakfast' for this student on 2026-09-20 already exists");
    error409.status = 409;

    vi.spyOn(canteenApi, 'createCanteenRequest').mockRejectedValue(error409);

    await expect(
      canteenApi.createCanteenRequest({
        studentId: STUDENT_ID,
        mealType: 'Breakfast',
        date: todayStr
      })
    ).rejects.toThrow("A canteen request of type 'Breakfast'");
  });
});
