import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as clientModule from '../client.js';
import {
  listStudents,
  getStudent,
  createStudent,
  updateStudent,
  deleteStudent,
  listStudentParents,
  linkParentToStudent,
  unlinkParentFromStudent,
  getStudentHealth,
  updateStudentHealth,
  studentsApi
} from '../students.js';

describe('Students API Client Module', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('1. listStudents calls apiClient with GET /api/v1/students and query parameters', async () => {
    const mockResponse = {
      success: true,
      data: [{ id: 'stu-1', firstName: 'John', lastName: 'Doe', admissionNumber: 'ADM-001' }],
      pagination: { total: 1, page: 1, limit: 10, totalPages: 1 }
    };

    const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue(mockResponse);

    const res = await listStudents({ classId: 'cls-1', status: 'Active', search: 'John', page: 1, limit: 10 });

    expect(apiSpy).toHaveBeenCalledWith(
      '/api/v1/students?classId=cls-1&status=Active&search=John&page=1&limit=10',
      { method: 'GET' }
    );
    expect(res.data).toEqual(mockResponse.data);
    expect(res.pagination.total).toBe(1);
  });

  it('2. listStudents omits empty, null, or undefined query parameters', async () => {
    const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({ success: true, data: [] });

    await listStudents({ classId: '', sectionId: null, search: undefined, status: 'Active' });

    expect(apiSpy).toHaveBeenCalledWith('/api/v1/students?status=Active', { method: 'GET' });
  });

  it('3. getStudent calls apiClient with GET /api/v1/students/:id', async () => {
    const mockStudent = { id: 'stu-1', firstName: 'John', lastName: 'Doe' };
    const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({ success: true, data: mockStudent });

    const res = await getStudent('stu-1');

    expect(apiSpy).toHaveBeenCalledWith('/api/v1/students/stu-1', { method: 'GET' });
    expect(res.data).toEqual(mockStudent);
  });

  it('4. createStudent calls apiClient with POST /api/v1/students and payload', async () => {
    const payload = {
      admissionNumber: 'ADM-002',
      firstName: 'Alice',
      lastName: 'Smith',
      gender: 'Female',
      classId: 'cls-1',
      customData: { parentName: 'Bob Smith', homeAddress: '123 Main St' }
    };

    const mockCreated = { id: 'stu-2', ...payload };
    const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({ success: true, data: mockCreated });

    const res = await createStudent(payload);

    expect(apiSpy).toHaveBeenCalledWith('/api/v1/students', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    expect(res.data.id).toBe('stu-2');
  });

  it('5. updateStudent calls apiClient with PATCH /api/v1/students/:id and payload', async () => {
    const payload = {
      firstName: 'Alice',
      lastName: 'Johnson',
      status: 'Active'
    };

    const mockUpdated = { id: 'stu-2', ...payload };
    const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({ success: true, data: mockUpdated });

    const res = await updateStudent('stu-2', payload);

    expect(apiSpy).toHaveBeenCalledWith('/api/v1/students/stu-2', {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
    expect(res.data.lastName).toBe('Johnson');
  });

  it('6. deleteStudent calls apiClient with DELETE /api/v1/students/:id', async () => {
    const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({ success: true, data: null });

    const res = await deleteStudent('stu-1');

    expect(apiSpy).toHaveBeenCalledWith('/api/v1/students/stu-1', {
      method: 'DELETE'
    });
    expect(res.data).toBeNull();
  });

  it('7. listStudentParents calls apiClient with GET /api/v1/students/:studentId/parents', async () => {
    const mockParents = [{ id: 'parent-1', relationship: 'Father', name: 'Bob Smith' }];
    const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({ success: true, data: mockParents });

    const res = await listStudentParents('stu-1');

    expect(apiSpy).toHaveBeenCalledWith('/api/v1/students/stu-1/parents', { method: 'GET' });
    expect(res.data).toEqual(mockParents);
  });

  it('8. linkParentToStudent calls apiClient with POST /api/v1/students/:studentId/parents', async () => {
    const payload = { parentProfileId: 'parent-1', relationship: 'Mother' };
    const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({ success: true, data: { id: 'link-1', ...payload } });

    const res = await linkParentToStudent('stu-1', payload);

    expect(apiSpy).toHaveBeenCalledWith('/api/v1/students/stu-1/parents', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    expect(res.data.id).toBe('link-1');
  });

  it('9. unlinkParentFromStudent calls apiClient with DELETE /api/v1/students/:studentId/parents/:parentId', async () => {
    const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({ success: true, data: null });

    const res = await unlinkParentFromStudent('stu-1', 'parent-1');

    expect(apiSpy).toHaveBeenCalledWith('/api/v1/students/stu-1/parents/parent-1', {
      method: 'DELETE'
    });
    expect(res.data).toBeNull();
  });

  it('10. IDs are properly URL encoded in endpoints', async () => {
    const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({ success: true, data: null });

    await getStudent('stu/1');
    await updateStudent('stu/1', { firstName: 'Test' });
    await deleteStudent('stu/1');
    await unlinkParentFromStudent('stu/1', 'parent/1');

    expect(apiSpy).toHaveBeenCalledWith('/api/v1/students/stu%2F1', { method: 'GET' });
    expect(apiSpy).toHaveBeenCalledWith('/api/v1/students/stu%2F1', { method: 'PATCH', body: JSON.stringify({ firstName: 'Test' }) });
    expect(apiSpy).toHaveBeenCalledWith('/api/v1/students/stu%2F1', { method: 'DELETE' });
    expect(apiSpy).toHaveBeenCalledWith('/api/v1/students/stu%2F1/parents/parent%2F1', { method: 'DELETE' });
  });

  it('11. No schoolId is sent in request payloads or query strings', async () => {
    const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({ success: true, data: [] });

    await listStudents({ search: 'test' });
    await createStudent({ admissionNumber: 'ADM-1', firstName: 'Bob' });

    const getUrl = apiSpy.mock.calls[0][0];
    const postBody = apiSpy.mock.calls[1][1].body;

    expect(getUrl).not.toContain('schoolId');
    expect(postBody).not.toContain('schoolId');
  });

  it('12. getStudentHealth calls apiClient with GET /api/v1/students/:id/health', async () => {
    const mockHealth = {
      studentId: 'stu-1',
      bloodGroup: 'O+',
      allergies: ['Peanuts'],
      medicalConditions: ['Asthma'],
      medications: ['Inhaler'],
      emergencyContactName: 'Jane Doe',
      emergencyContactPhone: '+91 9876543210'
    };
    const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({ success: true, data: mockHealth });

    const res = await getStudentHealth('stu-1');

    expect(apiSpy).toHaveBeenCalledWith('/api/v1/students/stu-1/health', { method: 'GET' });
    expect(res.data.bloodGroup).toBe('O+');
  });

  it('13. updateStudentHealth calls apiClient with PATCH /api/v1/students/:id/health and payload', async () => {
    const payload = {
      bloodGroup: 'A+',
      allergies: ['Dust'],
      doctorName: 'Dr. House'
    };
    const mockUpdatedHealth = { studentId: 'stu-1', ...payload };
    const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({ success: true, data: mockUpdatedHealth });

    const res = await updateStudentHealth('stu-1', payload);

    expect(apiSpy).toHaveBeenCalledWith('/api/v1/students/stu-1/health', {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
    expect(res.data.doctorName).toBe('Dr. House');
  });

  it('14. getStudentHealth properly URL encodes studentId', async () => {
    const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({ success: true, data: {} });

    await getStudentHealth('stu/1');
    await updateStudentHealth('stu/1', { bloodGroup: 'B+' });

    expect(apiSpy).toHaveBeenCalledWith('/api/v1/students/stu%2F1/health', { method: 'GET' });
    expect(apiSpy).toHaveBeenCalledWith('/api/v1/students/stu%2F1/health', {
      method: 'PATCH',
      body: JSON.stringify({ bloodGroup: 'B+' })
    });
  });

  it('15. exports getStudentHealth and updateStudentHealth on studentsApi object', () => {
    expect(studentsApi.getStudentHealth).toBe(getStudentHealth);
    expect(studentsApi.updateStudentHealth).toBe(updateStudentHealth);
  });
});
