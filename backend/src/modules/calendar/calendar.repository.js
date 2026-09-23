import { prisma } from '../../database/prisma.client.js';

/**
 * Lists calendar events for an authoritative school tenant.
 *
 * @param {string} schoolId - School UUID
 * @param {Object} [filter={}] - Filter and pagination criteria
 * @param {string} [filter.startDate] - YYYY-MM-DD
 * @param {string} [filter.endDate] - YYYY-MM-DD
 * @param {string} [filter.type] - 'event' | 'holiday' | 'exam'
 * @param {string|Array<string>} [filter.audience] - Target audience string or array of allowed audiences
 * @param {number} [filter.skip=0]
 * @param {number} [filter.take=200]
 * @param {Object} [tx=prisma] - Optional Prisma transaction client
 * @returns {Promise<{ data: Array<Object>, total: number }>}
 */
export async function listCalendarEvents(
  schoolId,
  { startDate, endDate, type, audience, skip = 0, take = 200 } = {},
  tx = prisma
) {
  const where = {
    schoolId
  };

  if (type) {
    where.type = type;
  }

  if (audience) {
    if (Array.isArray(audience)) {
      where.audience = { in: audience };
    } else {
      where.audience = audience;
    }
  }

  // Date range overlap logic:
  // An event overlaps [startDate, endDate] if:
  // 1. event.date <= query.endDate (or query.endDate is null)
  // 2. (event.endDate >= query.startDate OR (event.endDate is null AND event.date >= query.startDate))
  if (startDate && endDate) {
    where.AND = [
      { date: { lte: endDate } },
      {
        OR: [
          { endDate: { gte: startDate } },
          { endDate: null, date: { gte: startDate } }
        ]
      }
    ];
  } else if (startDate) {
    where.OR = [
      { endDate: { gte: startDate } },
      { endDate: null, date: { gte: startDate } }
    ];
  } else if (endDate) {
    where.date = { lte: endDate };
  }

  const [data, total] = await Promise.all([
    tx.academicCalendarEvent.findMany({
      where,
      skip,
      take,
      orderBy: [
        { date: 'asc' },
        { createdAt: 'asc' }
      ]
    }),
    tx.academicCalendarEvent.count({ where })
  ]);

  return { data, total };
}

/**
 * Finds a single calendar event by tenant and ID.
 *
 * @param {string} schoolId - School UUID
 * @param {string} id - Event UUID
 * @param {Object} [tx=prisma]
 * @returns {Promise<Object|null>}
 */
export async function findCalendarEventById(schoolId, id, tx = prisma) {
  return tx.academicCalendarEvent.findFirst({
    where: {
      id,
      schoolId
    }
  });
}

/**
 * Creates a new AcademicCalendarEvent record.
 *
 * @param {string} schoolId - School UUID
 * @param {Object} data
 * @param {string} data.title
 * @param {string} data.date
 * @param {string} [data.endDate]
 * @param {string} data.type
 * @param {string|null} [data.description]
 * @param {string} [data.audience='all']
 * @param {Object} [tx=prisma]
 * @returns {Promise<Object>}
 */
export async function createCalendarEvent(schoolId, data, tx = prisma) {
  return tx.academicCalendarEvent.create({
    data: {
      schoolId,
      title: data.title,
      date: data.date,
      endDate: data.endDate || data.date,
      type: data.type,
      description: data.description || null,
      audience: data.audience || 'all'
    }
  });
}

/**
 * Updates an existing AcademicCalendarEvent record.
 *
 * @param {string} schoolId - School UUID
 * @param {string} id - Event UUID
 * @param {Object} data - Fields to update
 * @param {Object} [tx=prisma]
 * @returns {Promise<Object>}
 */
export async function updateCalendarEvent(schoolId, id, data, tx = prisma) {
  const updateData = {};
  if (data.title !== undefined) updateData.title = data.title;
  if (data.date !== undefined) updateData.date = data.date;
  if (data.endDate !== undefined) updateData.endDate = data.endDate;
  if (data.type !== undefined) updateData.type = data.type;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.audience !== undefined) updateData.audience = data.audience;

  return tx.academicCalendarEvent.update({
    where: {
      schoolId_id: {
        schoolId,
        id
      }
    },
    data: updateData
  });
}

/**
 * Deletes an AcademicCalendarEvent record within tenant boundary.
 *
 * @param {string} schoolId - School UUID
 * @param {string} id - Event UUID
 * @param {Object} [tx=prisma]
 * @returns {Promise<Object>}
 */
export async function deleteCalendarEvent(schoolId, id, tx = prisma) {
  return tx.academicCalendarEvent.delete({
    where: {
      schoolId_id: {
        schoolId,
        id
      }
    }
  });
}

export const calendarRepository = {
  listCalendarEvents,
  findCalendarEventById,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent
};

export default calendarRepository;
