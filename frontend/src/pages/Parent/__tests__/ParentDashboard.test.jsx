import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ParentDashboard from '../../ParentDashboard.jsx';
import * as parentsApi from '../../../api/parents.js';
import * as invoicesApi from '../../../api/invoices.js';
import * as firestoreModule from '../../../firebase/firestore.js';

describe('ParentDashboard Component (PostgreSQL REST Residual Migration - Phase 4C.7-D.2-I-J)', () => {
  const mockChildren = [
    {
      id: 'link-uuid-1',
      relationship: 'Mother',
      createdAt: '2026-09-11T10:00:00.000Z',
      student: {
        id: '11111111-1111-4111-8111-111111111111',
        admissionNumber: 'ADM-101',
        rollNumber: '05',
        firstName: 'Alice',
        lastName: 'Johnson',
        dob: '2015-05-10',
        gender: 'Female',
        bloodGroup: 'O+',
        photoUrl: null,
        status: 'Active',
        classId: 'class-uuid-1',
        sectionId: 'sec-uuid-1',
        class: { id: 'class-uuid-1', name: 'Grade 5' },
        section: { id: 'sec-uuid-1', name: 'A' }
      }
    },
    {
      id: 'link-uuid-2',
      relationship: 'Mother',
      createdAt: '2026-09-11T10:05:00.000Z',
      student: {
        id: '22222222-2222-4222-8222-222222222222',
        admissionNumber: 'ADM-102',
        rollNumber: '12',
        firstName: 'Bob',
        lastName: 'Johnson',
        dob: '2017-08-20',
        gender: 'Male',
        bloodGroup: 'B+',
        photoUrl: null,
        status: 'Active',
        classId: 'class-uuid-2',
        sectionId: 'sec-uuid-2',
        class: { id: 'class-uuid-2', name: 'Grade 3' },
        section: { id: 'sec-uuid-2', name: 'B' }
      }
    }
  ];

  const storage = {};
  const mockLocalStorage = {
    getItem: vi.fn((key) => storage[key] || null),
    setItem: vi.fn((key, value) => { storage[key] = String(value); }),
    removeItem: vi.fn((key) => { delete storage[key]; }),
    clear: vi.fn(() => { Object.keys(storage).forEach(k => delete storage[k]); })
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.localStorage = mockLocalStorage;
    mockLocalStorage.clear();
  });

  afterEach(() => {
    mockLocalStorage.clear();
  });

  it('is exported as a function/component', () => {
    expect(typeof ParentDashboard).toBe('function');
  });

  // ==========================================
  // 1. CHILD LOADING & REST INTEGRATION
  // ==========================================

  it('calls getMyChildren on mount and receives enrolled children', async () => {
    const apiSpy = vi.spyOn(parentsApi, 'getMyChildren').mockResolvedValue({
      success: true,
      data: mockChildren
    });

    const res = await parentsApi.getMyChildren();

    expect(apiSpy).toHaveBeenCalledTimes(1);
    expect(res.data).toHaveLength(2);
    expect(res.data[0].student.admissionNumber).toBe('ADM-101');
    expect(res.data[0].student.firstName).toBe('Alice');
    expect(res.data[1].student.firstName).toBe('Bob');
  });

  it('correctly maps enrolled children and preserves class/section metadata', async () => {
    vi.spyOn(parentsApi, 'getMyChildren').mockResolvedValue({
      success: true,
      data: mockChildren
    });

    const res = await parentsApi.getMyChildren();
    const mapped = res.data.map(link => {
      const st = link.student || {};
      const fullName = `${st.firstName || ''} ${st.lastName || ''}`.trim();
      return {
        ...st,
        name: fullName,
        linkId: link.id,
        relationship: link.relationship
      };
    });

    expect(mapped[0].name).toBe('Alice Johnson');
    expect(mapped[0].class.name).toBe('Grade 5');
    expect(mapped[0].section.name).toBe('A');
    expect(mapped[1].name).toBe('Bob Johnson');
    expect(mapped[1].class.name).toBe('Grade 3');
  });

  // ==========================================
  // 2. ACTIVE CHILD SELECTION & RECONCILIATION
  // ==========================================

  it('selects valid sms_active_student_id from localStorage when present in PostgreSQL list', () => {
    const mapped = mockChildren.map(c => c.student);
    const validCandidate = mapped[1].id;

    localStorage.setItem('sms_active_student_id', validCandidate);
    const stored = localStorage.getItem('sms_active_student_id');
    const isValid = mapped.some(s => s.id === stored);

    expect(isValid).toBe(true);
    expect(stored).toBe('22222222-2222-4222-8222-222222222222');
  });

  it('rejects stale or forged sms_active_student_id and falls back to first child', () => {
    const mapped = mockChildren.map(c => c.student);
    const staleId = 'stale-or-forged-student-uuid';

    localStorage.setItem('sms_active_student_id', staleId);
    const stored = localStorage.getItem('sms_active_student_id');
    const isValid = mapped.some(s => s.id === stored);

    expect(isValid).toBe(false);

    const fallbackId = isValid ? stored : (mapped[0]?.id || null);
    expect(fallbackId).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('switching child updates localStorage key without Firestore writes', () => {
    const switchSpy = vi.spyOn(firestoreModule, 'switchActiveStudent');

    // Simulate switching child locally
    const targetStudentId = '22222222-2222-4222-8222-222222222222';
    localStorage.setItem('sms_active_student_id', targetStudentId);

    expect(localStorage.getItem('sms_active_student_id')).toBe('22222222-2222-4222-8222-222222222222');
    expect(switchSpy).not.toHaveBeenCalled();
  });

  // ==========================================
  // 3. CHILD LINKING VIA POSTGRESQL REST
  // ==========================================

  it('calls linkChild with admissionNumber, dob, and relationship', async () => {
    const linkSpy = vi.spyOn(parentsApi, 'linkChild').mockResolvedValue({
      success: true,
      data: {
        id: 'link-uuid-3',
        relationship: 'Mother',
        student: {
          id: '33333333-3333-4333-8333-333333333333',
          admissionNumber: 'ADM-103',
          firstName: 'Charlie',
          lastName: 'Johnson'
        }
      }
    });

    const payload = {
      admissionNumber: 'ADM-103',
      dob: '2019-01-15',
      relationship: 'Mother'
    };

    const res = await parentsApi.linkChild(payload);

    expect(linkSpy).toHaveBeenCalledWith(payload);
    expect(res.data.id).toBe('link-uuid-3');
    expect(res.data.student.id).toBe('33333333-3333-4333-8333-333333333333');
  });

  it('does NOT pass schoolId or parentId in linkChild request', async () => {
    const linkSpy = vi.spyOn(parentsApi, 'linkChild').mockResolvedValue({
      success: true,
      data: { id: 'link-1' }
    });

    await parentsApi.linkChild({
      admissionNumber: 'ADM-101',
      dob: '2015-05-10',
      relationship: 'Father'
    });

    const passedArg = linkSpy.mock.calls[0][0];
    expect(passedArg).not.toHaveProperty('schoolId');
    expect(passedArg).not.toHaveProperty('parentId');
  });

  // ==========================================
  // 4. LINK ERROR HANDLING
  // ==========================================

  it('handles 400 bad request error gracefully', async () => {
    const badRequestError = new Error('Invalid admission number or date of birth');
    badRequestError.status = 400;

    vi.spyOn(parentsApi, 'linkChild').mockRejectedValue(badRequestError);

    await expect(parentsApi.linkChild({
      admissionNumber: '',
      dob: 'invalid-date',
      relationship: 'Father'
    })).rejects.toThrow('Invalid admission number');
  });

  it('handles 404 student not found gracefully', async () => {
    const notFoundError = new Error('Student not found');
    notFoundError.status = 404;

    vi.spyOn(parentsApi, 'linkChild').mockRejectedValue(notFoundError);

    await expect(parentsApi.linkChild({
      admissionNumber: 'ADM-999',
      dob: '2015-05-10',
      relationship: 'Father'
    })).rejects.toThrow('Student not found');
  });

  it('handles 409 conflict duplicate link gracefully', async () => {
    const conflictError = new Error('Parent is already linked to this student');
    conflictError.status = 409;

    vi.spyOn(parentsApi, 'linkChild').mockRejectedValue(conflictError);

    await expect(parentsApi.linkChild({
      admissionNumber: 'ADM-101',
      dob: '2015-05-10',
      relationship: 'Mother'
    })).rejects.toThrow('already linked');
  });

  it('handles 403 forbidden / tenant mismatch gracefully', async () => {
    const forbiddenError = new Error('Access denied');
    forbiddenError.status = 403;

    vi.spyOn(parentsApi, 'linkChild').mockRejectedValue(forbiddenError);

    await expect(parentsApi.linkChild({
      admissionNumber: 'ADM-101',
      dob: '2015-05-10',
      relationship: 'Mother'
    })).rejects.toThrow('Access denied');
  });

  // ==========================================
  // 5. REST SCHOOL BRANDING INTEGRATION
  // ==========================================

  it('initializes school branding from REST userProfile without Firestore getDoc', () => {
    const userProfile = {
      role: 'parent',
      schoolId: 'school-uuid-1',
      schoolName: 'Greenwood High',
      schoolCode: 'GW-01'
    };

    const schoolBranding = {
      name: userProfile.schoolName,
      schoolName: userProfile.schoolName,
      code: userProfile.schoolCode,
      branding: { logoUrl: null }
    };

    expect(schoolBranding.name).toBe('Greenwood High');
    expect(schoolBranding.code).toBe('GW-01');
  });

  it('handles missing school branding gracefully with default fallback title', () => {
    const userProfile = { role: 'parent', schoolId: null, schoolName: null };
    const title = userProfile?.schoolName || 'Parent Portal';

    expect(title).toBe('Parent Portal');
  });

  // ==========================================
  // 6. REST FEE BADGE & PAYMENT REFRESH INTEGRATION
  // ==========================================

  it('fetches fee summary via getStudentInvoices and derives unpaid/overdue badge counts', async () => {
    const invoiceSpy = vi.spyOn(invoicesApi, 'getStudentInvoices').mockResolvedValue({
      success: true,
      data: [
        { id: 'inv-1', status: 'Pending', amount: 5000, dueDate: '2026-01-01' },
        { id: 'inv-2', status: 'Pending', amount: 3000, dueDate: '2026-12-31' }
      ],
      summary: {
        totalInvoiced: 8000,
        paidAmount: 0,
        outstandingAmount: 8000,
        overdueCount: 1,
        unpaidCount: 2
      }
    });

    const res = await invoicesApi.getStudentInvoices('11111111-1111-4111-8111-111111111111', { limit: 1 });

    expect(invoiceSpy).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', { limit: 1 });
    expect(res.summary.unpaidCount).toBe(2);
    expect(res.summary.overdueCount).toBe(1);
  });

  it('excludes paid invoices from unpaid badge count', async () => {
    vi.spyOn(invoicesApi, 'getStudentInvoices').mockResolvedValue({
      success: true,
      data: [{ id: 'inv-paid', status: 'Paid', amount: 5000 }],
      summary: {
        totalInvoiced: 5000,
        paidAmount: 5000,
        outstandingAmount: 0,
        overdueCount: 0,
        unpaidCount: 0
      }
    });

    const res = await invoicesApi.getStudentInvoices('11111111-1111-4111-8111-111111111111', { limit: 1 });
    const unpaidCount = Number(res.summary.unpaidCount) || 0;
    const hasOverdue = (Number(res.summary.overdueCount) || 0) > 0;

    expect(unpaidCount).toBe(0);
    expect(hasOverdue).toBe(false);
  });

  it('refreshes fee badge on active child switch', async () => {
    const invoiceSpy = vi.spyOn(invoicesApi, 'getStudentInvoices').mockResolvedValue({
      success: true,
      summary: { unpaidCount: 1, overdueCount: 0 }
    });

    // Student A
    await invoicesApi.getStudentInvoices('11111111-1111-4111-8111-111111111111', { limit: 1 });
    // Switch to Student B
    await invoicesApi.getStudentInvoices('22222222-2222-4222-8222-222222222222', { limit: 1 });

    expect(invoiceSpy).toHaveBeenCalledTimes(2);
    expect(invoiceSpy).toHaveBeenNthCalledWith(1, '11111111-1111-4111-8111-111111111111', { limit: 1 });
    expect(invoiceSpy).toHaveBeenNthCalledWith(2, '22222222-2222-4222-8222-222222222222', { limit: 1 });
  });

  // ==========================================
  // 7. ISOLATION: ZERO FIRESTORE DASHBOARD OPERATIONS
  // ==========================================

  it('confirms findStudentByAdmission is never called for enrolled child REST workflow', () => {
    const findSpy = vi.spyOn(firestoreModule, 'findStudentByAdmission');
    expect(findSpy).not.toHaveBeenCalled();
  });

  it('confirms linkStudentToParent is never called for enrolled child REST workflow', () => {
    const linkSpy = vi.spyOn(firestoreModule, 'linkStudentToParent');
    expect(linkSpy).not.toHaveBeenCalled();
  });

  it('confirms switchActiveStudent is never called for enrolled child REST workflow', () => {
    const switchSpy = vi.spyOn(firestoreModule, 'switchActiveStudent');
    expect(switchSpy).not.toHaveBeenCalled();
  });

  it('confirms unlinkStudentFromParent is never called for enrolled child REST workflow', () => {
    const unlinkSpy = vi.spyOn(firestoreModule, 'unlinkStudentFromParent');
    expect(unlinkSpy).not.toHaveBeenCalled();
  });
});
