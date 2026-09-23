import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as studentsApi from '../../../api/students.js';

describe('Student Health REST Contract Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('retrieves student health records via studentsApi.getStudentHealth', async () => {
    const healthSpy = vi.spyOn(studentsApi.studentsApi, 'getStudentHealth').mockResolvedValue({
      success: true,
      data: {
        studentId: 'student-uuid-1',
        bloodGroup: 'B+',
        allergies: ['Peanuts', 'Penicillin'],
        medicalConditions: ['Mild Asthma'],
        emergencyContactName: 'John Doe',
        emergencyContactPhone: '9876543210'
      }
    });

    const res = await studentsApi.studentsApi.getStudentHealth('student-uuid-1');
    expect(healthSpy).toHaveBeenCalledWith('student-uuid-1');
    expect(res.data.bloodGroup).toBe('B+');
    expect(res.data.allergies).toContain('Peanuts');
  });

  it('updates student health records via studentsApi.updateStudentHealth', async () => {
    const updateSpy = vi.spyOn(studentsApi.studentsApi, 'updateStudentHealth').mockResolvedValue({
      success: true,
      data: {
        studentId: 'student-uuid-1',
        bloodGroup: 'O+',
        allergies: [],
        medicalConditions: []
      }
    });

    const payload = {
      bloodGroup: 'O+',
      allergies: [],
      medicalConditions: []
    };

    const res = await studentsApi.studentsApi.updateStudentHealth('student-uuid-1', payload);
    expect(updateSpy).toHaveBeenCalledWith('student-uuid-1', payload);
    expect(res.data.bloodGroup).toBe('O+');
  });
});
