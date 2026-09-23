import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as canteenService from '../../../src/modules/canteen/canteen.service.js';
import * as canteenRepository from '../../../src/modules/canteen/canteen.repository.js';
import * as auditRepository from '../../../src/modules/audit/audit.repository.js';
import {
  ValidationError,
  TenantAccessError,
  NotFoundError,
  ForbiddenError,
  ConflictError
} from '../../../src/utils/app-error.js';

describe('Canteen Service Unit Tests (Phase CA.2)', () => {
  const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
  const STUDENT_ID = '22222222-2222-4222-8222-222222222222';
  const REQUEST_ID = '33333333-3333-4333-8333-333333333333';
  const PARENT_USER_ID = '44444444-4444-4444-8444-444444444444';

  const MOCK_RAW_REQUEST = {
    id: REQUEST_ID,
    schoolId: SCHOOL_ID,
    studentId: STUDENT_ID,
    itemDetails: { mealType: 'Breakfast', date: '2026-09-16' },
    status: 'Pending',
    totalAmount: 0,
    createdAt: new Date('2026-09-16T08:00:00.000Z'),
    updatedAt: new Date('2026-09-16T08:00:00.000Z'),
    student: {
      id: STUDENT_ID,
      firstName: 'John',
      lastName: 'Doe',
      admissionNumber: 'ADM-101',
      classId: 'class-1',
      sectionId: 'sec-1',
      class: { id: 'class-1', name: 'Grade 5' },
      section: { id: 'sec-1', name: 'A' }
    }
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(auditRepository, 'createAuditLog').mockResolvedValue({});
    vi.spyOn(canteenRepository, 'runTransaction').mockImplementation(async (cb) => cb(canteenRepository));
  });

  describe('1. getPendingCanteenCount', () => {
    it('throws ValidationError when schoolId is missing', async () => {
      await expect(canteenService.getPendingCanteenCount(null)).rejects.toThrow(ValidationError);
      await expect(canteenService.getPendingCanteenCount('')).rejects.toThrow(
        'Tenant context required: schoolId is missing'
      );
    });

    it('retrieves pending canteen request count for the school', async () => {
      const countSpy = vi.spyOn(canteenRepository, 'countPendingCanteenRequests').mockResolvedValue(4);

      const result = await canteenService.getPendingCanteenCount(SCHOOL_ID, { role: 'admin' });

      expect(countSpy).toHaveBeenCalledWith(SCHOOL_ID);
      expect(result).toEqual({ count: 4 });
    });

    it('returns count 0 when there are no pending canteen requests', async () => {
      vi.spyOn(canteenRepository, 'countPendingCanteenRequests').mockResolvedValue(0);

      const result = await canteenService.getPendingCanteenCount(SCHOOL_ID, { role: 'teacher' });

      expect(result).toEqual({ count: 0 });
    });
  });

  describe('2. listCanteenRequests', () => {
    it('throws TenantAccessError when schoolId is missing', async () => {
      await expect(canteenService.listCanteenRequests(null)).rejects.toThrow(TenantAccessError);
    });

    it('returns requests for Admin / Staff with mapped student info', async () => {
      vi.spyOn(canteenRepository, 'findCanteenRequests').mockResolvedValue([MOCK_RAW_REQUEST]);

      const results = await canteenService.listCanteenRequests(
        SCHOOL_ID,
        { status: 'Pending' },
        { role: 'SCHOOL_ADMIN' }
      );

      expect(results).toHaveLength(1);
      expect(results[0].mealType).toBe('Breakfast');
      expect(results[0].date).toBe('2026-09-16');
      expect(results[0].student.name).toBe('John Doe');
      expect(results[0].student.className).toBe('Grade 5 - Section A');
    });

    it('scopes requests strictly to linked children for Parent', async () => {
      vi.spyOn(canteenRepository, 'findAuthorizedStudentIdsForParent').mockResolvedValue([STUDENT_ID]);
      const findSpy = vi.spyOn(canteenRepository, 'findCanteenRequests').mockResolvedValue([MOCK_RAW_REQUEST]);

      const results = await canteenService.listCanteenRequests(
        SCHOOL_ID,
        {},
        { role: 'PARENT', userId: PARENT_USER_ID }
      );

      expect(findSpy).toHaveBeenCalledWith(SCHOOL_ID, { studentIds: [STUDENT_ID] });
      expect(results).toHaveLength(1);
    });

    it('returns empty array when Parent has no linked children', async () => {
      vi.spyOn(canteenRepository, 'findAuthorizedStudentIdsForParent').mockResolvedValue([]);

      const results = await canteenService.listCanteenRequests(
        SCHOOL_ID,
        {},
        { role: 'PARENT', userId: PARENT_USER_ID }
      );

      expect(results).toEqual([]);
    });

    it('throws ForbiddenError when Parent requests a foreign studentId', async () => {
      vi.spyOn(canteenRepository, 'findAuthorizedStudentIdsForParent').mockResolvedValue([STUDENT_ID]);

      await expect(
        canteenService.listCanteenRequests(
          SCHOOL_ID,
          { studentId: 'foreign-student-999' },
          { role: 'PARENT', userId: PARENT_USER_ID }
        )
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe('3. createCanteenRequest', () => {
    it('throws TenantAccessError when schoolId is missing', async () => {
      await expect(canteenService.createCanteenRequest(null, { studentId: STUDENT_ID, mealType: 'Breakfast' }))
        .rejects.toThrow(TenantAccessError);
    });

    it('creates request successfully for Parent when student is linked', async () => {
      vi.spyOn(canteenRepository, 'findAuthorizedStudentIdsForParent').mockResolvedValue([STUDENT_ID]);
      vi.spyOn(canteenRepository, 'acquireAdvisoryLock').mockResolvedValue(undefined);
      vi.spyOn(canteenRepository, 'lockStudentForUpdate').mockResolvedValue({ id: STUDENT_ID });
      vi.spyOn(canteenRepository, 'findActiveCanteenRequest').mockResolvedValue(null);
      const createSpy = vi.spyOn(canteenRepository, 'createCanteenRequest').mockResolvedValue(MOCK_RAW_REQUEST);

      const result = await canteenService.createCanteenRequest(
        SCHOOL_ID,
        { studentId: STUDENT_ID, mealType: 'Breakfast', date: '2026-09-16' },
        { role: 'PARENT', userId: PARENT_USER_ID }
      );

      expect(createSpy).toHaveBeenCalledWith(
        SCHOOL_ID,
        { studentId: STUDENT_ID, mealType: 'Breakfast', date: '2026-09-16' },
        expect.anything()
      );
      expect(result.id).toBe(REQUEST_ID);
      expect(result.status).toBe('Pending');
    });

    it('rejects Parent request with ForbiddenError when student is not linked', async () => {
      vi.spyOn(canteenRepository, 'findAuthorizedStudentIdsForParent').mockResolvedValue([]);

      await expect(
        canteenService.createCanteenRequest(
          SCHOOL_ID,
          { studentId: STUDENT_ID, mealType: 'Breakfast' },
          { role: 'PARENT', userId: PARENT_USER_ID }
        )
      ).rejects.toThrow(ForbiddenError);
    });

    it('rejects duplicate active request with ConflictError (409)', async () => {
      vi.spyOn(canteenRepository, 'findAuthorizedStudentIdsForParent').mockResolvedValue([STUDENT_ID]);
      vi.spyOn(canteenRepository, 'acquireAdvisoryLock').mockResolvedValue(undefined);
      vi.spyOn(canteenRepository, 'lockStudentForUpdate').mockResolvedValue({ id: STUDENT_ID });
      vi.spyOn(canteenRepository, 'findActiveCanteenRequest').mockResolvedValue({
        id: 'existing-req',
        status: 'Pending'
      });

      await expect(
        canteenService.createCanteenRequest(
          SCHOOL_ID,
          { studentId: STUDENT_ID, mealType: 'Breakfast', date: '2026-09-16' },
          { role: 'PARENT', userId: PARENT_USER_ID }
        )
      ).rejects.toThrow(ConflictError);
    });

    it('creates request for Admin when student exists in tenant', async () => {
      vi.spyOn(canteenRepository, 'findStudentInTenant').mockResolvedValue({ id: STUDENT_ID });
      vi.spyOn(canteenRepository, 'acquireAdvisoryLock').mockResolvedValue(undefined);
      vi.spyOn(canteenRepository, 'lockStudentForUpdate').mockResolvedValue({ id: STUDENT_ID });
      vi.spyOn(canteenRepository, 'findActiveCanteenRequest').mockResolvedValue(null);
      vi.spyOn(canteenRepository, 'createCanteenRequest').mockResolvedValue(MOCK_RAW_REQUEST);

      const result = await canteenService.createCanteenRequest(
        SCHOOL_ID,
        { studentId: STUDENT_ID, mealType: 'Breakfast' },
        { role: 'SCHOOL_ADMIN' }
      );

      expect(result.id).toBe(REQUEST_ID);
    });

    it('preserves explicit date when provided and defaults to ISO YYYY-MM-DD when omitted', async () => {
      vi.spyOn(canteenRepository, 'findAuthorizedStudentIdsForParent').mockResolvedValue([STUDENT_ID]);
      vi.spyOn(canteenRepository, 'acquireAdvisoryLock').mockResolvedValue(undefined);
      vi.spyOn(canteenRepository, 'lockStudentForUpdate').mockResolvedValue({ id: STUDENT_ID });
      vi.spyOn(canteenRepository, 'findActiveCanteenRequest').mockResolvedValue(null);
      const createSpy = vi.spyOn(canteenRepository, 'createCanteenRequest').mockResolvedValue(MOCK_RAW_REQUEST);

      const todayIso = new Date().toISOString().split('T')[0];

      // Test omitted date
      await canteenService.createCanteenRequest(
        SCHOOL_ID,
        { studentId: STUDENT_ID, mealType: 'Lunch' },
        { role: 'PARENT', userId: PARENT_USER_ID }
      );

      expect(createSpy).toHaveBeenCalledWith(
        SCHOOL_ID,
        { studentId: STUDENT_ID, mealType: 'Lunch', date: todayIso },
        expect.anything()
      );

      // Test explicit date
      await canteenService.createCanteenRequest(
        SCHOOL_ID,
        { studentId: STUDENT_ID, mealType: 'Breakfast', date: '2026-10-01' },
        { role: 'PARENT', userId: PARENT_USER_ID }
      );

      expect(createSpy).toHaveBeenCalledWith(
        SCHOOL_ID,
        { studentId: STUDENT_ID, mealType: 'Breakfast', date: '2026-10-01' },
        expect.anything()
      );
    });

    it('rejects Admin creation with NotFoundError if student not in tenant', async () => {
      vi.spyOn(canteenRepository, 'findStudentInTenant').mockResolvedValue(null);

      await expect(
        canteenService.createCanteenRequest(
          SCHOOL_ID,
          { studentId: STUDENT_ID, mealType: 'Breakfast' },
          { role: 'SCHOOL_ADMIN' }
        )
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('4. updateCanteenRequestStatus', () => {
    it('throws TenantAccessError when schoolId is missing', async () => {
      await expect(canteenService.updateCanteenRequestStatus(null, REQUEST_ID, { status: 'Approved' }))
        .rejects.toThrow(TenantAccessError);
    });

    it('throws NotFoundError if request is not found in school', async () => {
      vi.spyOn(canteenRepository, 'lockCanteenRequestForUpdate').mockResolvedValue(null);

      await expect(
        canteenService.updateCanteenRequestStatus(
          SCHOOL_ID,
          REQUEST_ID,
          { status: 'Approved' },
          { role: 'SCHOOL_ADMIN' }
        )
      ).rejects.toThrow(NotFoundError);
    });

    it('allows Admin to transition Pending -> Approved and sets resolvedAt', async () => {
      vi.spyOn(canteenRepository, 'lockCanteenRequestForUpdate').mockResolvedValue({
        ...MOCK_RAW_REQUEST,
        status: 'Pending'
      });
      const updateSpy = vi.spyOn(canteenRepository, 'updateCanteenRequestStatus').mockResolvedValue({
        ...MOCK_RAW_REQUEST,
        status: 'Approved',
        itemDetails: { ...MOCK_RAW_REQUEST.itemDetails, resolvedAt: '2026-09-16T10:00:00.000Z' }
      });

      const result = await canteenService.updateCanteenRequestStatus(
        SCHOOL_ID,
        REQUEST_ID,
        { status: 'Approved' },
        { role: 'SCHOOL_ADMIN' }
      );

      expect(updateSpy).toHaveBeenCalledWith(
        SCHOOL_ID,
        REQUEST_ID,
        'Approved',
        expect.objectContaining({ resolvedAt: expect.any(String) }),
        expect.anything()
      );
      expect(result.status).toBe('Approved');
    });

    it('allows Admin to transition Approved -> Delivered', async () => {
      vi.spyOn(canteenRepository, 'lockCanteenRequestForUpdate').mockResolvedValue({
        ...MOCK_RAW_REQUEST,
        status: 'Approved'
      });
      vi.spyOn(canteenRepository, 'updateCanteenRequestStatus').mockResolvedValue({
        ...MOCK_RAW_REQUEST,
        status: 'Delivered'
      });

      const result = await canteenService.updateCanteenRequestStatus(
        SCHOOL_ID,
        REQUEST_ID,
        { status: 'Delivered' },
        { role: 'STAFF' }
      );

      expect(result.status).toBe('Delivered');
    });

    it('rejects invalid transition Delivered -> Approved with ConflictError (409)', async () => {
      vi.spyOn(canteenRepository, 'lockCanteenRequestForUpdate').mockResolvedValue({
        ...MOCK_RAW_REQUEST,
        status: 'Delivered'
      });

      await expect(
        canteenService.updateCanteenRequestStatus(
          SCHOOL_ID,
          REQUEST_ID,
          { status: 'Approved' },
          { role: 'SCHOOL_ADMIN' }
        )
      ).rejects.toThrow(ConflictError);
    });

    it('allows Parent to Cancel their own Pending request', async () => {
      vi.spyOn(canteenRepository, 'lockCanteenRequestForUpdate').mockResolvedValue({
        ...MOCK_RAW_REQUEST,
        status: 'Pending'
      });
      vi.spyOn(canteenRepository, 'findAuthorizedStudentIdsForParent').mockResolvedValue([STUDENT_ID]);
      const updateSpy = vi.spyOn(canteenRepository, 'updateCanteenRequestStatus').mockResolvedValue({
        ...MOCK_RAW_REQUEST,
        status: 'Cancelled'
      });

      const result = await canteenService.updateCanteenRequestStatus(
        SCHOOL_ID,
        REQUEST_ID,
        { status: 'Cancelled' },
        { role: 'PARENT', userId: PARENT_USER_ID }
      );

      expect(updateSpy).toHaveBeenCalledWith(
        SCHOOL_ID,
        REQUEST_ID,
        'Cancelled',
        expect.anything(),
        expect.anything()
      );
      expect(result.status).toBe('Cancelled');
    });

    it('rejects Parent attempting to Approve a request with ForbiddenError', async () => {
      vi.spyOn(canteenRepository, 'lockCanteenRequestForUpdate').mockResolvedValue({
        ...MOCK_RAW_REQUEST,
        status: 'Pending'
      });
      vi.spyOn(canteenRepository, 'findAuthorizedStudentIdsForParent').mockResolvedValue([STUDENT_ID]);

      await expect(
        canteenService.updateCanteenRequestStatus(
          SCHOOL_ID,
          REQUEST_ID,
          { status: 'Approved' },
          { role: 'PARENT', userId: PARENT_USER_ID }
        )
      ).rejects.toThrow(ForbiddenError);
    });

    it('rejects Parent attempting to cancel already Delivered request with ConflictError', async () => {
      vi.spyOn(canteenRepository, 'lockCanteenRequestForUpdate').mockResolvedValue({
        ...MOCK_RAW_REQUEST,
        status: 'Delivered'
      });
      vi.spyOn(canteenRepository, 'findAuthorizedStudentIdsForParent').mockResolvedValue([STUDENT_ID]);

      await expect(
        canteenService.updateCanteenRequestStatus(
          SCHOOL_ID,
          REQUEST_ID,
          { status: 'Cancelled' },
          { role: 'PARENT', userId: PARENT_USER_ID }
        )
      ).rejects.toThrow(ConflictError);
    });
  });
});
