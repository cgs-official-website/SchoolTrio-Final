import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as chatsController from '../../../src/modules/chats/chats.controller.js';
import * as chatsService from '../../../src/modules/chats/chats.service.js';
import { HTTP_STATUS } from '../../../src/config/constants.js';

vi.mock('../../../src/modules/chats/chats.service.js');

describe('Unit: Chats Controller Tests', () => {
  let req, res, next;

  beforeEach(() => {
    vi.clearAllMocks();
    req = {
      schoolId: '11111111-1111-4111-8111-111111111111',
      auth: {
        userId: '22222222-2222-4222-8222-222222222222',
        role: 'TEACHER'
      },
      params: {},
      query: {},
      body: {}
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    };
    next = vi.fn();
  });

  it('resolveRoom returns 200 with room data', async () => {
    req.body = { studentId: 'student-1', teacherId: 'teacher-1' };
    const mockResult = { id: 'room-1', studentName: 'Alex' };
    chatsService.resolveRoom.mockResolvedValue(mockResult);

    await chatsController.resolveRoom(req, res, next);

    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: mockResult
    });
  });

  it('listRooms returns 200 with formatted rooms and pagination', async () => {
    const mockResult = {
      data: [{ id: 'room-1' }],
      pagination: { page: 1, limit: 50, total: 1 }
    };
    chatsService.listRooms.mockResolvedValue(mockResult);

    await chatsController.listRooms(req, res, next);

    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      ...mockResult
    });
  });

  it('getRoomById returns 200 with single room data', async () => {
    req.params.roomId = 'room-1';
    const mockResult = { id: 'room-1', studentName: 'Alex' };
    chatsService.getRoomById.mockResolvedValue(mockResult);

    await chatsController.getRoomById(req, res, next);

    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: mockResult
    });
  });

  it('listMessages returns 200 with messages and pagination', async () => {
    req.params.roomId = 'room-1';
    const mockResult = {
      data: [{ id: 'msg-1', text: 'Hello' }],
      pagination: { page: 1, limit: 50, total: 1 }
    };
    chatsService.listMessages.mockResolvedValue(mockResult);

    await chatsController.listMessages(req, res, next);

    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      ...mockResult
    });
  });

  it('sendMessage returns 201 with created message', async () => {
    req.params.roomId = 'room-1';
    req.body = { text: 'Hello!' };
    const mockResult = { id: 'msg-1', text: 'Hello!' };
    chatsService.sendMessage.mockResolvedValue(mockResult);

    await chatsController.sendMessage(req, res, next);

    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.CREATED);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: mockResult
    });
  });

  it('markRoomRead returns 200 with updated unread counts', async () => {
    req.params.roomId = 'room-1';
    const mockResult = { success: true, roomId: 'room-1', unreadCountTeacher: 0, unreadCountParent: 0 };
    chatsService.markRoomRead.mockResolvedValue(mockResult);

    await chatsController.markRoomRead(req, res, next);

    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: mockResult
    });
  });

  it('getUnreadCount returns 200 with total unread count', async () => {
    const mockResult = { count: 5 };
    chatsService.getUnreadCount.mockResolvedValue(mockResult);

    await chatsController.getUnreadCount(req, res, next);

    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: mockResult
    });
  });

  it('adminListThreads returns 200 with threads and pagination', async () => {
    const mockResult = {
      data: [{ id: 'room-1', studentName: 'Alex' }],
      pagination: { page: 1, limit: 50, total: 1 }
    };
    chatsService.adminListThreads.mockResolvedValue(mockResult);

    await chatsController.adminListThreads(req, res, next);

    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      ...mockResult
    });
  });

  it('listChannels returns 200 with channels list', async () => {
    const mockResult = {
      data: [{ id: 'chan-1', name: 'Announcements' }],
      pagination: { page: 1, limit: 50, total: 1 }
    };
    chatsService.listChannels.mockResolvedValue(mockResult);

    await chatsController.listChannels(req, res, next);

    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      ...mockResult
    });
  });

  it('createChannel returns 201 with created channel', async () => {
    req.body = { name: 'Class 10-A' };
    const mockResult = { id: 'chan-1', name: 'Class 10-A' };
    chatsService.createChannel.mockResolvedValue(mockResult);

    await chatsController.createChannel(req, res, next);

    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.CREATED);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: mockResult
    });
  });

  it('listChannelPosts returns 200 with posts', async () => {
    req.params.channelId = 'chan-1';
    const mockResult = {
      data: [{ id: 'post-1', text: 'Holiday Notice' }],
      pagination: { page: 1, limit: 50, total: 1 }
    };
    chatsService.listChannelPosts.mockResolvedValue(mockResult);

    await chatsController.listChannelPosts(req, res, next);

    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      ...mockResult
    });
  });

  it('createChannelPost returns 201 with created post', async () => {
    req.params.channelId = 'chan-1';
    req.body = { text: 'Holiday Notice' };
    const mockResult = { id: 'post-1', text: 'Holiday Notice' };
    chatsService.createChannelPost.mockResolvedValue(mockResult);

    await chatsController.createChannelPost(req, res, next);

    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.CREATED);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: mockResult
    });
  });

  it('calls next with error if service throws', async () => {
    const error = new Error('Service failure');
    chatsService.listRooms.mockRejectedValue(error);

    await chatsController.listRooms(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });
});
