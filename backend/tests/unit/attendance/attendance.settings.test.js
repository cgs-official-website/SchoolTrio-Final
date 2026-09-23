import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as attendanceService from '../../../src/modules/attendance/attendance.service.js';
import { prisma } from '../../../src/database/prisma.client.js';

describe('Attendance Settings Service (PostgreSQL Backed)', () => {
  const schoolId = '25e9637a-7fa4-4ac2-b43d-b4c0edcf2932';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns default attendance settings when no record exists', async () => {
    vi.spyOn(prisma.schoolSetting, 'findFirst').mockResolvedValue(null);
    vi.spyOn(prisma.school, 'findFirst').mockResolvedValue({ timezone: 'Asia/Kolkata' });

    const settings = await attendanceService.getAttendanceSettings(schoolId);

    expect(settings).toEqual({
      cutoffTime: '09:30',
      lateThreshold: '09:30',
      absenteeThreshold: 2,
      workingHoursStart: '09:00',
      workingHoursEnd: '16:00',
      timezone: 'Asia/Kolkata',
      lastCutoffCheckDate: null
    });
  });

  it('returns stored attendance settings from PostgreSQL SchoolSetting', async () => {
    vi.spyOn(prisma.schoolSetting, 'findFirst').mockResolvedValue({
      id: 'sett-uuid-1',
      schoolId,
      category: 'attendanceSettings',
      data: {
        cutoffTime: '10:00',
        lateThreshold: '10:00',
        absenteeThreshold: 3,
        workingHoursStart: '08:30',
        workingHoursEnd: '15:30',
        timezone: 'Asia/Kolkata',
        lastCutoffCheckDate: '2026-09-15'
      }
    });
    vi.spyOn(prisma.school, 'findFirst').mockResolvedValue({ timezone: 'Asia/Kolkata' });

    const settings = await attendanceService.getAttendanceSettings(schoolId);

    expect(settings.cutoffTime).toBe('10:00');
    expect(settings.absenteeThreshold).toBe(3);
    expect(settings.workingHoursStart).toBe('08:30');
    expect(settings.lastCutoffCheckDate).toBe('2026-09-15');
  });

  it('updates and persists attendance settings with merge semantics', async () => {
    vi.spyOn(prisma.schoolSetting, 'findFirst').mockResolvedValue({
      id: 'sett-uuid-1',
      schoolId,
      category: 'attendanceSettings',
      data: {
        cutoffTime: '09:30',
        absenteeThreshold: 2,
        timezone: 'Asia/Kolkata'
      }
    });

    const upsertSpy = vi.spyOn(prisma.schoolSetting, 'upsert').mockResolvedValue({
      id: 'sett-uuid-1',
      schoolId,
      category: 'attendanceSettings',
      data: {
        cutoffTime: '09:45',
        lateThreshold: '09:45',
        absenteeThreshold: 4,
        workingHoursStart: '09:00',
        workingHoursEnd: '16:00',
        timezone: 'Asia/Kolkata'
      }
    });

    const updated = await attendanceService.updateAttendanceSettings(schoolId, {
      cutoffTime: '09:45',
      lateThreshold: '09:45',
      absenteeThreshold: 4
    }, { email: 'admin@school.edu', systemRole: 'admin' });

    expect(upsertSpy).toHaveBeenCalledWith({
      where: {
        schoolId_category: {
          schoolId,
          category: 'attendanceSettings'
        }
      },
      create: {
        schoolId,
        category: 'attendanceSettings',
        data: expect.objectContaining({
          cutoffTime: '09:45',
          lateThreshold: '09:45',
          absenteeThreshold: 4
        })
      },
      update: {
        data: expect.objectContaining({
          cutoffTime: '09:45',
          lateThreshold: '09:45',
          absenteeThreshold: 4
        })
      }
    });

    expect(updated.cutoffTime).toBe('09:45');
    expect(updated.absenteeThreshold).toBe(4);
  });
});
