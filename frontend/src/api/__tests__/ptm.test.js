import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as clientModule from '../client.js';
import {
  getTeacherAppointments,
  getStudentAppointments,
  getAppointment,
  createAppointment,
  updateAppointmentStatus,
  cancelAppointment,
  ptmApi
} from '../ptm.js';

describe('PTM API Client', () => {
  const APPOINTMENT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const STUDENT_ID = '11111111-2222-3333-4444-555555555555';
  const CLASS_ID = '66666666-7777-8888-9999-000000000000';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('lists teacher appointments with query parameters', async () => {
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: [{ id: APPOINTMENT_ID, date: '2026-09-20', timeSlot: '10:00' }],
      pagination: { total: 1, page: 1, limit: 10, totalPages: 1 }
    });

    const res = await getTeacherAppointments({ classId: CLASS_ID, tab: 'upcoming', page: 1, limit: 10 });
    expect(spy).toHaveBeenCalledWith(`/api/v1/ptm/teacher?classId=${CLASS_ID}&tab=upcoming&page=1&limit=10`, {
      method: 'GET'
    });
    expect(res.data).toHaveLength(1);
    expect(res.data[0].id).toBe(APPOINTMENT_ID);
  });

  it('lists student appointments for parent view', async () => {
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: [{ id: APPOINTMENT_ID, studentId: STUDENT_ID }],
      pagination: { total: 1, page: 1, limit: 10, totalPages: 1 }
    });

    const res = await getStudentAppointments(STUDENT_ID, { tab: 'past' });
    expect(spy).toHaveBeenCalledWith(`/api/v1/ptm/student/${STUDENT_ID}?tab=past`, {
      method: 'GET'
    });
    expect(res.data[0].studentId).toBe(STUDENT_ID);
  });

  it('retrieves single appointment by ID', async () => {
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: { id: APPOINTMENT_ID, status: 'Confirmed' }
    });

    const res = await getAppointment(APPOINTMENT_ID);
    expect(spy).toHaveBeenCalledWith(`/api/v1/ptm/${APPOINTMENT_ID}`, {
      method: 'GET'
    });
    expect(res.data.id).toBe(APPOINTMENT_ID);
  });

  it('creates an appointment with POST payload', async () => {
    const payload = {
      studentId: STUDENT_ID,
      classId: CLASS_ID,
      date: '2026-09-22',
      time: '11:30',
      type: 'online',
      status: 'Confirmed'
    };
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: { id: APPOINTMENT_ID, ...payload }
    });

    const res = await createAppointment(payload);
    expect(spy).toHaveBeenCalledWith('/api/v1/ptm', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    expect(res.data.id).toBe(APPOINTMENT_ID);
  });

  it('updates appointment status via PATCH', async () => {
    const statusPayload = { status: 'Cancelled', notes: 'Teacher sick' };
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: { id: APPOINTMENT_ID, status: 'Cancelled' }
    });

    const res = await updateAppointmentStatus(APPOINTMENT_ID, statusPayload);
    expect(spy).toHaveBeenCalledWith(`/api/v1/ptm/${APPOINTMENT_ID}/status`, {
      method: 'PATCH',
      body: JSON.stringify(statusPayload)
    });
    expect(res.data.status).toBe('Cancelled');
  });

  it('cancels appointment via DELETE', async () => {
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      message: 'PTM appointment cancelled successfully',
      id: APPOINTMENT_ID,
      status: 'Cancelled'
    });

    const res = await cancelAppointment(APPOINTMENT_ID);
    expect(spy).toHaveBeenCalledWith(`/api/v1/ptm/${APPOINTMENT_ID}`, {
      method: 'DELETE'
    });
    expect(res.success).toBe(true);
    expect(res.status).toBe('Cancelled');
  });

  it('exports ptmApi object containing all endpoints', () => {
    expect(ptmApi.getTeacherAppointments).toBe(getTeacherAppointments);
    expect(ptmApi.getStudentAppointments).toBe(getStudentAppointments);
    expect(ptmApi.getAppointment).toBe(getAppointment);
    expect(ptmApi.createAppointment).toBe(createAppointment);
    expect(ptmApi.updateAppointmentStatus).toBe(updateAppointmentStatus);
    expect(ptmApi.cancelAppointment).toBe(cancelAppointment);
  });
});
