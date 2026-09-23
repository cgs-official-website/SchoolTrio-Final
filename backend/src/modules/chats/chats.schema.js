import { z } from 'zod';
import { REGEX } from '../../config/constants.js';

export const SENDER_ROLES = Object.freeze({
  TEACHER: 'teacher',
  PARENT: 'parent',
  ADMIN: 'admin'
});

export const MEDIA_TYPES = Object.freeze({
  IMAGE: 'image',
  DOCUMENT: 'document',
  AUDIO: 'audio'
});

// ============================================================
// DIRECT MESSAGING SCHEMAS
// ============================================================

export const resolveRoomSchema = {
  body: z.object({
    studentId: z
      .string({ required_error: 'Student ID is required' })
      .regex(REGEX.UUID, 'Invalid student ID format'),
    teacherId: z
      .string()
      .regex(REGEX.UUID, 'Invalid teacher ID format')
      .optional()
  })
};

export const listRoomsSchema = {
  query: z.object({
    status: z.string().trim().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    sort: z.enum(['lastMessageTime', 'createdAt', 'updatedAt']).default('lastMessageTime'),
    order: z.enum(['asc', 'desc']).default('desc')
  })
};

export const getRoomByIdSchema = {
  params: z.object({
    roomId: z
      .string({ required_error: 'Room ID is required' })
      .regex(REGEX.UUID, 'Invalid room ID format')
  })
};

export const listMessagesSchema = {
  params: z.object({
    roomId: z
      .string({ required_error: 'Room ID is required' })
      .regex(REGEX.UUID, 'Invalid room ID format')
  }),
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    sort: z.enum(['createdAt']).default('createdAt'),
    order: z.enum(['asc', 'desc']).default('asc')
  })
};

export const sendMessageSchema = {
  params: z.object({
    roomId: z
      .string({ required_error: 'Room ID is required' })
      .regex(REGEX.UUID, 'Invalid room ID format')
  }),
  body: z
    .object({
      text: z.string().trim().max(10000, 'Message cannot exceed 10000 characters').nullable().optional(),
      mediaUrl: z.string().trim().max(2000000, 'Media URL too long').nullable().optional(),
      mediaType: z.enum([MEDIA_TYPES.IMAGE, MEDIA_TYPES.DOCUMENT, MEDIA_TYPES.AUDIO]).nullable().optional()
    })
    .refine(
      (data) => (data.text && data.text.length > 0) || (data.mediaUrl && data.mediaUrl.length > 0),
      {
        message: 'Message must contain either text or a media attachment',
        path: ['text']
      }
    )
};

export const markRoomReadSchema = {
  params: z.object({
    roomId: z
      .string({ required_error: 'Room ID is required' })
      .regex(REGEX.UUID, 'Invalid room ID format')
  })
};

export const getUnreadCountSchema = {
  query: z.object({}).optional()
};

// ============================================================
// ADMIN THREAD MONITORING SCHEMAS
// ============================================================

export const adminListThreadsSchema = {
  query: z.object({
    schoolId: z.string().regex(REGEX.UUID, 'Invalid school ID format').optional(),
    teacherId: z.string().regex(REGEX.UUID, 'Invalid teacher ID format').optional(),
    studentId: z.string().regex(REGEX.UUID, 'Invalid student ID format').optional(),
    search: z.string().trim().max(100).optional(),
    status: z.string().trim().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    sort: z.enum(['lastMessageTime', 'createdAt', 'updatedAt']).default('lastMessageTime'),
    order: z.enum(['asc', 'desc']).default('desc')
  })
};

// ============================================================
// BROADCAST CHANNELS SCHEMAS
// ============================================================

export const listChannelsSchema = {
  query: z.object({
    classId: z.string().regex(REGEX.UUID, 'Invalid class ID format').optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50)
  })
};

export const createChannelSchema = {
  body: z.object({
    name: z
      .string({ required_error: 'Channel name is required' })
      .trim()
      .min(1, 'Channel name cannot be empty')
      .max(150, 'Channel name cannot exceed 150 characters'),
    classId: z
      .string()
      .regex(REGEX.UUID, 'Invalid class ID format')
      .nullable()
      .optional()
  })
};

export const listChannelPostsSchema = {
  params: z.object({
    channelId: z
      .string({ required_error: 'Channel ID is required' })
      .regex(REGEX.UUID, 'Invalid channel ID format')
  }),
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    sort: z.enum(['createdAt']).default('createdAt'),
    order: z.enum(['asc', 'desc']).default('asc')
  })
};

export const createChannelPostSchema = {
  params: z.object({
    channelId: z
      .string({ required_error: 'Channel ID is required' })
      .regex(REGEX.UUID, 'Invalid channel ID format')
  }),
  body: z
    .object({
      text: z.string().trim().max(10000, 'Post text cannot exceed 10000 characters').nullable().optional(),
      mediaUrl: z.string().trim().max(2000000, 'Media URL too long').nullable().optional(),
      mediaType: z.enum([MEDIA_TYPES.IMAGE, MEDIA_TYPES.DOCUMENT, MEDIA_TYPES.AUDIO]).nullable().optional()
    })
    .refine(
      (data) => (data.text && data.text.length > 0) || (data.mediaUrl && data.mediaUrl.length > 0),
      {
        message: 'Post must contain either text or a media attachment',
        path: ['text']
      }
    )
};
