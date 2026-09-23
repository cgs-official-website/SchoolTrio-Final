import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/app.js';
import * as authRepository from '../../../src/modules/auth/auth.repository.js';
import * as tokenService from '../../../src/modules/auth/token.service.js';
import * as supportTicketsRepository from '../../../src/modules/support-tickets/support-tickets.repository.js';
import { prisma } from '../../../src/database/prisma.client.js';
import { SYSTEM_ROLES } from '../../../src/config/constants.js';

describe('Support Tickets API Integration Tests', () => {
  const app = createApp();

  const TENANT_A_ID = '11111111-1111-4111-8111-111111111111';
  const TICKET_ID = '22222222-2222-4222-8222-222222222222';

  const mockAdminUser = {
    id: 'user-admin-1',
    schoolId: TENANT_A_ID,
    email: 'admin@school.edu',
    systemRole: SYSTEM_ROLES.SCHOOL_ADMIN,
    tokenVersion: 1,
    isActive: true,
    school: { id: TENANT_A_ID, name: 'Springfield Academy', code: 'SPRINGFIELD', status: 'approved' }
  };

  const mockSuperAdminUser = {
    id: 'user-superadmin-1',
    schoolId: null,
    email: 'superadmin@platform.com',
    systemRole: SYSTEM_ROLES.SUPER_ADMIN,
    tokenVersion: 1,
    isActive: true,
    school: null
  };

  const getAuthToken = (user) => {
    return tokenService.issueAccessToken({
      sub: user.id,
      schoolId: user.schoolId,
      systemRole: user.systemRole,
      tokenVersion: user.tokenVersion
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(prisma, '$transaction').mockImplementation(async (cb) => cb(prisma));

    vi.spyOn(authRepository, 'findUserById').mockImplementation(async (id) => {
      if (id === mockAdminUser.id) return mockAdminUser;
      if (id === mockSuperAdminUser.id) return mockSuperAdminUser;
      return null;
    });
  });

  describe('Tenant Endpoints (/api/v1/support-tickets)', () => {
    it('POST /api/v1/support-tickets creates a new ticket for authenticated tenant', async () => {
      const token = getAuthToken(mockAdminUser);
      const mockCreated = {
        id: TICKET_ID,
        schoolId: TENANT_A_ID,
        userId: mockAdminUser.id,
        ticketNumber: 'TK-4512',
        subject: 'Billing discrepancy',
        description: 'Invoice amount differs from plan',
        category: 'billing',
        priority: 'high',
        status: 'open',
        createdAt: new Date('2026-09-18T10:00:00Z'),
        updatedAt: new Date('2026-09-18T10:00:00Z')
      };

      vi.spyOn(supportTicketsRepository, 'createTicket').mockResolvedValue(mockCreated);
      vi.spyOn(supportTicketsRepository, 'createTicketMessage').mockResolvedValue({ id: 'msg-1' });

      const res = await request(app)
        .post('/api/v1/support-tickets')
        .set('Authorization', `Bearer ${token}`)
        .send({
          subject: 'Billing discrepancy',
          description: 'Invoice amount differs from plan',
          category: 'billing',
          priority: 'high'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.ticketNumber).toBe('TK-4512');
    });

    it('GET /api/v1/support-tickets lists tenant tickets with pagination', async () => {
      const token = getAuthToken(mockAdminUser);
      const mockList = [
        {
          id: TICKET_ID,
          schoolId: TENANT_A_ID,
          userId: mockAdminUser.id,
          ticketNumber: 'TK-4512',
          subject: 'Billing discrepancy',
          description: 'Invoice amount differs from plan',
          category: 'billing',
          priority: 'high',
          status: 'open',
          createdAt: new Date('2026-09-18T10:00:00Z'),
          updatedAt: new Date('2026-09-18T10:00:00Z')
        }
      ];

      vi.spyOn(supportTicketsRepository, 'findTenantTickets').mockResolvedValue(mockList);
      vi.spyOn(supportTicketsRepository, 'countTenantTickets').mockResolvedValue(1);

      const res = await request(app)
        .get('/api/v1/support-tickets?page=1&limit=10')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.pagination.total).toBe(1);
    });

    it('GET /api/v1/support-tickets/:id retrieves single ticket thread', async () => {
      const token = getAuthToken(mockAdminUser);
      const mockTicket = {
        id: TICKET_ID,
        schoolId: TENANT_A_ID,
        userId: mockAdminUser.id,
        ticketNumber: 'TK-4512',
        subject: 'Billing discrepancy',
        description: 'Invoice amount differs from plan',
        category: 'billing',
        priority: 'high',
        status: 'open',
        createdAt: new Date('2026-09-18T10:00:00Z'),
        updatedAt: new Date('2026-09-18T10:00:00Z'),
        messages: [
          {
            id: 'm-1',
            ticketId: TICKET_ID,
            senderId: mockAdminUser.id,
            senderRole: 'SCHOOL_ADMIN',
            senderName: 'Admin User',
            message: 'Invoice amount differs from plan',
            isInternalNote: false,
            createdAt: new Date('2026-09-18T10:00:00Z')
          }
        ]
      };

      vi.spyOn(supportTicketsRepository, 'findTicketById').mockResolvedValue(mockTicket);

      const res = await request(app)
        .get(`/api/v1/support-tickets/${TICKET_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.messages).toHaveLength(1);
    });

    it('POST /api/v1/support-tickets/:id/messages adds reply message', async () => {
      const token = getAuthToken(mockAdminUser);
      const mockTicket = {
        id: TICKET_ID,
        schoolId: TENANT_A_ID,
        status: 'open'
      };

      vi.spyOn(supportTicketsRepository, 'findTicketById').mockResolvedValue(mockTicket);
      vi.spyOn(supportTicketsRepository, 'createTicketMessage').mockResolvedValue({
        id: 'msg-2',
        ticketId: TICKET_ID,
        senderId: mockAdminUser.id,
        senderRole: 'SCHOOL_ADMIN',
        senderName: 'Admin User',
        message: 'Attaching the invoice screenshot.',
        attachments: ['https://example.com/inv.png'],
        isInternalNote: false,
        createdAt: new Date('2026-09-18T10:05:00Z')
      });
      vi.spyOn(supportTicketsRepository, 'updateTicket').mockResolvedValue(mockTicket);

      const res = await request(app)
        .post(`/api/v1/support-tickets/${TICKET_ID}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          message: 'Attaching the invoice screenshot.',
          attachments: ['https://example.com/inv.png']
        });

      expect(res.status).toBe(201);
      expect(res.body.data.message).toBe('Attaching the invoice screenshot.');
    });
  });

  describe('SuperAdmin Endpoints (/api/v1/superadmin/support-tickets)', () => {
    it('GET /api/v1/superadmin/support-tickets lists all tickets globally', async () => {
      const token = getAuthToken(mockSuperAdminUser);
      vi.spyOn(supportTicketsRepository, 'findGlobalTickets').mockResolvedValue([]);
      vi.spyOn(supportTicketsRepository, 'countGlobalTickets').mockResolvedValue(0);

      const res = await request(app)
        .get('/api/v1/superadmin/support-tickets')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
    });

    it('PATCH /api/v1/superadmin/support-tickets/:id/status updates resolution status', async () => {
      const token = getAuthToken(mockSuperAdminUser);
      const mockTicket = {
        id: TICKET_ID,
        schoolId: TENANT_A_ID,
        status: 'open'
      };
      const mockUpdated = {
        ...mockTicket,
        status: 'resolved'
      };

      vi.spyOn(supportTicketsRepository, 'findTicketById').mockResolvedValue(mockTicket);
      vi.spyOn(supportTicketsRepository, 'updateTicket').mockResolvedValue(mockUpdated);

      const res = await request(app)
        .patch(`/api/v1/superadmin/support-tickets/${TICKET_ID}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'resolved' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('resolved');
    });

    it('POST /api/v1/superadmin/support-tickets/:id/messages posts support agent reply', async () => {
      const token = getAuthToken(mockSuperAdminUser);
      const mockTicket = {
        id: TICKET_ID,
        schoolId: TENANT_A_ID,
        status: 'open'
      };

      vi.spyOn(supportTicketsRepository, 'findTicketById').mockResolvedValue(mockTicket);
      vi.spyOn(supportTicketsRepository, 'createTicketMessage').mockResolvedValue({
        id: 'msg-3',
        ticketId: TICKET_ID,
        senderId: mockSuperAdminUser.id,
        senderRole: 'SUPER_ADMIN',
        senderName: 'SuperAdmin Support',
        message: 'We have updated your invoice balance.',
        isInternalNote: false,
        createdAt: new Date('2026-09-18T10:15:00Z')
      });
      vi.spyOn(supportTicketsRepository, 'updateTicket').mockResolvedValue(mockTicket);

      const res = await request(app)
        .post(`/api/v1/superadmin/support-tickets/${TICKET_ID}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          message: 'We have updated your invoice balance.'
        });

      expect(res.status).toBe(201);
      expect(res.body.data.senderRole).toBe('SUPER_ADMIN');
    });
  });
});
