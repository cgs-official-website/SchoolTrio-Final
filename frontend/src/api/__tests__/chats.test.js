import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as clientModule from '../client.js';
import {
  getUnreadChatCount,
  resolveChatRoom,
  listChatRooms,
  getChatRoom,
  getChatRoomById,
  listChatMessages,
  sendChatMessage,
  markChatRoomRead,
  listAdminChatThreads,
  listChatChannels,
  createChatChannel,
  listChannelPosts,
  createChannelPost,
  chatsApi
} from '../chats.js';

describe('Chats REST API Client Tests', () => {
  const ROOM_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const STUDENT_ID = '11111111-2222-3333-4444-555555555555';
  const TEACHER_ID = '66666666-7777-8888-9999-000000000000';
  const CHANNEL_ID = '99999999-8888-7777-6666-555555555555';
  const CLASS_ID = 'cccccccc-dddd-eeee-ffff-000000000000';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Direct Messaging API Endpoints', () => {
    it('getUnreadChatCount calls GET /api/v1/chats/unread-count', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { count: 5 }
      });

      const res = await getUnreadChatCount();

      expect(spy).toHaveBeenCalledWith('/api/v1/chats/unread-count', {
        method: 'GET'
      });
      expect(res.data.count).toBe(5);
    });

    it('resolveChatRoom calls POST /api/v1/chats/rooms/resolve with payload', async () => {
      const payload = { studentId: STUDENT_ID, teacherId: TEACHER_ID };
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { id: ROOM_ID, studentId: STUDENT_ID, teacherId: TEACHER_ID }
      });

      const res = await resolveChatRoom(payload);

      expect(spy).toHaveBeenCalledWith('/api/v1/chats/rooms/resolve', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      expect(res.data.id).toBe(ROOM_ID);
    });

    it('listChatRooms calls GET /api/v1/chats/rooms with query parameters', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: [{ id: ROOM_ID, studentName: 'Alex' }],
        pagination: { total: 1, page: 1, limit: 10, totalPages: 1 }
      });

      const res = await listChatRooms({ status: 'active', page: 1, limit: 10, sort: 'lastMessageTime', order: 'desc' });

      expect(spy).toHaveBeenCalledWith('/api/v1/chats/rooms?status=active&page=1&limit=10&sort=lastMessageTime&order=desc', {
        method: 'GET'
      });
      expect(res.data).toHaveLength(1);
    });

    it('getChatRoom calls GET /api/v1/chats/rooms/:roomId', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { id: ROOM_ID, studentName: 'Alex', teacherName: 'Jane' }
      });

      const res = await getChatRoom(ROOM_ID);

      expect(spy).toHaveBeenCalledWith(`/api/v1/chats/rooms/${ROOM_ID}`, {
        method: 'GET'
      });
      expect(res.data.id).toBe(ROOM_ID);
    });

    it('getChatRoomById is an alias of getChatRoom', () => {
      expect(getChatRoomById).toBe(getChatRoom);
    });

    it('listChatMessages calls GET /api/v1/chats/rooms/:roomId/messages with query parameters', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: [{ id: 'msg-1', text: 'Hello' }],
        pagination: { total: 1, page: 1, limit: 20 }
      });

      const res = await listChatMessages(ROOM_ID, { page: 1, limit: 20 });

      expect(spy).toHaveBeenCalledWith(`/api/v1/chats/rooms/${ROOM_ID}/messages?page=1&limit=20`, {
        method: 'GET'
      });
      expect(res.data).toHaveLength(1);
    });

    it('sendChatMessage calls POST /api/v1/chats/rooms/:roomId/messages with payload', async () => {
      const payload = {
        text: 'Voice note',
        mediaUrl: 'data:audio/webm;base64,...',
        mediaType: 'audio'
      };
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { id: 'msg-1', ...payload }
      });

      const res = await sendChatMessage(ROOM_ID, payload);

      expect(spy).toHaveBeenCalledWith(`/api/v1/chats/rooms/${ROOM_ID}/messages`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      expect(res.data.id).toBe('msg-1');
    });

    it('markChatRoomRead calls PATCH /api/v1/chats/rooms/:roomId/read', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { success: true, roomId: ROOM_ID, unreadCountParent: 0, unreadCountTeacher: 0 }
      });

      const res = await markChatRoomRead(ROOM_ID);

      expect(spy).toHaveBeenCalledWith(`/api/v1/chats/rooms/${ROOM_ID}/read`, {
        method: 'PATCH'
      });
      expect(res.data.unreadCountParent).toBe(0);
    });
  });

  describe('Admin Thread Monitoring API Endpoints', () => {
    it('listAdminChatThreads calls GET /api/v1/chats/admin/threads with query parameters', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: [{ id: ROOM_ID, studentName: 'Alex' }],
        pagination: { total: 1, page: 1, limit: 50 }
      });

      const res = await listAdminChatThreads({ search: 'Alex', page: 1, limit: 50 });

      expect(spy).toHaveBeenCalledWith('/api/v1/chats/admin/threads?search=Alex&page=1&limit=50', {
        method: 'GET'
      });
      expect(res.data).toHaveLength(1);
    });
  });

  describe('Broadcast Channels & Posts API Endpoints', () => {
    it('listChatChannels calls GET /api/v1/chats/channels with query parameters', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: [{ id: CHANNEL_ID, name: 'Grade 10-A' }],
        pagination: { total: 1, page: 1, limit: 10 }
      });

      const res = await listChatChannels({ classId: CLASS_ID, page: 1, limit: 10 });

      expect(spy).toHaveBeenCalledWith(`/api/v1/chats/channels?classId=${CLASS_ID}&page=1&limit=10`, {
        method: 'GET'
      });
      expect(res.data).toHaveLength(1);
    });

    it('createChatChannel calls POST /api/v1/chats/channels with payload', async () => {
      const payload = { name: 'Grade 10-A Announcements', classId: CLASS_ID };
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { id: CHANNEL_ID, ...payload }
      });

      const res = await createChatChannel(payload);

      expect(spy).toHaveBeenCalledWith('/api/v1/chats/channels', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      expect(res.data.id).toBe(CHANNEL_ID);
    });

    it('listChannelPosts calls GET /api/v1/chats/channels/:channelId/posts with query parameters', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: [{ id: 'post-1', text: 'School Picnic' }],
        pagination: { total: 1, page: 1, limit: 20 }
      });

      const res = await listChannelPosts(CHANNEL_ID, { page: 1, limit: 20 });

      expect(spy).toHaveBeenCalledWith(`/api/v1/chats/channels/${CHANNEL_ID}/posts?page=1&limit=20`, {
        method: 'GET'
      });
      expect(res.data).toHaveLength(1);
    });

    it('createChannelPost calls POST /api/v1/chats/channels/:channelId/posts with payload', async () => {
      const payload = { text: 'School Picnic on Friday' };
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { id: 'post-1', ...payload }
      });

      const res = await createChannelPost(CHANNEL_ID, payload);

      expect(spy).toHaveBeenCalledWith(`/api/v1/chats/channels/${CHANNEL_ID}/posts`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      expect(res.data.id).toBe('post-1');
    });
  });

  describe('chatsApi Export Object', () => {
    it('exports chatsApi with all functions attached', () => {
      expect(chatsApi.getUnreadChatCount).toBe(getUnreadChatCount);
      expect(chatsApi.resolveChatRoom).toBe(resolveChatRoom);
      expect(chatsApi.listChatRooms).toBe(listChatRooms);
      expect(chatsApi.getChatRoom).toBe(getChatRoom);
      expect(chatsApi.getChatRoomById).toBe(getChatRoomById);
      expect(chatsApi.listChatMessages).toBe(listChatMessages);
      expect(chatsApi.sendChatMessage).toBe(sendChatMessage);
      expect(chatsApi.markChatRoomRead).toBe(markChatRoomRead);
      expect(chatsApi.listAdminChatThreads).toBe(listAdminChatThreads);
      expect(chatsApi.listChatChannels).toBe(listChatChannels);
      expect(chatsApi.createChatChannel).toBe(createChatChannel);
      expect(chatsApi.listChannelPosts).toBe(listChannelPosts);
      expect(chatsApi.createChannelPost).toBe(createChannelPost);
    });
  });
});
