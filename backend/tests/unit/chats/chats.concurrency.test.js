import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as chatsService from '../../../src/modules/chats/chats.service.js';
import * as chatsRepository from '../../../src/modules/chats/chats.repository.js';
import { SYSTEM_ROLES } from '../../../src/config/constants.js';

vi.mock('../../../src/modules/chats/chats.repository.js');
vi.mock('../../../src/database/prisma.client.js', () => ({
  prisma: {
    $transaction: vi.fn((cb) => cb({
      staffProfile: { findFirst: vi.fn() },
      student: { findMany: vi.fn(), findFirst: vi.fn() },
      class: { findFirst: vi.fn() }
    }))
  }
}));
vi.mock('../../../src/modules/audit/audit.repository.js', () => ({
  createAuditLog: vi.fn().mockResolvedValue({ id: 'audit-1' })
}));

describe('Unit: Chats Concurrency & Race Condition Tests', () => {
  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
  const CLASS_ID = '22222222-2222-4222-8222-222222222222';
  const STUDENT_ID = '33333333-3333-4333-8333-333333333333';
  const TEACHER_USER_ID = '44444444-4444-4444-8444-444444444444';
  const TEACHER_PROFILE_ID = '55555555-5555-4555-8555-555555555555';
  const PARENT_USER_ID = '66666666-6666-4666-8666-666666666666';
  const ROOM_ID = '88888888-8888-4888-8888-888888888888';

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

  const MOCK_TEACHER_PROFILE = {
    id: TEACHER_PROFILE_ID,
    schoolId: SCHOOL_ID,
    userId: TEACHER_USER_ID,
    name: 'Jane Teacher',
    status: 'Active',
    assignedClassId: CLASS_ID,
    user: { isActive: true },
    headedClasses: []
  };

  const MOCK_STUDENT = {
    id: STUDENT_ID,
    schoolId: SCHOOL_ID,
    classId: CLASS_ID,
    firstName: 'Alex',
    lastName: 'Smith',
    parents: []
  };

  const MOCK_ROOM = {
    id: ROOM_ID,
    schoolId: SCHOOL_ID,
    studentId: STUDENT_ID,
    teacherId: TEACHER_PROFILE_ID,
    status: 'active',
    lastMessage: 'Initial message',
    lastMessageTime: new Date('2026-09-15T10:00:00Z'),
    unreadCountParent: 0,
    unreadCountTeacher: 0,
    createdAt: new Date('2026-09-10T10:00:00Z'),
    updatedAt: new Date('2026-09-15T10:00:00Z'),
    student: MOCK_STUDENT,
    teacher: MOCK_TEACHER_PROFILE
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('simulates concurrent room resolutions for the same student + teacher: returns the exact same canonical room ID', async () => {
    chatsRepository.findStudentById.mockResolvedValue(MOCK_STUDENT);
    chatsRepository.findStaffProfileByUserId.mockResolvedValue(MOCK_TEACHER_PROFILE);
    chatsRepository.findAuthorizedStudentIdsForParent.mockResolvedValue([STUDENT_ID]);
    chatsRepository.findStaffProfileById.mockResolvedValue(MOCK_TEACHER_PROFILE);
    chatsRepository.upsertChatRoom.mockResolvedValue(MOCK_ROOM);

    const resTeacher = chatsService.resolveRoom(SCHOOL_ID, { studentId: STUDENT_ID }, TEACHER_ACTOR);
    const resParent = chatsService.resolveRoom(SCHOOL_ID, { studentId: STUDENT_ID, teacherId: TEACHER_PROFILE_ID }, PARENT_ACTOR);

    const [room1, room2] = await Promise.all([resTeacher, resParent]);

    expect(room1.id).toBe(ROOM_ID);
    expect(room2.id).toBe(ROOM_ID);
    expect(chatsRepository.upsertChatRoom).toHaveBeenCalledTimes(2);
  });

  it('simulates concurrent message sends in a single room: ensures all messages create records and increment recipient unread counter', async () => {
    chatsRepository.findChatRoomById.mockResolvedValue(MOCK_ROOM);
    chatsRepository.findStaffProfileByUserId.mockResolvedValue(MOCK_TEACHER_PROFILE);

    let parentUnreadCounter = 0;

    chatsRepository.createChatMessage.mockImplementation((data) => {
      return Promise.resolve({
        id: `msg-${Math.random()}`,
        ...data,
        createdAt: new Date()
      });
    });

    chatsRepository.updateRoomAfterMessage.mockImplementation((sId, rId, data) => {
      if (data.recipientRole === 'parent') {
        parentUnreadCounter += 1;
      }
      return Promise.resolve({
        ...MOCK_ROOM,
        lastMessage: data.lastMessage,
        lastMessageTime: data.lastMessageTime,
        unreadCountParent: parentUnreadCounter
      });
    });

    const send1 = chatsService.sendMessage(SCHOOL_ID, ROOM_ID, { text: 'Message 1' }, TEACHER_ACTOR);
    const send2 = chatsService.sendMessage(SCHOOL_ID, ROOM_ID, { text: 'Message 2' }, TEACHER_ACTOR);
    const send3 = chatsService.sendMessage(SCHOOL_ID, ROOM_ID, { text: 'Message 3' }, TEACHER_ACTOR);

    const [m1, m2, m3] = await Promise.all([send1, send2, send3]);

    expect(m1.text).toBe('Message 1');
    expect(m2.text).toBe('Message 2');
    expect(m3.text).toBe('Message 3');
    expect(chatsRepository.createChatMessage).toHaveBeenCalledTimes(3);
    expect(chatsRepository.updateRoomAfterMessage).toHaveBeenCalledTimes(3);
    expect(parentUnreadCounter).toBe(3);
  });
});
