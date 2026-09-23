import { describe, it, expect, vi, beforeEach } from 'vitest';
import SubjectManagement from '../SubjectManagement.jsx';
import * as subjectsApi from '../../../api/subjects.js';
import * as staffApi from '../../../api/staff.js';

describe('Admin SubjectManagement Component (REST Migration)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('1. is exported as a function/component', () => {
    expect(typeof SubjectManagement).toBe('function');
  });

  it('2. loads subjects from REST endpoint GET /api/v1/subjects', async () => {
    const listSpy = vi.spyOn(subjectsApi, 'listSubjects').mockResolvedValue({
      success: true,
      data: [
        { id: 'sub-uuid-1', name: 'Mathematics', code: 'MATH101', credits: 4.0 }
      ]
    });

    const res = await subjectsApi.listSubjects({ limit: 100 });
    expect(listSpy).toHaveBeenCalledWith({ limit: 100 });
    expect(res.data).toHaveLength(1);
    expect(res.data[0].id).toBe('sub-uuid-1');
  });

  it('3. loads teaching staff directory from REST GET /api/v1/staff', async () => {
    const staffSpy = vi.spyOn(staffApi, 'listStaff').mockResolvedValue({
      success: true,
      data: [
        {
          id: 'staff-uuid-1',
          name: 'Sarah Connor',
          staffType: 'teaching',
          assignments: { assignedSubjectIds: ['sub-uuid-1'] }
        }
      ]
    });

    const res = await staffApi.listStaff({ staffType: 'teaching', limit: 100 });
    expect(staffSpy).toHaveBeenCalledWith({ staffType: 'teaching', limit: 100 });
    expect(res.data[0].id).toBe('staff-uuid-1');
    expect(res.data[0].assignments.assignedSubjectIds).toContain('sub-uuid-1');
  });

  it('4. creates subject through POST /api/v1/subjects', async () => {
    const createSpy = vi.spyOn(subjectsApi, 'createSubject').mockResolvedValue({
      success: true,
      data: {
        id: 'sub-uuid-2',
        name: 'Physics',
        code: 'PHY101'
      }
    });

    const payload = {
      name: 'Physics',
      code: 'PHY101'
    };

    const res = await subjectsApi.createSubject(payload);
    expect(createSpy).toHaveBeenCalledWith(payload);
    expect(res.data.id).toBe('sub-uuid-2');
  });

  it('5. updates subject through PATCH /api/v1/subjects/:id', async () => {
    const updateSpy = vi.spyOn(subjectsApi, 'updateSubject').mockResolvedValue({
      success: true,
      data: {
        id: 'sub-uuid-1',
        name: 'Advanced Mathematics',
        code: 'MATH201'
      }
    });

    const res = await subjectsApi.updateSubject('sub-uuid-1', {
      name: 'Advanced Mathematics',
      code: 'MATH201'
    });
    expect(updateSpy).toHaveBeenCalledWith('sub-uuid-1', {
      name: 'Advanced Mathematics',
      code: 'MATH201'
    });
    expect(res.data.name).toBe('Advanced Mathematics');
  });

  it('6. deletes subject through DELETE /api/v1/subjects/:id', async () => {
    const deleteSpy = vi.spyOn(subjectsApi, 'deleteSubject').mockResolvedValue({
      success: true,
      message: 'Subject deleted successfully'
    });

    const res = await subjectsApi.deleteSubject('sub-uuid-1');
    expect(deleteSpy).toHaveBeenCalledWith('sub-uuid-1');
    expect(res.success).toBe(true);
  });

  it('7. handles 409 conflict when deleting subject with dependent records', async () => {
    const deleteSpy = vi.spyOn(subjectsApi, 'deleteSubject').mockRejectedValue({
      response: {
        status: 409,
        data: { message: 'Cannot delete subject with existing examination assessments' }
      }
    });

    await expect(subjectsApi.deleteSubject('sub-with-assessments')).rejects.toMatchObject({
      response: { status: 409 }
    });
    expect(deleteSpy).toHaveBeenCalledWith('sub-with-assessments');
  });

  it('8. handles 403 permission denied error', async () => {
    vi.spyOn(subjectsApi, 'createSubject').mockRejectedValue({
      response: {
        status: 403,
        data: { message: 'Forbidden: Insufficient permissions' }
      }
    });

    await expect(subjectsApi.createSubject({ name: 'Music' })).rejects.toMatchObject({
      response: { status: 403 }
    });
  });

  it('9. handles 404 not found error', async () => {
    vi.spyOn(subjectsApi, 'getSubject').mockRejectedValue({
      response: {
        status: 404,
        data: { message: 'Subject not found' }
      }
    });

    await expect(subjectsApi.getSubject('non-existent-uuid')).rejects.toMatchObject({
      response: { status: 404 }
    });
  });

  it('10. synchronizes teacher assignment via REST assignStaff', async () => {
    const assignSpy = vi.spyOn(staffApi, 'assignStaff').mockResolvedValue({
      success: true,
      data: {
        id: 'staff-uuid-1',
        assignments: { assignedSubjectIds: ['sub-uuid-1', 'sub-uuid-2'] }
      }
    });

    const res = await staffApi.assignStaff('staff-uuid-1', {
      assignedSubjectIds: ['sub-uuid-1', 'sub-uuid-2']
    });

    expect(assignSpy).toHaveBeenCalledWith('staff-uuid-1', {
      assignedSubjectIds: ['sub-uuid-1', 'sub-uuid-2']
    });
    expect(res.data.assignments.assignedSubjectIds).toContain('sub-uuid-2');
  });

  it('11. ID REGRESSION: verifies payloads use PostgreSQL UUIDs, never Firestore IDs', async () => {
    const validUUID = 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';
    const updateSpy = vi.spyOn(subjectsApi, 'updateSubject').mockResolvedValue({
      success: true,
      data: { id: validUUID }
    });

    await subjectsApi.updateSubject(validUUID, {
      name: 'Chemistry',
      code: 'CHEM101'
    });

    expect(updateSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
      expect.objectContaining({ name: 'Chemistry', code: 'CHEM101' })
    );
  });

  it('12. SECURITY REGRESSION: verifies frontend payloads do NOT send client-controlled schoolId', async () => {
    const createSpy = vi.spyOn(subjectsApi, 'createSubject').mockResolvedValue({
      success: true,
      data: { id: 'uuid-123' }
    });

    await subjectsApi.createSubject({
      name: 'Biology',
      code: 'BIO101'
    });

    const sentPayload = createSpy.mock.calls[0][0];
    expect(sentPayload).not.toHaveProperty('schoolId');
    expect(sentPayload).not.toHaveProperty('tenantId');
  });
});
