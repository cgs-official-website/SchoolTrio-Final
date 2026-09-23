import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Zero-Op Verification: Teacher Performance Tracking (FRONTEND.C6)', () => {
  const targetFiles = [
    'src/pages/Teacher/PerformanceTracking.jsx'
  ];

  it('verifies 0 Firestore imports and zero Firestore access in PerformanceTracking.jsx', () => {
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
    });
  });

  it('confirms PerformanceTracking.jsx imports from dedicated REST API client', () => {
    const rootDir = process.cwd();

    const pageContent = fs.readFileSync(
      path.resolve(rootDir, 'src/pages/Teacher/PerformanceTracking.jsx'),
      'utf8'
    );
    expect(pageContent).toContain("from '../../api/students'");
    expect(pageContent).toContain('listStudents');
    expect(pageContent).toContain('updateStudentPerformanceStatus');
  });
});
