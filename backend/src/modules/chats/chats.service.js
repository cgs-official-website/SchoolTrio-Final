import { prisma } from '../../database/prisma.client.js';
import * as chatsRepository from './chats.repository.js';
import { createAuditLog } from '../audit/audit.repository.js';
import { SYSTEM_ROLES } from '../../config/constants.js';
import {
  ValidationError,
  ForbiddenError,
  NotFoundError,
  TenantAccessError
} from '../../utils/app-error.js';
import { SENDER_ROLES } from './chats.schema.js';

// ============================================================
// DTO FORMATTERS
// ============================================================

/**
 * Formats a raw ChatRoom database record into a clean DTO.
 *
 * @param {Object} room - Prisma ChatRoom entity
 * @returns {Object|null}
 */
export function formatChatRoom(room) {
  if (!room) return null;

  const student = room.student;
  const studentName = student
    ? `${student.firstName} ${student.lastName || ''}`.trim()
    : 'Unknown Student';

  const parent = student?.parents?.[0]?.parent;
  const parentName = parent?.name || 'Parent';
  const parentPhone = parent?.phone || null;
  const parentEmail = parent?.email || null;

  const teacher = room.teacher;
  const teacherName = teacher?.name || 'Teacher';
  const teacherEmail = teacher?.email || null;
  const teacherPhone = teacher?.phone || null;

  return {
    id: room.id,
    schoolId: room.schoolId,
    studentId: room.studentId,
    studentName,
    studentAdmissionNumber: student?.admissionNumber || null,
    studentRollNumber: student?.rollNumber || null,
    classId: student?.classId || null,
    className: student?.class?.name || null,
    teacherId: room.teacherId,
    teacherName,
    teacherEmail,
    teacherPhone,
    parentId: parent?.id || null,
    parentName,
    parentPhone,
    parentEmail,
    status: room.status || 'active',
    lastMessage: room.lastMessage || null,
    lastMessageTime: room.lastMessageTime || null,
    unreadCountParent: room.unreadCountParent || 0,
    unreadCountTeacher: room.unreadCountTeacher || 0,
    // Frontend compatibility aliases
    unreadCount_parent: room.unreadCountParent || 0,
    unreadCount_teacher: room.unreadCountTeacher || 0,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt
  };
}

/**
 * Formats a raw ChatMessage record into a clean DTO.
 *
 * @param {Object} msg - Prisma ChatMessage entity
 * @returns {Object|null}
 */
export function formatChatMessage(msg) {
  if (!msg) return null;
  return {
    id: msg.id,
    schoolId: msg.schoolId,
    chatRoomId: msg.chatRoomId,
    senderId: msg.senderId,
    senderRole: msg.senderRole,
    text: msg.text || null,
    mediaUrl: msg.mediaUrl || null,
    mediaType: msg.mediaType || null,
    createdAt: msg.createdAt
  };
}

/**
 * Formats a raw BroadcastChannel record into a clean DTO.
 *
 * @param {Object} ch - Prisma BroadcastChannel entity
 * @returns {Object|null}
 */
export function formatBroadcastChannel(ch) {
  if (!ch) return null;
  return {
    id: ch.id,
    schoolId: ch.schoolId,
    name: ch.name,
    classId: ch.classId || null,
    className: ch.class?.name || null,
    createdBy: ch.createdBy,
    createdAt: ch.createdAt,
    updatedAt: ch.updatedAt
  };
}

/**
 * Formats a raw ChannelPost record into a clean DTO.
 *
 * @param {Object} post - Prisma ChannelPost entity
 * @returns {Object|null}
 */
export function formatChannelPost(post) {
  if (!post) return null;
  return {
    id: post.id,
    schoolId: post.schoolId,
    channelId: post.channelId,
    senderId: post.senderId,
    senderName: post.senderName,
    text: post.text || null,
    mediaUrl: post.mediaUrl || null,
    mediaType: post.mediaType || null,
    createdAt: post.createdAt
  };
}

// ============================================================
// ROLE & ACCESS HELPERS
// ============================================================

/**
 * Checks if the actor has an administrative role.
 */
export function isAdministrator(actor) {
  if (!actor) return false;

  const role = (actor.systemRole || actor.role || '').toUpperCase();
  const roles = Array.isArray(actor.roles) ? actor.roles.map((r) => String(r).toUpperCase()) : [];

  const ADMIN_ROLES = new Set([
    SYSTEM_ROLES.SUPER_ADMIN,
    SYSTEM_ROLES.SCHOOL_ADMIN,
    SYSTEM_ROLES.PRINCIPAL,
    'SUPER_ADMIN',
    'SCHOOL_ADMIN',
    'TENANT_ADMIN',
    'ADMIN',
    'PRINCIPAL'
  ]);

  if (ADMIN_ROLES.has(role)) return true;
  if (roles.some((r) => ADMIN_ROLES.has(r))) return true;

  return false;
}

/**
 * Checks if the actor is a parent.
 */
export function isParent(actor) {
  const role = (actor?.systemRole || actor?.role || '').toUpperCase();
  return role === SYSTEM_ROLES.PARENT || role === 'PARENT';
}

/**
 * Checks if the actor is a teacher / faculty staff.
 */
export function isTeacher(actor) {
  const role = (actor?.systemRole || actor?.role || '').toUpperCase();
  return role === SYSTEM_ROLES.TEACHER || role === 'TEACHER' || role === SYSTEM_ROLES.STAFF || role === 'STAFF';
}

/**
 * Resolves teacher's StaffProfile and verifies active status.
 */
export async function resolveTeacherStaffProfile(schoolId, actor, tx = prisma) {
  const userId = actor.id || actor.userId;
  const profile = await chatsRepository.findStaffProfileByUserId(schoolId, userId, tx);

  if (!profile) {
    throw new ForbiddenError('Staff profile not found for authenticated teacher');
  }

  if (profile.user?.isActive === false || profile.status === 'Inactive') {
    throw new ForbiddenError('Teacher account is inactive or disabled');
  }

  return profile;
}

/**
 * Resolves parent's authorized student IDs.
 */
export async function resolveParentAuthorizedStudents(schoolId, actor, tx = prisma) {
  const userId = actor.id || actor.userId;
  const authorizedIds = await chatsRepository.findAuthorizedStudentIdsForParent(schoolId, userId, tx);
  return authorizedIds;
}

/**
 * Verifies room existence and participant authorization.
 * Returns { room, actorRole } where actorRole is 'admin' | 'teacher' | 'parent'.
 */
export async function verifyRoomAccess(schoolId, roomId, actor, tx = prisma) {
  const room = await chatsRepository.findChatRoomById(schoolId, roomId, tx);
  if (!room) {
    throw new NotFoundError('Chat Room');
  }

  if (isAdministrator(actor)) {
    return { room, actorRole: SENDER_ROLES.ADMIN };
  }

  if (isParent(actor)) {
    const authorizedStudentIds = await resolveParentAuthorizedStudents(schoolId, actor, tx);
    if (!authorizedStudentIds.includes(room.studentId)) {
      throw new NotFoundError('Chat Room');
    }
    return { room, actorRole: SENDER_ROLES.PARENT };
  }

  // Teacher authorization
  const teacherProfile = await resolveTeacherStaffProfile(schoolId, actor, tx);
  const isDirectTeacher = room.teacherId === teacherProfile.id;
  const isClassTeacher = teacherProfile.assignedClassId && teacherProfile.assignedClassId === room.student?.classId;
  const isHeadTeacher = teacherProfile.headedClasses?.some((c) => c.id === room.student?.classId);

  if (!isDirectTeacher && !isClassTeacher && !isHeadTeacher) {
    throw new ForbiddenError('You are not authorized to access this chat room');
  }

  return { room, actorRole: SENDER_ROLES.TEACHER, teacherProfile };
}

// ============================================================
// DIRECT MESSAGING SERVICES
// ============================================================

/**
 * Resolves or creates a ChatRoom for (schoolId, studentId, teacherId).
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} input - { studentId, teacherId }
 * @param {Object} actor - Authenticated user context
 * @returns {Promise<Object>} Formatted ChatRoom DTO
 */
export async function resolveRoom(schoolId, input, actor) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required');
  }

  const { studentId } = input;
  let teacherId = input.teacherId;

  const result = await prisma.$transaction(async (tx) => {
    // 1. Verify student exists in tenant
    const student = await chatsRepository.findStudentById(schoolId, studentId, tx);
    if (!student) {
      throw new NotFoundError('Student');
    }

    // 2. Authorize actor & resolve teacherId
    if (isAdministrator(actor)) {
      if (!teacherId) {
        // Fallback to student's class teacher if available
        if (student.classId) {
          const classTeacher = await tx.staffProfile.findFirst({
            where: {
              schoolId,
              assignedClassId: student.classId,
              status: 'Active'
            },
            select: { id: true }
          });
          teacherId = classTeacher?.id;
        }
      }
      if (!teacherId) {
        throw new ValidationError('teacherId is required when resolving room as administrator');
      }
      const teacherStaff = await chatsRepository.findStaffProfileById(schoolId, teacherId, tx);
      if (!teacherStaff) {
        throw new NotFoundError('Teacher');
      }
    } else if (isParent(actor)) {
      const authorizedStudentIds = await resolveParentAuthorizedStudents(schoolId, actor, tx);
      if (!authorizedStudentIds.includes(studentId)) {
        throw new NotFoundError('Student');
      }

      if (!teacherId) {
        // Find student's class teacher
        if (student.classId) {
          const classTeacher = await tx.staffProfile.findFirst({
            where: {
              schoolId,
              assignedClassId: student.classId,
              status: 'Active'
            },
            select: { id: true }
          });
          teacherId = classTeacher?.id;
        }
      }
      if (!teacherId) {
        throw new ValidationError('Teacher could not be resolved for student');
      }
      const teacherStaff = await chatsRepository.findStaffProfileById(schoolId, teacherId, tx);
      if (!teacherStaff) {
        throw new NotFoundError('Teacher');
      }
    } else {
      // Teacher calling
      const teacherProfile = await resolveTeacherStaffProfile(schoolId, actor, tx);
      teacherId = teacherProfile.id;

      const isAssigned = teacherProfile.assignedClassId && teacherProfile.assignedClassId === student.classId;
      const isHeading = teacherProfile.headedClasses?.some((c) => c.id === student.classId);

      if (!isAssigned && !isHeading && teacherProfile.assignedClassId) {
        // Teacher is restricted to their assigned/headed class
        throw new ForbiddenError('Teachers can only initiate chats with students in their assigned class');
      }
    }

    // 3. Upsert ChatRoom
    return chatsRepository.upsertChatRoom(schoolId, { studentId, teacherId }, tx);
  });

  // Non-blocking audit log
  createAuditLog({
    schoolId,
    entityType: 'ChatRoom',
    entityId: result.id,
    actionPerformed: `RESOLVE_CHAT_ROOM: student=${result.studentId} teacher=${result.teacherId}`,
    userName: actor.name || actor.email || 'User',
    userRole: actor.systemRole || actor.role
  });

  return formatChatRoom(result);
}

/**
 * Lists ChatRooms for the authenticated user.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} query - Query options
 * @param {Object} actor - Authenticated user context
 * @returns {Promise<{ data: Array, pagination: Object }>}
 */
export async function listRooms(schoolId, query = {}, actor) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required');
  }

  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 50));
  const skip = (page - 1) * limit;

  const options = {
    status: query.status,
    skip,
    limit,
    sort: query.sort || 'lastMessageTime',
    order: query.order || 'desc'
  };

  let rooms = [];
  let total = 0;

  if (isAdministrator(actor)) {
    [rooms, total] = await Promise.all([
      chatsRepository.findAdminRooms(schoolId, options),
      chatsRepository.countAdminRooms(schoolId, options)
    ]);
  } else if (isParent(actor)) {
    const studentIds = await resolveParentAuthorizedStudents(schoolId, actor);
    [rooms, total] = await Promise.all([
      chatsRepository.findParentRooms(schoolId, studentIds, options),
      chatsRepository.countParentRooms(schoolId, studentIds, options)
    ]);
  } else {
    // Teacher
    const teacherProfile = await resolveTeacherStaffProfile(schoolId, actor);
    [rooms, total] = await Promise.all([
      chatsRepository.findTeacherRooms(schoolId, teacherProfile.id, options),
      chatsRepository.countTeacherRooms(schoolId, teacherProfile.id, options)
    ]);
  }

  const totalPages = Math.ceil(total / limit) || 1;

  return {
    data: rooms.map(formatChatRoom),
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
 * Retrieves a single ChatRoom by ID.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} roomId - ChatRoom UUID
 * @param {Object} actor - Authenticated user context
 * @returns {Promise<Object>}
 */
export async function getRoomById(schoolId, roomId, actor) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required');
  }

  const { room } = await verifyRoomAccess(schoolId, roomId, actor);
  return formatChatRoom(room);
}

/**
 * Lists messages in a ChatRoom with pagination.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} roomId - ChatRoom UUID
 * @param {Object} query - Pagination options
 * @param {Object} actor - Authenticated user context
 * @returns {Promise<{ data: Array, pagination: Object }>}
 */
export async function listMessages(schoolId, roomId, query = {}, actor) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required');
  }

  await verifyRoomAccess(schoolId, roomId, actor);

  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 50));
  const skip = (page - 1) * limit;

  const options = {
    skip,
    limit,
    sort: query.sort || 'createdAt',
    order: query.order || 'asc'
  };

  const [messages, total] = await Promise.all([
    chatsRepository.findMessagesByRoom(schoolId, roomId, options),
    chatsRepository.countMessagesByRoom(schoolId, roomId)
  ]);

  const totalPages = Math.ceil(total / limit) || 1;

  return {
    data: messages.map(formatChatMessage),
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
 * Sends a message in a ChatRoom.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} roomId - ChatRoom UUID
 * @param {Object} input - { text, mediaUrl, mediaType }
 * @param {Object} actor - Authenticated user context
 * @returns {Promise<Object>} Formatted ChatMessage DTO
 */
export async function sendMessage(schoolId, roomId, input, actor) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required');
  }

  const { actorRole } = await verifyRoomAccess(schoolId, roomId, actor);

  const senderId = actor.id || actor.userId;
  const senderRole = actorRole;

  let recipientRole = 'parent';
  if (actorRole === SENDER_ROLES.PARENT) {
    recipientRole = 'teacher';
  } else if (actorRole === SENDER_ROLES.TEACHER) {
    recipientRole = 'parent';
  }

  const now = new Date();
  const previewText = input.text || (input.mediaType ? `[${input.mediaType}]` : '[Attachment]');

  const createdMessage = await prisma.$transaction(async (tx) => {
    // 1. Create message
    const msg = await chatsRepository.createChatMessage(
      {
        schoolId,
        chatRoomId: roomId,
        senderId,
        senderRole,
        text: input.text || null,
        mediaUrl: input.mediaUrl || null,
        mediaType: input.mediaType || null,
        createdAt: now
      },
      tx
    );

    // 2. Update room lastMessage and atomically increment recipient unread count
    await chatsRepository.updateRoomAfterMessage(
      schoolId,
      roomId,
      {
        lastMessage: previewText,
        lastMessageTime: now,
        recipientRole
      },
      tx
    );

    return msg;
  });

  // Non-blocking audit log
  createAuditLog({
    schoolId,
    entityType: 'ChatMessage',
    entityId: createdMessage.id,
    actionPerformed: `SEND_MESSAGE: room=${roomId} sender=${senderRole}`,
    userName: actor.name || actor.email || 'User',
    userRole: actor.systemRole || actor.role
  });

  return formatChatMessage(createdMessage);
}

/**
 * Marks a ChatRoom as read for the authenticated actor.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} roomId - ChatRoom UUID
 * @param {Object} actor - Authenticated user context
 * @returns {Promise<Object>}
 */
export async function markRoomRead(schoolId, roomId, actor) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required');
  }

  const { actorRole } = await verifyRoomAccess(schoolId, roomId, actor);

  let updatedRoom;
  if (actorRole === SENDER_ROLES.TEACHER) {
    updatedRoom = await chatsRepository.resetRoomUnreadCount(schoolId, roomId, 'teacher');
  } else if (actorRole === SENDER_ROLES.PARENT) {
    updatedRoom = await chatsRepository.resetRoomUnreadCount(schoolId, roomId, 'parent');
  } else {
    // Admin reading does not affect participant unread counters
    updatedRoom = await chatsRepository.findChatRoomById(schoolId, roomId);
  }

  return {
    success: true,
    roomId,
    unreadCountParent: updatedRoom?.unreadCountParent || 0,
    unreadCountTeacher: updatedRoom?.unreadCountTeacher || 0,
    unreadCount_parent: updatedRoom?.unreadCountParent || 0,
    unreadCount_teacher: updatedRoom?.unreadCountTeacher || 0
  };
}

/**
 * Gets the total unread chat messages count for the authenticated actor.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} actor - Authenticated user context
 * @returns {Promise<{ count: number }>}
 */
export async function getUnreadCount(schoolId, actor) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required');
  }

  if (isAdministrator(actor)) {
    return { count: 0 };
  }

  if (isParent(actor)) {
    const studentIds = await resolveParentAuthorizedStudents(schoolId, actor);
    const count = await chatsRepository.getUnreadCountForParent(schoolId, studentIds);
    return { count };
  }

  if (isTeacher(actor)) {
    const teacherProfile = await resolveTeacherStaffProfile(schoolId, actor);
    const count = await chatsRepository.getUnreadCountForTeacher(schoolId, teacherProfile.id);
    return { count };
  }

  return { count: 0 };
}

// ============================================================
// ADMIN MONITORING
// ============================================================

/**
 * Lists all chat threads for Admin monitoring with filters and search.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} query - Filter & pagination options
 * @param {Object} actor - Authenticated admin context
 * @returns {Promise<{ data: Array, pagination: Object }>}
 */
export async function adminListThreads(schoolId, query = {}, actor) {
  if (!isAdministrator(actor)) {
    throw new ForbiddenError('Administrative privileges required');
  }

  const targetSchoolId = schoolId || query.schoolId || null;

  if (!targetSchoolId && !isAdministrator(actor)) {
    throw new TenantAccessError('Tenant context required');
  }

  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 50));
  const skip = (page - 1) * limit;

  const options = {
    schoolId: targetSchoolId,
    teacherId: query.teacherId,
    studentId: query.studentId,
    search: query.search,
    status: query.status,
    skip,
    limit,
    sort: query.sort || 'lastMessageTime',
    order: query.order || 'desc'
  };

  const [rooms, total] = await Promise.all([
    chatsRepository.findAdminRooms(targetSchoolId, options),
    chatsRepository.countAdminRooms(targetSchoolId, options)
  ]);

  const totalPages = Math.ceil(total / limit) || 1;

  return {
    data: rooms.map(formatChatRoom),
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

// ============================================================
// BROADCAST CHANNELS & POSTS
// ============================================================

/**
 * Lists BroadcastChannels accessible to the authenticated actor.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} query - Filter & pagination options
 * @param {Object} actor - Authenticated user context
 * @returns {Promise<{ data: Array, pagination: Object }>}
 */
export async function listChannels(schoolId, query = {}, actor) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required');
  }

  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 50));
  const skip = (page - 1) * limit;

  let filter = {};

  if (isAdministrator(actor)) {
    if (query.classId) {
      filter = { classId: query.classId };
    }
  } else if (isParent(actor)) {
    const studentIds = await resolveParentAuthorizedStudents(schoolId, actor);
    const students = await prisma.student.findMany({
      where: {
        schoolId,
        id: { in: studentIds }
      },
      select: { classId: true }
    });
    const classIds = students.map((s) => s.classId).filter(Boolean);

    filter = {
      OR: [
        { classId: null },
        { classId: { in: classIds } }
      ]
    };
  } else {
    // Teacher
    const teacherProfile = await resolveTeacherStaffProfile(schoolId, actor);
    const teacherClassIds = [];
    if (teacherProfile.assignedClassId) {
      teacherClassIds.push(teacherProfile.assignedClassId);
    }
    if (teacherProfile.headedClasses) {
      teacherProfile.headedClasses.forEach((c) => teacherClassIds.push(c.id));
    }

    filter = {
      OR: [
        { classId: null },
        { classId: { in: teacherClassIds } }
      ]
    };
  }

  const options = { skip, limit };
  const [channels, total] = await Promise.all([
    chatsRepository.findBroadcastChannels(schoolId, filter, options),
    chatsRepository.countBroadcastChannels(schoolId, filter)
  ]);

  const totalPages = Math.ceil(total / limit) || 1;

  return {
    data: channels.map(formatBroadcastChannel),
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
 * Creates a new BroadcastChannel.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} input - { name, classId }
 * @param {Object} actor - Authenticated user context
 * @returns {Promise<Object>} Formatted BroadcastChannel DTO
 */
export async function createChannel(schoolId, input, actor) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required');
  }

  const userId = actor.id || actor.userId;

  if (isParent(actor)) {
    throw new ForbiddenError('Parents cannot create broadcast channels');
  }

  if (!isAdministrator(actor)) {
    // Teacher creating channel: must be for teacher's assigned/headed class
    if (!input.classId) {
      throw new ForbiddenError('Teachers cannot create school-wide broadcast channels');
    }
    const teacherProfile = await resolveTeacherStaffProfile(schoolId, actor);
    const isAssigned = teacherProfile.assignedClassId === input.classId;
    const isHeading = teacherProfile.headedClasses?.some((c) => c.id === input.classId);

    if (!isAssigned && !isHeading) {
      throw new ForbiddenError('You can only create channels for your assigned class');
    }
  }

  if (input.classId) {
    const classEntity = await prisma.class.findFirst({
      where: {
        id: input.classId,
        schoolId
      }
    });
    if (!classEntity) {
      throw new NotFoundError('Class');
    }
  }

  const channel = await chatsRepository.createBroadcastChannel({
    schoolId,
    name: input.name,
    classId: input.classId || null,
    createdBy: userId
  });

  createAuditLog({
    schoolId,
    entityType: 'BroadcastChannel',
    entityId: channel.id,
    actionPerformed: `CREATE_BROADCAST_CHANNEL: ${channel.name}`,
    userName: actor.name || actor.email || 'User',
    userRole: actor.systemRole || actor.role
  });

  return formatBroadcastChannel(channel);
}

/**
 * Lists posts in a BroadcastChannel.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} channelId - BroadcastChannel UUID
 * @param {Object} query - Pagination options
 * @param {Object} actor - Authenticated user context
 * @returns {Promise<{ data: Array, pagination: Object }>}
 */
export async function listChannelPosts(schoolId, channelId, query = {}, actor) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required');
  }

  const channel = await chatsRepository.findBroadcastChannelById(schoolId, channelId);
  if (!channel) {
    throw new NotFoundError('Broadcast Channel');
  }

  // Verify access to channel
  if (!isAdministrator(actor)) {
    if (channel.classId) {
      if (isParent(actor)) {
        const studentIds = await resolveParentAuthorizedStudents(schoolId, actor);
        const hasChildInClass = await prisma.student.findFirst({
          where: {
            schoolId,
            id: { in: studentIds },
            classId: channel.classId
          }
        });
        if (!hasChildInClass) {
          throw new NotFoundError('Broadcast Channel');
        }
      } else {
        // Teacher
        const teacherProfile = await resolveTeacherStaffProfile(schoolId, actor);
        const isAssigned = teacherProfile.assignedClassId === channel.classId;
        const isHeading = teacherProfile.headedClasses?.some((c) => c.id === channel.classId);
        if (!isAssigned && !isHeading) {
          throw new ForbiddenError('You do not have access to this broadcast channel');
        }
      }
    }
  }

  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 50));
  const skip = (page - 1) * limit;

  const options = {
    skip,
    limit,
    sort: query.sort || 'createdAt',
    order: query.order || 'asc'
  };

  const [posts, total] = await Promise.all([
    chatsRepository.findChannelPosts(schoolId, channelId, options),
    chatsRepository.countChannelPosts(schoolId, channelId)
  ]);

  const totalPages = Math.ceil(total / limit) || 1;

  return {
    data: posts.map(formatChannelPost),
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
 * Creates a post in a BroadcastChannel.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} channelId - BroadcastChannel UUID
 * @param {Object} input - { text, mediaUrl, mediaType }
 * @param {Object} actor - Authenticated user context
 * @returns {Promise<Object>} Formatted ChannelPost DTO
 */
export async function createChannelPost(schoolId, channelId, input, actor) {
  if (!schoolId) {
    throw new TenantAccessError('Tenant context required');
  }

  const channel = await chatsRepository.findBroadcastChannelById(schoolId, channelId);
  if (!channel) {
    throw new NotFoundError('Broadcast Channel');
  }

  if (isParent(actor)) {
    throw new ForbiddenError('Parents cannot post to broadcast channels');
  }

  let senderName = actor.name || actor.email || 'Teacher';

  if (!isAdministrator(actor)) {
    const teacherProfile = await resolveTeacherStaffProfile(schoolId, actor);
    senderName = teacherProfile.name || senderName;

    if (channel.classId) {
      const isAssigned = teacherProfile.assignedClassId === channel.classId;
      const isHeading = teacherProfile.headedClasses?.some((c) => c.id === channel.classId);
      if (!isAssigned && !isHeading) {
        throw new ForbiddenError('You can only post to broadcast channels for your assigned class');
      }
    }
  }

  const userId = actor.id || actor.userId;

  const post = await chatsRepository.createChannelPost({
    schoolId,
    channelId,
    senderId: userId,
    senderName,
    text: input.text || null,
    mediaUrl: input.mediaUrl || null,
    mediaType: input.mediaType || null,
    createdAt: new Date()
  });

  createAuditLog({
    schoolId,
    entityType: 'ChannelPost',
    entityId: post.id,
    actionPerformed: `CREATE_CHANNEL_POST: channel=${channelId}`,
    userName: senderName,
    userRole: actor.systemRole || actor.role
  });

  return formatChannelPost(post);
}
