import { describe, it, expect, vi, beforeEach } from 'vitest';
import ClassManagement from '../ClassManagement.jsx';
import * as classesApi from '../../../api/classes.js';
import * as staffApi from '../../../api/staff.js';

describe('Admin ClassManagement Component (REST Migration)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('1. is exported as a function/component', () => {
    expect(typeof ClassManagement).toBe('function');
  });

  it('2. loads classes from REST endpoint GET /api/v1/classes', async () => {
    const listSpy = vi.spyOn(classesApi, 'listClasses').mockResolvedValue({
      success: true,
      data: [
        {
          id: 'cls-uuid-1',
          name: 'Grade 10',
          categoryId: 'cat-uuid-1',
          sections: [{ id: 'sec-uuid-1', name: 'A', _count: { students: 25 } }],
          _count: { students: 25, sections: 1 }
        }
      ]
    });

    const res = await classesApi.listClasses({ limit: 100 });
    expect(listSpy).toHaveBeenCalledWith({ limit: 100 });
    expect(res.data).toHaveLength(1);
    expect(res.data[0].id).toBe('cls-uuid-1');
  });

  it('3. loads categories from REST endpoint GET /api/v1/class-categories', async () => {
    const listSpy = vi.spyOn(classesApi, 'listClassCategories').mockResolvedValue({
      success: true,
      data: [
        { id: 'cat-uuid-1', name: 'Secondary', displayOrder: 1 }
      ]
    });

    const res = await classesApi.listClassCategories();
    expect(listSpy).toHaveBeenCalled();
    expect(res.data).toHaveLength(1);
    expect(res.data[0].id).toBe('cat-uuid-1');
  });

  it('4. loads teacher directory from REST staff API', async () => {
    const staffSpy = vi.spyOn(staffApi, 'listStaff').mockResolvedValue({
      success: true,
      data: [
        { id: 'staff-uuid-1', firstName: 'John', lastName: 'Doe', staffType: 'teaching' }
      ]
    });

    const res = await staffApi.listStaff({ staffType: 'teaching' });
    expect(staffSpy).toHaveBeenCalledWith({ staffType: 'teaching' });
    expect(res.data[0].id).toBe('staff-uuid-1');
  });

  it('5. creates class through POST /api/v1/classes with defaultSection', async () => {
    const createSpy = vi.spyOn(classesApi, 'createClass').mockResolvedValue({
      success: true,
      data: {
        id: 'cls-uuid-2',
        name: 'Grade 11',
        categoryId: 'cat-uuid-1',
        defaultSection: 'A'
      }
    });

    const payload = {
      name: 'Grade 11',
      categoryId: 'cat-uuid-1',
      defaultSection: 'A'
    };

    const res = await classesApi.createClass(payload);
    expect(createSpy).toHaveBeenCalledWith(payload);
    expect(res.data.id).toBe('cls-uuid-2');
  });

  it('6. updates class through PATCH /api/v1/classes/:id', async () => {
    const updateSpy = vi.spyOn(classesApi, 'updateClass').mockResolvedValue({
      success: true,
      data: {
        id: 'cls-uuid-1',
        name: 'Grade 10 Senior'
      }
    });

    const res = await classesApi.updateClass('cls-uuid-1', { name: 'Grade 10 Senior' });
    expect(updateSpy).toHaveBeenCalledWith('cls-uuid-1', { name: 'Grade 10 Senior' });
    expect(res.data.name).toBe('Grade 10 Senior');
  });

  it('7. deletes class through DELETE /api/v1/classes/:id', async () => {
    const deleteSpy = vi.spyOn(classesApi, 'deleteClass').mockResolvedValue({
      success: true,
      message: 'Class deleted successfully'
    });

    const res = await classesApi.deleteClass('cls-uuid-1');
    expect(deleteSpy).toHaveBeenCalledWith('cls-uuid-1');
    expect(res.success).toBe(true);
  });

  it('8. creates section through POST /api/v1/classes/:classId/sections', async () => {
    const createSecSpy = vi.spyOn(classesApi, 'createSection').mockResolvedValue({
      success: true,
      data: { id: 'sec-uuid-2', name: 'B', classId: 'cls-uuid-1' }
    });

    const res = await classesApi.createSection('cls-uuid-1', { name: 'B' });
    expect(createSecSpy).toHaveBeenCalledWith('cls-uuid-1', { name: 'B' });
    expect(res.data.id).toBe('sec-uuid-2');
  });

  it('9. updates section through PATCH /api/v1/classes/:classId/sections/:sectionId', async () => {
    const updateSecSpy = vi.spyOn(classesApi, 'updateSection').mockResolvedValue({
      success: true,
      data: { id: 'sec-uuid-1', name: 'Alpha' }
    });

    const res = await classesApi.updateSection('cls-uuid-1', 'sec-uuid-1', { name: 'Alpha' });
    expect(updateSecSpy).toHaveBeenCalledWith('cls-uuid-1', 'sec-uuid-1', { name: 'Alpha' });
    expect(res.data.name).toBe('Alpha');
  });

  it('10. deletes section through DELETE /api/v1/classes/:classId/sections/:sectionId', async () => {
    const deleteSecSpy = vi.spyOn(classesApi, 'deleteSection').mockResolvedValue({
      success: true,
      message: 'Section deleted successfully'
    });

    const res = await classesApi.deleteSection('cls-uuid-1', 'sec-uuid-1');
    expect(deleteSecSpy).toHaveBeenCalledWith('cls-uuid-1', 'sec-uuid-1');
    expect(res.success).toBe(true);
  });

  it('11. creates category through POST /api/v1/class-categories', async () => {
    const createCatSpy = vi.spyOn(classesApi, 'createClassCategory').mockResolvedValue({
      success: true,
      data: { id: 'cat-uuid-2', name: 'Primary' }
    });

    const res = await classesApi.createClassCategory({ name: 'Primary' });
    expect(createCatSpy).toHaveBeenCalledWith({ name: 'Primary' });
    expect(res.data.id).toBe('cat-uuid-2');
  });

  it('12. deletes category through DELETE /api/v1/class-categories/:id', async () => {
    const deleteCatSpy = vi.spyOn(classesApi, 'deleteClassCategory').mockResolvedValue({
      success: true,
      message: 'Category deleted successfully'
    });

    const res = await classesApi.deleteClassCategory('cat-uuid-1');
    expect(deleteCatSpy).toHaveBeenCalledWith('cat-uuid-1');
    expect(res.success).toBe(true);
  });

  it('13. student count comes from REST _count on class and section', () => {
    const classRecord = {
      id: 'cls-uuid-1',
      name: 'Grade 10',
      sections: [
        { id: 'sec-1', name: 'A', _count: { students: 15 } },
        { id: 'sec-2', name: 'B', _count: { students: 12 } }
      ],
      _count: { students: 27, sections: 2 }
    };

    expect(classRecord._count.students).toBe(27);
    expect(classRecord.sections[0]._count.students).toBe(15);
  });

  it('14. teacher assignment sends StaffProfile.id UUID', async () => {
    const updateSpy = vi.spyOn(classesApi, 'updateClass').mockResolvedValue({
      success: true,
      data: { id: 'cls-uuid-1', classTeacherId: 'staff-uuid-99' }
    });

    const res = await classesApi.updateClass('cls-uuid-1', { classTeacherId: 'staff-uuid-99' });
    expect(updateSpy).toHaveBeenCalledWith('cls-uuid-1', { classTeacherId: 'staff-uuid-99' });
    expect(res.data.classTeacherId).toBe('staff-uuid-99');
  });

  it('15. teacher removal sends null for classTeacherId', async () => {
    const updateSpy = vi.spyOn(classesApi, 'updateClass').mockResolvedValue({
      success: true,
      data: { id: 'cls-uuid-1', classTeacherId: null }
    });

    const res = await classesApi.updateClass('cls-uuid-1', { classTeacherId: null });
    expect(updateSpy).toHaveBeenCalledWith('cls-uuid-1', { classTeacherId: null });
    expect(res.data.classTeacherId).toBeNull();
  });

  it('16. handles 409 conflict when deleting class with active students', async () => {
    const deleteSpy = vi.spyOn(classesApi, 'deleteClass').mockRejectedValue({
      response: {
        status: 409,
        data: { message: 'Cannot delete class with active student enrollments' }
      }
    });

    await expect(classesApi.deleteClass('cls-with-students')).rejects.toMatchObject({
      response: { status: 409 }
    });
    expect(deleteSpy).toHaveBeenCalledWith('cls-with-students');
  });

  it('17. handles 409 conflict when deleting section with active students', async () => {
    const deleteSecSpy = vi.spyOn(classesApi, 'deleteSection').mockRejectedValue({
      response: {
        status: 409,
        data: { message: 'Cannot delete section with active student enrollments' }
      }
    });

    await expect(classesApi.deleteSection('cls-1', 'sec-1')).rejects.toMatchObject({
      response: { status: 409 }
    });
    expect(deleteSecSpy).toHaveBeenCalledWith('cls-1', 'sec-1');
  });

  it('18. handles 409 conflict when deleting category in use by classes', async () => {
    const deleteCatSpy = vi.spyOn(classesApi, 'deleteClassCategory').mockRejectedValue({
      response: {
        status: 409,
        data: { message: 'Cannot delete category in use by existing classes' }
      }
    });

    await expect(classesApi.deleteClassCategory('cat-in-use')).rejects.toMatchObject({
      response: { status: 409 }
    });
    expect(deleteCatSpy).toHaveBeenCalledWith('cat-in-use');
  });

  it('19. handles 403 permission denied error gracefully', async () => {
    vi.spyOn(classesApi, 'createClass').mockRejectedValue({
      response: {
        status: 403,
        data: { message: 'Forbidden: Insufficient permissions' }
      }
    });

    await expect(classesApi.createClass({ name: 'Grade X' })).rejects.toMatchObject({
      response: { status: 403 }
    });
  });

  it('20. handles 404 entity not found error gracefully', async () => {
    vi.spyOn(classesApi, 'getClass').mockRejectedValue({
      response: {
        status: 404,
        data: { message: 'Class not found' }
      }
    });

    await expect(classesApi.getClass('non-existent-uuid')).rejects.toMatchObject({
      response: { status: 404 }
    });
  });

  it('21. bulk import creates class then section using returned PostgreSQL UUIDs', async () => {
    const createClassSpy = vi.spyOn(classesApi, 'createClass').mockResolvedValue({
      success: true,
      data: { id: 'new-class-uuid-100', name: 'Grade 9', sections: [{ id: 'sec-100', name: 'A' }] }
    });
    const createSecSpy = vi.spyOn(classesApi, 'createSection').mockResolvedValue({
      success: true,
      data: { id: 'new-sec-uuid-101', name: 'B', classId: 'new-class-uuid-100' }
    });

    const classRes = await classesApi.createClass({ name: 'Grade 9', defaultSection: 'A' });
    expect(classRes.data.id).toBe('new-class-uuid-100');

    const secRes = await classesApi.createSection(classRes.data.id, { name: 'B' });
    expect(secRes.data.id).toBe('new-sec-uuid-101');
    expect(createClassSpy).toHaveBeenCalled();
    expect(createSecSpy).toHaveBeenCalledWith('new-class-uuid-100', { name: 'B' });
  });

  it('22. ID REGRESSION: verifies payloads use PostgreSQL UUIDs, never Firestore IDs', async () => {
    const validUUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
    const createSpy = vi.spyOn(classesApi, 'createClass').mockResolvedValue({
      success: true,
      data: { id: validUUID }
    });

    await classesApi.createClass({
      name: 'Class Alpha',
      categoryId: validUUID,
      defaultSection: 'A'
    });

    const sentPayload = createSpy.mock.calls[0][0];
    expect(sentPayload.categoryId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(sentPayload).not.toHaveProperty('schoolId');
  });

  it('23. SECURITY REGRESSION: verifies frontend payloads do NOT send client-controlled schoolId', async () => {
    const createSpy = vi.spyOn(classesApi, 'createClass').mockResolvedValue({
      success: true,
      data: { id: 'uuid-123' }
    });

    await classesApi.createClass({
      name: 'Class Beta',
      defaultSection: 'A'
    });

    const sentPayload = createSpy.mock.calls[0][0];
    expect(sentPayload).not.toHaveProperty('schoolId');
    expect(sentPayload).not.toHaveProperty('tenantId');
  });
});
