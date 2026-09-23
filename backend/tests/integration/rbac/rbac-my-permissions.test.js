import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/app.js';
import * as rbacService from '../../../src/modules/rbac/rbac.service.js';
import * as authRepository from '../../../src/modules/auth/auth.repository.js';
import * as tokenService from '../../../src/modules/auth/token.service.js';
import { SYSTEM_ROLES } from '../../../src/config/constants.js';

describe('Integration: Effective Permissions Endpoint (/api/v1/rbac/my-permissions)', () => {
  const app = createApp();
  const TENANT_A = '11111111-1111-4111-8111-111111111111';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const getAuthToken = (user) => {
    return tokenService.issueAccessToken({
      sub: user.id,
      schoolId: user.schoolId,
      systemRole: user.systemRole,
      tokenVersion: user.tokenVersion
    });
  };

  it('returns effective permissions for authenticated user', async () => {
    const mockTeacher = {
      id: 'teacher-1',
      schoolId: TENANT_A,
      email: 'teacher@school.edu',
      systemRole: SYSTEM_ROLES.TEACHER,
      tokenVersion: 1,
      isActive: true,
      school: { id: TENANT_A, name: 'Spring Mount', code: 'SchoolS024', status: 'active' }
    };

    const mockEffective = {
      userId: 'teacher-1',
      schoolId: TENANT_A,
      systemRole: SYSTEM_ROLES.TEACHER,
      roles: [{ name: 'Class Incharge', slug: 'class-incharge' }],
      permissions: {
        classes: { canRead: true, canCreate: true, canEdit: true, canDelete: false }
      }
    };

    vi.spyOn(authRepository, 'findUserById').mockResolvedValue(mockTeacher);
    vi.spyOn(rbacService, 'getMyEffectivePermissions').mockResolvedValue(mockEffective);

    const token = getAuthToken(mockTeacher);
    const res = await request(app)
      .get('/api/v1/rbac/my-permissions')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(mockEffective);
  });
});
