import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as clientModule from '../client.js';
import {
  listSubjects,
  getSubject,
  createSubject,
  updateSubject,
  deleteSubject,
  subjectsApi
} from '../subjects.js';

describe('Subjects API Client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('lists subjects with query params', async () => {
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: [{ id: 'sub-1', name: 'Mathematics', code: 'MATH' }],
      pagination: { total: 1, page: 1, limit: 100 }
    });

    const res = await listSubjects({ limit: 100 });
    expect(spy).toHaveBeenCalledWith('/api/v1/subjects?limit=100', {
      method: 'GET'
    });
    expect(res.data).toHaveLength(1);
    expect(res.data[0].id).toBe('sub-1');
  });

  it('retrieves single subject by ID', async () => {
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: { id: 'sub-1', name: 'Mathematics' }
    });

    const res = await getSubject('sub-1');
    expect(spy).toHaveBeenCalledWith('/api/v1/subjects/sub-1', {
      method: 'GET'
    });
    expect(res.data.name).toBe('Mathematics');
  });

  it('creates subject with payload', async () => {
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: { id: 'sub-1', name: 'Science', code: 'SCI101' }
    });

    const res = await createSubject({ name: 'Science', code: 'SCI101' });
    expect(spy).toHaveBeenCalledWith('/api/v1/subjects', {
      method: 'POST',
      body: JSON.stringify({ name: 'Science', code: 'SCI101' })
    });
    expect(res.data.id).toBe('sub-1');
  });

  it('updates subject by ID', async () => {
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: { id: 'sub-1', name: 'Advanced Science', code: 'SCI102' }
    });

    const res = await updateSubject('sub-1', { name: 'Advanced Science', code: 'SCI102' });
    expect(spy).toHaveBeenCalledWith('/api/v1/subjects/sub-1', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Advanced Science', code: 'SCI102' })
    });
    expect(res.data.name).toBe('Advanced Science');
  });

  it('deletes subject by ID', async () => {
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      message: 'Subject deleted successfully'
    });

    const res = await deleteSubject('sub-1');
    expect(spy).toHaveBeenCalledWith('/api/v1/subjects/sub-1', {
      method: 'DELETE'
    });
    expect(res.success).toBe(true);
  });

  it('exports object bundle subjectsApi', () => {
    expect(subjectsApi.listSubjects).toBe(listSubjects);
    expect(subjectsApi.getSubject).toBe(getSubject);
    expect(subjectsApi.createSubject).toBe(createSubject);
    expect(subjectsApi.updateSubject).toBe(updateSubject);
    expect(subjectsApi.deleteSubject).toBe(deleteSubject);
  });
});
