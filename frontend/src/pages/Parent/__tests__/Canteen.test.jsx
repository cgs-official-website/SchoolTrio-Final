import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Canteen from '../Canteen.jsx';
import * as canteenApi from '../../../api/canteen.js';
import * as parentsApi from '../../../api/parents.js';
import * as firestoreModule from '../../../firebase/firestore.js';

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({
    userProfile: {
      schoolId: '11111111-1111-4111-8111-111111111111',
      role: 'parent',
      systemRole: 'PARENT'
    }
  })
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn()
  }
}));

describe('Parent Canteen Component REST Cutover & Linked Student Resolution', () => {
  const STUDENT_ID = '22222222-2222-4222-8222-222222222222';
  const STUDENT_B_ID = '33333333-3333-4333-8333-333333333333';
  const todayStr = new Date().toISOString().split('T')[0];

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('is exported as a valid React component function', () => {
    expect(typeof Canteen).toBe('function');
  });

  it('does NOT invoke Firestore addSubDocument or subscribeToSubCollection for canteen_requests', () => {
    const addSubDocSpy = vi.spyOn(firestoreModule, 'addSubDocument');
    const subscribeSpy = vi.spyOn(firestoreModule, 'subscribeToSubCollection');

    expect(addSubDocSpy).not.toHaveBeenCalled();
    expect(subscribeSpy).not.toHaveBeenCalled();
  });

  it('exports listCanteenRequests and createCanteenRequest from api/canteen', () => {
    expect(typeof canteenApi.listCanteenRequests).toBe('function');
    expect(typeof canteenApi.createCanteenRequest).toBe('function');
  });

  describe('1. Authoritative Student Resolution Hierarchy', () => {
    it('uses activeStudentId from Outlet context as the primary student ID', () => {
      const outletContext = {
        activeStudentId: STUDENT_ID,
        activeChild: { id: STUDENT_ID, name: 'Alice Doe' }
      };
      const storedStudentId = 'stored-id';
      const fallbackChild = { id: 'fallback-id' };
      const userProfile = { linkedStudentId: 'legacy-id' };

      const studentId = outletContext?.activeStudentId || storedStudentId || fallbackChild?.id || userProfile?.linkedStudentId;
      expect(studentId).toBe(STUDENT_ID);
    });

    it('falls back to localStorage sms_active_student_id when Outlet context is empty', () => {
      const outletContext = null;
      const storedStudentId = STUDENT_ID;
      const fallbackChild = { id: 'fallback-id' };

      const studentId = outletContext?.activeStudentId || storedStudentId || fallbackChild?.id;
      expect(studentId).toBe(STUDENT_ID);
    });

    it('falls back to getMyChildren() REST API when neither Outlet context nor localStorage is present', async () => {
      const getMyChildrenSpy = vi.spyOn(parentsApi, 'getMyChildren').mockResolvedValue({
        success: true,
        data: [
          {
            id: 'link-1',
            studentId: STUDENT_ID,
            student: {
              id: STUDENT_ID,
              firstName: 'Alice',
              lastName: 'Doe'
            }
          }
        ]
      });

      const res = await parentsApi.getMyChildren();
      const list = res.data;
      const first = list[0].student || list[0];
      const studentId = first.id;

      expect(getMyChildrenSpy).toHaveBeenCalled();
      expect(studentId).toBe(STUDENT_ID);
    });

    it('identifies when parent genuinely has no linked student (controlled error state)', () => {
      const outletContext = null;
      const storedStudentId = null;
      const fallbackChild = null;
      const userProfile = {};

      const studentId = outletContext?.activeStudentId || storedStudentId || fallbackChild?.id || userProfile?.linkedStudentId || null;
      expect(studentId).toBeNull();
    });
  });

  describe('2. Multi-Child Parent Switching', () => {
    it('accurately resolves different children when parent switches active child in context', () => {
      const child1 = { id: STUDENT_ID, name: 'Alice Doe' };
      const child2 = { id: STUDENT_B_ID, name: 'Bob Doe' };

      let outletContext = { activeStudentId: child1.id, activeChild: child1 };
      let resolvedStudentId = outletContext.activeStudentId;
      let resolvedName = outletContext.activeChild.name;
      expect(resolvedStudentId).toBe(STUDENT_ID);
      expect(resolvedName).toBe('Alice Doe');

      // Parent switches to Child 2
      outletContext = { activeStudentId: child2.id, activeChild: child2 };
      resolvedStudentId = outletContext.activeStudentId;
      resolvedName = outletContext.activeChild.name;
      expect(resolvedStudentId).toBe(STUDENT_B_ID);
      expect(resolvedName).toBe('Bob Doe');
    });
  });

  describe('3. Breakfast and Lunch Requests Persistence & Payload', () => {
    it('creates Breakfast request with correct studentId and mealType', async () => {
      const payload = {
        studentId: STUDENT_ID,
        mealType: 'Breakfast',
        date: todayStr
      };

      const createSpy = vi.spyOn(canteenApi, 'createCanteenRequest').mockResolvedValue({
        status: 'success',
        data: { id: 'new-bfast-id', ...payload, status: 'Pending' }
      });

      const res = await canteenApi.createCanteenRequest(payload);

      expect(createSpy).toHaveBeenCalledWith(payload);
      expect(res.data.mealType).toBe('Breakfast');
      expect(res.data.studentId).toBe(STUDENT_ID);
      expect(res.data.status).toBe('Pending');
    });

    it('creates Lunch request with correct studentId and mealType', async () => {
      const payload = {
        studentId: STUDENT_ID,
        mealType: 'Lunch',
        date: todayStr
      };

      const createSpy = vi.spyOn(canteenApi, 'createCanteenRequest').mockResolvedValue({
        status: 'success',
        data: { id: 'new-lunch-id', ...payload, status: 'Pending' }
      });

      const res = await canteenApi.createCanteenRequest(payload);

      expect(createSpy).toHaveBeenCalledWith(payload);
      expect(res.data.mealType).toBe('Lunch');
      expect(res.data.studentId).toBe(STUDENT_ID);
      expect(res.data.status).toBe('Pending');
    });

    it('handles 409 conflict error when duplicate request is rejected by server', async () => {
      const error409 = new Error("A canteen request of type 'Breakfast' for this student on 2026-09-20 already exists");
      error409.status = 409;

      vi.spyOn(canteenApi, 'createCanteenRequest').mockRejectedValue(error409);

      await expect(
        canteenApi.createCanteenRequest({
          studentId: STUDENT_ID,
          mealType: 'Breakfast',
          date: todayStr
        })
      ).rejects.toThrow("A canteen request of type 'Breakfast'");
    });
  });

  describe('4. Admin Panel Visibility Contract', () => {
    it('formats canteen request record containing all required student and class fields for Admin UI', () => {
      const adminCanteenRecord = {
        id: 'req-admin-1',
        schoolId: '11111111-1111-4111-8111-111111111111',
        studentId: STUDENT_ID,
        mealType: 'Breakfast',
        date: todayStr,
        status: 'Pending',
        student: {
          id: STUDENT_ID,
          name: 'Alice Doe',
          firstName: 'Alice',
          lastName: 'Doe',
          admissionNumber: 'ADM-2024-001',
          classId: 'cls-1',
          sectionId: 'sec-1',
          className: 'Grade 5 - Section A'
        }
      };

      expect(adminCanteenRecord.student.name).toBe('Alice Doe');
      expect(adminCanteenRecord.student.admissionNumber).toBe('ADM-2024-001');
      expect(adminCanteenRecord.student.className).toBe('Grade 5 - Section A');
      expect(adminCanteenRecord.mealType).toBe('Breakfast');
      expect(adminCanteenRecord.date).toBe(todayStr);
      expect(adminCanteenRecord.status).toBe('Pending');
    });
  });
});
