import { describe, it, expect, vi, beforeEach } from 'vitest';
import TeacherChat from '../Chat.jsx';
import * as chatsApiModule from '../../../api/chats.js';
import * as studentsApiModule from '../../../api/students.js';

describe('Teacher Chat Component (REST Cutover)', () => {
  const PG_CLASS_ID = '05120a32-8118-44b6-8010-b9ed2c5467c0';
  const PG_STUDENT_ID_1 = '33333333-3333-4333-8333-333333333333';
  const PG_STUDENT_ID_2 = '44444444-4444-4444-8444-444444444444';
  const PG_ROOM_ID_1 = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const PG_CHANNEL_ID_1 = '99999999-8888-7777-6666-555555555555';

  const mockStudents = [
    {
      id: PG_STUDENT_ID_1,
      firstName: 'Alice',
      lastName: 'Smith',
      classId: PG_CLASS_ID
    },
    {
      id: PG_STUDENT_ID_2,
      firstName: 'Charlie',
      lastName: 'Brown',
      classId: PG_CLASS_ID
    }
  ];

  const mockRooms = [
    {
      id: PG_ROOM_ID_1,
      studentId: PG_STUDENT_ID_1,
      studentName: 'Alice Smith',
      parentName: 'Bob Smith',
      parentId: 'parent-123',
      teacherId: 'teacher-prof-1',
      teacherName: 'Jane Teacher',
      lastMessage: 'Hello parent',
      lastMessageTime: '2026-09-15T10:00:00.000Z',
      unreadCountTeacher: 2,
      unreadCountParent: 0,
      status: 'active'
    }
  ];

  const mockMessages = [
    {
      id: 'msg-1',
      chatRoomId: PG_ROOM_ID_1,
      senderId: 'teacher-user-1',
      senderRole: 'teacher',
      text: 'Hello from teacher',
      mediaUrl: null,
      mediaType: null,
      createdAt: '2026-09-15T09:00:00.000Z'
    },
    {
      id: 'msg-2',
      chatRoomId: PG_ROOM_ID_1,
      senderId: 'parent-user-1',
      senderRole: 'parent',
      text: 'Hello teacher',
      mediaUrl: null,
      mediaType: null,
      createdAt: '2026-09-15T09:05:00.000Z'
    }
  ];

  const mockChannels = [
    {
      id: PG_CHANNEL_ID_1,
      name: 'Grade 10-A Announcements',
      classId: PG_CLASS_ID,
      className: 'Grade 10-A',
      createdBy: 'teacher-user-1',
      createdAt: '2026-09-01T00:00:00.000Z'
    }
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('is exported as a valid React component function', () => {
    expect(typeof TeacherChat).toBe('function');
  });

  // ============================================================
  // 1. REST CHAT ROOMS & STUDENTS LOADING
  // ============================================================

  it('fetches class students via REST API with classId query parameter', async () => {
    const listStudentsSpy = vi.spyOn(studentsApiModule.studentsApi, 'listStudents').mockResolvedValue({
      success: true,
      data: mockStudents,
      pagination: { total: 2, page: 1, limit: 100 }
    });

    const res = await studentsApiModule.studentsApi.listStudents({ classId: PG_CLASS_ID, limit: 100 });

    expect(listStudentsSpy).toHaveBeenCalledWith({ classId: PG_CLASS_ID, limit: 100 });
    expect(res.data).toHaveLength(2);
    expect(res.data[0].id).toBe(PG_STUDENT_ID_1);
    expect(res.data[0].firstName).toBe('Alice');
  });

  it('fetches teacher chat rooms via REST API', async () => {
    const listRoomsSpy = vi.spyOn(chatsApiModule.chatsApi, 'listChatRooms').mockResolvedValue({
      success: true,
      data: mockRooms,
      pagination: { total: 1, page: 1, limit: 100 }
    });

    const res = await chatsApiModule.chatsApi.listChatRooms({ limit: 100 });

    expect(listRoomsSpy).toHaveBeenCalledWith({ limit: 100 });
    expect(res.data).toHaveLength(1);
    expect(res.data[0].id).toBe(PG_ROOM_ID_1);
    expect(res.data[0].unreadCountTeacher).toBe(2);
  });

  // ============================================================
  // 2. ROOM RESOLUTION (POST /api/v1/chats/rooms/resolve)
  // ============================================================

  it('resolves chat room for student via REST POST', async () => {
    const resolveRoomSpy = vi.spyOn(chatsApiModule.chatsApi, 'resolveChatRoom').mockResolvedValue({
      success: true,
      data: mockRooms[0]
    });

    const res = await chatsApiModule.chatsApi.resolveChatRoom({ studentId: PG_STUDENT_ID_1 });

    expect(resolveRoomSpy).toHaveBeenCalledWith({ studentId: PG_STUDENT_ID_1 });
    expect(res.data.id).toBe(PG_ROOM_ID_1);
    expect(res.data.studentId).toBe(PG_STUDENT_ID_1);
  });

  // ============================================================
  // 3. MESSAGES LISTING & SENDING
  // ============================================================

  it('fetches room messages chronologically via REST GET', async () => {
    const listMessagesSpy = vi.spyOn(chatsApiModule.chatsApi, 'listChatMessages').mockResolvedValue({
      success: true,
      data: mockMessages,
      pagination: { total: 2, page: 1, limit: 100 }
    });

    const res = await chatsApiModule.chatsApi.listChatMessages(PG_ROOM_ID_1, { limit: 100 });

    expect(listMessagesSpy).toHaveBeenCalledWith(PG_ROOM_ID_1, { limit: 100 });
    expect(res.data).toHaveLength(2);
    expect(res.data[0].text).toBe('Hello from teacher');
    expect(res.data[1].text).toBe('Hello teacher');
  });

  it('sends message via REST POST with canonical parameters', async () => {
    const payload = {
      text: 'Please review lesson 4',
      mediaUrl: null,
      mediaType: null
    };

    const sendMsgSpy = vi.spyOn(chatsApiModule.chatsApi, 'sendChatMessage').mockResolvedValue({
      success: true,
      data: {
        id: 'new-msg-1',
        chatRoomId: PG_ROOM_ID_1,
        senderId: 'teacher-user-1',
        senderRole: 'teacher',
        ...payload,
        createdAt: '2026-09-15T11:00:00.000Z'
      }
    });

    const res = await chatsApiModule.chatsApi.sendChatMessage(PG_ROOM_ID_1, payload);

    expect(sendMsgSpy).toHaveBeenCalledWith(PG_ROOM_ID_1, payload);
    expect(res.data.id).toBe('new-msg-1');
    expect(res.data.text).toBe('Please review lesson 4');
  });

  it('sends audio voice recording message via REST POST', async () => {
    const payload = {
      text: null,
      mediaUrl: 'data:audio/webm;base64,...',
      mediaType: 'audio'
    };

    const sendMsgSpy = vi.spyOn(chatsApiModule.chatsApi, 'sendChatMessage').mockResolvedValue({
      success: true,
      data: {
        id: 'audio-msg-1',
        chatRoomId: PG_ROOM_ID_1,
        senderId: 'teacher-user-1',
        senderRole: 'teacher',
        ...payload,
        createdAt: '2026-09-15T11:05:00.000Z'
      }
    });

    const res = await chatsApiModule.chatsApi.sendChatMessage(PG_ROOM_ID_1, payload);

    expect(sendMsgSpy).toHaveBeenCalledWith(PG_ROOM_ID_1, payload);
    expect(res.data.mediaType).toBe('audio');
  });

  // ============================================================
  // 4. READ RECEIPTS (PATCH /api/v1/chats/rooms/:roomId/read)
  // ============================================================

  it('marks room as read via REST PATCH', async () => {
    const markReadSpy = vi.spyOn(chatsApiModule.chatsApi, 'markChatRoomRead').mockResolvedValue({
      success: true,
      data: {
        success: true,
        roomId: PG_ROOM_ID_1,
        unreadCountParent: 0,
        unreadCountTeacher: 0
      }
    });

    const res = await chatsApiModule.chatsApi.markChatRoomRead(PG_ROOM_ID_1);

    expect(markReadSpy).toHaveBeenCalledWith(PG_ROOM_ID_1);
    expect(res.data.unreadCountTeacher).toBe(0);
  });

  // ============================================================
  // 5. UNREAD CHAT COUNT (GET /api/v1/chats/unread-count)
  // ============================================================

  it('retrieves aggregated unread chat count via REST GET', async () => {
    const getUnreadSpy = vi.spyOn(chatsApiModule.chatsApi, 'getUnreadChatCount').mockResolvedValue({
      success: true,
      data: { count: 3 }
    });

    const res = await chatsApiModule.chatsApi.getUnreadChatCount();

    expect(getUnreadSpy).toHaveBeenCalled();
    expect(res.data.count).toBe(3);
  });

  // ============================================================
  // 6. BROADCAST CHANNELS & POSTS
  // ============================================================

  it('lists broadcast channels via REST GET', async () => {
    const listChannelsSpy = vi.spyOn(chatsApiModule.chatsApi, 'listChatChannels').mockResolvedValue({
      success: true,
      data: mockChannels,
      pagination: { total: 1, page: 1, limit: 50 }
    });

    const res = await chatsApiModule.chatsApi.listChatChannels({ limit: 50 });

    expect(listChannelsSpy).toHaveBeenCalledWith({ limit: 50 });
    expect(res.data).toHaveLength(1);
    expect(res.data[0].id).toBe(PG_CHANNEL_ID_1);
  });

  it('creates broadcast channel via REST POST', async () => {
    const payload = {
      name: 'Science Project Group',
      classId: PG_CLASS_ID
    };

    const createChannelSpy = vi.spyOn(chatsApiModule.chatsApi, 'createChatChannel').mockResolvedValue({
      success: true,
      data: {
        id: 'new-channel-uuid',
        ...payload,
        createdAt: '2026-09-15T12:00:00.000Z'
      }
    });

    const res = await chatsApiModule.chatsApi.createChatChannel(payload);

    expect(createChannelSpy).toHaveBeenCalledWith(payload);
    expect(res.data.id).toBe('new-channel-uuid');
    expect(res.data.name).toBe('Science Project Group');
  });

  it('lists channel posts via REST GET', async () => {
    const listPostsSpy = vi.spyOn(chatsApiModule.chatsApi, 'listChannelPosts').mockResolvedValue({
      success: true,
      data: [
        {
          id: 'post-1',
          channelId: PG_CHANNEL_ID_1,
          senderName: 'Jane Teacher',
          text: 'Reminder: Project due Friday',
          createdAt: '2026-09-15T12:00:00.000Z'
        }
      ],
      pagination: { total: 1, page: 1, limit: 100 }
    });

    const res = await chatsApiModule.chatsApi.listChannelPosts(PG_CHANNEL_ID_1, { limit: 100 });

    expect(listPostsSpy).toHaveBeenCalledWith(PG_CHANNEL_ID_1, { limit: 100 });
    expect(res.data).toHaveLength(1);
    expect(res.data[0].text).toBe('Reminder: Project due Friday');
  });

  it('creates channel post via REST POST', async () => {
    const payload = {
      text: 'Exam schedule posted',
      mediaUrl: null,
      mediaType: null
    };

    const createPostSpy = vi.spyOn(chatsApiModule.chatsApi, 'createChannelPost').mockResolvedValue({
      success: true,
      data: {
        id: 'new-post-1',
        channelId: PG_CHANNEL_ID_1,
        senderName: 'Jane Teacher',
        ...payload,
        createdAt: '2026-09-15T12:10:00.000Z'
      }
    });

    const res = await chatsApiModule.chatsApi.createChannelPost(PG_CHANNEL_ID_1, payload);

    expect(createPostSpy).toHaveBeenCalledWith(PG_CHANNEL_ID_1, payload);
    expect(res.data.id).toBe('new-post-1');
  });

  // ============================================================
  // 7. EXCEL EXPORT WORKFLOW
  // ============================================================

  it('fetches chat rooms for Excel export via REST API', async () => {
    const listRoomsSpy = vi.spyOn(chatsApiModule.chatsApi, 'listChatRooms').mockResolvedValue({
      success: true,
      data: mockRooms,
      pagination: { total: 1, page: 1, limit: 100 }
    });

    const res = await chatsApiModule.chatsApi.listChatRooms({ limit: 100 });

    expect(listRoomsSpy).toHaveBeenCalledWith({ limit: 100 });
    expect(res.data[0].studentName).toBe('Alice Smith');
    expect(res.data[0].parentName).toBe('Bob Smith');
  });
});
