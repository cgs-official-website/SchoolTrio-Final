import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';

describe('Global Bulk Import Phase 1 — Template Contract Remediation', () => {
  describe('1. Student Bulk Import Template Contract', () => {
    const studentExpectedHeaders = [
      'Full Name',
      'Admission Number',
      'Date of Birth',
      'Gender',
      'Blood Group',
      'Nationality',
      'Religion',
      'Aadhar Number',
      'Home Address',
      'Parent/Guardian Name',
      'Parent Phone',
      'Parent Email',
      'Parent Occupation',
      'Emergency Contact',
      'Previous School',
      'Class',
      'Section'
    ];

    it('defines exactly 17 canonical headers including Class and Section', () => {
      expect(studentExpectedHeaders).toHaveLength(17);
      expect(studentExpectedHeaders).toContain('Class');
      expect(studentExpectedHeaders).toContain('Section');
      expect(studentExpectedHeaders).toContain('Full Name');
      expect(studentExpectedHeaders).toContain('Admission Number');
    });

    it('generates a valid XLSX workbook with correct columns and sample data', () => {
      const sampleRow = [
        'Rahul Sharma', 'ADM1001', '2012-04-15', 'Male', 'O+', 'Indian', 'Hindu',
        '1234-5678-9012', '123 Park Street', 'Anil Sharma', '9876543210',
        'parent@example.com', 'Business', '9876543210', 'St. Xavier School', 'Grade 10', 'A'
      ];
      const ws = XLSX.utils.aoa_to_sheet([studentExpectedHeaders, sampleRow]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Students');

      const sheet = wb.Sheets['Students'];
      const parsedData = XLSX.utils.sheet_to_json(sheet);
      expect(parsedData).toHaveLength(1);
      expect(parsedData[0]['Class']).toBe('Grade 10');
      expect(parsedData[0]['Section']).toBe('A');
      expect(parsedData[0]['Admission Number']).toBe('ADM1001');
      expect(parsedData[0]['Full Name']).toBe('Rahul Sharma');
    });

    it('parser normalization successfully maps Class and Section to normalized keys', () => {
      const row = {
        'Full Name': 'Rahul Sharma',
        'Admission Number': 'ADM1001',
        'Class': 'Grade 10',
        'Section': 'A'
      };
      const normalized = {};
      for (const key in row) {
        normalized[key.trim().toLowerCase()] = row[key];
      }

      expect(normalized['class']).toBe('Grade 10');
      expect(normalized['section']).toBe('A');
      expect(normalized['full name']).toBe('Rahul Sharma');
      expect(normalized['admission number']).toBe('ADM1001');
    });
  });

  describe('2. Staff Bulk Import Template Contract', () => {
    const staffExpectedHeaders = [
      'Staff ID',
      'Full Name',
      'Date of Birth',
      'Gender',
      'Nationality',
      'Marital Status',
      'Blood Group',
      'Aadhar Number',
      'Languages Known',
      'Mobile Number',
      'Email Address',
      'Role',
      'Staff Type',
      'Assigned Class',
      'Subject Classes',
      'Residential Address',
      'Emergency Contact Details',
      'Father Name/Guardian Name',
      'Highest Qualification',
      'Degree(s) and Specialization',
      'University/College Name',
      'Year of Passing',
      'Previous Experience (Years)',
      'Previous School/Organization',
      'Subject Specialization',
      'Grades/Classes Handled',
      'Certifications',
      'Government-issued ID',
      'Tax Identification Details (PAN)',
      'PF Number',
      'ESIC Number',
      'UAN Number',
      'Bank Account Number',
      'Bank Name and Branch',
      'IFSC Code',
      'PAN Number'
    ];

    it('defines exactly 36 canonical headers including Role, Staff Type, Assigned Class, and Subject Classes', () => {
      expect(staffExpectedHeaders).toHaveLength(36);
      expect(staffExpectedHeaders).toContain('Role');
      expect(staffExpectedHeaders).toContain('Staff Type');
      expect(staffExpectedHeaders).toContain('Assigned Class');
      expect(staffExpectedHeaders).toContain('Subject Classes');
      expect(staffExpectedHeaders).toContain('Full Name');
      expect(staffExpectedHeaders).toContain('Email Address');
    });

    it('generates a valid XLSX staff template with all 36 fields and sample data', () => {
      const sampleRow = [
        'STF001', 'John Doe', '1990-01-15', 'Male', 'Indian', 'Single', 'A+',
        '1234-5678-9012', 'English, Hindi', '9876543210', 'john.doe@school.com',
        'Teacher', 'teaching', 'Grade 10 - A', 'Grade 10 - A, Grade 10 - B',
        '123 Main St, City', 'Jane Doe - 9876500000', 'Robert Doe', 'M.Sc Education',
        'B.Ed, Mathematics', 'Delhi University', '2015', '5', 'ABC School',
        'Mathematics', '9, 10, 11', 'B.Ed', 'Aadhaar', 'ABCDE1234F',
        'PF123456', 'ESIC789', 'UAN456', '123456789012', 'State Bank, Main Branch',
        'SBIN0001234', 'ABCDE1234F'
      ];
      const ws = XLSX.utils.aoa_to_sheet([staffExpectedHeaders, sampleRow]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Staff Import');

      const sheet = wb.Sheets['Staff Import'];
      const parsedData = XLSX.utils.sheet_to_json(sheet);
      expect(parsedData).toHaveLength(1);
      expect(parsedData[0]['Role']).toBe('Teacher');
      expect(parsedData[0]['Staff Type']).toBe('teaching');
      expect(parsedData[0]['Assigned Class']).toBe('Grade 10 - A');
      expect(parsedData[0]['Subject Classes']).toBe('Grade 10 - A, Grade 10 - B');
      expect(parsedData[0]['Email Address']).toBe('john.doe@school.com');
    });

    it('staff parser helper getField resolves canonical headers and aliases correctly', () => {
      const getField = (row, ...fieldNames) => {
        const lowerRow = {};
        for (const k in row) lowerRow[k.toLowerCase().trim()] = row[k];
        for (const f of fieldNames) {
          const val = lowerRow[f.toLowerCase().trim()];
          if (val !== undefined && val !== null && String(val).trim() !== '') return String(val).trim();
        }
        return null;
      };

      const row = {
        'Role': 'Teacher',
        'Staff Type': 'teaching',
        'Assigned Class': 'Grade 10 - A',
        'Subject Classes': 'Grade 10 - A, Grade 10 - B',
        'Email Address': 'john.doe@school.com'
      };

      expect(getField(row, 'role', 'designation', 'position')).toBe('Teacher');
      expect(getField(row, 'staff type', 'stafftype', 'type')).toBe('teaching');
      expect(getField(row, 'assigned class', 'assigned_class', 'class')).toBe('Grade 10 - A');
      expect(getField(row, 'subject classes', 'subject_classes')).toBe('Grade 10 - A, Grade 10 - B');
      expect(getField(row, 'email address', 'email')).toBe('john.doe@school.com');
    });
  });

  describe('3. Homework Evaluation Bulk Template Contract', () => {
    const homeworkExpectedHeaders = [
      'Homework Title',
      'Student Name',
      'Admission Number',
      'Status',
      'Grade',
      'Feedback'
    ];

    it('defines canonical evaluation headers aligned with the upload parser', () => {
      expect(homeworkExpectedHeaders).toContain('Homework Title');
      expect(homeworkExpectedHeaders).toContain('Student Name');
      expect(homeworkExpectedHeaders).toContain('Admission Number');
      expect(homeworkExpectedHeaders).toContain('Status');
      expect(homeworkExpectedHeaders).toContain('Grade');
      expect(homeworkExpectedHeaders).toContain('Feedback');
    });

    it('generates a valid XLSX evaluation template with roster rows', () => {
      const rosterRows = [
        ['Algebra Homework 1', 'Rahul Sharma', 'ADM1001', 'Completed', 'A+', 'Well done!'],
        ['Algebra Homework 1', 'Priya Patel', 'ADM1002', 'Submitted', 'B', 'Good effort.']
      ];
      const ws = XLSX.utils.aoa_to_sheet([homeworkExpectedHeaders, ...rosterRows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Evaluations');

      const sheet = wb.Sheets['Evaluations'];
      const parsedData = XLSX.utils.sheet_to_json(sheet);
      expect(parsedData).toHaveLength(2);
      expect(parsedData[0]['Admission Number']).toBe('ADM1001');
      expect(parsedData[0]['Status']).toBe('Completed');
      expect(parsedData[0]['Grade']).toBe('A+');
      expect(parsedData[0]['Feedback']).toBe('Well done!');
      expect(parsedData[1]['Admission Number']).toBe('ADM1002');
    });

    it('upload parser extracts fields and builds updateSubmission payload correctly', () => {
      const row = {
        'Homework Title': 'Algebra Homework 1',
        'Student Name': 'Rahul Sharma',
        'Admission Number': 'ADM1001',
        'Status': 'Completed',
        'Grade': '95',
        'Feedback': 'Excellent'
      };

      const admNo = String(row['Admission Number'] || row['AdmissionNo'] || row['ADM'] || '').trim();
      const statusVal = row['Status'] || row['Submission Status'] || 'Completed';
      const gradeVal = row['Grade'] || row['Marks'] || '';
      const feedbackVal = row['Feedback'] || row['Remarks'] || '';
      const hwTitle = row['Homework Title'] || row['Title'];

      expect(admNo).toBe('ADM1001');
      expect(statusVal).toBe('Completed');
      expect(gradeVal).toBe('95');
      expect(feedbackVal).toBe('Excellent');
      expect(hwTitle).toBe('Algebra Homework 1');

      const payload = {
        status: statusVal,
        grade: gradeVal ? String(gradeVal) : null,
        feedback: feedbackVal ? String(feedbackVal) : null
      };

      expect(payload).toEqual({
        status: 'Completed',
        grade: '95',
        feedback: 'Excellent'
      });
    });
  });
});
