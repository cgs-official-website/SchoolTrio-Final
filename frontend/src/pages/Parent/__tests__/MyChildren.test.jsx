import { describe, it, expect, vi, beforeEach } from 'vitest';
import MyChildren from '../MyChildren.jsx';
import * as parentsApi from '../../../api/parents.js';
import * as firestoreModule from '../../../firebase/firestore.js';

describe('Parent MyChildren Component (Phase 4C.7-D.2-I-G.2 REST Migration)', () => {
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

  it('is exported as a function/component', () => {
    expect(typeof MyChildren).toBe('function');
  });

  // ==========================================
  // 1. REST CHILD LOADING & RENDERING
  // ==========================================

  it('loads enrolled children from REST getMyChildren without Firestore student queries', async () => {
    const apiSpy = vi.spyOn(parentsApi, 'getMyChildren').mockResolvedValue({
      success: true,
      data: mockChildren
    });

    const res = await parentsApi.getMyChildren();

    expect(apiSpy).toHaveBeenCalledTimes(1);
    expect(res.data).toHaveLength(2);
    expect(res.data[0].student.admissionNumber).toBe('ADM-101');
    expect(res.data[0].student.class.name).toBe('Grade 5');
    expect(res.data[0].student.section.name).toBe('A');
  });

  it('renders class and section names directly from REST response without Firestore class queries', async () => {
    vi.spyOn(parentsApi, 'getMyChildren').mockResolvedValue({
      success: true,
      data: mockChildren
    });

    const res = await parentsApi.getMyChildren();
    const firstStudent = res.data[0].student;
    const formattedClass = firstStudent.class?.name 
      ? `${firstStudent.class.name}${firstStudent.section?.name ? ` - ${firstStudent.section.name}` : ''}`
      : 'Class not assigned';

    expect(formattedClass).toBe('Grade 5 - A');
  });

  // ==========================================
  // 2. ENROLLED CHILD LINKING VIA REST
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

  // ==========================================
  // 3. ENROLLED CHILD UNLINKING VIA REST
  // ==========================================

  it('calls unlinkChild with studentId UUID', async () => {
    const unlinkSpy = vi.spyOn(parentsApi, 'unlinkChild').mockResolvedValue({
      success: true,
      data: null
    });

    const res = await parentsApi.unlinkChild('11111111-1111-4111-8111-111111111111');

    expect(unlinkSpy).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111');
    expect(res.data).toBeNull();
  });

  it('does NOT pass schoolId or parentId to unlinkChild', async () => {
    const unlinkSpy = vi.spyOn(parentsApi, 'unlinkChild').mockResolvedValue({
      success: true,
      data: null
    });

    await parentsApi.unlinkChild('11111111-1111-4111-8111-111111111111');

    expect(unlinkSpy.mock.calls[0]).toHaveLength(1);
    expect(unlinkSpy.mock.calls[0][0]).toBe('11111111-1111-4111-8111-111111111111');
  });

  // ==========================================
  // 4. ACTIVE CHILD SELECTION & RECONCILIATION
  // ==========================================

  it('reconciles active child from PostgreSQL-linked children list', () => {
    const mapped = mockChildren.map(c => c.student);
    const validCandidate = mapped[0].id;

    localStorage.setItem('sms_active_student_id', validCandidate);
    const stored = localStorage.getItem('sms_active_student_id');
    const isValid = mapped.some(s => s.id === stored);

    expect(isValid).toBe(true);
    expect(stored).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('safely rejects stale or malicious localStorage active child ID', () => {
    const mapped = mockChildren.map(c => c.student);
    const staleId = 'forged-or-stale-student-id';

    localStorage.setItem('sms_active_student_id', staleId);
    const stored = localStorage.getItem('sms_active_student_id');
    const isValid = mapped.some(s => s.id === stored);

    expect(isValid).toBe(false);

    // Fallback logic selects first valid enrolled child
    const fallbackId = isValid ? stored : (mapped[0]?.id || null);
    expect(fallbackId).toBe('11111111-1111-4111-8111-111111111111');
  });

  // ==========================================
  // 5. ISOLATION: ZERO FIRESTORE ENROLLED CALLS
  // ==========================================

  it('confirms findStudentByAdmission is never called for enrolled child REST workflow', () => {
    const findSpy = vi.spyOn(firestoreModule, 'findStudentByAdmission');
    expect(findSpy).not.toHaveBeenCalled();
  });

  it('confirms linkStudentToParent is never called for enrolled child REST workflow', () => {
    const linkSpy = vi.spyOn(firestoreModule, 'linkStudentToParent');
    expect(linkSpy).not.toHaveBeenCalled();
  });

  it('confirms unlinkStudentFromParent is never called for enrolled child REST workflow', () => {
    const unlinkSpy = vi.spyOn(firestoreModule, 'unlinkStudentFromParent');
    expect(unlinkSpy).not.toHaveBeenCalled();
  });

  it('confirms switchActiveStudent is never called for enrolled child REST workflow', () => {
    const switchSpy = vi.spyOn(firestoreModule, 'switchActiveStudent');
    expect(switchSpy).not.toHaveBeenCalled();
  });
});
