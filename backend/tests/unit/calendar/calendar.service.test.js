import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as calendarService from '../../../src/modules/calendar/calendar.service.js';
import * as calendarRepository from '../../../src/modules/calendar/calendar.repository.js';
import * as auditRepository from '../../../src/modules/audit/audit.repository.js';
import {
  ValidationError,
  NotFoundError
} from '../../../src/utils/app-error.js';

describe('Academic Calendar Service Unit Tests', () => {
  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
  const EVENT_ID = '22222222-2222-4222-8222-222222222222';
  const ADMIN_ACTOR = { id: '33333333-3333-4333-8333-333333333333', email: 'admin@school.com', systemRole: 'SCHOOL_ADMIN' };
  const TEACHER_ACTOR = { id: '44444444-4444-4444-8444-444444444444', email: 'teacher@school.com', systemRole: 'TEACHER' };
  const PARENT_ACTOR = { id: '55555555-5555-5555-8555-555555555555', email: 'parent@school.com', systemRole: 'PARENT' };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('listCalendarEvents', () => {
    it('throws ValidationError when schoolId is missing', async () => {
      await expect(calendarService.listCalendarEvents(null, ADMIN_ACTOR))
        .rejects.toThrow(ValidationError);
      await expect(calendarService.listCalendarEvents('', ADMIN_ACTOR))
        .rejects.toThrow('Tenant context required: schoolId is missing');
    });

    it('lists all calendar events for Admin without audience restriction', async () => {
      const mockData = [
        {
          id: EVENT_ID,
          schoolId: SCHOOL_ID,
          title: 'Sports Day',
          date: '2026-10-15',
          endDate: '2026-10-16',
          type: 'event',
          description: 'Annual Sports',
          audience: 'all',
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      const repoSpy = vi.spyOn(calendarRepository, 'listCalendarEvents').mockResolvedValue({
        data: mockData,
        total: 1
      });

      const result = await calendarService.listCalendarEvents(SCHOOL_ID, ADMIN_ACTOR, {
        startDate: '2026-10-01',
        endDate: '2026-10-31'
      });

      expect(repoSpy).toHaveBeenCalledWith(SCHOOL_ID, {
        startDate: '2026-10-01',
        endDate: '2026-10-31',
        type: undefined,
        audience: undefined,
        skip: 0,
        take: 200
      });
      expect(result.data).toHaveLength(1);
      expect(result.data[0].title).toBe('Sports Day');
      expect(result.total).toBe(1);
    });

    it('scopes audience to [all, teachers] for teacher actor if no audience query is provided', async () => {
      const repoSpy = vi.spyOn(calendarRepository, 'listCalendarEvents').mockResolvedValue({
        data: [],
        total: 0
      });

      await calendarService.listCalendarEvents(SCHOOL_ID, TEACHER_ACTOR, {});

      expect(repoSpy).toHaveBeenCalledWith(SCHOOL_ID, expect.objectContaining({
        audience: ['all', 'teachers']
      }));
    });

    it('scopes audience to [all, parents, students] for parent actor if no audience query is provided', async () => {
      const repoSpy = vi.spyOn(calendarRepository, 'listCalendarEvents').mockResolvedValue({
        data: [],
        total: 0
      });

      await calendarService.listCalendarEvents(SCHOOL_ID, PARENT_ACTOR, {});

      expect(repoSpy).toHaveBeenCalledWith(SCHOOL_ID, expect.objectContaining({
        audience: ['all', 'parents', 'students']
      }));
    });
  });

  describe('getCalendarEventById', () => {
    it('throws ValidationError when id or schoolId is missing', async () => {
      await expect(calendarService.getCalendarEventById(null, ADMIN_ACTOR, EVENT_ID))
        .rejects.toThrow(ValidationError);
      await expect(calendarService.getCalendarEventById(SCHOOL_ID, ADMIN_ACTOR, null))
        .rejects.toThrow(ValidationError);
    });

    it('throws NotFoundError when event does not exist', async () => {
      vi.spyOn(calendarRepository, 'findCalendarEventById').mockResolvedValue(null);

      await expect(calendarService.getCalendarEventById(SCHOOL_ID, ADMIN_ACTOR, EVENT_ID))
        .rejects.toThrow(NotFoundError);
    });

    it('returns formatted event when found', async () => {
      const mockEvent = {
        id: EVENT_ID,
        schoolId: SCHOOL_ID,
        title: 'Independence Day',
        date: '2026-08-15',
        endDate: '2026-08-15',
        type: 'holiday',
        description: null,
        audience: 'all',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      vi.spyOn(calendarRepository, 'findCalendarEventById').mockResolvedValue(mockEvent);

      const result = await calendarService.getCalendarEventById(SCHOOL_ID, ADMIN_ACTOR, EVENT_ID);

      expect(result.id).toBe(EVENT_ID);
      expect(result.title).toBe('Independence Day');
      expect(result.endDate).toBe('2026-08-15');
    });
  });

  describe('createCalendarEvent', () => {
    it('throws ValidationError if title, date, or type is missing', async () => {
      await expect(calendarService.createCalendarEvent(SCHOOL_ID, ADMIN_ACTOR, { title: '', date: '2026-09-20', type: 'event' }))
        .rejects.toThrow(ValidationError);
      await expect(calendarService.createCalendarEvent(SCHOOL_ID, ADMIN_ACTOR, { title: 'Test', date: '', type: 'event' }))
        .rejects.toThrow(ValidationError);
      await expect(calendarService.createCalendarEvent(SCHOOL_ID, ADMIN_ACTOR, { title: 'Test', date: '2026-09-20', type: '' }))
        .rejects.toThrow(ValidationError);
    });

    it('throws ValidationError if endDate is earlier than date', async () => {
      await expect(calendarService.createCalendarEvent(SCHOOL_ID, ADMIN_ACTOR, {
        title: 'Invalid Range',
        date: '2026-10-10',
        endDate: '2026-10-09',
        type: 'event'
      })).rejects.toThrow('endDate must be greater than or equal to date');
    });

    it('creates calendar event and records audit log', async () => {
      const payload = {
        title: 'Science Fair',
        date: '2026-11-20',
        endDate: '2026-11-21',
        type: 'event',
        description: 'Annual science exhibition',
        audience: 'all'
      };

      const createdMock = {
        id: EVENT_ID,
        schoolId: SCHOOL_ID,
        ...payload,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const createSpy = vi.spyOn(calendarRepository, 'createCalendarEvent').mockResolvedValue(createdMock);
      const auditSpy = vi.spyOn(auditRepository, 'createAuditLog').mockResolvedValue({});

      const result = await calendarService.createCalendarEvent(SCHOOL_ID, ADMIN_ACTOR, payload);

      expect(createSpy).toHaveBeenCalledWith(SCHOOL_ID, {
        title: 'Science Fair',
        date: '2026-11-20',
        endDate: '2026-11-21',
        type: 'event',
        description: 'Annual science exhibition',
        audience: 'all'
      });
      expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({
        schoolId: SCHOOL_ID,
        entityType: 'AcademicCalendarEvent',
        actionPerformed: 'CALENDAR_EVENT_CREATED'
      }));
      expect(result.id).toBe(EVENT_ID);
      expect(result.title).toBe('Science Fair');
    });

    it('defaults endDate to date when endDate is not provided', async () => {
      const payload = {
        title: 'One Day Workshop',
        date: '2026-09-25',
        type: 'event'
      };

      const createdMock = {
        id: EVENT_ID,
        schoolId: SCHOOL_ID,
        title: 'One Day Workshop',
        date: '2026-09-25',
        endDate: '2026-09-25',
        type: 'event',
        description: null,
        audience: 'all',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const createSpy = vi.spyOn(calendarRepository, 'createCalendarEvent').mockResolvedValue(createdMock);

      const result = await calendarService.createCalendarEvent(SCHOOL_ID, ADMIN_ACTOR, payload);

      expect(createSpy).toHaveBeenCalledWith(SCHOOL_ID, expect.objectContaining({
        date: '2026-09-25',
        endDate: '2026-09-25'
      }));
      expect(result.endDate).toBe('2026-09-25');
    });
  });

  describe('updateCalendarEvent', () => {
    it('throws NotFoundError when target event does not exist', async () => {
      vi.spyOn(calendarRepository, 'findCalendarEventById').mockResolvedValue(null);

      await expect(calendarService.updateCalendarEvent(SCHOOL_ID, ADMIN_ACTOR, EVENT_ID, { title: 'Updated' }))
        .rejects.toThrow(NotFoundError);
    });

    it('validates date cross-consistency during update', async () => {
      const existing = {
        id: EVENT_ID,
        schoolId: SCHOOL_ID,
        title: 'Existing Event',
        date: '2026-10-10',
        endDate: '2026-10-12',
        type: 'event',
        description: null,
        audience: 'all',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      vi.spyOn(calendarRepository, 'findCalendarEventById').mockResolvedValue(existing);

      await expect(calendarService.updateCalendarEvent(SCHOOL_ID, ADMIN_ACTOR, EVENT_ID, {
        date: '2026-10-15' // Without updating endDate, new date > old endDate
      })).rejects.toThrow('endDate must be greater than or equal to date');
    });

    it('updates event and writes audit log on success', async () => {
      const existing = {
        id: EVENT_ID,
        schoolId: SCHOOL_ID,
        title: 'Old Title',
        date: '2026-10-10',
        endDate: '2026-10-12',
        type: 'event',
        description: null,
        audience: 'all',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const updatedMock = {
        ...existing,
        title: 'New Title',
        type: 'exam'
      };

      vi.spyOn(calendarRepository, 'findCalendarEventById').mockResolvedValue(existing);
      const updateSpy = vi.spyOn(calendarRepository, 'updateCalendarEvent').mockResolvedValue(updatedMock);
      const auditSpy = vi.spyOn(auditRepository, 'createAuditLog').mockResolvedValue({});

      const result = await calendarService.updateCalendarEvent(SCHOOL_ID, ADMIN_ACTOR, EVENT_ID, {
        title: 'New Title',
        type: 'exam'
      });

      expect(updateSpy).toHaveBeenCalledWith(SCHOOL_ID, EVENT_ID, {
        title: 'New Title',
        type: 'exam'
      });
      expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({
        schoolId: SCHOOL_ID,
        entityType: 'AcademicCalendarEvent',
        actionPerformed: 'CALENDAR_EVENT_UPDATED'
      }));
      expect(result.title).toBe('New Title');
      expect(result.type).toBe('exam');
    });
  });

  describe('deleteCalendarEvent', () => {
    it('throws NotFoundError when target event does not exist', async () => {
      vi.spyOn(calendarRepository, 'findCalendarEventById').mockResolvedValue(null);

      await expect(calendarService.deleteCalendarEvent(SCHOOL_ID, ADMIN_ACTOR, EVENT_ID))
        .rejects.toThrow(NotFoundError);
    });

    it('deletes event and writes audit log on success', async () => {
      const existing = {
        id: EVENT_ID,
        schoolId: SCHOOL_ID,
        title: 'Event To Delete',
        date: '2026-10-10',
        endDate: '2026-10-10',
        type: 'holiday',
        description: null,
        audience: 'all',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      vi.spyOn(calendarRepository, 'findCalendarEventById').mockResolvedValue(existing);
      const deleteSpy = vi.spyOn(calendarRepository, 'deleteCalendarEvent').mockResolvedValue(existing);
      const auditSpy = vi.spyOn(auditRepository, 'createAuditLog').mockResolvedValue({});

      const result = await calendarService.deleteCalendarEvent(SCHOOL_ID, ADMIN_ACTOR, EVENT_ID);

      expect(deleteSpy).toHaveBeenCalledWith(SCHOOL_ID, EVENT_ID);
      expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({
        schoolId: SCHOOL_ID,
        entityType: 'AcademicCalendarEvent',
        actionPerformed: 'CALENDAR_EVENT_DELETED'
      }));
      expect(result.success).toBe(true);
    });
  });
});
