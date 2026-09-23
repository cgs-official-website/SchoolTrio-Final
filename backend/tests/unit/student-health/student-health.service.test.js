import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as studentHealthService from '../../../src/modules/student-health/student-health.service.js';
import * as studentHealthRepository from '../../../src/modules/student-health/student-health.repository.js';
import * as parentRepository from '../../../src/modules/parents/parent.repository.js';
import * as auditRepository from '../../../src/modules/audit/audit.repository.js';
import { NotFoundError, ForbiddenError } from '../../../src/utils/app-error.js';
import { SYSTEM_ROLES } from '../../../src/config/constants.js';

vi.mock('../../../src/modules/student-health/student-health.repository.js');
vi.mock('../../../src/modules/parents/parent.repository.js');
vi.mock('../../../src/modules/audit/audit.repository.js');

describe('Student Health Service Unit Tests', () => {
  const schoolId = '11111111-1111-4111-8111-111111111111';
  const studentId = '22222222-2222-4222-8222-222222222222';
  const parentUserId = '33333333-3333-4333-8333-333333333333';
  const parentProfileId = '44444444-4444-4444-8444-444444444444';

  const mockAdminActor = {
    id: 'admin-usr-1',
    email: 'admin@school.edu',
    systemRole: SYSTEM_ROLES.SCHOOL_ADMIN
  };

  const mockParentActor = {
    id: parentUserId,
    userId: parentUserId,
    email: 'parent@home.com',
    systemRole: SYSTEM_ROLES.PARENT
  };

  const mockStudentActor = {
    id: studentId,
    studentId: studentId,
    email: 'student@school.edu',
    systemRole: SYSTEM_ROLES.STUDENT
  };

  const mockStudent = {
    id: studentId,
    schoolId,
    bloodGroup: 'B+',
    customData: {
      previousSchool: 'Saint Jude High',
      identificationMarks: 'Mole on right cheek',
      medicalInfo: 'Mild pollen allergy',
      health: {
        allergies: ['Pollen'],
        medicalConditions: [],
        medications: [],
        emergencyContactName: 'Robert Doe',
        emergencyContactPhone: '9876543210',
        doctorName: 'Dr. House',
        doctorPhone: '9876543211',
        notes: 'Mild pollen allergy'
      }
    },
    updatedAt: new Date('2026-09-18T10:00:00.000Z')
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('formatStudentHealthDto()', () => {
    it('formats raw student model into clean, minimized health DTO', () => {
      const dto = studentHealthService.formatStudentHealthDto(mockStudent);
      expect(dto.studentId).toBe(studentId);
      expect(dto.bloodGroup).toBe('B+');
      expect(dto.allergies).toEqual(['Pollen']);
      expect(dto.doctorName).toBe('Dr. House');
      expect(dto.notes).toBe('Mild pollen allergy');
      expect(dto.previousSchool).toBeUndefined(); // Data minimization check
    });

    it('handles student with null or empty customData gracefully', () => {
      const emptyStudent = {
        id: studentId,
        bloodGroup: null,
        customData: null,
        updatedAt: new Date()
      };
      const dto = studentHealthService.formatStudentHealthDto(emptyStudent);
      expect(dto.bloodGroup).toBeNull();
      expect(dto.allergies).toEqual([]);
      expect(dto.medicalConditions).toEqual([]);
      expect(dto.doctorName).toBeNull();
      expect(dto.notes).toBeNull();
    });
  });

  describe('getStudentHealth()', () => {
    it('returns health DTO for institutional administrator', async () => {
      vi.spyOn(studentHealthRepository, 'findStudentHealth').mockResolvedValue(mockStudent);

      const result = await studentHealthService.getStudentHealth(schoolId, studentId, mockAdminActor);
      expect(result.studentId).toBe(studentId);
      expect(result.bloodGroup).toBe('B+');
    });

    it('allows linked parent to read child health record', async () => {
      vi.spyOn(studentHealthRepository, 'findStudentHealth').mockResolvedValue(mockStudent);
      vi.spyOn(parentRepository, 'findParentByUserId').mockResolvedValue({ id: parentProfileId });
      vi.spyOn(parentRepository, 'findParentStudentLink').mockResolvedValue({ id: 'link-1' });

      const result = await studentHealthService.getStudentHealth(schoolId, studentId, mockParentActor);
      expect(result.studentId).toBe(studentId);
      expect(parentRepository.findParentStudentLink).toHaveBeenCalledWith(schoolId, studentId, parentProfileId);
    });

    it('blocks unlinked parent with 403 Forbidden', async () => {
      vi.spyOn(studentHealthRepository, 'findStudentHealth').mockResolvedValue(mockStudent);
      vi.spyOn(parentRepository, 'findParentByUserId').mockResolvedValue({ id: parentProfileId });
      vi.spyOn(parentRepository, 'findParentStudentLink').mockResolvedValue(null);

      await expect(
        studentHealthService.getStudentHealth(schoolId, studentId, mockParentActor)
      ).rejects.toThrow(ForbiddenError);
    });

    it('allows student to view own health record', async () => {
      vi.spyOn(studentHealthRepository, 'findStudentHealth').mockResolvedValue(mockStudent);

      const result = await studentHealthService.getStudentHealth(schoolId, studentId, mockStudentActor);
      expect(result.studentId).toBe(studentId);
    });

    it('blocks student from viewing other student health records', async () => {
      vi.spyOn(studentHealthRepository, 'findStudentHealth').mockResolvedValue(mockStudent);

      const otherStudentActor = {
        id: 'other-student-id',
        studentId: 'other-student-id',
        systemRole: SYSTEM_ROLES.STUDENT
      };

      await expect(
        studentHealthService.getStudentHealth(schoolId, studentId, otherStudentActor)
      ).rejects.toThrow(ForbiddenError);
    });

    it('throws NotFoundError when student does not exist in tenant', async () => {
      vi.spyOn(studentHealthRepository, 'findStudentHealth').mockResolvedValue(null);

      await expect(
        studentHealthService.getStudentHealth(schoolId, 'non-existent-student', mockAdminActor)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('updateStudentHealth()', () => {
    it('preserves unrelated customData while updating health and bloodGroup', async () => {
      vi.spyOn(studentHealthRepository, 'findStudentHealth').mockResolvedValue(mockStudent);
      vi.spyOn(studentHealthRepository, 'updateStudentHealth').mockImplementation(
        async (sId, stId, payload) => ({
          ...mockStudent,
          bloodGroup: payload.bloodGroup || mockStudent.bloodGroup,
          customData: payload.customData
        })
      );
      vi.spyOn(auditRepository, 'createAuditLog').mockResolvedValue({});

      const updatePayload = {
        bloodGroup: 'AB+',
        allergies: ['Peanuts', 'Penicillin'],
        notes: 'Updated medical notes'
      };

      const result = await studentHealthService.updateStudentHealth(
        schoolId,
        studentId,
        updatePayload,
        mockAdminActor
      );

      expect(result.bloodGroup).toBe('AB+');
      expect(result.allergies).toEqual(['Peanuts', 'Penicillin']);
      expect(result.notes).toBe('Updated medical notes');

      // Verify customData preserve
      expect(studentHealthRepository.updateStudentHealth).toHaveBeenCalledWith(
        schoolId,
        studentId,
        expect.objectContaining({
          bloodGroup: 'AB+',
          customData: expect.objectContaining({
            previousSchool: 'Saint Jude High', // Preserved!
            identificationMarks: 'Mole on right cheek', // Preserved!
            medicalInfo: 'Updated medical notes', // Synced!
            health: expect.objectContaining({
              allergies: ['Peanuts', 'Penicillin'],
              doctorName: 'Dr. House' // Preserved from previous health object!
            })
          })
        })
      );

      // Verify privacy-safe audit record (no sensitive medical info inside modifiedFields)
      expect(auditRepository.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actionPerformed: 'UPDATE_STUDENT_HEALTH',
          entityType: 'StudentHealth',
          modifiedFields: {
            hasBloodGroup: true,
            updatedFields: ['bloodGroup', 'allergies', 'notes']
          }
        })
      );
    });

    it('blocks parents and students from updating health records with 403 Forbidden', async () => {
      vi.spyOn(studentHealthRepository, 'findStudentHealth').mockResolvedValue(mockStudent);

      await expect(
        studentHealthService.updateStudentHealth(schoolId, studentId, { bloodGroup: 'O+' }, mockParentActor)
      ).rejects.toThrow(ForbiddenError);

      await expect(
        studentHealthService.updateStudentHealth(schoolId, studentId, { bloodGroup: 'O+' }, mockStudentActor)
      ).rejects.toThrow(ForbiddenError);
    });
  });
});
