import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Zero-Op Verification: Email Templates Flows (FRONTEND.C2)', () => {
  const targetFiles = [
    'src/pages/SuperAdmin/EmailTemplates.jsx',
    'src/services/emailService.js',
    'src/api/emailTemplates.js'
  ];

  it('verifies 0 Firestore imports and zero Firestore access across all target files', () => {
    const rootDir = process.cwd();

    targetFiles.forEach((relPath) => {
      const fullPath = path.resolve(rootDir, relPath);
      expect(fs.existsSync(fullPath), `File ${relPath} should exist`).toBe(true);

      const content = fs.readFileSync(fullPath, 'utf8');

      // Zero Firebase module imports
      expect(content).not.toMatch(/from\s+['"].*firebase.*['"]/);
      expect(content).not.toMatch(/from\s+['"]firebase\/firestore['"]/);

      // Zero Firestore SDK functions
      expect(content).not.toMatch(/\b(getDoc|getDocs|setDoc|addDoc|updateDoc|deleteDoc|onSnapshot|runTransaction|writeBatch)\b/);

      // Zero Firestore collections / documents references
      expect(content).not.toMatch(/settings\/emailTemplates/);
      expect(content).not.toMatch(/doc\(\s*db\s*,/);
    });
  });

  it('confirms EmailTemplates.jsx and emailService.js import from dedicated REST API client', () => {
    const rootDir = process.cwd();

    const pageContent = fs.readFileSync(path.resolve(rootDir, 'src/pages/SuperAdmin/EmailTemplates.jsx'), 'utf8');
    expect(pageContent).toContain("import { listEmailTemplates, updateEmailTemplates } from '../../api/emailTemplates'");

    const serviceContent = fs.readFileSync(path.resolve(rootDir, 'src/services/emailService.js'), 'utf8');
    expect(serviceContent).toContain("import { listEmailTemplates } from '../api/emailTemplates'");
  });
});
