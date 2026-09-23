import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Zero-Op Verification: Global Platform Branding Flows (FRONTEND.C3)', () => {
  const targetFiles = [
    'src/pages/SuperAdmin/BrandingSettings.jsx',
    'src/api/platformBranding.js'
  ];

  it('verifies 0 Firestore imports and zero Firestore access across all platform branding files', () => {
    const rootDir = process.cwd();

    targetFiles.forEach((relPath) => {
      const fullPath = path.resolve(rootDir, relPath);
      expect(fs.existsSync(fullPath), `File ${relPath} should exist`).toBe(true);

      const content = fs.readFileSync(fullPath, 'utf8');

      // Zero Firebase module imports
      expect(content).not.toMatch(/from\s+['"].*firebase.*['"]/);
      expect(content).not.toMatch(/from\s+['"]firebase\/firestore['"]/);

      // Zero Firestore SDK functions
      expect(content).not.toMatch(
        /\b(getDoc|getDocs|setDoc|addDoc|updateDoc|deleteDoc|onSnapshot|runTransaction|writeBatch)\b/
      );

      // Zero Firestore collection/document paths
      expect(content).not.toMatch(/settings\/branding/);
      expect(content).not.toMatch(/settings\/platform/);
      expect(content).not.toMatch(/doc\(\s*db\s*,/);
    });
  });

  it('confirms BrandingSettings.jsx imports from dedicated REST API client', () => {
    const rootDir = process.cwd();

    const pageContent = fs.readFileSync(
      path.resolve(rootDir, 'src/pages/SuperAdmin/BrandingSettings.jsx'),
      'utf8'
    );
    expect(pageContent).toContain("from '../../api/platformBranding'");
    expect(pageContent).toContain('getPlatformBranding');
    expect(pageContent).toContain('updatePlatformBranding');
    expect(pageContent).toContain('resetPlatformBranding');
  });
});
