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

    it('generates class/attendance-focused briefing for Grade Coordinator or Teacher', () => {
      const briefing = dashboardService.getDeterministicBriefing({
        role: 'teacher',
        userName: 'Ruby R',
        permittedModules: ['classes', 'attendance'],
        stats: { assignedClassesCount: 3, noticesCount: 2 }
      });

      expect(briefing.greeting).toContain('Ruby R');
      expect(briefing.headline).toBe("Today's Academic & Classroom Focus");
      expect(briefing.highlights.some(h => h.includes('3 class unit(s) assigned'))).toBe(true);
      expect(briefing.quickActions.some(a => a.path === '/teacher/attendance')).toBe(true);
      expect(briefing.isAiGenerated).toBe(false);
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

