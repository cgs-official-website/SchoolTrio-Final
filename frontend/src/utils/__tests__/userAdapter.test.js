import { describe, it, expect } from 'vitest';
import { normalizeAuthUser } from '../userAdapter.js';

describe('userAdapter (normalizeAuthUser)', () => {
  it('returns null for null or invalid inputs', () => {
    expect(normalizeAuthUser(null)).toBeNull();
    expect(normalizeAuthUser(undefined)).toBeNull();
    expect(normalizeAuthUser('string')).toBeNull();
  });

  it('normalizes SCHOOL_ADMIN to role admin', () => {
    const backendUser = {
      id: 'uuid-1',
      email: 'admin@school.com',
      systemRole: 'SCHOOL_ADMIN',
      schoolId: 'sch-1',
      school: {
        name: 'Oakridge International',
        code: 'SchoolS024',
        status: 'ACTIVE'
      },
      tokenVersion: 1,
      isActive: true
    };

    const normalized = normalizeAuthUser(backendUser);

    expect(normalized).toEqual({
      id: 'uuid-1',
      uid: 'uuid-1',
      email: 'admin@school.com',
      name: 'admin',
      role: 'admin',
      systemRole: 'SCHOOL_ADMIN',
      loginPanel: 'admin',
      roles: ['admin'],
      roleAssignments: [],
      schoolId: 'sch-1',
      schoolName: 'Oakridge International',
      schoolCode: 'SchoolS024',
      schoolStatus: 'ACTIVE',
      assignedClassId: null,
      assignedClass: null,
      employeeId: null,
      designation: null,
      phone: null,
      customData: null,
      tokenVersion: 1,
      isActive: true,
      staffProfile: null,
      parentProfile: null
    });
  });

  it('normalizes TENANT_ADMIN and ADMIN to role admin', () => {
    const user1 = { id: 'u1', email: 'pravin@school.com', systemRole: 'TENANT_ADMIN' };
    const user2 = { id: 'u2', email: 'admin@school.com', systemRole: 'ADMIN' };
    expect(normalizeAuthUser(user1).role).toBe('admin');
    expect(normalizeAuthUser(user2).role).toBe('admin');
  });

  it('normalizes TEACHER to role teacher', () => {
    const backendUser = {
      id: 'uuid-2',
      email: 'teacher@school.com',
      systemRole: 'TEACHER',
      schoolId: 'sch-1',
      staffProfile: {
        name: 'Sarah Teacher'
      }
    };

    const normalized = normalizeAuthUser(backendUser);
    expect(normalized.role).toBe('teacher');
    expect(normalized.name).toBe('Sarah Teacher');
  });

  it('normalizes PARENT to role parent', () => {
    const backendUser = {
      id: 'uuid-3',
      email: 'parent@home.com',
      systemRole: 'PARENT',
      schoolId: 'sch-1',
      parentProfile: {
        name: 'John Parent'
      }
    };

    const normalized = normalizeAuthUser(backendUser);
    expect(normalized.role).toBe('parent');
    expect(normalized.name).toBe('John Parent');
  });

  it('normalizes SUPER_ADMIN to role superadmin', () => {
    const backendUser = {
      id: 'uuid-4',
      email: 'super@sms.com',
      systemRole: 'SUPER_ADMIN'
    };

    const normalized = normalizeAuthUser(backendUser);
    expect(normalized.role).toBe('superadmin');
  });

  it('preserves loginPanel from assigned schoolRole when explicitly configured in RBAC', () => {
    const backendUser = {
      id: 'uuid-5',
      email: 'customteacher@school.com',
      systemRole: 'TEACHER',
      schoolId: 'sch-1',
      staffProfile: { name: 'Custom Teacher' },
      roleAssignments: [
        {
          schoolRole: {
            name: 'Academic Director',
            loginPanel: 'admin'
          }
        }
      ]
    };

    const normalized = normalizeAuthUser(backendUser);
    expect(normalized.role).toBe('teacher');
    expect(normalized.loginPanel).toBe('admin');
  });

  it('defaults loginPanel to teacher for teaching staff without explicit loginPanel on role', () => {
    const backendUser = {
      id: 'uuid-6',
      email: 'staffteacher@school.com',
      systemRole: 'STAFF',
      schoolId: 'sch-1',
      staffProfile: { name: 'Teaching Staff', staffType: 'teaching' },
      roleAssignments: [
        {
          schoolRole: {
            name: 'Class Incharge'
            // loginPanel omitted or teacher
          }
        }
      ]
    };

    const normalized = normalizeAuthUser(backendUser);
    expect(normalized.role).toBe('teacher');
    expect(normalized.loginPanel).toBe('teacher');
  });
});
