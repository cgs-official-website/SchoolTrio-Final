import { prisma } from '../../database/prisma.client.js';

/**
 * Builds the Prisma where clause for notifications, enforcing tenant and recipient isolation.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} [filter={}] - Filter options
 * @param {Object} [filter.recipientFilter] - Recipient boundary clause ({ OR: [...] })
 * @param {boolean} [filter.unread] - If true, read: false; if false, read: true
 * @param {string} [filter.type] - Notification type filter
 * @param {string} [filter.date] - YYYY-MM-DD date filter
 * @returns {Object} Prisma where object
 */
export function buildNotificationWhere(schoolId, filter = {}) {
  const where = {
    schoolId
  };

  if (filter.recipientFilter) {
    Object.assign(where, filter.recipientFilter);
  }

  if (filter.unread === true) {
    where.read = false;
  } else if (filter.unread === false) {
    where.read = true;
  }

  if (filter.type) {
    where.type = filter.type;
  }

  if (filter.date) {
    where.date = filter.date;
  }

  return where;
}

/**
 * Lists notifications with pagination and sorting.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} filter - Filter parameters including recipientFilter
 * @param {Object} pagination - { page, limit }
 * @param {Object} sortOrder - { sort, order }
 * @returns {Promise<{ notifications: Array, total: number }>}
 */
export async function findNotifications(schoolId, filter = {}, pagination = { page: 1, limit: 50 }, sortOrder = { sort: 'createdAt', order: 'desc' }) {
  const where = buildNotificationWhere(schoolId, filter);
  const skip = (pagination.page - 1) * pagination.limit;
  const take = pagination.limit;
  const orderBy = { [sortOrder.sort]: sortOrder.order };

  const [notifications, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      skip,
      take,
      orderBy,
      include: {
        class: {
          select: {
            id: true,
            name: true
          }
        }
      }
    }),
    prisma.notification.count({ where })
  ]);

  return { notifications, total };
}

/**
 * Counts unread notifications for the authorized recipient within the tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} filter - Filter parameters including recipientFilter and optional type
 * @returns {Promise<number>} Unread count
 */
export async function countUnreadNotifications(schoolId, filter = {}) {
  const where = buildNotificationWhere(schoolId, { ...filter, unread: true });
  return prisma.notification.count({ where });
}

/**
 * Finds a single notification by ID within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} id - Notification UUID
 * @returns {Promise<Object|null>} Notification record with class relation
 */
export async function findNotificationById(schoolId, id) {
  return prisma.notification.findFirst({
    where: {
      schoolId,
      id
    },
    include: {
      class: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });
}

/**
 * Marks a single notification as read within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} id - Notification UUID
 * @returns {Promise<Object>} Updated notification record
 */
export async function markNotificationRead(schoolId, id) {
  return prisma.notification.update({
    where: {
      schoolId_id: {
        schoolId,
        id
      }
    },
    data: {
      read: true
    },
    include: {
      class: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });
}

/**
 * Marks all unread notifications visible to the recipient as read within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} recipientFilter - Recipient boundary clause
 * @param {string} [type=null] - Optional notification type filter
 * @returns {Promise<{ count: number }>} Number of updated records
 */
export async function markAllNotificationsRead(schoolId, recipientFilter = {}, type = null) {
  const where = buildNotificationWhere(schoolId, {
    recipientFilter,
    unread: true,
    ...(type && { type })
  });

  return prisma.notification.updateMany({
    where,
    data: {
      read: true
    }
  });
}

/**
 * Deletes a notification by ID within a tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} id - Notification UUID
 * @returns {Promise<Object>} Deleted notification record
 */
export async function deleteNotification(schoolId, id) {
  return prisma.notification.delete({
    where: {
      schoolId_id: {
        schoolId,
        id
      }
    }
  });
}

/**
 * Creates a notification record within a tenant (for internal service triggers).
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} data - Notification fields ({ userId, classId, type, message, date, read })
 * @returns {Promise<Object>} Created notification record
 */
export async function createNotification(schoolId, data) {
  return prisma.notification.create({
    data: {
      schoolId,
      userId: data.userId || null,
      classId: data.classId || null,
      type: data.type,
      message: data.message,
      date: data.date || null,
      read: data.read ?? false
    },
    include: {
      class: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });
}
