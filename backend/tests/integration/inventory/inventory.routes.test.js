import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/app.js';
import * as inventoryService from '../../../src/modules/inventory/inventory.service.js';
import * as authRepository from '../../../src/modules/auth/auth.repository.js';
import * as tokenService from '../../../src/modules/auth/token.service.js';
import * as rbacService from '../../../src/modules/rbac/rbac.service.js';
import { SYSTEM_ROLES } from '../../../src/config/constants.js';

describe('Inventory Routes & RBAC Integration Tests', () => {
  const app = createApp();

  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
  const ADMIN_USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const INVENTORY_USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const VP_USER_ID = 'vvvvvvvv-vvvv-4vvv-8vvv-vvvvvvvvvvvv';
  const TEACHER_USER_ID = 'tttttttt-tttt-4ttt-8ttt-tttttttttttt';
  const PARENT_USER_ID = 'pppppppp-pppp-4ppp-8ppp-pppppppppppp';

  const ITEM_ID = '22222222-2222-4222-8222-222222222222';
  const CATEGORY_ID = '33333333-3333-4333-8333-333333333333';

  const adminUser = {
    id: ADMIN_USER_ID,
    schoolId: SCHOOL_ID,
    email: 'admin@school.com',
    systemRole: SYSTEM_ROLES.SCHOOL_ADMIN,
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_ID, name: 'School A', code: 'SCH-A', status: 'active' }
  };

  const inventoryUser = {
    id: INVENTORY_USER_ID,
    schoolId: SCHOOL_ID,
    email: 'inventory@school.com',
    systemRole: 'INVENTORY',
    roles: ['inventory'],
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_ID, name: 'School A', code: 'SCH-A', status: 'active' }
  };

  const vpUser = {
    id: VP_USER_ID,
    schoolId: SCHOOL_ID,
    email: 'vp@school.com',
    systemRole: 'VICE_PRINCIPAL',
    roles: ['vice-principal'],
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_ID, name: 'School A', code: 'SCH-A', status: 'active' }
  };

  const teacherUser = {
    id: TEACHER_USER_ID,
    schoolId: SCHOOL_ID,
    email: 'teacher@school.com',
    systemRole: 'TEACHER',
    roles: ['teacher'],
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_ID, name: 'School A', code: 'SCH-A', status: 'active' }
  };

  const parentUser = {
    id: PARENT_USER_ID,
    schoolId: SCHOOL_ID,
    email: 'parent@family.com',
    systemRole: SYSTEM_ROLES.PARENT,
    roles: ['parent'],
    tokenVersion: 1,
    isActive: true,
    school: { id: SCHOOL_ID, name: 'School A', code: 'SCH-A', status: 'active' }
  };

  const getAuthToken = (user = adminUser) => {
    return tokenService.issueAccessToken({
      sub: user.id,
      schoolId: user.schoolId,
      systemRole: user.systemRole,
      tokenVersion: user.tokenVersion
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(authRepository, 'findUserById').mockImplementation(async (id) => {
      if (id === ADMIN_USER_ID) return adminUser;
      if (id === INVENTORY_USER_ID) return inventoryUser;
      if (id === VP_USER_ID) return vpUser;
      if (id === TEACHER_USER_ID) return teacherUser;
      if (id === PARENT_USER_ID) return parentUser;
      return null;
    });

    vi.spyOn(rbacService, 'getUserEffectivePermissions').mockImplementation(async (_schoolId, userId) => {
      if (userId === INVENTORY_USER_ID) {
        return {
          inventory: { canRead: true, canCreate: true, canEdit: true, canDelete: true }
        };
      }
      if (userId === VP_USER_ID) {
        return {
          inventory: { canRead: true, canCreate: false, canEdit: false, canDelete: false }
        };
      }
      if (userId === TEACHER_USER_ID) {
        return {
          inventory: { canRead: false, canCreate: false, canEdit: false, canDelete: false }
        };
      }
      return {};
    });
  });

  // ==========================================
  // 1. Categories Endpoints
  // ==========================================

  describe('GET /api/v1/inventory/categories', () => {
    it('allows Admin to list categories', async () => {
      vi.spyOn(inventoryService, 'listCategories').mockResolvedValueOnce([
        { id: CATEGORY_ID, schoolId: SCHOOL_ID, name: 'Stationery', _count: { items: 5 } }
      ]);

      const res = await request(app)
        .get('/api/v1/inventory/categories')
        .set('Authorization', `Bearer ${getAuthToken(adminUser)}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('Stationery');
    });

    it('allows Vice Principal to list categories (Read-Only)', async () => {
      vi.spyOn(inventoryService, 'listCategories').mockResolvedValueOnce([]);

      const res = await request(app)
        .get('/api/v1/inventory/categories')
        .set('Authorization', `Bearer ${getAuthToken(vpUser)}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('denies Teacher access with 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/v1/inventory/categories')
        .set('Authorization', `Bearer ${getAuthToken(teacherUser)}`);

      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/v1/inventory/categories', () => {
    it('allows Inventory Staff to create category', async () => {
      vi.spyOn(inventoryService, 'createCategory').mockResolvedValueOnce({
        id: CATEGORY_ID,
        schoolId: SCHOOL_ID,
        name: 'Electronics'
      });

      const res = await request(app)
        .post('/api/v1/inventory/categories')
        .set('Authorization', `Bearer ${getAuthToken(inventoryUser)}`)
        .send({ name: 'Electronics', description: 'Lab electronics' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Electronics');
    });

    it('denies VP with 403 when creating category', async () => {
      const res = await request(app)
        .post('/api/v1/inventory/categories')
        .set('Authorization', `Bearer ${getAuthToken(vpUser)}`)
        .send({ name: 'Books' });

      expect(res.status).toBe(403);
    });
  });

  // ==========================================
  // 2. Inventory Items Endpoints
  // ==========================================

  describe('GET /api/v1/inventory/items', () => {
    it('allows Inventory Staff to list items with pagination', async () => {
      vi.spyOn(inventoryService, 'listItems').mockResolvedValueOnce({
        items: [
          { id: ITEM_ID, name: 'A4 Paper', category: 'Stationery', quantity: 20, status: 'In Stock' }
        ],
        total: 1
      });

      const res = await request(app)
        .get('/api/v1/inventory/items?page=1&limit=10')
        .set('Authorization', `Bearer ${getAuthToken(inventoryUser)}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.meta.total).toBe(1);
    });
  });

  describe('POST /api/v1/inventory/items', () => {
    it('allows Admin to create item', async () => {
      vi.spyOn(inventoryService, 'createItem').mockResolvedValueOnce({
        id: ITEM_ID,
        schoolId: SCHOOL_ID,
        name: 'Markers',
        productId: 'PROD-001',
        category: 'Stationery',
        quantity: 50,
        unit: 'box',
        minimumStock: 10,
        status: 'In Stock'
      });

      const res = await request(app)
        .post('/api/v1/inventory/items')
        .set('Authorization', `Bearer ${getAuthToken(adminUser)}`)
        .send({
          name: 'Markers',
          productId: 'PROD-001',
          category: 'Stationery',
          quantity: 50,
          unit: 'box',
          minimumStock: 10
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Markers');
    });

    it('rejects creation with empty name (400 ValidationError)', async () => {
      const res = await request(app)
        .post('/api/v1/inventory/items')
        .set('Authorization', `Bearer ${getAuthToken(adminUser)}`)
        .send({ name: '' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/inventory/items/:id/adjust', () => {
    it('allows Inventory Staff to adjust stock (inbound/outbound)', async () => {
      vi.spyOn(inventoryService, 'adjustStock').mockResolvedValueOnce({
        item: { id: ITEM_ID, name: 'A4 Paper', quantity: 25, status: 'In Stock' },
        auditLog: { id: 'log-1', type: 'Inbound Stock', quantity: 5, newStock: 25 }
      });

      const res = await request(app)
        .post(`/api/v1/inventory/items/${ITEM_ID}/adjust`)
        .set('Authorization', `Bearer ${getAuthToken(inventoryUser)}`)
        .send({
          type: 'inbound',
          quantity: 5,
          remarks: 'Received new batch'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.item.quantity).toBe(25);
    });
  });

  describe('DELETE /api/v1/inventory/items/:id', () => {
    it('allows Admin to delete item without audit history', async () => {
      vi.spyOn(inventoryService, 'deleteItem').mockResolvedValueOnce({ id: ITEM_ID });

      const res = await request(app)
        .delete(`/api/v1/inventory/items/${ITEM_ID}`)
        .set('Authorization', `Bearer ${getAuthToken(adminUser)}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /api/v1/inventory/items/bulk-import', () => {
    it('allows Admin to bulk import items', async () => {
      vi.spyOn(inventoryService, 'bulkImportItems').mockResolvedValueOnce({
        totalRows: 2,
        successCount: 2,
        updatedCount: 0,
        skippedCount: 0,
        items: []
      });

      const res = await request(app)
        .post('/api/v1/inventory/items/bulk-import')
        .set('Authorization', `Bearer ${getAuthToken(adminUser)}`)
        .send({
          items: [
            { productId: 'P-1', name: 'Item 1', category: 'General', quantity: 10 },
            { productId: 'P-2', name: 'Item 2', category: 'General', quantity: 20 }
          ],
          autoCreateCategories: true,
          duplicateAction: 'skip'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.successCount).toBe(2);
    });
  });

  describe('GET /api/v1/inventory/audit-logs', () => {
    it('allows Admin to query audit logs', async () => {
      vi.spyOn(inventoryService, 'listAuditLogs').mockResolvedValueOnce({
        logs: [
          { id: 'log-1', itemName: 'A4 Paper', type: 'Inbound Stock', quantity: 10 }
        ],
        total: 1
      });

      const res = await request(app)
        .get('/api/v1/inventory/audit-logs?page=1&limit=10')
        .set('Authorization', `Bearer ${getAuthToken(adminUser)}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });
  });
});
