import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as service from '../../../src/modules/notifications/notifications.service.js';
import * as repository from '../../../src/modules/notifications/notifications.repository.js';
import * as schemas from '../../../src/modules/notifications/notifications.schemas.js';
import { NotFoundError, TenantAccessError } from '../../../src/utils/app-error.js';
import { SYSTEM_ROLES } from '../../../src/config/constants.js';

vi.mock('../../../src/modules/notifications/notifications.repository.js', () => ({
  findNotifications: vi.fn(),
  countUnreadNotifications: vi.fn(),
  findNotificationById: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  deleteNotification: vi.fn()
}));

describe('Security: Notification Domain Security & Tenant Isolation Tests', () => {
  const TENANT_A_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const TENANT_B_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  const USER_A_ID = '11111111-1111-4111-8111-111111111111';
  const USER_B_ID = '22222222-2222-4222-8222-222222222222';

  const NOTIF_A_ID = '33333333-3333-4333-8333-333333333333';
  const NOTIF_B_ID = '44444444-4444-4444-8444-444444444444';

  const userAActor = {
    id: USER_A_ID,
    userId: USER_A_ID,
    schoolId: TENANT_A_ID,
    systemRole: SYSTEM_ROLES.PARENT,
    role: 'parent'
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================
  // ATTACK 1: USER A SUPPLIES USER B'S USERID
  // ============================================================
  it('Attack 1: User A supplies User B userId in query — ignored, service strictly binds to JWT actor ID', async () => {
    repository.findNotifications.mockResolvedValue({ notifications: [], total: 0 });

    // Attacker tries to query User B's notifications
    const maliciousQuery = { userId: USER_B_ID, recipientId: USER_B_ID };
    await service.listNotifications(TENANT_A_ID, maliciousQuery, userAActor);

    // Repository MUST receive User A's ID from actor, never User B's ID from query
    expect(repository.findNotifications).toHaveBeenCalledWith(
      TENANT_A_ID,
      expect.objectContaining({
        recipientFilter: { OR: [{ userId: USER_A_ID }] }
      }),
      expect.any(Object),
      expect.any(Object)
    );
  });

  // ============================================================
  // ATTACK 2: USER A SUPPLIES ANOTHER SCHOOL ID
  // ============================================================
  it('Attack 2: User A attempts cross-tenant access — tenant context violation throws TenantAccessError', async () => {
    // Calling service with null/empty tenant throws TenantAccessError
    await expect(service.listNotifications(null, {}, userAActor)).rejects.toThrow(TenantAccessError);
  });

  // ============================================================
  // ATTACK 3: USER A SUPPLIES NOTIFICATION UUID BELONGING TO ANOTHER USER
  // ============================================================
  it('Attack 3: User A attempts to view notification belonging to User B — returns 404 NotFoundError', async () => {
    // Notification belongs to User B
    const userBNotification = {
      id: NOTIF_B_ID,
      schoolId: TENANT_A_ID,
      userId: USER_B_ID,
      type: 'fee_reminder',
      message: 'Private Fee Notice',
      read: false
    };
    repository.findNotificationById.mockResolvedValue(userBNotification);

    await expect(service.getNotificationById(TENANT_A_ID, NOTIF_B_ID, userAActor)).rejects.toThrow(NotFoundError);
  });

  // ============================================================
  // ATTACK 4: USER A ATTEMPTS READ-ALL ACROSS TENANT OR ACROSS USERS
  // ============================================================
  it('Attack 4: User A attempts read-all — only updates User A notifications in Tenant A', async () => {
    repository.markAllNotificationsRead.mockResolvedValue({ count: 2 });

    await service.markAllAsRead(TENANT_A_ID, { schoolId: TENANT_B_ID, userId: USER_B_ID }, userAActor);

    expect(repository.markAllNotificationsRead).toHaveBeenCalledWith(
      TENANT_A_ID,
      { OR: [{ userId: USER_A_ID }] },
      null
    );
  });

  // ============================================================
  // ATTACK 5: USER A ATTEMPTS DELETION OF ANOTHER USER'S NOTIFICATION
  // ============================================================
  it('Attack 5: User A attempts to delete User B notification — fails safely with 404 without deleting', async () => {
    const userBNotification = {
      id: NOTIF_B_ID,
      schoolId: TENANT_A_ID,
      userId: USER_B_ID
    };
    repository.findNotificationById.mockResolvedValue(userBNotification);

    await expect(service.deleteNotification(TENANT_A_ID, NOTIF_B_ID, userAActor)).rejects.toThrow(NotFoundError);
    expect(repository.deleteNotification).not.toHaveBeenCalled();
  });

  // ============================================================
  // ATTACK 6: USER A MODIFIES NOTIFICATION TYPE TO GAIN SYSTEM-WIDE ACCESS
  // ============================================================
  it('Attack 6: Regular User A queries type: attendance_pending — recipient filter still restricts to User A ID', async () => {
    repository.findNotifications.mockResolvedValue({ notifications: [], total: 0 });

    await service.listNotifications(TENANT_A_ID, { type: 'attendance_pending' }, userAActor);

    // Even if type is attendance_pending, User A (non-admin) only searches their own userId records
    expect(repository.findNotifications).toHaveBeenCalledWith(
      TENANT_A_ID,
      expect.objectContaining({
        recipientFilter: { OR: [{ userId: USER_A_ID }] },
        type: 'attendance_pending'
      }),
      expect.any(Object),
      expect.any(Object)
    );
  });

  // ============================================================
  // ATTACK 7: USER A ATTEMPTS ARBITRARY SORT / SQL INJECTION
  // ============================================================
  it('Attack 7: Schema rejects arbitrary sort injection', () => {
    const maliciousSort = "createdAt; DROP TABLE notifications;--";
    const result = schemas.listNotificationsSchema.query.safeParse({ sort: maliciousSort });
    expect(result.success).toBe(false);
  });

  it('Attack 7b: Schema rejects malformed UUID in ID parameters', () => {
    const maliciousId = "11111111-1111-4111-8111-111111111111' OR '1'='1";
    const result = schemas.getNotificationByIdSchema.params.safeParse({ id: maliciousId });
    expect(result.success).toBe(false);
  });
});
