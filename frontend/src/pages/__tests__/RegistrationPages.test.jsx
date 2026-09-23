import { describe, it, expect, vi, beforeEach } from 'vitest';
import SchoolRegistration from '../SchoolRegistration.jsx';
import TeacherRegistration from '../TeacherRegistration.jsx';
import ParentRegistration from '../ParentRegistration.jsx';
import * as registrationApi from '../../api/registration.js';
import * as billingApi from '../../api/billing.js';

describe('Registration Components Migration Tests (FRONTEND.C1)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('exports valid component functions for all three registration pages', () => {
    expect(typeof SchoolRegistration).toBe('function');
    expect(typeof TeacherRegistration).toBe('function');
    expect(typeof ParentRegistration).toBe('function');
  });

  it('SchoolRegistration uses registerSchool API client', async () => {
    const registerSpy = vi.spyOn(registrationApi, 'registerSchool').mockResolvedValue({
      success: true,
      data: { id: 'school-123' }
    });

    const mockPayload = {
      name: 'Test Academy',
      code: 'TEST-001',
      admin: { name: 'Admin', email: 'admin@test.edu', password: 'Password123' }
    };

    const res = await registrationApi.registerSchool(mockPayload);
    expect(registerSpy).toHaveBeenCalledWith(mockPayload);
    expect(res.data.id).toBe('school-123');
  });

  it('TeacherRegistration uses registerTeacher API client', async () => {
    const registerSpy = vi.spyOn(registrationApi, 'registerTeacher').mockResolvedValue({
      success: true,
      data: { staff: { id: 'staff-123', status: 'Active' } }
    });

    const mockPayload = {
      schoolId: '11111111-1111-4111-8111-111111111111',
      email: 'teacher@test.edu',
      password: 'TeacherPassword123'
    };

    const res = await registrationApi.registerTeacher(mockPayload);
    expect(registerSpy).toHaveBeenCalledWith(mockPayload);
    expect(res.data.staff.status).toBe('Active');
  });

  it('ParentRegistration uses registerParent API client', async () => {
    const registerSpy = vi.spyOn(registrationApi, 'registerParent').mockResolvedValue({
      success: true,
      data: { parent: { id: 'parent-123' } }
    });

    const mockPayload = {
      schoolId: '11111111-1111-4111-8111-111111111111',
      name: 'Jane Doe',
      email: 'jane@example.com',
      password: 'Password123',
      admissionNumber: 'ADM-001',
      dob: '2016-01-01',
      relationship: 'Mother'
    };

    const res = await registrationApi.registerParent(mockPayload);
    expect(registerSpy).toHaveBeenCalledWith(mockPayload);
    expect(res.data.parent.id).toBe('parent-123');
  });
});
