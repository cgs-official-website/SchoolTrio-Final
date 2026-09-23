import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as clientModule from '../client.js';
import {
  listTimetables,
  getClassTimetable,
  replaceClassTimetable,
  createTimetablePeriod,
  updateTimetablePeriod,
  deleteTimetablePeriod,
  getMyTimetable
} from '../timetables.js';

describe('Timetables API Client Module (Phase T.3)', () => {
  const CLASS_ID = '11111111-1111-4111-8111-111111111111';
  const PERIOD_ID = '22222222-2222-4222-8222-222222222222';
  const TEACHER_ID = '33333333-3333-4333-8333-333333333333';
  const SUBJECT_ID = '44444444-4444-4444-8444-444444444444';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('listTimetables', () => {
    it('constructs correct GET request with query params', async () => {
      const mockResponse = {
        status: 'success',
        data: [{ id: PERIOD_ID, classId: CLASS_ID, dayOfWeek: 1 }]
      };
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue(mockResponse);

      const res = await listTimetables({ classId: CLASS_ID, teacherId: TEACHER_ID, dayOfWeek: 1 });

      expect(apiSpy).toHaveBeenCalledWith(
        `/api/v1/timetables?classId=${encodeURIComponent(CLASS_ID)}&teacherId=${encodeURIComponent(TEACHER_ID)}&dayOfWeek=1`,
        { method: 'GET' }
      );
      expect(res.data).toHaveLength(1);
    });

    it('ignores non-allowlisted parameters like academicYearId', async () => {
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({ status: 'success', data: [] });

      await listTimetables({ classId: CLASS_ID, academicYearId: 'year-123', customBogusParam: 'test' });

      expect(apiSpy).toHaveBeenCalledWith(
        `/api/v1/timetables?classId=${encodeURIComponent(CLASS_ID)}`,
        { method: 'GET' }
      );
    });

    it('rejects/omits Sunday (day 7 or "Sunday") from query params', async () => {
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({ status: 'success', data: [] });

      await listTimetables({ dayOfWeek: 7 });
      expect(apiSpy).toHaveBeenCalledWith('/api/v1/timetables', { method: 'GET' });

      await listTimetables({ dayOfWeek: 'Sunday' });
      expect(apiSpy).toHaveBeenCalledWith('/api/v1/timetables', { method: 'GET' });
    });

    it('correctly normalizes valid Monday-Saturday day names in query params', async () => {
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({ status: 'success', data: [] });

      await listTimetables({ dayOfWeek: 'Saturday' });
      expect(apiSpy).toHaveBeenCalledWith('/api/v1/timetables?dayOfWeek=6', { method: 'GET' });

      await listTimetables({ dayOfWeek: 'Monday' });
      expect(apiSpy).toHaveBeenCalledWith('/api/v1/timetables?dayOfWeek=1', { method: 'GET' });
    });

    it('handles empty query parameters without trailing question mark', async () => {
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({ status: 'success', data: [] });

      await listTimetables({});

      expect(apiSpy).toHaveBeenCalledWith('/api/v1/timetables', { method: 'GET' });
    });
  });

  describe('getClassTimetable', () => {
    it('constructs correct GET URL with encoded classId', async () => {
      const mockResponse = {
        status: 'success',
        data: {
          classId: CLASS_ID,
          className: 'Grade 10 - A',
          schedule: { Monday: [] }
        }
      };
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue(mockResponse);

      const res = await getClassTimetable(CLASS_ID);

      expect(apiSpy).toHaveBeenCalledWith(
        `/api/v1/timetables/classes/${encodeURIComponent(CLASS_ID)}`,
        { method: 'GET' }
      );
      expect(res.data.classId).toBe(CLASS_ID);
    });

    it('throws error when classId is missing', async () => {
      await expect(getClassTimetable('')).rejects.toThrow('Class ID is required');
    });
  });

  describe('replaceClassTimetable', () => {
    it('sends PUT request with JSON payload', async () => {
      const payload = {
        schedule: {
          Monday: [
            { startTime: '09:00', endTime: '10:00', subjectId: SUBJECT_ID, teacherId: TEACHER_ID }
          ]
        }
      };
      const mockResponse = {
        status: 'success',
        message: 'Class timetable updated successfully',
        data: { classId: CLASS_ID }
      };
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue(mockResponse);

      const res = await replaceClassTimetable(CLASS_ID, payload);

      expect(apiSpy).toHaveBeenCalledWith(
        `/api/v1/timetables/classes/${encodeURIComponent(CLASS_ID)}`,
        {
          method: 'PUT',
          body: JSON.stringify(payload)
        }
      );
      expect(res.status).toBe('success');
    });

    it('throws error when classId is missing', async () => {
      await expect(replaceClassTimetable('', {})).rejects.toThrow('Class ID is required');
    });
  });

  describe('createTimetablePeriod', () => {
    it('sends POST request with JSON payload', async () => {
      const payload = {
        classId: CLASS_ID,
        dayOfWeek: 1,
        startTime: '09:00',
        endTime: '10:00'
      };
      const mockResponse = {
        status: 'success',
        data: { id: PERIOD_ID, ...payload }
      };
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue(mockResponse);

      const res = await createTimetablePeriod(payload);

      expect(apiSpy).toHaveBeenCalledWith('/api/v1/timetables', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      expect(res.data.id).toBe(PERIOD_ID);
    });
  });

  describe('updateTimetablePeriod', () => {
    it('sends PATCH request with encoded id and JSON body', async () => {
      const payload = { startTime: '09:30' };
      const mockResponse = { status: 'success', data: { id: PERIOD_ID, startTime: '09:30' } };
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue(mockResponse);

      const res = await updateTimetablePeriod(PERIOD_ID, payload);

      expect(apiSpy).toHaveBeenCalledWith(
        `/api/v1/timetables/${encodeURIComponent(PERIOD_ID)}`,
        {
          method: 'PATCH',
          body: JSON.stringify(payload)
        }
      );
      expect(res.data.id).toBe(PERIOD_ID);
    });

    it('throws error when id is missing', async () => {
      await expect(updateTimetablePeriod('', {})).rejects.toThrow('ID is required');
    });
  });

  describe('deleteTimetablePeriod', () => {
    it('sends DELETE request with encoded id', async () => {
      const mockResponse = { status: 'success', message: 'Deleted', data: { id: PERIOD_ID } };
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue(mockResponse);

      const res = await deleteTimetablePeriod(PERIOD_ID);

      expect(apiSpy).toHaveBeenCalledWith(
        `/api/v1/timetables/${encodeURIComponent(PERIOD_ID)}`,
        { method: 'DELETE' }
      );
      expect(res.data.id).toBe(PERIOD_ID);
    });

    it('throws error when id is missing', async () => {
      await expect(deleteTimetablePeriod('')).rejects.toThrow('ID is required');
    });
  });

  describe('getMyTimetable', () => {
    it('sends GET request to /api/v1/timetables/my-schedule', async () => {
      const mockResponse = {
        status: 'success',
        data: {
          teacherId: TEACHER_ID,
          isClassTeacher: true,
          subjectSchedule: { Monday: [] },
          classSchedule: { Monday: [] }
        }
      };
      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue(mockResponse);

      const res = await getMyTimetable();

      expect(apiSpy).toHaveBeenCalledWith('/api/v1/timetables/my-schedule', {
        method: 'GET'
      });
      expect(res.data.teacherId).toBe(TEACHER_ID);
    });
  });
});
