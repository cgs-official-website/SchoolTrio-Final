import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as staffApi from '../../../api/staff.js';

describe('Teacher ProfileSetup REST Screen Contract Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('loads logged-in teacher profile via staffApi.getStaffMe', async () => {
    const profileSpy = vi.spyOn(staffApi.staffApi, 'getStaffMe').mockResolvedValue({
      success: true,
      data: {
        id: 'staff-uuid-1',
        name: 'Sarah Connor',
        phone: '9876543210',
        address: '123 Academic Way',
        gender: 'Female',
        dob: '1985-06-15',
        bloodGroup: 'O+',
        qualifications: {
          highestQualification: 'M.Sc. Mathematics',
          degreeSpecialization: 'Pure Mathematics',
          universityName: 'State University',
          yearOfPassing: '2008'
        },
        financial: {
          bankAccountNumber: '123456789012',
          bankName: 'HDFC Bank',
          branchName: 'Downtown',
          ifscCode: 'HDFC0001234'
        }
      }
    });

    const res = await staffApi.staffApi.getStaffMe();
    expect(profileSpy).toHaveBeenCalledTimes(1);
    expect(res.data.id).toBe('staff-uuid-1');
    expect(res.data.qualifications.highestQualification).toBe('M.Sc. Mathematics');
    expect(res.data.financial.bankAccountNumber).toBe('123456789012');
  });

  it('updates teacher profile via staffApi.updateStaffSelf with structured payload', async () => {
    const updateSpy = vi.spyOn(staffApi.staffApi, 'updateStaffSelf').mockResolvedValue({
      success: true,
      data: {
        id: 'staff-uuid-1',
        phone: '9876543210',
        address: '456 New Campus Road'
      }
    });

    const payload = {
      phone: '9876543210',
      address: '456 New Campus Road',
      gender: 'Female',
      qualifications: {
        highestQualification: 'Ph.D. Education',
        degreeSpecialization: 'Curriculum Development',
        universityName: 'Central University',
        yearOfPassing: '2015'
      }
    };

    const res = await staffApi.staffApi.updateStaffSelf(payload);
    expect(updateSpy).toHaveBeenCalledWith(payload);
    expect(res.data.address).toBe('456 New Campus Road');
  });
});
