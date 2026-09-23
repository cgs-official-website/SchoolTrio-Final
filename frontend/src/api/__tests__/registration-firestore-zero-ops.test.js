import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Zero-Op Verification: Registration Flows (FRONTEND.C1)', () => {
  const targetFiles = [
    'src/pages/SchoolRegistration.jsx',
    'src/pages/TeacherRegistration.jsx',
    'src/pages/ParentRegistration.jsx',
    'src/api/registration.js'
  ];

  it('verifies 0 Firestore and Firebase Auth imports across all registration files', () => {
    const rootDir = process.cwd();

    targetFiles.forEach((relPath) => {
      const fullPath = path.resolve(rootDir, relPath);
      expect(fs.existsSync(fullPath), `File ${relPath} should exist`).toBe(true);

      const content = fs.readFileSync(fullPath, 'utf8');

      // Zero Firebase module imports
      expect(content).not.toMatch(/from\s+['"].*firebase.*['"]/);
      expect(content).not.toMatch(/from\s+['"]firebase\/firestore['"]/);
      expect(content).not.toMatch(/from\s+['"]firebase\/auth['"]/);

      // Zero Firestore SDK functions
      expect(content).not.toMatch(/\b(getDoc|getDocs|setDoc|addDoc|updateDoc|deleteDoc|onSnapshot|runTransaction|writeBatch)\b/);

      // Zero Firebase Auth SDK functions
      expect(content).not.toMatch(/\b(createUserWithEmailAndPassword|registerUser|signInWithEmailAndPassword)\b/);

      // Zero legacy Firestore helper imports
      expect(content).not.toMatch(/\b(createSchool|generateSchoolId|addSubDocument)\b/);
    });
  });

  it('confirms all registration files import from dedicated REST API clients', () => {
    const rootDir = process.cwd();

    const schoolContent = fs.readFileSync(path.resolve(rootDir, 'src/pages/SchoolRegistration.jsx'), 'utf8');
    expect(schoolContent).toContain("import { registerSchool } from '../api/registration'");
    expect(schoolContent).toContain("import { getPublicPlans } from '../api/billing'");

    const teacherContent = fs.readFileSync(path.resolve(rootDir, 'src/pages/TeacherRegistration.jsx'), 'utf8');
    expect(teacherContent).toContain("import { registerTeacher } from '../api/registration'");

    const parentContent = fs.readFileSync(path.resolve(rootDir, 'src/pages/ParentRegistration.jsx'), 'utf8');
    expect(parentContent).toContain("import { registerParent } from '../api/registration'");
  });
});
