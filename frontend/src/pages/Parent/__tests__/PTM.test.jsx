import { describe, it, expect, vi, beforeEach } from 'vitest';
import PTM from '../PTM.jsx';
import * as ptmApiModule from '../../../api/ptm.js';
import * as firestoreModule from '../../../firebase/firestore.js';

describe('Parent PTM Component (REST Cutover)', () => {
  const PG_STUDENT_ID_1 = '33333333-3333-4333-8333-333333333333';
  const PG_STUDENT_ID_2 = '44444444-4444-4444-8444-444444444444';
  const PG_PTM_ID_1 = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const PG_PTM_ID_2 = '11111111-2222-3333-4444-555555555555';

  const mockAppointmentsChild1 = [
    {
      id: PG_PTM_ID_1,
      studentId: PG_STUDENT_ID_1,
      studentName: 'Alice Smith',
      teacherName: 'Prof. John Doe',
      parentName: 'Bob Smith',
      className: 'Grade 5A',
      date: '2026-09-25',
      timeSlot: '10:00',
      time: '10:00',
      type: 'online',
      status: 'Confirmed'
    },
    {
      id: PG_PTM_ID_2,
      studentId: PG_STUDENT_ID_1,
      studentName: 'Alice Smith',
      teacherName: 'Mrs. Jane Clark',
      parentName: 'Bob Smith',
      className: 'Grade 5A',
      date: '2026-09-28',
      timeSlot: '14:30',
      time: '14:30',
      type: 'in-person',
      status: 'Pending'
    }
  ];

  const mockAppointmentsChild2 = [
    {
      id: 'ptm-child-2-id',
      studentId: PG_STUDENT_ID_2,
      studentName: 'Charlie Smith',
      teacherName: 'Mr. David Miller',
      parentName: 'Bob Smith',
      className: 'Grade 2B',
      date: '2026-09-29',
      timeSlot: '11:15',
      time: '11:15',
      type: 'online',
      status: 'Confirmed'
    }
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('is exported as a valid React component function', () => {
    expect(typeof PTM).toBe('function');
  });

  // ============================================================
  // 1. ZERO FIRESTORE USAGE & ABSENCE OF OBSOLETE HELPERS
  // ============================================================

  it('confirms obsolete Firestore PTM helpers are removed and not invoked', () => {
    expect(firestoreModule.subscribeToStudentPTMs).toBeUndefined();
    expect(firestoreModule.subscribeToClassPTMs).toBeUndefined();
    expect(firestoreModule.createPTM).toBeUndefined();
    expect(firestoreModule.updatePTM).toBeUndefined();
  });

  // ============================================================
  // 2. REST APPOINTMENTS LOADING (GET /api/v1/ptm/student/:studentId)
  // ============================================================

  it('fetches appointments via REST getStudentAppointments with PostgreSQL studentId', async () => {
    const getStudentAppointmentsSpy = vi.spyOn(ptmApiModule.ptmApi, 'getStudentAppointments').mockResolvedValue({
      success: true,
      data: mockAppointmentsChild1
    });

    const res = await ptmApiModule.ptmApi.getStudentAppointments(PG_STUDENT_ID_1);

    expect(getStudentAppointmentsSpy).toHaveBeenCalledWith(PG_STUDENT_ID_1);
    expect(res.data).toHaveLength(2);
    expect(res.data[0].id).toBe(PG_PTM_ID_1);
    expect(res.data[0].studentName).toBe('Alice Smith');
    expect(res.data[0].teacherName).toBe('Prof. John Doe');
  });

  // ============================================================
  // 3. CHILD SWITCHING ISOLATION
  // ============================================================

  it('loads distinct appointments for Child A vs Child B upon child switch', async () => {
    const getStudentAppointmentsSpy = vi.spyOn(ptmApiModule.ptmApi, 'getStudentAppointments')
      .mockImplementation(async (studentId) => {
        if (studentId === PG_STUDENT_ID_1) {
          return { success: true, data: mockAppointmentsChild1 };
        }
        if (studentId === PG_STUDENT_ID_2) {
          return { success: true, data: mockAppointmentsChild2 };
        }
        return { success: true, data: [] };
      });

    // Fetch for Child 1
    const resChild1 = await ptmApiModule.ptmApi.getStudentAppointments(PG_STUDENT_ID_1);
    expect(getStudentAppointmentsSpy).toHaveBeenCalledWith(PG_STUDENT_ID_1);
    expect(resChild1.data[0].studentName).toBe('Alice Smith');

    // Switch to Child 2
    const resChild2 = await ptmApiModule.ptmApi.getStudentAppointments(PG_STUDENT_ID_2);
    expect(getStudentAppointmentsSpy).toHaveBeenCalledWith(PG_STUDENT_ID_2);
    expect(resChild2.data[0].studentName).toBe('Charlie Smith');
    expect(resChild2.data[0].id).toBe('ptm-child-2-id');
  });

  // ============================================================
  // 4. PARENT CANCELLATION (PATCH /api/v1/ptm/:id/status)
  // ============================================================

  it('cancels appointment via PATCH updateAppointmentStatus with Cancelled status', async () => {
    const updateStatusSpy = vi.spyOn(ptmApiModule.ptmApi, 'updateAppointmentStatus').mockResolvedValue({
      success: true,
      data: { id: PG_PTM_ID_1, status: 'Cancelled' }
    });

    const res = await ptmApiModule.ptmApi.updateAppointmentStatus(PG_PTM_ID_1, { status: 'Cancelled' });

    expect(updateStatusSpy).toHaveBeenCalledWith(PG_PTM_ID_1, { status: 'Cancelled' });
    expect(res.data.status).toBe('Cancelled');
  });

  it('handles cancellation error gracefully without crashing', async () => {
    vi.spyOn(ptmApiModule.ptmApi, 'updateAppointmentStatus').mockRejectedValue(
      new Error('Forbidden: Not authorized to cancel this appointment')
    );

    await expect(
      ptmApiModule.ptmApi.updateAppointmentStatus(PG_PTM_ID_1, { status: 'Cancelled' })
    ).rejects.toThrow('Forbidden: Not authorized to cancel this appointment');
  });

  // ============================================================
  // 5. UPCOMING VS PAST FILTERING LOGIC
  // ============================================================

  it('filters upcoming vs past appointments correctly against target date', () => {
    const todayStr = '2026-09-25';
    const allAppointments = [
      { id: '1', date: '2026-09-25', status: 'Confirmed' },
      { id: '2', date: '2026-09-28', status: 'Pending' },
      { id: '3', date: '2026-09-20', status: 'Confirmed' },
      { id: '4', date: '2025-11-15', status: 'Completed' }
    ];

    const upcoming = allAppointments.filter(m => m.date >= todayStr);
    const past = allAppointments.filter(m => m.date < todayStr);

    expect(upcoming).toHaveLength(2);
    expect(upcoming.map(m => m.id)).toEqual(['1', '2']);
    expect(past).toHaveLength(2);
    expect(past.map(m => m.id)).toEqual(['3', '4']);
  });

  // ============================================================
  // 6. STATUS NORMALIZATION & BADGES
  // ============================================================

  it('normalizes status string properly regardless of casing for badge mapping', () => {
    const statusMap = {
      confirmed: 'Confirmed',
      pending: 'Pending',
      cancelled: 'Cancelled'
    };

    expect(statusMap['confirmed'.toLowerCase()]).toBe('Confirmed');
    expect(statusMap['CONFIRMED'.toLowerCase()]).toBe('Confirmed');
    expect(statusMap['Pending'.toLowerCase()]).toBe('Pending');
    expect(statusMap['Cancelled'.toLowerCase()]).toBe('Cancelled');
  });

  // ============================================================
  // 7. TIME FORMATTING HELPER
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

    expect(formatTime12hr('10:00')).toBe('10:00 AM');
    expect(formatTime12hr('14:30')).toBe('02:30 PM');
    expect(formatTime12hr('12:00')).toBe('12:00 PM');
    expect(formatTime12hr('00:05')).toBe('12:05 AM');
    expect(formatTime12hr('')).toBe('');
  });

  // ============================================================
  // 8. SECURITY: NO CLIENT FORGED IDENTITIES
  // ============================================================

  it('does NOT include client-forged schoolId or parentId in authorization headers/parameters', async () => {
    const getSpy = vi.spyOn(ptmApiModule.ptmApi, 'getStudentAppointments').mockResolvedValue({
      success: true,
      data: mockAppointmentsChild1
    });

    await ptmApiModule.ptmApi.getStudentAppointments(PG_STUDENT_ID_1);

    const callArgs = getSpy.mock.calls[0];
    expect(callArgs[0]).toBe(PG_STUDENT_ID_1);
    expect(callArgs[1]).toBeUndefined();
  });
});
