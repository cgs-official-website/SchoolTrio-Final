import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  hydrateSelectedSubjectIds,
  sanitizeAssignmentPayload
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
