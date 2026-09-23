import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as clientModule from '../client.js';
import {
  listHomework,
  getHomework,
  createHomework,
  updateHomework,
  deleteHomework,
  updateSubmission,
  getStudentHomework,
  updateStudentHomeworkStatus,
  homeworkApi
} from '../homework.js';

describe('Homework API Client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('lists homework with query params', async () => {
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: [{ id: 'hw-1', title: 'Math HW' }]
    });

    const res = await listHomework({ classId: 'cls-1', page: 1, limit: 10 });
    expect(spy).toHaveBeenCalledWith('/api/v1/homework?classId=cls-1&page=1&limit=10', {
      method: 'GET'
    });
    expect(res.data).toHaveLength(1);
  });

  it('retrieves single homework with roster', async () => {
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: { id: 'hw-1', title: 'Math HW', roster: [] }
    });

    const res = await getHomework('hw-1');
    expect(spy).toHaveBeenCalledWith('/api/v1/homework/hw-1', {
      method: 'GET'
    });
    expect(res.data.id).toBe('hw-1');
  });

  it('creates homework with payload', async () => {
    const payload = {
      title: 'New HW',
      classId: 'cls-1',
      subjectId: 'sub-1',
      dueDate: '2026-09-30'
    };
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: { id: 'hw-new', ...payload }
    });

    const res = await createHomework(payload);
    expect(spy).toHaveBeenCalledWith('/api/v1/homework', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    expect(res.data.id).toBe('hw-new');
  });

  it('updates homework with payload', async () => {
    const payload = { title: 'Updated HW' };
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: { id: 'hw-1', title: 'Updated HW' }
    });

    const res = await updateHomework('hw-1', payload);
    expect(spy).toHaveBeenCalledWith('/api/v1/homework/hw-1', {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    expect(res.data.title).toBe('Updated HW');
  });

  it('deletes homework', async () => {
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: { id: 'hw-1' }
    });

    const res = await deleteHomework('hw-1');
    expect(spy).toHaveBeenCalledWith('/api/v1/homework/hw-1', {
      method: 'DELETE'
    });
    expect(res.success).toBe(true);
  });

  it('updates student submission evaluation', async () => {
    const payload = { status: 'Completed', grade: 'A', feedback: 'Good' };
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: { id: 'sub-1', ...payload }
    });

    const res = await updateSubmission('hw-1', 'stu-1', payload);
    expect(spy).toHaveBeenCalledWith('/api/v1/homework/hw-1/submissions/stu-1', {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
    expect(res.data.status).toBe('Completed');
  });

  it('gets student-scoped homework', async () => {
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: [{ id: 'hw-1', status: 'Not Started' }]
    });

    const res = await getStudentHomework('stu-1', { status: 'Not Started' });
    expect(spy).toHaveBeenCalledWith('/api/v1/students/stu-1/homework?status=Not+Started', {
      method: 'GET'
    });
    expect(res.data).toHaveLength(1);
  });

  it('updates student homework status', async () => {
    const payload = { status: 'Completed' };
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: { id: 'sub-1', status: 'Completed' }
    });

    const res = await updateStudentHomeworkStatus('stu-1', 'hw-1', payload);
    expect(spy).toHaveBeenCalledWith('/api/v1/students/stu-1/homework/hw-1/status', {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
    expect(res.data.status).toBe('Completed');
  });

  it('gets unread homework count', async () => {
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: { count: 3 }
    });

    const res = await homeworkApi.getUnreadHomeworkCount({ since: '2026-09-01T00:00:00.000Z' });
    expect(spy).toHaveBeenCalledWith('/api/v1/homework/unread-count?since=2026-09-01T00%3A00%3A00.000Z', {
      method: 'GET'
    });
    expect(res.data.count).toBe(3);
  });

  it('exports object bundle homeworkApi', () => {
    expect(homeworkApi.listHomework).toBe(listHomework);
    expect(homeworkApi.getHomework).toBe(getHomework);
    expect(homeworkApi.createHomework).toBe(createHomework);
    expect(homeworkApi.updateHomework).toBe(updateHomework);
    expect(homeworkApi.deleteHomework).toBe(deleteHomework);
    expect(homeworkApi.updateSubmission).toBe(updateSubmission);
    expect(homeworkApi.getStudentHomework).toBe(getStudentHomework);
    expect(homeworkApi.updateStudentHomeworkStatus).toBe(updateStudentHomeworkStatus);
    expect(homeworkApi.getUnreadHomeworkCount).toBeDefined();
  });
});
