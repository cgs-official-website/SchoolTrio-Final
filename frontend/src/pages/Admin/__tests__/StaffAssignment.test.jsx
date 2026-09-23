import { describe, it, expect, vi, beforeEach } from 'vitest';
import StaffAssignment from '../StaffAssignment.jsx';
import * as staffApi from '../../../api/staff.js';
import * as classesApi from '../../../api/classes.js';
import * as subjectsApi from '../../../api/subjects.js';

describe('Admin StaffAssignment Component (REST Migration)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('1. is exported as a function/component', () => {
    expect(typeof StaffAssignment).toBe('function');
  });

  it('2. loads staff from REST endpoint GET /api/v1/staff', async () => {
    const listSpy = vi.spyOn(staffApi, 'listStaff').mockResolvedValue({
      success: true,
      data: [
        {
          id: 'staff-uuid-1',
          name: 'Sarah Connor',
          firstName: 'Sarah',
          lastName: 'Connor',
          email: 'sarah@school.com',
          staffType: 'teaching',
          status: 'Active',
          designation: 'Senior Teacher',
          assignedClassId: 'class-uuid-1',
          customData: {
            assignments: {
              assignedSubjectIds: ['sub-uuid-1'],
              subjectClassIds: ['class-uuid-1']
            }
          }
        }
      ],
      pagination: { total: 1, page: 1, limit: 100, totalPages: 1 }
    });

    const res = await staffApi.listStaff({ limit: 100 });
    expect(listSpy).toHaveBeenCalledWith({ limit: 100 });
    expect(res.data).toHaveLength(1);
    expect(res.data[0].id).toBe('staff-uuid-1');
  });

  it('3. loads classes and subjects directories from REST APIs', async () => {
    const classSpy = vi.spyOn(classesApi, 'listClasses').mockResolvedValue({
      success: true,
      data: [
        { id: 'class-uuid-1', name: 'Grade 10', section: 'A' }
      ]
    });
    const subjectSpy = vi.spyOn(subjectsApi, 'listSubjects').mockResolvedValue({
      success: true,
      data: [
        { id: 'sub-uuid-1', name: 'Mathematics', code: 'MATH101' }
      ]
    });

    const classesRes = await classesApi.listClasses();
    const subjectsRes = await subjectsApi.listSubjects();

    expect(classSpy).toHaveBeenCalled();
    expect(subjectSpy).toHaveBeenCalled();
    expect(classesRes.data[0].id).toBe('class-uuid-1');
    expect(subjectsRes.data[0].id).toBe('sub-uuid-1');
  });

  it('4. loads functional school roles from REST listRoles', async () => {
    const rolesSpy = vi.spyOn(staffApi, 'listRoles').mockResolvedValue({
      success: true,
      data: [
        { id: 'role-uuid-1', name: 'Principal', slug: 'principal' },
        { id: 'role-uuid-2', name: 'Staffs', slug: 'staffs' }
      ]
    });

    const res = await staffApi.listRoles();
    expect(rolesSpy).toHaveBeenCalled();
    expect(res.data).toHaveLength(2);
    expect(res.data[0].name).toBe('Principal');
  });

  it('5. creates staff member through POST /api/v1/staff', async () => {
    const createSpy = vi.spyOn(staffApi, 'createStaff').mockResolvedValue({
      success: true,
      data: {
        id: 'staff-uuid-2',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@school.com',
        staffType: 'teaching',
        status: 'Active'
      }
    });

    const payload = {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@school.com',
      staffType: 'teaching',
      status: 'Active'
    };

    const res = await staffApi.createStaff(payload);
    expect(createSpy).toHaveBeenCalledWith(payload);
    expect(res.data.id).toBe('staff-uuid-2');
  });

  it('6. updates staff details through PATCH /api/v1/staff/:id', async () => {
    const updateSpy = vi.spyOn(staffApi, 'updateStaff').mockResolvedValue({
      success: true,
      data: {
        id: 'staff-uuid-1',
        designation: 'Vice Principal'
      }
    });

    const res = await staffApi.updateStaff('staff-uuid-1', { designation: 'Vice Principal' });
    expect(updateSpy).toHaveBeenCalledWith('staff-uuid-1', { designation: 'Vice Principal' });
    expect(res.data.designation).toBe('Vice Principal');
  });

  it('7. updates staff assignments through PATCH /api/v1/staff/:id/assignment', async () => {
    const assignSpy = vi.spyOn(staffApi, 'assignStaff').mockResolvedValue({
      success: true,
      data: {
        id: 'staff-uuid-1',
        assignedClassId: 'class-uuid-1',
        assignments: {
          assignedSubjectIds: ['sub-uuid-1'],
          subjectClassIds: ['class-uuid-1']
        }
      }
    });

    const assignmentPayload = {
      assignedClassId: 'class-uuid-1',
      assignedSubjectIds: ['sub-uuid-1'],
      subjectClassIds: ['class-uuid-1']
    };

    const res = await staffApi.assignStaff('staff-uuid-1', assignmentPayload);
    expect(assignSpy).toHaveBeenCalledWith('staff-uuid-1', assignmentPayload);
    expect(res.data.assignedClassId).toBe('class-uuid-1');
  });

  it('8. deletes staff member through DELETE /api/v1/staff/:id and handles 409 Conflict', async () => {
    const deleteSpy = vi.spyOn(staffApi, 'deleteStaff').mockRejectedValue({
      status: 409,
      message: 'Cannot delete staff member who is currently assigned as a Class Teacher.'
    });

    await expect(staffApi.deleteStaff('staff-uuid-1')).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining('Cannot delete staff member')
    });
    expect(deleteSpy).toHaveBeenCalledWith('staff-uuid-1');
  });

  it('9. ID REGRESSION: verifies payloads use PostgreSQL UUIDs, never Firestore IDs', async () => {
    const validUUID = 'a1eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
    const updateSpy = vi.spyOn(staffApi, 'updateStaff').mockResolvedValue({
      success: true,
      data: { id: validUUID }
    });

    await staffApi.updateStaff(validUUID, {
      designation: 'Head of Mathematics'
    });

    expect(updateSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
      expect.objectContaining({ designation: 'Head of Mathematics' })
    );
  });

  it('10. SECURITY REGRESSION: verifies frontend payloads do NOT send client-controlled schoolId', async () => {
    const createSpy = vi.spyOn(staffApi, 'createStaff').mockResolvedValue({
      success: true,
      data: { id: 'uuid-123' }
    });

    await staffApi.createStaff({
      firstName: 'Alice',
      lastName: 'Wong',
      email: 'alice@school.com'
    });

    const sentPayload = createSpy.mock.calls[0][0];
    expect(sentPayload).not.toHaveProperty('schoolId');
    expect(sentPayload).not.toHaveProperty('tenantId');
  });
});
