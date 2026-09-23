import { prisma } from '../../database/prisma.client.js';

/**
 * Support Tickets Data Access Repository Layer
 */

const TICKET_SELECT_SUMMARY = Object.freeze({
  id: true,
  schoolId: true,
  userId: true,
  ticketNumber: true,
  subject: true,
  description: true,
  category: true,
  priority: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  school: {
    select: {
      id: true,
      name: true,
      code: true
    }
  },
  user: {
    select: {
      id: true,
      email: true,
      systemRole: true
    }
  }
});

const TICKET_SELECT_DETAIL = Object.freeze({
  ...TICKET_SELECT_SUMMARY,
  messages: {
    select: {
      id: true,
      ticketId: true,
      senderId: true,
      senderRole: true,
      senderName: true,
      message: true,
      attachments: true,
      isInternalNote: true,
      createdAt: true
    },
    orderBy: {
      createdAt: 'asc'
    }
  }
});

/**
 * Constructs parameterized Prisma WHERE clause for ticket queries.
 *
 * @param {string|null} schoolId - Tenant UUID or null for global
 * @param {Object} filters - Query filters
 * @returns {Object} Prisma where object
 */
function buildTicketWhereClause(schoolId, filters = {}) {
  const where = {};

  if (schoolId) {
    where.schoolId = schoolId;
  }

  if (filters.status && filters.status !== 'all') {
    where.status = filters.status;
  }

  if (filters.priority) {
    where.priority = filters.priority;
  }

  if (filters.category) {
    where.category = {
      contains: filters.category,
      mode: 'insensitive'
    };
  }

  if (filters.search) {
    where.OR = [
      { subject: { contains: filters.search, mode: 'insensitive' } },
      { description: { contains: filters.search, mode: 'insensitive' } },
      { ticketNumber: { contains: filters.search, mode: 'insensitive' } }
    ];
  }

  return where;
}

export async function createTicket(data, tx = prisma) {
  return tx.supportTicket.create({
    data: {
      schoolId: data.schoolId,
      userId: data.userId,
      ticketNumber: data.ticketNumber,
      subject: data.subject,
      description: data.description,
      category: data.category || 'general',
      priority: data.priority || 'medium',
      status: data.status || 'open'
    },
    select: TICKET_SELECT_SUMMARY
  });
}

export async function createTicketMessage(data, tx = prisma) {
  return tx.supportTicketMessage.create({
    data: {
      ticketId: data.ticketId,
      senderId: data.senderId || null,
      senderRole: data.senderRole,
      senderName: data.senderName,
      message: data.message,
      attachments: data.attachments || null,
      isInternalNote: data.isInternalNote || false
    }
  });
}

export async function findTenantTickets(schoolId, filters = {}, pagination = {}) {
  const where = buildTicketWhereClause(schoolId, filters);
  const skip = pagination.skip || 0;
  const take = pagination.take || 20;

  return prisma.supportTicket.findMany({
    where,
    select: TICKET_SELECT_SUMMARY,
    orderBy: { createdAt: 'desc' },
    skip,
    take
  });
}

export async function countTenantTickets(schoolId, filters = {}) {
  const where = buildTicketWhereClause(schoolId, filters);
  return prisma.supportTicket.count({ where });
}

export async function findTicketById(id, schoolId = null) {
  const where = { id };
  if (schoolId) {
    where.schoolId = schoolId;
  }

  return prisma.supportTicket.findFirst({
    where,
    select: TICKET_SELECT_DETAIL
  });
}

export async function findGlobalTickets(filters = {}, pagination = {}) {
  const where = buildTicketWhereClause(filters.schoolId || null, filters);
  const skip = pagination.skip || 0;
  const take = pagination.take || 20;

  return prisma.supportTicket.findMany({
    where,
    select: TICKET_SELECT_SUMMARY,
    orderBy: { createdAt: 'desc' },
    skip,
    take
  });
}

export async function countGlobalTickets(filters = {}) {
  const where = buildTicketWhereClause(filters.schoolId || null, filters);
  return prisma.supportTicket.count({ where });
}

export async function updateTicket(id, data, tx = prisma) {
  return tx.supportTicket.update({
    where: { id },
    data,
    select: TICKET_SELECT_DETAIL
  });
}
