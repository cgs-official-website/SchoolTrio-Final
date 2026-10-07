import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as homeworkApi from '../api/homework.js';
import * as classesApi from '../api/classes.js';
import * as inventoryApi from '../api/inventory.js';
import * as liveData from '../utils/liveData.js';
import { apiClient } from '../api/client.js';

vi.mock('../api/client.js', () => ({
  apiClient: vi.fn()
}));

describe('Global Bulk Import Phase 2 — Homework Batch & Live Sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Homework Bulk Submissions API Client', () => {
    it('calls PUT /api/v1/homework/:id/submissions/bulk with payload', async () => {
      apiClient.mockResolvedValue({
        success: true,
        data: { updatedCount: 3 }
      });

      const homeworkId = 'hw-uuid-101';
      const submissions = [
        { studentId: 'stu-1', status: 'Completed', grade: 'A+', feedback: 'Excellent' },
        { studentId: 'stu-2', status: 'Submitted', grade: 'B', feedback: 'Good' },
        { studentId: 'stu-3', status: 'In Progress', grade: null, feedback: 'Pending question 3' }
      ];

      const res = await homeworkApi.bulkUpdateSubmissions(homeworkId, submissions);

      expect(apiClient).toHaveBeenCalledTimes(1);
      expect(apiClient).toHaveBeenCalledWith(
        '/api/v1/homework/hw-uuid-101/submissions/bulk',
        {
          method: 'PUT',
          body: JSON.stringify({ submissions })
        }
      );
      expect(res.data.updatedCount).toBe(3);
    });

    it('replaces N requests with exactly 1 request for 100 student submissions', async () => {
      apiClient.mockResolvedValue({
        success: true,
        data: { updatedCount: 100 }
      });

      const submissions = Array.from({ length: 100 }, (_, i) => ({
        studentId: `student-uuid-${i + 1}`,
        status: 'Completed',
        grade: '100',
        feedback: 'Perfect'
      }));

      await homeworkApi.bulkUpdateSubmissions('hw-uuid-bulk', submissions);

      expect(apiClient).toHaveBeenCalledTimes(1);
    });
  });

  describe('2. Live Data Event Synchronization', () => {
    it('notifies homework channel after evaluation update', () => {
      const notifySpy = vi.spyOn(liveData, 'notifyDataChanged');
      liveData.notifyDataChanged('homework');
      expect(notifySpy).toHaveBeenCalledWith('homework');
    });

    it('notifies classes channel after bulk class import', () => {
      const notifySpy = vi.spyOn(liveData, 'notifyDataChanged');
      liveData.notifyDataChanged('classes');
      expect(notifySpy).toHaveBeenCalledWith('classes');
    });

    it('notifies inventory channel after bulk inventory import', () => {
      const notifySpy = vi.spyOn(liveData, 'notifyDataChanged');
      liveData.notifyDataChanged('inventory');
      expect(notifySpy).toHaveBeenCalledWith('inventory');
    });
  });
});
