import { Router } from 'express';
import * as chatsController from './chats.controller.js';
import * as chatsSchemas from './chats.schema.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { tenantContext } from '../../middleware/tenant.middleware.js';
import { requirePermission } from '../../middleware/rbac.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';

const router = Router();

// ============================================================
// DIRECT MESSAGING ROUTES
// ============================================================

/**
 * Get Total Unread Chat Count across all authorized rooms
 * GET /api/v1/chats/unread-count
 */
router.get(
  '/unread-count',
  authenticate,
  tenantContext({ requireTenant: true }),
  validate(chatsSchemas.getUnreadCountSchema),
  chatsController.getUnreadCount
);

/**
 * Resolve or Create a Chat Room for (studentId, teacherId)
 * POST /api/v1/chats/rooms/resolve
 */
router.post(
  '/rooms/resolve',
  authenticate,
  tenantContext({ requireTenant: true }),
  validate(chatsSchemas.resolveRoomSchema),
  chatsController.resolveRoom
);

/**
 * List Chat Rooms for Authenticated User (Teacher/Parent/Admin)
 * GET /api/v1/chats/rooms
 */
router.get(
  '/rooms',
  authenticate,
  tenantContext({ requireTenant: true }),
  validate(chatsSchemas.listRoomsSchema),
  chatsController.listRooms
);

/**
 * Get Single Chat Room Details
 * GET /api/v1/chats/rooms/:roomId
 */
router.get(
  '/rooms/:roomId',
  authenticate,
  tenantContext({ requireTenant: true }),
  validate(chatsSchemas.getRoomByIdSchema),
  chatsController.getRoomById
);

/**
 * List Messages in a Chat Room
 * GET /api/v1/chats/rooms/:roomId/messages
 */
router.get(
  '/rooms/:roomId/messages',
  authenticate,
  tenantContext({ requireTenant: true }),
  validate(chatsSchemas.listMessagesSchema),
  chatsController.listMessages
);

/**
 * Send a Message in a Chat Room
 * POST /api/v1/chats/rooms/:roomId/messages
 */
router.post(
  '/rooms/:roomId/messages',
  authenticate,
  tenantContext({ requireTenant: true }),
  validate(chatsSchemas.sendMessageSchema),
  chatsController.sendMessage
);

/**
 * Mark a Chat Room as Read (Resets actor's unread counter)
 * PATCH /api/v1/chats/rooms/:roomId/read
 */
router.patch(
  '/rooms/:roomId/read',
  authenticate,
  tenantContext({ requireTenant: true }),
  validate(chatsSchemas.markRoomReadSchema),
  chatsController.markRoomRead
);

// ============================================================
// ADMIN THREAD MONITORING ROUTES
// ============================================================

/**
 * Admin Monitor: List all tenant chat threads
 * GET /api/v1/chats/admin/threads
 */
router.get(
  '/admin/threads',
  authenticate,
  tenantContext({ requireTenant: true }),
  requirePermission('chats', 'read'),
  validate(chatsSchemas.adminListThreadsSchema),
  chatsController.adminListThreads
);

// ============================================================
// BROADCAST CHANNELS & POSTS ROUTES
// ============================================================

/**
 * List Broadcast Channels for Authenticated User
 * GET /api/v1/chats/channels
 */
router.get(
  '/channels',
  authenticate,
  tenantContext({ requireTenant: true }),
  validate(chatsSchemas.listChannelsSchema),
  chatsController.listChannels
);

/**
 * Create a Broadcast Channel
 * POST /api/v1/chats/channels
 */
router.post(
  '/channels',
  authenticate,
  tenantContext({ requireTenant: true }),
  validate(chatsSchemas.createChannelSchema),
  chatsController.createChannel
);

/**
 * List Posts in a Broadcast Channel
 * GET /api/v1/chats/channels/:channelId/posts
 */
router.get(
  '/channels/:channelId/posts',
  authenticate,
  tenantContext({ requireTenant: true }),
  validate(chatsSchemas.listChannelPostsSchema),
  chatsController.listChannelPosts
);

/**
 * Create a Post in a Broadcast Channel
 * POST /api/v1/chats/channels/:channelId/posts
 */
router.post(
  '/channels/:channelId/posts',
  authenticate,
  tenantContext({ requireTenant: true }),
  validate(chatsSchemas.createChannelPostSchema),
  chatsController.createChannelPost
);

export default router;
