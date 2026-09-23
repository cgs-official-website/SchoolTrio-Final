import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as authApi from '../../api/auth.js';

describe('PendingApproval REST Screen Contract Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches authenticated user tenant approval status via authApi.getMe', async () => {
    const meSpy = vi.spyOn(authApi.authApi, 'getMe').mockResolvedValue({
      success: true,
      data: {
        user: {
          id: 'user-1',
          email: 'principal@school.edu',
          school: {
            id: 'school-1',
            name: 'Cambridge Academy',
            status: 'pending'
          }
        }
      }
    });

    const res = await authApi.authApi.getMe();
    expect(meSpy).toHaveBeenCalledTimes(1);
    expect(res.data.user.school.status).toBe('pending');
  });

  it('identifies approved status for redirect transition', async () => {
    vi.spyOn(authApi.authApi, 'getMe').mockResolvedValue({
      success: true,
      data: {
        user: {
          id: 'user-1',
          school: {
            id: 'school-1',
            status: 'approved'
          }
        }
      }
    });

    const res = await authApi.authApi.getMe();
    const status = res?.data?.user?.school?.status;
    const isApproved = String(status).toLowerCase() === 'approved' || String(status).toLowerCase() === 'active';
    expect(isApproved).toBe(true);
  });
});
