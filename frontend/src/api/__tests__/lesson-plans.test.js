import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as clientModule from '../client.js';
import {
  listLessonPlans,
  getLessonPlan,
  createLessonPlan,
  updateLessonPlan,
  deleteLessonPlan,
  lessonPlansApi
} from '../lesson-plans.js';

describe('Lesson Plans API Client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('lists lesson plans with query parameters', async () => {
    const mockPlans = [
      {
        id: 'lp-1',
        topic: 'Linear Equations',
        date: '2026-10-15',
        status: 'draft',
        classId: 'cls-1',
        subjectId: 'sub-1'
      }
    ];
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: mockPlans,
      pagination: { total: 1, page: 1, limit: 100, totalPages: 1 }
    });

    const res = await listLessonPlans({
      classId: 'cls-1',
      subjectId: 'sub-1',
      status: 'draft',
      startDate: '2026-10-01',
      endDate: '2026-10-31',
      search: 'Linear',
      page: 1,
      limit: 100
    });

    expect(spy).toHaveBeenCalledWith(
      '/api/v1/lesson-plans?classId=cls-1&subjectId=sub-1&status=draft&startDate=2026-10-01&endDate=2026-10-31&search=Linear&page=1&limit=100',
      { method: 'GET' }
    );
    expect(res.data).toHaveLength(1);
    expect(res.data[0].id).toBe('lp-1');
  });

  it('filters out disallowed query parameters and leaves supported filters', async () => {
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: []
    });

    await listLessonPlans({
      schoolId: 'tenant-123',
      tenantId: 'tenant-456',
      userId: 'user-789',
      role: 'admin',
      classId: 'cls-1',
      unauthorizedKey: 'bad'
    });

    expect(spy).toHaveBeenCalledWith('/api/v1/lesson-plans?classId=cls-1', {
      method: 'GET'
    });
  });

  it('retrieves a single lesson plan by ID', async () => {
    const mockPlan = {
      id: 'lp-1',
      topic: 'Calculus Basics',
      date: '2026-10-20',
      status: 'ready'
    };
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: mockPlan
    });

    const res = await getLessonPlan('lp-1');
    expect(spy).toHaveBeenCalledWith('/api/v1/lesson-plans/lp-1', {
      method: 'GET'
    });
    expect(res.data.id).toBe('lp-1');
  });

  it('creates a lesson plan with valid payload', async () => {
    const payload = {
      classId: 'cls-1',
      subjectId: 'sub-1',
      topic: 'Photosynthesis',
      date: '2026-11-05',
      status: 'draft',
      objectives: 'Understand light reaction'
    };
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: { id: 'lp-new', ...payload }
    });

    const res = await createLessonPlan(payload);
    expect(spy).toHaveBeenCalledWith('/api/v1/lesson-plans', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    expect(res.data.id).toBe('lp-new');
  });

  it('updates a lesson plan by ID with partial payload', async () => {
    const updatePayload = {
      topic: 'Updated Topic Title',
      status: 'ready'
    };
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: { id: 'lp-1', ...updatePayload }
    });

    const res = await updateLessonPlan('lp-1', updatePayload);
    expect(spy).toHaveBeenCalledWith('/api/v1/lesson-plans/lp-1', {
      method: 'PATCH',
      body: JSON.stringify(updatePayload)
    });
    expect(res.data.topic).toBe('Updated Topic Title');
  });

  it('deletes a lesson plan by ID', async () => {
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      message: 'Lesson plan deleted successfully'
    });

    const res = await deleteLessonPlan('lp-1');
    expect(spy).toHaveBeenCalledWith('/api/v1/lesson-plans/lp-1', {
      method: 'DELETE'
    });
    expect(res.success).toBe(true);
  });

  it('exports lessonPlansApi object with exact methods', () => {
    expect(lessonPlansApi.listLessonPlans).toBe(listLessonPlans);
    expect(lessonPlansApi.getLessonPlan).toBe(getLessonPlan);
    expect(lessonPlansApi.createLessonPlan).toBe(createLessonPlan);
    expect(lessonPlansApi.updateLessonPlan).toBe(updateLessonPlan);
    expect(lessonPlansApi.deleteLessonPlan).toBe(deleteLessonPlan);
  });
});
