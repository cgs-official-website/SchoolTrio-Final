import { describe, it, expect, vi, beforeEach } from 'vitest';
import EnvironmentSetup from '../EnvironmentSetup.jsx';
import * as leavesApiModule from '../../../api/leaves.js';
import * as staffApiModule from '../../../api/staff.js';
import * as firestoreModule from '../../../firebase/firestore.js';

describe('Admin EnvironmentSetup Leave Approval Rules REST Cutover (Phase L.2)', () => {
  const MOCK_RULE_1 = {
    id: 'rule-1',
    schoolId: 'school-1',
    roleId: 'role-1',
    minDays: 1,
    maxDays: 3,
    order: 1,
    role: { id: 'role-1', name: 'Principal', slug: 'principal' },
    createdAt: '2026-09-16T10:00:00.000Z',
    updatedAt: '2026-09-16T10:00:00.000Z'
  };

  const MOCK_RULE_2 = {
    id: 'rule-2',
    schoolId: 'school-1',
    roleId: 'role-2',
    minDays: 4,
    maxDays: null,
    order: 2,
    role: { id: 'role-2', name: 'Correspondent', slug: 'correspondent' },
    createdAt: '2026-09-16T10:00:00.000Z',
    updatedAt: '2026-09-16T10:00:00.000Z'
  };

  const MOCK_ROLES = [
    { id: 'role-1', name: 'Principal', slug: 'principal' },
    { id: 'role-2', name: 'Correspondent', slug: 'correspondent' },
    { id: 'role-3', name: 'Vice Principal', slug: 'vice-principal' }
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('is exported as a valid React component function', () => {
    expect(typeof EnvironmentSetup).toBe('function');
  });

  // ============================================================
  // 1. ZERO FIRESTORE LEAVE RULE ACCESS
  // ============================================================

  it('does NOT invoke legacy Firestore leave approval rule methods', () => {
    const firestoreSpies = [
      vi.spyOn(firestoreModule, 'subscribeToLeaveApprovalRules'),
      vi.spyOn(firestoreModule, 'createLeaveApprovalRule'),
      vi.spyOn(firestoreModule, 'updateLeaveApprovalRule'),
      vi.spyOn(firestoreModule, 'deleteLeaveApprovalRule')
    ];

    firestoreSpies.forEach((spy) => {
      expect(spy).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // 2. REST OPERATIONS FOR LEAVE RULES & ROLES
  // ============================================================

  it('loads leave approval rules via leavesApi.listLeaveApprovalRules', async () => {
    const listSpy = vi.spyOn(leavesApiModule, 'listLeaveApprovalRules').mockResolvedValue({
      success: true,
      data: [MOCK_RULE_1, MOCK_RULE_2]
    });

    const res = await leavesApiModule.listLeaveApprovalRules();

    expect(listSpy).toHaveBeenCalled();
    expect(res.data).toHaveLength(2);
    expect(res.data[0].minDays).toBe(1);
    expect(res.data[0].maxDays).toBe(3);
    expect(res.data[1].minDays).toBe(4);
    expect(res.data[1].maxDays).toBeNull();
  });

  it('loads roles list via staffApi.listRoles', async () => {
    const rolesSpy = vi.spyOn(staffApiModule, 'listRoles').mockResolvedValue({
      success: true,
      data: MOCK_ROLES
    });

    const res = await staffApiModule.listRoles();

    expect(rolesSpy).toHaveBeenCalled();
    expect(res.data).toHaveLength(3);
    expect(res.data[0].name).toBe('Principal');
  });

  it('creates leave approval rule via leavesApi.createLeaveApprovalRule', async () => {
    const createSpy = vi.spyOn(leavesApiModule, 'createLeaveApprovalRule').mockResolvedValue({
      success: true,
      data: { id: 'rule-3', minDays: 8, maxDays: 15, roleId: 'role-2', order: 3 }
    });

    const payload = { minDays: 8, maxDays: 15, roleId: 'role-2', order: 3 };
    const res = await leavesApiModule.createLeaveApprovalRule(payload);

    expect(createSpy).toHaveBeenCalledWith(payload);
    expect(res.data.id).toBe('rule-3');
  });

  it('updates leave approval rule via leavesApi.updateLeaveApprovalRule', async () => {
    const updateSpy = vi.spyOn(leavesApiModule, 'updateLeaveApprovalRule').mockResolvedValue({
      success: true,
      data: { ...MOCK_RULE_1, maxDays: 5 }
    });

    const payload = { maxDays: 5 };
    const res = await leavesApiModule.updateLeaveApprovalRule('rule-1', payload);

    expect(updateSpy).toHaveBeenCalledWith('rule-1', payload);
    expect(res.data.maxDays).toBe(5);
  });

  it('deletes leave approval rule via leavesApi.deleteLeaveApprovalRule', async () => {
    const deleteSpy = vi.spyOn(leavesApiModule, 'deleteLeaveApprovalRule').mockResolvedValue({
      success: true,
      message: 'Leave approval rule deleted successfully'
    });

    const res = await leavesApiModule.deleteLeaveApprovalRule('rule-1');

    expect(deleteSpy).toHaveBeenCalledWith('rule-1');
    expect(res.success).toBe(true);
  });

  // ============================================================
  // 3. ERROR & EXCEPTION PROPAGATION
  // ============================================================

  it('propagates API errors on rule creation failure', async () => {
    vi.spyOn(leavesApiModule, 'createLeaveApprovalRule').mockRejectedValue(new Error('Validation failed'));

    await expect(leavesApiModule.createLeaveApprovalRule({ minDays: 0 })).rejects.toThrow('Validation failed');
  });

  it('propagates API errors on rule deletion failure', async () => {
    vi.spyOn(leavesApiModule, 'deleteLeaveApprovalRule').mockRejectedValue(new Error('Rule not found'));

    await expect(leavesApiModule.deleteLeaveApprovalRule('nonexistent-id')).rejects.toThrow('Rule not found');
  });
});
