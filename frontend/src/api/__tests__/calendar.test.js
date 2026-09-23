import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as clientModule from '../client.js';
import {
  listEvents,
  getEvent,
  createEvent,
  updateEvent,
  deleteEvent,
  calendarApi
} from '../calendar.js';

describe('Academic Calendar API Client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('lists calendar events with query parameters', async () => {
    const mockEvents = [
      { id: 'cal-1', title: 'Sports Day', date: '2026-10-15', endDate: '2026-10-15', type: 'event' }
    ];
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: mockEvents,
      total: 1,
      page: 1,
      limit: 200
    });

    const res = await listEvents({ startDate: '2026-10-01', endDate: '2026-10-31', type: 'event', audience: 'all' });
    expect(spy).toHaveBeenCalledWith('/api/v1/calendar/events?startDate=2026-10-01&endDate=2026-10-31&type=event&audience=all', {
      method: 'GET'
    });
    expect(res.data).toHaveLength(1);
    expect(res.data[0].id).toBe('cal-1');
  });

  it('filters out disallowed query parameters and leaves supported filters', async () => {
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: []
    });

    await listEvents({ schoolId: 'tenant-123', startDate: '2026-10-01', unauthorizedKey: 'bad' });
    expect(spy).toHaveBeenCalledWith('/api/v1/calendar/events?startDate=2026-10-01', {
      method: 'GET'
    });
  });

  it('retrieves a single calendar event by ID', async () => {
    const mockEvent = { id: 'cal-1', title: 'Sports Day', date: '2026-10-15', type: 'event' };
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: mockEvent
    });

    const res = await getEvent('cal-1');
    expect(spy).toHaveBeenCalledWith('/api/v1/calendar/events/cal-1', {
      method: 'GET'
    });
    expect(res.data.id).toBe('cal-1');
  });

  it('creates a calendar event with payload', async () => {
    const payload = {
      title: 'Annual Day',
      date: '2026-11-20',
      endDate: '2026-11-20',
      type: 'event',
      description: 'Annual cultural celebration',
      audience: 'all'
    };
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: { id: 'cal-new', ...payload }
    });

    const res = await createEvent(payload);
    expect(spy).toHaveBeenCalledWith('/api/v1/calendar/events', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    expect(res.data.id).toBe('cal-new');
  });

  it('updates a calendar event by ID with partial payload', async () => {
    const updatePayload = {
      title: 'Updated Annual Day Title',
      type: 'holiday'
    };
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: { id: 'cal-1', ...updatePayload }
    });

    const res = await updateEvent('cal-1', updatePayload);
    expect(spy).toHaveBeenCalledWith('/api/v1/calendar/events/cal-1', {
      method: 'PATCH',
      body: JSON.stringify(updatePayload)
    });
    expect(res.data.title).toBe('Updated Annual Day Title');
  });

  it('deletes a calendar event by ID', async () => {
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      message: 'Calendar event deleted successfully'
    });

    const res = await deleteEvent('cal-1');
    expect(spy).toHaveBeenCalledWith('/api/v1/calendar/events/cal-1', {
      method: 'DELETE'
    });
    expect(res.success).toBe(true);
  });

  it('exports calendarApi object with exact methods', () => {
    expect(calendarApi.listEvents).toBe(listEvents);
    expect(calendarApi.getEvent).toBe(getEvent);
    expect(calendarApi.createEvent).toBe(createEvent);
    expect(calendarApi.updateEvent).toBe(updateEvent);
    expect(calendarApi.deleteEvent).toBe(deleteEvent);
  });
});
