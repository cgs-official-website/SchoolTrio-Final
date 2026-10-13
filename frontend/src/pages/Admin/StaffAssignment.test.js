import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  hydrateSelectedSubjectIds,
  sanitizeAssignmentPayload,
  normalizeStaffMember,
  getStaffStatusBadgeClass,
  canDeactivateStaff,
  canReactivateStaff
} from './StaffAssignment.jsx';

describe('BUG-002: Frontend Staff Assignment Stale Subject ID Fix & Regression Tests', () => {
  const filePath = path.resolve(__dirname, 'StaffAssignment.jsx');
  const fileContent = fs.readFileSync(filePath, 'utf-8');

  const validSubject1 = { id: '11111111-1111-4111-8111-111111111111', name: 'Mathematics', code: 'MATH' };
  const validSubject2 = { id: '22222222-2222-4222-8222-222222222222', name: 'Physics', code: 'PHYS' };
  const authoritativeSubjects = [validSubject1, validSubject2];

  const staleSubjectId1 = 'deadbeef-0000-0000-0000-000000000001';
  const staleSubjectId2 = 'deadbeef-0000-0000-0000-000000000002';

  describe('1. Safe Assignment Modal Hydration (hydrateSelectedSubjectIds)', () => {
    it('removes stale historical subject IDs from editable selection after authoritative subject loading', () => {
      const staffMember = {
        id: 'staff-1',
        name: 'Teacher Guru',
        assignedSubjectIds: [staleSubjectId1, validSubject1.id, staleSubjectId2]
      };

      const result = hydrateSelectedSubjectIds(staffMember, authoritativeSubjects, true);

      // Only validSubject1 should survive; staleSubjectId1 and staleSubjectId2 must be purged
      expect(result).toEqual([validSubject1.id]);
      expect(result).not.toContain(staleSubjectId1);
      expect(result).not.toContain(staleSubjectId2);
    });

    it('deduplicates canonical subject IDs', () => {
      const staffMember = {
        id: 'staff-1',
        assignedSubjectIds: [validSubject1.id, validSubject1.id, validSubject2.id, validSubject1.id]
      };

      const result = hydrateSelectedSubjectIds(staffMember, authoritativeSubjects, true);

      expect(result).toEqual([validSubject1.id, validSubject2.id]);
    });

    it('supports staffMember.assignments.assignedSubjectIds shape', () => {
      const staffMember = {
        id: 'staff-2',
        assignments: {
          assignedSubjectIds: [staleSubjectId1, validSubject2.id]
        }
      };

      const result = hydrateSelectedSubjectIds(staffMember, authoritativeSubjects, true);

      expect(result).toEqual([validSubject2.id]);
    });

    it('supports staffMember.customData.assignments.assignedSubjectIds shape', () => {
      const staffMember = {
        id: 'staff-3',
        customData: {
          assignments: {
            assignedSubjectIds: [staleSubjectId1, validSubject1.id, validSubject2.id]
          }
        }
      };

      const result = hydrateSelectedSubjectIds(staffMember, authoritativeSubjects, true);

      expect(result).toEqual([validSubject1.id, validSubject2.id]);
    });

    it('does not treat an empty subject list as authoritative when still loading or errored', () => {
      const staffMember = {
        id: 'staff-4',
        assignedSubjectIds: [validSubject1.id, validSubject2.id]
      };

      // When isAuthoritative is false (e.g. subjects still loading or fetch errored),
      // raw IDs must NOT be prematurely erased
      const result = hydrateSelectedSubjectIds(staffMember, [], false);

      expect(result).toEqual([validSubject1.id, validSubject2.id]);
    });
  });

  describe('2. Safe Save Payload Construction (sanitizeAssignmentPayload)', () => {
    it('submits only valid, deduplicated subject IDs present in authoritative list', () => {
      const selectedSubjectIds = [validSubject1.id, staleSubjectId1, validSubject1.id, staleSubjectId2];
      const selectedSubjectClassIds = ['class-1', 'class-1', 'class-2'];
      const selectedClassId = 'class-1';

      const payload = sanitizeAssignmentPayload(
        selectedSubjectIds,
        authoritativeSubjects,
        selectedSubjectClassIds,
        selectedClassId
      );

      expect(payload).toEqual({
        assignedClassId: 'class-1',
        assignedSubjectIds: [validSubject1.id],
        subjectClassIds: ['class-1', 'class-2']
      });
      expect(payload.assignedSubjectIds).not.toContain(staleSubjectId1);
      expect(payload.assignedSubjectIds).not.toContain(staleSubjectId2);
    });

    it('succeeds with empty assignedSubjectIds when clearing all subjects', () => {
      const payload = sanitizeAssignmentPayload([], authoritativeSubjects, [], null);

      expect(payload).toEqual({
        assignedClassId: null,
        assignedSubjectIds: [],
        subjectClassIds: []
      });
    });

    it('never filters subjects against class ID since subjects are tenant-wide entities', () => {
      const payload = sanitizeAssignmentPayload(
        [validSubject1.id, validSubject2.id],
        authoritativeSubjects,
        ['unrelated-class-id'],
        'different-class-id'
      );

      // Both subjects remain intact regardless of class associations
      expect(payload.assignedSubjectIds).toEqual([validSubject1.id, validSubject2.id]);
    });
  });

  describe('3. StaffAssignment.jsx Lifecycle & Tenant Isolation Static Guarantees', () => {
    it('guards handleAssign against unready subjects, errors, and tenant mismatch', () => {
      expect(fileContent).toContain('if (!subjectsLoaded || Boolean(subjectsError) || activeTenantId !== schoolId)');
      expect(fileContent).toContain('Subject list is still loading or unavailable for the current institution.');
    });

    it('invalidates old subject data and resets selection state on tenant switch', () => {
      expect(fileContent).toContain('latestTenantIdRef.current = schoolId;');
      expect(fileContent).toContain('setSubjects([]);');
      expect(fileContent).toContain('setSubjectsLoaded(false);');
      expect(fileContent).toContain('setSubjectsLoading(false);');
      expect(fileContent).toContain('setSubjectsError(null);');
      expect(fileContent).toContain('setActiveTenantId(null);');
      expect(fileContent).toContain('setSelectedStaff(null);');
      expect(fileContent).toContain('setSelectedSubjectIds([]);');
      expect(fileContent).toContain('setAssignModalOpen(false);');
    });

    it('guards against late responses from a previous tenant overwriting current state', () => {
      expect(fileContent).toContain('const currentFetchTenantId = schoolId;');
      expect(fileContent).toContain('if (currentFetchTenantId !== latestTenantIdRef.current)');
    });

    it('reconciles modal selections automatically when authoritative subjects finish loading', () => {
      expect(fileContent).toContain('hydrateSelectedSubjectIds({ assignedSubjectIds: prev }, subjects, true)');
    });

    it('disables save button and displays UI indicators during subject loading or errors', () => {
      expect(fileContent).toContain('disabled={saving || classes.length === 0 || !subjectsLoaded || Boolean(subjectsError)}');
      expect(fileContent).toContain('Loading subjects...');
      expect(fileContent).toContain('Failed to load subjects. Please refresh the page.');
    });
  });
});

describe('SD-DEL-001: Staff Directory Deactivation Workflow & Regression Tests', () => {
  const filePath = path.resolve(__dirname, 'StaffAssignment.jsx');
  const fileContent = fs.readFileSync(filePath, 'utf-8');

  describe('1. Staff Status Visibility & Badge Design System (getStaffStatusBadgeClass)', () => {
    it('returns emerald badge styling for Active staff', () => {
      const activeClass = getStaffStatusBadgeClass('Active');
      expect(activeClass).toContain('bg-emerald-50');
      expect(activeClass).toContain('text-emerald-700');
    });

    it('returns slate badge styling for Inactive staff', () => {
      const inactiveClass = getStaffStatusBadgeClass('Inactive');
      expect(inactiveClass).toContain('bg-slate-100');
      expect(inactiveClass).toContain('text-slate-600');
    });

    it('handles case-insensitive values and defaults empty/null status to Active', () => {
      expect(getStaffStatusBadgeClass('active')).toContain('text-emerald-700');
      expect(getStaffStatusBadgeClass('inactive')).toContain('text-slate-600');
      expect(getStaffStatusBadgeClass(null)).toContain('text-emerald-700');
      expect(getStaffStatusBadgeClass(undefined)).toContain('text-emerald-700');
    });

    it('normalizes staff profile status from authoritative backend payload', () => {
      const activeMember = normalizeStaffMember({ id: 's-1', name: 'Alice', status: 'Active' });
      expect(activeMember.status).toBe('Active');

      const inactiveMember = normalizeStaffMember({ id: 's-2', name: 'Bob', status: 'Inactive' });
      expect(inactiveMember.status).toBe('Inactive');

      const unstatedMember = normalizeStaffMember({ id: 's-3', name: 'Charlie' });
      expect(unstatedMember.status).toBe('Active');
    });
  });

  describe('2. Action Eligibility & RBAC Permission Guards (canDeactivateStaff, canReactivateStaff)', () => {
    const activeStaff = { id: 's-1', name: 'Alice', status: 'Active' };
    const inactiveStaff = { id: 's-2', name: 'Bob', status: 'Inactive' };

    it('allows deactivating active staff when user has edit permission', () => {
      expect(canDeactivateStaff(activeStaff, true)).toBe(true);
      expect(canDeactivateStaff(inactiveStaff, true)).toBe(false);
    });

    it('allows reactivating inactive staff when user has edit permission', () => {
      expect(canReactivateStaff(inactiveStaff, true)).toBe(true);
      expect(canReactivateStaff(activeStaff, true)).toBe(false);
    });

    it('blocks deactivation and reactivation when user lacks edit permission (RBAC enforcement)', () => {
      expect(canDeactivateStaff(activeStaff, false)).toBe(false);
      expect(canReactivateStaff(inactiveStaff, false)).toBe(false);
    });

    it('guards against null or undefined member objects safely', () => {
      expect(canDeactivateStaff(null, true)).toBe(false);
      expect(canReactivateStaff(null, true)).toBe(false);
      expect(canDeactivateStaff(undefined, true)).toBe(false);
      expect(canReactivateStaff(undefined, true)).toBe(false);
    });
  });

  describe('3. Template Guarantees: Table Row, Action Buttons, and Status Visibility', () => {
    it('renders the status badge in the table name column with authoritative status', () => {
      expect(fileContent).toContain('getStaffStatusBadgeClass(member.status)');
      expect(fileContent).toContain('{member.status || \'Active\'}');
      expect(fileContent).toContain('data-testid={`staff-status-${member.id}`}');
    });

    it('renders Deactivate icon button for active staff guarded by canDeactivateStaff', () => {
      expect(fileContent).toContain('canDeactivateStaff(member, hasEditPermission) && (');
      expect(fileContent).toContain('title="Deactivate Staff Member"');
      expect(fileContent).toContain('<UserX size={18} />');
    });

    it('renders Reactivate icon button for inactive staff guarded by canReactivateStaff', () => {
      expect(fileContent).toContain('canReactivateStaff(member, hasEditPermission) && (');
      expect(fileContent).toContain('title="Reactivate Staff Member"');
      expect(fileContent).toContain('<UserCheck size={18} />');
    });

    it('preserves existing permanent deletion button guarded by hasDeletePermission', () => {
      expect(fileContent).toContain('hasDeletePermission && (');
      expect(fileContent).toContain('title="Delete Staff Member"');
      expect(fileContent).toContain('<Trash size={18} />');
    });
  });

  describe('4. Confirmation Modal & Deactivation Submission Contracts', () => {
    it('sets confirmStatusModalState with targetStatus Inactive on deactivate click', () => {
      expect(fileContent).toContain("targetStatus: 'Inactive'");
    });

    it('sets confirmStatusModalState with targetStatus Active on reactivate click', () => {
      expect(fileContent).toContain("targetStatus: 'Active'");
    });

    it('cancelling confirmation modal closes modal without calling API', () => {
      expect(fileContent).toContain("onClose={() => setConfirmStatusModalState({ isOpen: false, id: null, name: '', targetStatus: 'Inactive' })}");
      expect(fileContent).toContain("onCancel={() => setConfirmStatusModalState({ isOpen: false, id: null, name: '', targetStatus: 'Inactive' })}");
    });

    it('handleUpdateStaffStatus submits authoritative { status: targetStatus } to updateStaff API', () => {
      expect(fileContent).toContain('const handleUpdateStaffStatus = async (staffId, targetStatus) => {');
      expect(fileContent).toContain('await updateStaff(staffId, { status: targetStatus });');
    });

    it('handleUpdateStaffStatus refreshes live data and re-fetches staff upon success', () => {
      expect(fileContent).toContain("toast.success(`Staff member ${targetStatus === 'Inactive' ? 'deactivated' : 'reactivated'} successfully!`);");
      expect(fileContent).toContain("notifyDataChanged('staff');");
      expect(fileContent).toContain('await fetchStaffData();');
    });

    it('explains account access revocation and history preservation in confirmation dialog message', () => {
      expect(fileContent).toContain('Deactivating this staff member will immediately prevent account login and access, while preserving historical payroll, timetable, chat, and other institutional records.');
      expect(fileContent).toContain('Reactivating will restore account access, subject to the application\'s existing authorization and account rules.');
    });
  });

  describe('5. Blocked Delete (409 Conflict) Graceful Recovery Flow', () => {
    it('detects 409 deletion conflict in handleDeleteStaff and closes the delete confirmation modal', () => {
      expect(fileContent).toContain("const isConflict = error.status === 409 ||");
      expect(fileContent).toContain("error.message?.includes('409') ||");
      expect(fileContent).toContain("error.message?.toLowerCase().includes('cannot delete')");
      expect(fileContent).toContain("setConfirmDeleteState({ isOpen: false, id: null, name: '' });");
    });

    it('opens deleteConflictState modal with target metadata and reason', () => {
      expect(fileContent).toContain('setDeleteConflictState({');
      expect(fileContent).toContain('isOpen: true,');
      expect(fileContent).toContain('id: staffId,');
      expect(fileContent).toContain('name: targetName,');
      expect(fileContent).toContain('isAlreadyInactive,');
    });

    it('offers clearly labeled "Deactivate Instead" button when target is Active and user has edit permissions', () => {
      expect(fileContent).toContain('confirmText={(!deleteConflictState.isAlreadyInactive && hasEditPermission) ? "Deactivate Instead" : "Close"}');
      expect(fileContent).toContain('cancelText={(!deleteConflictState.isAlreadyInactive && hasEditPermission) ? "Cancel" : "Dismiss"}');
    });

    it('selecting "Deactivate Instead" routes to explicit deactivation confirmation before executing API call', () => {
      expect(fileContent).toContain('setDeleteConflictState({ isOpen: false, id: null, name: \'\', isAlreadyInactive: false, reason: \'\' });');
      expect(fileContent).toContain('setConfirmStatusModalState({');
      expect(fileContent).toContain('isOpen: true,');
      expect(fileContent).toContain('targetStatus: \'Inactive\'');
    });

    it('does not offer "Deactivate Instead" when target is already Inactive to prevent redundant requests', () => {
      expect(fileContent).toContain('deleteConflictState.isAlreadyInactive');
      expect(fileContent).toContain('This account is already Inactive and cannot access the system.');
    });

    it('handles non-409 errors without triggering conflict resolution modal', () => {
      expect(fileContent).toContain('toast.error(error.message || "Failed to delete staff member.");');
    });
  });
});

