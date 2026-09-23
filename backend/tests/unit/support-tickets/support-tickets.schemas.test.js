import { describe, it, expect } from 'vitest';
import {
  createTicketSchema,
  listTicketsSchema,
  ticketParamsSchema,
  addMessageSchema,
  superAdminListTicketsSchema,
  superAdminUpdateStatusSchema,
  superAdminAddMessageSchema
} from '../../../src/modules/support-tickets/support-tickets.schemas.js';

describe('Support Tickets Schemas Unit Tests', () => {
  const validUUID = '11111111-1111-4111-8111-111111111111';

  describe('createTicketSchema', () => {
    it('validates a valid create ticket payload', async () => {
      const result = await createTicketSchema.body.safeParseAsync({
        subject: 'Cannot generate invoice PDF',
        description: 'When clicking print invoice, a blank screen appears.',
        category: 'technical',
        priority: 'high'
      });
      expect(result.success).toBe(true);
      expect(result.data.priority).toBe('high');
      expect(result.data.category).toBe('technical');
    });

    it('applies defaults for category and priority', async () => {
      const result = await createTicketSchema.body.safeParseAsync({
        subject: 'General inquiry',
        description: 'How do I add a new section?'
      });
      expect(result.success).toBe(true);
      expect(result.data.priority).toBe('medium');
      expect(result.data.category).toBe('general');
    });

    it('rejects empty subject or description', async () => {
      const result = await createTicketSchema.body.safeParseAsync({
        subject: '   ',
        description: ''
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid priority value', async () => {
      const result = await createTicketSchema.body.safeParseAsync({
        subject: 'Valid Subject',
        description: 'Valid Description',
        priority: 'critical'
      });
      expect(result.success).toBe(false);
      expect(result.error.errors[0].message).toContain('Priority must be one of');
    });
  });

  describe('ticketParamsSchema & addMessageSchema', () => {
    it('validates valid UUID in params', async () => {
      const result = await ticketParamsSchema.params.safeParseAsync({ id: validUUID });
      expect(result.success).toBe(true);
    });

    it('rejects malformed UUID in params', async () => {
      const result = await ticketParamsSchema.params.safeParseAsync({ id: 'invalid-id' });
      expect(result.success).toBe(false);
      expect(result.error.errors[0].message).toContain('Invalid ticket ID format');
    });

    it('validates valid message payload', async () => {
      const result = await addMessageSchema.body.safeParseAsync({
        message: 'Here is additional context regarding the issue.',
        attachments: ['https://example.com/screenshot.png']
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid attachment URLs', async () => {
      const result = await addMessageSchema.body.safeParseAsync({
        message: 'Message with bad url',
        attachments: ['not-a-valid-url']
      });
      expect(result.success).toBe(false);
      expect(result.error.errors[0].message).toContain('Invalid attachment URL format');
    });
  });

  describe('superAdminUpdateStatusSchema', () => {
    it('validates valid status transitions', async () => {
      const result = await superAdminUpdateStatusSchema.body.safeParseAsync({
        status: 'resolved'
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid status', async () => {
      const result = await superAdminUpdateStatusSchema.body.safeParseAsync({
        status: 'archived'
      });
      expect(result.success).toBe(false);
      expect(result.error.errors[0].message).toContain('Status must be one of');
    });
  });
});
