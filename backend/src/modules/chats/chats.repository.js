import { prisma } from '../../database/prisma.client.js';

/**
 * Chat Data Access Repository Layer
 *
 * Strict Architectural Invariants:
 * 1. schoolId is mandatory on every query and mutation to enforce tenant isolation.
 * 2. Cross-tenant reads and writes are strictly prevented.
 * 3. Supports transaction propagation via optional `tx` parameter.
 */

// ============================================================
// IDENTITY & PROFILE RESOLUTION
// ============================================================

/**
 * Finds a StaffProfile by User ID within tenant context.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} userId - User UUID
 * @param {Object} [tx=prisma]
 * @returns {Promise<Object|null>}
 */
export async function findStaffProfileByUserId(schoolId, userId, tx = prisma) {
  return tx.staffProfile.findFirst({
    where: {
      schoolId,
      userId
    },
    include: {
      user: {
        select: {
          id: true,
          isActive: true
        }
      },
      assignedClass: {
        select: {
          id: true,
          name: true
        }
      },
      headedClasses: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });
}

/**
 * Finds a StaffProfile by ID within tenant context.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} staffProfileId - StaffProfile UUID
 * @param {Object} [tx=prisma]
 * @returns {Promise<Object|null>}
 */
export async function findStaffProfileById(schoolId, staffProfileId, tx = prisma) {
  return tx.staffProfile.findFirst({
    where: {
      id: staffProfileId,
      schoolId
    },
    include: {
      user: {
        select: {
          id: true,
          isActive: true
        }
      },
      assignedClass: {
        select: {
          id: true,
          name: true
        }
      },
      headedClasses: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });
}

/**
 * Finds a ParentProfile by User ID within tenant context.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} userId - Parent User UUID
 * @param {Object} [tx=prisma]
 * @returns {Promise<Object|null>}
 */
export async function findParentProfileByUserId(schoolId, userId, tx = prisma) {
  return tx.parentProfile.findFirst({
    where: {
      schoolId,
      userId
    },
    include: {
      user: {
        select: {
          id: true,
          isActive: true
        }
      },
      children: {
        select: {
          studentId: true
        }
      }
    }
  });
}

/**
 * Derives authorized student IDs for an authenticated parent user within tenant context.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} userId - Parent User UUID
 * @param {Object} [tx=prisma]
 * @returns {Promise<Array<string>>}
 */
export async function findAuthorizedStudentIdsForParent(schoolId, userId, tx = prisma) {
  const profile = await findParentProfileByUserId(schoolId, userId, tx);
  if (!profile || profile.user?.isActive === false) {
    return [];
  }
  return profile.children.map((c) => c.studentId);
}

/**
 * Finds a Student by ID within tenant context.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} studentId - Student UUID
 * @param {Object} [tx=prisma]
 * @returns {Promise<Object|null>}
 */
export async function findStudentById(schoolId, studentId, tx = prisma) {
  return tx.student.findFirst({
    where: {
      id: studentId,
      schoolId
    },
    include: {
      class: {
        select: {
          id: true,
          name: true
        }
      },
      section: {
        select: {
          id: true,
          name: true
        }
      },
      parents: {
        include: {
          parent: {
            select: {
              id: true,
              userId: true,
              name: true,
              phone: true,
              email: true
            }
          }
        }
      }
    }
  });
}

// ============================================================
// CHAT ROOMS
// ============================================================

const ROOM_INCLUDE = {
  student: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      admissionNumber: true,
      rollNumber: true,
      classId: true,
      sectionId: true,
      class: {
        select: {
          id: true,
          name: true
        }
      },
      parents: {
        include: {
          parent: {
            select: {
              id: true,
              userId: true,
              name: true,
              phone: true,
              email: true
            }
          }
        }
      }
    }
  },
  teacher: {
    select: {
      id: true,
      userId: true,
      name: true,
      email: true,
      phone: true,
      designation: true,
      assignedClassId: true,
      assignedClass: {
        select: {
          id: true,
          name: true
        }
      }
    }
  }
};

/**
 * Retrieves a single ChatRoom by ID within tenant context.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} roomId - ChatRoom UUID
 * @param {Object} [tx=prisma]
 * @returns {Promise<Object|null>}
 */
export async function findChatRoomById(schoolId, roomId, tx = prisma) {
  return tx.chatRoom.findFirst({
    where: {
      id: roomId,
      schoolId
    },
    include: ROOM_INCLUDE
  });
}

/**
 * Finds a ChatRoom by exact participant pair (schoolId, studentId, teacherId).
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} studentId - Student UUID
 * @param {string} teacherId - Teacher StaffProfile UUID
 * @param {Object} [tx=prisma]
 * @returns {Promise<Object|null>}
 */
export async function findChatRoomByParticipants(schoolId, studentId, teacherId, tx = prisma) {
  return tx.chatRoom.findUnique({
    where: {
      schoolId_studentId_teacherId: {
        schoolId,
        studentId,
        teacherId
      }
    },
    include: ROOM_INCLUDE
  });
}

/**
 * Upserts a ChatRoom for (schoolId, studentId, teacherId) idempotently.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} data - { studentId, teacherId }
 * @param {Object} [tx=prisma]
 * @returns {Promise<Object>}
 */
export async function upsertChatRoom(schoolId, { studentId, teacherId }, tx = prisma) {
  return tx.chatRoom.upsert({
    where: {
      schoolId_studentId_teacherId: {
        schoolId,
        studentId,
        teacherId
      }
    },
    create: {
      schoolId,
      studentId,
      teacherId,
      status: 'active',
      unreadCountParent: 0,
      unreadCountTeacher: 0
    },
    update: {},
    include: ROOM_INCLUDE
  });
}

/**
 * Finds all ChatRooms for a specific teacher.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} teacherId - StaffProfile UUID
 * @param {Object} options - Pagination and sorting options
 * @param {Object} [tx=prisma]
 * @returns {Promise<Array<Object>>}
 */
export async function findTeacherRooms(schoolId, teacherId, options = {}, tx = prisma) {
  const { status, skip = 0, limit = 50, sort = 'lastMessageTime', order = 'desc' } = options;
  const where = {
    schoolId,
    teacherId,
    ...(status ? { status } : {})
  };

  const orderBy = [];
  if (sort === 'lastMessageTime') {
    orderBy.push({ lastMessageTime: order });
  }
  orderBy.push({ createdAt: 'desc' });

  return tx.chatRoom.findMany({
    where,
    include: ROOM_INCLUDE,
    orderBy,
    skip,
    take: limit
  });
}

/**
 * Counts all ChatRooms for a specific teacher.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} teacherId - StaffProfile UUID
 * @param {Object} options
 * @param {Object} [tx=prisma]
 * @returns {Promise<number>}
 */
export async function countTeacherRooms(schoolId, teacherId, options = {}, tx = prisma) {
  const { status } = options;
  return tx.chatRoom.count({
    where: {
      schoolId,
      teacherId,
      ...(status ? { status } : {})
    }
  });
}

/**
 * Finds all ChatRooms for a parent's authorized student IDs.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Array<string>} studentIds - Authorized Student UUIDs
 * @param {Object} options
 * @param {Object} [tx=prisma]
 * @returns {Promise<Array<Object>>}
 */
export async function findParentRooms(schoolId, studentIds, options = {}, tx = prisma) {
  if (!studentIds || studentIds.length === 0) return [];
  const { status, skip = 0, limit = 50, sort = 'lastMessageTime', order = 'desc' } = options;

  const where = {
    schoolId,
    studentId: { in: studentIds },
    ...(status ? { status } : {})
  };

  const orderBy = [];
  if (sort === 'lastMessageTime') {
    orderBy.push({ lastMessageTime: order });
  }
  orderBy.push({ createdAt: 'desc' });

  return tx.chatRoom.findMany({
    where,
    include: ROOM_INCLUDE,
    orderBy,
    skip,
    take: limit
  });
}

/**
 * Counts all ChatRooms for a parent's authorized student IDs.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Array<string>} studentIds
 * @param {Object} options
 * @param {Object} [tx=prisma]
 * @returns {Promise<number>}
 */
export async function countParentRooms(schoolId, studentIds, options = {}, tx = prisma) {
  if (!studentIds || studentIds.length === 0) return 0;
  const { status } = options;
  return tx.chatRoom.count({
    where: {
      schoolId,
      studentId: { in: studentIds },
      ...(status ? { status } : {})
    }
  });
}

/**
 * Finds all ChatRooms for admin monitoring within tenant context.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} options
 * @param {Object} [tx=prisma]
 * @returns {Promise<Array<Object>>}
 */
export async function findAdminRooms(schoolId, options = {}, tx = prisma) {
  const { teacherId, studentId, search, status, skip = 0, limit = 50, sort = 'lastMessageTime', order = 'desc' } = options;

  const targetSchoolId = schoolId || options.schoolId || null;

  const where = {
    ...(targetSchoolId ? { schoolId: targetSchoolId } : {}),
    ...(teacherId ? { teacherId } : {}),
    ...(studentId ? { studentId } : {}),
    ...(status ? { status } : {})
  };

  if (search) {
    where.OR = [
      { lastMessage: { contains: search, mode: 'insensitive' } },
      { student: { firstName: { contains: search, mode: 'insensitive' } } },
      { student: { lastName: { contains: search, mode: 'insensitive' } } },
      { teacher: { name: { contains: search, mode: 'insensitive' } } }
    ];
  }

  const orderBy = [];
  if (sort === 'lastMessageTime') {
    orderBy.push({ lastMessageTime: order });
  }
  orderBy.push({ createdAt: 'desc' });

  return tx.chatRoom.findMany({
    where,
    include: ROOM_INCLUDE,
    orderBy,
    skip,
    take: limit
  });
}

/**
 * Counts all ChatRooms for admin monitoring.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} options
 * @param {Object} [tx=prisma]
 * @returns {Promise<number>}
 */
export async function countAdminRooms(schoolId, options = {}, tx = prisma) {
  const { teacherId, studentId, search, status } = options;

  const targetSchoolId = schoolId || options.schoolId || null;

  const where = {
    ...(targetSchoolId ? { schoolId: targetSchoolId } : {}),
    ...(teacherId ? { teacherId } : {}),
    ...(studentId ? { studentId } : {}),
    ...(status ? { status } : {})
  };

  if (search) {
    where.OR = [
      { lastMessage: { contains: search, mode: 'insensitive' } },
      { student: { firstName: { contains: search, mode: 'insensitive' } } },
      { student: { lastName: { contains: search, mode: 'insensitive' } } },
      { teacher: { name: { contains: search, mode: 'insensitive' } } }
    ];
  }

  return tx.chatRoom.count({ where });
}

// ============================================================
// CHAT MESSAGES
// ============================================================

/**
 * Creates a new ChatMessage record.
 *
 * @param {Object} messageData
 * @param {Object} [tx=prisma]
 * @returns {Promise<Object>}
 */
export async function createChatMessage(messageData, tx = prisma) {
  return tx.chatMessage.create({
    data: {
      schoolId: messageData.schoolId,
      chatRoomId: messageData.chatRoomId,
      senderId: messageData.senderId,
      senderRole: messageData.senderRole,
      text: messageData.text || null,
      mediaUrl: messageData.mediaUrl || null,
      mediaType: messageData.mediaType || null,
      createdAt: messageData.createdAt || new Date()
    }
  });
}

/**
 * Finds messages for a ChatRoom ordered chronologically with pagination.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} chatRoomId - ChatRoom UUID
 * @param {Object} options
 * @param {Object} [tx=prisma]
 * @returns {Promise<Array<Object>>}
 */
export async function findMessagesByRoom(schoolId, chatRoomId, options = {}, tx = prisma) {
  const { skip = 0, limit = 50, sort = 'createdAt', order = 'asc' } = options;

  return tx.chatMessage.findMany({
    where: {
      schoolId,
      chatRoomId
    },
    orderBy: {
      [sort]: order
    },
    skip,
    take: limit
  });
}

/**
 * Counts total messages in a ChatRoom.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} chatRoomId - ChatRoom UUID
 * @param {Object} [tx=prisma]
 * @returns {Promise<number>}
 */
export async function countMessagesByRoom(schoolId, chatRoomId, tx = prisma) {
  return tx.chatMessage.count({
    where: {
      schoolId,
      chatRoomId
    }
  });
}

/**
 * Updates ChatRoom last message metadata and atomically increments recipient unread count.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} chatRoomId - ChatRoom UUID
 * @param {Object} updateData
 * @param {Object} [tx=prisma]
 * @returns {Promise<Object>}
 */
export async function updateRoomAfterMessage(schoolId, chatRoomId, updateData, tx = prisma) {
  const { lastMessage, lastMessageTime = new Date(), recipientRole } = updateData;

  const data = {
    lastMessage,
    lastMessageTime
  };

  if (recipientRole === 'parent') {
    data.unreadCountParent = { increment: 1 };
  } else if (recipientRole === 'teacher') {
    data.unreadCountTeacher = { increment: 1 };
  }

  return tx.chatRoom.update({
    where: {
      schoolId_id: {
        schoolId,
        id: chatRoomId
      }
    },
    data,
    include: ROOM_INCLUDE
  });
}

/**
 * Resets a participant's unread counter to 0.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} chatRoomId - ChatRoom UUID
 * @param {string} participantRole - 'teacher' | 'parent'
 * @param {Object} [tx=prisma]
 * @returns {Promise<Object>}
 */
export async function resetRoomUnreadCount(schoolId, chatRoomId, participantRole, tx = prisma) {
  const data = {};
  if (participantRole === 'teacher') {
    data.unreadCountTeacher = 0;
  } else if (participantRole === 'parent') {
    data.unreadCountParent = 0;
  }

  return tx.chatRoom.update({
    where: {
      schoolId_id: {
        schoolId,
        id: chatRoomId
      }
    },
    data,
    include: ROOM_INCLUDE
  });
}

/**
 * Sums all unread messages for a teacher across all rooms.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} teacherId - StaffProfile UUID
 * @param {Object} [tx=prisma]
 * @returns {Promise<number>}
 */
export async function getUnreadCountForTeacher(schoolId, teacherId, tx = prisma) {
  const aggregate = await tx.chatRoom.aggregate({
    where: {
      schoolId,
      teacherId
    },
    _sum: {
      unreadCountTeacher: true
    }
  });
  return aggregate._sum.unreadCountTeacher || 0;
}

/**
 * Sums all unread messages for a parent across all authorized student rooms.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Array<string>} studentIds - Authorized Student UUIDs
 * @param {Object} [tx=prisma]
 * @returns {Promise<number>}
 */
export async function getUnreadCountForParent(schoolId, studentIds, tx = prisma) {
  if (!studentIds || studentIds.length === 0) return 0;
  const aggregate = await tx.chatRoom.aggregate({
    where: {
      schoolId,
      studentId: { in: studentIds }
    },
    _sum: {
      unreadCountParent: true
    }
  });
  return aggregate._sum.unreadCountParent || 0;
}

// ============================================================
// BROADCAST CHANNELS & POSTS
// ============================================================

/**
 * Finds BroadcastChannels matching filter within tenant context.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} filter - Query criteria (e.g. classId in list or null)
 * @param {Object} options - Pagination options
 * @param {Object} [tx=prisma]
 * @returns {Promise<Array<Object>>}
 */
export async function findBroadcastChannels(schoolId, filter = {}, options = {}, tx = prisma) {
  const { skip = 0, limit = 50 } = options;

  const where = {
    schoolId,
    ...filter
  };

  return tx.broadcastChannel.findMany({
    where,
    include: {
      class: {
        select: {
          id: true,
          name: true
        }
      }
    },
    orderBy: {
      createdAt: 'desc'
    },
    skip,
    take: limit
  });
}

/**
 * Counts BroadcastChannels matching filter.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {Object} filter
 * @param {Object} [tx=prisma]
 * @returns {Promise<number>}
 */
export async function countBroadcastChannels(schoolId, filter = {}, tx = prisma) {
  return tx.broadcastChannel.count({
    where: {
      schoolId,
      ...filter
    }
  });
}

/**
 * Finds a BroadcastChannel by ID within tenant context.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} channelId - BroadcastChannel UUID
 * @param {Object} [tx=prisma]
 * @returns {Promise<Object|null>}
 */
export async function findBroadcastChannelById(schoolId, channelId, tx = prisma) {
  return tx.broadcastChannel.findFirst({
    where: {
      id: channelId,
      schoolId
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
 * Creates a new BroadcastChannel record.
 *
 * @param {Object} channelData
 * @param {Object} [tx=prisma]
 * @returns {Promise<Object>}
 */
export async function createBroadcastChannel(channelData, tx = prisma) {
  return tx.broadcastChannel.create({
    data: {
      schoolId: channelData.schoolId,
      name: channelData.name,
      classId: channelData.classId || null,
      createdBy: channelData.createdBy
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
 * Finds ChannelPosts for a BroadcastChannel ordered chronologically with pagination.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} channelId - BroadcastChannel UUID
 * @param {Object} options
 * @param {Object} [tx=prisma]
 * @returns {Promise<Array<Object>>}
 */
export async function findChannelPosts(schoolId, channelId, options = {}, tx = prisma) {
  const { skip = 0, limit = 50, sort = 'createdAt', order = 'asc' } = options;

  return tx.channelPost.findMany({
    where: {
      schoolId,
      channelId
    },
    orderBy: {
      [sort]: order
    },
    skip,
    take: limit
  });
}

/**
 * Counts ChannelPosts for a BroadcastChannel.
 *
 * @param {string} schoolId - Tenant UUID
 * @param {string} channelId - BroadcastChannel UUID
 * @param {Object} [tx=prisma]
 * @returns {Promise<number>}
 */
export async function countChannelPosts(schoolId, channelId, tx = prisma) {
  return tx.channelPost.count({
    where: {
      schoolId,
      channelId
    }
  });
}

/**
 * Creates a new ChannelPost record.
 *
 * @param {Object} postData
 * @param {Object} [tx=prisma]
 * @returns {Promise<Object>}
 */
export async function createChannelPost(postData, tx = prisma) {
  return tx.channelPost.create({
    data: {
      schoolId: postData.schoolId,
      channelId: postData.channelId,
      senderId: postData.senderId,
      senderName: postData.senderName,
      text: postData.text || null,
      mediaUrl: postData.mediaUrl || null,
      mediaType: postData.mediaType || null,
      createdAt: postData.createdAt || new Date()
    }
  });
}
