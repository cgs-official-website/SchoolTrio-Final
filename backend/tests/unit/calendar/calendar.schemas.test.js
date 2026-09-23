import { describe, it, expect } from 'vitest';
import {
  calendarDateSchema,
  listCalendarEventsSchema,
  createCalendarEventSchema,
  updateCalendarEventSchema,
  calendarEventIdParamSchema
} from '../../../src/modules/calendar/calendar.schemas.js';

describe('Academic Calendar Schemas Unit Tests', () => {
  describe('calendarDateSchema', () => {
    it('accepts valid calendar dates', () => {
      expect(calendarDateSchema.safeParse('2026-09-16').success).toBe(true);
      expect(calendarDateSchema.safeParse('2024-02-29').success).toBe(true); // Leap year
      expect(calendarDateSchema.safeParse('2026-12-31').success).toBe(true);
      expect(calendarDateSchema.safeParse('2026-01-01').success).toBe(true);
    });

    it('rejects invalid format dates', () => {
      expect(calendarDateSchema.safeParse('16-09-2026').success).toBe(false);
      expect(calendarDateSchema.safeParse('2026/09/16').success).toBe(false);
      expect(calendarDateSchema.safeParse('2026-9-16').success).toBe(false);
      expect(calendarDateSchema.safeParse('invalid-date').success).toBe(false);
      expect(calendarDateSchema.safeParse('').success).toBe(false);
    });

    it('rejects impossible calendar dates', () => {
      expect(calendarDateSchema.safeParse('2026-02-29').success).toBe(false); // 2026 is not a leap year
      expect(calendarDateSchema.safeParse('2026-02-30').success).toBe(false);
      expect(calendarDateSchema.safeParse('2026-04-31').success).toBe(false); // April has 30 days
      expect(calendarDateSchema.safeParse('2026-06-31').success).toBe(false); // June has 30 days
      expect(calendarDateSchema.safeParse('2026-13-01').success).toBe(false); // Month 13
      expect(calendarDateSchema.safeParse('2026-00-10').success).toBe(false); // Month 0
    });
  });

  describe('createCalendarEventSchema', () => {
    it('accepts valid single-day event payload', () => {
      const payload = {
        title: 'Independence Day Celebration',
        date: '2026-08-15',
        type: 'event',
        description: 'Flag hoisting ceremony at 8:00 AM',
        audience: 'all'
      };
      const parsed = createCalendarEventSchema.body.safeParse(payload);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.title).toBe('Independence Day Celebration');
        expect(parsed.data.audience).toBe('all');
      }
    });

    it('accepts valid multi-day holiday payload with endDate', () => {
      const payload = {
        title: 'Diwali Holidays',
        date: '2026-11-08',
        endDate: '2026-11-12',
        type: 'holiday',
        audience: 'all'
      };
      const parsed = createCalendarEventSchema.body.safeParse(payload);
      expect(parsed.success).toBe(true);
    });

    it('defaults audience to "all" when omitted', () => {
      const payload = {
        title: 'Staff Meeting',
        date: '2026-09-20',
        type: 'event'
      };
      const parsed = createCalendarEventSchema.body.safeParse(payload);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.audience).toBe('all');
      }
    });

    it('accepts specific audiences (teachers, students, parents)', () => {
      ['all', 'teachers', 'students', 'parents'].forEach(aud => {
        const payload = {
          title: 'Test Meeting',
          date: '2026-09-20',
          type: 'event',
          audience: aud
        };
        expect(createCalendarEventSchema.body.safeParse(payload).success).toBe(true);
      });
    });

    it('rejects invalid audience', () => {
      const payload = {
        title: 'Staff Meeting',
        date: '2026-09-20',
        type: 'event',
        audience: 'invalid_audience'
      };
      expect(createCalendarEventSchema.body.safeParse(payload).success).toBe(false);
    });

    it('rejects invalid event type', () => {
      const payload = {
        title: 'Invalid Type Event',
        date: '2026-09-20',
        type: 'party'
      };
      expect(createCalendarEventSchema.body.safeParse(payload).success).toBe(false);
    });

    it('rejects empty or whitespace title', () => {
      const payload = {
        title: '   ',
        date: '2026-09-20',
        type: 'event'
      };
      expect(createCalendarEventSchema.body.safeParse(payload).success).toBe(false);
    });

    it('rejects title longer than 200 chars', () => {
      const payload = {
        title: 'A'.repeat(201),
        date: '2026-09-20',
        type: 'event'
      };
      expect(createCalendarEventSchema.body.safeParse(payload).success).toBe(false);
    });

    it('rejects endDate earlier than date', () => {
      const payload = {
        title: 'Backwards Event',
        date: '2026-09-20',
        endDate: '2026-09-19',
        type: 'event'
      };
      const parsed = createCalendarEventSchema.body.safeParse(payload);
      expect(parsed.success).toBe(false);
    });
  });

  describe('updateCalendarEventSchema', () => {
    it('accepts valid partial update', () => {
      const payload = {
        title: 'Updated Event Name',
        type: 'exam'
      };
      const parsed = updateCalendarEventSchema.body.safeParse(payload);
      expect(parsed.success).toBe(true);
    });

    it('accepts valid date and endDate update', () => {
      const payload = {
        date: '2026-10-01',
        endDate: '2026-10-05'
      };
      const parsed = updateCalendarEventSchema.body.safeParse(payload);
      expect(parsed.success).toBe(true);
    });

    it('rejects update with endDate before date in same payload', () => {
      const payload = {
        date: '2026-10-05',
        endDate: '2026-10-01'
      };
      const parsed = updateCalendarEventSchema.body.safeParse(payload);
      expect(parsed.success).toBe(false);
    });

    it('validates params schema', () => {
      expect(updateCalendarEventSchema.params.safeParse({ id: '00000000-0000-0000-0000-000000000001' }).success).toBe(true);
      expect(updateCalendarEventSchema.params.safeParse({ id: 'not-a-uuid' }).success).toBe(false);
    });
  });

  describe('listCalendarEventsSchema', () => {
    it('accepts empty query parameters', () => {
      const parsed = listCalendarEventsSchema.query.safeParse({});
      expect(parsed.success).toBe(true);
    });

    it('accepts valid date range and type filtering', () => {
      const parsed = listCalendarEventsSchema.query.safeParse({
        startDate: '2026-09-01',
        endDate: '2026-09-30',
        type: 'holiday',
        audience: 'all'
      });
      expect(parsed.success).toBe(true);
    });

    it('rejects query where endDate is before startDate', () => {
      const parsed = listCalendarEventsSchema.query.safeParse({
        startDate: '2026-09-30',
        endDate: '2026-09-01'
      });
      expect(parsed.success).toBe(false);
    });
  });

  describe('calendarEventIdParamSchema', () => {
    it('accepts valid UUID', () => {
      expect(calendarEventIdParamSchema.params.safeParse({ id: '12ed5791-5bcc-4ebd-8792-813e472b3f68' }).success).toBe(true);
    });

    it('rejects non-UUID string', () => {
      expect(calendarEventIdParamSchema.params.safeParse({ id: 'abc-123' }).success).toBe(false);
    });
  });
});
