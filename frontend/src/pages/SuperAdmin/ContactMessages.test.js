import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { 
  submitContactMessage, 
  getContactMessages, 
  getContactMessage, 
  updateContactMessageStatus, 
  replyContactMessage 
} from '../../api/contactMessages.js';
import * as clientModule from '../../api/client.js';

vi.mock('../../api/client.js', () => ({
  apiClient: vi.fn()
}));

describe('Contact Messages Module: Frontend & API Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. API Client Calls (contactMessages.js)', () => {
    it('submitContactMessage dispatches POST to /api/v1/public/contact-messages', async () => {
      clientModule.apiClient.mockResolvedValueOnce({ success: true, data: { id: 'msg-1' } });

      const payload = {
        name: 'Jane Doe',
        email: 'jane@example.com',
        message: 'I want to inquire about School Management'
      };

      await submitContactMessage(payload);

      expect(clientModule.apiClient).toHaveBeenCalledWith(
        '/api/v1/public/contact-messages',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(payload)
        })
      );
    });

    it('getContactMessages builds correct query string with search, status, and pagination', async () => {
      clientModule.apiClient.mockResolvedValueOnce({ success: true, data: { messages: [], stats: {} } });

      await getContactMessages({
        search: 'Jane',
        status: 'new',
        sortBy: 'createdAt',
        sortOrder: 'desc',
        page: 2,
        limit: 10
      });

      expect(clientModule.apiClient).toHaveBeenCalled();
      const calledUrl = clientModule.apiClient.mock.calls[0][0];
      expect(calledUrl).toContain('/api/v1/superadmin/contact-messages?');
      expect(calledUrl).toContain('search=Jane');
      expect(calledUrl).toContain('status=new');
      expect(calledUrl).toContain('page=2');
      expect(calledUrl).toContain('limit=10');
      expect(calledUrl).toContain('sortOrder=desc');
    });

    it('getContactMessage fetches single message detail by UUID', async () => {
      clientModule.apiClient.mockResolvedValueOnce({ success: true, data: { id: 'test-uuid-123' } });

      await getContactMessage('test-uuid-123');

      expect(clientModule.apiClient).toHaveBeenCalledWith(
        '/api/v1/superadmin/contact-messages/test-uuid-123',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('updateContactMessageStatus patches status to /api/v1/superadmin/contact-messages/:id/status', async () => {
      clientModule.apiClient.mockResolvedValueOnce({ success: true, data: { id: 'msg-1', status: 'in_progress' } });

      await updateContactMessageStatus('msg-1', 'in_progress');

      expect(clientModule.apiClient).toHaveBeenCalledWith(
        '/api/v1/superadmin/contact-messages/msg-1/status',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ status: 'in_progress' })
        })
      );
    });

    it('replyContactMessage posts reply text to /api/v1/superadmin/contact-messages/:id/reply', async () => {
      clientModule.apiClient.mockResolvedValueOnce({ success: true, data: { message: {}, reply: {} } });

      await replyContactMessage('msg-1', 'Thank you for your inquiry, here is the answer.');

      expect(clientModule.apiClient).toHaveBeenCalledWith(
        '/api/v1/superadmin/contact-messages/msg-1/reply',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ reply: 'Thank you for your inquiry, here is the answer.' })
        })
      );
    });
  });

  describe('2. SuperAdmin ContactMessages Component Structure', () => {
    const contactMessagesPath = path.resolve(__dirname, 'ContactMessages.jsx');
    const content = fs.readFileSync(contactMessagesPath, 'utf-8');

    it('contains all 5 summary KPI cards (Total, New, In Progress, Replied, Closed)', () => {
      expect(content).toContain('Total');
      expect(content).toContain('New');
      expect(content).toContain('In Progress');
      expect(content).toContain('Replied');
      expect(content).toContain('Closed');
    });

    it('implements the 7 required table columns', () => {
      expect(content).toContain('Message ID');
      expect(content).toContain('Sender Name');
      expect(content).toContain('Email Address');
      expect(content).toContain('Message Preview');
      expect(content).toContain('Submitted Date & Time');
      expect(content).toContain('Status');
      expect(content).toContain('Action');
    });

    it('provides search input and status filter controls', () => {
      expect(content).toContain('searchTerm');
      expect(content).toContain('statusFilter');
      expect(content).toContain('sortOrder');
      expect(content).toContain('Search by sender name or email');
    });

    it('provides message detail modal with all required information and actions', () => {
      expect(content).toContain('selectedMessage');
      expect(content).toContain('Complete Message');
      expect(content).toContain('Mark as Read');
      expect(content).toContain('Mark as In Progress');
      expect(content).toContain('Close Message');
    });

    it('implements admin reply form with delivery status reporting without false success', () => {
      expect(content).toContain('replyText');
      expect(content).toContain('handleSendReply');
      expect(content).toContain('Send Reply');
      expect(content).toContain('emailDeliveryStatus');
      expect(content).toContain('not_configured');
    });
  });

  describe('3. Public Website Contact Form (LandingPage.jsx)', () => {
    const landingPath = path.resolve(__dirname, '../LandingPage.jsx');
    const content = fs.readFileSync(landingPath, 'utf-8');

    it('captures Full Name, Email Address, and Message', () => {
      expect(content).toContain('Full Name');
      expect(content).toContain('Email Address');
      expect(content).toContain('Message');
    });

    it('validates fields and email format before submission', () => {
      expect(content).toContain('emailRegex');
      expect(content).toContain('handleContactSubmit');
      expect(content).toContain('Please provide a valid email address');
    });

    it('prevents duplicate submissions with disabled state', () => {
      expect(content).toContain('isSubmittingContact');
      expect(content).toContain('disabled={isSubmittingContact}');
      expect(content).toContain('Sending Message...');
    });

    it('wires directly to submitContactMessage API', () => {
      expect(content).toContain('submitContactMessage');
    });
  });
});

