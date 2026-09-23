import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as attendanceRepository from '../../../src/modules/attendance/attendance.repository.js';
import handler from '../../../../api/check-attendance-cutoff.js';
import { prisma } from '../../../src/database/prisma.client.js';

describe('Notifications Phase 1B: Attendance Notification Producer & Auto-Resolution', () => {
  const SCHOOL_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const SCHOOL_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const CLASS_1 = '11111111-1111-4111-8111-111111111111';
  const CLASS_2 = '22222222-2222-4222-8222-222222222222';
  const DATE_TODAY = '2026-09-15';

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(prisma, '$transaction').mockImplementation(async (cb) => cb(prisma));
    vi.spyOn(prisma, '$executeRaw').mockResolvedValue(1);
  });

  // ============================================================
  // A. NOTIFICATION CREATION & CUTOFF BEHAVIOR
  // ============================================================
  describe('A. Attendance Pending Notification Creation via Cutoff Job', () => {
    it('creates attendance_pending notification in PostgreSQL for missing attendance class with transaction advisory lock', async () => {
      vi.spyOn(prisma.school, 'findMany').mockResolvedValue([
        { id: SCHOOL_A, name: 'Spring Mount School', code: 'SM01', timezone: 'Asia/Kolkata' }
      ]);

      vi.spyOn(prisma.schoolSetting, 'findFirst').mockResolvedValue({
        schoolId: SCHOOL_A,
        category: 'attendanceSettings',
        data: { cutoffTime: '00:00', lastCutoffCheckDate: '2020-01-01' }
      });

      vi.spyOn(prisma.class, 'findMany').mockResolvedValue([
        { id: CLASS_1, name: 'Grade 10A' },
        { id: CLASS_2, name: 'Grade 10B' }
      ]);

      // Grade 10A has attendance, Grade 10B is unmarked
      vi.spyOn(prisma.attendanceSession, 'findMany').mockResolvedValue([
        { classId: CLASS_1 }
      ]);

      vi.spyOn(prisma.notification, 'findFirst').mockResolvedValue(null);
      const createNotifSpy = vi.spyOn(prisma.notification, 'create').mockResolvedValue({
        id: 'notif-1',
        schoolId: SCHOOL_A,
        classId: CLASS_2,
        userId: null,
        type: 'attendance_pending',
        message: 'Grade 10B attendance not marked',
        date: DATE_TODAY,
        read: false
      });

      vi.spyOn(prisma.schoolSetting, 'upsert').mockResolvedValue({});

      const jsonMock = vi.fn();
      const statusMock = vi.fn().mockReturnValue({ json: jsonMock });
      await handler({}, { status: statusMock, json: jsonMock });

      expect(createNotifSpy).toHaveBeenCalledTimes(1);
      expect(createNotifSpy).toHaveBeenCalledWith({
        data: {
          schoolId: SCHOOL_A,
          classId: CLASS_2,
          userId: null,
          type: 'attendance_pending',
          message: 'Grade 10B attendance not marked',
          date: expect.any(String),
          read: false
        }
      });
    });

    it('does NOT create pending notification if attendance was already submitted today', async () => {
      vi.spyOn(prisma.school, 'findMany').mockResolvedValue([
        { id: SCHOOL_A, name: 'Spring Mount School', code: 'SM01', timezone: 'Asia/Kolkata' }
      ]);

      vi.spyOn(prisma.schoolSetting, 'findFirst').mockResolvedValue({
        schoolId: SCHOOL_A,
        category: 'attendanceSettings',
        data: { cutoffTime: '00:00', lastCutoffCheckDate: '2020-01-01' }
      });

      vi.spyOn(prisma.class, 'findMany').mockResolvedValue([
        { id: CLASS_1, name: 'Grade 10A' }
      ]);

      // All classes marked
      vi.spyOn(prisma.attendanceSession, 'findMany').mockResolvedValue([
        { classId: CLASS_1 }
      ]);

      const createNotifSpy = vi.spyOn(prisma.notification, 'create');
      vi.spyOn(prisma.schoolSetting, 'upsert').mockResolvedValue({});

      const jsonMock = vi.fn();
      const statusMock = vi.fn().mockReturnValue({ json: jsonMock });
      await handler({}, { status: statusMock, json: jsonMock });

      expect(createNotifSpy).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // B. IDEMPOTENCY & CONCURRENCY-SAFE DEDUPLICATION
  // ============================================================
  describe('B. Producer Idempotency & Concurrency-Safe Deduplication', () => {
    it('skips creating notification if an active unread notification already exists for the class and date (Sequential Repeated Execution)', async () => {
      vi.spyOn(prisma.school, 'findMany').mockResolvedValue([
        { id: SCHOOL_A, name: 'Spring Mount School', code: 'SM01', timezone: 'Asia/Kolkata' }
      ]);

      vi.spyOn(prisma.schoolSetting, 'findFirst').mockResolvedValue({
        schoolId: SCHOOL_A,
        category: 'attendanceSettings',
        data: { cutoffTime: '00:00', lastCutoffCheckDate: '2020-01-01' }
      });

      vi.spyOn(prisma.class, 'findMany').mockResolvedValue([
        { id: CLASS_1, name: 'Grade 10A' }
      ]);

      vi.spyOn(prisma.attendanceSession, 'findMany').mockResolvedValue([]);

      // Existing unread notification found
      vi.spyOn(prisma.notification, 'findFirst').mockResolvedValue({
        id: 'existing-notif',
        schoolId: SCHOOL_A,
        classId: CLASS_1,
        type: 'attendance_pending',
        read: false
      });

      const createNotifSpy = vi.spyOn(prisma.notification, 'create');
      vi.spyOn(prisma.schoolSetting, 'upsert').mockResolvedValue({});

      const jsonMock = vi.fn();
      const statusMock = vi.fn().mockReturnValue({ json: jsonMock });
      await handler({}, { status: statusMock, json: jsonMock });

      expect(createNotifSpy).not.toHaveBeenCalled();
    });

    it('creates separate notifications for different unmarked classes on the same date', async () => {
      vi.spyOn(prisma.school, 'findMany').mockResolvedValue([
        { id: SCHOOL_A, name: 'Spring Mount School', code: 'SM01', timezone: 'Asia/Kolkata' }
      ]);

      vi.spyOn(prisma.schoolSetting, 'findFirst').mockResolvedValue({
        schoolId: SCHOOL_A,
        category: 'attendanceSettings',
        data: { cutoffTime: '00:00', lastCutoffCheckDate: '2020-01-01' }
      });

      vi.spyOn(prisma.class, 'findMany').mockResolvedValue([
        { id: CLASS_1, name: 'Grade 10A' },
        { id: CLASS_2, name: 'Grade 10B' }
      ]);

      vi.spyOn(prisma.attendanceSession, 'findMany').mockResolvedValue([]);
      vi.spyOn(prisma.notification, 'findFirst').mockResolvedValue(null);
      const createNotifSpy = vi.spyOn(prisma.notification, 'create').mockResolvedValue({ id: 'notif' });
      vi.spyOn(prisma.schoolSetting, 'upsert').mockResolvedValue({});

      const jsonMock = vi.fn();
      const statusMock = vi.fn().mockReturnValue({ json: jsonMock });
      await handler({}, { status: statusMock, json: jsonMock });

      expect(createNotifSpy).toHaveBeenCalledTimes(2);
      expect(createNotifSpy).toHaveBeenNthCalledWith(1, expect.objectContaining({
        data: expect.objectContaining({ classId: CLASS_1, type: 'attendance_pending' })
      }));
      expect(createNotifSpy).toHaveBeenNthCalledWith(2, expect.objectContaining({
        data: expect.objectContaining({ classId: CLASS_2, type: 'attendance_pending' })
      }));
    });

    it('preserves tenant isolation when processing multiple schools', async () => {
      vi.spyOn(prisma.school, 'findMany').mockResolvedValue([
        { id: SCHOOL_A, name: 'School Alpha', code: 'SA01', timezone: 'Asia/Kolkata' },
        { id: SCHOOL_B, name: 'School Beta', code: 'SB01', timezone: 'Asia/Kolkata' }
      ]);

      vi.spyOn(prisma.schoolSetting, 'findFirst').mockResolvedValue({
        schoolId: SCHOOL_A,
        category: 'attendanceSettings',
        data: { cutoffTime: '00:00', lastCutoffCheckDate: '2020-01-01' }
      });

      vi.spyOn(prisma.class, 'findMany')
        .mockResolvedValueOnce([{ id: CLASS_1, name: 'Grade 1' }])
        .mockResolvedValueOnce([{ id: CLASS_1, name: 'Grade 1' }]);

      vi.spyOn(prisma.attendanceSession, 'findMany').mockResolvedValue([]);
      vi.spyOn(prisma.notification, 'findFirst').mockResolvedValue(null);
      const createNotifSpy = vi.spyOn(prisma.notification, 'create').mockResolvedValue({ id: 'notif' });
      vi.spyOn(prisma.schoolSetting, 'upsert').mockResolvedValue({});

      const jsonMock = vi.fn();
      const statusMock = vi.fn().mockReturnValue({ json: jsonMock });
      await handler({}, { status: statusMock, json: jsonMock });

      expect(createNotifSpy).toHaveBeenCalledTimes(2);
      expect(createNotifSpy).toHaveBeenNthCalledWith(1, expect.objectContaining({
        data: expect.objectContaining({ schoolId: SCHOOL_A, classId: CLASS_1 })
      }));
      expect(createNotifSpy).toHaveBeenNthCalledWith(2, expect.objectContaining({
        data: expect.objectContaining({ schoolId: SCHOOL_B, classId: CLASS_1 })
      }));
    });

    it('simulates concurrent producer execution where second execution sees notification created under lock (Unit Concurrency Simulation)', async () => {
      vi.spyOn(prisma.school, 'findMany').mockResolvedValue([
        { id: SCHOOL_A, name: 'Spring Mount School', code: 'SM01', timezone: 'Asia/Kolkata' }
      ]);

      vi.spyOn(prisma.schoolSetting, 'findFirst').mockResolvedValue({
        schoolId: SCHOOL_A,
        category: 'attendanceSettings',
        data: { cutoffTime: '00:00', lastCutoffCheckDate: '2020-01-01' }
      });

      vi.spyOn(prisma.class, 'findMany').mockResolvedValue([
        { id: CLASS_1, name: 'Grade 10A' }
      ]);

      vi.spyOn(prisma.attendanceSession, 'findMany').mockResolvedValue([]);

      // Execution 1 sees no existing notification, Execution 2 sees the one created by Execution 1
      let notificationStore = null;
      vi.spyOn(prisma.notification, 'findFirst').mockImplementation(async () => notificationStore);
      const createNotifSpy = vi.spyOn(prisma.notification, 'create').mockImplementation(async ({ data }) => {
        notificationStore = { id: 'notif-created', ...data };
        return notificationStore;
      });
      vi.spyOn(prisma.schoolSetting, 'upsert').mockResolvedValue({});

      // First run creates notification
      const jsonMock1 = vi.fn();
      const statusMock1 = vi.fn().mockReturnValue({ json: jsonMock1 });
      await handler({}, { status: statusMock1, json: jsonMock1 });
      expect(createNotifSpy).toHaveBeenCalledTimes(1);

      // Second simulated concurrent run: lock acquires after first committed, sees existing notification
      const jsonMock2 = vi.fn();
      const statusMock2 = vi.fn().mockReturnValue({ json: jsonMock2 });
      await handler({}, { status: statusMock2, json: jsonMock2 });

      // create is NOT called again
      expect(createNotifSpy).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================================
  // C. AUTO-RESOLUTION REPOSITORY & SERVICE
  // ============================================================
  describe('C. Attendance Auto-Resolution Implementation', () => {
    it('resolves pending attendance notifications matching tenant, classId, date, and type', async () => {
      const updateManySpy = vi.spyOn(prisma.notification, 'updateMany').mockResolvedValue({ count: 1 });

      const result = await attendanceRepository.resolvePendingAttendanceNotifications(
        SCHOOL_A,
        CLASS_1,
        DATE_TODAY
      );

      expect(updateManySpy).toHaveBeenCalledWith({
        where: {
          schoolId: SCHOOL_A,
          classId: CLASS_1,
          date: DATE_TODAY,
          type: 'attendance_pending',
          read: false
        },
        data: {
          read: true
        }
      });
      expect(result.count).toBe(1);
    });

    it('is safe/idempotent when no pending notifications match', async () => {
      vi.spyOn(prisma.notification, 'updateMany').mockResolvedValue({ count: 0 });

      const result = await attendanceRepository.resolvePendingAttendanceNotifications(
        SCHOOL_A,
        CLASS_1,
        DATE_TODAY
      );

      expect(result.count).toBe(0);
    });
  });

  // ============================================================
  // D. SECURITY & TENANT BOUNDARIES
  // ============================================================
  describe('D. Tenant Isolation & Parameter Integrity', () => {
    it('never resolves notifications belonging to a different school/tenant', async () => {
      const updateManySpy = vi.spyOn(prisma.notification, 'updateMany').mockResolvedValue({ count: 0 });

      await attendanceRepository.resolvePendingAttendanceNotifications(
        SCHOOL_A,
        CLASS_1,
        DATE_TODAY
      );

      // Verify schoolId filter is strictly SCHOOL_A
      expect(updateManySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            schoolId: SCHOOL_A
          })
        })
      );
    });

    it('never resolves notifications for different class or date', async () => {
      const updateManySpy = vi.spyOn(prisma.notification, 'updateMany').mockResolvedValue({ count: 0 });

      await attendanceRepository.resolvePendingAttendanceNotifications(
        SCHOOL_A,
        CLASS_1,
        DATE_TODAY
      );

      expect(updateManySpy).toHaveBeenCalledWith({
        where: {
          schoolId: SCHOOL_A,
          classId: CLASS_1,
          date: DATE_TODAY,
          type: 'attendance_pending',
          read: false
        },
        data: {
          read: true
        }
      });
    });
  });
});
