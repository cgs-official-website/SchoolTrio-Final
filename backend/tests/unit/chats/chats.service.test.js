import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as chatsService from '../../../src/modules/chats/chats.service.js';
import * as chatsRepository from '../../../src/modules/chats/chats.repository.js';
import {
  NotFoundError,
  ForbiddenError,
  TenantAccessError
} from '../../../src/utils/app-error.js';
import { SYSTEM_ROLES } from '../../../src/config/constants.js';

vi.mock('../../../src/modules/chats/chats.repository.js');
vi.mock('../../../src/database/prisma.client.js', () => ({
  prisma: {
    $transaction: vi.fn((cb) => cb({
      staffProfile: { findFirst: vi.fn() },
      student: { findMany: vi.fn(), findFirst: vi.fn() },
      class: { findFirst: vi.fn() }
    })),
    student: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null)
    },
    class: {
      findFirst: vi.fn().mockResolvedValue(null)
    }
  }
}));
vi.mock('../../../src/modules/audit/audit.repository.js', () => ({
  createAuditLog: vi.fn().mockResolvedValue({ id: 'audit-1' })
}));

describe('Unit: Chats Service Tests', () => {
  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
  const CLASS_ID = '22222222-2222-4222-8222-222222222222';
  const STUDENT_ID = '33333333-3333-4333-8333-333333333333';
  const UNLINKED_STUDENT_ID = '33333333-9999-4333-8333-999999999999';
  const TEACHER_USER_ID = '44444444-4444-4444-8444-444444444444';
  const TEACHER_PROFILE_ID = '55555555-5555-4555-8555-555555555555';
  const PARENT_USER_ID = '66666666-6666-4666-8666-666666666666';
  const ADMIN_USER_ID = '77777777-7777-4777-8777-777777777777';
  const ROOM_ID = '88888888-8888-4888-8888-888888888888';
  const CHANNEL_ID = '99999999-9999-4999-8999-999999999999';

  const TEACHER_ACTOR = {
    id: TEACHER_USER_ID,
    userId: TEACHER_USER_ID,
    email: 'teacher@school.com',
    name: 'Jane Teacher',
    role: 'TEACHER',
    systemRole: SYSTEM_ROLES.TEACHER
  };

  const PARENT_ACTOR = {
    id: PARENT_USER_ID,
    userId: PARENT_USER_ID,
    email: 'parent@home.com',
    name: 'John Parent',
    role: 'PARENT',
    systemRole: SYSTEM_ROLES.PARENT
  };

  const ADMIN_ACTOR = {
    id: ADMIN_USER_ID,
    userId: ADMIN_USER_ID,
    email: 'admin@school.com',
    name: 'Admin Principal',
    role: 'ADMIN',
    systemRole: SYSTEM_ROLES.ADMIN
  };

  const MOCK_TEACHER_PROFILE = {
    id: TEACHER_PROFILE_ID,
    schoolId: SCHOOL_ID,
    userId: TEACHER_USER_ID,
    name: 'Jane Teacher',
    status: 'Active',
    assignedClassId: CLASS_ID,
    user: { isActive: true },
    assignedClass: { id: CLASS_ID, name: 'Grade 10-A' },
    headedClasses: []
  };

  const MOCK_STUDENT = {
    id: STUDENT_ID,
    schoolId: SCHOOL_ID,
    classId: CLASS_ID,
    firstName: 'Alex',
    lastName: 'Smith',
    admissionNumber: 'ADM-001',
    rollNumber: '10',
    class: { id: CLASS_ID, name: 'Grade 10-A' },
    parents: [
      {
        parent: {
          id: 'parent-prof-1',
          name: 'John Parent',
          phone: '+919876543210',
          email: 'parent@home.com'
        }
      }
    ]
  };

  const MOCK_ROOM = {
    id: ROOM_ID,
    schoolId: SCHOOL_ID,
    studentId: STUDENT_ID,
    teacherId: TEACHER_PROFILE_ID,
    status: 'active',
    lastMessage: 'Hello parent',
    lastMessageTime: new Date('2026-09-15T10:00:00Z'),
    unreadCountParent: 1,
    unreadCountTeacher: 0,
    createdAt: new Date('2026-09-10T10:00:00Z'),
    updatedAt: new Date('2026-09-15T10:00:00Z'),
    student: MOCK_STUDENT,
    teacher: MOCK_TEACHER_PROFILE
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================
  // 1. TENANT ISOLATION & AUTHENTICATION
  // ============================================================
  describe('Tenant Isolation & Authentication', () => {
    it('throws TenantAccessError when schoolId is missing', async () => {
      await expect(chatsService.listRooms(null, {}, TEACHER_ACTOR)).rejects.toThrow(TenantAccessError);
      await expect(chatsService.resolveRoom(null, { studentId: STUDENT_ID }, TEACHER_ACTOR)).rejects.toThrow(TenantAccessError);
      await expect(chatsService.getRoomById(null, ROOM_ID, TEACHER_ACTOR)).rejects.toThrow(TenantAccessError);
      await expect(chatsService.sendMessage(null, ROOM_ID, { text: 'hi' }, TEACHER_ACTOR)).rejects.toThrow(TenantAccessError);
      await expect(chatsService.markRoomRead(null, ROOM_ID, TEACHER_ACTOR)).rejects.toThrow(TenantAccessError);
      await expect(chatsService.getUnreadCount(null, TEACHER_ACTOR)).rejects.toThrow(TenantAccessError);
      await expect(chatsService.listChannels(null, {}, TEACHER_ACTOR)).rejects.toThrow(TenantAccessError);
    });
  });

  // ============================================================
  // 2. PARENT CUSTODY
  // ============================================================
  describe('Parent Custody Authorization', () => {
    it('allows parent to list rooms only for linked children', async () => {
      chatsRepository.findAuthorizedStudentIdsForParent.mockResolvedValue([STUDENT_ID]);
      chatsRepository.findParentRooms.mockResolvedValue([MOCK_ROOM]);
      chatsRepository.countParentRooms.mockResolvedValue(1);

      const result = await chatsService.listRooms(SCHOOL_ID, {}, PARENT_ACTOR);

      expect(chatsRepository.findAuthorizedStudentIdsForParent).toHaveBeenCalledWith(SCHOOL_ID, PARENT_USER_ID, expect.anything());
      expect(chatsRepository.findParentRooms).toHaveBeenCalledWith(
        SCHOOL_ID,
        [STUDENT_ID],
        expect.objectContaining({ skip: 0, limit: 50 })
      );
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe(ROOM_ID);
    });

    it('rejects parent access to room involving unlinked student with NotFoundError', async () => {
      chatsRepository.findChatRoomById.mockResolvedValue(MOCK_ROOM);
      // Parent is authorized only for UNLINKED_STUDENT_ID, not STUDENT_ID in MOCK_ROOM
      chatsRepository.findAuthorizedStudentIdsForParent.mockResolvedValue([UNLINKED_STUDENT_ID]);

      await expect(chatsService.getRoomById(SCHOOL_ID, ROOM_ID, PARENT_ACTOR)).rejects.toThrow(NotFoundError);
    });

    it('rejects parent resolving room for unlinked student', async () => {
      chatsRepository.findStudentById.mockResolvedValue(MOCK_STUDENT);
      chatsRepository.findAuthorizedStudentIdsForParent.mockResolvedValue([UNLINKED_STUDENT_ID]);

      await expect(
        chatsService.resolveRoom(SCHOOL_ID, { studentId: STUDENT_ID }, PARENT_ACTOR)
      ).rejects.toThrow(NotFoundError);
    });
  });

  // ============================================================
  // 3. TEACHER AUTHORIZATION
  // ============================================================
  describe('Teacher Authorization', () => {
    it('allows assigned teacher to access chat room', async () => {
      chatsRepository.findChatRoomById.mockResolvedValue(MOCK_ROOM);
      chatsRepository.findStaffProfileByUserId.mockResolvedValue(MOCK_TEACHER_PROFILE);

      const result = await chatsService.getRoomById(SCHOOL_ID, ROOM_ID, TEACHER_ACTOR);

      expect(result.id).toBe(ROOM_ID);
      expect(result.teacherName).toBe('Jane Teacher');
    });

    it('rejects teacher who is not assigned or heading student class', async () => {
      chatsRepository.findChatRoomById.mockResolvedValue({
        ...MOCK_ROOM,
        teacherId: 'some-other-teacher-id',
        student: { ...MOCK_STUDENT, classId: 'some-other-class-id' }
      });
      chatsRepository.findStaffProfileByUserId.mockResolvedValue(MOCK_TEACHER_PROFILE);

      await expect(chatsService.getRoomById(SCHOOL_ID, ROOM_ID, TEACHER_ACTOR)).rejects.toThrow(ForbiddenError);
    });

    it('rejects deactivated teacher', async () => {
      chatsRepository.findStaffProfileByUserId.mockResolvedValue({
        ...MOCK_TEACHER_PROFILE,
        user: { isActive: false }
      });

      await expect(chatsService.listRooms(SCHOOL_ID, {}, TEACHER_ACTOR)).rejects.toThrow(ForbiddenError);
    });
  });

  // ============================================================
  // 4. ROOM RESOLUTION (Idempotency)
  // ============================================================
  describe('Room Resolution', () => {
    it('teacher resolves room with student in their class', async () => {
      chatsRepository.findStudentById.mockResolvedValue(MOCK_STUDENT);
      chatsRepository.findStaffProfileByUserId.mockResolvedValue(MOCK_TEACHER_PROFILE);
      chatsRepository.upsertChatRoom.mockResolvedValue(MOCK_ROOM);

      const result = await chatsService.resolveRoom(SCHOOL_ID, { studentId: STUDENT_ID }, TEACHER_ACTOR);

      expect(chatsRepository.upsertChatRoom).toHaveBeenCalledWith(
        SCHOOL_ID,
        { studentId: STUDENT_ID, teacherId: TEACHER_PROFILE_ID },
        expect.anything()
      );
      expect(result.id).toBe(ROOM_ID);
    });

    it('parent resolves room with student and teacher', async () => {
      chatsRepository.findStudentById.mockResolvedValue(MOCK_STUDENT);
      chatsRepository.findAuthorizedStudentIdsForParent.mockResolvedValue([STUDENT_ID]);
      chatsRepository.findStaffProfileById.mockResolvedValue(MOCK_TEACHER_PROFILE);
      chatsRepository.upsertChatRoom.mockResolvedValue(MOCK_ROOM);

      const result = await chatsService.resolveRoom(
        SCHOOL_ID,
        { studentId: STUDENT_ID, teacherId: TEACHER_PROFILE_ID },
        PARENT_ACTOR
      );

      expect(result.id).toBe(ROOM_ID);
      expect(result.studentId).toBe(STUDENT_ID);
    });
  });

  // ============================================================
  // 5. MESSAGING & UNREAD COUNTER INCREMENTS
  // ============================================================
  describe('Messaging & Unread Increments', () => {
    it('teacher sends message: updates lastMessage and increments unreadCountParent', async () => {
      chatsRepository.findChatRoomById.mockResolvedValue(MOCK_ROOM);
      chatsRepository.findStaffProfileByUserId.mockResolvedValue(MOCK_TEACHER_PROFILE);

      const mockCreatedMsg = {
        id: 'msg-1',
        schoolId: SCHOOL_ID,
        chatRoomId: ROOM_ID,
        senderId: TEACHER_USER_ID,
        senderRole: 'teacher',
        text: 'Please review homework',
        mediaUrl: null,
        mediaType: null,
        createdAt: new Date('2026-09-15T11:00:00Z')
      };
      chatsRepository.createChatMessage.mockResolvedValue(mockCreatedMsg);
      chatsRepository.updateRoomAfterMessage.mockResolvedValue({
        ...MOCK_ROOM,
        lastMessage: 'Please review homework',
        unreadCountParent: 2
      });

      const result = await chatsService.sendMessage(
        SCHOOL_ID,
        ROOM_ID,
        { text: 'Please review homework' },
        TEACHER_ACTOR
      );

      expect(chatsRepository.createChatMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          schoolId: SCHOOL_ID,
          chatRoomId: ROOM_ID,
          senderId: TEACHER_USER_ID,
          senderRole: 'teacher',
          text: 'Please review homework'
        }),
        expect.anything()
      );

      expect(chatsRepository.updateRoomAfterMessage).toHaveBeenCalledWith(
        SCHOOL_ID,
        ROOM_ID,
        expect.objectContaining({
          lastMessage: 'Please review homework',
          recipientRole: 'parent'
        }),
        expect.anything()
      );

      expect(result.id).toBe('msg-1');
      expect(result.senderRole).toBe('teacher');
    });

    it('parent sends audio message: updates lastMessage to [audio] and increments unreadCountTeacher', async () => {
      chatsRepository.findChatRoomById.mockResolvedValue(MOCK_ROOM);
      chatsRepository.findAuthorizedStudentIdsForParent.mockResolvedValue([STUDENT_ID]);

      const mockCreatedMsg = {
        id: 'msg-2',
        schoolId: SCHOOL_ID,
        chatRoomId: ROOM_ID,
        senderId: PARENT_USER_ID,
        senderRole: 'parent',
        text: null,
        mediaUrl: 'data:audio/webm;base64,...',
        mediaType: 'audio',
        createdAt: new Date()
      };
      chatsRepository.createChatMessage.mockResolvedValue(mockCreatedMsg);
      chatsRepository.updateRoomAfterMessage.mockResolvedValue({
        ...MOCK_ROOM,
        lastMessage: '[audio]',
        unreadCountTeacher: 1
      });

      const result = await chatsService.sendMessage(
        SCHOOL_ID,
        ROOM_ID,
        { mediaUrl: 'data:audio/webm;base64,...', mediaType: 'audio' },
        PARENT_ACTOR
      );

      expect(chatsRepository.updateRoomAfterMessage).toHaveBeenCalledWith(
        SCHOOL_ID,
        ROOM_ID,
        expect.objectContaining({
          lastMessage: '[audio]',
          recipientRole: 'teacher'
        }),
        expect.anything()
      );
      expect(result.mediaType).toBe('audio');
    });
  });

  // ============================================================
  // 6. READ RECEIPTS
  // ============================================================
  describe('Read Receipts', () => {
    it('teacher marks room read: resets unreadCountTeacher', async () => {
      chatsRepository.findChatRoomById.mockResolvedValue(MOCK_ROOM);
      chatsRepository.findStaffProfileByUserId.mockResolvedValue(MOCK_TEACHER_PROFILE);
      chatsRepository.resetRoomUnreadCount.mockResolvedValue({
        ...MOCK_ROOM,
        unreadCountTeacher: 0
      });

      const result = await chatsService.markRoomRead(SCHOOL_ID, ROOM_ID, TEACHER_ACTOR);

      expect(chatsRepository.resetRoomUnreadCount).toHaveBeenCalledWith(
        SCHOOL_ID,
        ROOM_ID,
        'teacher'
      );
      expect(result.unreadCountTeacher).toBe(0);
    });

    it('parent marks room read: resets unreadCountParent', async () => {
      chatsRepository.findChatRoomById.mockResolvedValue(MOCK_ROOM);
      chatsRepository.findAuthorizedStudentIdsForParent.mockResolvedValue([STUDENT_ID]);
      chatsRepository.resetRoomUnreadCount.mockResolvedValue({
        ...MOCK_ROOM,
        unreadCountParent: 0
      });

      const result = await chatsService.markRoomRead(SCHOOL_ID, ROOM_ID, PARENT_ACTOR);

      expect(chatsRepository.resetRoomUnreadCount).toHaveBeenCalledWith(
        SCHOOL_ID,
        ROOM_ID,
        'parent'
      );
      expect(result.unreadCountParent).toBe(0);
    });
  });

  // ============================================================
  // 7. UNREAD COUNT CALCULATION
  // ============================================================
  describe('Unread Count Calculation', () => {
    it('returns sum of unread messages for teacher', async () => {
      chatsRepository.findStaffProfileByUserId.mockResolvedValue(MOCK_TEACHER_PROFILE);
      chatsRepository.getUnreadCountForTeacher.mockResolvedValue(7);

      const result = await chatsService.getUnreadCount(SCHOOL_ID, TEACHER_ACTOR);

      expect(result.count).toBe(7);
    });

    it('returns sum of unread messages for parent', async () => {
      chatsRepository.findAuthorizedStudentIdsForParent.mockResolvedValue([STUDENT_ID]);
      chatsRepository.getUnreadCountForParent.mockResolvedValue(3);

      const result = await chatsService.getUnreadCount(SCHOOL_ID, PARENT_ACTOR);

      expect(result.count).toBe(3);
    });
  });

  // ============================================================
  // 8. ADMIN THREAD MONITORING
  // ============================================================
  describe('Admin Thread Monitoring', () => {
    it('admin lists all tenant threads with search', async () => {
      chatsRepository.findAdminRooms.mockResolvedValue([MOCK_ROOM]);
      chatsRepository.countAdminRooms.mockResolvedValue(1);

      const result = await chatsService.adminListThreads(
        SCHOOL_ID,
        { search: 'Alex', page: 1, limit: 10 },
        ADMIN_ACTOR
      );

      expect(chatsRepository.findAdminRooms).toHaveBeenCalledWith(
        SCHOOL_ID,
        expect.objectContaining({ search: 'Alex', limit: 10 })
      );
      expect(result.data).toHaveLength(1);
    });

    it('non-admin is rejected from admin threads', async () => {
      await expect(chatsService.adminListThreads(SCHOOL_ID, {}, TEACHER_ACTOR)).rejects.toThrow(ForbiddenError);
      await expect(chatsService.adminListThreads(SCHOOL_ID, {}, PARENT_ACTOR)).rejects.toThrow(ForbiddenError);
    });
  });

  // ============================================================
  // 9. BROADCAST CHANNELS & POSTS
  // ============================================================
  describe('Broadcast Channels & Posts', () => {
    const MOCK_CHANNEL = {
      id: CHANNEL_ID,
      schoolId: SCHOOL_ID,
      name: 'Class 10-A Announcements',
      classId: CLASS_ID,
      createdBy: TEACHER_USER_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
      class: { id: CLASS_ID, name: 'Grade 10-A' }
    };

    it('teacher creates broadcast channel for their assigned class', async () => {
      chatsRepository.findStaffProfileByUserId.mockResolvedValue(MOCK_TEACHER_PROFILE);
      chatsRepository.createBroadcastChannel.mockResolvedValue(MOCK_CHANNEL);

      const { prisma } = await import('../../../src/database/prisma.client.js');
      prisma.class.findFirst.mockResolvedValue({ id: CLASS_ID, schoolId: SCHOOL_ID, name: 'Grade 10-A' });

      const result = await chatsService.createChannel(
        SCHOOL_ID,
        { name: 'Class 10-A Announcements', classId: CLASS_ID },
        TEACHER_ACTOR
      );

      expect(result.id).toBe(CHANNEL_ID);
      expect(result.name).toBe('Class 10-A Announcements');
    });

    it('parent is forbidden from creating broadcast channels', async () => {
      await expect(
        chatsService.createChannel(SCHOOL_ID, { name: 'Parent Channel' }, PARENT_ACTOR)
      ).rejects.toThrow(ForbiddenError);
    });

    it('teacher creates channel post for their assigned class channel', async () => {
      chatsRepository.findBroadcastChannelById.mockResolvedValue(MOCK_CHANNEL);
      chatsRepository.findStaffProfileByUserId.mockResolvedValue(MOCK_TEACHER_PROFILE);

      const mockPost = {
        id: 'post-1',
        schoolId: SCHOOL_ID,
        channelId: CHANNEL_ID,
        senderId: TEACHER_USER_ID,
        senderName: 'Jane Teacher',
        text: 'School trip on Friday',
        mediaUrl: null,
        mediaType: null,
        createdAt: new Date()
      };
      chatsRepository.createChannelPost.mockResolvedValue(mockPost);

      const result = await chatsService.createChannelPost(
        SCHOOL_ID,
        CHANNEL_ID,
        { text: 'School trip on Friday' },
        TEACHER_ACTOR
      );

      expect(result.id).toBe('post-1');
      expect(result.text).toBe('School trip on Friday');
    });

    it('parent is forbidden from posting to broadcast channels', async () => {
      chatsRepository.findBroadcastChannelById.mockResolvedValue(MOCK_CHANNEL);

      await expect(
        chatsService.createChannelPost(SCHOOL_ID, CHANNEL_ID, { text: 'Hello' }, PARENT_ACTOR)
      ).rejects.toThrow(ForbiddenError);
    });
  });
});
