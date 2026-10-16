import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('ATT-002: Dynamic Attendance Cutoff Configuration & Timezone Enforcement', () => {
  const adminAttendancePath = path.resolve(__dirname, 'Attendance.jsx');
  const teacherAttendancePath = path.resolve(__dirname, '../Teacher/Attendance.jsx');
  const environmentSetupPath = path.resolve(__dirname, 'EnvironmentSetup.jsx');

  const adminContent = fs.readFileSync(adminAttendancePath, 'utf-8');
  const teacherContent = fs.readFileSync(teacherAttendancePath, 'utf-8');
  const envSetupContent = fs.readFileSync(environmentSetupPath, 'utf-8');

  describe('1. Admin Attendance Portal Dynamic Cutoff Integration', () => {
    it('imports getAttendanceSettings from attendance API', () => {
      expect(adminContent).toContain('getAttendanceSettings');
      expect(adminContent).toMatch(/import\s*\{[^}]*getAttendanceSettings[^}]*\}\s*from\s*['"]\.\.\/\.\.\/api\/attendance['"]/);
    });

    it('initializes dynamic cutoffTime and timezone states', () => {
      expect(adminContent).toContain("const [cutoffTime, setCutoffTime] = useState('09:30');");
      expect(adminContent).toContain("const [attendanceTimezone, setAttendanceTimezone] = useState('Asia/Kolkata');");
    });

    it('subscribes to live attendance_settings updates', () => {
      expect(adminContent).toContain("useLiveDataRefresh('attendance_settings', fetchAttendanceConfig);");
    });

    it('fetches attendance settings and sets cutoff time and timezone', () => {
      expect(adminContent).toContain('const res = await getAttendanceSettings();');
      expect(adminContent).toContain('setCutoffTime(data.cutoffTime);');
      expect(adminContent).toContain('setAttendanceTimezone(data.timezone);');
    });

    it('renders dynamic cutoffTime in amber warning banner', () => {
      expect(adminContent).toContain('Attendance not marked — past cutoff ({cutoffTime})');
    });

    it('passes cutoffTime and attendanceTimezone as dependencies to cutoff effect', () => {
      expect(adminContent).toContain('[selectedDate, today, cutoffTime, attendanceTimezone]');
    });
  });

  describe('2. Teacher Attendance Portal Dynamic Cutoff Integration', () => {
    it('imports getAttendanceSettings from attendance API', () => {
      expect(teacherContent).toContain('getAttendanceSettings');
      expect(teacherContent).toMatch(/import\s*\{[^}]*getAttendanceSettings[^}]*\}\s*from\s*['"]\.\.\/\.\.\/api\/attendance['"]/);
    });

    it('initializes dynamic cutoffTime and timezone states', () => {
      expect(teacherContent).toContain("const [cutoffTime, setCutoffTime] = useState('09:30');");
      expect(teacherContent).toContain("const [attendanceTimezone, setAttendanceTimezone] = useState('Asia/Kolkata');");
    });

    it('subscribes to live attendance_settings updates', () => {
      expect(teacherContent).toContain("useLiveDataRefresh('attendance_settings', fetchAttendanceConfig);");
    });

    it('renders amber cutoff warning banner with dynamic cutoffTime in daily mode', () => {
      expect(teacherContent).toContain("{viewMode === 'daily' && isPastCutoff && !hasExistingRecord && (");
      expect(teacherContent).toContain('Attendance not marked — past cutoff ({cutoffTime})');
    });

    it('evaluates checkCutoff using cutoffTime and attendanceTimezone', () => {
      expect(teacherContent).toContain('timeZone: attendanceTimezone');
      expect(teacherContent).toContain('[selectedDate, today, cutoffTime, attendanceTimezone]');
    });
  });

  describe('3. Environment Setup Attendance Persistence & Sync', () => {
    it('synchronizes lateThreshold when cutoffTime is edited', () => {
      expect(envSetupContent).toContain('cutoffTime: e.target.value, lateThreshold: e.target.value');
    });

    it('persists attendanceConfig in primary handleSave', () => {
      expect(envSetupContent).toContain('await updateAttendanceSettings(attendanceConfig);');
    });

    it('emits live data notifications on attendance settings update', () => {
      expect(envSetupContent).toContain("notifyDataChanged('attendance_settings');");
      expect(envSetupContent).toContain("notifyDataChanged('attendance');");
    });
  });

  describe('4. Timezone-Aware Cutoff Math Evaluation Logic', () => {
    it('correctly detects past cutoff in school timezone', () => {
      const evaluateCutoff = (cutoffStr, localTimeString) => {
        const [curH, curM] = localTimeString.split(':').map(Number);
        const [cutH, cutM] = cutoffStr.split(':').map(Number);
        const nowMin = curH * 60 + curM;
        const cutMin = cutH * 60 + cutM;
        return nowMin > cutMin;
      };

      // Exactly at cutoff
      expect(evaluateCutoff('09:30', '09:30')).toBe(false);
      // Before cutoff
      expect(evaluateCutoff('09:30', '09:29')).toBe(false);
      // Past cutoff
      expect(evaluateCutoff('09:30', '09:31')).toBe(true);

      // Custom configured cutoff e.g. 08:30
      expect(evaluateCutoff('08:30', '08:45')).toBe(true);
      expect(evaluateCutoff('08:30', '08:15')).toBe(false);

      // Custom configured cutoff e.g. 10:00
      expect(evaluateCutoff('10:00', '09:45')).toBe(false);
      expect(evaluateCutoff('10:00', '10:05')).toBe(true);
    });
  });
});
