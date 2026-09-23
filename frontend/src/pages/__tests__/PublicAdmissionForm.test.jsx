import { describe, it, expect, vi, beforeEach } from 'vitest';
import PublicAdmissionForm from '../PublicAdmissionForm.jsx';
import * as admissionsApi from '../../api/admissions.js';

describe('PublicAdmissionForm Component (REST Migration)', () => {
  const mockSchoolMeta = {
    school: {
      id: 'school-123',
      name: 'Greenwood International School',
      logoUrl: 'https://example.com/logo.png'
    },
    classes: [
      { id: 'cls-1', name: 'Grade 1', section: 'A' },
      { id: 'cls-2', name: 'Grade 2', section: 'B' }
    ]
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('1. is exported as a valid React component function', () => {
    expect(typeof PublicAdmissionForm).toBe('function');
  });

  it('2. loads school metadata and active classes via admissionsApi.getPublicSchoolMeta', async () => {
    const metaSpy = vi.spyOn(admissionsApi, 'getPublicSchoolMeta').mockResolvedValue({
      success: true,
      data: mockSchoolMeta
    });

    const res = await admissionsApi.getPublicSchoolMeta('school-123');
    expect(metaSpy).toHaveBeenCalledWith('school-123');
    expect(res.data.school.name).toBe('Greenwood International School');
    expect(res.data.classes).toHaveLength(2);
  });

  it('3. submits admission application via admissionsApi.submitPublicAdmission', async () => {
    const payload = {
      studentName: 'Alice Johnson',
      dob: '2016-04-12',
      gender: 'Female',
      parentName: 'Robert Johnson',
      parentPhone: '9876543210',
      parentEmail: 'robert@example.com',
      address: '123 Elm St',
      classId: 'cls-1',
      customData: {
        firstName: 'Alice',
        lastName: 'Johnson'
      }
    };

    const submitSpy = vi.spyOn(admissionsApi, 'submitPublicAdmission').mockResolvedValue({
      success: true,
      data: {
        id: 'app-new-1',
        applicationNumber: 'ADM-2026-9999',
        studentName: 'Alice Johnson',
        status: 'Pending',
        submittedAt: '2026-09-17T12:00:00.000Z'
      }
    });

    const res = await admissionsApi.submitPublicAdmission('school-123', payload);
    expect(submitSpy).toHaveBeenCalledWith('school-123', payload);
    expect(res.data.applicationNumber).toBe('ADM-2026-9999');
    expect(res.data.status).toBe('Pending');
  });

  it('4. handles submission errors from REST endpoint', async () => {
    const submitSpy = vi.spyOn(admissionsApi, 'submitPublicAdmission').mockRejectedValue({
      response: {
        status: 400,
        data: { message: 'Invalid phone number format' }
      }
    });

    await expect(admissionsApi.submitPublicAdmission('school-123', {})).rejects.toMatchObject({
      response: {
        status: 400,
        data: { message: expect.stringContaining('Invalid phone number') }
      }
    });
    expect(submitSpy).toHaveBeenCalled();
  });
});
