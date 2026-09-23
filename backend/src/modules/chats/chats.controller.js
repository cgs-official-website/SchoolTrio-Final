import * as chatsService from './chats.service.js';
import { HTTP_STATUS } from '../../config/constants.js';

/**
 * Extracts schoolId from request context (req.tenant, req.auth, req.user, headers, query, or req.schoolId)
 */
function getSchoolId(req) {
  return (
    req.tenant?.schoolId ||
    req.auth?.schoolId ||
    req.user?.schoolId ||
    req.headers?.['x-tenant-id'] ||
    req.headers?.['x-school-id'] ||
    req.query?.schoolId ||
    req.schoolId ||
    null
  );
}

/**
 * Controller for resolving or creating a ChatRoom.
 * POST /api/v1/chats/rooms/resolve
 */
export async function resolveRoom(req, res, next) {
  try {
    const actor = req.auth || req.user;
    const schoolId = getSchoolId(req);
    const result = await chatsService.resolveRoom(schoolId, req.body, actor);
    return res.status(HTTP_STATUS.OK).json({
      success: true,
      data: result
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Controller for listing ChatRooms.
 * GET /api/v1/chats/rooms
 */
export async function listRooms(req, res, next) {
  try {
    const actor = req.auth || req.user;
    const schoolId = getSchoolId(req);
    const result = await chatsService.listRooms(schoolId, req.query, actor);
    return res.status(HTTP_STATUS.OK).json({
      success: true,
      ...result
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Controller for getting a single ChatRoom by ID.
 * GET /api/v1/chats/rooms/:roomId
 */
export async function getRoomById(req, res, next) {
  try {
    const actor = req.auth || req.user;
    const schoolId = getSchoolId(req);
    const result = await chatsService.getRoomById(schoolId, req.params.roomId, actor);
    return res.status(HTTP_STATUS.OK).json({
      success: true,
      data: result
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Controller for listing messages in a ChatRoom.
 * GET /api/v1/chats/rooms/:roomId/messages
 */
export async function listMessages(req, res, next) {
  try {
    const actor = req.auth || req.user;
    const schoolId = getSchoolId(req);
    const result = await chatsService.listMessages(schoolId, req.params.roomId, req.query, actor);
    return res.status(HTTP_STATUS.OK).json({
      success: true,
      ...result
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Controller for sending a message in a ChatRoom.
 * POST /api/v1/chats/rooms/:roomId/messages
 */
export async function sendMessage(req, res, next) {
  try {
    const actor = req.auth || req.user;
    const schoolId = getSchoolId(req);
    const result = await chatsService.sendMessage(schoolId, req.params.roomId, req.body, actor);
    return res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: result
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Controller for marking a ChatRoom as read.
 * PATCH /api/v1/chats/rooms/:roomId/read
 */
export async function markRoomRead(req, res, next) {
  try {
    const actor = req.auth || req.user;
    const schoolId = getSchoolId(req);
    const result = await chatsService.markRoomRead(schoolId, req.params.roomId, actor);
    return res.status(HTTP_STATUS.OK).json({
      success: true,
      data: result
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Controller for getting total unread chat messages count.
 * GET /api/v1/chats/unread-count
 */
export async function getUnreadCount(req, res, next) {
  try {
    const actor = req.auth || req.user;
    const schoolId = getSchoolId(req);
    const result = await chatsService.getUnreadCount(schoolId, actor);
    return res.status(HTTP_STATUS.OK).json({
      success: true,
      data: result
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Controller for listing all chat threads for Admin monitoring.
 * GET /api/v1/chats/admin/threads
 */
export async function adminListThreads(req, res, next) {
  try {
    const actor = req.auth || req.user;
    const schoolId = getSchoolId(req);
    const result = await chatsService.adminListThreads(schoolId, req.query, actor);
    return res.status(HTTP_STATUS.OK).json({
      success: true,
      ...result
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Controller for listing BroadcastChannels.
 * GET /api/v1/chats/channels
 */
export async function listChannels(req, res, next) {
  try {
    const actor = req.auth || req.user;
    const schoolId = getSchoolId(req);
    const result = await chatsService.listChannels(schoolId, req.query, actor);
    return res.status(HTTP_STATUS.OK).json({
      success: true,
      ...result
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Controller for creating a BroadcastChannel.
 * POST /api/v1/chats/channels
 */
export async function createChannel(req, res, next) {
  try {
    const actor = req.auth || req.user;
    const schoolId = getSchoolId(req);
    const result = await chatsService.createChannel(schoolId, req.body, actor);
    return res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: result
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Controller for listing ChannelPosts in a BroadcastChannel.
 * GET /api/v1/chats/channels/:channelId/posts
 */
export async function listChannelPosts(req, res, next) {
  try {
    const actor = req.auth || req.user;
    const schoolId = getSchoolId(req);
    const result = await chatsService.listChannelPosts(schoolId, req.params.channelId, req.query, actor);
    return res.status(HTTP_STATUS.OK).json({
      success: true,
      ...result
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Controller for creating a ChannelPost in a BroadcastChannel.
 * POST /api/v1/chats/channels/:channelId/posts
 */
export async function createChannelPost(req, res, next) {
  try {
    const actor = req.auth || req.user;
    const schoolId = getSchoolId(req);
    const result = await chatsService.createChannelPost(schoolId, req.params.channelId, req.body, actor);
    return res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: result
    });
  } catch (error) {
    return next(error);
  }
}
