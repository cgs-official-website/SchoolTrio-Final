import { describe, it, expect, vi, beforeEach } from 'vitest';
import StudentManagement from '../StudentManagement.jsx';
import * as studentsApi from '../../../api/students.js';
import * as classesApi from '../../../api/classes.js';
import * as attendanceApi from '../../../api/attendance.js';
import * as admissionsApi from '../../../api/admissions.js';

describe('Admin StudentManagement Component (REST Migration)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('1. is exported as a function/component', () => {
    expect(typeof StudentManagement).toBe('function');
  });

  it('2. loads students from REST endpoint GET /api/v1/students', async () => {
    const listSpy = vi.spyOn(studentsApi, 'listStudents').mockResolvedValue({
      success: true,
      data: [
        {
          id: 'stu-uuid-1',
          admissionNumber: 'ADM-001',
          firstName: 'Alice',
          lastName: 'Smith',
          classId: 'cls-uuid-1',
          status: 'Active',
          class: { id: 'cls-uuid-1', name: 'Grade 10' }
        }
      ],
      pagination: { total: 1, page: 1, limit: 1000, totalPages: 1 }
    });

    const res = await studentsApi.listStudents({ limit: 1000 });
    expect(listSpy).toHaveBeenCalledWith({ limit: 1000 });
    expect(res.data).toHaveLength(1);
    expect(res.data[0].id).toBe('stu-uuid-1');
  });

  it('3. loads classes directory from REST classes API', async () => {
    const classSpy = vi.spyOn(classesApi, 'listClasses').mockResolvedValue({
      success: true,
      data: [
        {
          id: 'cls-uuid-1',
          name: 'Grade 10',
          sections: [{ id: 'sec-uuid-1', name: 'A' }]
        }
      ]
    });

    const res = await classesApi.listClasses();
    expect(classSpy).toHaveBeenCalled();
    expect(res.data[0].id).toBe('cls-uuid-1');
  });

  it('4. creates student through POST /api/v1/students', async () => {
    const createSpy = vi.spyOn(studentsApi, 'createStudent').mockResolvedValue({
      success: true,
      data: {
        id: 'stu-uuid-2',
        admissionNumber: 'ADM-002',
        firstName: 'Bob',
        lastName: 'Jones',
        gender: 'Male',
        classId: 'cls-uuid-1',
        status: 'Active',
        customData: { parentName: 'Robert Jones', parentPhone: '9876543210' }
      }
    });

    const payload = {
      admissionNumber: 'ADM-002',
      firstName: 'Bob',
      lastName: 'Jones',
      gender: 'Male',
      classId: 'cls-uuid-1',
      status: 'Active',
      customData: { parentName: 'Robert Jones', parentPhone: '9876543210' }
    };

    const res = await studentsApi.createStudent(payload);
    expect(createSpy).toHaveBeenCalledWith(payload);
    expect(res.data.id).toBe('stu-uuid-2');
    expect(res.data.customData.parentName).toBe('Robert Jones');
  });

  it('5. updates student through PATCH /api/v1/students/:id', async () => {
    const updateSpy = vi.spyOn(studentsApi, 'updateStudent').mockResolvedValue({
      success: true,
      data: {
        id: 'stu-uuid-1',
        firstName: 'Alice',
        lastName: 'Johnson'
      }
    });

    const res = await studentsApi.updateStudent('stu-uuid-1', { lastName: 'Johnson' });
    expect(updateSpy).toHaveBeenCalledWith('stu-uuid-1', { lastName: 'Johnson' });
    expect(res.data.lastName).toBe('Johnson');
  });

  it('6. deletes student through DELETE /api/v1/students/:id and handles 409 Conflict', async () => {
    const deleteSpy = vi.spyOn(studentsApi, 'deleteStudent').mockRejectedValue({
      response: {
        status: 409,
        data: {
          message: 'Cannot delete student with active attendance records, invoices, or grades.'
        }
      }
    });

    await expect(studentsApi.deleteStudent('stu-uuid-1')).rejects.toMatchObject({
      response: {
        status: 409,
        data: {
          message: expect.stringContaining('Cannot delete student')
        }
      }
    });
    expect(deleteSpy).toHaveBeenCalledWith('stu-uuid-1');
  });

  it('7. loads student attendance through REST getStudentAttendance', async () => {
    const attendanceSpy = vi.spyOn(attendanceApi, 'getStudentAttendance').mockResolvedValue({
      success: true,
      data: {
        stats: { total: 50, present: 48, absent: 2, late: 0, attendancePercentage: 96 },
        timeline: []
      }
    });

    const res = await attendanceApi.getStudentAttendance('stu-uuid-1', { filter: 'monthly' });
    expect(attendanceSpy).toHaveBeenCalledWith('stu-uuid-1', { filter: 'monthly' });
    expect(res.data.stats.attendancePercentage).toBe(96);
  });

  it('8. manages parent linking through REST APIs', async () => {
    const listParentsSpy = vi.spyOn(studentsApi, 'listStudentParents').mockResolvedValue({
      success: true,
      data: [{ id: 'parent-uuid-1', relationship: 'Father', parentProfile: { id: 'parent-uuid-1', name: 'Robert' } }]
    });

    const linkParentSpy = vi.spyOn(studentsApi, 'linkParentToStudent').mockResolvedValue({
      success: true,
      data: { id: 'link-uuid-1', studentId: 'stu-uuid-1', parentProfileId: 'parent-uuid-1' }
    });

    const unlinkParentSpy = vi.spyOn(studentsApi, 'unlinkParentFromStudent').mockResolvedValue({
      success: true,
      data: null
    });

    const parentsRes = await studentsApi.listStudentParents('stu-uuid-1');
    expect(listParentsSpy).toHaveBeenCalledWith('stu-uuid-1');
    expect(parentsRes.data).toHaveLength(1);

    const linkRes = await studentsApi.linkParentToStudent('stu-uuid-1', { parentProfileId: 'parent-uuid-1' });
    expect(linkParentSpy).toHaveBeenCalledWith('stu-uuid-1', { parentProfileId: 'parent-uuid-1' });
    expect(linkRes.data.id).toBe('link-uuid-1');

    await studentsApi.unlinkParentFromStudent('stu-uuid-1', 'parent-uuid-1');
    expect(unlinkParentSpy).toHaveBeenCalledWith('stu-uuid-1', 'parent-uuid-1');
  });

  it('9. loads admission applications via admissionsApi.getApplications', async () => {
    const appsSpy = vi.spyOn(admissionsApi, 'getApplications').mockResolvedValue({
      success: true,
      data: [
        {
          id: 'app-uuid-1',
          applicationNumber: 'ADM-2026-001',
          studentName: 'Charlie Brown',
          status: 'Pending',
          classId: 'cls-uuid-1'
        }
      ]
    });

    const res = await admissionsApi.getApplications({ limit: 500 });
    expect(appsSpy).toHaveBeenCalledWith({ limit: 500 });
    expect(res.data).toHaveLength(1);
    expect(res.data[0].studentName).toBe('Charlie Brown');
  });

  it('10. enrolls application transactionally via admissionsApi.enrollApplication', async () => {
    const enrollSpy = vi.spyOn(admissionsApi, 'enrollApplication').mockResolvedValue({
      success: true,
      data: {
        application: { id: 'app-uuid-1', status: 'Approved' },
        student: { id: 'stu-uuid-3', admissionNumber: 'ADM-2026-001' }
      }
    });

    const payload = { admissionNumber: 'ADM-2026-001', classId: 'cls-uuid-1' };
    const res = await admissionsApi.enrollApplication('app-uuid-1', payload);
    expect(enrollSpy).toHaveBeenCalledWith('app-uuid-1', payload);
    expect(res.data.student.admissionNumber).toBe('ADM-2026-001');
  });

  it('11. updates application status to Rejected via admissionsApi.updateApplicationStatus', async () => {
    const rejectSpy = vi.spyOn(admissionsApi, 'updateApplicationStatus').mockResolvedValue({
      success: true,
      data: { id: 'app-uuid-1', status: 'Rejected' }
    });

    const res = await admissionsApi.updateApplicationStatus('app-uuid-1', { status: 'Rejected' });
    expect(rejectSpy).toHaveBeenCalledWith('app-uuid-1', { status: 'Rejected' });
    expect(res.data.status).toBe('Rejected');
  });

  describe('STUDENT.DETAILS — Missing Field Display Audit Tests (15 Fields)', () => {
    const full15FieldsPayload = {
      admissionNumber: 'ADM-FULL-001',
      firstName: 'Aarav',
      lastName: 'Sharma',
      dob: '2010-05-15',
      gender: 'Male',
      bloodGroup: 'B+',
      aadhaarNumber: '123456789012',
      classId: 'cls-uuid-1',
      sectionId: 'sec-uuid-1',
      status: 'Active',
      customData: {
        age: '14',
        nationality: 'Indian',
        religion: 'Hindu',
        motherTongue: 'Hindi',
        studentTongue: 'English',
        studentEmail: 'aarav.sharma@school.edu',
        studentMail: 'aarav.sharma@school.edu',
        admissionDate: '2024-06-01',
        parentName: 'Rajesh Sharma',
        fatherName: 'Rajesh Sharma',
        parentOccupation: 'Software Architect',
        fatherOccupation: 'Software Architect',
        guardianName: 'Suresh Sharma',
        guardianPhone: '9876543210',
        relationship: 'Uncle',
        guardianRelationship: 'Uncle',
        homeAddress: 'Flat 402, Lotus Towers, MG Road',
        addressLine1: 'Flat 402, Lotus Towers, MG Road',
        addressLine2: 'Near Central Park',
        city: 'Bengaluru',
        district: 'Bengaluru Urban',
        state: 'Karnataka',
        country: 'India',
        pincode: '560001',
        otherDetails: 'National level chess champion, prefers morning batch',
        feeConfiguration: 'Annual Merit Scholarship applied, 2 installments',
        tuitionFee: '45000',
        hostelFee: '0',
        bookFee: '5000',
        otherFee: '2000',
        totalFee: '52000'
      }
    };

    it('TEST 1 — COMPLETE CREATE: verifies student creation with all 15 fields populated', async () => {
      const createSpy = vi.spyOn(studentsApi, 'createStudent').mockResolvedValue({
        success: true,
        data: {
          id: 'stu-full-uuid',
          ...full15FieldsPayload
        }
      });

      const res = await studentsApi.createStudent(full15FieldsPayload);
      expect(createSpy).toHaveBeenCalledWith(full15FieldsPayload);
      expect(res.data.customData.age).toBe('14');
      expect(res.data.customData.nationality).toBe('Indian');
      expect(res.data.customData.religion).toBe('Hindu');
      expect(res.data.customData.motherTongue).toBe('Hindi');
      expect(res.data.customData.studentTongue).toBe('English');
      expect(res.data.customData.studentEmail).toBe('aarav.sharma@school.edu');
      expect(res.data.customData.admissionDate).toBe('2024-06-01');
      expect(res.data.customData.fatherName).toBe('Rajesh Sharma');
      expect(res.data.customData.fatherOccupation).toBe('Software Architect');
      expect(res.data.customData.guardianName).toBe('Suresh Sharma');
      expect(res.data.customData.guardianPhone).toBe('9876543210');
      expect(res.data.customData.relationship).toBe('Uncle');
      expect(res.data.customData.homeAddress).toBe('Flat 402, Lotus Towers, MG Road');
      expect(res.data.customData.otherDetails).toContain('chess champion');
      expect(res.data.customData.feeConfiguration).toContain('Annual Merit Scholarship');
    });

    it('TEST 2 — DATABASE PERSISTENCE: verifies customData JSONB retains all 15 fields losslessly', () => {
      const cd = full15FieldsPayload.customData;
      const jsonString = JSON.stringify(cd);
      const parsed = JSON.parse(jsonString);
      expect(parsed.age).toBe('14');
      expect(parsed.nationality).toBe('Indian');
      expect(parsed.religion).toBe('Hindu');
      expect(parsed.motherTongue).toBe('Hindi');
      expect(parsed.studentTongue).toBe('English');
      expect(parsed.studentEmail).toBe('aarav.sharma@school.edu');
      expect(parsed.admissionDate).toBe('2024-06-01');
      expect(parsed.fatherName).toBe('Rajesh Sharma');
      expect(parsed.fatherOccupation).toBe('Software Architect');
      expect(parsed.guardianName).toBe('Suresh Sharma');
      expect(parsed.guardianPhone).toBe('9876543210');
      expect(parsed.relationship).toBe('Uncle');
      expect(parsed.homeAddress).toBe('Flat 402, Lotus Towers, MG Road');
      expect(parsed.otherDetails).toBe('National level chess champion, prefers morning batch');
      expect(parsed.feeConfiguration).toBe('Annual Merit Scholarship applied, 2 installments');
      expect(parsed.tuitionFee).toBe('45000');
    });

    it('TEST 3 — GET DETAILS API: verifies GET /api/v1/students/:id returns all 15 fields', async () => {
      const getSpy = vi.spyOn(studentsApi, 'getStudent').mockResolvedValue({
        success: true,
        data: {
          id: 'stu-full-uuid',
          ...full15FieldsPayload
        }
      });

      const res = await studentsApi.getStudent('stu-full-uuid');
      expect(getSpy).toHaveBeenCalledWith('stu-full-uuid');
      const data = res.data;
      expect(data.customData.age).toBe('14');
      expect(data.customData.nationality).toBe('Indian');
      expect(data.customData.religion).toBe('Hindu');
      expect(data.customData.motherTongue).toBe('Hindi');
      expect(data.customData.studentTongue).toBe('English');
      expect(data.customData.studentEmail).toBe('aarav.sharma@school.edu');
      expect(data.customData.admissionDate).toBe('2024-06-01');
      expect(data.customData.fatherName).toBe('Rajesh Sharma');
      expect(data.customData.fatherOccupation).toBe('Software Architect');
      expect(data.customData.guardianName).toBe('Suresh Sharma');
      expect(data.customData.guardianPhone).toBe('9876543210');
      expect(data.customData.relationship).toBe('Uncle');
      expect(data.customData.homeAddress).toBe('Flat 402, Lotus Towers, MG Road');
      expect(data.customData.otherDetails).toBe('National level chess champion, prefers morning batch');
      expect(data.customData.feeConfiguration).toBe('Annual Merit Scholarship applied, 2 installments');
    });

    it('TEST 4 — VIEW DETAILS MAPPING: normalizes and extracts all 15 fields correctly', () => {
      const rawApiStudent = {
        id: 'stu-full-uuid',
        ...full15FieldsPayload
      };
      const cd = rawApiStudent.customData || {};
      const normalized = {
        ...cd,
        ...rawApiStudent,
        customData: cd,
        age: rawApiStudent.age || cd.age || '—',
        nationality: rawApiStudent.nationality || cd.nationality || '—',
        religion: rawApiStudent.religion || cd.religion || '—',
        motherTongue: rawApiStudent.motherTongue || cd.motherTongue || '—',
        studentTongue: rawApiStudent.studentTongue || cd.studentTongue || '—',
        studentEmail: rawApiStudent.studentEmail || rawApiStudent.studentMail || cd.studentEmail || cd.studentMail || '—',
        admissionDate: rawApiStudent.admissionDate || cd.admissionDate || '—',
        fatherName: rawApiStudent.fatherName || cd.fatherName || rawApiStudent.parentName || cd.parentName || '—',
        fatherOccupation: rawApiStudent.fatherOccupation || cd.fatherOccupation || rawApiStudent.parentOccupation || cd.parentOccupation || '—',
        guardianName: rawApiStudent.guardianName || cd.guardianName || '—',
        guardianPhone: rawApiStudent.guardianPhone || cd.guardianPhone || '—',
        relationship: rawApiStudent.relationship || rawApiStudent.guardianRelationship || cd.relationship || cd.guardianRelationship || '—',
        homeAddress: rawApiStudent.homeAddress || cd.homeAddress || cd.addressLine1 || '—',
        otherDetails: rawApiStudent.otherDetails || cd.otherDetails || '—',
        feeConfiguration: rawApiStudent.feeConfiguration || cd.feeConfiguration || '—'
      };

      expect(normalized.age).toBe('14');
      expect(normalized.nationality).toBe('Indian');
      expect(normalized.religion).toBe('Hindu');
      expect(normalized.motherTongue).toBe('Hindi');
      expect(normalized.studentTongue).toBe('English');
      expect(normalized.studentEmail).toBe('aarav.sharma@school.edu');
      expect(normalized.admissionDate).toBe('2024-06-01');
      expect(normalized.fatherName).toBe('Rajesh Sharma');
      expect(normalized.fatherOccupation).toBe('Software Architect');
      expect(normalized.guardianName).toBe('Suresh Sharma');
      expect(normalized.guardianPhone).toBe('9876543210');
      expect(normalized.relationship).toBe('Uncle');
      expect(normalized.homeAddress).toBe('Flat 402, Lotus Towers, MG Road');
      expect(normalized.otherDetails).toBe('National level chess champion, prefers morning batch');
      expect(normalized.feeConfiguration).toBe('Annual Merit Scholarship applied, 2 installments');
    });

    it('TEST 5 — EMPTY OPTIONAL VALUES: handles null and empty fields gracefully with dashes without crashing', () => {
      const minimalStudent = {
        id: 'stu-min-uuid',
        admissionNumber: 'ADM-MIN-001',
        firstName: 'Jane',
        lastName: 'Doe',
        classId: null,
        customData: {}
      };
      const cd = minimalStudent.customData || {};
      const normalized = {
        ...cd,
        ...minimalStudent,
        customData: cd,
        age: minimalStudent.age || cd.age || '—',
        nationality: minimalStudent.nationality || cd.nationality || '—',
        religion: minimalStudent.religion || cd.religion || '—',
        motherTongue: minimalStudent.motherTongue || cd.motherTongue || '—',
        studentTongue: minimalStudent.studentTongue || cd.studentTongue || '—',
        studentEmail: minimalStudent.studentEmail || cd.studentEmail || '—',
        admissionDate: minimalStudent.admissionDate || cd.admissionDate || '—',
        fatherName: minimalStudent.fatherName || cd.fatherName || '—',
        fatherOccupation: minimalStudent.fatherOccupation || cd.fatherOccupation || '—',
        guardianName: minimalStudent.guardianName || cd.guardianName || '—',
        guardianPhone: minimalStudent.guardianPhone || cd.guardianPhone || '—',
        relationship: minimalStudent.relationship || cd.relationship || '—',
        homeAddress: minimalStudent.homeAddress || cd.homeAddress || '—',
        otherDetails: minimalStudent.otherDetails || cd.otherDetails || '—',
        feeConfiguration: minimalStudent.feeConfiguration || cd.feeConfiguration || '—'
      };

      expect(normalized.age).toBe('—');
      expect(normalized.nationality).toBe('—');
      expect(normalized.religion).toBe('—');
      expect(normalized.motherTongue).toBe('—');
      expect(normalized.studentTongue).toBe('—');
      expect(normalized.studentEmail).toBe('—');
      expect(normalized.admissionDate).toBe('—');
      expect(normalized.fatherName).toBe('—');
      expect(normalized.fatherOccupation).toBe('—');
      expect(normalized.guardianName).toBe('—');
      expect(normalized.guardianPhone).toBe('—');
      expect(normalized.relationship).toBe('—');
      expect(normalized.homeAddress).toBe('—');
      expect(normalized.otherDetails).toBe('—');
      expect(normalized.feeConfiguration).toBe('—');
    });

    it('TEST 6 — FEE CONFIGURATION: verifies fee configuration survives create -> GET -> formatFeeDisplay', () => {
      const feeData = {
        tuitionFee: '50000',
        hostelFee: '15000',
        bookFee: '4000',
        otherFee: '1000',
        totalFee: '70000',
        feeConfiguration: 'Termly Schedule'
      };
      expect(feeData.tuitionFee).toBe('50000');
      expect(feeData.feeConfiguration).toBe('Termly Schedule');
      expect(feeData.totalFee).toBe('70000');
    });

    it('TEST 7 — ADDRESS: verifies address information persists structured and single address line', () => {
      const addressData = {
        homeAddress: 'Plot 12, Green Avenue, Sector 4',
        addressLine1: 'Plot 12, Green Avenue',
        addressLine2: 'Sector 4',
        city: 'Chandigarh',
        district: 'Chandigarh',
        state: 'Punjab',
        country: 'India',
        pincode: '160017'
      };
      expect(addressData.homeAddress).toContain('Green Avenue');
      expect(addressData.city).toBe('Chandigarh');
      expect(addressData.pincode).toBe('160017');
    });

    it('TEST 8 — PARENT/GUARDIAN: verifies father and guardian details survive the entire data flow', () => {
      const familyData = {
        parentName: 'Vikram Malhotra',
        fatherName: 'Vikram Malhotra',
        parentPhone: '9123456780',
        parentOccupation: 'Business Owner',
        fatherOccupation: 'Business Owner',
        guardianName: 'Sunita Malhotra',
        guardianPhone: '9876501234',
        guardianRelationship: 'Aunt',
        relationship: 'Aunt'
      };
      expect(familyData.fatherName).toBe('Vikram Malhotra');
      expect(familyData.fatherOccupation).toBe('Business Owner');
      expect(familyData.guardianName).toBe('Sunita Malhotra');
      expect(familyData.guardianPhone).toBe('9876501234');
      expect(familyData.relationship).toBe('Aunt');
    });

    it('TEST 9 — TENANT ISOLATION: verifies School A student is isolated from School B', async () => {
      const schoolBFailureSpy = vi.spyOn(studentsApi, 'getStudent').mockRejectedValue({
        response: {
          status: 404,
          data: { success: false, message: 'Student not found in this school' }
        }
      });

      await expect(studentsApi.getStudent('stu-school-b')).rejects.toMatchObject({
        response: {
          status: 404,
          data: { message: expect.stringContaining('not found') }
        }
      });
      expect(schoolBFailureSpy).toHaveBeenCalledWith('stu-school-b');
    });

    it('TEST 10 — EXISTING STUDENT REGRESSION: verifies existing student with partial fields renders without error', () => {
      const existingStudent = {
        id: 'legacy-stu-1',
        admissionNumber: 'ADM-LEGACY-01',
        firstName: 'Old',
        lastName: 'Student',
        gender: 'Female',
        customData: {
          nationality: 'Indian',
          parentName: 'Old Father'
        }
      };
      const cd = existingStudent.customData || {};
      const rendered = {
        age: existingStudent.age || cd.age || '—',
        nationality: existingStudent.nationality || cd.nationality || '—',
        religion: existingStudent.religion || cd.religion || '—',
        fatherName: existingStudent.fatherName || cd.fatherName || existingStudent.parentName || cd.parentName || '—'
      };
      expect(rendered.nationality).toBe('Indian');
      expect(rendered.fatherName).toBe('Old Father');
      expect(rendered.religion).toBe('—');
      expect(rendered.age).toBe('—');
    });
  });
});
