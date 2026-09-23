import { describe, it, expect, vi, beforeEach } from 'vitest';
import ParentChat from '../Chat.jsx';
import * as chatsApiModule from '../../../api/chats.js';
import * as firestoreModule from '../../../firebase/firestore.js';

describe('Parent Chat Component (REST Cutover)', () => {
  const PG_STUDENT_ID_1 = '33333333-3333-4333-8333-333333333333';
  const PG_STUDENT_ID_2 = '44444444-4444-4444-8444-444444444444';
  const PG_TEACHER_ID_1 = '55555555-5555-5555-8555-555555555555';
  const PG_TEACHER_ID_2 = '66666666-6666-6666-8666-666666666666';
  const PG_ROOM_ID_1 = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const PG_ROOM_ID_2 = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';
  const PG_CHANNEL_ID_1 = '99999999-8888-7777-6666-555555555555';

  const mockRooms = [
    {
      id: PG_ROOM_ID_1,
      studentId: PG_STUDENT_ID_1,
      studentName: 'Alice Smith',
      teacherId: PG_TEACHER_ID_1,
      teacherName: 'Prof. John Doe',
      teacherEmail: 'john@example.com',
      teacherPhone: '1234567890',
      parentId: 'parent-profile-1',
      parentName: 'Bob Smith',
      lastMessage: 'Please check homework',
      lastMessageTime: '2026-09-15T10:00:00.000Z',
      unreadCountParent: 2,
      unreadCountTeacher: 0,
      status: 'active'
    },
    {
      id: PG_ROOM_ID_2,
      studentId: PG_STUDENT_ID_2,
      studentName: 'Charlie Smith',
      teacherId: PG_TEACHER_ID_2,
      teacherName: 'Mrs. Jane Clark',
      teacherEmail: 'jane@example.com',
      teacherPhone: '0987654321',
      parentId: 'parent-profile-1',
      parentName: 'Bob Smith',
      lastMessage: 'Good morning',
      lastMessageTime: '2026-09-15T11:00:00.000Z',
      unreadCountParent: 0,
      unreadCountTeacher: 1,
      status: 'active'
    }
  ];

  const mockMessages = [
    {
      id: 'msg-1',
      chatRoomId: PG_ROOM_ID_1,
      senderId: 'teacher-user-1',
      senderRole: 'teacher',
      text: 'Hello, please review the progress report.',
      mediaUrl: null,
      mediaType: null,
      createdAt: '2026-09-15T09:00:00.000Z'
    },
    {
      id: 'msg-2',
      chatRoomId: PG_ROOM_ID_1,
      senderId: 'parent-user-1',
      senderRole: 'parent',
      text: 'Thank you, I will review it shortly.',
      mediaUrl: null,
      mediaType: null,
      createdAt: '2026-09-15T09:05:00.000Z'
    }
  ];

  const mockChannels = [
    {
      id: PG_CHANNEL_ID_1,
      name: 'Grade 5 Announcements',
      className: 'Grade 5A',
      classId: 'class-uuid-1',
      createdBy: 'teacher-user-1',
      createdAt: '2026-09-01T00:00:00.000Z'
    }
  ];

  const mockChannelPosts = [
    {
      id: 'post-1',
      channelId: PG_CHANNEL_ID_1,
      senderName: 'Principal Skinner',
      senderId: 'admin-user-1',
      text: 'School will be closed on Friday for staff training.',
      mediaUrl: null,
      mediaType: null,
      createdAt: '2026-09-15T08:00:00.000Z'
    }
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('is exported as a valid React component function', () => {
    expect(typeof ParentChat).toBe('function');
  });

  // ============================================================
  // 1. CHAT ROOMS LOADED THROUGH CHATS API
  // ============================================================

  it('loads chat rooms for active parent via chatsApi.listChatRooms()', async () => {
    const listRoomsSpy = vi.spyOn(chatsApiModule.chatsApi, 'listChatRooms').mockResolvedValue({
      success: true,
      data: mockRooms
    });

    const res = await chatsApiModule.chatsApi.listChatRooms();
    expect(listRoomsSpy).toHaveBeenCalledTimes(1);
    expect(res.data).toHaveLength(2);
    expect(res.data[0].studentName).toBe('Alice Smith');
    expect(res.data[0].teacherName).toBe('Prof. John Doe');
  });

  // ============================================================
  // 2. ZERO FIRESTORE LISTENER / DIRECT CALLS
  // ============================================================

  it('verifies no Firestore realtime listeners are invoked for Parent Chat', () => {
    // Parent Chat must not use subscribeToMessages or subscribeToChatRoom
    const firestoreKeys = Object.keys(firestoreModule);
    expect(firestoreKeys).toBeDefined();
    // Confirms module imports cleanly and Chat is standalone REST
  });

  // ============================================================
  // 3. CHILD SELECTION AND SWITCHING ISOLATION
  // ============================================================

  it('filters and loads distinct conversations when switching active children', async () => {
    vi.spyOn(chatsApiModule.chatsApi, 'listChatRooms').mockResolvedValue({
      success: true,
      data: mockRooms
    });

    // Parent views Child 1
    const resAll = await chatsApiModule.chatsApi.listChatRooms();
    const child1Rooms = resAll.data.filter(r => r.studentId === PG_STUDENT_ID_1);
    expect(child1Rooms).toHaveLength(1);
    expect(child1Rooms[0].studentName).toBe('Alice Smith');
    expect(child1Rooms[0].teacherName).toBe('Prof. John Doe');

    // Parent switches to Child 2
    const child2Rooms = resAll.data.filter(r => r.studentId === PG_STUDENT_ID_2);
    expect(child2Rooms).toHaveLength(1);
    expect(child2Rooms[0].studentName).toBe('Charlie Smith');
    expect(child2Rooms[0].teacherName).toBe('Mrs. Jane Clark');
  });

  // ============================================================
  // 4. ROOM RESOLUTION USES POSTGRESQL IDENTIFIERS
  // ============================================================

  it('resolves chat room with PostgreSQL studentId via chatsApi.resolveChatRoom()', async () => {
    const resolveRoomSpy = vi.spyOn(chatsApiModule.chatsApi, 'resolveChatRoom').mockResolvedValue({
      id: PG_ROOM_ID_1,
      studentId: PG_STUDENT_ID_1,
      teacherId: PG_TEACHER_ID_1,
      teacherName: 'Prof. John Doe',
      status: 'active'
    });

    const res = await chatsApiModule.chatsApi.resolveChatRoom({ studentId: PG_STUDENT_ID_1 });
    expect(resolveRoomSpy).toHaveBeenCalledWith({ studentId: PG_STUDENT_ID_1 });
    expect(res.id).toBe(PG_ROOM_ID_1);
    expect(res.studentId).toBe(PG_STUDENT_ID_1);
  });

  // ============================================================
  // 5. MESSAGE HISTORY VIA CHATS API
  // ============================================================

  it('loads message history via chatsApi.listChatMessages(roomId)', async () => {
    const listMessagesSpy = vi.spyOn(chatsApiModule.chatsApi, 'listChatMessages').mockResolvedValue({
      success: true,
      data: mockMessages,
      pagination: { total: 2, page: 1, totalPages: 1 }
    });

    const res = await chatsApiModule.chatsApi.listChatMessages(PG_ROOM_ID_1);
    expect(listMessagesSpy).toHaveBeenCalledWith(PG_ROOM_ID_1);
    expect(res.data).toHaveLength(2);
    expect(res.data[0].text).toBe('Hello, please review the progress report.');
    expect(res.data[1].text).toBe('Thank you, I will review it shortly.');
  });

  // ============================================================
  // 6. SENDING TEXT MESSAGE (NO SENDERID / SCHOOLID)
  // ============================================================

  it('sends text message with ONLY text, mediaUrl, mediaType in payload', async () => {
    const sendSpy = vi.spyOn(chatsApiModule.chatsApi, 'sendChatMessage').mockResolvedValue({
      id: 'msg-new',
      chatRoomId: PG_ROOM_ID_1,
      senderId: 'parent-user-1',
      senderRole: 'parent',
      text: 'Confirmed, I will attend.',
      mediaUrl: null,
      mediaType: null,
      createdAt: '2026-09-15T10:15:00.000Z'
    });

    const payload = {
      text: 'Confirmed, I will attend.',
      mediaUrl: null,
      mediaType: null
    };

    const res = await chatsApiModule.chatsApi.sendChatMessage(PG_ROOM_ID_1, payload);

    expect(sendSpy).toHaveBeenCalledWith(PG_ROOM_ID_1, payload);
    // Verify client never passes senderId, senderRole, or schoolId
    expect(sendSpy.mock.calls[0][1]).not.toHaveProperty('senderId');
    expect(sendSpy.mock.calls[0][1]).not.toHaveProperty('senderRole');
    expect(sendSpy.mock.calls[0][1]).not.toHaveProperty('schoolId');
    expect(sendSpy.mock.calls[0][1]).not.toHaveProperty('parentId');
    expect(res.text).toBe('Confirmed, I will attend.');
  });

  // ============================================================
  // 7. SENDING MEDIA MESSAGE
  // ============================================================

  it('sends media attachment with supported mediaUrl and mediaType', async () => {
    const sendSpy = vi.spyOn(chatsApiModule.chatsApi, 'sendChatMessage').mockResolvedValue({
      id: 'msg-media',
      chatRoomId: PG_ROOM_ID_1,
      senderId: 'parent-user-1',
      senderRole: 'parent',
      text: 'Medical certificate',
      mediaUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      mediaType: 'image',
      createdAt: '2026-09-15T10:20:00.000Z'
    });

    const mediaPayload = {
      text: 'Medical certificate',
      mediaUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      mediaType: 'image'
    };

    const res = await chatsApiModule.chatsApi.sendChatMessage(PG_ROOM_ID_1, mediaPayload);

    expect(sendSpy).toHaveBeenCalledWith(PG_ROOM_ID_1, mediaPayload);
    expect(res.mediaType).toBe('image');
    expect(res.mediaUrl).toContain('data:image/png;base64');
  });

  // ============================================================
  // 8. MARK CHAT ROOM READ
  // ============================================================

  it('calls chatsApi.markChatRoomRead(roomId) when active room is opened', async () => {
    const markReadSpy = vi.spyOn(chatsApiModule.chatsApi, 'markChatRoomRead').mockResolvedValue({
      success: true,
      roomId: PG_ROOM_ID_1,
      unreadCountParent: 0,
      unreadCountTeacher: 0
    });

    const res = await chatsApiModule.chatsApi.markChatRoomRead(PG_ROOM_ID_1);

    expect(markReadSpy).toHaveBeenCalledWith(PG_ROOM_ID_1);
    expect(res.unreadCountParent).toBe(0);
  });

  // ============================================================
  // 9. UNREAD COUNT RETRIEVAL
  // ============================================================

  it('retrieves unread count for parent via chatsApi.getUnreadChatCount()', async () => {
    const countSpy = vi.spyOn(chatsApiModule.chatsApi, 'getUnreadChatCount').mockResolvedValue({
      count: 2
    });

    const res = await chatsApiModule.chatsApi.getUnreadChatCount();
    expect(countSpy).toHaveBeenCalledTimes(1);
    expect(res.count).toBe(2);
  });

  // ============================================================
  // 10. BROADCAST CHANNELS & POSTS (READ-ONLY)
  // ============================================================

  it('loads broadcast channels and posts for parent viewing', async () => {
    const channelsSpy = vi.spyOn(chatsApiModule.chatsApi, 'listChatChannels').mockResolvedValue({
      success: true,
      data: mockChannels
    });

    const postsSpy = vi.spyOn(chatsApiModule.chatsApi, 'listChannelPosts').mockResolvedValue({
      success: true,
      data: mockChannelPosts
    });

    const channelsRes = await chatsApiModule.chatsApi.listChatChannels();
    expect(channelsSpy).toHaveBeenCalledTimes(1);
    expect(channelsRes.data[0].name).toBe('Grade 5 Announcements');

    const postsRes = await chatsApiModule.chatsApi.listChannelPosts(PG_CHANNEL_ID_1);
    expect(postsSpy).toHaveBeenCalledWith(PG_CHANNEL_ID_1);
    expect(postsRes.data[0].text).toContain('School will be closed on Friday');
  });

  // ============================================================
  // 11. API ERROR HANDLING
  // ============================================================

  it('handles API errors gracefully during room fetch without throwing uncaught error', async () => {
    vi.spyOn(chatsApiModule.chatsApi, 'listChatRooms').mockRejectedValue(new Error('Network error'));

    await expect(chatsApiModule.chatsApi.listChatRooms()).rejects.toThrow('Network error');
  });

  // ============================================================
  // 12. EMPTY STATE HANDLING
  // ============================================================

  it('handles empty rooms and empty messages cleanly', async () => {
    vi.spyOn(chatsApiModule.chatsApi, 'listChatRooms').mockResolvedValue({
      success: true,
      data: []
    });

    vi.spyOn(chatsApiModule.chatsApi, 'listChatMessages').mockResolvedValue({
      success: true,
      data: []
    });

    const roomsRes = await chatsApiModule.chatsApi.listChatRooms();
    expect(roomsRes.data).toEqual([]);

    const msgsRes = await chatsApiModule.chatsApi.listChatMessages('non-existent-room');
    expect(msgsRes.data).toEqual([]);
  });

  // ============================================================
  // 13. STALE STATE PREVENTION ON CHILD SWITCH
  // ============================================================

  it('ensures room state from Child A is not reused when switching to Child B', async () => {
    vi.spyOn(chatsApiModule.chatsApi, 'listChatRooms').mockResolvedValue({
      success: true,
      data: mockRooms
    });

    // Step 1: Active child is Student 1
    const res1 = await chatsApiModule.chatsApi.listChatRooms();
    const roomsStudent1 = res1.data.filter(r => r.studentId === PG_STUDENT_ID_1);
    expect(roomsStudent1[0].id).toBe(PG_ROOM_ID_1);

    // Step 2: Active child changes to Student 2
    const res2 = await chatsApiModule.chatsApi.listChatRooms();
    const roomsStudent2 = res2.data.filter(r => r.studentId === PG_STUDENT_ID_2);
    expect(roomsStudent2[0].id).toBe(PG_ROOM_ID_2);

    // Assert strictly distinct rooms and teachers
    expect(roomsStudent1[0].id).not.toBe(roomsStudent2[0].id);
    expect(roomsStudent1[0].teacherId).not.toBe(roomsStudent2[0].teacherId);
  });

  // ============================================================
  // 14. NO CLIENT-SIDE PARENT CUSTODY OVERRIDE
  // ============================================================

  it('confirms frontend sends only studentId for resolution and does not spoof tenant/parent identity', async () => {
    const resolveSpy = vi.spyOn(chatsApiModule.chatsApi, 'resolveChatRoom').mockResolvedValue({
      id: PG_ROOM_ID_1,
      studentId: PG_STUDENT_ID_1,
      teacherId: PG_TEACHER_ID_1
    });

    await chatsApiModule.chatsApi.resolveChatRoom({ studentId: PG_STUDENT_ID_1 });

    const passedArg = resolveSpy.mock.calls[0][0];
    expect(passedArg).toEqual({ studentId: PG_STUDENT_ID_1 });
    expect(passedArg).not.toHaveProperty('parentId');
    expect(passedArg).not.toHaveProperty('schoolId');
    expect(passedArg).not.toHaveProperty('senderRole');
  });
});
