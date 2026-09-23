import { describe, it, expect } from 'vitest';
import {
  listAttendanceSessionsSchema,
  createAttendanceSessionSchema,
  updateAttendanceSessionSchema,
  attendanceParamsSchema,
  studentAttendanceParamsSchema,
  dashboardStatsQuerySchema,
  absenteeFlagsQuerySchema,
  resolveAbsenteeFlagSchema
} from '../../../src/modules/attendance/attendance.schemas.js';

describe('Unit: Attendance Schemas Validation — Phase 4C.5', () => {
  const VALID_UUID = '11111111-1111-4111-8111-111111111111';
  const VALID_UUID_2 = '22222222-2222-4222-8222-222222222222';
  const VALID_UUID_3 = '33333333-3333-4333-8333-333333333333';

  describe('1. listAttendanceSessionsSchema', () => {
    it('accepts valid query parameters with ISO dates and pagination', () => {
      const result = listAttendanceSessionsSchema.query.safeParse({
        classId: VALID_UUID,
        sectionId: VALID_UUID_2,
        date: '2026-09-01',
        startDate: '2026-09-01',
        endDate: '2026-09-10',
        session: 'STANDARD',
        page: '1',
        limit: '25',
        sort: 'date',
        order: 'desc'
      });
      expect(result.success).toBe(true);
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(25);
    });

    it('rejects invalid session enum value', () => {
      const result = listAttendanceSessionsSchema.query.safeParse({ session: 'AFTERNOON_EXTRA' });
      expect(result.success).toBe(false);
    });

    it('rejects startDate greater than endDate', () => {
      const result = listAttendanceSessionsSchema.query.safeParse({
        startDate: '2026-09-15',
        endDate: '2026-09-10'
      });
      expect(result.success).toBe(false);
    });

    it('rejects non-numeric pagination and negative limits', () => {
      const result = listAttendanceSessionsSchema.query.safeParse({ page: 'abc', limit: -5 });
      expect(result.success).toBe(false);
    });
  });

  describe('2. attendanceParamsSchema', () => {
    it('accepts valid UUID session ID', () => {
      const result = attendanceParamsSchema.params.safeParse({ id: VALID_UUID });
      expect(result.success).toBe(true);
    });

    it('rejects malformed session UUID', () => {
      const result = attendanceParamsSchema.params.safeParse({ id: 'invalid-uuid-format' });
      expect(result.success).toBe(false);
    });
  });

  describe('3. createAttendanceSessionSchema', () => {
    it('accepts a valid session creation payload', () => {
      const payload = {
        classId: VALID_UUID,
        sectionId: VALID_UUID_2,
        date: '2026-09-05',
        session: 'STANDARD',
        records: [
          { studentId: VALID_UUID, status: 'Present', remark: 'On time' },
          { studentId: VALID_UUID_2, status: 'Absent', remark: 'Sick' },
          { studentId: VALID_UUID_3, status: 'Late', remark: 'Traffic' }
        ]
      };
      const result = createAttendanceSessionSchema.body.safeParse(payload);
      expect(result.success).toBe(true);
      expect(result.data.records).toHaveLength(3);
    });

    it('rejects future dates', () => {
      const futureDate = '2099-12-31';
      const payload = {
        classId: VALID_UUID,
        date: futureDate,
        records: [{ studentId: VALID_UUID, status: 'Present' }]
      };
      const result = createAttendanceSessionSchema.body.safeParse(payload);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('future');
    });

    it('rejects unallowed status values (e.g. Excused, Half Day)', () => {
      const payload = {
        classId: VALID_UUID,
        date: '2026-09-05',
        records: [{ studentId: VALID_UUID, status: 'Excused' }]
      };
      const result = createAttendanceSessionSchema.body.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('rejects empty records array', () => {
      const payload = {
        classId: VALID_UUID,
        date: '2026-09-05',
        records: []
      };
      const result = createAttendanceSessionSchema.body.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('rejects duplicate studentId in single submission payload', () => {
      const payload = {
        classId: VALID_UUID,
        date: '2026-09-05',
        records: [
          { studentId: VALID_UUID, status: 'Present' },
          { studentId: VALID_UUID, status: 'Absent' }
        ]
      };
      const result = createAttendanceSessionSchema.body.safeParse(payload);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('Duplicate student IDs');
    });
  });

  describe('4. updateAttendanceSessionSchema', () => {
    it('accepts valid record updates for an existing session', () => {
      const payload = {
        records: [
          { studentId: VALID_UUID, status: 'Late', remark: 'Arrived 10 mins late' }
        ]
      };
      const result = updateAttendanceSessionSchema.body.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('rejects empty records array in PATCH', () => {
      const result = updateAttendanceSessionSchema.body.safeParse({ records: [] });
      expect(result.success).toBe(false);
    });
  });

  describe('5. dashboardStatsQuerySchema', () => {
    it('accepts valid date or empty query', () => {
      const withDate = dashboardStatsQuerySchema.query.safeParse({ date: '2026-09-05' });
      expect(withDate.success).toBe(true);

      const withoutDate = dashboardStatsQuerySchema.query.safeParse({});
      expect(withoutDate.success).toBe(true);
    });

    it('rejects invalid date format', () => {
      const result = dashboardStatsQuerySchema.query.safeParse({ date: '05-09-2026' });
      expect(result.success).toBe(false);
    });
  });

  describe('6. studentAttendanceParamsSchema', () => {
    it('accepts valid studentId and query filters', () => {
      const result = studentAttendanceParamsSchema.params.safeParse({ studentId: VALID_UUID });
      expect(result.success).toBe(true);

      const queryResult = studentAttendanceParamsSchema.query.safeParse({
        filter: 'monthly',
        academicYear: '2026-27',
        page: '1',
        limit: '10'
      });
      expect(queryResult.success).toBe(true);
    });

    it('rejects invalid filter option', () => {
      const queryResult = studentAttendanceParamsSchema.query.safeParse({ filter: 'yearly_invalid' });
      expect(queryResult.success).toBe(false);
    });
  });

  describe('7. absenteeFlagsQuerySchema and resolveAbsenteeFlagSchema', () => {
    it('accepts valid absentee filter query', () => {
      const result = absenteeFlagsQuerySchema.query.safeParse({
        classId: VALID_UUID,
        month: '2026-09',
        isResolved: 'false',
        page: '1',
        limit: '20'
      });
      expect(result.success).toBe(true);
      expect(result.data.isResolved).toBe(false);
    });

    it('rejects invalid month format', () => {
      const result = absenteeFlagsQuerySchema.query.safeParse({ month: '2026-9' });
      expect(result.success).toBe(false);
    });

    it('accepts valid flag resolution payload', () => {
      const result = resolveAbsenteeFlagSchema.body.safeParse({
        isResolved: true,
        resolutionNotes: 'Medical certificate provided by parents'
      });
      expect(result.success).toBe(true);
    });

    it('rejects resolution notes exceeding 500 characters', () => {
      const result = resolveAbsenteeFlagSchema.body.safeParse({
        isResolved: true,
        resolutionNotes: 'A'.repeat(501)
      });
      expect(result.success).toBe(false);
    });
  });
});
