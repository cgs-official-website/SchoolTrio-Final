import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Zero-Op Verification: Link Generator Staff Form Config (FRONTEND.C5)', () => {
  const targetFiles = [
    'src/pages/Admin/LinkGenerator.jsx'
  ];

  it('verifies 0 Firestore imports and zero Firestore access in LinkGenerator.jsx', () => {
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

      // Zero Firestore doc/collection references
      expect(content).not.toMatch(/doc\(\s*db\s*,/);
      expect(content).not.toMatch(/staffFormConfig.*doc\(/);
    });
  });

  it('confirms LinkGenerator.jsx uses dedicated REST API client', () => {
    const rootDir = process.cwd();

    const pageContent = fs.readFileSync(
      path.resolve(rootDir, 'src/pages/Admin/LinkGenerator.jsx'),
      'utf8'
    );
    expect(pageContent).toContain("from '../../api/settings'");
    expect(pageContent).toContain('getSchoolSettings');
    expect(pageContent).toContain('updateSchoolSettings');
  });
});
