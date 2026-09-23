import { describe, it, expect, vi, beforeEach } from 'vitest';
import handler from '../../../../api/check-attendance-cutoff.js';
import { prisma } from '../../../src/database/prisma.client.js';

describe('Attendance Cutoff Job (PostgreSQL Backed)', () => {
  const schoolId = '25e9637a-7fa4-4ac2-b43d-b4c0edcf2932';

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(prisma, '$transaction').mockImplementation(async (cb) => cb(prisma));
    vi.spyOn(prisma, '$executeRaw').mockResolvedValue(1);
  });

  it('skips schools that were already checked today (Idempotency)', async () => {
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

    vi.spyOn(prisma.school, 'findMany').mockResolvedValue([
      { id: schoolId, name: 'Spring Mount Valley School', code: 'SchoolS024', timezone: 'Asia/Kolkata', legacyFirestoreId: 'SchoolS024' }
    ]);

    vi.spyOn(prisma.schoolSetting, 'findFirst').mockResolvedValue({
      id: 'sett-1',
      schoolId,
      category: 'attendanceSettings',
      data: {
        cutoffTime: '00:00', // guarantees past cutoff
        lastCutoffCheckDate: todayStr
      }
    });

    const jsonMock = vi.fn();
    const statusMock = vi.fn().mockReturnValue({ json: jsonMock });
    const req = {};
    const res = { status: statusMock, json: jsonMock };

    await handler(req, res);

    expect(statusMock).toHaveBeenCalledWith(200);
    expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      results: [
        expect.objectContaining({
          schoolId,
          status: 'SKIPPED_ALREADY_CHECKED_TODAY'
        })
      ]
    }));
  });

  it('skips schools when current time is before cutoff time', async () => {
    vi.spyOn(prisma.school, 'findMany').mockResolvedValue([
      { id: schoolId, name: 'Spring Mount Valley School', code: 'SchoolS024', timezone: 'Asia/Kolkata', legacyFirestoreId: 'SchoolS024' }
    ]);

    vi.spyOn(prisma.schoolSetting, 'findFirst').mockResolvedValue({
      id: 'sett-1',
      schoolId,
      category: 'attendanceSettings',
      data: {
        cutoffTime: '23:59', // guarantees before cutoff
        lastCutoffCheckDate: '2020-01-01'
      }
    });

    const jsonMock = vi.fn();
    const statusMock = vi.fn().mockReturnValue({ json: jsonMock });
    const req = {};
    const res = { status: statusMock, json: jsonMock };

    await handler(req, res);

    expect(statusMock).toHaveBeenCalledWith(200);
    expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      results: [
        expect.objectContaining({
          schoolId,
          status: 'SKIPPED_BEFORE_CUTOFF'
        })
      ]
    }));
  });

  it('processes unmarked classes and updates lastCutoffCheckDate in PostgreSQL', async () => {
    vi.spyOn(prisma.school, 'findMany').mockResolvedValue([
      { id: schoolId, name: 'Spring Mount Valley School', code: 'SchoolS024', timezone: 'Asia/Kolkata', legacyFirestoreId: 'SchoolS024' }
    ]);

    vi.spyOn(prisma.schoolSetting, 'findFirst').mockResolvedValue({
      id: 'sett-1',
      schoolId,
      category: 'attendanceSettings',
      data: {
        cutoffTime: '00:00', // guarantees past cutoff
        lastCutoffCheckDate: '2020-01-01'
      }
    });

    const CLASS_1_ID = '11111111-1111-4111-8111-111111111111';
    const CLASS_2_ID = '22222222-2222-4222-8222-222222222222';

    vi.spyOn(prisma.class, 'findMany').mockResolvedValue([
      { id: CLASS_1_ID, name: 'Grade 5A' },
      { id: CLASS_2_ID, name: 'Grade 5B' }
    ]);

    // Grade 5A has session today, Grade 5B does not
    vi.spyOn(prisma.attendanceSession, 'findMany').mockResolvedValue([
      { classId: CLASS_1_ID }
    ]);

    vi.spyOn(prisma.notification, 'findFirst').mockResolvedValue(null);
    vi.spyOn(prisma.notification, 'create').mockResolvedValue({ id: 'notif-1' });

    const upsertSpy = vi.spyOn(prisma.schoolSetting, 'upsert').mockResolvedValue({});

    const jsonMock = vi.fn();
    const statusMock = vi.fn().mockReturnValue({ json: jsonMock });
    const req = {};
    const res = { status: statusMock, json: jsonMock };

    await handler(req, res);

    expect(statusMock).toHaveBeenCalledWith(200);
    expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      results: [
        expect.objectContaining({
          schoolId,
          status: 'PROCESSED',
          unmarkedClassesCount: 1,
          unmarkedClasses: ['Grade 5B']
        })
      ]
    }));

    expect(upsertSpy).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        schoolId_category: {
          schoolId,
          category: 'attendanceSettings'
        }
      }
    }));
  });
});
