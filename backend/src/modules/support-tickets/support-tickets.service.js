import * as supportTicketsRepository from './support-tickets.repository.js';
import { createAuditLog } from '../audit/audit.repository.js';
import { prisma } from '../../database/prisma.client.js';
import { parsePagination, buildPaginationMetadata } from '../../utils/pagination.js';
import { NotFoundError, ValidationError, ForbiddenError } from '../../utils/app-error.js';
import { SYSTEM_ROLES } from '../../config/constants.js';

/**
 * Formats a SupportTicket entity for client delivery.
 *
 * @param {Object} ticket - Prisma ticket object
 * @returns {Object} Clean DTO
 */
function formatTicketDto(ticket) {
  return {
    id: ticket.id,
    schoolId: ticket.schoolId,
    ticketNumber: ticket.ticketNumber,
    subject: ticket.subject,
    description: ticket.description,
    category: ticket.category,
    priority: ticket.priority,
    status: ticket.status,
    createdAt: ticket.createdAt instanceof Date ? ticket.createdAt.toISOString() : ticket.createdAt,
    updatedAt: ticket.updatedAt instanceof Date ? ticket.updatedAt.toISOString() : ticket.updatedAt,
    ...(ticket.school && {
      school: {
        id: ticket.school.id,
        name: ticket.school.name,
        code: ticket.school.code
      }
    }),
    ...(ticket.user && {
      user: {
        id: ticket.user.id,
        email: ticket.user.email,
        systemRole: ticket.user.systemRole
      }
    }),
    ...(ticket.messages && {
      messages: ticket.messages.map((m) => ({
        id: m.id,
        ticketId: m.ticketId,
        senderId: m.senderId,
        senderRole: m.senderRole,
        senderName: m.senderName,
        message: m.message,
        attachments: m.attachments,
        isInternalNote: m.isInternalNote,
        createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : m.createdAt
      }))
    })
  };
}

/**
 * Generate unique human-readable ticket number (e.g. TK-8472).
 */
function generateTicketNumber() {
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `TK-${randomSuffix}`;
}

/**
 * Creates a new support ticket for the authenticated tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} user - Authenticated user context
 * @param {Object} data - Ticket payload ({ subject, description, category, priority })
 * @returns {Promise<Object>} Formatted ticket DTO
 */
export async function createTicket(schoolId, user, data) {
  if (!schoolId) {
    throw new ValidationError('Tenant context (schoolId) is required');
  }

  const ticketNumber = generateTicketNumber();
  const userName = user.email || user.userName || 'School Staff';
  const userRole = user.systemRole || SYSTEM_ROLES.STAFF;

  const result = await prisma.$transaction(async (tx) => {
    // 1. Create root ticket
    const ticket = await supportTicketsRepository.createTicket(
      {
        schoolId,
        userId: user.id || user.userId,
        ticketNumber,
        subject: data.subject,
        description: data.description,
        category: data.category || 'general',
        priority: data.priority || 'medium',
        status: 'open'
      },
      tx
    );

    // 2. Create initial thread message
    await supportTicketsRepository.createTicketMessage(
      {
        ticketId: ticket.id,
        senderId: user.id || user.userId,
        senderRole: userRole,
        senderName: userName,
        message: data.description,
        isInternalNote: false
      },
      tx
    );

    // 3. Record non-blocking audit log
    await createAuditLog(
      {
        schoolId,
        entityType: 'SupportTicket',
        entityId: ticket.id,
        actionPerformed: 'CREATE_SUPPORT_TICKET',
        userName,
        userRole,
        modifiedFields: {
          ticketNumber,
          subject: data.subject,
          priority: data.priority,
          category: data.category
        }
      },
      tx
    );

    return ticket;
  });

  return formatTicketDto(result);
}

/**
 * Retrieves paginated list of support tickets for the authenticated tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} query - Validated query parameters
 * @returns {Promise<{ tickets: Array<Object>, pagination: Object }>}
 */
export async function getTenantTickets(schoolId, query = {}) {
  if (!schoolId) {
    throw new ValidationError('Tenant context (schoolId) is required');
  }

  const { page, limit, skip, take } = parsePagination(query, {
    defaultSort: 'createdAt',
    defaultOrder: 'desc'
  });

  const filterOptions = {
    status: query.status,
    priority: query.priority,
    category: query.category,
    search: query.search
  };

  const [tickets, total] = await Promise.all([
    supportTicketsRepository.findTenantTickets(schoolId, filterOptions, { skip, take }),
    supportTicketsRepository.countTenantTickets(schoolId, filterOptions)
  ]);

  const pagination = buildPaginationMetadata(total, page, limit);

  return {
    tickets: tickets.map(formatTicketDto),
    pagination
  };
}

/**
 * Retrieves a single support ticket and thread messages scoped to tenant.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} ticketId - SupportTicket UUID
 * @returns {Promise<Object>}
 */
export async function getTenantTicketById(schoolId, ticketId) {
  if (!schoolId) {
    throw new ValidationError('Tenant context (schoolId) is required');
  }

  const ticket = await supportTicketsRepository.findTicketById(ticketId, schoolId);
  if (!ticket) {
    throw new NotFoundError('Support ticket not found');
  }

  // Filter out internal SuperAdmin notes from tenant view
  if (ticket.messages) {
    ticket.messages = ticket.messages.filter((m) => !m.isInternalNote);
  }

  return formatTicketDto(ticket);
}

/**
 * Adds a message reply from tenant user to their support ticket.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} user - Authenticated user context
 * @param {string} ticketId - SupportTicket UUID
 * @param {Object} data - Message payload ({ message, attachments })
 * @returns {Promise<Object>}
 */
export async function addTenantTicketMessage(schoolId, user, ticketId, data) {
  if (!schoolId) {
    throw new ValidationError('Tenant context (schoolId) is required');
  }

  const existingTicket = await supportTicketsRepository.findTicketById(ticketId, schoolId);
  if (!existingTicket) {
    throw new NotFoundError('Support ticket not found');
  }

  const userName = user.email || user.userName || 'School Staff';
  const userRole = user.systemRole || SYSTEM_ROLES.STAFF;

  const result = await prisma.$transaction(async (tx) => {
    // 1. Create reply message
    const message = await supportTicketsRepository.createTicketMessage(
      {
        ticketId,
        senderId: user.id || user.userId,
        senderRole: userRole,
        senderName: userName,
        message: data.message,
        attachments: data.attachments || null,
        isInternalNote: false
      },
      tx
    );

    // 2. Re-open ticket if it was resolved/closed
    const nextStatus = existingTicket.status === 'resolved' || existingTicket.status === 'closed' ? 'in-progress' : existingTicket.status;
    await supportTicketsRepository.updateTicket(ticketId, { status: nextStatus, updatedAt: new Date() }, tx);

    // 3. Record audit log
    await createAuditLog(
      {
        schoolId,
        entityType: 'SupportTicket',
        entityId: ticketId,
        actionPerformed: 'REPLY_SUPPORT_TICKET',
        userName,
        userRole,
        modifiedFields: {
          messageLength: data.message.length,
          status: nextStatus
        }
      },
      tx
    );

    return message;
  });

  return {
    id: result.id,
    ticketId: result.ticketId,
    senderId: result.senderId,
    senderRole: result.senderRole,
    senderName: result.senderName,
    message: result.message,
    attachments: result.attachments,
    isInternalNote: result.isInternalNote,
    createdAt: result.createdAt instanceof Date ? result.createdAt.toISOString() : result.createdAt
  };
}

/**
 * Retrieves paginated global support tickets across all tenants for SuperAdmin.
 *
 * @param {Object} query - Validated query parameters
 * @returns {Promise<{ tickets: Array<Object>, pagination: Object }>}
 */
export async function getGlobalTickets(query = {}) {
  const { page, limit, skip, take } = parsePagination(query, {
    defaultSort: 'createdAt',
    defaultOrder: 'desc'
  });

  const filterOptions = {
    schoolId: query.schoolId,
    status: query.status,
    priority: query.priority,
    category: query.category,
    search: query.search
  };

  const [tickets, total] = await Promise.all([
    supportTicketsRepository.findGlobalTickets(filterOptions, { skip, take }),
    supportTicketsRepository.countGlobalTickets(filterOptions)
  ]);

  const pagination = buildPaginationMetadata(total, page, limit);

  return {
    tickets: tickets.map(formatTicketDto),
    pagination
  };
}

/**
 * Updates support ticket resolution status (SuperAdmin operation).
 *
 * @param {string} ticketId - SupportTicket UUID
 * @param {string} status - Target status ('open' | 'in-progress' | 'resolved' | 'closed')
 * @param {Object} actor - Authenticated SuperAdmin user
 * @returns {Promise<Object>}
 */
export async function updateTicketStatus(ticketId, status, actor) {
  const existing = await supportTicketsRepository.findTicketById(ticketId);
  if (!existing) {
    throw new NotFoundError('Support ticket not found');
  }

  const userName = actor.email || 'SuperAdmin Support';

  const updated = await prisma.$transaction(async (tx) => {
    const ticket = await supportTicketsRepository.updateTicket(ticketId, { status }, tx);

    await createAuditLog(
      {
        schoolId: existing.schoolId,
        entityType: 'SupportTicket',
        entityId: ticketId,
        actionPerformed: 'UPDATE_TICKET_STATUS',
        userName,
        userRole: SYSTEM_ROLES.SUPER_ADMIN,
        modifiedFields: {
          previousStatus: existing.status,
          newStatus: status
        }
      },
      tx
    );

    return ticket;
  });

  return formatTicketDto(updated);
}

/**
 * Posts a reply or internal note to any support ticket (SuperAdmin operation).
 *
 * @param {Object} actor - Authenticated SuperAdmin user
 * @param {string} ticketId - SupportTicket UUID
 * @param {Object} data - Message payload ({ message, attachments, isInternalNote })
 * @returns {Promise<Object>}
 */
export async function addSuperAdminTicketMessage(actor, ticketId, data) {
  const existing = await supportTicketsRepository.findTicketById(ticketId);
  if (!existing) {
    throw new NotFoundError('Support ticket not found');
  }

  const userName = actor.email || 'SuperAdmin Support';
  const isInternal = Boolean(data.isInternalNote);

  const result = await prisma.$transaction(async (tx) => {
    const message = await supportTicketsRepository.createTicketMessage(
      {
        ticketId,
        senderId: actor.id || actor.userId,
        senderRole: SYSTEM_ROLES.SUPER_ADMIN,
        senderName: userName,
        message: data.message,
        attachments: data.attachments || null,
        isInternalNote: isInternal
      },
      tx
    );

    // If client-facing message and ticket was 'open', set status to 'in-progress'
    if (!isInternal && existing.status === 'open') {
      await supportTicketsRepository.updateTicket(ticketId, { status: 'in-progress' }, tx);
    }

    await createAuditLog(
      {
        schoolId: existing.schoolId,
        entityType: 'SupportTicket',
        entityId: ticketId,
        actionPerformed: isInternal ? 'ADD_TICKET_INTERNAL_NOTE' : 'REPLY_TICKET_SUPERADMIN',
        userName,
        userRole: SYSTEM_ROLES.SUPER_ADMIN,
        modifiedFields: {
          isInternalNote: isInternal,
          messageLength: data.message.length
        }
      },
      tx
    );

    return message;
  });

  return {
    id: result.id,
    ticketId: result.ticketId,
    senderId: result.senderId,
    senderRole: result.senderRole,
    senderName: result.senderName,
    message: result.message,
    attachments: result.attachments,
    isInternalNote: result.isInternalNote,
    createdAt: result.createdAt instanceof Date ? result.createdAt.toISOString() : result.createdAt
  };
}
