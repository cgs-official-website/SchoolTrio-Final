import { describe, it, expect } from 'vitest';
import * as schemas from '../../../src/modules/notifications/notifications.schemas.js';

describe('Unit: Notification Schemas Tests — Backend Notification Domain', () => {
  const VALID_UUID = '11111111-1111-4111-8111-111111111111';

  describe('1. listNotificationsSchema', () => {
    it('validates valid query parameters with defaults', () => {
      const result = schemas.listNotificationsSchema.query.safeParse({});
      expect(result.success).toBe(true);
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(50);
      expect(result.data.sort).toBe('createdAt');
      expect(result.data.order).toBe('desc');
    });

    it('validates unread boolean and string conversions', () => {
      const trueResult = schemas.listNotificationsSchema.query.safeParse({ unread: 'true' });
      expect(trueResult.success).toBe(true);
      expect(trueResult.data.unread).toBe(true);

      const falseResult = schemas.listNotificationsSchema.query.safeParse({ unread: 'false' });
      expect(falseResult.success).toBe(true);
      expect(falseResult.data.unread).toBe(false);

      const boolResult = schemas.listNotificationsSchema.query.safeParse({ unread: true });
      expect(boolResult.success).toBe(true);
      expect(boolResult.data.unread).toBe(true);
    });

    it('validates valid type and date filters', () => {
      const result = schemas.listNotificationsSchema.query.safeParse({
        type: 'attendance_pending',
        date: '2026-09-15',
        page: '2',
        limit: '25',
        sort: 'date',
        order: 'asc'
      });
      expect(result.success).toBe(true);
      expect(result.data.type).toBe('attendance_pending');
      expect(result.data.date).toBe('2026-09-15');
      expect(result.data.page).toBe(2);
      expect(result.data.limit).toBe(25);
      expect(result.data.sort).toBe('date');
      expect(result.data.order).toBe('asc');
    });

    it('rejects invalid date format', () => {
      const result = schemas.listNotificationsSchema.query.safeParse({ date: '15-09-2026' });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('Invalid date format');
    });

    it('rejects invalid sort field not in allowlist', () => {
      const result = schemas.listNotificationsSchema.query.safeParse({ sort: 'passwordHash' });
      expect(result.success).toBe(false);
    });

    it('rejects invalid order value', () => {
      const result = schemas.listNotificationsSchema.query.safeParse({ order: 'sideways' });
      expect(result.success).toBe(false);
    });

    it('rejects negative or 0 page numbers', () => {
      const result = schemas.listNotificationsSchema.query.safeParse({ page: 0 });
      expect(result.success).toBe(false);
    });

    it('rejects limit exceeding 100', () => {
      const result = schemas.listNotificationsSchema.query.safeParse({ limit: 101 });
      expect(result.success).toBe(false);
    });
  });

  describe('2. getUnreadCountSchema', () => {
    it('validates empty query or valid type filter', () => {
      const emptyResult = schemas.getUnreadCountSchema.query.safeParse({});
      expect(emptyResult.success).toBe(true);

      const typedResult = schemas.getUnreadCountSchema.query.safeParse({ type: 'leave_submitted' });
      expect(typedResult.success).toBe(true);
      expect(typedResult.data.type).toBe('leave_submitted');
    });
  });

  describe('3. getNotificationByIdSchema & markNotificationReadSchema & deleteNotificationSchema', () => {
    it('accepts valid UUID parameter', () => {
      const result = schemas.getNotificationByIdSchema.params.safeParse({ id: VALID_UUID });
      expect(result.success).toBe(true);
      expect(result.data.id).toBe(VALID_UUID);
    });

    it('rejects malformed UUID parameter', () => {
      const result = schemas.getNotificationByIdSchema.params.safeParse({ id: 'not-a-uuid' });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('Invalid notification ID format');
    });

    it('validates markNotificationReadSchema params', () => {
      const result = schemas.markNotificationReadSchema.params.safeParse({ id: VALID_UUID });
      expect(result.success).toBe(true);
    });

    it('validates deleteNotificationSchema params', () => {
      const result = schemas.deleteNotificationSchema.params.safeParse({ id: VALID_UUID });
      expect(result.success).toBe(true);
    });
  });

  describe('4. markAllReadSchema', () => {
    it('accepts optional type filter in body', () => {
      const emptyResult = schemas.markAllReadSchema.body.safeParse({});
      expect(emptyResult.success).toBe(true);

      const typedResult = schemas.markAllReadSchema.body.safeParse({ type: 'attendance_pending' });
      expect(typedResult.success).toBe(true);
      expect(typedResult.data.type).toBe('attendance_pending');
    });
  });
});
