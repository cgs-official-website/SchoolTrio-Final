import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as clientModule from '../client.js';
import { getMyChildren, linkChild, unlinkChild } from '../parents.js';

describe('Parents API Client Module (Phase 4C.7-D.2-I-G.2)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('1. getMyChildren calls apiClient with GET /api/v1/parents/me/children', async () => {
    const mockChildren = [
      {
        id: 'link-1',
        relationship: 'Mother',
        student: { id: 'stu-1', firstName: 'Alice', lastName: 'Smith' }
      }
    ];

    const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: mockChildren
    });

    const res = await getMyChildren();

    expect(apiSpy).toHaveBeenCalledWith('/api/v1/parents/me/children', {
      method: 'GET'
    });
    expect(res.data).toEqual(mockChildren);
  });

  it('2. linkChild calls apiClient with POST /api/v1/parents/me/link-child and payload', async () => {
    const payload = {
      admissionNumber: 'ADM-001',
      dob: '2015-05-10',
      relationship: 'Mother'
    };

    const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: {
        id: 'link-1',
        relationship: 'Mother',
        student: { id: 'stu-1', admissionNumber: 'ADM-001' }
      }
    });

    const res = await linkChild(payload);

    expect(apiSpy).toHaveBeenCalledWith('/api/v1/parents/me/link-child', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    expect(res.data.id).toBe('link-1');
  });

  it('3. unlinkChild calls apiClient with DELETE /api/v1/parents/me/children/:studentId', async () => {
    const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: null
    });

    const res = await unlinkChild('stu-uuid-1');

    expect(apiSpy).toHaveBeenCalledWith('/api/v1/parents/me/children/stu-uuid-1', {
      method: 'DELETE'
    });
    expect(res.data).toBeNull();
  });

  it('4. studentId is properly URL-encoded in unlinkChild', async () => {
    const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: null
    });

    await unlinkChild('stu/with?special#chars');

    expect(apiSpy).toHaveBeenCalledWith('/api/v1/parents/me/children/stu%2Fwith%3Fspecial%23chars', {
      method: 'DELETE'
    });
  });

  it('5. No schoolId or parentId is sent in requests', async () => {
    const apiSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: []
    });

    await getMyChildren();
    await unlinkChild('stu-1');

    const firstCallUrl = apiSpy.mock.calls[0][0];
    const secondCallUrl = apiSpy.mock.calls[1][0];

    expect(firstCallUrl).not.toContain('schoolId');
    expect(firstCallUrl).not.toContain('parentId');
    expect(secondCallUrl).not.toContain('schoolId');
    expect(secondCallUrl).not.toContain('parentId');
  });

  it('6. Propagates errors properly from apiClient', async () => {
    vi.spyOn(clientModule, 'apiClient').mockRejectedValue(new Error('Network error'));

    await expect(getMyChildren()).rejects.toThrow('Network error');
    await expect(linkChild({ admissionNumber: 'ADM-1', dob: '2015-01-01', relationship: 'Father' })).rejects.toThrow('Network error');
    await expect(unlinkChild('stu-1')).rejects.toThrow('Network error');
  });
});
