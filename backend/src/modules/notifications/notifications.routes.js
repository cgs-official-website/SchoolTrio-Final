import { Router } from 'express';
import * as notificationsController from './notifications.controller.js';
import * as notificationsSchemas from './notifications.schemas.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { tenantContext } from '../../middleware/tenant.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';

const router = Router();

/**
 * Common middleware stack for all notification routes:
 * 1. authenticate: Validates JWT and attaches req.auth / req.user
 * 2. tenantContext: Enforces active tenant context
 */
router.use(authenticate, tenantContext({ requireTenant: true }));

/**
 * Get Total Unread Notification Count
 * GET /api/v1/notifications/unread-count
 */
router.get(
  '/unread-count',
  validate(notificationsSchemas.getUnreadCountSchema),
  notificationsController.getUnreadCount
);

/**
 * Mark All Unread Notifications as Read
 * PATCH /api/v1/notifications/read-all
 */
router.patch(
  '/read-all',
  validate(notificationsSchemas.markAllReadSchema),
  notificationsController.markAllAsRead
);

/**
 * List Notifications with pagination, sorting, and filters
 * GET /api/v1/notifications
 */
router.get(
  '/',
  validate(notificationsSchemas.listNotificationsSchema),
  notificationsController.listNotifications
);

/**
 * Get Single Notification by ID
 * GET /api/v1/notifications/:id
 */
router.get(
  '/:id',
  validate(notificationsSchemas.getNotificationByIdSchema),
  notificationsController.getNotificationById
);

/**
 * Mark a Single Notification as Read
 * PATCH /api/v1/notifications/:id/read
 */
router.patch(
  '/:id/read',
  validate(notificationsSchemas.markNotificationReadSchema),
  notificationsController.markAsRead
);

/**
 * Delete a Notification by ID
 * DELETE /api/v1/notifications/:id
 */
router.delete(
  '/:id',
  validate(notificationsSchemas.deleteNotificationSchema),
  notificationsController.deleteNotification
);

export default router;
