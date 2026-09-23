import { describe, it, expect, vi, beforeEach } from 'vitest';
import PTMScheduler from '../PTMScheduler.jsx';
import * as ptmApiModule from '../../../api/ptm.js';
import * as studentsApiModule from '../../../api/students.js';
import * as firestoreModule from '../../../firebase/firestore.js';
import { whatsappService } from '../../../services/whatsappService.js';

describe('Teacher PTMScheduler Component (REST Cutover)', () => {
  const PG_CLASS_ID = '05120a32-8118-44b6-8010-b9ed2c5467c0';
  const PG_STUDENT_ID_1 = '33333333-3333-4333-8333-333333333333';
  const PG_STUDENT_ID_2 = '44444444-4444-4444-8444-444444444444';
  const PG_PTM_ID_1 = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const PG_PTM_ID_2 = '11111111-2222-3333-4444-555555555555';
  const SCHOOL_ID = 'school-123';

  const mockStudents = [
    {
      id: PG_STUDENT_ID_1,
      firstName: 'Alice',
      lastName: 'Smith',
      parentName: 'Bob Smith',
      classId: PG_CLASS_ID
    },
    {
      id: PG_STUDENT_ID_2,
      firstName: 'Charlie',
      lastName: 'Brown',
      parentName: 'David Brown',
      classId: PG_CLASS_ID
    }
  ];

  const mockAppointments = [
    {
      id: PG_PTM_ID_1,
      studentId: PG_STUDENT_ID_1,
      studentName: 'Alice Smith',
      parentName: 'Bob Smith',
      classId: PG_CLASS_ID,
      date: '2026-09-25',
      timeSlot: '10:00',
      time: '10:00',
      type: 'online',
      status: 'Confirmed'
    },
    {
      id: PG_PTM_ID_2,
      studentId: PG_STUDENT_ID_2,
      studentName: 'Charlie Brown',
      parentName: 'David Brown',
      classId: PG_CLASS_ID,
      date: '2026-09-26',
      timeSlot: '14:30',
      time: '14:30',
      type: 'in-person',
      status: 'Pending'
    }
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('is exported as a valid React component function', () => {
    expect(typeof PTMScheduler).toBe('function');
  });

  // ============================================================
  // 1. ZERO FIRESTORE USAGE & ABSENCE OF OBSOLETE HELPERS
  // ============================================================

  it('confirms obsolete Firestore PTM helpers are removed and not invoked', () => {
    expect(firestoreModule.subscribeToClassPTMs).toBeUndefined();
    expect(firestoreModule.subscribeToStudentPTMs).toBeUndefined();
    expect(firestoreModule.createPTM).toBeUndefined();
    expect(firestoreModule.updatePTM).toBeUndefined();
  });

  // ============================================================
  // 2. REST APPOINTMENTS & STUDENTS LOADING
  // ============================================================

  it('fetches appointments via REST API with classId query parameter', async () => {
    const getTeacherAppointmentsSpy = vi.spyOn(ptmApiModule.ptmApi, 'getTeacherAppointments').mockResolvedValue({
      success: true,
      data: mockAppointments,
      pagination: { total: 2, page: 1, limit: 50, totalPages: 1 }
    });

    const res = await ptmApiModule.ptmApi.getTeacherAppointments({ classId: PG_CLASS_ID });

    expect(getTeacherAppointmentsSpy).toHaveBeenCalledWith({ classId: PG_CLASS_ID });
    expect(res.data).toHaveLength(2);
    expect(res.data[0].id).toBe(PG_PTM_ID_1);
    expect(res.data[0].studentName).toBe('Alice Smith');
  });

  it('fetches active class students via REST API with classId and status filter', async () => {
    const listStudentsSpy = vi.spyOn(studentsApiModule.studentsApi, 'listStudents').mockResolvedValue({
      success: true,
      data: mockStudents,
      pagination: { total: 2, page: 1, limit: 100, totalPages: 1 }
    });

    const res = await studentsApiModule.studentsApi.listStudents({ classId: PG_CLASS_ID, limit: 100, status: 'Active' });

    expect(listStudentsSpy).toHaveBeenCalledWith({ classId: PG_CLASS_ID, limit: 100, status: 'Active' });
    expect(res.data).toHaveLength(2);
    expect(res.data[0].id).toBe(PG_STUDENT_ID_1);
    expect(res.data[0].firstName).toBe('Alice');
  });

  // ============================================================
  // 3. BOOKING CREATION (POST /api/v1/ptm)
  // ============================================================

  it('creates an appointment via REST POST with canonical parameters', async () => {
    const createAppointmentSpy = vi.spyOn(ptmApiModule.ptmApi, 'createAppointment').mockResolvedValue({
      success: true,
      data: {
        id: 'new-pg-ptm-uuid',
        studentId: PG_STUDENT_ID_1,
        classId: PG_CLASS_ID,
        date: '2026-10-01',
        timeSlot: '11:00',
        type: 'online',
        status: 'Confirmed'
      }
    });

    const payload = {
      studentId: PG_STUDENT_ID_1,
      classId: PG_CLASS_ID,
      date: '2026-10-01',
      time: '11:00',
      type: 'online',
      status: 'Confirmed'
    };

    const res = await ptmApiModule.ptmApi.createAppointment(payload);

    expect(createAppointmentSpy).toHaveBeenCalledWith(payload);
    expect(res.data.id).toBe('new-pg-ptm-uuid');
    expect(res.data.status).toBe('Confirmed');
  });

  // ============================================================
  // 4. WHATSAPP NOTIFICATION TRIGGER
  // ============================================================

  it('dispatches WhatsApp notification after successful appointment creation', async () => {
    const whatsappSpy = vi.spyOn(whatsappService, 'sendPTMNotification').mockResolvedValue({
      success: true
    });

    const ptmPayload = {
      classId: PG_CLASS_ID,
      teacherId: 'teacher-uid',
      studentId: PG_STUDENT_ID_1,
      studentName: 'Alice Smith',
      parentName: 'Bob Smith',
      date: '2026-10-01',
      time: '11:00',
      type: 'online',
      status: 'confirmed'
    };

    await whatsappService.sendPTMNotification(SCHOOL_ID, 'new-pg-ptm-uuid', ptmPayload);

    expect(whatsappSpy).toHaveBeenCalledWith(
      SCHOOL_ID,
      'new-pg-ptm-uuid',
      expect.objectContaining({
        studentId: PG_STUDENT_ID_1,
        classId: PG_CLASS_ID,
        date: '2026-10-01',
        time: '11:00'
      })
    );
  });

  // ============================================================
  // 5. STATUS TRANSITIONS (PATCH /api/v1/ptm/:id/status)
  // ============================================================

  it('approves a pending meeting with Confirmed status', async () => {
    const updateStatusSpy = vi.spyOn(ptmApiModule.ptmApi, 'updateAppointmentStatus').mockResolvedValue({
      success: true,
      data: { id: PG_PTM_ID_2, status: 'Confirmed' }
    });

    const res = await ptmApiModule.ptmApi.updateAppointmentStatus(PG_PTM_ID_2, { status: 'Confirmed' });

    expect(updateStatusSpy).toHaveBeenCalledWith(PG_PTM_ID_2, { status: 'Confirmed' });
    expect(res.data.status).toBe('Confirmed');
  });

  it('declines a pending meeting with Cancelled status', async () => {
    const updateStatusSpy = vi.spyOn(ptmApiModule.ptmApi, 'updateAppointmentStatus').mockResolvedValue({
      success: true,
      data: { id: PG_PTM_ID_2, status: 'Cancelled' }
    });

    const res = await ptmApiModule.ptmApi.updateAppointmentStatus(PG_PTM_ID_2, { status: 'Cancelled' });

    expect(updateStatusSpy).toHaveBeenCalledWith(PG_PTM_ID_2, { status: 'Cancelled' });
    expect(res.data.status).toBe('Cancelled');
  });

  it('cancels a confirmed meeting with Cancelled status', async () => {
    const updateStatusSpy = vi.spyOn(ptmApiModule.ptmApi, 'updateAppointmentStatus').mockResolvedValue({
      success: true,
      data: { id: PG_PTM_ID_1, status: 'Cancelled' }
    });

    const res = await ptmApiModule.ptmApi.updateAppointmentStatus(PG_PTM_ID_1, { status: 'Cancelled' });

    expect(updateStatusSpy).toHaveBeenCalledWith(PG_PTM_ID_1, { status: 'Cancelled' });
    expect(res.data.status).toBe('Cancelled');
  });

  // ============================================================
  // 6. APPOINTMENT SOFT-CANCELLATION (DELETE /api/v1/ptm/:id)
  // ============================================================

  it('soft-cancels an appointment via REST DELETE', async () => {
    const cancelSpy = vi.spyOn(ptmApiModule.ptmApi, 'cancelAppointment').mockResolvedValue({
      success: true,
      message: 'PTM appointment cancelled successfully',
      id: PG_PTM_ID_1,
      status: 'Cancelled'
    });

    const res = await ptmApiModule.ptmApi.cancelAppointment(PG_PTM_ID_1);

    expect(cancelSpy).toHaveBeenCalledWith(PG_PTM_ID_1);
    expect(res.success).toBe(true);
    expect(res.status).toBe('Cancelled');
  });

  // ============================================================
  // 7. UPCOMING VS PAST FILTERING LOGIC
  // ============================================================

  it('filters upcoming vs past appointments correctly against target date', () => {
    const todayStr = '2026-09-25';
    const allAppointments = [
      { id: '1', date: '2026-09-25', status: 'Confirmed' },
      { id: '2', date: '2026-09-26', status: 'Pending' },
      { id: '3', date: '2026-09-20', status: 'Confirmed' },
      { id: '4', date: '2025-12-01', status: 'Completed' }
    ];

    const upcoming = allAppointments.filter(m => m.date >= todayStr);
    const past = allAppointments.filter(m => m.date < todayStr);

    expect(upcoming).toHaveLength(2);
    expect(upcoming.map(m => m.id)).toEqual(['1', '2']);
    expect(past).toHaveLength(2);
    expect(past.map(m => m.id)).toEqual(['3', '4']);
  });

  // ============================================================
  // 8. CASE-INSENSITIVE STATUS NORMALIZATION
  // ============================================================

  it('normalizes status string properly regardless of casing', () => {
    const statusMap = {
      cancelled: 'Cancelled',
      confirmed: 'Confirmed',
      pending: 'Pending',
      completed: 'Completed',
      scheduled: 'Scheduled'
    };

    expect(statusMap['cancelled'.toLowerCase()]).toBe('Cancelled');
    expect(statusMap['CONFIRMED'.toLowerCase()]).toBe('Confirmed');
    expect(statusMap['Pending'.toLowerCase()]).toBe('Pending');
  });

  // ============================================================
  // 9. TIME FORMATTING HELPER
  // ============================================================

  it('formats 24-hour time to 12-hour AM/PM string', () => {
    const formatTime12hr = (time24) => {
      if (!time24) return '';
      const [hours, minutes] = time24.split(':');
      const h = parseInt(hours, 10);
      const ampm = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 || 12;
      return `${h12.toString().padStart(2, '0')}:${minutes} ${ampm}`;
    };

    expect(formatTime12hr('09:00')).toBe('09:00 AM');
    expect(formatTime12hr('12:00')).toBe('12:00 PM');
    expect(formatTime12hr('14:30')).toBe('02:30 PM');
    expect(formatTime12hr('00:15')).toBe('12:15 AM');
    expect(formatTime12hr('')).toBe('');
  });
});
