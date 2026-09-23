import { describe, it, expect } from 'vitest';
import {
  listStudentLeavesSchema,
  createStudentLeaveSchema,
  listLeavesSchema,
  getLeaveSchema,
  updateLeaveStatusSchema,
  deleteLeaveSchema,
  listStaffLeavesSchema,
  createStaffLeaveSchema,
  createLeaveApprovalRuleSchema,
  updateLeaveApprovalRuleSchema,
  deleteLeaveApprovalRuleSchema
} from '../../../src/modules/leaves/leave.schemas.js';

describe('Unit: Leave Schemas Validation — Phase 4C.7-D.2-I-L.1', () => {
  const VALID_UUID = '11111111-1111-4111-8111-111111111111';

  describe('1. listStudentLeavesSchema', () => {
    it('accepts valid student UUID params', () => {
      const result = listStudentLeavesSchema.params.safeParse({ studentId: VALID_UUID });
      expect(result.success).toBe(true);
    });

    it('rejects invalid student UUID params', () => {
      const result = listStudentLeavesSchema.params.safeParse({ studentId: 'not-a-uuid' });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('Invalid student ID format');
    });

    it('accepts valid query parameters and coerces numeric pagination', () => {
      const result = listStudentLeavesSchema.query.safeParse({
        page: '2',
        limit: '25',
        status: 'Pending',
        order: 'asc'
      });
      expect(result.success).toBe(true);
      expect(result.data.page).toBe(2);
      expect(result.data.limit).toBe(25);
      expect(result.data.status).toBe('Pending');
      expect(result.data.order).toBe('asc');
    });

    it('applies defaults for missing query parameters', () => {
      const result = listStudentLeavesSchema.query.safeParse({});
      expect(result.success).toBe(true);
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(50);
      expect(result.data.order).toBe('desc');
    });
  });

  describe('2. createStudentLeaveSchema', () => {
    it('accepts a valid leave creation body', () => {
      const result = createStudentLeaveSchema.body.safeParse({
        leaveType: 'Sick Leave',
        startDate: '2026-09-15',
        endDate: '2026-09-17',
        reason: 'Viral fever and doctor-advised rest',
        supportingDoc: {
          name: 'medical_certificate.pdf',
          size: '1.5 MB',
          url: 'https://res.cloudinary.com/demo/image/upload/sample.pdf'
        }
      });
      expect(result.success).toBe(true);
    });

    it('accepts same-day leave where startDate === endDate', () => {
      const result = createStudentLeaveSchema.body.safeParse({
        leaveType: 'Casual',
        startDate: '2026-09-20',
        endDate: '2026-09-20',
        reason: 'Family function'
      });
      expect(result.success).toBe(true);
    });

    it('rejects startDate after endDate', () => {
      const result = createStudentLeaveSchema.body.safeParse({
        leaveType: 'Sick Leave',
        startDate: '2026-09-20',
        endDate: '2026-09-15',
        reason: 'Invalid range'
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('Start date cannot be after end date');
    });

    it('rejects missing or empty leaveType', () => {
      const result = createStudentLeaveSchema.body.safeParse({
        leaveType: '   ',
        startDate: '2026-09-15',
        endDate: '2026-09-16',
        reason: 'Doctor appointment'
      });
      expect(result.success).toBe(false);
    });

    it('rejects too-long leaveType over 50 characters', () => {
      const result = createStudentLeaveSchema.body.safeParse({
        leaveType: 'A'.repeat(51),
        startDate: '2026-09-15',
        endDate: '2026-09-16',
        reason: 'Test'
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('cannot exceed 50 characters');
    });

    it('rejects malformed date formats', () => {
      const result1 = createStudentLeaveSchema.body.safeParse({
        leaveType: 'Sick',
        startDate: '15-09-2026',
        endDate: '2026-09-16',
        reason: 'Test'
      });
      expect(result1.success).toBe(false);

      const result2 = createStudentLeaveSchema.body.safeParse({
        leaveType: 'Sick',
        startDate: '2026-09-15',
        endDate: 'invalid-date',
        reason: 'Test'
      });
      expect(result2.success).toBe(false);
    });

    it('rejects missing or empty reason', () => {
      const result = createStudentLeaveSchema.body.safeParse({
        leaveType: 'Sick',
        startDate: '2026-09-15',
        endDate: '2026-09-16',
        reason: '   '
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid supportingDoc URL format', () => {
      const result = createStudentLeaveSchema.body.safeParse({
        leaveType: 'Sick',
        startDate: '2026-09-15',
        endDate: '2026-09-16',
        reason: 'Doctor checkup',
        supportingDoc: {
          name: 'doc.pdf',
          size: '1 MB',
          url: 'not-a-valid-url'
        }
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('Supporting document URL must be a valid URL');
    });

    it('accepts null supportingDoc', () => {
      const result = createStudentLeaveSchema.body.safeParse({
        leaveType: 'Sick',
        startDate: '2026-09-15',
        endDate: '2026-09-16',
        reason: 'Fever',
        supportingDoc: null
      });
      expect(result.success).toBe(true);
    });
  });

  describe('3. listLeavesSchema (Admin)', () => {
    it('accepts valid admin query filters', () => {
      const result = listLeavesSchema.query.safeParse({
        page: '1',
        limit: '100',
        status: 'Pending',
        applicantRole: 'teacher',
        leaveType: 'Annual Leave',
        search: 'Sarah'
      });
      expect(result.success).toBe(true);
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(100);
      expect(result.data.status).toBe('Pending');
      expect(result.data.applicantRole).toBe('teacher');
      expect(result.data.search).toBe('Sarah');
    });

    it('rejects invalid status filter', () => {
      const result = listLeavesSchema.query.safeParse({ status: 'InvalidStatus' });
      expect(result.success).toBe(false);
    });

    it('applies defaults for missing query parameters', () => {
      const result = listLeavesSchema.query.safeParse({});
      expect(result.success).toBe(true);
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(50);
      expect(result.data.order).toBe('desc');
    });
  });

  describe('4. getLeaveSchema & deleteLeaveSchema', () => {
    it('accepts valid UUID for getLeaveSchema', () => {
      const result = getLeaveSchema.params.safeParse({ id: VALID_UUID });
      expect(result.success).toBe(true);
    });

    it('rejects invalid UUID for getLeaveSchema', () => {
      const result = getLeaveSchema.params.safeParse({ id: 'invalid-id' });
      expect(result.success).toBe(false);
    });

    it('accepts valid UUID for deleteLeaveSchema', () => {
      const result = deleteLeaveSchema.params.safeParse({ id: VALID_UUID });
      expect(result.success).toBe(true);
    });
  });

  describe('5. updateLeaveStatusSchema', () => {
    it('accepts Approved status', () => {
      const result = updateLeaveStatusSchema.body.safeParse({ status: 'Approved' });
      expect(result.success).toBe(true);
      expect(result.data.status).toBe('Approved');
    });

    it('accepts Rejected status', () => {
      const result = updateLeaveStatusSchema.body.safeParse({ status: 'Rejected' });
      expect(result.success).toBe(true);
      expect(result.data.status).toBe('Rejected');
    });

    it('rejects Pending status in review update', () => {
      const result = updateLeaveStatusSchema.body.safeParse({ status: 'Pending' });
      expect(result.success).toBe(false);
    });

    it('rejects arbitrary status in review update', () => {
      const result = updateLeaveStatusSchema.body.safeParse({ status: 'Cancelled' });
      expect(result.success).toBe(false);
    });
  });

  describe('6. listStaffLeavesSchema & createStaffLeaveSchema', () => {
    it('accepts valid staff query params', () => {
      const result = listStaffLeavesSchema.query.safeParse({
        page: '1',
        limit: '20',
        status: 'Approved'
      });
      expect(result.success).toBe(true);
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(20);
      expect(result.data.status).toBe('Approved');
    });

    it('accepts valid staff leave creation payload', () => {
      const result = createStaffLeaveSchema.body.safeParse({
        leaveType: 'Annual Leave',
        startDate: '2026-10-01',
        endDate: '2026-10-05',
        reason: 'Vacation'
      });
      expect(result.success).toBe(true);
    });

    it('strips spoofed client fields like status, applicantId, schoolId', () => {
      const result = createStaffLeaveSchema.body.safeParse({
        leaveType: 'Annual Leave',
        startDate: '2026-10-01',
        endDate: '2026-10-05',
        reason: 'Vacation',
        status: 'Approved',
        applicantId: VALID_UUID,
        schoolId: VALID_UUID
      });
      expect(result.success).toBe(true);
      expect(result.data.status).toBeUndefined();
      expect(result.data.applicantId).toBeUndefined();
      expect(result.data.schoolId).toBeUndefined();
    });
  });

  describe('7. createLeaveApprovalRuleSchema', () => {
    it('accepts valid bounded rule (minDays and maxDays)', () => {
      const result = createLeaveApprovalRuleSchema.body.safeParse({
        minDays: 1,
        maxDays: 3,
        roleId: VALID_UUID,
        order: 1
      });
      expect(result.success).toBe(true);
      expect(result.data.minDays).toBe(1);
      expect(result.data.maxDays).toBe(3);
      expect(result.data.roleId).toBe(VALID_UUID);
      expect(result.data.order).toBe(1);
    });

    it('accepts open-ended rule (maxDays = null)', () => {
      const result = createLeaveApprovalRuleSchema.body.safeParse({
        minDays: 4,
        maxDays: null,
        roleId: VALID_UUID
      });
      expect(result.success).toBe(true);
      expect(result.data.minDays).toBe(4);
      expect(result.data.maxDays).toBeNull();
      expect(result.data.order).toBe(1); // default order
    });

    it('accepts omitted maxDays as undefined / open-ended', () => {
      const result = createLeaveApprovalRuleSchema.body.safeParse({
        minDays: 5,
        roleId: VALID_UUID
      });
      expect(result.success).toBe(true);
      expect(result.data.minDays).toBe(5);
      expect(result.data.maxDays).toBeUndefined();
    });

    it('accepts single-day rule where minDays === maxDays', () => {
      const result = createLeaveApprovalRuleSchema.body.safeParse({
        minDays: 1,
        maxDays: 1,
        roleId: VALID_UUID
      });
      expect(result.success).toBe(true);
    });

    it('rejects maxDays < minDays', () => {
      const result = createLeaveApprovalRuleSchema.body.safeParse({
        minDays: 5,
        maxDays: 3,
        roleId: VALID_UUID
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('maxDays cannot be less than minDays');
    });

    it('rejects minDays < 1', () => {
      const result = createLeaveApprovalRuleSchema.body.safeParse({
        minDays: 0,
        maxDays: 3,
        roleId: VALID_UUID
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('minDays must be at least 1');
    });

    it('rejects invalid UUID roleId', () => {
      const result = createLeaveApprovalRuleSchema.body.safeParse({
        minDays: 1,
        maxDays: 3,
        roleId: 'Principal' // non-UUID
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('roleId must be a valid UUID');
    });

    it('rejects missing roleId', () => {
      const result = createLeaveApprovalRuleSchema.body.safeParse({
        minDays: 1,
        maxDays: 3
      });
      expect(result.success).toBe(false);
    });
  });

  describe('8. updateLeaveApprovalRuleSchema', () => {
    it('accepts valid partial update', () => {
      const result = updateLeaveApprovalRuleSchema.body.safeParse({
        maxDays: 5,
        order: 2
      });
      expect(result.success).toBe(true);
      expect(result.data.maxDays).toBe(5);
      expect(result.data.order).toBe(2);
    });

    it('accepts setting maxDays to null for open-ended', () => {
      const result = updateLeaveApprovalRuleSchema.body.safeParse({
        maxDays: null
      });
      expect(result.success).toBe(true);
      expect(result.data.maxDays).toBeNull();
    });

    it('rejects maxDays < minDays when both provided in update', () => {
      const result = updateLeaveApprovalRuleSchema.body.safeParse({
        minDays: 10,
        maxDays: 5
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('maxDays cannot be less than minDays');
    });

    it('validates UUID params id', () => {
      const valid = updateLeaveApprovalRuleSchema.params.safeParse({ id: VALID_UUID });
      expect(valid.success).toBe(true);

      const invalid = updateLeaveApprovalRuleSchema.params.safeParse({ id: 'invalid-id' });
      expect(invalid.success).toBe(false);
    });
  });

  describe('9. deleteLeaveApprovalRuleSchema', () => {
    it('accepts valid UUID rule ID in params', () => {
      const result = deleteLeaveApprovalRuleSchema.params.safeParse({ id: VALID_UUID });
      expect(result.success).toBe(true);
    });

    it('rejects invalid UUID in params', () => {
      const result = deleteLeaveApprovalRuleSchema.params.safeParse({ id: 'not-a-uuid' });
      expect(result.success).toBe(false);
    });
  });
});

