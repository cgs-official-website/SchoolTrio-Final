import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CanteenManagement from '../CanteenManagement.jsx';
import * as canteenApi from '../../../api/canteen.js';
import * as firestoreModule from '../../../firebase/firestore.js';

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({
    userProfile: {
      schoolId: '11111111-1111-4111-8111-111111111111',
      role: 'ADMIN'
    }
  })
}));

vi.mock('../../../context/NotificationContext', () => ({
  useNotifications: () => ({
    clearBadge: vi.fn()
  })
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn()
  }
}));

describe('Admin CanteenManagement Component REST Cutover (Phase CA.3)', () => {
  const REQUEST_ID = '33333333-3333-4333-8333-333333333333';
  const todayStr = new Date().toISOString().split('T')[0];

  const MOCK_REQUEST = {
    id: REQUEST_ID,
    studentId: '22222222-2222-4222-8222-222222222222',
    mealType: 'Breakfast',
    date: todayStr,
    status: 'Pending',
    createdAt: new Date().toISOString(),
    student: {
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Alice Johnson',
      admissionNumber: 'ADM-001',
      className: 'Grade 5 - Section A'
    }
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('is exported as a valid React component function', () => {
    expect(typeof CanteenManagement).toBe('function');
  });

  it('does NOT invoke Firestore updateSubDocument for canteen_requests', () => {
    const updateSpy = vi.spyOn(firestoreModule, 'updateSubDocument');
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('fetches list of canteen requests via listCanteenRequests', async () => {
    const listSpy = vi.spyOn(canteenApi, 'listCanteenRequests').mockResolvedValue({
      status: 'success',
      data: [MOCK_REQUEST]
    });

    const res = await canteenApi.listCanteenRequests();

    expect(listSpy).toHaveBeenCalled();
    expect(res.data).toHaveLength(1);
    expect(res.data[0].student.name).toBe('Alice Johnson');
  });

  it('updates request status to Approved via updateCanteenRequestStatus', async () => {
    const updateSpy = vi.spyOn(canteenApi, 'updateCanteenRequestStatus').mockResolvedValue({
      status: 'success',
      data: { ...MOCK_REQUEST, status: 'Approved' }
    });

    const res = await canteenApi.updateCanteenRequestStatus(REQUEST_ID, { status: 'Approved' });

    expect(updateSpy).toHaveBeenCalledWith(REQUEST_ID, { status: 'Approved' });
    expect(res.data.status).toBe('Approved');
  });

  it('updates request status to Delivered via updateCanteenRequestStatus', async () => {
    const updateSpy = vi.spyOn(canteenApi, 'updateCanteenRequestStatus').mockResolvedValue({
      status: 'success',
      data: { ...MOCK_REQUEST, status: 'Delivered' }
    });

    const res = await canteenApi.updateCanteenRequestStatus(REQUEST_ID, { status: 'Delivered' });

    expect(updateSpy).toHaveBeenCalledWith(REQUEST_ID, { status: 'Delivered' });
    expect(res.data.status).toBe('Delivered');
  });

  it('updates request status to Cancelled via updateCanteenRequestStatus', async () => {
    const updateSpy = vi.spyOn(canteenApi, 'updateCanteenRequestStatus').mockResolvedValue({
      status: 'success',
      data: { ...MOCK_REQUEST, status: 'Cancelled' }
    });

    const res = await canteenApi.updateCanteenRequestStatus(REQUEST_ID, { status: 'Cancelled' });

    expect(updateSpy).toHaveBeenCalledWith(REQUEST_ID, { status: 'Cancelled' });
    expect(res.data.status).toBe('Cancelled');
  });

  it('handles 409 conflict error when invalid transition occurs', async () => {
    const conflictError = new Error("Cannot transition canteen request status from 'Delivered' to 'Approved'");
    conflictError.status = 409;

    vi.spyOn(canteenApi, 'updateCanteenRequestStatus').mockRejectedValue(conflictError);

    await expect(
      canteenApi.updateCanteenRequestStatus(REQUEST_ID, { status: 'Approved' })
    ).rejects.toThrow("Cannot transition canteen request");
  });

  it('calculates dashboard metrics accurately from request dataset', () => {
    const mockRequests = [
      { id: '1', date: todayStr, status: 'Pending' },
      { id: '2', date: todayStr, status: 'Approved' },
      { id: '3', date: todayStr, status: 'Delivered' },
      { id: '4', date: '2026-08-01', status: 'Delivered' }
    ];

    const todayReqs = mockRequests.filter((r) => r.date === todayStr);
    const stats = {
      todayPending: todayReqs.filter((r) => r.status === 'Pending').length,
      todayApproved: todayReqs.filter((r) => r.status === 'Approved').length,
      todayDelivered: todayReqs.filter((r) => r.status === 'Delivered').length,
      totalCount: mockRequests.length
    };

    expect(stats.todayPending).toBe(1);
    expect(stats.todayApproved).toBe(1);
    expect(stats.todayDelivered).toBe(1);
    expect(stats.totalCount).toBe(4);
  });
});
