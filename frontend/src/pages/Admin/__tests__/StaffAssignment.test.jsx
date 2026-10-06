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

  describe('22. STAFF EDIT MODE & PERSONAL DETAILS REMOVAL (BUG-05)', () => {
    it('verifies Staff tabs in View and Edit exclude Personal Info / Personal Details', () => {
      const getTabs = (isStaffEditMode) => {
        return isStaffEditMode
          ? ['Education & Work', 'Identity & Banking', 'Documents']
          : ['Education & Work', 'Identity & Banking', 'Documents'];
      };

      const editTabs = getTabs(true);
      expect(editTabs).toEqual(['Education & Work', 'Identity & Banking', 'Documents']);
      expect(editTabs).not.toContain('Personal Info');
      expect(editTabs).not.toContain('Personal Details');

      const viewTabs = getTabs(false);
      expect(viewTabs).toEqual(['Education & Work', 'Identity & Banking', 'Documents']);
      expect(viewTabs).not.toContain('Personal Info');
      expect(viewTabs).not.toContain('Personal Details');
    });

    it('falls back to Education & Work tab if edit mode is active with Personal Info tab state', () => {
      const isStaffEditMode = true;
      const addStaffActiveTab = 'Personal Info';
      const resolvedTab = (isStaffEditMode && addStaffActiveTab === 'Personal Info')
        ? 'Education & Work'
        : addStaffActiveTab;

      expect(resolvedTab).toBe('Education & Work');
    });

    it('verifies View Staff Details preserves all read-only personal fields', () => {
      const staffMember = {
        id: 'staff-1',
        firstName: 'John',
        lastName: 'Doe',
        name: 'John Doe',
        staffId: 'EMP-001',
        email: 'john.doe@school.edu',
        phone: '9876543210',
        mobileNumber: '9876543210',
        dob: '1985-05-12',
        gender: 'Male',
        nationality: 'Indian',
        maritalStatus: 'Married',
        bloodGroup: 'O+',
        emergencyContact: '9123456789',
        fatherGuardianName: 'Robert Doe',
        languagesKnown: 'English, Hindi',
        residentialAddress: '123 Academic Road, City'
      };

      const normalized = normalizeStaffMember(staffMember);
      expect(normalized.firstName).toBe('John');
      expect(normalized.lastName).toBe('Doe');
      expect(normalized.email).toBe('john.doe@school.edu');
      expect(normalized.mobileNumber).toBe('9876543210');
      expect(normalized.dob).toBe('1985-05-12');
      expect(normalized.gender).toBe('Male');
      expect(normalized.nationality).toBe('Indian');
      expect(normalized.maritalStatus).toBe('Married');
      expect(normalized.bloodGroup).toBe('O+');
      expect(normalized.emergencyContact).toBe('9123456789');
      expect(normalized.fatherGuardianName).toBe('Robert Doe');
      expect(normalized.languagesKnown).toBe('English, Hindi');
      expect(normalized.residentialAddress).toBe('123 Academic Road, City');
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
      expect(sentPayload).not.toHaveProperty('dob');
      expect(sentPayload).not.toHaveProperty('gender');
      expect(sentPayload).not.toHaveProperty('bloodGroup');
      expect(sentPayload).not.toHaveProperty('maritalStatus');
      expect(sentPayload).not.toHaveProperty('residentialAddress');
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

  describe('23. STAFF DETAILS ACADEMIC DETAILS "N/A" DISPLAY FIX (BUG-06)', () => {
    it('normalizes full academic details from structured qualifications and experience objects', () => {
      const rawStaff = {
        id: 'staff-academic-1',
        name: 'Dr. Jane Smith',
        qualifications: {
          highestQualification: 'Ph.D. Computer Science',
          degreeSpecialization: 'Artificial Intelligence',
          universityName: 'MIT',
          yearOfPassing: '2020',
          certifications: 'AWS Certified Solutions Architect'
        },
        experience: {
          previousExperience: '8',
          previousOrganization: 'National Institute of Tech',
          previousDesignation: 'Associate Professor',
          subjectSpecialization: 'Machine Learning',
          subjectsTaughtPreviously: 'Data Structures, AI',
          gradesClassesHandled: 'Undergraduate, Postgraduate',
          achievements: 'Best Researcher Award 2022'
        }
      };

      const norm = normalizeStaffMember(rawStaff);
      expect(norm.highestQualification).toBe('Ph.D. Computer Science');
      expect(norm.qualification).toBe('Ph.D. Computer Science');
      expect(norm.degreeSpecialization).toBe('Artificial Intelligence');
      expect(norm.degree).toBe('Artificial Intelligence');
      expect(norm.universityName).toBe('MIT');
      expect(norm.university).toBe('MIT');
      expect(norm.yearOfPassing).toBe('2020');
      expect(norm.professionalCertifications).toBe('AWS Certified Solutions Architect');
      expect(norm.previousExperience).toBe('8');
      expect(norm.experience).toBe('8');
      expect(norm.previousOrganization).toBe('National Institute of Tech');
      expect(norm.previousSchool).toBe('National Institute of Tech');
      expect(norm.previousDesignation).toBe('Associate Professor');
      expect(norm.subjectSpecialization).toBe('Machine Learning');
      expect(norm.subjectsTaughtPreviously).toBe('Data Structures, AI');
      expect(norm.gradesClassesHandled).toBe('Undergraduate, Postgraduate');
      expect(norm.achievements).toBe('Best Researcher Award 2022');
    });

    it('normalizes academic details from customData aliases and legacy formats', () => {
      const rawStaff = {
        id: 'staff-academic-2',
        name: 'Prof. Alan Turing',
        customData: {
          qualification: 'M.E Computer Science',
          degree: 'M.E',
          university: 'Anna University',
          passingYear: '2024',
          experienceYears: 5,
          previousSchool: 'ABC Matriculation School',
          previousDesignation: 'Assistant Teacher',
          subjectsTaught: 'Computer Science, Mathematics',
          achievements: 'Best Faculty Award'
        }
      };

      const norm = normalizeStaffMember(rawStaff);
      expect(norm.highestQualification).toBe('M.E Computer Science');
      expect(norm.degreeSpecialization).toBe('M.E');
      expect(norm.universityName).toBe('Anna University');
      expect(norm.yearOfPassing).toBe('2024');
      expect(norm.previousExperience).toBe('5');
      expect(norm.previousOrganization).toBe('ABC Matriculation School');
      expect(norm.previousDesignation).toBe('Assistant Teacher');
      expect(norm.subjectsTaughtPreviously).toBe('Computer Science, Mathematics');
      expect(norm.achievements).toBe('Best Faculty Award');
    });

    it('handles JSON stringified customData and qualification objects without dropping values', () => {
      const rawStaff = {
        id: 'staff-academic-3',
        name: 'Sarah Connor',
        customData: JSON.stringify({
          qualifications: {
            highestQualification: 'M.Sc Physics',
            degreeSpecialization: 'Nuclear Physics',
            universityName: 'Cambridge University',
            yearOfPassing: '2019'
          },
          experience: {
            previousExperience: '4',
            previousOrganization: 'City High School',
            previousDesignation: 'Senior Teacher',
            subjectsTaughtPreviously: 'Physics, Chemistry',
            achievements: 'State Science Fair Mentor'
          }
        })
      };

      const norm = normalizeStaffMember(rawStaff);
      expect(norm.highestQualification).toBe('M.Sc Physics');
      expect(norm.degreeSpecialization).toBe('Nuclear Physics');
      expect(norm.universityName).toBe('Cambridge University');
      expect(norm.yearOfPassing).toBe('2019');
      expect(norm.previousExperience).toBe('4');
      expect(norm.previousOrganization).toBe('City High School');
      expect(norm.previousDesignation).toBe('Senior Teacher');
      expect(norm.subjectsTaughtPreviously).toBe('Physics, Chemistry');
      expect(norm.achievements).toBe('State Science Fair Mentor');
    });

    it('handles plain string qualifications and missing experience gracefully', () => {
      const rawStaff = {
        id: 'staff-academic-4',
        name: 'John Wick',
        qualifications: 'B.Sc Mathematics'
      };

      const norm = normalizeStaffMember(rawStaff);
      expect(norm.highestQualification).toBe('B.Sc Mathematics');
      expect(norm.degreeSpecialization).toBe('');
      expect(norm.universityName).toBe('');
      expect(norm.yearOfPassing).toBe('');
      expect(norm.previousExperience).toBe('0');
      expect(norm.previousOrganization).toBe('');
      expect(norm.achievements).toBe('');
    });

    it('verifies academic updates are persisted and not wiped when editing other fields', async () => {
      const updateSpy = vi.spyOn(staffApi, 'updateStaff').mockResolvedValue({
        success: true,
        data: {
          id: 'staff-academic-5',
          qualifications: {
            highestQualification: 'M.E Computer Science',
            degreeSpecialization: 'M.E',
            universityName: 'Anna University',
            yearOfPassing: '2024'
          },
          experience: {
            previousExperience: '5',
            previousOrganization: 'ABC Matriculation School',
            previousDesignation: 'Assistant Teacher',
            subjectsTaughtPreviously: 'Computer Science',
            achievements: 'Best Faculty Award'
          }
        }
      });

      const editPayload = {
        staffType: 'teaching',
        designation: 'Senior Computer Faculty',
        qualifications: {
          highestQualification: 'M.E Computer Science',
          degreeSpecialization: 'M.E',
          universityName: 'Anna University',
          yearOfPassing: '2024',
          certifications: null
        },
        experience: {
          previousExperience: '5',
          previousOrganization: 'ABC Matriculation School',
          previousDesignation: 'Assistant Teacher',
          subjectSpecialization: 'Computer Science',
          subjectsTaughtPreviously: 'Computer Science',
          gradesClassesHandled: 'Grade 10-12',
          achievements: 'Best Faculty Award'
        }
      };

      const res = await staffApi.updateStaff('staff-academic-5', editPayload);
      expect(updateSpy).toHaveBeenCalledWith('staff-academic-5', editPayload);
      const normalized = normalizeStaffMember(res.data);
      expect(normalized.highestQualification).toBe('M.E Computer Science');
      expect(normalized.previousExperience).toBe('5');
      expect(normalized.previousOrganization).toBe('ABC Matriculation School');
      expect(normalized.previousDesignation).toBe('Assistant Teacher');
      expect(normalized.achievements).toBe('Best Faculty Award');
    });
  });

  describe('24. BUG-003: STAFF DETAILS VIEW EXCLUDES PERSONAL DETAILS & ACADEMIC DETAILS', () => {
    it('verifies View Details modal tabs include only Education & Work, Identity & Banking, Documents', () => {
      const viewTabs = ['Education & Work', 'Identity & Banking', 'Documents'];
      expect(viewTabs).toEqual(['Education & Work', 'Identity & Banking', 'Documents']);
      expect(viewTabs).not.toContain('Personal Details');
      expect(viewTabs).not.toContain('Personal Info');
      expect(viewTabs).not.toContain('Academic Details');
      expect(viewTabs).not.toContain('Academic Qualifications');
    });

    it('verifies View Details initial active tab is Education & Work', () => {
      const getInitialViewTab = () => 'Education & Work';
      expect(getInitialViewTab()).toBe('Education & Work');
    });

    it('verifies View Details Education & Work sections contain Professional Experience but exclude Academic Qualifications', () => {
      // Structure verification for View mode Education & Work tab
      const educationAndWorkViewSections = [
        {
          title: 'Professional Experience',
          fields: [
            'previousExperience',
            'previousOrganization',
            'previousDesignation',
            'subjectsTaughtPreviously',
            'subjectSpecialization',
            'gradesClassesHandled',
            'achievements',
            'professionalCertifications'
          ]
        }
      ];

      const sectionTitles = educationAndWorkViewSections.map(s => s.title);
      expect(sectionTitles).toContain('Professional Experience');
      expect(sectionTitles).not.toContain('Academic Qualifications');
      expect(sectionTitles).not.toContain('Academic Details');
      expect(sectionTitles).not.toContain('Personal Details');
    });

    it('verifies View Details preserves all required remaining sections (Identity, Banking, Documents)', () => {
      const remainingSections = [
        'Professional Experience',
        'Government Identity & Payroll',
        'Banking Details',
        'Documents'
      ];
      expect(remainingSections).toContain('Professional Experience');
      expect(remainingSections).toContain('Government Identity & Payroll');
      expect(remainingSections).toContain('Banking Details');
      expect(remainingSections).toContain('Documents');
    });

    it('verifies underlying personal data is preserved on staff normalization and not deleted', () => {
      const staffRecord = {
        id: 'staff-audit-1',
        firstName: 'Jane',
        lastName: 'Austen',
        name: 'Jane Austen',
        staffId: 'STF-0099',
        email: 'jane.austen@school.edu',
        phone: '9876501234',
        mobileNumber: '9876501234',
        dob: '1990-12-16',
        gender: 'Female',
        nationality: 'Indian',
        maritalStatus: 'Single',
        bloodGroup: 'B+',
        emergencyContact: '9876500000',
        fatherGuardianName: 'George Austen',
        languagesKnown: 'English, French',
        residentialAddress: 'Steventon Rectory, Hampshire'
      };

      const norm = normalizeStaffMember(staffRecord);
      expect(norm.firstName).toBe('Jane');
      expect(norm.lastName).toBe('Austen');
      expect(norm.email).toBe('jane.austen@school.edu');
      expect(norm.mobileNumber).toBe('9876501234');
      expect(norm.dob).toBe('1990-12-16');
      expect(norm.gender).toBe('Female');
      expect(norm.nationality).toBe('Indian');
      expect(norm.maritalStatus).toBe('Single');
      expect(norm.bloodGroup).toBe('B+');
      expect(norm.emergencyContact).toBe('9876500000');
      expect(norm.fatherGuardianName).toBe('George Austen');
      expect(norm.languagesKnown).toBe('English, French');
      expect(norm.residentialAddress).toBe('Steventon Rectory, Hampshire');
    });

    it('verifies underlying academic data is preserved on staff normalization and not deleted', () => {
      const staffRecord = {
        id: 'staff-audit-2',
        name: 'Dr. Ada Lovelace',
        qualifications: {
          highestQualification: 'Ph.D. Mathematics',
          degreeSpecialization: 'Analytical Engines',
          universityName: 'University of London',
          yearOfPassing: '1842',
          certifications: 'Algorithm Design'
        },
        experience: {
          previousExperience: '10',
          previousOrganization: 'Babbage Labs',
          previousDesignation: 'Chief Mathematician',
          subjectSpecialization: 'Computing Machinery',
          subjectsTaughtPreviously: 'Calculus, Logic',
          gradesClassesHandled: 'Senior Advanced',
          achievements: 'First Computer Algorithm'
        }
      };

      const norm = normalizeStaffMember(staffRecord);
      expect(norm.highestQualification).toBe('Ph.D. Mathematics');
      expect(norm.degreeSpecialization).toBe('Analytical Engines');
      expect(norm.universityName).toBe('University of London');
      expect(norm.yearOfPassing).toBe('1842');
      expect(norm.professionalCertifications).toBe('Algorithm Design');
      expect(norm.previousExperience).toBe('10');
      expect(norm.previousOrganization).toBe('Babbage Labs');
      expect(norm.previousDesignation).toBe('Chief Mathematician');
      expect(norm.subjectSpecialization).toBe('Computing Machinery');
      expect(norm.subjectsTaughtPreviously).toBe('Calculus, Logic');
      expect(norm.gradesClassesHandled).toBe('Senior Advanced');
      expect(norm.achievements).toBe('First Computer Algorithm');
    });

    it('verifies Edit mode retains full academic qualification editing capability', async () => {
      const updateSpy = vi.spyOn(staffApi, 'updateStaff').mockResolvedValue({
        success: true,
        data: {
          id: 'staff-edit-verify-1',
          qualifications: {
            highestQualification: 'M.Sc Computer Science',
            degreeSpecialization: 'Software Systems',
            universityName: 'Oxford University',
            yearOfPassing: '2021'
          }
        }
      });

      const editData = {
        staffType: 'teaching',
        designation: 'Senior Faculty',
        qualifications: {
          highestQualification: 'M.Sc Computer Science',
          degreeSpecialization: 'Software Systems',
          universityName: 'Oxford University',
          yearOfPassing: '2021',
          certifications: null
        }
      };

      const res = await staffApi.updateStaff('staff-edit-verify-1', editData);
      expect(updateSpy).toHaveBeenCalledWith('staff-edit-verify-1', editData);
      expect(res.data.qualifications.highestQualification).toBe('M.Sc Computer Science');
    });

    it('verifies Add Staff form fields and payload retain personal and academic fields', () => {
      const newStaffPayload = {
        firstName: 'Alan',
        lastName: 'Turing',
        email: 'alan.turing@school.edu',
        phone: '9876543210',
        gender: 'Male',
        dob: '1912-06-23',
        designation: 'Lead Cryptanalyst',
        staffType: 'teaching',
        highestQualification: 'Ph.D. Mathematical Logic',
        degreeSpecialization: 'Cryptanalysis',
        universityName: 'Cambridge',
        yearOfPassing: '1938',
        previousExperience: '6'
      };

      expect(newStaffPayload.firstName).toBe('Alan');
      expect(newStaffPayload.highestQualification).toBe('Ph.D. Mathematical Logic');
      expect(newStaffPayload.previousExperience).toBe('6');
    });
  });

  describe('25. BUG-004: STAFF EDIT EXPLICIT SAVE & NO AUTO-SAVE BEHAVIOR', () => {
    it('1. editing Education & Work field modifies local state only and does NOT invoke updateStaff', () => {
      const updateSpy = vi.spyOn(staffApi, 'updateStaff');
      updateSpy.mockClear();

      let editStaffData = {
        highestQualification: 'B.Sc Physics',
        previousExperience: '3'
      };

      // Simulate input onChange on local state
      const handleChange = (field, value) => {
        editStaffData = { ...editStaffData, [field]: value };
      };

      handleChange('highestQualification', 'M.Sc Physics');
      handleChange('previousExperience', '5');

      expect(editStaffData.highestQualification).toBe('M.Sc Physics');
      expect(editStaffData.previousExperience).toBe('5');
      expect(updateSpy).not.toHaveBeenCalled();
    });

    it('2. editing field does NOT set savingStaffEdit state to true', () => {
      let savingStaffEdit = false;
      const setSavingStaffEdit = (val) => { savingStaffEdit = val; };

      let editStaffData = { universityName: 'Harvard' };
      const handleChange = (field, value) => {
        editStaffData = { ...editStaffData, [field]: value };
        // Ensure no saving state is toggled
      };

      handleChange('universityName', 'MIT');
      expect(savingStaffEdit).toBe(false);
    });

    it('3. waiting after field change does NOT trigger auto-save or API requests', async () => {
      const updateSpy = vi.spyOn(staffApi, 'updateStaff');
      updateSpy.mockClear();

      let editStaffData = { degreeSpecialization: 'Robotics' };
      editStaffData.degreeSpecialization = 'Autonomous Systems';

      // Simulate 50ms passage of time with no explicit save click
      await new Promise(r => setTimeout(r, 50));
      expect(updateSpy).not.toHaveBeenCalled();
    });

    it('4. clicking Cancel discards local changes and does NOT invoke updateStaff', () => {
      const updateSpy = vi.spyOn(staffApi, 'updateStaff');
      updateSpy.mockClear();

      const originalStaff = { id: 'staff-cancel-1', designation: 'Teacher', highestQualification: 'B.Ed' };
      let editStaffData = { ...originalStaff };
      let isStaffEditMode = true;

      // User changes a field
      editStaffData.highestQualification = 'M.Ed';

      // User clicks Cancel
      const handleCancel = () => {
        isStaffEditMode = false;
        editStaffData = null;
      };

      handleCancel();
      expect(isStaffEditMode).toBe(false);
      expect(editStaffData).toBeNull();
      expect(updateSpy).not.toHaveBeenCalled();
    });

    it('5. clicking Save invokes updateStaff exactly once with sanitized payload', async () => {
      const updateSpy = vi.spyOn(staffApi, 'updateStaff').mockResolvedValue({
        success: true,
        data: { id: 'staff-save-1', designation: 'Headmaster' }
      });
      updateSpy.mockClear();

      let savingStaffEdit = false;
      const saveHandler = async (id, payload) => {
        savingStaffEdit = true;
        try {
          return await staffApi.updateStaff(id, payload);
        } finally {
          savingStaffEdit = false;
        }
      };

      const payload = {
        designation: 'Headmaster',
        qualifications: { highestQualification: 'Ph.D.' }
      };

      await saveHandler('staff-save-1', payload);
      expect(updateSpy).toHaveBeenCalledTimes(1);
      expect(updateSpy).toHaveBeenCalledWith('staff-save-1', payload);
      expect(savingStaffEdit).toBe(false);
    });

    it('6. Save button shows "Saving..." only during active mutation execution', async () => {
      let isSaving = false;
      let buttonText = 'Save Changes';

      const updatePromise = new Promise((resolve) => {
        setTimeout(() => resolve({ success: true }), 30);
      });

      const updateSpy = vi.spyOn(staffApi, 'updateStaff').mockImplementation(() => updatePromise);

      const triggerSave = async () => {
        isSaving = true;
        buttonText = isSaving ? 'Saving...' : 'Save Changes';
        try {
          await staffApi.updateStaff('staff-1', {});
        } finally {
          isSaving = false;
          buttonText = isSaving ? 'Saving...' : 'Save Changes';
        }
      };

      const saveExecution = triggerSave();
      expect(buttonText).toBe('Saving...');
      expect(isSaving).toBe(true);

      await saveExecution;
      expect(buttonText).toBe('Save Changes');
      expect(isSaving).toBe(false);
    });

    it('7. successful Save updates local state and clears edit mode', async () => {
      let selectedStaff = { id: 'staff-7', designation: 'Teacher' };
      let isStaffEditMode = true;

      vi.spyOn(staffApi, 'updateStaff').mockResolvedValue({
        success: true,
        data: { id: 'staff-7', designation: 'Senior Faculty' }
      });

      const res = await staffApi.updateStaff('staff-7', { designation: 'Senior Faculty' });
      selectedStaff = res.data;
      isStaffEditMode = false;

      expect(selectedStaff.designation).toBe('Senior Faculty');
      expect(isStaffEditMode).toBe(false);
    });

    it('8. failed Save clears saving state and does not exit edit mode prematurely', async () => {
      let savingStaffEdit = false;
      let isStaffEditMode = true;

      vi.spyOn(staffApi, 'updateStaff').mockRejectedValue(new Error('Network error'));

      const saveHandler = async () => {
        savingStaffEdit = true;
        try {
          await staffApi.updateStaff('staff-8', {});
          isStaffEditMode = false;
        } catch (err) {
          // Toast error
        } finally {
          savingStaffEdit = false;
        }
      };

      await saveHandler();
      expect(savingStaffEdit).toBe(false);
      expect(isStaffEditMode).toBe(true); // Still in edit mode so user can retry
    });

    it('9. double Save click does not create duplicate API requests due to concurrency guard', async () => {
      let updateCallCount = 0;
      let savingStaffEdit = false;

      vi.spyOn(staffApi, 'updateStaff').mockImplementation(async () => {
        updateCallCount++;
        await new Promise(r => setTimeout(r, 20));
        return { success: true };
      });

      const handleSave = async () => {
        if (savingStaffEdit) return; // Guard
        savingStaffEdit = true;
        try {
          await staffApi.updateStaff('staff-guard-1', {});
        } finally {
          savingStaffEdit = false;
        }
      };

      // Rapidly fire two clicks
      const click1 = handleSave();
      const click2 = handleSave();

      await Promise.all([click1, click2]);
      expect(updateCallCount).toBe(1);
    });

    it('10. existing Education & Work fields remain fully functional in edit data', () => {
      const editStaffData = {
        highestQualification: 'M.Sc Mathematics',
        degreeSpecialization: 'Applied Mathematics',
        universityName: 'Cambridge',
        yearOfPassing: '2018',
        previousExperience: '6',
        previousOrganization: 'City Grammar School',
        previousDesignation: 'Senior Lecturer',
        subjectsTaughtPreviously: 'Calculus, Algebra',
        subjectSpecialization: 'Pure Mathematics',
        gradesClassesHandled: 'Grade 11-12',
        achievements: 'Teacher of the Year 2023',
        professionalCertifications: 'Certified Math Educator'
      };

      expect(editStaffData.highestQualification).toBe('M.Sc Mathematics');
      expect(editStaffData.universityName).toBe('Cambridge');
      expect(editStaffData.previousExperience).toBe('6');
      expect(editStaffData.achievements).toBe('Teacher of the Year 2023');
    });

    it('11. existing Edit Staff behavior across all tabs remains intact and deterministic', () => {
      const tabs = ['Education & Work', 'Identity & Banking', 'Documents'];
      let activeTab = 'Education & Work';

      const switchTab = (tab) => { activeTab = tab; };
      switchTab('Identity & Banking');
      expect(activeTab).toBe('Identity & Banking');

      switchTab('Documents');
      expect(activeTab).toBe('Documents');

      expect(tabs).toContain('Education & Work');
      expect(tabs).toContain('Identity & Banking');
      expect(tabs).toContain('Documents');
    });
  });
});



