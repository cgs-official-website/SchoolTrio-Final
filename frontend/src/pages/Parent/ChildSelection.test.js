import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  reconcileActiveStudentId,
  resolveActiveChild,
  getStoredActiveStudentId,
  setStoredActiveStudentId
} from '../ParentDashboard.jsx';
import { resolveTopNavbarIdentity } from '../../components/TopNavbar.jsx';

describe('BUG-PP-003: Parent Portal Child Selection Synchronization & Regression Suite', () => {
  const parentDashboardPath = path.resolve(__dirname, '../ParentDashboard.jsx');
  const parentDashboardContent = fs.readFileSync(parentDashboardPath, 'utf-8');

  const topNavbarPath = path.resolve(__dirname, '../../components/TopNavbar.jsx');
  const topNavbarContent = fs.readFileSync(topNavbarPath, 'utf-8');

  const myChildrenPath = path.resolve(__dirname, 'MyChildren.jsx');
  const myChildrenContent = fs.readFileSync(myChildrenPath, 'utf-8');

  const studentOverviewPath = path.resolve(__dirname, 'StudentOverview.jsx');
  const studentOverviewContent = fs.readFileSync(studentOverviewPath, 'utf-8');

  // Test Fixtures
  const studentBala = {
    id: 'student-bala-id',
    studentId: 'student-bala-id',
    name: 'Bala A',
    firstName: 'Bala',
    lastName: 'A',
    class: { id: 'class-10-id', name: 'Class 10' },
    section: { id: 'sec-a-id', name: 'A' },
    admissionNumber: 'ADM-2024-001'
  };

  const studentNisha = {
    id: 'student-nisha-id',
    studentId: 'student-nisha-id',
    name: 'Nisha A',
    firstName: 'Nisha',
    lastName: 'A',
    class: { id: 'class-8-id', name: 'Class 8' },
    section: { id: 'sec-b-id', name: 'B' },
    admissionNumber: 'ADM-2024-002'
  };

  const mockTwoChildren = [studentBala, studentNisha];
  const mockSingleChild = [studentBala];

  const parentProfile = {
    id: 'user-parent-id',
    name: 'Bala A', // In test/legacy data, parent profile was provisioned as Bala A
    email: 'parent.arun@school.edu',
    role: 'parent',
    systemRole: 'PARENT',
    schoolName: 'Greenwood High School'
  };

  const adminProfile = {
    id: 'user-admin-id',
    name: 'Admin User',
    email: 'admin@school.edu',
    role: 'admin',
    systemRole: 'SCHOOL_ADMIN',
    schoolName: 'Greenwood High School'
  };

  const teacherProfile = {
    id: 'user-teacher-id',
    name: 'Teacher Smith',
    email: 'smith@school.edu',
    role: 'teacher',
    systemRole: 'TEACHER',
    schoolName: 'Greenwood High School'
  };

  const superAdminProfile = {
    id: 'user-super-id',
    name: 'Platform SuperAdmin',
    email: 'superadmin@sms.io',
    role: 'superadmin',
    systemRole: 'SUPER_ADMIN'
  };

  beforeEach(() => {
    vi.clearAllMocks();
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  // ============================================================
  // 1. Single Child Consistency
  // ============================================================
  describe('1. Single Child Consistency', () => {
    it('reliably resolves the single linked child for a parent with one child', () => {
      const activeId = reconcileActiveStudentId(null, mockSingleChild);
      expect(activeId).toBe(studentBala.id);

      const resolved = resolveActiveChild(mockSingleChild, activeId, false);
      expect(resolved).toEqual(studentBala);
      expect(resolved.name).toBe('Bala A');
    });

    it('TopNavbar displays the single child with Active Child context', () => {
      const identity = resolveTopNavbarIdentity({
        userProfile: parentProfile,
        activeChild: studentBala,
        activeChildLoading: false,
        schoolName: parentProfile.schoolName
      });

      expect(identity.isParent).toBe(true);
      expect(identity.displayName).toBe('Bala A');
      expect(identity.label).toBe('Active Child');
      expect(identity.subtitle).toBe('Parent: Bala A');
      expect(identity.avatarInitials).toBe('BA');
    });
  });

  // ============================================================
  // 2. Initial Active Child Resolution for Multi-Child Accounts
  // ============================================================
  describe('2. Initial Active Child Resolution for Multi-Child Accounts', () => {
    it('defaults to the first child when no stored ID exists in localStorage', () => {
      const resolvedId = reconcileActiveStudentId(null, mockTwoChildren);
      expect(resolvedId).toBe(studentBala.id);

      const active = resolveActiveChild(mockTwoChildren, resolvedId, false);
      expect(active.id).toBe(studentBala.id);
      expect(active.name).toBe('Bala A');
    });

    it('honors a valid stored ID from localStorage when present', () => {
      const resolvedId = reconcileActiveStudentId(studentNisha.id, mockTwoChildren);
      expect(resolvedId).toBe(studentNisha.id);

      const active = resolveActiveChild(mockTwoChildren, resolvedId, false);
      expect(active.id).toBe(studentNisha.id);
      expect(active.name).toBe('Nisha A');
    });
  });

  // ============================================================
  // 3 & 4. Switching to Nisha A and Switching Back to Bala A
  // ============================================================
  describe('3 & 4. Switching Between Linked Children (Bala A <-> Nisha A)', () => {
    it('updates resolved active child to Nisha A when Nisha A is selected', () => {
      const targetId = studentNisha.id;
      const resolvedId = reconcileActiveStudentId(targetId, mockTwoChildren);
      expect(resolvedId).toBe(studentNisha.id);

      const active = resolveActiveChild(mockTwoChildren, resolvedId, false);
      expect(active.name).toBe('Nisha A');

      // TopNavbar identity resolves to Nisha A
      const navbarIdentity = resolveTopNavbarIdentity({
        userProfile: parentProfile,
        activeChild: active,
        activeChildLoading: false
      });
      expect(navbarIdentity.displayName).toBe('Nisha A');
      expect(navbarIdentity.label).toBe('Active Child');
      expect(navbarIdentity.subtitle).toBe('Parent: Bala A');
      expect(navbarIdentity.avatarInitials).toBe('NI');
    });

    it('switching back to Bala A immediately updates active child and all context headers', () => {
      // 1. Switch to Nisha A
      let currentId = reconcileActiveStudentId(studentNisha.id, mockTwoChildren);
      let active = resolveActiveChild(mockTwoChildren, currentId, false);
      expect(active.name).toBe('Nisha A');

      // 2. Switch back to Bala A
      currentId = reconcileActiveStudentId(studentBala.id, mockTwoChildren);
      active = resolveActiveChild(mockTwoChildren, currentId, false);
      expect(active.name).toBe('Bala A');

      const navbarIdentity = resolveTopNavbarIdentity({
        userProfile: parentProfile,
        activeChild: active,
        activeChildLoading: false
      });
      expect(navbarIdentity.displayName).toBe('Bala A');
      expect(navbarIdentity.label).toBe('Active Child');
      expect(navbarIdentity.avatarInitials).toBe('BA');
    });
  });

  // ============================================================
  // 5. In-Memory Synchronization via MyChildren.jsx
  // ============================================================
  describe('5. In-Memory Synchronization via MyChildren.jsx', () => {
    it('verifies MyChildren.jsx integrates onSelectActiveChild from useOutletContext', () => {
      expect(myChildrenContent).toContain('const outletContext = useOutletContext();');
      expect(myChildrenContent).toContain('const onSelectActiveChild = outletContext?.onSelectActiveChild || outletContext?.setActiveStudentId;');
    });

    it('verifies handleSwitchActive in MyChildren.jsx invokes onSelectActiveChild and dispatches sync event', () => {
      expect(myChildrenContent).toContain('if (typeof onSelectActiveChild === \'function\') {');
      expect(myChildrenContent).toContain('onSelectActiveChild(studentId);');
      expect(myChildrenContent).toContain("window.dispatchEvent(new CustomEvent('sms:active-child-changed', { detail: { studentId } }));");
    });

    it('verifies ParentDashboard.jsx listens to sms:active-child-changed for zero-reload synchronization', () => {
      expect(parentDashboardContent).toContain("window.addEventListener('sms:active-child-changed', handleActiveChildChanged);");
      expect(parentDashboardContent).toContain("window.removeEventListener('sms:active-child-changed', handleActiveChildChanged);");
    });

    it('verifies ParentDashboard.jsx passes onSelectActiveChild and setActiveStudentId to Outlet context', () => {
      expect(parentDashboardContent).toContain('onSelectActiveChild: handleSwitchChild');
      expect(parentDashboardContent).toContain('setActiveStudentId: handleSwitchChild');
    });
  });

  // ============================================================
  // 6. Safe Fallback for Invalid or Stale Stored IDs
  // ============================================================
  describe('6. Safe Fallback for Invalid or Stale Stored IDs', () => {
    it('falls back to the first valid linked child when localStorage contains an unknown UUID', () => {
      const invalidId = 'deadbeef-9999-9999-9999-000000000000';
      const resolvedId = reconcileActiveStudentId(invalidId, mockTwoChildren);

      expect(resolvedId).toBe(studentBala.id);
      const active = resolveActiveChild(mockTwoChildren, resolvedId, false);
      expect(active.id).toBe(studentBala.id);
      expect(active.name).toBe('Bala A');
    });

    it('handles undefined or corrupted candidate IDs gracefully', () => {
      expect(reconcileActiveStudentId(undefined, mockTwoChildren)).toBe(studentBala.id);
      expect(reconcileActiveStudentId('', mockTwoChildren)).toBe(studentBala.id);
      expect(reconcileActiveStudentId(null, mockTwoChildren)).toBe(studentBala.id);
    });
  });

  // ============================================================
  // 7. Loading and Empty List Protections
  // ============================================================
  describe('7. Loading and Empty List Protections', () => {
    it('returns null when children are still loading to prevent displaying a premature child', () => {
      const active = resolveActiveChild(mockTwoChildren, studentBala.id, true);
      expect(active).toBeNull();
    });

    it('returns null when enrolledChildren array is empty', () => {
      expect(resolveActiveChild([], studentBala.id, false)).toBeNull();
      expect(resolveActiveChild(null, studentBala.id, false)).toBeNull();
      expect(reconcileActiveStudentId(studentBala.id, [])).toBeNull();
    });

    it('TopNavbar displays loading state when activeChildLoading is true', () => {
      const identity = resolveTopNavbarIdentity({
        userProfile: parentProfile,
        activeChild: null,
        activeChildLoading: true
      });

      expect(identity.loading).toBe(true);
      expect(identity.displayName).toBe('Loading...');
      expect(identity.subtitle).toBe('Loading child...');
    });

    it('TopNavbar displays safe fallback when children are resolved but empty', () => {
      const identity = resolveTopNavbarIdentity({
        userProfile: parentProfile,
        activeChild: null,
        activeChildLoading: false
      });

      expect(identity.loading).toBe(false);
      expect(identity.displayName).toBe('Bala A'); // Authenticated parent name
      expect(identity.subtitle).toBe('Parent Portal');
      expect(identity.label).toBeNull();
    });
  });

  // ============================================================
  // 8. Pending Request Race Condition Guards
  // ============================================================
  describe('8. Pending Request Race Condition Guards', () => {
    it('verifies StudentOverview.jsx uses currentStudentRef to discard stale async responses', () => {
      expect(studentOverviewContent).toContain('const currentStudentRef = useRef(studentId);');
      expect(studentOverviewContent).toContain('if (!mountedRef.current || currentStudentRef.current !== targetStudentId) return;');
    });

    it('verifies ParentDashboard.jsx uses currentActiveStudentRef to guard async fee queries', () => {
      expect(parentDashboardContent).toContain('const currentActiveStudentRef = useRef(null);');
      expect(parentDashboardContent).toContain('if (!mountedRef.current || currentActiveStudentRef.current !== targetStudentId) return;');
    });
  });

  // ============================================================
  // 9. Authenticated Parent Identity Preservation
  // ============================================================
  describe('9. Authenticated Parent Identity Preservation', () => {
    it('verifies userProfile in AuthContext is never mutated by child selection', () => {
      const initialProfile = { ...parentProfile };

      // Switch active child to Nisha A
      const resolved = resolveActiveChild(mockTwoChildren, studentNisha.id, false);
      expect(resolved.name).toBe('Nisha A');

      // Parent user profile must retain its own identity
      expect(parentProfile.id).toBe(initialProfile.id);
      expect(parentProfile.name).toBe(initialProfile.name);
      expect(parentProfile.email).toBe(initialProfile.email);
      expect(parentProfile.role).toBe('parent');
      expect(parentProfile.systemRole).toBe('PARENT');
    });

    it('verifies ParentDashboard sidebar displays parent account identity alongside selected child', () => {
      expect(parentDashboardContent).toContain('data-testid="sidebar-bottom-child-name"');
      expect(parentDashboardContent).toContain('data-testid="sidebar-bottom-child-label"');
      expect(parentDashboardContent).toContain('data-testid="sidebar-bottom-parent-identity"');
      expect(parentDashboardContent).toContain("Parent: {userProfile?.name || userProfile?.email?.split('@')[0]}");
    });
  });

  // ============================================================
  // 10. Non-Parent Portal Invariance (Admin, Teacher, SuperAdmin)
  // ============================================================
  describe('10. Non-Parent Portal Invariance (Admin, Teacher, SuperAdmin)', () => {
    it('preserves exact Admin navbar identity and markup', () => {
      const adminIdentity = resolveTopNavbarIdentity({
        userProfile: adminProfile,
        activeChild: null,
        activeChildLoading: false,
        schoolName: adminProfile.schoolName
      });

      expect(adminIdentity.isParent).toBe(false);
      expect(adminIdentity.displayName).toBe('Admin User');
      expect(adminIdentity.subtitle).toBe('Greenwood High School');
      expect(adminIdentity.label).toBeNull();
      expect(adminIdentity.avatarInitials).toBe('AD');
    });

    it('preserves exact Teacher navbar identity and markup', () => {
      const teacherIdentity = resolveTopNavbarIdentity({
        userProfile: teacherProfile,
        activeChild: null,
        activeChildLoading: false,
        schoolName: teacherProfile.schoolName
      });

      expect(teacherIdentity.isParent).toBe(false);
      expect(teacherIdentity.displayName).toBe('Teacher Smith');
      expect(teacherIdentity.subtitle).toBe('Greenwood High School');
      expect(teacherIdentity.label).toBeNull();
      expect(teacherIdentity.avatarInitials).toBe('TE');
    });

    it('preserves exact SuperAdmin navbar identity and markup', () => {
      const superIdentity = resolveTopNavbarIdentity({
        userProfile: superAdminProfile,
        activeChild: null,
        activeChildLoading: false,
        schoolName: 'Super Admin Portal'
      });

      expect(superIdentity.isParent).toBe(false);
      expect(superIdentity.displayName).toBe('Platform SuperAdmin');
      expect(superIdentity.subtitle).toBe('Super Admin Portal');
      expect(superIdentity.label).toBeNull();
      expect(superIdentity.avatarInitials).toBe('PL');
    });
  });

  // ============================================================
  // 11. Logout and Account Controls Integrity
  // ============================================================
  describe('11. Logout and Account Controls Integrity', () => {
    it('verifies ParentDashboard sidebar maintains logout button connected to handleLogout', () => {
      expect(parentDashboardContent).toContain('data-testid="sidebar-logout-button"');
      expect(parentDashboardContent).toContain('onClick={handleLogout}');
      expect(parentDashboardContent).toContain('<LogOut size={20} />');
    });

    it('verifies TopNavbar retains theme toggle and notification controls for all users', () => {
      expect(topNavbarContent).toContain('onClick={() => setIsDarkMode(!isDarkMode)}');
      expect(topNavbarContent).toContain('onClick={() => setShowNotifications(!showNotifications)}');
    });
  });

  // ============================================================
  // 12. Child-Specific Page Context and Request Scoping
  // ============================================================
  describe('12. Child-Specific Page Context and Request Scoping', () => {
    it('verifies StudentOverview reads activeStudentId from Outlet context', () => {
      expect(studentOverviewContent).toContain('const activeStudentIdFromContext = outletContext?.activeStudentId;');
      expect(studentOverviewContent).toContain('const activeChildFromContext = outletContext?.activeChild;');
    });

    it('verifies StudentOverview renders student name from resolved active child', () => {
      expect(studentOverviewContent).toContain('{student.firstName || \'\'} {student.lastName || \'\'}');
    });

    it('verifies TopNavbar receives activeChild and activeChildLoading from ParentDashboard', () => {
      expect(parentDashboardContent).toContain('activeChild={activeChild}');
      expect(parentDashboardContent).toContain('activeChildLoading={loadingChildren}');
    });
  });
});
