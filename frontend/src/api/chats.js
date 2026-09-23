/**
 * src/api/chats.js
 *
 * Centralized Chat & Communication API client module communicating with the PostgreSQL REST backend.
 * Uses the centralized HTTP client with automatic in-memory JWT token injection,
 * HttpOnly cookie refresh handling, and tenant context.
 */

import { apiClient } from './client.js';

/**
 * Builds a clean query string omitting null, undefined, and empty string values.
 *
 * @param {Object} [params={}] - Key-value map of query parameters
 * @returns {string} Formatted query string or empty string
 */
function buildQueryString(params = {}) {
  if (!params || typeof params !== 'object') return '';
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.append(key, String(value));
    }
  }
  const qs = searchParams.toString();
  return qs ? `?${qs}` : '';
}

// ============================================================
// DIRECT MESSAGING ENDPOINTS
// ============================================================

/**
 * Gets aggregated unread chat count across all authorized rooms for the authenticated user.
 * Calls GET /api/v1/chats/unread-count.
 *
 * @returns {Promise<{ success: boolean, data: { count: number } }>}
 */
export async function getUnreadChatCount() {
  return apiClient('/api/v1/chats/unread-count', {
    method: 'GET'
  });
}

/**
 * Resolves or creates a canonical ChatRoom for (studentId, teacherId).
 * Calls POST /api/v1/chats/rooms/resolve.
 *
 * @param {Object} payload - { studentId: string, teacherId?: string }
 * @returns {Promise<{ success: boolean, data: Object }>}
 */
export async function resolveChatRoom(payload) {
  return apiClient('/api/v1/chats/rooms/resolve', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

/**
 * Lists chat rooms accessible to the authenticated user with optional pagination and filters.
 * Calls GET /api/v1/chats/rooms.
 *
 * @param {Object} [query={}] - Optional query filters ({ status?, page?, limit?, sort?, order? })
 * @returns {Promise<{ success: boolean, data: Array<Object>, pagination: Object }>}
 */
export async function listChatRooms(query = {}) {
  const qs = buildQueryString(query);
  return apiClient(`/api/v1/chats/rooms${qs}`, {
    method: 'GET'
  });
}

/**
 * Retrieves a single ChatRoom record by ID.
 * Calls GET /api/v1/chats/rooms/:roomId.
 *
 * @param {string} roomId - PostgreSQL ChatRoom UUID
 * @returns {Promise<{ success: boolean, data: Object }>}
 */
export async function getChatRoom(roomId) {
  return apiClient(`/api/v1/chats/rooms/${encodeURIComponent(roomId)}`, {
    method: 'GET'
  });
}

export const getChatRoomById = getChatRoom;

/**
 * Lists messages in a ChatRoom ordered chronologically with pagination.
 * Calls GET /api/v1/chats/rooms/:roomId/messages.
 *
 * @param {string} roomId - PostgreSQL ChatRoom UUID
 * @param {Object} [query={}] - Optional pagination ({ page?, limit?, sort?, order? })
 * @returns {Promise<{ success: boolean, data: Array<Object>, pagination: Object }>}
 */
export async function listChatMessages(roomId, query = {}) {
  const qs = buildQueryString(query);
  return apiClient(`/api/v1/chats/rooms/${encodeURIComponent(roomId)}/messages${qs}`, {
    method: 'GET'
  });
}

/**
 * Sends a message in a ChatRoom.
 * Calls POST /api/v1/chats/rooms/:roomId/messages.
 *
 * @param {string} roomId - PostgreSQL ChatRoom UUID
 * @param {Object} payload - { text?: string, mediaUrl?: string, mediaType?: 'image'|'document'|'audio' }
 * @returns {Promise<{ success: boolean, data: Object }>}
 */
export async function sendChatMessage(roomId, payload) {
  return apiClient(`/api/v1/chats/rooms/${encodeURIComponent(roomId)}/messages`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

/**
 * Marks a ChatRoom as read, resetting the authenticated actor's unread counter.
 * Calls PATCH /api/v1/chats/rooms/:roomId/read.
 *
 * @param {string} roomId - PostgreSQL ChatRoom UUID
 * @returns {Promise<{ success: boolean, data: { success: boolean, roomId: string, unreadCountParent: number, unreadCountTeacher: number } }>}
 */
export async function markChatRoomRead(roomId) {
  return apiClient(`/api/v1/chats/rooms/${encodeURIComponent(roomId)}/read`, {
    method: 'PATCH'
  });
}

// ============================================================
// ADMIN THREAD MONITORING ENDPOINTS
// ============================================================

/**
 * Lists all tenant chat threads for Admin monitoring with search and filters.
 * Requires chats.read permission.
 * Calls GET /api/v1/chats/admin/threads.
 *
 * @param {Object} [query={}] - Filters ({ teacherId?, studentId?, search?, status?, page?, limit?, sort?, order? })
 * @returns {Promise<{ success: boolean, data: Array<Object>, pagination: Object }>}
 */
export async function listAdminChatThreads(query = {}) {
  const qs = buildQueryString(query);
  return apiClient(`/api/v1/chats/admin/threads${qs}`, {
    method: 'GET'
  });
}

// ============================================================
// BROADCAST CHANNELS & POSTS ENDPOINTS
// ============================================================

/**
 * Lists BroadcastChannels accessible to the authenticated user.
 * Calls GET /api/v1/chats/channels.
 *
 * @param {Object} [query={}] - Optional query filters ({ classId?, page?, limit? })
 * @returns {Promise<{ success: boolean, data: Array<Object>, pagination: Object }>}
 */
export async function listChatChannels(query = {}) {
  const qs = buildQueryString(query);
  return apiClient(`/api/v1/chats/channels${qs}`, {
    method: 'GET'
  });
}

/**
 * Creates a new BroadcastChannel.
 * Calls POST /api/v1/chats/channels.
 *
 * @param {Object} payload - { name: string, classId?: string|null }
 * @returns {Promise<{ success: boolean, data: Object }>}
 */
export async function createChatChannel(payload) {
  return apiClient('/api/v1/chats/channels', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

/**
 * Lists posts in a BroadcastChannel ordered chronologically with pagination.
 * Calls GET /api/v1/chats/channels/:channelId/posts.
 *
 * @param {string} channelId - PostgreSQL BroadcastChannel UUID
 * @param {Object} [query={}] - Optional pagination ({ page?, limit?, sort?, order? })
 * @returns {Promise<{ success: boolean, data: Array<Object>, pagination: Object }>}
 */
export async function listChannelPosts(channelId, query = {}) {
  const qs = buildQueryString(query);
  return apiClient(`/api/v1/chats/channels/${encodeURIComponent(channelId)}/posts${qs}`, {
    method: 'GET'
  });
}

/**
 * Creates a post in a BroadcastChannel.
 * Calls POST /api/v1/chats/channels/:channelId/posts.
 *
 * @param {string} channelId - PostgreSQL BroadcastChannel UUID
 * @param {Object} payload - { text?: string, mediaUrl?: string, mediaType?: 'image'|'document'|'audio' }
 * @returns {Promise<{ success: boolean, data: Object }>}
 */
export async function createChannelPost(channelId, payload) {
  return apiClient(`/api/v1/chats/channels/${encodeURIComponent(channelId)}/posts`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export const chatsApi = {
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
  createChannelPost
};

export default chatsApi;
