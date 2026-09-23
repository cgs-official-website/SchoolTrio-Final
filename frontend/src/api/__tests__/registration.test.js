import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as clientModule from '../client.js';
import { registerSchool, registerTeacher, registerParent } from '../registration.js';

describe('Unit: Registration REST API Client (FRONTEND.C1)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('registerSchool', () => {
    it('calls apiClient with POST /api/v1/public/schools/register and stringified payload', async () => {
      const payload = {
        name: 'Springfield Academy',
        code: 'SPRF-101',
        type: 'School',
        email: 'admin@springfield.edu',
        phone: '9876543210',
        address: '742 Evergreen Terrace',
        seatLimit: 500,
        admin: {
          name: 'Seymour Skinner',
          email: 'principal@springfield.edu',
          password: 'Password123'
        }
      };

      const mockResponse = {
        success: true,
        data: {
          school: { id: 'school-uuid-1', name: 'Springfield Academy', code: 'SPRF-101' },
          admin: { id: 'user-uuid-1', email: 'principal@springfield.edu' }
        },
        message: 'School registration submitted successfully'
      };

      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue(mockResponse);

      const result = await registerSchool(payload);

      expect(apiSpy).toHaveBeenCalledWith('/api/v1/public/schools/register', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      expect(result).toEqual(mockResponse);
    });

    it('propagates ApiError on backend conflict or validation rejection', async () => {
      vi.spyOn(clientModule, 'apiClient').mockRejectedValue(
        new clientModule.ApiError("School code 'SPRF-101' is already registered", 409, 'CONFLICT')
      );

      await expect(registerSchool({ code: 'SPRF-101' })).rejects.toThrow(
        "School code 'SPRF-101' is already registered"
      );
    });
  });

  describe('registerTeacher', () => {
    it('calls apiClient with POST /api/v1/public/teachers/register and stringified payload', async () => {
      const payload = {
        schoolId: '11111111-1111-4111-8111-111111111111',
        email: 'edna.krabappel@school.edu',
        password: 'TeacherPassword123',
        employeeId: 'EMP-99',
        name: 'Edna Krabappel'
      };

      const mockResponse = {
        success: true,
        data: {
          staff: { id: 'staff-uuid-1', status: 'Active' },
          user: { id: 'user-uuid-2', email: 'edna.krabappel@school.edu' }
        },
        message: 'Teacher account activated successfully'
      };

      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue(mockResponse);

      const result = await registerTeacher(payload);

      expect(apiSpy).toHaveBeenCalledWith('/api/v1/public/teachers/register', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      expect(result).toEqual(mockResponse);
    });

    it('propagates ApiError when invitation is not found (404)', async () => {
      vi.spyOn(clientModule, 'apiClient').mockRejectedValue(
        new clientModule.ApiError('Matching staff invitation not found', 404, 'NOT_FOUND')
      );

      await expect(registerTeacher({ email: 'unknown@school.edu' })).rejects.toThrow(
        'Matching staff invitation not found'
      );
    });

    it('propagates ApiError when teacher account is already activated (409)', async () => {
      vi.spyOn(clientModule, 'apiClient').mockRejectedValue(
        new clientModule.ApiError('This account has already been registered. Please login instead.', 409, 'CONFLICT')
      );

      await expect(registerTeacher({ email: 'activated@school.edu' })).rejects.toThrow(
        'This account has already been registered. Please login instead.'
      );
    });
  });

  describe('registerParent', () => {
    it('calls apiClient with POST /api/v1/public/parents/register and stringified payload', async () => {
      const payload = {
        schoolId: '11111111-1111-4111-8111-111111111111',
        name: 'Homer Simpson',
        email: 'homer@springfield.com',
        password: 'DonutPassword123',
        admissionNumber: 'ADM-BART',
        dob: '2014-04-01',
        relationship: 'Father'
      };

      const mockResponse = {
        success: true,
        data: {
          parent: { id: 'parent-uuid-1' },
          link: { id: 'link-uuid-1', relationship: 'Father' }
        },
        message: 'Parent registered and linked to student successfully'
      };

      const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue(mockResponse);

      const result = await registerParent(payload);

      expect(apiSpy).toHaveBeenCalledWith('/api/v1/public/parents/register', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      expect(result).toEqual(mockResponse);
    });

    it('propagates ApiError on student matching failure (404)', async () => {
      vi.spyOn(clientModule, 'apiClient').mockRejectedValue(
        new clientModule.ApiError("Student admission number 'ADM-UNKNOWN' does not match any enrolled student", 404, 'NOT_FOUND')
      );

      await expect(registerParent({ admissionNumber: 'ADM-UNKNOWN' })).rejects.toThrow(
        "Student admission number 'ADM-UNKNOWN' does not match any enrolled student"
      );
    });

    it('propagates ApiError on student DOB mismatch (400)', async () => {
      vi.spyOn(clientModule, 'apiClient').mockRejectedValue(
        new clientModule.ApiError('Date of birth does not match student records', 400, 'VALIDATION_ERROR')
      );

      await expect(registerParent({ dob: '1999-01-01' })).rejects.toThrow(
        'Date of birth does not match student records'
      );
    });
  });
});
