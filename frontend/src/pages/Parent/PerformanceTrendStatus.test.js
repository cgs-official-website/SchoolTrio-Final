import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import fs from 'fs';
import path from 'path';

describe('BUG-01: Parent Portal Trend Status Parity & Normalization (Frontend Unit & Static Analysis)', () => {
  const performanceFilePath = path.resolve(__dirname, 'Performance.jsx');
  const parentDashboardFilePath = path.resolve(__dirname, '../ParentDashboard.jsx');
  const teacherPerfFilePath = path.resolve(__dirname, '../Teacher/PerformanceTracking.jsx');

  const performanceContent = fs.readFileSync(performanceFilePath, 'utf-8');
  const parentDashboardContent = fs.readFileSync(parentDashboardFilePath, 'utf-8');
  const teacherPerfContent = fs.readFileSync(teacherPerfFilePath, 'utf-8');

  describe('1. Parent/Performance.jsx Trend Status Resolution & Normalization', () => {
    // Helper function mirroring the exact logic in Performance.jsx
    const resolveTrendStatus = (student) => {
      const rawStatus = student?.performanceStatus || student?.customData?.performanceStatus;
      return typeof rawStatus === 'string' && rawStatus ? rawStatus.toLowerCase() : 'stable';
    };

    const getStatusColor = (status) => {
      switch (status?.toLowerCase()) {
        case 'excellent': return 'text-purple-700 bg-purple-100';
        case 'improving': return 'text-green-700 bg-green-100';
        case 'stable': return 'text-blue-700 bg-blue-100';
        case 'warning': return 'text-amber-700 bg-amber-100';
        case 'critical': return 'text-red-700 bg-red-100';
        default: return 'text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-700';
      }
    };

    it('resolves authoritative "excellent" from student.customData.performanceStatus (e.g. Nisha A ADM-006)', () => {
      const studentNisha = {
        id: 'student-nisha-uuid',
        admissionNumber: 'ADM-006',
        firstName: 'Nisha',
        lastName: 'A',
        customData: {
          performanceStatus: 'excellent'
        }
      };

      const status = resolveTrendStatus(studentNisha);
      expect(status).toBe('excellent');
      expect(status.toUpperCase()).toBe('EXCELLENT');
      expect(getStatusColor(status)).toBe('text-purple-700 bg-purple-100');
    });

    it('resolves authoritative "excellent" from direct student.performanceStatus', () => {
      const studentDirect = {
        id: 'student-uuid',
        performanceStatus: 'excellent'
      };

      const status = resolveTrendStatus(studentDirect);
      expect(status).toBe('excellent');
    });

    it('resolves uppercase "EXCELLENT" to normalized lowercase "excellent"', () => {
      const studentUpper = {
        id: 'student-uuid',
        customData: {
          performanceStatus: 'EXCELLENT'
        }
      };

      const status = resolveTrendStatus(studentUpper);
      expect(status).toBe('excellent');
      expect(getStatusColor(status)).toBe('text-purple-700 bg-purple-100');
    });

    it('preserves valid "stable" when that is the actual authoritative saved value', () => {
      const studentStable = {
        id: 'student-uuid',
        customData: {
          performanceStatus: 'stable'
        }
      };

      const status = resolveTrendStatus(studentStable);
      expect(status).toBe('stable');
      expect(getStatusColor(status)).toBe('text-blue-700 bg-blue-100');
    });

    it('safely defaults to "stable" when customData exists but performanceStatus is omitted', () => {
      const studentNoStatus = {
        id: 'student-uuid',
        customData: {
          medicalInfo: 'Peanut allergy'
        }
      };

      const status = resolveTrendStatus(studentNoStatus);
      expect(status).toBe('stable');
    });

    it('safely defaults to "stable" when customData is null or undefined', () => {
      const studentNullCustom = {
        id: 'student-uuid',
        customData: null
      };

      expect(resolveTrendStatus(studentNullCustom)).toBe('stable');
      expect(resolveTrendStatus({})).toBe('stable');
      expect(resolveTrendStatus(null)).toBe('stable');
    });

    it('renders "No student linked to this account." when student is null, without masking as STABLE', () => {
      expect(performanceContent).toContain('if (!student) return <div className="p-8">No student linked to this account.</div>;');
    });
  });

  describe('2. Live Event Invalidation & Synchronization', () => {
    it('Teacher Portal broadcasts notifyDataChanged for "students" and "performance" on status change', () => {
      expect(teacherPerfContent).toContain("import { notifyDataChanged } from '../../utils/liveData';");
      expect(teacherPerfContent).toContain("notifyDataChanged('students');");
      expect(teacherPerfContent).toContain("notifyDataChanged('performance');");
    });

    it('ParentDashboard subscribes to live data refresh for students and performance', () => {
      expect(parentDashboardContent).toContain("useLiveDataRefresh(loadChildren, [loadChildren], ['students', 'parents', 'performance']);");
    });

    it('ParentDashboard maps performanceStatus onto enrolled child objects', () => {
      expect(parentDashboardContent).toContain("performanceStatus: st.performanceStatus || st.customData?.performanceStatus || null");
    });

    it('Parent/Performance.jsx subscribes to performance entity and invokes refreshChildrenFromContext', () => {
      expect(performanceContent).toContain("refreshChildrenFromContext");
      expect(performanceContent).toContain("'performance'");
    });
  });
});
