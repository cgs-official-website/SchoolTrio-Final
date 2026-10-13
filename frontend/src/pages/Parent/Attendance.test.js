import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  formatSessionLabel,
  sortAttendanceRecords
} from './Attendance.jsx';

describe('BUG-ATT-001: Parent Portal FN/AN Attendance Display & Regression Suite', () => {
  const filePath = path.resolve(__dirname, 'Attendance.jsx');
  const fileContent = fs.readFileSync(filePath, 'utf-8');

  // ============================================================
  // 1. Session Label Formatting (formatSessionLabel)
  // ============================================================
  describe('1. Session Label Formatting (formatSessionLabel)', () => {
    it('maps "FN" to "Forenoon (FN)"', () => {
      expect(formatSessionLabel('FN')).toBe('Forenoon (FN)');
      expect(formatSessionLabel('fn')).toBe('Forenoon (FN)');
      expect(formatSessionLabel('Forenoon')).toBe('Forenoon (FN)');
      expect(formatSessionLabel('Forenoon (FN)')).toBe('Forenoon (FN)');
    });

    it('maps "AN" to "Afternoon (AN)"', () => {
      expect(formatSessionLabel('AN')).toBe('Afternoon (AN)');
      expect(formatSessionLabel('an')).toBe('Afternoon (AN)');
      expect(formatSessionLabel('Afternoon')).toBe('Afternoon (AN)');
      expect(formatSessionLabel('Afternoon (AN)')).toBe('Afternoon (AN)');
    });

    it('maps "STANDARD" to "Full Day"', () => {
      expect(formatSessionLabel('STANDARD')).toBe('Full Day');
      expect(formatSessionLabel('standard')).toBe('Full Day');
      expect(formatSessionLabel('Full Day')).toBe('Full Day');
    });

    it('safely handles missing, null, undefined, empty, or unexpected session values with fallback "Full Day"', () => {
      expect(formatSessionLabel(null)).toBe('Full Day');
      expect(formatSessionLabel(undefined)).toBe('Full Day');
      expect(formatSessionLabel('')).toBe('Full Day');
      expect(formatSessionLabel('   ')).toBe('Full Day');
      expect(formatSessionLabel(123)).toBe('Full Day');
      expect(formatSessionLabel({})).toBe('Full Day');
      expect(formatSessionLabel('UNKNOWN_CODE')).toBe('Full Day');
    });
  });

  // ============================================================
  // 2. Deterministic Sorting (sortAttendanceRecords)
  // ============================================================
  describe('2. Deterministic Sorting (sortAttendanceRecords)', () => {
    it('sorts newer dates before older dates', () => {
      const records = [
        { id: '1', date: '2026-10-10', session: 'FN' },
        { id: '2', date: '2026-10-12', session: 'FN' },
        { id: '3', date: '2026-10-11', session: 'FN' }
      ];

      const sorted = sortAttendanceRecords(records);
      expect(sorted.map(r => r.date)).toEqual(['2026-10-12', '2026-10-11', '2026-10-10']);
    });

    it('sorts Forenoon (FN) before Afternoon (AN) on the same date', () => {
      const records = [
        { id: 'rec-an', date: '2026-10-12', session: 'AN', status: 'Absent' },
        { id: 'rec-fn', date: '2026-10-12', session: 'FN', status: 'Present' }
      ];

      const sorted = sortAttendanceRecords(records);
      expect(sorted[0].id).toBe('rec-fn');
      expect(sorted[0].session).toBe('FN');
      expect(sorted[1].id).toBe('rec-an');
      expect(sorted[1].session).toBe('AN');
    });

    it('handles multi-date with multi-session records deterministically', () => {
      const records = [
        { id: '1-AN', date: '2026-10-11', session: 'AN' },
        { id: '2-AN', date: '2026-10-12', session: 'AN' },
        { id: '1-FN', date: '2026-10-11', session: 'FN' },
        { id: '2-FN', date: '2026-10-12', session: 'FN' }
      ];

      const sorted = sortAttendanceRecords(records);
      expect(sorted.map(r => r.id)).toEqual(['2-FN', '2-AN', '1-FN', '1-AN']);
    });

    it('places STANDARD/legacy records after FN and AN on the same date', () => {
      const records = [
        { id: 'rec-std', date: '2026-10-12', session: 'STANDARD' },
        { id: 'rec-an', date: '2026-10-12', session: 'AN' },
        { id: 'rec-fn', date: '2026-10-12', session: 'FN' }
      ];

      const sorted = sortAttendanceRecords(records);
      expect(sorted.map(r => r.id)).toEqual(['rec-fn', 'rec-an', 'rec-std']);
    });

    it('breaks ties stably by id for duplicate dates and sessions', () => {
      const records = [
        { id: 'rec-b', date: '2026-10-12', session: 'FN' },
        { id: 'rec-a', date: '2026-10-12', session: 'FN' }
      ];

      const sorted = sortAttendanceRecords(records);
      expect(sorted.map(r => r.id)).toEqual(['rec-a', 'rec-b']);
    });

    it('is immutable and does not mutate the source array in place', () => {
      const original = [
        { id: '1', date: '2026-10-10', session: 'AN' },
        { id: '2', date: '2026-10-12', session: 'FN' }
      ];
      const copy = [...original];

      const result = sortAttendanceRecords(original);

      expect(result).not.toBe(original);
      expect(original).toEqual(copy);
    });

    it('safely handles non-array inputs', () => {
      expect(sortAttendanceRecords(null)).toEqual([]);
      expect(sortAttendanceRecords(undefined)).toEqual([]);
      expect(sortAttendanceRecords('invalid')).toEqual([]);
    });
  });

  // ============================================================
  // 3. Status Integrity & Non-Merging Semantics
  // ============================================================
  describe('3. Status Integrity & Non-Merging Semantics', () => {
    it('preserves both records when FN is Present and AN is Absent on the same day', () => {
      const rawTimeline = [
        {
          id: 'rec-1',
          status: 'Present',
          session: { date: '2026-10-12', session: 'FN' }
        },
        {
          id: 'rec-2',
          status: 'Absent',
          session: { date: '2026-10-12', session: 'AN' }
        }
      ];

      const mappedRecords = rawTimeline.map(item => ({
        id: item.id,
        date: item.session?.date || item.date || '',
        status: item.status || 'PRESENT',
        session: item.session?.session || item.session || 'STANDARD'
      }));

      const sorted = sortAttendanceRecords(mappedRecords);

      expect(sorted).toHaveLength(2);
      expect(sorted[0].session).toBe('FN');
      expect(sorted[0].status).toBe('Present');
      expect(sorted[1].session).toBe('AN');
      expect(sorted[1].status).toBe('Absent');

      // Formatted labels are distinct
      expect(formatSessionLabel(sorted[0].session)).toBe('Forenoon (FN)');
      expect(formatSessionLabel(sorted[1].session)).toBe('Afternoon (AN)');
    });

    it('preserves Late status independently on individual sessions', () => {
      const records = [
        { id: 'rec-1', date: '2026-10-12', session: 'FN', status: 'Late' },
        { id: 'rec-2', date: '2026-10-12', session: 'AN', status: 'Present' }
      ];

      const sorted = sortAttendanceRecords(records);
      expect(sorted[0].status).toBe('Late');
      expect(sorted[1].status).toBe('Present');
    });
  });

  // ============================================================
  // 4. Observable Template Contracts & Structural Verification
  // ============================================================
  describe('4. Observable Template Contracts & Structural Verification', () => {
    it('verifies Attendance.jsx renders session badge alongside date', () => {
      expect(fileContent).toContain('data-testid={`session-badge-${record.id}`}');
      expect(fileContent).toContain('{formatSessionLabel(record.session)}');
    });

    it('verifies Attendance.jsx maps session from API with safe fallback', () => {
      expect(fileContent).toContain("session: item.session?.session || item.session || 'STANDARD'");
    });

    it('verifies Attendance.jsx applies sortAttendanceRecords on fetched data', () => {
      expect(fileContent).toContain('const sortedRecords = sortAttendanceRecords(records);');
      expect(fileContent).toContain('setAttendanceRecords(sortedRecords);');
    });

    it('verifies Attendance.jsx preserves status badges and color classes', () => {
      expect(fileContent).toContain('getStatusColor(record.status)');
      expect(fileContent).toContain('getStatusIcon(record.status)');
      expect(fileContent).toContain('normalizeStatus(record.status)');
    });

    it('verifies Attendance.jsx preserves date display formatting', () => {
      expect(fileContent).toContain('formatDateDisplay(record.date)');
    });

    it('verifies Attendance.jsx preserves active-child authorization scoping from outlet context', () => {
      expect(fileContent).toContain('const activeStudentIdFromContext = outletContext?.activeStudentId || outletContext?.activeChild?.id;');
      expect(fileContent).toContain('currentStudentRef.current !== targetStudentId');
    });

    it('verifies Attendance.jsx preserves loading, empty state, and error handling', () => {
      expect(fileContent).toContain('animate-spin rounded-full border-4 border-primary-600');
      expect(fileContent).toContain('No Records Found');
      expect(fileContent).toContain('No attendance records found for this period.');
      expect(fileContent).toContain('{error && (');
    });
  });
});
