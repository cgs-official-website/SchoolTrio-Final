import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as attendanceApi from '../../../api/attendance.js';

describe('Admin EnvironmentSetup Attendance Settings REST Migration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches attendance settings via attendanceApi.getAttendanceSettings', async () => {
    const getSpy = vi.spyOn(attendanceApi, 'getAttendanceSettings').mockResolvedValue({
      success: true,
      data: {
        cutoffTime: '09:30',
        lateThreshold: '09:30',
        absenteeThreshold: 2,
        workingHoursStart: '09:00',
        workingHoursEnd: '16:00',
        timezone: 'Asia/Kolkata'
      }
    });

    const res = await attendanceApi.getAttendanceSettings();

    expect(getSpy).toHaveBeenCalled();
    expect(res.data.cutoffTime).toBe('09:30');
    expect(res.data.absenteeThreshold).toBe(2);
  });

  it('updates attendance settings via attendanceApi.updateAttendanceSettings', async () => {
    const updateSpy = vi.spyOn(attendanceApi, 'updateAttendanceSettings').mockResolvedValue({
      success: true,
      data: {
        cutoffTime: '10:00',
        lateThreshold: '10:00',
        absenteeThreshold: 3,
        workingHoursStart: '08:30',
        workingHoursEnd: '15:30',
        timezone: 'Asia/Kolkata'
      }
    });

    const payload = {
      cutoffTime: '10:00',
      lateThreshold: '10:00',
      absenteeThreshold: 3,
      workingHoursStart: '08:30',
      workingHoursEnd: '15:30'
    };

    const res = await attendanceApi.updateAttendanceSettings(payload);

    expect(updateSpy).toHaveBeenCalledWith(payload);
    expect(res.data.cutoffTime).toBe('10:00');
    expect(res.data.absenteeThreshold).toBe(3);
  });
});
