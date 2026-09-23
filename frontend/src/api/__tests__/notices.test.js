import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as clientModule from '../client.js';
import {
  listNotices,
  getNotice,
  createNotice,
  updateNotice,
  deleteNotice,
  markNoticeViewed,
  noticesApi
} from '../notices.js';

describe('Notices API Client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('lists notices with query parameters', async () => {
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: [{ id: 'notice-1', title: 'Sports Day' }]
    });

    const res = await listNotices({ type: 'global', audience: 'all', page: 1, limit: 10 });
    expect(spy).toHaveBeenCalledWith('/api/v1/notices?type=global&audience=all&page=1&limit=10', {
      method: 'GET'
    });
    expect(res.data).toHaveLength(1);
  });

  it('retrieves a single notice by ID', async () => {
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: { id: 'notice-1', title: 'Sports Day' }
    });

    const res = await getNotice('notice-1');
    expect(spy).toHaveBeenCalledWith('/api/v1/notices/notice-1', {
      method: 'GET'
    });
    expect(res.data.id).toBe('notice-1');
  });

  it('creates a notice with payload', async () => {
    const payload = {
      title: 'New Announcement',
      content: 'Important school update',
      type: 'global',
      audience: 'all',
      priority: 'high'
    };
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: { id: 'notice-new', ...payload }
    });

    const res = await createNotice(payload);
    expect(spy).toHaveBeenCalledWith('/api/v1/notices', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    expect(res.data.id).toBe('notice-new');
  });

  it('updates a notice with partial payload', async () => {
    const updatePayload = {
      title: 'Updated Title'
    };
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: { id: 'notice-1', title: 'Updated Title' }
    });

    const res = await updateNotice('notice-1', updatePayload);
    expect(spy).toHaveBeenCalledWith('/api/v1/notices/notice-1', {
      method: 'PATCH',
      body: JSON.stringify(updatePayload)
    });
    expect(res.data.title).toBe('Updated Title');
  });

  it('deletes a notice by ID', async () => {
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: { id: 'notice-1', message: 'Notice deleted successfully' }
    });

    const res = await deleteNotice('notice-1');
    expect(spy).toHaveBeenCalledWith('/api/v1/notices/notice-1', {
      method: 'DELETE'
    });
    expect(res.success).toBe(true);
  });

  it('marks a notice as viewed by ID', async () => {
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: { notice: { id: 'notice-1' }, alreadyViewed: false }
    });

    const res = await markNoticeViewed('notice-1');
    expect(spy).toHaveBeenCalledWith('/api/v1/notices/notice-1/view', {
      method: 'POST'
    });
    expect(res.data.alreadyViewed).toBe(false);
  });

  it('exports noticesApi object containing all endpoints', () => {
    expect(noticesApi.listNotices).toBe(listNotices);
    expect(noticesApi.getNotice).toBe(getNotice);
    expect(noticesApi.createNotice).toBe(createNotice);
    expect(noticesApi.updateNotice).toBe(updateNotice);
    expect(noticesApi.deleteNotice).toBe(deleteNotice);
    expect(noticesApi.markNoticeViewed).toBe(markNoticeViewed);
  });
});
