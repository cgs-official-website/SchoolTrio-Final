import { ApiResponse } from '../../utils/api-response.js';
import * as calendarService from './calendar.service.js';

/**
 * Lists calendar events with optional date range, type, and audience filtering.
 * GET /api/v1/calendar/events
 */
export async function listCalendarEvents(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId;
    const actor = req.auth || req.user;

    const result = await calendarService.listCalendarEvents(schoolId, actor, req.query);

    return ApiResponse.success(
      res,
      result.data,
      'Calendar events retrieved successfully',
      200,
      { count: result.total, page: result.page, limit: result.limit }
    );
  } catch (err) {
    next(err);
  }
}

/**
 * Retrieves a single calendar event by ID.
 * GET /api/v1/calendar/events/:id
 */
export async function getCalendarEventById(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId;
    const { id } = req.params;
    const actor = req.auth || req.user;

    const result = await calendarService.getCalendarEventById(schoolId, actor, id);

    return ApiResponse.success(
      res,
      result,
      'Calendar event retrieved successfully'
    );
  } catch (err) {
    next(err);
  }
}

/**
 * Creates a new calendar event.
 * POST /api/v1/calendar/events
 */
export async function createCalendarEvent(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId;
    const actor = req.auth || req.user;

    const result = await calendarService.createCalendarEvent(schoolId, actor, req.body);

    return ApiResponse.success(
      res,
      result,
      'Calendar event created successfully',
      201
    );
  } catch (err) {
    next(err);
  }
}

/**
 * Updates an existing calendar event.
 * PATCH /api/v1/calendar/events/:id
 */
export async function updateCalendarEvent(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId;
    const { id } = req.params;
    const actor = req.auth || req.user;

    const result = await calendarService.updateCalendarEvent(schoolId, actor, id, req.body);

    return ApiResponse.success(
      res,
      result,
      'Calendar event updated successfully'
    );
  } catch (err) {
    next(err);
  }
}

/**
 * Deletes a calendar event.
 * DELETE /api/v1/calendar/events/:id
 */
export async function deleteCalendarEvent(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId;
    const { id } = req.params;
    const actor = req.auth || req.user;

    const result = await calendarService.deleteCalendarEvent(schoolId, actor, id);

    return ApiResponse.success(
      res,
      null,
      result.message || 'Calendar event deleted successfully'
    );
  } catch (err) {
    next(err);
  }
}

export const calendarController = {
  listCalendarEvents,
  getCalendarEventById,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent
};

export default calendarController;
