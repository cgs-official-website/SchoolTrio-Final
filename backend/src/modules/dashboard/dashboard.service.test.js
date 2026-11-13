import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as dashboardService from './dashboard.service.js';
import * as geminiService from '../../services/gemini.service.js';

describe('Dashboard AI Briefing Service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Deterministic Fallback Logic', () => {
    it('generates a full administrative briefing for unrestricted admin', () => {
      const briefing = dashboardService.getDeterministicBriefing({
        role: 'admin',
        userName: 'School Principal',
        permittedModules: 'ALL',
        stats: { students: 120, classes: 8, pendingAttendance: 2, feeCollectedPct: 88 }
      });

      expect(briefing.greeting).toContain('School Principal');
      expect(briefing.headline).toBe("Today's School Operations Summary");
      expect(briefing.highlights.length).toBeGreaterThanOrEqual(2);
      expect(briefing.highlights[0]).toContain('120 students across 8 active classes');
      expect(briefing.highlights[1]).toContain('2 class attendance session(s) pending');
      expect(briefing.quickActions.some(a => a.path === '/admin/attendance')).toBe(true);
      expect(briefing.isAiGenerated).toBe(false);
    });

    it('teacher with no periods today is told there are no periods (never "classes ready")', () => {
      const briefing = dashboardService.getDeterministicBriefing({
        role: 'teacher',
        userName: 'Ruby R',
        permittedModules: ['classes', 'attendance'],
        portal: 'teacher',
        stats: { todayName: 'Friday', todayTeachingPeriodsCount: 0, todayTeachingPeriods: [], classTeacherOfCount: 1 }
      });

      expect(briefing.greeting).toContain('Ruby R');
      expect(briefing.headline).toBe("Today's Academic & Classroom Focus");
      expect(briefing.highlights.some(h => h.includes('no teaching periods scheduled today'))).toBe(true);
      expect(briefing.highlights.some(h => /ready/i.test(h))).toBe(false);
      expect(briefing.quickActions.some(a => a.path === '/teacher/attendance')).toBe(true);
      expect(briefing.isAiGenerated).toBe(false);
    });

    it('teacher with periods today sees the real count and subjects', () => {
      const facts = dashboardService.buildVerifiedFacts({
        role: 'teacher',
        portal: 'teacher',
        stats: { todayName: 'Monday', todayTeachingPeriodsCount: 1, todayTeachingPeriods: ['English | VI-A | 09:50-10:40'], classTeacherOfCount: 1 }
      });
      expect(facts[0]).toContain('1 teaching period(s) scheduled today (Monday)');
      expect(facts[0]).toContain('English | VI-A');
    });

    it('teacher does not talk about today when the timetable could not be loaded', () => {
      const briefing = dashboardService.getDeterministicBriefing({
        role: 'teacher',
        userName: 'Ruby R',
        permittedModules: 'ALL',
        portal: 'teacher',
        stats: { timetableUnavailable: true, classTeacherOfCount: 1 }
      });
      expect(briefing.highlights[0]).toContain('Open your timetable');
      expect(briefing.highlights.some(h => /scheduled today/.test(h))).toBe(false);
    });

    it('parent briefing uses the real attendance and fee data of the child', () => {
      const briefing = dashboardService.getDeterministicBriefing({
        role: 'parent',
        userName: 'Parent User',
        permittedModules: [],
        portal: 'parent',
        stats: {
          studentName: 'Arun',
          attendanceLoaded: true, attendanceTotal: 20, attendancePresent: 18, attendanceLate: 1, attendanceAbsent: 1, attendancePercentage: 95,
          feesLoaded: true, unpaidFeesCount: 0, overdueFeesCount: 0, totalUnpaidAmount: 0
        }
      });
      expect(briefing.highlights[0]).toContain('Arun');
      expect(briefing.highlights[0]).toContain('95%');
      expect(briefing.highlights[1]).toContain('no pending fee dues');
    });

    it('generates fee and finance-focused briefing for Finance/Accountant Staff', () => {
      const briefing = dashboardService.getDeterministicBriefing({
        role: 'staff',
        userName: 'Finance Manager',
        permittedModules: ['fees', 'hr-payroll'],
        stats: { feeCollectedPct: 75, payrollProcessed: true }
      });

      expect(briefing.greeting).toContain('Finance Manager');
      expect(briefing.headline).toBe('Finance & Accounts Daily Overview');
      expect(briefing.highlights.some(h => h.includes('75%'))).toBe(true);
      expect(briefing.highlights.some(h => h.includes('payroll cycle'))).toBe(true);
      expect(briefing.quickActions.some(a => a.path === '/admin/fees')).toBe(true);
    });

    it('generates child-focused briefing for Parent', () => {
      const briefing = dashboardService.getDeterministicBriefing({
        role: 'parent',
        userName: 'Parent User',
        permittedModules: [],
        stats: {}
      });

      expect(briefing.greeting).toContain('Parent User');
      expect(briefing.headline).toBe('Child Progress & School Updates');
      expect(briefing.quickActions.some(a => a.path === '/parent/attendance')).toBe(true);
    });
  });

  describe('AI answer must match the real data', () => {
    const teacherStats = { todayName: 'Friday', todayTeachingPeriodsCount: 0, todayTeachingPeriods: [], classTeacherOfCount: 1 };

    it('rejects an AI answer that claims a class today when the timetable is empty', async () => {
      vi.spyOn(geminiService, 'generateGeminiContent').mockResolvedValue({
        greeting: 'Good morning',
        headline: 'You have 1 assigned class ready for your instruction today.',
        highlights: ['You have 1 assigned class ready for your instruction today.'],
        quickActions: [{ label: 'View Timetable', path: '/teacher/timetable', type: 'primary' }]
      });

      const briefing = await dashboardService.generateBriefing('school-1', { role: 'teacher', fullName: 'Ruby R' }, {
        portal: 'teacher', permittedModules: 'ALL', stats: teacherStats
      });

      expect(briefing.isAiGenerated).toBe(false);
      expect(briefing.highlights.some(h => h.includes('no teaching periods scheduled today'))).toBe(true);
    });

    it('accepts an AI answer that matches the real data', async () => {
      vi.spyOn(geminiService, 'generateGeminiContent').mockResolvedValue({
        greeting: 'Good morning, Ruby R',
        headline: 'A quiet Friday with no teaching periods.',
        highlights: ['You have no teaching periods scheduled today (Friday).', 'You are the class teacher of 1 class.'],
        quickActions: [{ label: 'View Timetable', path: '/teacher/timetable', type: 'primary' }]
      });

      const briefing = await dashboardService.generateBriefing('school-1', { role: 'teacher', fullName: 'Ruby R' }, {
        portal: 'teacher', permittedModules: 'ALL', stats: teacherStats
      });

      expect(briefing.isAiGenerated).toBe(true);
    });

    it('rejects invented numbers in a parent briefing', async () => {
      vi.spyOn(geminiService, 'generateGeminiContent').mockResolvedValue({
        greeting: 'Hello',
        headline: 'Attendance is excellent at 99%.',
        highlights: ['All good.'],
        quickActions: [{ label: 'Attendance', path: '/parent/attendance', type: 'primary' }]
      });

      const briefing = await dashboardService.generateBriefing('school-1', { role: 'parent', fullName: 'Parent User' }, {
        portal: 'parent', permittedModules: [],
        stats: { studentName: 'Arun', attendanceLoaded: true, attendanceTotal: 20, attendancePresent: 18, attendanceLate: 1, attendanceAbsent: 1, attendancePercentage: 95 }
      });

      expect(briefing.isAiGenerated).toBe(false);
      expect(briefing.highlights[0]).toContain('95%');
    });
  });

  describe('generateBriefing integration with Gemini & Fallback', () => {
    it('returns AI response when Gemini succeeds', async () => {
      vi.spyOn(geminiService, 'generateGeminiContent').mockResolvedValue({
        greeting: 'Good morning, Admin',
        headline: 'School operations running at 98% efficiency today.',
        highlights: [
          'All 15 sections logged morning attendance.',
          'Term 2 fee collection reached target.'
        ],
        quickActions: [
          { label: 'View Invoices', path: '/admin/fees', type: 'primary' }
        ]
      });

      const briefing = await dashboardService.generateBriefing('school-1', { role: 'admin', fullName: 'Principal' }, {
        permittedModules: 'ALL',
        stats: { students: 200 }
      });

      expect(briefing.isAiGenerated).toBe(true);
      expect(briefing.headline).toBe('School operations running at 98% efficiency today.');
      expect(briefing.highlights).toHaveLength(2);
      expect(briefing.quickActions[0].path).toBe('/admin/fees');
    });

    it('gracefully falls back to deterministic briefing when Gemini throws an error', async () => {
      vi.spyOn(geminiService, 'generateGeminiContent').mockRejectedValue(new Error('Network timeout'));

      const briefing = await dashboardService.generateBriefing('school-1', { role: 'staff', fullName: 'Accountant' }, {
        permittedModules: ['fees'],
        stats: { feeCollectedPct: 82 }
      });

      expect(briefing.isAiGenerated).toBe(false);
      expect(briefing.headline).toBe('Finance & Accounts Daily Overview');
      expect(briefing.highlights.some(h => h.includes('82%'))).toBe(true);
    });
  });
});

