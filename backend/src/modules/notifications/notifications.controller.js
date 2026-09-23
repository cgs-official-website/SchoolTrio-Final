import { ApiResponse } from '../../utils/api-response.js';
import * as notificationsService from './notifications.service.js';

/**
 * Lists notifications for the authenticated user.
 * GET /api/v1/notifications
 */
export async function listNotifications(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId || req.auth?.schoolId || req.schoolId;
    const actor = req.auth || req.user;

    const result = await notificationsService.listNotifications(schoolId, req.query, actor);

    return ApiResponse.paginated(
      res,
      result.notifications,
      result.pagination,
      'Notifications retrieved successfully'
    );
  } catch (err) {
    next(err);
  }
}

/**
 * Retrieves the total unread notification count.
 * GET /api/v1/notifications/unread-count
 */
export async function getUnreadCount(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId || req.auth?.schoolId || req.schoolId;
    const actor = req.auth || req.user;

    const result = await notificationsService.getUnreadCount(schoolId, req.query, actor);

    return ApiResponse.success(
      res,
      result,
      'Unread notification count retrieved successfully'
    );
  } catch (err) {
    next(err);
  }
}

/**
 * Gets a single notification by ID.
 * GET /api/v1/notifications/:id
 */
export async function getNotificationById(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId || req.auth?.schoolId || req.schoolId;
    const notificationId = req.params.id;
    const actor = req.auth || req.user;

    const result = await notificationsService.getNotificationById(schoolId, notificationId, actor);

    return ApiResponse.success(
      res,
      result,
      'Notification retrieved successfully'
    );
  } catch (err) {
    next(err);
  }
}

/**
 * Marks a single notification as read.
 * PATCH /api/v1/notifications/:id/read
 */
export async function markAsRead(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId || req.auth?.schoolId || req.schoolId;
    const notificationId = req.params.id;
    const actor = req.auth || req.user;

    const result = await notificationsService.markAsRead(schoolId, notificationId, actor);

    return ApiResponse.success(
      res,
      result,
      'Notification marked as read'
    );
  } catch (err) {
    next(err);
  }
}

/**
 * Marks all visible unread notifications as read.
 * PATCH /api/v1/notifications/read-all
 */
export async function markAllAsRead(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId || req.auth?.schoolId || req.schoolId;
    const actor = req.auth || req.user;

    const result = await notificationsService.markAllAsRead(schoolId, req.body, actor);

    return ApiResponse.success(
      res,
      result,
      'All notifications marked as read'
    );
  } catch (err) {
    next(err);
  }
}

/**
 * Deletes a notification by ID.
 * DELETE /api/v1/notifications/:id
 */
export async function deleteNotification(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId || req.auth?.schoolId || req.schoolId;
    const notificationId = req.params.id;
    const actor = req.auth || req.user;

    const result = await notificationsService.deleteNotification(schoolId, notificationId, actor);

    return ApiResponse.success(
      res,
      result,
      'Notification deleted successfully'
    );
  } catch (err) {
    next(err);
  }
}
