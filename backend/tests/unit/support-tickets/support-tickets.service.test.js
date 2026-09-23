import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as supportTicketsService from '../../../src/modules/support-tickets/support-tickets.service.js';
import * as supportTicketsRepository from '../../../src/modules/support-tickets/support-tickets.repository.js';
import { prisma } from '../../../src/database/prisma.client.js';
import { NotFoundError, ValidationError } from '../../../src/utils/app-error.js';

vi.mock('../../../src/modules/support-tickets/support-tickets.repository.js');

describe('Support Tickets Service Unit Tests', () => {
  const schoolId = '11111111-1111-4111-8111-111111111111';
  const mockUser = {
    id: 'user-admin-1',
    email: 'admin@school.edu',
    systemRole: 'SCHOOL_ADMIN'
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(prisma, '$transaction').mockImplementation(async (cb) => cb(prisma));
  });

  describe('createTicket', () => {
    it('throws ValidationError if schoolId is missing', async () => {
      await expect(supportTicketsService.createTicket(null, mockUser, {})).rejects.toThrow(ValidationError);
    });

    it('creates support ticket and initial thread message inside transaction', async () => {
      const mockCreated = {
        id: 'ticket-1',
        schoolId,
        userId: mockUser.id,
        ticketNumber: 'TK-8912',
        subject: 'Cannot login',
        description: 'Teacher login fails',
        category: 'technical',
        priority: 'high',
        status: 'open',
        createdAt: new Date('2026-09-18T10:00:00Z'),
        updatedAt: new Date('2026-09-18T10:00:00Z')
      };

      vi.spyOn(supportTicketsRepository, 'createTicket').mockResolvedValue(mockCreated);
      vi.spyOn(supportTicketsRepository, 'createTicketMessage').mockResolvedValue({ id: 'msg-1' });

      const result = await supportTicketsService.createTicket(schoolId, mockUser, {
        subject: 'Cannot login',
        description: 'Teacher login fails',
        category: 'technical',
        priority: 'high'
      });

      expect(result.id).toBe('ticket-1');
      expect(result.subject).toBe('Cannot login');
      expect(supportTicketsRepository.createTicket).toHaveBeenCalled();
      expect(supportTicketsRepository.createTicketMessage).toHaveBeenCalled();
    });
  });

  describe('getTenantTicketById', () => {
    it('throws NotFoundError if ticket does not exist for tenant', async () => {
      vi.spyOn(supportTicketsRepository, 'findTicketById').mockResolvedValue(null);

      await expect(supportTicketsService.getTenantTicketById(schoolId, 'non-existent')).rejects.toThrow(NotFoundError);
    });

    it('filters out internal SuperAdmin notes from tenant view', async () => {
      const mockTicket = {
        id: 'ticket-1',
        schoolId,
        ticketNumber: 'TK-1234',
        subject: 'Query',
        description: 'Help needed',
        category: 'general',
        priority: 'medium',
        status: 'open',
        createdAt: new Date('2026-09-18T10:00:00Z'),
        updatedAt: new Date('2026-09-18T10:00:00Z'),
        messages: [
          { id: 'm-1', message: 'Public client message', isInternalNote: false, createdAt: new Date() },
          { id: 'm-2', message: 'Internal SuperAdmin staff note', isInternalNote: true, createdAt: new Date() }
        ]
      };

      vi.spyOn(supportTicketsRepository, 'findTicketById').mockResolvedValue(mockTicket);

      const result = await supportTicketsService.getTenantTicketById(schoolId, 'ticket-1');

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].message).toBe('Public client message');
    });
  });
});
