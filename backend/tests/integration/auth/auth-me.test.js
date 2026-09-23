import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/app.js';
import * as authRepository from '../../../src/modules/auth/auth.repository.js';
import * as tokenService from '../../../src/modules/auth/token.service.js';

describe('GET /api/v1/auth/me Integration', () => {
  const app = createApp();

  const mockUser = {
    id: 'e9c4e270-26e1-43ac-8279-886ec13f4776',
    schoolId: '25e9637a-7fa4-4ac2-b43d-b4c0edcf2932',
    email: 'priyanka.s@springmount.co.in',
    systemRole: 'TENANT_USER',
    tokenVersion: 1,
    isActive: true,
    school: {
      id: '25e9637a-7fa4-4ac2-b43d-b4c0edcf2932',
      name: 'Spring Mount Public School',
      code: 'SchoolS024',
      status: 'active'
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns authenticated user profile data with valid Bearer token', async () => {
    const token = tokenService.issueAccessToken({
      sub: mockUser.id,
      schoolId: mockUser.schoolId,
      systemRole: mockUser.systemRole,
      tokenVersion: mockUser.tokenVersion
    });

    vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockUser);

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(mockUser.id);
    expect(res.body.data.email).toBe(mockUser.email);
    expect(res.body.data.school.code).toBe('SchoolS024');

    // Verify sensitive fields are strictly excluded
    expect(res.body.data.passwordHash).toBeUndefined();
    expect(res.body.data.passwordAlgorithm).toBeUndefined();
    expect(res.body.data.legacyFirestoreId).toBeUndefined();
  });

  it('rejects unauthenticated request with 401 UNAUTHORIZED', async () => {
    const res = await request(app).get('/api/v1/auth/me');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('rejects expired or tampered token with 401 UNAUTHORIZED', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer invalid-or-tampered-token');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });
});
