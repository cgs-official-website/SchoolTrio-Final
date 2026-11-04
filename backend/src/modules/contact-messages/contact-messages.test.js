import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as service from './contact-messages.service.js';
import * as repository from './contact-messages.repository.js';
import * as emailService from '../../services/email.service.js';
import { env } from '../../config/env.js';

vi.mock('./contact-messages.repository.js');
vi.mock('../../services/email.service.js');

describe('Contact Messages Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('submitMessage', () => {
    it('creates and returns a new contact message inquiry with trimmed sanitized fields', async () => {
      const mockCreated = {
        id: '11111111-2222-3333-4444-555555555555',
        name: 'John Doe',
        email: 'john@example.com',
        subject: null,
        message: 'Hello, I have an inquiry about pricing.',
        status: 'new',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      repository.createMessage.mockResolvedValueOnce(mockCreated);

      const result = await service.submitMessage({
        name: '  John Doe  ',
        email: '  JOHN@EXAMPLE.COM  ',
        message: '  Hello, I have an inquiry about pricing.  '
      }, { ipAddress: '127.0.0.1', userAgent: 'TestBrowser' });

      expect(repository.createMessage).toHaveBeenCalledWith({
        name: 'John Doe',
        email: 'john@example.com',
        subject: null,
        message: 'Hello, I have an inquiry about pricing.',
        ipAddress: '127.0.0.1',
        userAgent: 'TestBrowser'
      });
      expect(result).toEqual(mockCreated);
    });
  });

  describe('listMessages', () => {
    it('returns paginated messages and aggregated summary statistics', async () => {
      const mockMessages = [
        { id: 'msg-1', name: 'Alice', email: 'alice@example.com', status: 'new' },
        { id: 'msg-2', name: 'Bob', email: 'bob@example.com', status: 'replied' }
      ];
      const mockStats = { total: 10, new: 4, inProgress: 2, replied: 3, closed: 1 };

      repository.getMessages.mockResolvedValueOnce({ messages: mockMessages, total: 10 });
      repository.getMessageStats.mockResolvedValueOnce(mockStats);

      const result = await service.listMessages({ page: 1, limit: 10, status: 'all' });

      expect(result.messages).toEqual(mockMessages);
      expect(result.pagination.total).toBe(10);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.totalPages).toBe(1);
      expect(result.stats).toEqual(mockStats);
    });
  });

  describe('getMessageById', () => {
    it('returns message details when found', async () => {
      const mockMsg = {
        id: 'msg-1',
        name: 'Alice',
        email: 'alice@example.com',
        message: 'Hello',
        status: 'new',
        replies: []
      };
      repository.getMessageById.mockResolvedValueOnce(mockMsg);

      const result = await service.getMessageById('msg-1');
      expect(result).toEqual(mockMsg);
    });

    it('throws NotFoundError if message is not found', async () => {
      repository.getMessageById.mockResolvedValueOnce(null);
      await expect(service.getMessageById('missing-id')).rejects.toThrow('not found');
    });
  });

  describe('updateMessageStatus', () => {
    it('updates status when message exists', async () => {
      repository.getMessageById.mockResolvedValueOnce({ id: 'msg-1', status: 'new' });
      repository.updateStatus.mockResolvedValueOnce({ id: 'msg-1', status: 'in_progress' });

      const result = await service.updateMessageStatus('msg-1', 'in_progress');
      expect(repository.updateStatus).toHaveBeenCalledWith('msg-1', 'in_progress');
      expect(result.status).toBe('in_progress');
    });
  });

  describe('replyToMessage', () => {
    it('dispatches email, marks message replied, and records delivery status', async () => {
      const mockMsg = {
        id: 'msg-1',
        name: 'Alice',
        email: 'alice@example.com',
        message: 'Tell me about school plans',
        subject: 'Plan inquiry',
        status: 'new',
        replies: []
      };
      repository.getMessageById.mockResolvedValueOnce(mockMsg);

      // Mock email success
      emailService.sendViaResend.mockResolvedValueOnce({ success: true, messageId: 'resend_123' });

      const mockSaved = {
        reply: { id: 'rep-1', replyText: 'Here are our plans', emailDeliveryStatus: 'sent' },
        message: { ...mockMsg, status: 'replied', reply: 'Here are our plans', emailDeliveryStatus: 'sent' }
      };
      repository.saveReply.mockResolvedValueOnce(mockSaved);

      const result = await service.replyToMessage('msg-1', 'Here are our plans', {
        id: 'admin-uuid',
        name: 'Platform Admin',
        email: 'admin@school.edu'
      });

      expect(repository.saveReply).toHaveBeenCalledWith('msg-1', expect.objectContaining({
        adminName: 'Platform Admin',
        replyText: 'Here are our plans',
        emailDeliveryStatus: 'sent'
      }));
      expect(result.emailDeliveryStatus).toBe('sent');
      expect(result.message.status).toBe('replied');
    });

    it('handles email delivery failure gracefully without throwing and records failed status', async () => {
      const mockMsg = {
        id: 'msg-1',
        name: 'Bob',
        email: 'bob@example.com',
        message: 'Need help',
        status: 'new'
      };
      repository.getMessageById.mockResolvedValueOnce(mockMsg);

      emailService.sendViaResend.mockRejectedValueOnce(new Error('Network error'));
      emailService.sendMail.mockRejectedValueOnce(new Error('SMTP connection error'));
      emailService.sanitizeErrorMessage.mockImplementation(m => m);

      const mockSaved = {
        reply: { id: 'rep-2', replyText: 'We received your message', emailDeliveryStatus: 'failed' },
        message: { ...mockMsg, status: 'replied', reply: 'We received your message', emailDeliveryStatus: 'failed' }
      };
      repository.saveReply.mockResolvedValueOnce(mockSaved);

      const result = await service.replyToMessage('msg-1', 'We received your message', {
        id: 'admin-uuid',
        name: 'Platform Admin'
      });

      expect(result.emailDeliveryStatus).toBe('failed');
      expect(repository.saveReply).toHaveBeenCalledWith('msg-1', expect.objectContaining({
        emailDeliveryStatus: 'failed'
      }));
    });
  });
});

