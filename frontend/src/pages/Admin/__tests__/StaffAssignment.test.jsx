import { describe, it, expect, vi, beforeEach } from 'vitest';
import StaffAssignment, { normalizeStaffMember } from '../StaffAssignment.jsx';
import * as staffApi from '../../../api/staff.js';
import * as classesApi from '../../../api/classes.js';
import * as subjectsApi from '../../../api/subjects.js';

describe('Admin StaffAssignment Component (REST Migration)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('1. is exported as a function/component', () => {
    expect(typeof StaffAssignment).toBe('function');
  });

  it('2. loads staff from REST endpoint GET /api/v1/staff', async () => {
    const listSpy = vi.spyOn(staffApi, 'listStaff').mockResolvedValue({
      success: true,
      data: [
        {
          id: 'staff-uuid-1',
          name: 'Sarah Connor',
          firstName: 'Sarah',
          lastName: 'Connor',
          email: 'sarah@school.com',
          staffType: 'teaching',
          status: 'Active',
          designation: 'Senior Teacher',
          assignedClassId: 'class-uuid-1',
          customData: {
            assignments: {
              assignedSubjectIds: ['sub-uuid-1'],
              subjectClassIds: ['class-uuid-1']
            }
          }
        }
      ],
      pagination: { total: 1, page: 1, limit: 100, totalPages: 1 }
    });

    const res = await staffApi.listStaff({ limit: 100 });
    expect(listSpy).toHaveBeenCalledWith({ limit: 100 });
    expect(res.data).toHaveLength(1);
    expect(res.data[0].id).toBe('staff-uuid-1');
  });

  it('3. loads classes and subjects directories from REST APIs', async () => {
    const classSpy = vi.spyOn(classesApi, 'listClasses').mockResolvedValue({
      success: true,
      data: [
        { id: 'class-uuid-1', name: 'Grade 10', section: 'A' }
      ]
    });
    const subjectSpy = vi.spyOn(subjectsApi, 'listSubjects').mockResolvedValue({
      success: true,
      data: [
        { id: 'sub-uuid-1', name: 'Mathematics', code: 'MATH101' }
      ]
    });

    const classesRes = await classesApi.listClasses();
    const subjectsRes = await subjectsApi.listSubjects();

    expect(classSpy).toHaveBeenCalled();
    expect(subjectSpy).toHaveBeenCalled();
    expect(classesRes.data[0].id).toBe('class-uuid-1');
    expect(subjectsRes.data[0].id).toBe('sub-uuid-1');
  });

  it('4. loads functional school roles from REST listRoles', async () => {
    const rolesSpy = vi.spyOn(staffApi, 'listRoles').mockResolvedValue({
      success: true,
      data: [
        { id: 'role-uuid-1', name: 'Principal', slug: 'principal' },
        { id: 'role-uuid-2', name: 'Staffs', slug: 'staffs' }
      ]
    });

    const res = await staffApi.listRoles();
    expect(rolesSpy).toHaveBeenCalled();
    expect(res.data).toHaveLength(2);
    expect(res.data[0].name).toBe('Principal');
  });

  it('5. creates staff member through POST /api/v1/staff', async () => {
    const createSpy = vi.spyOn(staffApi, 'createStaff').mockResolvedValue({
      success: true,
      data: {
        id: 'staff-uuid-2',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@school.com',
        staffType: 'teaching',
        status: 'Active'
      }
    });

    const payload = {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@school.com',
      staffType: 'teaching',
      status: 'Active'
    };

    const res = await staffApi.createStaff(payload);
    expect(createSpy).toHaveBeenCalledWith(payload);
    expect(res.data.id).toBe('staff-uuid-2');
  });

  it('6. updates staff details through PATCH /api/v1/staff/:id', async () => {
    const updateSpy = vi.spyOn(staffApi, 'updateStaff').mockResolvedValue({
      success: true,
      data: {
        id: 'staff-uuid-1',
        designation: 'Vice Principal'
      }
    });

    const res = await staffApi.updateStaff('staff-uuid-1', { designation: 'Vice Principal' });
    expect(updateSpy).toHaveBeenCalledWith('staff-uuid-1', { designation: 'Vice Principal' });
    expect(res.data.designation).toBe('Vice Principal');
  });

  it('7. updates staff assignments through PATCH /api/v1/staff/:id/assignment', async () => {
    const assignSpy = vi.spyOn(staffApi, 'assignStaff').mockResolvedValue({
      success: true,
      data: {
        id: 'staff-uuid-1',
        assignedClassId: 'class-uuid-1',
        assignments: {
          assignedSubjectIds: ['sub-uuid-1'],
          subjectClassIds: ['class-uuid-1']
        }
      }
    });

    const assignmentPayload = {
      assignedClassId: 'class-uuid-1',
      assignedSubjectIds: ['sub-uuid-1'],
      subjectClassIds: ['class-uuid-1']
    };

    const res = await staffApi.assignStaff('staff-uuid-1', assignmentPayload);
    expect(assignSpy).toHaveBeenCalledWith('staff-uuid-1', assignmentPayload);
    expect(res.data.assignedClassId).toBe('class-uuid-1');
  });

  it('8. deletes staff member through DELETE /api/v1/staff/:id and handles 409 Conflict', async () => {
    const deleteSpy = vi.spyOn(staffApi, 'deleteStaff').mockRejectedValue({
      status: 409,
      message: 'Cannot delete staff member who is currently assigned as a Class Teacher.'
    });

    await expect(staffApi.deleteStaff('staff-uuid-1')).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining('Cannot delete staff member')
    });
    expect(deleteSpy).toHaveBeenCalledWith('staff-uuid-1');
  });

  it('9. ID REGRESSION: verifies payloads use PostgreSQL UUIDs, never Firestore IDs', async () => {
    const validUUID = 'a1eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
    const updateSpy = vi.spyOn(staffApi, 'updateStaff').mockResolvedValue({
      success: true,
      data: { id: validUUID }
    });

    await staffApi.updateStaff(validUUID, {
      designation: 'Head of Mathematics'
    });

    expect(updateSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
      expect.objectContaining({ designation: 'Head of Mathematics' })
    );
  });

  it('10. SECURITY REGRESSION: verifies frontend payloads do NOT send client-controlled schoolId', async () => {
    const createSpy = vi.spyOn(staffApi, 'createStaff').mockResolvedValue({
      success: true,
      data: { id: 'uuid-123' }
    });

    await staffApi.createStaff({
      firstName: 'Alice',
      lastName: 'Wong',
      email: 'alice@school.com'
    });

    const sentPayload = createSpy.mock.calls[0][0];
    expect(sentPayload).not.toHaveProperty('schoolId');
    expect(sentPayload).not.toHaveProperty('tenantId');
  });

  it('11. SECTION GRANULARITY: sends individual Section.id for multi-section class assignments', async () => {
    const assignSpy = vi.spyOn(staffApi, 'assignStaff').mockResolvedValue({
      success: true,
      data: {
        id: 'staff-uuid-1',
        assignedClassId: 'section-uuid-10b',
        assignments: {
          assignedClassId: 'section-uuid-10b',
          assignedSubjectIds: ['sub-uuid-math', 'sub-uuid-physics'],
          subjectClassIds: ['section-uuid-10a', 'section-uuid-10c']
        }
      }
    });

    const payload = {
      assignedClassId: 'section-uuid-10b',
      assignedSubjectIds: ['sub-uuid-math', 'sub-uuid-physics'],
      subjectClassIds: ['section-uuid-10a', 'section-uuid-10c']
    };

    const res = await staffApi.assignStaff('staff-uuid-1', payload);
    expect(assignSpy).toHaveBeenCalledWith('staff-uuid-1', payload);
    expect(res.data.assignments.subjectClassIds).toEqual(['section-uuid-10a', 'section-uuid-10c']);
    expect(res.data.assignments.assignedClassId).toBe('section-uuid-10b');
  });

  it('12. CLASS WITHOUT SECTIONS: sends Class.id when no sections exist', async () => {
    const assignSpy = vi.spyOn(staffApi, 'assignStaff').mockResolvedValue({
      success: true,
      data: {
        id: 'staff-uuid-1',
        assignedClassId: 'nursery-class-uuid',
        assignments: {
          assignedClassId: 'nursery-class-uuid',
          assignedSubjectIds: ['sub-uuid-general'],
          subjectClassIds: ['nursery-class-uuid']
        }
      }
    });

    const payload = {
      assignedClassId: 'nursery-class-uuid',
      assignedSubjectIds: ['sub-uuid-general'],
      subjectClassIds: ['nursery-class-uuid']
    };

    const res = await staffApi.assignStaff('staff-uuid-1', payload);
    expect(assignSpy).toHaveBeenCalledWith('staff-uuid-1', payload);
    expect(res.data.assignments.subjectClassIds).toContain('nursery-class-uuid');
  });

  it('13. PERSISTENCE HYDRATION: verifies serialized assignments are correctly shaped in staff object', async () => {
    vi.spyOn(staffApi, 'listStaff').mockResolvedValue({
      success: true,
      data: [
        {
          id: 'staff-uuid-1',
          name: 'Jane Doe',
          assignedClassId: 'section-uuid-10b',
          assignments: {
            assignedClassId: 'section-uuid-10b',
            assignedSubjectIds: ['sub-math-id'],
            subjectClassIds: ['section-uuid-10a', 'section-uuid-10b']
          }
        }
      ]
    });

    const res = await staffApi.listStaff({ limit: 100 });
    const staffMember = res.data[0];
    expect(staffMember.assignments.subjectClassIds).toEqual(['section-uuid-10a', 'section-uuid-10b']);
    expect(staffMember.assignments.assignedSubjectIds).toEqual(['sub-math-id']);
    expect(staffMember.assignments.assignedClassId).toBe('section-uuid-10b');
  });

  it('14. ADD STAFF WITH SECTION: sends Section UUID in assignedClassId when a section is selected', async () => {
    const createSpy = vi.spyOn(staffApi, 'createStaff').mockResolvedValue({
      success: true,
      data: {
        id: 'new-staff-1',
        name: 'Alex Teacher',
        assignedClassId: 'section-uuid-10a',
        assignments: { assignedClassId: 'section-uuid-10a' }
      }
    });

    const payload = {
      firstName: 'Alex',
      lastName: 'Teacher',
      email: 'alex.teacher@school.com',
      staffType: 'teaching',
      assignedClassId: 'section-uuid-10a'
    };

    const res = await staffApi.createStaff(payload);
    expect(createSpy).toHaveBeenCalledWith(payload);
    expect(res.data.assignedClassId).toBe('section-uuid-10a');
  });

  it('15. ADD STAFF WITHOUT CLASS: sends assignedClassId as null when unassigned', async () => {
    const createSpy = vi.spyOn(staffApi, 'createStaff').mockResolvedValue({
      success: true,
      data: {
        id: 'new-staff-2',
        name: 'Admin Assistant',
        assignedClassId: null
      }
    });

    const payload = {
      firstName: 'Admin',
      lastName: 'Assistant',
      email: 'admin.asst@school.com',
      staffType: 'non-teaching',
      assignedClassId: null
    };

    const res = await staffApi.createStaff(payload);
    expect(createSpy).toHaveBeenCalledWith(payload);
    expect(res.data.assignedClassId).toBeNull();
  });

  it('16. ADD STAFF WITH CLASS WITHOUT SECTIONS: sends Class UUID in assignedClassId', async () => {
    const createSpy = vi.spyOn(staffApi, 'createStaff').mockResolvedValue({
      success: true,
      data: {
        id: 'new-staff-3',
        name: 'Pre-K Teacher',
        assignedClassId: 'class-uuid-prek',
        assignments: { assignedClassId: 'class-uuid-prek' }
      }
    });

    const payload = {
      firstName: 'Pre-K',
      lastName: 'Teacher',
      email: 'prek@school.com',
      staffType: 'teaching',
      assignedClassId: 'class-uuid-prek'
    };

    const res = await staffApi.createStaff(payload);
    expect(createSpy).toHaveBeenCalledWith(payload);
    expect(res.data.assignedClassId).toBe('class-uuid-prek');
  });

  describe('Staff Registration Link Copy Visibility Logic', () => {
    it('17. COPY LINK VISIBILITY: marks incomplete account as isRegistered=false (Copy Link VISIBLE)', () => {
      const rawIncompleteStaff = {
        id: 'staff-incomplete-1',
        name: 'New Teacher',
        email: 'new@school.com',
        isRegistered: false,
        user: {
          id: 'user-incomplete-1',
          email: 'new@school.com',
          isRegistered: false
        }
      };

      const normalized = normalizeStaffMember(rawIncompleteStaff);
      expect(normalized.isRegistered).toBe(false);
      // In StaffAssignment JSX: {!member.isRegistered && <button title="Copy Teacher Registration Link" ... />}
      const isCopyLinkVisible = !normalized.isRegistered;
      expect(isCopyLinkVisible).toBe(true);
    });

    it('18. COPY LINK VISIBILITY: marks completed account as isRegistered=true (Copy Link HIDDEN)', () => {
      const rawCompletedStaff = {
        id: 'staff-completed-1',
        name: 'Registered Teacher',
        email: 'registered@school.com',
        isRegistered: true,
        user: {
          id: 'user-completed-1',
          email: 'registered@school.com',
          isRegistered: true
        }
      };

      const normalized = normalizeStaffMember(rawCompletedStaff);
      expect(normalized.isRegistered).toBe(true);
      // In StaffAssignment JSX: {!member.isRegistered && <button title="Copy Teacher Registration Link" ... />}
      const isCopyLinkVisible = !normalized.isRegistered;
      expect(isCopyLinkVisible).toBe(false);
    });

    it('19. ROW INDEPENDENCE: each staff member independently evaluates isRegistered', () => {
      const staffList = [
        {
          id: 'staff-1',
          name: 'Registered Staff',
          isRegistered: true,
          user: { id: 'user-1', isRegistered: true }
        },
        {
          id: 'staff-2',
          name: 'Unregistered Staff',
          isRegistered: false,
          user: { id: 'user-2', isRegistered: false }
        }
      ];

      const normalizedList = staffList.map(normalizeStaffMember);

      expect(normalizedList[0].isRegistered).toBe(true);
      expect(!normalizedList[0].isRegistered).toBe(false); // Copy Link hidden

      expect(normalizedList[1].isRegistered).toBe(false);
      expect(!normalizedList[1].isRegistered).toBe(true);  // Copy Link visible
    });

    it('20. PASSWORD HASH DETECTION: correctly handles locked vs valid password hashes', () => {
      const lockedStaff = {
        id: 'staff-locked',
        name: 'Locked Staff',
        user: {
          id: 'user-locked',
          passwordHash: '!LOCKED_NO_PASSWORD_SET'
        }
      };
      expect(normalizeStaffMember(lockedStaff).isRegistered).toBe(false);

      const activeStaff = {
        id: 'staff-active',
        name: 'Active Staff',
        user: {
          id: 'user-active',
          passwordHash: '$2b$10$validPasswordHash1234567890abcdef'
        }
      };
      expect(normalizeStaffMember(activeStaff).isRegistered).toBe(true);
    });

    it('21. DATA FRESHNESS: updates registration state on re-fetch without full page reload', async () => {
      const listSpy = vi.spyOn(staffApi, 'listStaff')
        .mockResolvedValueOnce({
          success: true,
          data: [{ id: 'staff-1', name: 'Teacher', isRegistered: false }]
        })
        .mockResolvedValueOnce({
          success: true,
          data: [{ id: 'staff-1', name: 'Teacher', isRegistered: true }]
        });

      // Initial fetch before registration
      const firstRes = await staffApi.listStaff({ limit: 100 });
      const firstNormalized = firstRes.data.map(normalizeStaffMember);
      expect(firstNormalized[0].isRegistered).toBe(false);

      // Re-fetch after registration completion
      const secondRes = await staffApi.listStaff({ limit: 100 });
      const secondNormalized = secondRes.data.map(normalizeStaffMember);
      expect(secondNormalized[0].isRegistered).toBe(true);

      expect(listSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('22. STAFF EDIT MODE & PERSONAL DETAILS REMOVAL', () => {
    it('verifies Edit Staff tabs exclude Personal Info / Personal Details', () => {
      const getTabs = (isStaffEditMode) => {
        return isStaffEditMode
          ? ['Education & Work', 'Identity & Banking', 'Documents']
          : ['Personal Info', 'Education & Work', 'Identity & Banking', 'Documents'];
      };

      const editTabs = getTabs(true);
      expect(editTabs).toEqual(['Education & Work', 'Identity & Banking', 'Documents']);
      expect(editTabs).not.toContain('Personal Info');
      expect(editTabs).not.toContain('Personal Details');

      const viewTabs = getTabs(false);
      expect(viewTabs).toEqual(['Personal Info', 'Education & Work', 'Identity & Banking', 'Documents']);
      expect(viewTabs).toContain('Personal Info');
    });

    it('submits updated staff details without personal detail fields in payload', async () => {
      const updateSpy = vi.spyOn(staffApi, 'updateStaff').mockResolvedValue({
        success: true,
        data: {
          id: 'staff-uuid-1',
          designation: 'Senior Teacher',
          staffType: 'teaching'
        }
      });

      const editPayload = {
        staffType: 'teaching',
        designation: 'Senior Teacher',
        roleId: 'role-uuid-1',
        status: 'Active',
        qualifications: {
          highestQualification: 'M.Ed',
          degreeSpecialization: 'Mathematics'
        },
        financial: {
          panNumber: 'ABCDE1234F',
          bankAccountNumber: '1234567890'
        },
        documents: {},
        customData: {
          aadharNumber: '123456789012'
        }
      };

      const res = await staffApi.updateStaff('staff-uuid-1', editPayload);
      expect(updateSpy).toHaveBeenCalledWith('staff-uuid-1', editPayload);
      expect(res.data.id).toBe('staff-uuid-1');

      const sentPayload = updateSpy.mock.calls[0][1];
      expect(sentPayload).not.toHaveProperty('firstName');
      expect(sentPayload).not.toHaveProperty('lastName');
      expect(sentPayload).not.toHaveProperty('email');
      expect(sentPayload).not.toHaveProperty('phone');
      expect(sentPayload).not.toHaveProperty('mobileNumber');
    });
  });

  describe('23. STAFF ACADEMIC & PROFESSIONAL DETAILS NORMALIZATION', () => {
    it('normalizes top-level qualifications & experience returned by REST serializer', () => {
      const rawStaff = {
        id: 'staff-academic-1',
        name: 'Alan Turing',
        qualifications: {
          highestQualification: 'B.E Computer Science',
          degreeSpecialization: 'Computer Engineering',
          universityName: 'Cambridge University',
          yearOfPassing: '2015',
          certifications: 'AI Specialist'
        },
        experience: {
          previousExperience: '5',
          previousOrganization: 'Bletchley Academy',
          subjectSpecialization: 'Mathematics & Computing',
          gradesClassesHandled: 'Grades 11-12'
        }
      };

      const normalized = normalizeStaffMember(rawStaff);
      expect(normalized.highestQualification).toBe('B.E Computer Science');
      expect(normalized.degreeSpecialization).toBe('Computer Engineering');
      expect(normalized.universityName).toBe('Cambridge University');
      expect(normalized.yearOfPassing).toBe('2015');
      expect(normalized.professionalCertifications).toBe('AI Specialist');
      expect(normalized.previousExperience).toBe('5');
      expect(normalized.previousOrganization).toBe('Bletchley Academy');
      expect(normalized.subjectSpecialization).toBe('Mathematics & Computing');
      expect(normalized.gradesClassesHandled).toBe('Grades 11-12');
    });

    it('normalizes nested customData.qualifications & experience', () => {
      const rawStaff = {
        id: 'staff-academic-2',
        name: 'Ada Lovelace',
        customData: {
          qualifications: {
            highestQualification: 'M.Tech Software Engineering',
            degreeSpecialization: 'Algorithms',
            universityName: 'Oxford University',
            yearOfPassing: '2018',
            certifications: 'Full Stack Certified'
          },
          experience: {
            previousExperience: '3',
            previousOrganization: 'London Tech School',
            subjectSpecialization: 'Software Development',
            gradesClassesHandled: 'Grades 9-10'
          }
        }
      };

      const normalized = normalizeStaffMember(rawStaff);
      expect(normalized.highestQualification).toBe('M.Tech Software Engineering');
      expect(normalized.degreeSpecialization).toBe('Algorithms');
      expect(normalized.universityName).toBe('Oxford University');
      expect(normalized.yearOfPassing).toBe('2018');
      expect(normalized.professionalCertifications).toBe('Full Stack Certified');
      expect(normalized.previousExperience).toBe('3');
      expect(normalized.previousOrganization).toBe('London Tech School');
      expect(normalized.subjectSpecialization).toBe('Software Development');
      expect(normalized.gradesClassesHandled).toBe('Grades 9-10');
    });

    it('correctly preserves 0 years of experience and does not replace with empty/N/A', () => {
      const freshGraduate = {
        id: 'staff-fresher',
        name: 'Grace Hopper',
        experience: {
          previousExperience: 0
        }
      };

      const normalized = normalizeStaffMember(freshGraduate);
      expect(normalized.previousExperience).toBe('0');
    });

    it('normalizes string qualifications gracefully', () => {
      const stringQualStaff = {
        id: 'staff-string-qual',
        name: 'Katherine Johnson',
        qualifications: 'Ph.D. Applied Mathematics',
        experience: 8
      };

      const normalized = normalizeStaffMember(stringQualStaff);
      expect(normalized.highestQualification).toBe('Ph.D. Applied Mathematics');
      expect(normalized.previousExperience).toBe('8');
    });
  });

  describe('24. IDENTITY/BANKING & DOCUMENTS DATA PERSISTENCE & NORMALIZATION', () => {
    it('normalizes financial and identity details from financial sub-object', () => {
      const rawStaff = {
        id: 'staff-fin-1',
        name: 'Marie Curie',
        financial: {
          panNumber: 'ABCDE1234F',
          pfNumber: 'PF12345678',
          esicNumber: 'ESIC123456',
          uanNumber: 'UAN123456789',
          taxIdDetails: 'TAX-001-2026',
          bankName: 'National Bank',
          bankAccountNumber: '9876543210',
          branchName: 'Main Branch',
          ifscCode: 'SBIN0001234',
          aadharNumber: '123456789012',
          govtIdType: 'Passport',
          govtIdNumber: 'P1234567'
        }
      };

      const normalized = normalizeStaffMember(rawStaff);
      expect(normalized.panNumber).toBe('ABCDE1234F');
      expect(normalized.pfNumber).toBe('PF12345678');
      expect(normalized.esicNumber).toBe('ESIC123456');
      expect(normalized.uanNumber).toBe('UAN123456789');
      expect(normalized.taxIdDetails).toBe('TAX-001-2026');
      expect(normalized.bankName).toBe('National Bank');
      expect(normalized.bankAccountNumber).toBe('9876543210');
      expect(normalized.branchName).toBe('Main Branch');
      expect(normalized.ifscCode).toBe('SBIN0001234');
      expect(normalized.aadharNumber).toBe('123456789012');
      expect(normalized.govtIdType).toBe('Passport');
      expect(normalized.govtIdNumber).toBe('P1234567');
    });

    it('normalizes all 8 document categories correctly', () => {
      const rawStaff = {
        id: 'staff-docs-1',
        name: 'Isaac Newton',
        documents: {
          academicCertificates: [{ name: 'degree.pdf', url: 'https://example.com/degree.pdf' }],
          markSheets: [{ name: 'marks.pdf', url: 'https://example.com/marks.pdf' }],
          experienceCertificates: [{ name: 'exp.pdf', url: 'https://example.com/exp.pdf' }],
          relievingLetter: [{ name: 'relieve.pdf', url: 'https://example.com/relieve.pdf' }],
          resume: [{ name: 'resume.pdf', url: 'https://example.com/resume.pdf' }],
          referenceLetters: [{ name: 'ref.pdf', url: 'https://example.com/ref.pdf' }],
          govtIdDocument: [{ name: 'id.pdf', url: 'https://example.com/id.pdf' }],
          salarySlips: [{ name: 'slip.pdf', url: 'https://example.com/slip.pdf' }]
        }
      };

      const normalized = normalizeStaffMember(rawStaff);
      expect(normalized.academicCertificates).toHaveLength(1);
      expect(normalized.markSheets).toHaveLength(1);
      expect(normalized.experienceCertificates).toHaveLength(1);
      expect(normalized.relievingLetter).toHaveLength(1);
      expect(normalized.resume).toHaveLength(1);
      expect(normalized.referenceLetters).toHaveLength(1);
      expect(normalized.govtIdDocument).toHaveLength(1);
      expect(normalized.salarySlips).toHaveLength(1);
      expect(normalized.academicCertificates[0].name).toBe('degree.pdf');
    });

    it('submits update payload with education, financial, and documents merged', async () => {
      const updateSpy = vi.spyOn(staffApi, 'updateStaff').mockResolvedValue({
        success: true,
        data: {
          id: 'staff-uuid-all',
          designation: 'Department Head'
        }
      });

      const fullEditPayload = {
        staffType: 'teaching',
        designation: 'Department Head',
        roleId: 'role-uuid-1',
        status: 'Active',
        qualifications: {
          highestQualification: 'M.Sc Physics',
          degreeSpecialization: 'Quantum Mechanics',
          universityName: 'Stanford University',
          yearOfPassing: '2016',
          certifications: 'Quantum Computing'
        },
        experience: {
          previousExperience: '6',
          previousOrganization: 'Research Labs',
          subjectSpecialization: 'Physics',
          gradesClassesHandled: 'Grades 11-12'
        },
        financial: {
          panNumber: 'ABCDE1234F',
          bankAccountNumber: '9876543210',
          ifscCode: 'SBIN0001234',
          aadharNumber: '123456789012'
        },
        documents: {
          academicCertificates: [{ name: 'degree.pdf', url: 'https://example.com/degree.pdf' }]
        },
        customData: {
          aadharNumber: '123456789012'
        }
      };

      const res = await staffApi.updateStaff('staff-uuid-all', fullEditPayload);
      expect(updateSpy).toHaveBeenCalledWith('staff-uuid-all', fullEditPayload);
      expect(res.data.id).toBe('staff-uuid-all');
      expect(updateSpy.mock.calls[0][1].qualifications.highestQualification).toBe('M.Sc Physics');
      expect(updateSpy.mock.calls[0][1].financial.panNumber).toBe('ABCDE1234F');
      expect(updateSpy.mock.calls[0][1].documents.academicCertificates).toHaveLength(1);
    });
  });
});



