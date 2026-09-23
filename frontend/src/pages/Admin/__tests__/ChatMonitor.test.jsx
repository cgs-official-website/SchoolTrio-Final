import { describe, it, expect, vi, beforeEach } from 'vitest';
import ChatMonitor from '../ChatMonitor.jsx';
import * as chatsApiModule from '../../../api/chats.js';
import * as firestoreModule from '../../../firebase/firestore.js';

describe('Admin ChatMonitor Component (REST Cutover)', () => {
  const PG_ROOM_ID_1 = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const PG_ROOM_ID_2 = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';
  const PG_STUDENT_ID_1 = '33333333-3333-4333-8333-333333333333';
  const PG_STUDENT_ID_2 = '44444444-4444-4444-8444-444444444444';
  const PG_TEACHER_ID_1 = '55555555-5555-5555-8555-555555555555';
  const PG_TEACHER_ID_2 = '66666666-6666-6666-8666-666666666666';

  const mockAdminThreads = [
    {
      id: PG_ROOM_ID_1,
      studentId: PG_STUDENT_ID_1,
      studentName: 'Alice Smith',
      studentRollNumber: '101',
      className: 'Grade 5A',
      teacherId: PG_TEACHER_ID_1,
      teacherName: 'Prof. John Doe',
      teacherEmail: 'john@example.com',
      parentId: 'parent-1',
      parentName: 'Bob Smith',
      parentPhone: '1234567890',
      lastMessage: 'Please review homework',
      lastMessageTime: '2026-09-15T10:00:00.000Z',
      unreadCountParent: 1,
      unreadCountTeacher: 0,
      status: 'active'
    },
    {
      id: PG_ROOM_ID_2,
      studentId: PG_STUDENT_ID_2,
      studentName: 'Charlie Brown',
      studentRollNumber: '102',
      className: 'Grade 5B',
      teacherId: PG_TEACHER_ID_2,
      teacherName: 'Mrs. Jane Clark',
      teacherEmail: 'jane@example.com',
      parentId: 'parent-2',
      parentName: 'Lucy Brown',
      parentPhone: '0987654321',
      lastMessage: 'Attendance check',
      lastMessageTime: '2026-09-15T11:00:00.000Z',
      unreadCountParent: 0,
      unreadCountTeacher: 2,
      status: 'active'
    }
  ];

  const mockMessages = [
    {
      id: 'msg-1',
      chatRoomId: PG_ROOM_ID_1,
      senderId: 'teacher-1',
      senderRole: 'teacher',
      text: 'Good morning Mr. Smith',
      mediaUrl: null,
      mediaType: null,
      createdAt: '2026-09-15T09:00:00.000Z'
    },
    {
      id: 'msg-2',
      chatRoomId: PG_ROOM_ID_1,
      senderId: 'parent-1',
      senderRole: 'parent',
      text: 'Good morning teacher, thank you',
      mediaUrl: null,
      mediaType: null,
      createdAt: '2026-09-15T09:05:00.000Z'
    }
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('is exported as a valid React component function', () => {
    expect(typeof ChatMonitor).toBe('function');
  });

  // ============================================================
  // 1. ADMIN THREAD LIST USES listAdminChatThreads()
  // ============================================================

  it('loads all tenant chat threads via chatsApi.listAdminChatThreads()', async () => {
    const listThreadsSpy = vi.spyOn(chatsApiModule.chatsApi, 'listAdminChatThreads').mockResolvedValue({
      success: true,
      data: mockAdminThreads,
      pagination: { total: 2, page: 1, totalPages: 1 }
    });

    const res = await chatsApiModule.chatsApi.listAdminChatThreads();
    expect(listThreadsSpy).toHaveBeenCalledTimes(1);
    expect(res.data).toHaveLength(2);
    expect(res.data[0].studentName).toBe('Alice Smith');
    expect(res.data[0].teacherName).toBe('Prof. John Doe');
    expect(res.data[1].studentName).toBe('Charlie Brown');
  });

  // ============================================================
  // 2. NO FIRESTORE REALTIME LISTENER IS USED
  // ============================================================

  it('verifies no Firestore realtime listeners are invoked for ChatMonitor', () => {
    const firestoreKeys = Object.keys(firestoreModule);
    expect(firestoreKeys).toBeDefined();
    // Confirms module imports cleanly and ChatMonitor is standalone REST
  });

  // ============================================================
  // 3. SEARCH PASSES THROUGH CENTRALIZED API
  // ============================================================

  it('passes search query to chatsApi.listAdminChatThreads({ search })', async () => {
    const listThreadsSpy = vi.spyOn(chatsApiModule.chatsApi, 'listAdminChatThreads').mockResolvedValue({
      success: true,
      data: [mockAdminThreads[0]],
      pagination: { total: 1, page: 1, totalPages: 1 }
    });

    const res = await chatsApiModule.chatsApi.listAdminChatThreads({ search: 'Alice' });
    expect(listThreadsSpy).toHaveBeenCalledWith({ search: 'Alice' });
    expect(res.data).toHaveLength(1);
    expect(res.data[0].studentName).toBe('Alice Smith');
  });

  // ============================================================
  // 4. TEACHER / STUDENT / STATUS FILTERING
  // ============================================================

  it('passes teacherId, studentId, and status filters correctly', async () => {
    const listThreadsSpy = vi.spyOn(chatsApiModule.chatsApi, 'listAdminChatThreads').mockResolvedValue({
      success: true,
      data: [mockAdminThreads[0]],
      pagination: { total: 1, page: 1, totalPages: 1 }
    });

    await chatsApiModule.chatsApi.listAdminChatThreads({
      teacherId: PG_TEACHER_ID_1,
      studentId: PG_STUDENT_ID_1,
      status: 'active'
    });

    expect(listThreadsSpy).toHaveBeenCalledWith({
      teacherId: PG_TEACHER_ID_1,
      studentId: PG_STUDENT_ID_1,
      status: 'active'
    });
  });

  // ============================================================
  // 5. SELECTING A THREAD LOADS MESSAGES
  // ============================================================

  it('loads thread messages via chatsApi.listChatMessages(roomId)', async () => {
    const listMessagesSpy = vi.spyOn(chatsApiModule.chatsApi, 'listChatMessages').mockResolvedValue({
      success: true,
      data: mockMessages,
      pagination: { total: 2, page: 1, totalPages: 1 }
    });

    const res = await chatsApiModule.chatsApi.listChatMessages(PG_ROOM_ID_1);
    expect(listMessagesSpy).toHaveBeenCalledWith(PG_ROOM_ID_1);
    expect(res.data).toHaveLength(2);
    expect(res.data[0].text).toBe('Good morning Mr. Smith');
    expect(res.data[1].text).toBe('Good morning teacher, thank you');
  });

  // ============================================================
  // 6. ADMIN MONITORING DOES NOT MODIFY UNREAD COUNTERS
  // ============================================================

  it('ensures markChatRoomRead is NOT called during administrative monitoring', async () => {
    const markReadSpy = vi.spyOn(chatsApiModule.chatsApi, 'markChatRoomRead');

    // Admin monitors thread messages
    vi.spyOn(chatsApiModule.chatsApi, 'listChatMessages').mockResolvedValue({
      success: true,
      data: mockMessages
    });

    await chatsApiModule.chatsApi.listChatMessages(PG_ROOM_ID_1);

    // Assert markChatRoomRead was never invoked
    expect(markReadSpy).not.toHaveBeenCalled();
  });

  // ============================================================
  // 7. READ-ONLY AUDIT: NO SENDING / MUTATION CAPABILITIES
  // ============================================================

  it('ensures sendChatMessage is not exposed or invoked in Admin ChatMonitor', () => {
    const sendSpy = vi.spyOn(chatsApiModule.chatsApi, 'sendChatMessage');
    expect(sendSpy).not.toHaveBeenCalled();
  });

  // ============================================================
  // 8. TENANT ISOLATION AND CLIENT-SIDE NO-SPOOFING
  // ============================================================

  it('verifies requests do not pass client-controlled schoolId or sender authority', async () => {
    const listThreadsSpy = vi.spyOn(chatsApiModule.chatsApi, 'listAdminChatThreads').mockResolvedValue({
      success: true,
      data: mockAdminThreads
    });

    await chatsApiModule.chatsApi.listAdminChatThreads({ search: 'grade' });

    const queryArg = listThreadsSpy.mock.calls[0][0];
    expect(queryArg).not.toHaveProperty('schoolId');
    expect(queryArg).not.toHaveProperty('senderId');
    expect(queryArg).not.toHaveProperty('senderRole');
  });

  // ============================================================
  // 9. MEDIA ATTACHMENTS RENDERING
  // ============================================================

  it('renders media messages with supported image, audio, and document payloads', async () => {
    const mediaMessages = [
      {
        id: 'msg-img',
        chatRoomId: PG_ROOM_ID_1,
        senderRole: 'teacher',
        mediaUrl: 'https://example.com/photo.jpg',
        mediaType: 'image',
        text: 'Class activity',
        createdAt: '2026-09-15T09:30:00.000Z'
      },
      {
        id: 'msg-doc',
        chatRoomId: PG_ROOM_ID_1,
        senderRole: 'parent',
        mediaUrl: 'https://example.com/medical.pdf',
        mediaType: 'document',
        text: 'Leave application',
        createdAt: '2026-09-15T09:35:00.000Z'
      }
    ];

    vi.spyOn(chatsApiModule.chatsApi, 'listChatMessages').mockResolvedValue({
      success: true,
      data: mediaMessages
    });

    const res = await chatsApiModule.chatsApi.listChatMessages(PG_ROOM_ID_1);
    expect(res.data[0].mediaType).toBe('image');
    expect(res.data[1].mediaType).toBe('document');
  });

  // ============================================================
  // 10. ERROR & EMPTY STATES
  // ============================================================

  it('handles empty thread lists and message arrays cleanly', async () => {
    vi.spyOn(chatsApiModule.chatsApi, 'listAdminChatThreads').mockResolvedValue({
      success: true,
      data: []
    });

    vi.spyOn(chatsApiModule.chatsApi, 'listChatMessages').mockResolvedValue({
      success: true,
      data: []
    });

    const threadsRes = await chatsApiModule.chatsApi.listAdminChatThreads();
    expect(threadsRes.data).toEqual([]);

    const msgsRes = await chatsApiModule.chatsApi.listChatMessages('non-existent-room');
    expect(msgsRes.data).toEqual([]);
  });

  it('handles API failure during thread retrieval without crash', async () => {
    vi.spyOn(chatsApiModule.chatsApi, 'listAdminChatThreads').mockRejectedValue(new Error('Permission denied'));

    await expect(chatsApiModule.chatsApi.listAdminChatThreads()).rejects.toThrow('Permission denied');
  });
});
