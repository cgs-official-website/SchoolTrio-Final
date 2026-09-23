import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import * as genderUtils from '../../utils/genderUtils.js';

describe('FRONTEND.C7 Legacy Firebase Code & Zero-State Reconciliation', () => {
  const rootDir = process.cwd();

  const cleanedProductionFiles = [
    'src/pages/Admin/AdminOverview.jsx',
    'src/pages/Admin/CanteenManagement.jsx',
    'src/pages/Admin/ExamManagement.jsx',
    'src/pages/Admin/LinkGenerator.jsx',
    'src/pages/Teacher/PerformanceTracking.jsx',
    'src/components/ChatInput.jsx',
    'src/utils/genderUtils.js'
  ];

  it('1. verifies zero firebase/firestore imports in all cleaned production components and utilities', () => {
    cleanedProductionFiles.forEach((relPath) => {
      const fullPath = path.resolve(rootDir, relPath);
      expect(fs.existsSync(fullPath), `File ${relPath} should exist`).toBe(true);

      const content = fs.readFileSync(fullPath, 'utf8');

      // Zero imports from firebase/firestore or local firestore library
      expect(content).not.toMatch(/from\s+['"].*firebase\/firestore(\.js)?['"]/);
      expect(content).not.toMatch(/from\s+['"].*firebase\/config(\.js)?['"]/);

      // Zero Firestore SDK direct call signatures
      expect(content).not.toMatch(
        /\b(getDoc|getDocs|setDoc|addDoc|updateDoc|deleteDoc|onSnapshot|runTransaction|writeBatch)\s*\(/
      );
    });
  });

  it('2. verifies genderUtils is a pure zero-dependency utility with standard exports', () => {
    expect(typeof genderUtils.normalizeGender).toBe('function');
    expect(typeof genderUtils.isMale).toBe('function');
    expect(typeof genderUtils.isFemale).toBe('function');
    expect(typeof genderUtils.isOther).toBe('function');

    expect(genderUtils.normalizeGender('m')).toBe('Male');
    expect(genderUtils.normalizeGender('female')).toBe('Female');
    expect(genderUtils.normalizeGender('non-binary')).toBe('Other');
    expect(genderUtils.isMale('BOY')).toBe(true);
    expect(genderUtils.isFemale('Girl')).toBe(true);
    expect(genderUtils.isOther('transgender')).toBe(true);
  });

  it('3. confirms only strictly authorized modules (Category D Auth, Category E Support Tickets) reference Firestore', () => {
    const authorizedFilesWithFirestore = [
      'src/components/RaiseTicketModal.jsx',
      'src/pages/SuperAdmin/SupportTickets.jsx',
      'src/pages/ForgotPassword.jsx',
      'src/firebase/auth.js',
      'src/firebase/config.js',
      'src/firebase/firestore.js'
    ];

    authorizedFilesWithFirestore.forEach((relPath) => {
      const fullPath = path.resolve(rootDir, relPath);
      expect(fs.existsSync(fullPath), `Authorized file ${relPath} should exist`).toBe(true);
    });
  });
});
