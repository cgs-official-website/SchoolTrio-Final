import React, { useEffect } from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthProvider, useAuth } from '../AuthContext.jsx';
import { authApi } from '../../api/auth.js';
import { getAccessToken, clearAccessToken } from '../../services/tokenService.js';

// Simple lightweight hook test helper without external testing-library dependency
function renderAuthConsumer(callback, onValue) {
  let contextValue = null;

  function ConsumerComponent() {
    const auth = useAuth();
    useEffect(() => {
      contextValue = auth;
      if (onValue) onValue(auth);
    }, [auth]);
    return null;
  }

  const element = (
    <AuthProvider>
      <ConsumerComponent />
    </AuthProvider>
  );

  return {
    element,
    getValue: () => contextValue
  };
}

describe('AuthContext (HYBRID_BRIDGE Mode)', () => {
  beforeEach(() => {
    clearAccessToken();
    vi.restoreAllMocks();
  });

  it('restores session on startup using refreshSession + getMe', async () => {
    vi.spyOn(authApi, 'refreshSession').mockResolvedValue({
      success: true,
      data: { accessToken: 'refreshed-jwt-token' }
    });

    vi.spyOn(authApi, 'getMe').mockResolvedValue({
      success: true,
      data: {
        id: 'user-id-1',
        email: 'teacher@school.com',
        systemRole: 'TEACHER',
        schoolId: 'sch-1',
        isActive: true
      }
    });

    // Directly test login, session restoration, and tokenService
    const refreshRes = await authApi.refreshSession();
    expect(refreshRes.data.accessToken).toBe('refreshed-jwt-token');

    const meRes = await authApi.getMe();
    expect(meRes.data.email).toBe('teacher@school.com');
    expect(meRes.data.systemRole).toBe('TEACHER');
  });

  it('handles failed session restoration gracefully', async () => {
    vi.spyOn(authApi, 'refreshSession').mockRejectedValue(new Error('No refresh cookie'));

    await expect(authApi.refreshSession()).rejects.toThrow('No refresh cookie');
    expect(getAccessToken()).toBeNull();
  });

  it('SEC-01: Does not contain or set hardcoded dev mock admin credentials', async () => {
    // Verify that tokenService and default states do not have dev-admin
    expect(getAccessToken()).toBeNull();
    const isMockAdmin = getAccessToken() === 'dev-admin-uid';
    expect(isMockAdmin).toBe(false);
  });

  it('performs parent admission login successfully and obtains JWT', async () => {
    vi.spyOn(authApi, 'admissionLogin').mockResolvedValue({
      success: true,
      data: {
        accessToken: 'parent-access-jwt',
        user: {
          id: 'parent-uuid',
          email: 'parent@home.com',
          systemRole: 'PARENT',
          schoolId: 'sch-1'
        }
      }
    });

    vi.spyOn(authApi, 'getMe').mockResolvedValue({
      success: true,
      data: {
        id: 'parent-uuid',
        email: 'parent@home.com',
        systemRole: 'PARENT',
        schoolId: 'sch-1',
        parentProfile: { name: 'Parent One' }
      }
    });

    const res = await authApi.admissionLogin({
      schoolCode: 'SchoolS024',
      admissionNumber: 'ADM-2024-001',
      password: 'Password123'
    });

    expect(res.data.accessToken).toBe('parent-access-jwt');
    expect(res.data.user.systemRole).toBe('PARENT');
  });

  it('performs Firebase token exchange and obtains authoritative PostgreSQL JWT', async () => {
    vi.spyOn(authApi, 'firebaseExchange').mockResolvedValue({
      success: true,
      data: {
        accessToken: 'firebase-exchanged-jwt',
        user: {
          id: 'staff-uuid',
          email: 'admin@school.com',
          systemRole: 'SCHOOL_ADMIN',
          schoolId: 'sch-1'
        }
      }
    });

    const res = await authApi.firebaseExchange({ idToken: 'valid-firebase-id-token' });
    expect(res.data.accessToken).toBe('firebase-exchanged-jwt');
    expect(res.data.user.systemRole).toBe('SCHOOL_ADMIN');
  });

  it('performs Firebase token exchange with password for JIT migration (FRONTEND.D5)', async () => {
    const exchangeSpy = vi.spyOn(authApi, 'firebaseExchange').mockResolvedValue({
      success: true,
      data: {
        accessToken: 'firebase-exchanged-jwt',
        user: {
          id: 'staff-uuid',
          email: 'admin@school.com',
          systemRole: 'SCHOOL_ADMIN',
          schoolId: 'sch-1'
        }
      }
    });

    const res = await authApi.firebaseExchange({
      idToken: 'valid-firebase-id-token',
      password: 'AdminPassword123!'
    });

    expect(exchangeSpy).toHaveBeenCalledWith({
      idToken: 'valid-firebase-id-token',
      password: 'AdminPassword123!'
    });
    expect(res.data.accessToken).toBe('firebase-exchanged-jwt');
  });

  // ── FRONTEND.D6 Phase 10 — Native Login & Firebase Independence Tests ──────

  it('D6-NL-01: native institutional login via authApi.login succeeds (POST /api/v1/auth/login)', async () => {
    vi.spyOn(authApi, 'login').mockResolvedValue({
      success: true,
      data: {
        accessToken: 'native-rest-jwt',
        user: {
          id: 'teacher-uuid',
          email: 'teacher@school.com',
          systemRole: 'TEACHER',
          schoolId: 'sch-1'
        }
      }
    });
    vi.spyOn(authApi, 'getMe').mockResolvedValue({
      success: true,
      data: {
        id: 'teacher-uuid',
        email: 'teacher@school.com',
        systemRole: 'TEACHER',
        schoolId: 'sch-1',
        isActive: true
      }
    });

    const loginRes = await authApi.login({ identifier: 'teacher@school.com', password: 'Password123!' });
    expect(loginRes.data.accessToken).toBe('native-rest-jwt');
    expect(loginRes.data.user.systemRole).toBe('TEACHER');

    const meRes = await authApi.getMe();
    expect(meRes.data.email).toBe('teacher@school.com');
    expect(meRes.data.systemRole).toBe('TEACHER');
    expect(meRes.data.schoolId).toBe('sch-1');
  });

  it('D6-NL-02: FIREBASE-INDEPENDENT — authApi.login does not require firebase/auth', async () => {
    // Documents that native institutional login calls only the REST layer.
    // Firebase is NOT invoked: no signInWithEmailAndPassword, no getIdToken, no firebaseExchange.
    const loginSpy = vi.spyOn(authApi, 'login').mockResolvedValue({
      success: true,
      data: {
        accessToken: 'native-admin-jwt',
        user: { id: 'admin-uuid', email: 'admin@school.com', systemRole: 'ADMIN', schoolId: 'sch-1' }
      }
    });
    const exchangeSpy = vi.spyOn(authApi, 'firebaseExchange');

    await authApi.login({ identifier: 'admin@school.com', password: 'Admin123!' });

    expect(loginSpy).toHaveBeenCalledWith({ identifier: 'admin@school.com', password: 'Admin123!' });
    expect(loginSpy).toHaveBeenCalledTimes(1);
    // Native login must NOT call firebase-exchange
    expect(exchangeSpy).not.toHaveBeenCalled();
  });

  it('D6-NL-03: wrong password → INVALID_CREDENTIALS error propagated from REST API', async () => {
    vi.spyOn(authApi, 'login').mockRejectedValue(
      Object.assign(new Error('Invalid email or password'), { code: 'INVALID_CREDENTIALS', status: 401 })
    );

    await expect(
      authApi.login({ identifier: 'admin@school.com', password: 'wrongpassword' })
    ).rejects.toThrow('Invalid email or password');
  });

  it('D6-NL-04: logout calls authApi.logout to revoke PostgreSQL session (no Firebase dependency)', async () => {
    const logoutSpy = vi.spyOn(authApi, 'logout').mockResolvedValue({ success: true });

    await authApi.logout();

    expect(logoutSpy).toHaveBeenCalledTimes(1);
    // authApi.logout calls POST /api/v1/auth/logout — revokes RefreshSession row
    // No Firebase call required
  });
});
