import * as notificationsRepository from './notifications.repository.js';
import { SYSTEM_ROLES } from '../../config/constants.js';
import {
  TenantAccessError,
  NotFoundError,
  ValidationError
} from '../../utils/app-error.js';

/**
 * Normalizes and formats a database Notification record for canonical API response.
 *
 * @param {Object} notification - Raw Prisma Notification record
 * @returns {Object} Safe DTO
 */
export function formatNotification(notification) {
  if (!notification) return null;

  return {
    id: notification.id,
    schoolId: notification.schoolId,
    userId: notification.userId || null,
    classId: notification.classId || null,
    className: notification.class ? `${notification.class.name}${notification.class.section ? ` - ${notification.class.section}` : ''}` : null,
    type: notification.type,
    message: notification.message,
    date: notification.date || null,
    read: Boolean(notification.read),
    createdAt: notification.createdAt
  };
}

/**
 * Checks whether an actor holds administrative privileges for tenant-wide system alerts.
 *
 * @param {Object} actor - Authenticated user context from JWT
 * @returns {boolean} True if admin/principal
 */
export function isAdministrativeActor(actor) {
  const role = (actor?.systemRole || actor?.role || '').toUpperCase();
  return (
    role === SYSTEM_ROLES.SUPER_ADMIN ||
    role === SYSTEM_ROLES.SCHOOL_ADMIN ||
    role === SYSTEM_ROLES.PRINCIPAL ||
    role === 'SUPERADMIN' ||
    role === 'ADMIN'
  );
}

/**
 * Constructs the recipient authorization boundary clause for database queries.
 *
 * @param {Object} actor - Authenticated user context
 * @returns {Object} Prisma recipient clause
 */
export function buildRecipientFilter(actor) {
  const userId = actor?.id || actor?.userId;
  if (!userId) {
    throw new ValidationError('Authenticated user identity required for notification access');
  }

  const isAdmin = isAdministrativeActor(actor);

  if (isAdmin) {
    return {
      OR: [
        { userId },
        { userId: null }
      ]
    };
  }

  return {
    OR: [
      { userId }
    ]
  };
}

/**
 * Asserts that the authenticated actor is authorized to access the specific notification.
 * Throws NotFoundError if unauthorized to prevent enumeration attacks.
 *
 * @param {Object} notification - Database notification record
 * @param {Object} actor - Authenticated user context
 */
export function assertNotificationAccess(notification, actor) {
  if (!notification) {
    throw new NotFoundError('Notification');
  }

  const userId = actor?.id || actor?.userId;
  const isAdmin = isAdministrativeActor(actor);

  if (notification.userId === userId) {
    return;
  }

  if (notification.userId === null && isAdmin) {
    return;
  }

  // Obscure unauthorized record existence with standard 404
  throw new NotFoundError('Notification');
}

/**
 * Lists notifications for the authenticated user within their tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} query - Validated query parameters
 * @param {Object} actor - Authenticated user context
 * @returns {Promise<{ notifications: Array, pagination: Object }>}
 */
export async function listNotifications(schoolId, query = {}, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to list notifications');
  }

  const recipientFilter = buildRecipientFilter(actor);

  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 50));
  const sort = query.sort || 'createdAt';
  const order = query.order || 'desc';

  const filter = {
    recipientFilter,
    unread: query.unread,
    type: query.type,
    date: query.date
  };

  const { notifications, total } = await notificationsRepository.findNotifications(
    schoolId,
    filter,
    { page, limit },
    { sort, order }
  );

  const totalPages = Math.ceil(total / limit) || 1;

  return {
    notifications: notifications.map(formatNotification),
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1
    }
  };
}

/**
 * Retrieves the unread notification count for the authenticated user within their tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} query - Validated query filters
 * @param {Object} actor - Authenticated user context
 * @returns {Promise<{ count: number }>}
 */
export async function getUnreadCount(schoolId, query = {}, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to get unread notification count');
  }

  const recipientFilter = buildRecipientFilter(actor);

  const filter = {
    recipientFilter,
    type: query.type
  };

  const count = await notificationsRepository.countUnreadNotifications(schoolId, filter);
  return { count };
}

/**
 * Retrieves a single notification by ID.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} id - Notification UUID
 * @param {Object} actor - Authenticated user context
 * @returns {Promise<Object>} Formatted notification DTO
 */
export async function getNotificationById(schoolId, id, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to retrieve notification');
  }

  const notification = await notificationsRepository.findNotificationById(schoolId, id);
  assertNotificationAccess(notification, actor);

  return formatNotification(notification);
}

/**
 * Marks a single notification as read.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} id - Notification UUID
 * @param {Object} actor - Authenticated user context
 * @returns {Promise<Object>} Updated notification DTO
 */
export async function markAsRead(schoolId, id, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to mark notification read');
  }

  const notification = await notificationsRepository.findNotificationById(schoolId, id);
  assertNotificationAccess(notification, actor);

  if (notification.read) {
    return formatNotification(notification);
  }

  const updated = await notificationsRepository.markNotificationRead(schoolId, id);
  return formatNotification(updated);
}

/**
 * Marks all unread notifications visible to the authenticated user as read.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} payload - Optional payload ({ type })
 * @param {Object} actor - Authenticated user context
 * @returns {Promise<{ count: number, message: string }>}
 */
export async function markAllAsRead(schoolId, payload = {}, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to mark all notifications read');
  }

  const recipientFilter = buildRecipientFilter(actor);
  const result = await notificationsRepository.markAllNotificationsRead(
    schoolId,
    recipientFilter,
    payload?.type || null
  );

  return {
    count: result.count,
    message: 'All notifications marked as read'
  };
}

/**
 * Deletes a notification by ID.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} id - Notification UUID
 * @param {Object} actor - Authenticated user context
 * @returns {Promise<{ id: string, deleted: boolean }>}
 */
export async function deleteNotification(schoolId, id, actor = null) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required to delete notification');
  }

  const notification = await notificationsRepository.findNotificationById(schoolId, id);
  assertNotificationAccess(notification, actor);

  await notificationsRepository.deleteNotification(schoolId, id);

  return {
    id,
    deleted: true
  };
}
