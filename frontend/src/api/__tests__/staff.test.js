import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as clientModule from '../client.js';
import {
  listStaff,
  getStaff,
  createStaff,
  updateStaff,
  assignStaff,
  deleteStaff,
  listRoles,
  getStaffMe,
  updateStaffSelf
} from '../staff.js';

describe('Staff API Client Module', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('1. listStaff calls apiClient with GET /api/v1/staff and query parameters', async () => {
    const mockResponse = {
      success: true,
      data: [{ id: 'staff-uuid-1', name: 'Dr. Jane Smith', email: 'jane@school.com', staffType: 'teaching' }],
      pagination: { total: 1, page: 1, limit: 10, totalPages: 1 }
    };

    const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue(mockResponse);

    const res = await listStaff({
      search: 'Jane',
      staffType: 'teaching',
      status: 'Active',
      roleId: 'role-uuid-1',
      classId: 'class-uuid-1',
      page: 1,
      limit: 10
    });

    expect(apiSpy).toHaveBeenCalledWith(
      '/api/v1/staff?search=Jane&staffType=teaching&status=Active&roleId=role-uuid-1&classId=class-uuid-1&page=1&limit=10',
      { method: 'GET' }
    );
    expect(res.data).toEqual(mockResponse.data);
    expect(res.pagination.total).toBe(1);
  });

  it('2. listStaff omits empty, null, or undefined query parameters', async () => {
    const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({ success: true, data: [] });

    await listStaff({ search: '', phone: null, email: undefined, status: 'Active' });

    expect(apiSpy).toHaveBeenCalledWith('/api/v1/staff?status=Active', { method: 'GET' });
  });

  it('3. getStaff calls apiClient with GET /api/v1/staff/:id', async () => {
    const mockStaff = { id: 'staff-uuid-1', name: 'Dr. Jane Smith', email: 'jane@school.com' };
    const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({ success: true, data: mockStaff });

    const res = await getStaff('staff-uuid-1');

    expect(apiSpy).toHaveBeenCalledWith('/api/v1/staff/staff-uuid-1', { method: 'GET' });
    expect(res.data).toEqual(mockStaff);
  });

  it('4. createStaff calls apiClient with POST /api/v1/staff and payload', async () => {
    const payload = {
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane.smith@school.com',
      phone: '9876543210',
      employeeId: 'EMP001',
      staffType: 'teaching',
      designation: 'Senior Teacher',
      roleId: 'role-uuid-1',
      assignedClassId: 'class-uuid-1',
      status: 'Active'
    };

    const mockResponse = { success: true, data: { id: 'staff-uuid-new', ...payload } };
    const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue(mockResponse);

    const res = await createStaff(payload);

    expect(apiSpy).toHaveBeenCalledWith('/api/v1/staff', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    expect(res.data.id).toBe('staff-uuid-new');
  });

  it('5. updateStaff calls apiClient with PATCH /api/v1/staff/:id and payload', async () => {
    const payload = { designation: 'Head of Department', status: 'Active' };
    const mockResponse = { success: true, data: { id: 'staff-uuid-1', ...payload } };
    const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue(mockResponse);

    const res = await updateStaff('staff-uuid-1', payload);

    expect(apiSpy).toHaveBeenCalledWith('/api/v1/staff/staff-uuid-1', {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
    expect(res.data.designation).toBe('Head of Department');
  });

  it('6. assignStaff calls apiClient with PATCH /api/v1/staff/:id/assignment and payload', async () => {
    const payload = {
      assignedClassId: 'class-uuid-1',
      assignedSubjectIds: ['sub-uuid-1', 'sub-uuid-2'],
      subjectClassIds: ['class-uuid-1']
    };
    const mockResponse = { success: true, data: { id: 'staff-uuid-1', assignments: payload } };
    const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue(mockResponse);

    const res = await assignStaff('staff-uuid-1', payload);

    expect(apiSpy).toHaveBeenCalledWith('/api/v1/staff/staff-uuid-1/assignment', {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
    expect(res.data.assignments).toEqual(payload);
  });

  it('7. deleteStaff calls apiClient with DELETE /api/v1/staff/:id', async () => {
    const mockResponse = { success: true, data: null };
    const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue(mockResponse);

    const res = await deleteStaff('staff-uuid-1');

    expect(apiSpy).toHaveBeenCalledWith('/api/v1/staff/staff-uuid-1', { method: 'DELETE' });
    expect(res.success).toBe(true);
  });

  it('8. listRoles calls apiClient with GET /api/v1/rbac/roles', async () => {
    const mockRoles = [
      { id: 'role-1', name: 'Principal', slug: 'principal' },
      { id: 'role-2', name: 'Staffs', slug: 'staffs' }
    ];
    const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({ success: true, data: mockRoles });

    const res = await listRoles();

    expect(apiSpy).toHaveBeenCalledWith('/api/v1/rbac/roles', { method: 'GET' });
    expect(res.data).toEqual(mockRoles);
  });

  it('9. getStaffMe calls apiClient with GET /api/v1/staff/me', async () => {
    const mockMe = { id: 'staff-uuid-me', name: 'Self Profile' };
    const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({ success: true, data: mockMe });

    const res = await getStaffMe();

    expect(apiSpy).toHaveBeenCalledWith('/api/v1/staff/me', { method: 'GET' });
    expect(res.data).toEqual(mockMe);
  });

  it('10. updateStaffSelf calls apiClient with PATCH /api/v1/staff/me and payload', async () => {
    const payload = { phone: '1234567890', address: '123 School Lane' };
    const mockResponse = { success: true, data: { id: 'staff-uuid-me', ...payload } };
    const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue(mockResponse);

    const res = await updateStaffSelf(payload);

    expect(apiSpy).toHaveBeenCalledWith('/api/v1/staff/me', {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
    expect(res.data.phone).toBe('1234567890');
  });
});
