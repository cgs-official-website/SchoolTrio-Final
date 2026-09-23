import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as leaveService from '../../../src/modules/leaves/leave.service.js';
import * as leaveRepository from '../../../src/modules/leaves/leave.repository.js';
import * as auditRepository from '../../../src/modules/audit/audit.repository.js';
import {
  NotFoundError,
  TenantAccessError,
  ConflictError,
  ForbiddenError,
  ValidationError
} from '../../../src/utils/app-error.js';
import { SYSTEM_ROLES } from '../../../src/config/constants.js';

vi.mock('../../../src/modules/leaves/leave.repository.js');
vi.mock('../../../src/database/prisma.client.js', () => ({
  prisma: {
    $transaction: vi.fn(cb => cb({}))
  }
}));
vi.mock('../../../src/modules/audit/audit.repository.js', () => ({
  createAuditLog: vi.fn().mockResolvedValue({ id: 'audit-log-1' })
}));

describe('Unit: Leave Service Tests — Phase 4C.7-D.2-I-L.1', () => {
  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
  const STUDENT_ID = '22222222-2222-4222-8222-222222222222';
  const UNLINKED_STUDENT_ID = '33333333-3333-4333-8333-333333333333';
  const PARENT_USER_ID = '44444444-4444-4444-8444-444444444444';
  const STAFF_USER_ID = '55555555-5555-4555-8555-555555555555';
  const LEAVE_ID = '66666666-6666-4666-8666-666666666666';

  const PARENT_ACTOR = {
    userId: PARENT_USER_ID,
    email: 'parent@home.com',
    systemRole: SYSTEM_ROLES.PARENT
  };

  const STAFF_ACTOR = {
    userId: STAFF_USER_ID,
    email: 'admin@school.com',
    systemRole: SYSTEM_ROLES.SCHOOL_ADMIN
  };

  const MOCK_LEAVE = {
    id: LEAVE_ID,
    schoolId: SCHOOL_ID,
    applicantId: STUDENT_ID,
    leaveType: 'Sick Leave',
    startDate: '2026-09-15',
    endDate: '2026-09-17',
    reason: 'Viral fever and recovery',
    status: 'Pending',
    reviewedBy: null,
    customData: {
      applicantRole: 'student',
      supportingDoc: {
        name: 'medical_report.pdf',
        size: '1.2 MB',
        url: 'https://cloudinary.com/demo/image/upload/sample.pdf'
      }
    },
    createdAt: new Date('2026-09-14T10:00:00Z'),
    updatedAt: new Date('2026-09-14T10:00:00Z')
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. formatLeave', () => {
    it('formats a database record into a client-safe DTO', () => {
      const formatted = leaveService.formatLeave(MOCK_LEAVE);

      expect(formatted).toEqual({
        id: LEAVE_ID,
        studentId: STUDENT_ID,
        leaveType: 'Sick Leave',
        startDate: '2026-09-15',
        endDate: '2026-09-17',
        reason: 'Viral fever and recovery',
        status: 'Pending',
        reviewedBy: null,
        supportingDoc: {
          name: 'medical_report.pdf',
          size: '1.2 MB',
          url: 'https://cloudinary.com/demo/image/upload/sample.pdf'
        },
        createdAt: MOCK_LEAVE.createdAt,
        updatedAt: MOCK_LEAVE.updatedAt
      });
      // Ensure internal properties like raw customData or schoolId are not exposed wholesale
      expect(formatted.applicantId).toBeUndefined();
      expect(formatted.schoolId).toBeUndefined();
    });

    it('returns null if leave is null or undefined', () => {
      expect(leaveService.formatLeave(null)).toBeNull();
      expect(leaveService.formatLeave(undefined)).toBeNull();
    });
  });

  describe('2. getStudentLeaves', () => {
    it('throws TenantAccessError when schoolId is missing', async () => {
      await expect(
        leaveService.getStudentLeaves(null, STUDENT_ID, {}, PARENT_ACTOR)
      ).rejects.toThrow(TenantAccessError);
    });

    it('throws NotFoundError if student does not exist in tenant', async () => {
      vi.spyOn(leaveRepository, 'findStudentInTenant').mockResolvedValue(null);

      await expect(
        leaveService.getStudentLeaves(SCHOOL_ID, STUDENT_ID, {}, PARENT_ACTOR)
      ).rejects.toThrow(NotFoundError);
    });

    it('throws NotFoundError if parent is not linked to student', async () => {
      vi.spyOn(leaveRepository, 'findStudentInTenant').mockResolvedValue({ id: UNLINKED_STUDENT_ID, schoolId: SCHOOL_ID });
      vi.spyOn(leaveRepository, 'findAuthorizedStudentIdsForParent').mockResolvedValue([STUDENT_ID]);

      await expect(
        leaveService.getStudentLeaves(SCHOOL_ID, UNLINKED_STUDENT_ID, {}, PARENT_ACTOR)
      ).rejects.toThrow(NotFoundError);
    });

    it('returns paginated leave applications for linked parent', async () => {
      vi.spyOn(leaveRepository, 'findStudentInTenant').mockResolvedValue({ id: STUDENT_ID, schoolId: SCHOOL_ID });
      vi.spyOn(leaveRepository, 'findAuthorizedStudentIdsForParent').mockResolvedValue([STUDENT_ID]);
      vi.spyOn(leaveRepository, 'findStudentLeaves').mockResolvedValue({
        leaves: [MOCK_LEAVE],
        total: 1
      });

      const result = await leaveService.getStudentLeaves(SCHOOL_ID, STUDENT_ID, { page: 1, limit: 10 }, PARENT_ACTOR);

      expect(result.leaves).toHaveLength(1);
      expect(result.leaves[0].id).toBe(LEAVE_ID);
      expect(result.leaves[0].studentId).toBe(STUDENT_ID);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 1,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false
      });
    });

    it('allows authorized staff to view any student leaves in tenant without parent link check', async () => {
      vi.spyOn(leaveRepository, 'findStudentInTenant').mockResolvedValue({ id: STUDENT_ID, schoolId: SCHOOL_ID });
      vi.spyOn(leaveRepository, 'findStudentLeaves').mockResolvedValue({
        leaves: [MOCK_LEAVE],
        total: 1
      });

      const result = await leaveService.getStudentLeaves(SCHOOL_ID, STUDENT_ID, {}, STAFF_ACTOR);

      expect(leaveRepository.findAuthorizedStudentIdsForParent).not.toHaveBeenCalled();
      expect(result.leaves).toHaveLength(1);
    });
  });

  describe('3. createStudentLeave', () => {
    const validData = {
      leaveType: 'Sick Leave',
      startDate: '2026-09-15',
      endDate: '2026-09-17',
      reason: 'Viral fever and recovery',
      supportingDoc: {
        name: 'medical_report.pdf',
        size: '1.2 MB',
        url: 'https://cloudinary.com/demo/image/upload/sample.pdf'
      }
    };

    it('throws TenantAccessError when schoolId is missing', async () => {
      await expect(
        leaveService.createStudentLeave(null, STUDENT_ID, validData, PARENT_ACTOR)
      ).rejects.toThrow(TenantAccessError);
    });

    it('throws NotFoundError if student does not exist in tenant', async () => {
      vi.spyOn(leaveRepository, 'findStudentInTenant').mockResolvedValue(null);

      await expect(
        leaveService.createStudentLeave(SCHOOL_ID, STUDENT_ID, validData, PARENT_ACTOR)
      ).rejects.toThrow(NotFoundError);
    });

    it('throws NotFoundError if parent is not linked to student', async () => {
      vi.spyOn(leaveRepository, 'findStudentInTenant').mockResolvedValue({ id: UNLINKED_STUDENT_ID, schoolId: SCHOOL_ID });
      vi.spyOn(leaveRepository, 'findAuthorizedStudentIdsForParent').mockResolvedValue([STUDENT_ID]);

      await expect(
        leaveService.createStudentLeave(SCHOOL_ID, UNLINKED_STUDENT_ID, validData, PARENT_ACTOR)
      ).rejects.toThrow(NotFoundError);
    });

    it('successfully creates leave application for linked parent and logs audit event', async () => {
      vi.spyOn(leaveRepository, 'findStudentInTenant').mockResolvedValue({ id: STUDENT_ID, schoolId: SCHOOL_ID });
      vi.spyOn(leaveRepository, 'findAuthorizedStudentIdsForParent').mockResolvedValue([STUDENT_ID]);
      vi.spyOn(leaveRepository, 'createLeave').mockResolvedValue(MOCK_LEAVE);

      const result = await leaveService.createStudentLeave(SCHOOL_ID, STUDENT_ID, validData, PARENT_ACTOR);

      expect(leaveRepository.createLeave).toHaveBeenCalledWith(
        SCHOOL_ID,
        STUDENT_ID,
        {
          leaveType: validData.leaveType,
          startDate: validData.startDate,
          endDate: validData.endDate,
          reason: validData.reason,
          supportingDoc: validData.supportingDoc
        }
      );

      expect(result.id).toBe(LEAVE_ID);
      expect(result.status).toBe('Pending');
      expect(result.studentId).toBe(STUDENT_ID);

      // Verify audit logging
      expect(auditRepository.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          schoolId: SCHOOL_ID,
          entityType: 'LeaveApplication',
          entityId: LEAVE_ID,
          actionPerformed: 'CREATE_LEAVE_APPLICATION'
        })
      );
    });
  });

  // ============================================================
  // 3. GET PENDING LEAVES COUNT (ADMIN BACKLOG BADGE)
  // ============================================================
  describe('getPendingLeavesCount', () => {
    it('throws TenantAccessError when schoolId is missing', async () => {
      await expect(leaveService.getPendingLeavesCount(null)).rejects.toThrow(TenantAccessError);
    });

    it('returns pending leaves count for school', async () => {
      vi.spyOn(leaveRepository, 'countPendingLeaves').mockResolvedValue(5);

      const result = await leaveService.getPendingLeavesCount(SCHOOL_ID, STAFF_ACTOR);

      expect(leaveRepository.countPendingLeaves).toHaveBeenCalledWith(SCHOOL_ID);
      expect(result).toEqual({ count: 5 });
    });

    it('returns 0 when there are no pending leaves', async () => {
      vi.spyOn(leaveRepository, 'countPendingLeaves').mockResolvedValue(0);

      const result = await leaveService.getPendingLeavesCount(SCHOOL_ID);

      expect(leaveRepository.countPendingLeaves).toHaveBeenCalledWith(SCHOOL_ID);
      expect(result).toEqual({ count: 0 });
    });
  });

  // ============================================================
  // 4. ADMIN LEAVE OPERATIONS
  // ============================================================
  describe('4. listTenantLeaves (Admin)', () => {
    it('throws TenantAccessError when schoolId is missing', async () => {
      await expect(
        leaveService.listTenantLeaves(null, {}, STAFF_ACTOR)
      ).rejects.toThrow(TenantAccessError);
    });

    it('returns paginated tenant leaves with resolved applicant names and roles', async () => {
      const applicantMap = new Map([
        [STUDENT_ID, { applicantName: 'John Doe', applicantRole: 'student' }]
      ]);

      vi.spyOn(leaveRepository, 'findTenantLeaves').mockResolvedValue({
        leaves: [MOCK_LEAVE],
        total: 1
      });
      vi.spyOn(leaveRepository, 'resolveApplicantMap').mockResolvedValue(applicantMap);

      const result = await leaveService.listTenantLeaves(SCHOOL_ID, { page: 1, limit: 20 }, STAFF_ACTOR);

      expect(leaveRepository.findTenantLeaves).toHaveBeenCalledWith(
        SCHOOL_ID,
        expect.objectContaining({ page: 1, limit: 20 })
      );
      expect(leaveRepository.resolveApplicantMap).toHaveBeenCalledWith(SCHOOL_ID, [MOCK_LEAVE]);
      expect(result.leaves).toHaveLength(1);
      expect(result.leaves[0].applicantName).toBe('John Doe');
      expect(result.leaves[0].applicantRole).toBe('student');
      expect(result.pagination.total).toBe(1);
    });
  });

  describe('5. getLeaveById (Admin)', () => {
    it('throws TenantAccessError when schoolId is missing', async () => {
      await expect(
        leaveService.getLeaveById(null, LEAVE_ID, STAFF_ACTOR)
      ).rejects.toThrow(TenantAccessError);
    });

    it('throws NotFoundError if leave does not exist in tenant', async () => {
      vi.spyOn(leaveRepository, 'findLeaveById').mockResolvedValue(null);

      await expect(
        leaveService.getLeaveById(SCHOOL_ID, LEAVE_ID, STAFF_ACTOR)
      ).rejects.toThrow(NotFoundError);
    });

    it('returns formatted leave with resolved applicant details', async () => {
      const applicantMap = new Map([
        [STUDENT_ID, { applicantName: 'Jane Smith', applicantRole: 'student' }]
      ]);

      vi.spyOn(leaveRepository, 'findLeaveById').mockResolvedValue(MOCK_LEAVE);
      vi.spyOn(leaveRepository, 'resolveApplicantMap').mockResolvedValue(applicantMap);

      const result = await leaveService.getLeaveById(SCHOOL_ID, LEAVE_ID, STAFF_ACTOR);

      expect(result.id).toBe(LEAVE_ID);
      expect(result.applicantName).toBe('Jane Smith');
      expect(result.applicantRole).toBe('student');
    });
  });

  describe('6. updateLeaveStatus (Admin / Reviewer)', () => {
    it('throws TenantAccessError when schoolId is missing', async () => {
      await expect(
        leaveService.updateLeaveStatus(null, LEAVE_ID, 'Approved', STAFF_ACTOR)
      ).rejects.toThrow(TenantAccessError);
    });

    it('successfully approves a pending leave atomically and creates audit log', async () => {
      const approvedLeave = { ...MOCK_LEAVE, status: 'Approved', reviewedBy: STAFF_USER_ID };
      vi.spyOn(leaveRepository, 'updateLeaveStatus').mockResolvedValue(1);
      vi.spyOn(leaveRepository, 'findLeaveById').mockResolvedValue(approvedLeave);
      vi.spyOn(leaveRepository, 'resolveApplicantMap').mockResolvedValue(new Map());

      const result = await leaveService.updateLeaveStatus(
        SCHOOL_ID,
        LEAVE_ID,
        'Approved',
        STAFF_ACTOR
      );

      expect(leaveRepository.updateLeaveStatus).toHaveBeenCalledWith(
        SCHOOL_ID,
        LEAVE_ID,
        'Approved',
        STAFF_USER_ID
      );
      expect(result.status).toBe('Approved');
      expect(auditRepository.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          schoolId: SCHOOL_ID,
          entityType: 'LeaveApplication',
          entityId: LEAVE_ID,
          actionPerformed: 'APPROVE_LEAVE'
        })
      );
    });

    it('successfully rejects a pending leave atomically and creates audit log', async () => {
      const rejectedLeave = { ...MOCK_LEAVE, status: 'Rejected', reviewedBy: STAFF_USER_ID };
      vi.spyOn(leaveRepository, 'updateLeaveStatus').mockResolvedValue(1);
      vi.spyOn(leaveRepository, 'findLeaveById').mockResolvedValue(rejectedLeave);
      vi.spyOn(leaveRepository, 'resolveApplicantMap').mockResolvedValue(new Map());

      const result = await leaveService.updateLeaveStatus(
        SCHOOL_ID,
        LEAVE_ID,
        'Rejected',
        STAFF_ACTOR
      );

      expect(leaveRepository.updateLeaveStatus).toHaveBeenCalledWith(
        SCHOOL_ID,
        LEAVE_ID,
        'Rejected',
        STAFF_USER_ID
      );
      expect(result.status).toBe('Rejected');
      expect(auditRepository.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          schoolId: SCHOOL_ID,
          entityType: 'LeaveApplication',
          entityId: LEAVE_ID,
          actionPerformed: 'REJECT_LEAVE'
        })
      );
    });

    it('throws ConflictError on Approved -> Rejected re-review attempt', async () => {
      vi.spyOn(leaveRepository, 'updateLeaveStatus').mockResolvedValue(0);
      vi.spyOn(leaveRepository, 'findLeaveById').mockResolvedValue({ ...MOCK_LEAVE, status: 'Approved' });

      await expect(
        leaveService.updateLeaveStatus(SCHOOL_ID, LEAVE_ID, 'Rejected', STAFF_ACTOR)
      ).rejects.toThrow(ConflictError);
    });

    it('throws ConflictError on Rejected -> Approved re-review attempt', async () => {
      vi.spyOn(leaveRepository, 'updateLeaveStatus').mockResolvedValue(0);
      vi.spyOn(leaveRepository, 'findLeaveById').mockResolvedValue({ ...MOCK_LEAVE, status: 'Rejected' });

      await expect(
        leaveService.updateLeaveStatus(SCHOOL_ID, LEAVE_ID, 'Approved', STAFF_ACTOR)
      ).rejects.toThrow(ConflictError);
    });

    it('throws ConflictError on Approved -> Approved idempotent retry attempt', async () => {
      vi.spyOn(leaveRepository, 'updateLeaveStatus').mockResolvedValue(0);
      vi.spyOn(leaveRepository, 'findLeaveById').mockResolvedValue({ ...MOCK_LEAVE, status: 'Approved' });

      await expect(
        leaveService.updateLeaveStatus(SCHOOL_ID, LEAVE_ID, 'Approved', STAFF_ACTOR)
      ).rejects.toThrow(ConflictError);
    });

    it('throws ConflictError on Rejected -> Rejected idempotent retry attempt', async () => {
      vi.spyOn(leaveRepository, 'updateLeaveStatus').mockResolvedValue(0);
      vi.spyOn(leaveRepository, 'findLeaveById').mockResolvedValue({ ...MOCK_LEAVE, status: 'Rejected' });

      await expect(
        leaveService.updateLeaveStatus(SCHOOL_ID, LEAVE_ID, 'Rejected', STAFF_ACTOR)
      ).rejects.toThrow(ConflictError);
    });

    it('throws NotFoundError if leave does not exist during status update', async () => {
      vi.spyOn(leaveRepository, 'updateLeaveStatus').mockResolvedValue(0);
      vi.spyOn(leaveRepository, 'findLeaveById').mockResolvedValue(null);

      await expect(
        leaveService.updateLeaveStatus(
          SCHOOL_ID,
          LEAVE_ID,
          'Approved',
          STAFF_ACTOR
        )
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('7. deleteLeave (Admin)', () => {
    it('throws TenantAccessError when schoolId is missing', async () => {
      await expect(
        leaveService.deleteLeave(null, LEAVE_ID, STAFF_ACTOR)
      ).rejects.toThrow(TenantAccessError);
    });

    it('throws NotFoundError if leave does not exist in tenant', async () => {
      vi.spyOn(leaveRepository, 'findLeaveById').mockResolvedValue(null);

      await expect(
        leaveService.deleteLeave(SCHOOL_ID, LEAVE_ID, STAFF_ACTOR)
      ).rejects.toThrow(NotFoundError);
    });

    it('successfully deletes leave and records audit log', async () => {
      vi.spyOn(leaveRepository, 'findLeaveById').mockResolvedValue(MOCK_LEAVE);
      vi.spyOn(leaveRepository, 'deleteLeave').mockResolvedValue({ id: LEAVE_ID });

      const result = await leaveService.deleteLeave(SCHOOL_ID, LEAVE_ID, STAFF_ACTOR);

      expect(leaveRepository.deleteLeave).toHaveBeenCalledWith(SCHOOL_ID, LEAVE_ID);
      expect(result).toEqual({ success: true, message: 'Leave application deleted successfully' });
      expect(auditRepository.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          schoolId: SCHOOL_ID,
          entityType: 'LeaveApplication',
          entityId: LEAVE_ID,
          actionPerformed: 'DELETE_LEAVE'
        })
      );
    });
  });

  // ============================================================
  // 8. STAFF SELF-SERVICE LEAVE OPERATIONS
  // ============================================================
  describe('8. Staff Self Leaves (getStaffLeaves & createStaffLeave)', () => {
    const STAFF_PROFILE_ID = '99999999-9999-4999-8999-999999999999';
    const MOCK_STAFF_PROFILE = {
      id: STAFF_PROFILE_ID,
      userId: STAFF_USER_ID,
      schoolId: SCHOOL_ID,
      name: 'Sarah Connor',
      staffType: 'teaching',
      user: {
        id: STAFF_USER_ID,
        name: 'Sarah Connor',
        email: 'sarah@school.com'
      }
    };

    const MOCK_STAFF_LEAVE = {
      id: LEAVE_ID,
      schoolId: SCHOOL_ID,
      applicantId: STAFF_PROFILE_ID,
      leaveType: 'Annual Leave',
      startDate: '2026-10-01',
      endDate: '2026-10-05',
      reason: 'Vacation',
      status: 'Pending',
      reviewedBy: null,
      customData: {
        applicantRole: 'teacher',
        applicantName: 'Sarah Connor'
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    it('throws ForbiddenError if staff profile not found for user', async () => {
      vi.spyOn(leaveRepository, 'findStaffProfileByUserId').mockResolvedValue(null);

      await expect(
        leaveService.getStaffLeaves(SCHOOL_ID, STAFF_ACTOR, {})
      ).rejects.toThrow(ForbiddenError);

      await expect(
        leaveService.createStaffLeave(SCHOOL_ID, STAFF_ACTOR, {
          leaveType: 'Sick Leave',
          startDate: '2026-10-01',
          endDate: '2026-10-02',
          reason: 'Sick'
        })
      ).rejects.toThrow(ForbiddenError);
    });

    it('returns paginated staff leaves for authenticated staff member', async () => {
      vi.spyOn(leaveRepository, 'findStaffProfileByUserId').mockResolvedValue(MOCK_STAFF_PROFILE);
      vi.spyOn(leaveRepository, 'findStaffLeaves').mockResolvedValue({
        leaves: [MOCK_STAFF_LEAVE],
        total: 1
      });

      const result = await leaveService.getStaffLeaves(SCHOOL_ID, STAFF_ACTOR, { page: 1, limit: 10 });

      expect(leaveRepository.findStaffLeaves).toHaveBeenCalledWith(
        SCHOOL_ID,
        STAFF_PROFILE_ID,
        expect.objectContaining({ page: 1, limit: 10 })
      );
      expect(result.leaves).toHaveLength(1);
      expect(result.leaves[0].id).toBe(LEAVE_ID);
      expect(result.leaves[0].applicantId).toBe(STAFF_PROFILE_ID);
    });

    it('creates staff leave with server-derived staff profile identity and records audit log', async () => {
      vi.spyOn(leaveRepository, 'findStaffProfileByUserId').mockResolvedValue(MOCK_STAFF_PROFILE);
      vi.spyOn(leaveRepository, 'createStaffLeave').mockResolvedValue(MOCK_STAFF_LEAVE);

      const payload = {
        leaveType: 'Annual Leave',
        startDate: '2026-10-01',
        endDate: '2026-10-05',
        reason: 'Vacation',
        supportingDoc: null
      };

      const result = await leaveService.createStaffLeave(SCHOOL_ID, STAFF_ACTOR, payload);

      expect(leaveRepository.createStaffLeave).toHaveBeenCalledWith(
        SCHOOL_ID,
        STAFF_PROFILE_ID,
        expect.objectContaining({
          leaveType: 'Annual Leave',
          applicantName: 'Sarah Connor',
          applicantRole: 'teacher'
        })
      );
      expect(result.id).toBe(LEAVE_ID);
      expect(result.status).toBe('Pending');
      expect(auditRepository.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          schoolId: SCHOOL_ID,
          entityType: 'LeaveApplication',
          entityId: LEAVE_ID,
          actionPerformed: 'CREATE_STAFF_LEAVE'
        })
      );
    });
  });

  describe('8. Leave Approval Rules Service Methods', () => {
    const ROLE_ID = '77777777-7777-4777-8777-777777777777';
    const RULE_ID = '88888888-8888-4888-8888-888888888888';

    const MOCK_ROLE = {
      id: ROLE_ID,
      schoolId: SCHOOL_ID,
      name: 'Principal',
      slug: 'principal'
    };

    const MOCK_RULE = {
      id: RULE_ID,
      schoolId: SCHOOL_ID,
      roleId: ROLE_ID,
      minDays: 1,
      maxDays: 3,
      order: 1,
      role: {
        id: ROLE_ID,
        name: 'Principal',
        slug: 'principal'
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    describe('formatLeaveApprovalRule', () => {
      it('returns null for null/undefined input', () => {
        expect(leaveService.formatLeaveApprovalRule(null)).toBeNull();
        expect(leaveService.formatLeaveApprovalRule(undefined)).toBeNull();
      });

      it('formats raw rule correctly including populated role', () => {
        const formatted = leaveService.formatLeaveApprovalRule(MOCK_RULE);
        expect(formatted.id).toBe(RULE_ID);
        expect(formatted.schoolId).toBe(SCHOOL_ID);
        expect(formatted.roleId).toBe(ROLE_ID);
        expect(formatted.minDays).toBe(1);
        expect(formatted.maxDays).toBe(3);
        expect(formatted.order).toBe(1);
        expect(formatted.role).toEqual({
          id: ROLE_ID,
          name: 'Principal',
          slug: 'principal'
        });
      });
    });

    describe('listLeaveApprovalRules', () => {
      it('throws TenantAccessError when schoolId is missing', async () => {
        await expect(leaveService.listLeaveApprovalRules(null)).rejects.toThrow(TenantAccessError);
      });

      it('returns formatted rules from repository', async () => {
        vi.spyOn(leaveRepository, 'findLeaveApprovalRules').mockResolvedValue([MOCK_RULE]);

        const result = await leaveService.listLeaveApprovalRules(SCHOOL_ID);

        expect(leaveRepository.findLeaveApprovalRules).toHaveBeenCalledWith(SCHOOL_ID);
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe(RULE_ID);
        expect(result[0].role.name).toBe('Principal');
      });
    });

    describe('createLeaveApprovalRule', () => {
      it('throws TenantAccessError when schoolId is missing', async () => {
        await expect(
          leaveService.createLeaveApprovalRule(null, { roleId: ROLE_ID, minDays: 1 })
        ).rejects.toThrow(TenantAccessError);
      });

      it('throws NotFoundError when role does not exist in tenant', async () => {
        vi.spyOn(leaveRepository, 'findSchoolRoleInTenant').mockResolvedValue(null);

        await expect(
          leaveService.createLeaveApprovalRule(SCHOOL_ID, { roleId: ROLE_ID, minDays: 1 })
        ).rejects.toThrow(NotFoundError);
      });

      it('creates rule and logs audit event when role is valid in tenant', async () => {
        vi.spyOn(leaveRepository, 'findSchoolRoleInTenant').mockResolvedValue(MOCK_ROLE);
        vi.spyOn(leaveRepository, 'createLeaveApprovalRule').mockResolvedValue(MOCK_RULE);

        const payload = {
          roleId: ROLE_ID,
          minDays: 1,
          maxDays: 3,
          order: 1
        };

        const result = await leaveService.createLeaveApprovalRule(SCHOOL_ID, payload, STAFF_ACTOR);

        expect(leaveRepository.createLeaveApprovalRule).toHaveBeenCalledWith(SCHOOL_ID, payload);
        expect(result.id).toBe(RULE_ID);
        expect(auditRepository.createAuditLog).toHaveBeenCalledWith(
          expect.objectContaining({
            schoolId: SCHOOL_ID,
            entityType: 'LeaveApprovalRule',
            actionPerformed: 'CREATE_LEAVE_APPROVAL_RULE'
          })
        );
      });
    });

    describe('updateLeaveApprovalRule', () => {
      it('throws TenantAccessError when schoolId is missing', async () => {
        await expect(
          leaveService.updateLeaveApprovalRule(null, RULE_ID, { minDays: 2 })
        ).rejects.toThrow(TenantAccessError);
      });

      it('throws NotFoundError when rule does not exist in tenant', async () => {
        vi.spyOn(leaveRepository, 'findLeaveApprovalRuleById').mockResolvedValue(null);

        await expect(
          leaveService.updateLeaveApprovalRule(SCHOOL_ID, RULE_ID, { minDays: 2 })
        ).rejects.toThrow(NotFoundError);
      });

      it('throws NotFoundError when updated roleId does not exist in tenant', async () => {
        vi.spyOn(leaveRepository, 'findLeaveApprovalRuleById').mockResolvedValue(MOCK_RULE);
        vi.spyOn(leaveRepository, 'findSchoolRoleInTenant').mockResolvedValue(null);

        await expect(
          leaveService.updateLeaveApprovalRule(SCHOOL_ID, RULE_ID, { roleId: 'other-role-id' })
        ).rejects.toThrow(NotFoundError);
      });

      it('throws ValidationError if updated maxDays < existing minDays', async () => {
        vi.spyOn(leaveRepository, 'findLeaveApprovalRuleById').mockResolvedValue({
          ...MOCK_RULE,
          minDays: 5,
          maxDays: 10
        });

        await expect(
          leaveService.updateLeaveApprovalRule(SCHOOL_ID, RULE_ID, { maxDays: 3 })
        ).rejects.toThrow(ValidationError);
      });

      it('updates rule successfully and logs audit event', async () => {
        vi.spyOn(leaveRepository, 'findLeaveApprovalRuleById').mockResolvedValue(MOCK_RULE);
        const updatedRule = { ...MOCK_RULE, maxDays: 5 };
        vi.spyOn(leaveRepository, 'updateLeaveApprovalRule').mockResolvedValue(updatedRule);

        const result = await leaveService.updateLeaveApprovalRule(
          SCHOOL_ID,
          RULE_ID,
          { maxDays: 5 },
          STAFF_ACTOR
        );

        expect(result.maxDays).toBe(5);
        expect(auditRepository.createAuditLog).toHaveBeenCalledWith(
          expect.objectContaining({
            schoolId: SCHOOL_ID,
            entityType: 'LeaveApprovalRule',
            actionPerformed: 'UPDATE_LEAVE_APPROVAL_RULE'
          })
        );
      });
    });

    describe('deleteLeaveApprovalRule', () => {
      it('throws TenantAccessError when schoolId is missing', async () => {
        await expect(leaveService.deleteLeaveApprovalRule(null, RULE_ID)).rejects.toThrow(
          TenantAccessError
        );
      });

      it('throws NotFoundError when rule does not exist in tenant', async () => {
        vi.spyOn(leaveRepository, 'findLeaveApprovalRuleById').mockResolvedValue(null);

        await expect(leaveService.deleteLeaveApprovalRule(SCHOOL_ID, RULE_ID)).rejects.toThrow(
          NotFoundError
        );
      });

      it('deletes rule successfully and logs audit event', async () => {
        vi.spyOn(leaveRepository, 'findLeaveApprovalRuleById').mockResolvedValue(MOCK_RULE);
        vi.spyOn(leaveRepository, 'deleteLeaveApprovalRule').mockResolvedValue(MOCK_RULE);

        const result = await leaveService.deleteLeaveApprovalRule(SCHOOL_ID, RULE_ID, STAFF_ACTOR);

        expect(leaveRepository.deleteLeaveApprovalRule).toHaveBeenCalledWith(SCHOOL_ID, RULE_ID);
        expect(result.success).toBe(true);
        expect(auditRepository.createAuditLog).toHaveBeenCalledWith(
          expect.objectContaining({
            schoolId: SCHOOL_ID,
            entityType: 'LeaveApprovalRule',
            actionPerformed: 'DELETE_LEAVE_APPROVAL_RULE'
          })
        );
      });
    });
  });
});

