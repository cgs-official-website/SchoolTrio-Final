import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Form Builder Frontend Firestore Zero-Op Audit (Phase FORMBUILDER.3)', () => {
  const formBuilderPath = path.resolve(__dirname, '../../pages/Admin/FormBuilder.jsx');
  const customModuleViewPath = path.resolve(__dirname, '../../pages/Admin/CustomModuleView.jsx');
  const customFieldsRendererPath = path.resolve(__dirname, '../../components/CustomFieldsRenderer.jsx');
  const environmentSetupPath = path.resolve(__dirname, '../../pages/Admin/EnvironmentSetup.jsx');
  const adminDashboardPath = path.resolve(__dirname, '../../pages/AdminDashboard.jsx');

  it('FormBuilder.jsx has ZERO Firestore imports or operations', () => {
    const content = fs.readFileSync(formBuilderPath, 'utf8');
    expect(content).not.toContain("from 'firebase/firestore'");
    expect(content).not.toContain("from '../../firebase/config'");
    expect(content).not.toContain('onSnapshot');
    expect(content).not.toContain('getDocs');
    expect(content).not.toContain('getDoc');
    expect(content).not.toContain('setDoc');
    expect(content).not.toContain('addDoc');
    expect(content).not.toContain('deleteDoc');
    expect(content).not.toContain('writeBatch');
    expect(content).toContain('listCustomModules');
    expect(content).toContain('createCustomModule');
    expect(content).toContain('deleteCustomModule');
    expect(content).toContain('getFormSchema');
    expect(content).toContain('upsertFormSchema');
  });

  it('CustomModuleView.jsx has ZERO Firestore imports or operations', () => {
    const content = fs.readFileSync(customModuleViewPath, 'utf8');
    expect(content).not.toContain("from 'firebase/firestore'");
    expect(content).not.toContain("from '../../firebase/config'");
    expect(content).not.toContain('onSnapshot');
    expect(content).not.toContain('getDocs');
    expect(content).not.toContain('getDoc');
    expect(content).not.toContain('setDoc');
    expect(content).not.toContain('addDoc');
    expect(content).not.toContain('deleteDoc');
    expect(content).not.toContain('writeBatch');
    expect(content).toContain('getCustomModule');
    expect(content).toContain('deleteCustomModule');
    expect(content).toContain('getFormSchema');
    expect(content).toContain('listModuleRecords');
    expect(content).toContain('createModuleRecord');
    expect(content).toContain('updateModuleRecord');
    expect(content).toContain('deleteModuleRecord');
  });

  it('CustomFieldsRenderer.jsx has ZERO Firestore imports or operations', () => {
    const content = fs.readFileSync(customFieldsRendererPath, 'utf8');
    expect(content).not.toContain("from 'firebase/firestore'");
    expect(content).not.toContain("from '../firebase/config'");
    expect(content).not.toContain('getDoc');
    expect(content).not.toContain('doc(');
    expect(content).toContain('getFormSchema');
  });

  it('EnvironmentSetup.jsx has ZERO Firestore imports or operations', () => {
    const content = fs.readFileSync(environmentSetupPath, 'utf8');
    expect(content).not.toContain("from 'firebase/firestore'");
    expect(content).not.toContain("from '../../firebase/config'");
  });

  it('AdminDashboard.jsx has ZERO Firestore listeners for custom modules', () => {
    const content = fs.readFileSync(adminDashboardPath, 'utf8');
    expect(content).not.toContain("from 'firebase/firestore'");
    expect(content).not.toContain("from '../firebase/config'");
    expect(content).toContain('listCustomModules');
  });
});
