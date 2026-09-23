import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Settings Frontend Firestore Zero-Op Audit (Phase SETTINGS.3)', () => {
  const migratedFiles = [
    'src/api/settings.js',
    'src/pages/Admin/EnvironmentSetup.jsx',
    'src/pages/Admin/APIIntegrations.jsx',
    'src/utils/cloudinary.js',
    'src/hooks/useSchoolBranding.js',
    'src/pages/TeacherRegistration.jsx',
    'src/pages/ParentRegistration.jsx',
  ];

  it('confirms 0 Firestore school settings reads/writes in migrated settings components', () => {
    const rootDir = process.cwd();

    migratedFiles.forEach((relPath) => {
      const fullPath = path.resolve(rootDir, relPath);
      expect(fs.existsSync(fullPath), `File ${relPath} should exist`).toBe(true);

      const content = fs.readFileSync(fullPath, 'utf8');

      // Verify no direct Firestore calls to schools/{id}/settings/sidebar or schools/{id}
      expect(content).not.toMatch(/doc\(\s*db\s*,\s*['"]schools['"]/);
      expect(content).not.toMatch(/getDoc\(\s*doc\(\s*db\s*,\s*['"]schools['"]/);
      expect(content).not.toMatch(/updateSchool\(/);
      expect(content).not.toMatch(/getSchool\(/);
      expect(content).not.toMatch(/updateSchoolAPIKeys\(/);
      expect(content).not.toMatch(/schools\/.*\/settings\/sidebar/);
    });
  });

  it('confirms AdminDashboard uses REST for school settings and sidebar', () => {
    const rootDir = process.cwd();
    const dashboardPath = path.resolve(rootDir, 'src/pages/AdminDashboard.jsx');
    const content = fs.readFileSync(dashboardPath, 'utf8');

    expect(content).not.toMatch(/doc\(\s*db\s*,\s*['"]schools['"]/);
    expect(content).not.toMatch(/schools\/.*\/settings\/sidebar/);
    expect(content).toContain('getSchoolSettings');
    expect(content).toContain('getSidebarSettings');
  });

  it('confirms TeacherDashboard uses REST for school settings', () => {
    const rootDir = process.cwd();
    const dashboardPath = path.resolve(rootDir, 'src/pages/TeacherDashboard.jsx');
    const content = fs.readFileSync(dashboardPath, 'utf8');

    expect(content).not.toMatch(/onSnapshot\(\s*doc\(\s*db\s*,\s*['"]schools['"]/);
    expect(content).toContain('getSchoolSettings');
  });
});
