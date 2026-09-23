import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authApi } from '../auth.js';
import * as clientModule from '../client.js';

describe('authApi', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('firebaseExchange calls POST /api/v1/auth/firebase-exchange with idToken', async () => {
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: { accessToken: 'jwt-123', user: { id: 'u-1' } }
    });

    const res = await authApi.firebaseExchange({ idToken: 'firebase-id-token-abc' });

    expect(spy).toHaveBeenCalledWith('/api/v1/auth/firebase-exchange', {
      method: 'POST',
      body: JSON.stringify({ idToken: 'firebase-id-token-abc' })
    });
    expect(res.data.accessToken).toBe('jwt-123');
  });

  it('firebaseExchange forwards password when provided for JIT credential migration (FRONTEND.D5)', async () => {
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: { accessToken: 'jwt-123', user: { id: 'u-1' } }
    });

    const res = await authApi.firebaseExchange({
      idToken: 'firebase-id-token-abc',
      password: 'PlaintextPassword123!'
    });

    expect(spy).toHaveBeenCalledWith('/api/v1/auth/firebase-exchange', {
      method: 'POST',
      body: JSON.stringify({
        idToken: 'firebase-id-token-abc',
        password: 'PlaintextPassword123!'
      })
    });
    expect(res.data.accessToken).toBe('jwt-123');
  });

  it('admissionLogin calls POST /api/v1/auth/admission-login with schoolCode, admissionNumber, password', async () => {
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: { accessToken: 'jwt-parent', user: { id: 'u-parent' } }
    });

    const res = await authApi.admissionLogin({
      schoolCode: 'SchoolS024',
      admissionNumber: 'ADM-001',
      password: 'ParentPassword123'
    });

    expect(spy).toHaveBeenCalledWith('/api/v1/auth/admission-login', {
      method: 'POST',
      body: JSON.stringify({
        schoolCode: 'SchoolS024',
        admissionNumber: 'ADM-001',
        password: 'ParentPassword123'
      })
    });
    expect(res.data.user.id).toBe('u-parent');
  });

  it('refreshSession calls POST /api/v1/auth/refresh', async () => {
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: { accessToken: 'new-jwt' }
    });

    const res = await authApi.refreshSession();
    expect(spy).toHaveBeenCalledWith('/api/v1/auth/refresh', { method: 'POST' });
    expect(res.data.accessToken).toBe('new-jwt');
  });

  it('logout calls POST /api/v1/auth/logout', async () => {
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: null
    });

    await authApi.logout();
    expect(spy).toHaveBeenCalledWith('/api/v1/auth/logout', { method: 'POST' });
  });

  it('getMe calls GET /api/v1/auth/me', async () => {
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: { id: 'u-1', email: 'admin@school.com', systemRole: 'SCHOOL_ADMIN' }
    });

    const res = await authApi.getMe();
    expect(spy).toHaveBeenCalledWith('/api/v1/auth/me', { method: 'GET' });
    expect(res.data.systemRole).toBe('SCHOOL_ADMIN');
  });

  it('passwordResetRequest calls POST /api/v1/auth/password-reset/request with email', async () => {
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      message: 'If an account exists for this email, password reset instructions have been sent.'
    });

    const res = await authApi.passwordResetRequest({ email: 'teacher@springmount.co.in' });
    expect(spy).toHaveBeenCalledWith('/api/v1/auth/password-reset/request', {
      method: 'POST',
      body: JSON.stringify({ email: 'teacher@springmount.co.in' })
    });
    expect(res.success).toBe(true);
  });

  it('passwordResetConfirm calls POST /api/v1/auth/password-reset/confirm with token and newPassword', async () => {
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      message: 'Password has been successfully updated.'
    });

    const res = await authApi.passwordResetConfirm({
      token: 'a'.repeat(64),
      newPassword: 'NewPassword123'
    });
    expect(spy).toHaveBeenCalledWith('/api/v1/auth/password-reset/confirm', {
      method: 'POST',
      body: JSON.stringify({
        token: 'a'.repeat(64),
        newPassword: 'NewPassword123'
      })
    });
    expect(res.success).toBe(true);
  });

  it('passwordSetupConfirm calls POST /api/v1/auth/password-setup/confirm with token and newPassword', async () => {
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      message: 'Account password has been successfully configured.'
    });

    const res = await authApi.passwordSetupConfirm({
      token: 'b'.repeat(64),
      newPassword: 'SetupPassword123'
    });
    expect(spy).toHaveBeenCalledWith('/api/v1/auth/password-setup/confirm', {
      method: 'POST',
      body: JSON.stringify({
        token: 'b'.repeat(64),
        newPassword: 'SetupPassword123'
      })
    });
    expect(res.success).toBe(true);
  });
});
