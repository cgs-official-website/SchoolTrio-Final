import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as clientModule from '../client.js';
import {
  listAcademicResources,
  getAcademicResource,
  createAcademicResource,
  updateAcademicResource,
  deleteAcademicResource,
  academicResourcesApi
} from '../academic-resources.js';

describe('Academic Resources API Client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('lists academic resources with allowed query parameters', async () => {
    const mockResources = [
      {
        id: 'res-1',
        title: 'Physics Chapter 1 Notes',
        classId: 'cls-1',
        className: 'Grade 10',
        subjectId: 'sub-1',
        subjectName: 'Physics',
        type: 'document',
        fileUrl: 'https://example.com/physics.pdf'
      }
    ];
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: mockResources,
      pagination: { total: 1, page: 1, limit: 100, totalPages: 1 }
    });

    const res = await listAcademicResources({
      classId: 'cls-1',
      subjectId: 'sub-1',
      type: 'document',
      uploaderId: 'user-1',
      search: 'Physics',
      page: 1,
      limit: 100
    });

    expect(spy).toHaveBeenCalledWith(
      '/api/v1/academic-resources?classId=cls-1&subjectId=sub-1&type=document&uploaderId=user-1&search=Physics&page=1&limit=100',
      { method: 'GET' }
    );
    expect(res.data).toHaveLength(1);
    expect(res.data[0].id).toBe('res-1');
  });

  it('filters out disallowed query parameters (schoolId, tenantId, userId, role)', async () => {
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: []
    });

    await listAcademicResources({
      schoolId: 'tenant-123',
      tenantId: 'tenant-456',
      userId: 'user-789',
      role: 'admin',
      classId: 'cls-1',
      unauthorizedKey: 'bad'
    });

    expect(spy).toHaveBeenCalledWith('/api/v1/academic-resources?classId=cls-1', {
      method: 'GET'
    });
  });

  it('retrieves a single academic resource by ID', async () => {
    const mockResource = {
      id: 'res-1',
      title: 'Chemistry Lab Manual',
      type: 'document'
    };
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: mockResource
    });

    const res = await getAcademicResource('res-1');
    expect(spy).toHaveBeenCalledWith('/api/v1/academic-resources/res-1', {
      method: 'GET'
    });
    expect(res.data.id).toBe('res-1');
  });

  it('creates an academic resource with valid payload', async () => {
    const payload = {
      title: 'Biology Diagrams',
      classId: 'cls-1',
      subjectId: 'sub-1',
      fileUrl: 'https://example.com/bio.png',
      type: 'image',
      description: 'Cell structure diagrams'
    };
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: { id: 'res-new', ...payload }
    });

    const res = await createAcademicResource(payload);
    expect(spy).toHaveBeenCalledWith('/api/v1/academic-resources', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    expect(res.data.id).toBe('res-new');
  });

  it('updates an academic resource by ID with partial payload', async () => {
    const updatePayload = {
      title: 'Updated Biology Diagrams',
      type: 'image'
    };
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: { id: 'res-1', ...updatePayload }
    });

    const res = await updateAcademicResource('res-1', updatePayload);
    expect(spy).toHaveBeenCalledWith('/api/v1/academic-resources/res-1', {
      method: 'PATCH',
      body: JSON.stringify(updatePayload)
    });
    expect(res.data.title).toBe('Updated Biology Diagrams');
  });

  it('deletes an academic resource by ID', async () => {
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      message: 'Academic resource deleted successfully'
    });

    const res = await deleteAcademicResource('res-1');
    expect(spy).toHaveBeenCalledWith('/api/v1/academic-resources/res-1', {
      method: 'DELETE'
    });
    expect(res.success).toBe(true);
  });

  it('exports academicResourcesApi object with exact methods', () => {
    expect(academicResourcesApi.listAcademicResources).toBe(listAcademicResources);
    expect(academicResourcesApi.getAcademicResource).toBe(getAcademicResource);
    expect(academicResourcesApi.createAcademicResource).toBe(createAcademicResource);
    expect(academicResourcesApi.updateAcademicResource).toBe(updateAcademicResource);
    expect(academicResourcesApi.deleteAcademicResource).toBe(deleteAcademicResource);
  });
});
