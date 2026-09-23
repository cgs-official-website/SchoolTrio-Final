import { describe, it, expect } from 'vitest';
import * as chatsSchemas from '../../../src/modules/chats/chats.schema.js';

describe('Unit: Chats Schema Validation Tests', () => {
  const VALID_UUID_1 = '11111111-1111-4111-8111-111111111111';
  const VALID_UUID_2 = '22222222-2222-4222-8222-222222222222';

  describe('resolveRoomSchema', () => {
    it('validates correct payload with studentId and teacherId', () => {
      const payload = {
        studentId: VALID_UUID_1,
        teacherId: VALID_UUID_2
      };
      const parsed = chatsSchemas.resolveRoomSchema.body.safeParse(payload);
      expect(parsed.success).toBe(true);
    });

    it('validates correct payload with studentId only', () => {
      const payload = {
        studentId: VALID_UUID_1
      };
      const parsed = chatsSchemas.resolveRoomSchema.body.safeParse(payload);
      expect(parsed.success).toBe(true);
    });

    it('rejects invalid studentId', () => {
      const payload = {
        studentId: 'not-a-uuid'
      };
      const parsed = chatsSchemas.resolveRoomSchema.body.safeParse(payload);
      expect(parsed.success).toBe(false);
    });
  });

  describe('sendMessageSchema', () => {
    it('accepts text-only message', () => {
      const payload = {
        text: 'Hello from parent'
      };
      const parsed = chatsSchemas.sendMessageSchema.body.safeParse(payload);
      expect(parsed.success).toBe(true);
    });

    it('accepts media-only message', () => {
      const payload = {
        mediaUrl: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
        mediaType: 'image'
      };
      const parsed = chatsSchemas.sendMessageSchema.body.safeParse(payload);
      expect(parsed.success).toBe(true);
    });

    it('accepts audio media message with text', () => {
      const payload = {
        text: 'Voice message',
        mediaUrl: 'data:audio/webm;base64,GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYECGFOAZwE=',
        mediaType: 'audio'
      };
      const parsed = chatsSchemas.sendMessageSchema.body.safeParse(payload);
      expect(parsed.success).toBe(true);
    });

    it('rejects message with neither text nor mediaUrl', () => {
      const payload = {};
      const parsed = chatsSchemas.sendMessageSchema.body.safeParse(payload);
      expect(parsed.success).toBe(false);
    });

    it('rejects invalid mediaType', () => {
      const payload = {
        text: 'Hello',
        mediaUrl: 'https://example.com/file.exe',
        mediaType: 'executable'
      };
      const parsed = chatsSchemas.sendMessageSchema.body.safeParse(payload);
      expect(parsed.success).toBe(false);
    });
  });

  describe('createChannelSchema', () => {
    it('validates valid channel creation', () => {
      const payload = {
        name: 'Grade 10 Announcements',
        classId: VALID_UUID_1
      };
      const parsed = chatsSchemas.createChannelSchema.body.safeParse(payload);
      expect(parsed.success).toBe(true);
    });

    it('validates school-wide channel creation without classId', () => {
      const payload = {
        name: 'School Wide Broadcast'
      };
      const parsed = chatsSchemas.createChannelSchema.body.safeParse(payload);
      expect(parsed.success).toBe(true);
    });

    it('rejects empty channel name', () => {
      const payload = {
        name: ''
      };
      const parsed = chatsSchemas.createChannelSchema.body.safeParse(payload);
      expect(parsed.success).toBe(false);
    });
  });

  describe('createChannelPostSchema', () => {
    it('validates valid channel post', () => {
      const payload = {
        text: 'Tomorrow is a holiday'
      };
      const parsed = chatsSchemas.createChannelPostSchema.body.safeParse(payload);
      expect(parsed.success).toBe(true);
    });

    it('rejects empty channel post', () => {
      const payload = {};
      const parsed = chatsSchemas.createChannelPostSchema.body.safeParse(payload);
      expect(parsed.success).toBe(false);
    });
  });
});
