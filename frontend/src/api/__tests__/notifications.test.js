import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as clientModule from '../client.js';
import {
  listNotifications,
  getUnreadNotificationCount,
  getNotificationById,
  getNotification,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  notificationsApi
} from '../notifications.js';

describe('Notifications REST API Client Tests (Phase 1C)', () => {
  const NOTIFICATION_ID = '11111111-2222-3333-4444-555555555555';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================================
  // 1. ENDPOINTS & METHODS
  // ============================================================
  describe('Endpoint & Method Verification', () => {
    it('listNotifications calls GET /api/v1/notifications without query by default', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: [{ id: NOTIFICATION_ID, message: 'Test alert' }],
        pagination: { total: 1, page: 1, limit: 50 }
      });

      const res = await listNotifications();

      expect(spy).toHaveBeenCalledWith('/api/v1/notifications', {
        method: 'GET'
      });
      expect(res.data).toHaveLength(1);
    });

    it('listNotifications forwards supported query parameters (unread, type, date, page, limit, sort, order)', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: [],
        pagination: { total: 0, page: 1, limit: 20 }
      });

      await listNotifications({
        unread: true,
        type: 'attendance_pending',
        date: '2026-09-15',
        page: 2,
        limit: 20,
        sort: 'createdAt',
        order: 'desc'
      });

      expect(spy).toHaveBeenCalledWith(
        '/api/v1/notifications?unread=true&type=attendance_pending&date=2026-09-15&page=2&limit=20&sort=createdAt&order=desc',
        { method: 'GET' }
      );
    });

    it('getUnreadNotificationCount calls GET /api/v1/notifications/unread-count without params', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { count: 3 }
      });

      const res = await getUnreadNotificationCount();

      expect(spy).toHaveBeenCalledWith('/api/v1/notifications/unread-count', {
        method: 'GET'
      });
      expect(res.data.count).toBe(3);
    });

    it('getUnreadNotificationCount forwards optional type filter query param', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { count: 1 }
      });

      const res = await getUnreadNotificationCount({ type: 'attendance_pending' });

      expect(spy).toHaveBeenCalledWith('/api/v1/notifications/unread-count?type=attendance_pending', {
        method: 'GET'
      });
      expect(res.data.count).toBe(1);
    });

    it('getNotificationById calls GET /api/v1/notifications/:id with encoded ID', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { id: NOTIFICATION_ID, message: 'Class 10A attendance not marked' }
      });

      const res = await getNotificationById(NOTIFICATION_ID);

      expect(spy).toHaveBeenCalledWith(`/api/v1/notifications/${NOTIFICATION_ID}`, {
        method: 'GET'
      });
      expect(res.data.id).toBe(NOTIFICATION_ID);
    });

    it('getNotification is an alias of getNotificationById', () => {
      expect(getNotification).toBe(getNotificationById);
    });

    it('markNotificationRead calls PATCH /api/v1/notifications/:id/read with encoded ID', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { id: NOTIFICATION_ID, read: true }
      });

      const res = await markNotificationRead(NOTIFICATION_ID);

      expect(spy).toHaveBeenCalledWith(`/api/v1/notifications/${NOTIFICATION_ID}/read`, {
        method: 'PATCH'
      });
      expect(res.data.read).toBe(true);
    });

    it('markAllNotificationsRead calls PATCH /api/v1/notifications/read-all without payload when omitted', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { count: 5 }
      });

      const res = await markAllNotificationsRead();

      expect(spy).toHaveBeenCalledWith('/api/v1/notifications/read-all', {
        method: 'PATCH'
      });
      expect(res.data.count).toBe(5);
    });

    it('markAllNotificationsRead calls PATCH /api/v1/notifications/read-all with payload when provided', async () => {
      const payload = { type: 'attendance_pending' };
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { count: 2 }
      });

      const res = await markAllNotificationsRead(payload);

      expect(spy).toHaveBeenCalledWith('/api/v1/notifications/read-all', {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      expect(res.data.count).toBe(2);
    });

    it('deleteNotification calls DELETE /api/v1/notifications/:id with encoded ID', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { id: NOTIFICATION_ID }
      });

      const res = await deleteNotification(NOTIFICATION_ID);

      expect(spy).toHaveBeenCalledWith(`/api/v1/notifications/${NOTIFICATION_ID}`, {
        method: 'DELETE'
      });
      expect(res.data.id).toBe(NOTIFICATION_ID);
    });
  });

  // ============================================================
  // 2. SECURITY & IDENTITY ENFORCEMENT
  // ============================================================
  describe('Security, Tenant Boundaries & Identity Protection', () => {
    it('never sends client-controlled userId or recipientId in query or path', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: [],
        pagination: { total: 0 }
      });

      // Attempt to pass adversarial client-controlled userId/recipientId
      await listNotifications({
        userId: 'malicious-user-id',
        recipientId: 'another-user-id',
        unread: true
      });

      const calledUrl = spy.mock.calls[0][0];
      expect(calledUrl).not.toContain('userId=');
      expect(calledUrl).not.toContain('recipientId=');
    });

    it('never sends client-controlled schoolId or tenantId', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: [],
        pagination: { total: 0 }
      });

      await listNotifications({
        schoolId: 'malicious-school-id',
        tenantId: 'malicious-tenant-id'
      });

      const calledUrl = spy.mock.calls[0][0];
      expect(calledUrl).not.toContain('schoolId=');
      expect(calledUrl).not.toContain('tenantId=');
    });

    it('safely encodes path parameters against path traversal / injection', async () => {
      const maliciousId = '../malicious/path?attack=1#frag';
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: {}
      });

      await getNotificationById(maliciousId);
      expect(spy).toHaveBeenCalledWith(
        `/api/v1/notifications/${encodeURIComponent(maliciousId)}`,
        { method: 'GET' }
      );
    });
  });

  // ============================================================
  // 3. ERROR HANDLING & EXPORT OBJECT
  // ============================================================
  describe('Error Handling & Export Object', () => {
    it('propagates ApiError on backend failure without swallowing', async () => {
      const apiErr = new clientModule.ApiError('Notification not found', 404, 'NOT_FOUND');
      vi.spyOn(clientModule, 'apiClient').mockRejectedValue(apiErr);

      await expect(getNotificationById('non-existent-id')).rejects.toThrow('Notification not found');
    });

    it('exports notificationsApi object containing all methods', () => {
      expect(notificationsApi.listNotifications).toBe(listNotifications);
      expect(notificationsApi.getUnreadNotificationCount).toBe(getUnreadNotificationCount);
      expect(notificationsApi.getNotificationById).toBe(getNotificationById);
      expect(notificationsApi.getNotification).toBe(getNotification);
      expect(notificationsApi.markNotificationRead).toBe(markNotificationRead);
      expect(notificationsApi.markAllNotificationsRead).toBe(markAllNotificationsRead);
      expect(notificationsApi.deleteNotification).toBe(deleteNotification);
    });
  });
});
