import { basePrisma } from '../../database/prisma.client.js';

/**
 * Persists a new public contact message inquiry.
 */
export const createMessage = async ({ name, email, subject, message, ipAddress, userAgent }) => {
  return basePrisma.contactMessage.create({
    data: {
      name,
      email,
      subject: subject || null,
      message,
      status: 'new',
      ipAddress: ipAddress || null,
      userAgent: userAgent || null
    }
  });
};

/**
 * Retrieves paginated contact messages with search, filter, and sorting.
 */
export const getMessages = async ({ search, status, sortBy = 'createdAt', sortOrder = 'desc', skip = 0, take = 10 }) => {
  const where = {};

  if (status && status !== 'all') {
    where.status = status;
  }

  if (search && search.trim()) {
    const term = search.trim();
    where.OR = [
      { name: { contains: term, mode: 'insensitive' } },
      { email: { contains: term, mode: 'insensitive' } },
      { message: { contains: term, mode: 'insensitive' } },
      { subject: { contains: term, mode: 'insensitive' } }
    ];
  }

  const orderBy = {
    [sortBy]: sortOrder
  };

  const [messages, total] = await Promise.all([
    basePrisma.contactMessage.findMany({
      where,
      orderBy,
      skip,
      take,
      include: {
        replies: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    }),
    basePrisma.contactMessage.count({ where })
  ]);

  return { messages, total };
};

/**
 * Aggregates summary counts for KPI dashboard cards.
 */
export const getMessageStats = async () => {
  const [total, newCount, inProgressCount, repliedCount, closedCount] = await Promise.all([
    basePrisma.contactMessage.count(),
    basePrisma.contactMessage.count({ where: { status: 'new' } }),
    basePrisma.contactMessage.count({ where: { status: 'in_progress' } }),
    basePrisma.contactMessage.count({ where: { status: 'replied' } }),
    basePrisma.contactMessage.count({ where: { status: 'closed' } })
  ]);

  return {
    total,
    new: newCount,
    inProgress: inProgressCount,
    replied: repliedCount,
    closed: closedCount
  };
};

/**
 * Retrieves full details of a single contact message with all historical replies.
 */
export const getMessageById = async (id) => {
  return basePrisma.contactMessage.findUnique({
    where: { id },
    include: {
      replies: {
        orderBy: { createdAt: 'asc' }
      }
    }
  });
};

/**
 * Updates the resolution/read status of a contact message.
 */
export const updateStatus = async (id, status) => {
  return basePrisma.contactMessage.update({
    where: { id },
    data: { status }
  });
};

/**
 * Saves an admin reply, logs delivery status, and updates message state to 'replied'.
 */
export const saveReply = async (id, { adminId, adminName, replyText, emailDeliveryStatus, emailDeliveryError }) => {
  return basePrisma.$transaction(async (tx) => {
    const reply = await tx.contactMessageReply.create({
      data: {
        messageId: id,
        adminId: adminId || null,
        adminName: adminName || 'SuperAdmin',
        replyText,
        emailDeliveryStatus,
        emailDeliveryError: emailDeliveryError || null
      }
    });

    const updatedMessage = await tx.contactMessage.update({
      where: { id },
      data: {
        status: 'replied',
        reply: replyText,
        repliedAt: new Date(),
        repliedBy: adminName || 'SuperAdmin',
        emailDeliveryStatus,
        emailDeliveryError: emailDeliveryError || null
      },
      include: {
        replies: {
          orderBy: { createdAt: 'asc' }
        }
      }
    });

    return { reply, message: updatedMessage };
  });
};

