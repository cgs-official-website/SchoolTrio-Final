import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/app.js';
import * as authRepository from '../../../src/modules/auth/auth.repository.js';
import * as passwordService from '../../../src/modules/auth/password.service.js';
import * as sessionService from '../../../src/modules/auth/session.service.js';
import * as tokenService from '../../../src/modules/auth/token.service.js';

describe('POST /api/v1/auth/admission-login Integration', () => {
  const app = createApp();

  const mockSchool = {
    id: '25e9637a-7fa4-4ac2-b43d-b4c0edcf2932',
    name: 'Spring Mount Valley School',
    code: 'SchoolS024',
    status: 'approved'
  };

  const mockParentUser = {
    id: '87525430-ed28-4038-a74d-82e35a06529e',
    schoolId: '25e9637a-7fa4-4ac2-b43d-b4c0edcf2932',
    email: 'parent.ananthakumar@s024.sms.internal',
    passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$someArgonHash',
    passwordAlgorithm: 'argon2id',
    systemRole: 'PARENT',
    tokenVersion: 1,
    isActive: true
  };

  const mockStudent = {
    id: '00944d2b-8fd3-49bc-b9bc-695f2b414cb0',
    schoolId: '25e9637a-7fa4-4ac2-b43d-b4c0edcf2932',
    admissionNumber: '539',
    firstName: 'Student',
    status: 'Active',
    parents: [
      {
        id: 'd971243d-6769-4ff0-93b8-08187fb1119d',
        relationship: 'Parent',
        parent: {
          id: 'c373e62c-b099-47b2-9887-202a81c8f4b6',
          schoolId: '25e9637a-7fa4-4ac2-b43d-b4c0edcf2932',
          userId: mockParentUser.id,
          user: mockParentUser
        }
      }
    ]
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('successfully logs in via admission number, sets HttpOnly cookie, and omits rawRefreshToken from body', async () => {
    vi.spyOn(authRepository, 'findSchoolByCode').mockResolvedValue(mockSchool);
    vi.spyOn(authRepository, 'findStudentWithParentsByAdmissionNumber').mockResolvedValue(mockStudent);
    vi.spyOn(passwordService, 'isLockedPassword').mockReturnValue(false);
    vi.spyOn(passwordService, 'verifyPassword').mockResolvedValue(true);
    vi.spyOn(sessionService, 'createSession').mockResolvedValue({
      rawToken: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      sessionId: 'session-uuid-1'
    });
    vi.spyOn(tokenService, 'issueAccessToken').mockReturnValue('mock-admission-jwt-token');

    const res = await request(app)
      .post('/api/v1/auth/admission-login')
      .send({
        schoolCode: 'SchoolS024',
        admissionNumber: '539',
        password: 'ValidParentPassword123!'
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBe('mock-admission-jwt-token');
    expect(res.body.data.user).toEqual({
      id: mockParentUser.id,
      email: mockParentUser.email,
      schoolId: mockParentUser.schoolId,
      systemRole: mockParentUser.systemRole
    });

    // Invariant: rawRefreshToken must never appear in JSON response
    expect(res.body.data.rawRefreshToken).toBeUndefined();
    expect(res.body.rawRefreshToken).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('abcdef1234567890');

    // Invariant: Refresh token is strictly set in HttpOnly cookie
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const refreshCookie = cookies.find((c) => c.startsWith('sms_refresh_token='));
    expect(refreshCookie).toBeDefined();
    expect(refreshCookie).toContain('HttpOnly');
    expect(refreshCookie).toContain('SameSite=Strict');
  });

  it('rejects missing body fields with 400 VALIDATION_ERROR', async () => {
    const res1 = await request(app)
      .post('/api/v1/auth/admission-login')
      .send({
        admissionNumber: '539',
        password: 'Password123!'
      });
    expect(res1.status).toBe(400);
    expect(res1.body.error.code).toBe('VALIDATION_ERROR');

    const res2 = await request(app)
      .post('/api/v1/auth/admission-login')
      .send({
        schoolCode: 'SchoolS024',
        password: 'Password123!'
      });
    expect(res2.status).toBe(400);
    expect(res2.body.error.code).toBe('VALIDATION_ERROR');

    const res3 = await request(app)
      .post('/api/v1/auth/admission-login')
      .send({
        schoolCode: 'SchoolS024',
        admissionNumber: '539'
      });
    expect(res3.status).toBe(400);
    expect(res3.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects wrong password with 401 INVALID_CREDENTIALS', async () => {
    vi.spyOn(authRepository, 'findSchoolByCode').mockResolvedValue(mockSchool);
    vi.spyOn(authRepository, 'findStudentWithParentsByAdmissionNumber').mockResolvedValue(mockStudent);
    vi.spyOn(passwordService, 'isLockedPassword').mockReturnValue(false);
    vi.spyOn(passwordService, 'verifyPassword').mockResolvedValue(false);

    const res = await request(app)
      .post('/api/v1/auth/admission-login')
      .send({
        schoolCode: 'SchoolS024',
        admissionNumber: '539',
        password: 'WrongPassword123!'
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('returns 403 PASSWORD_NOT_SET for locked migrated parent accounts', async () => {
    vi.spyOn(authRepository, 'findSchoolByCode').mockResolvedValue(mockSchool);
    vi.spyOn(authRepository, 'findStudentWithParentsByAdmissionNumber').mockResolvedValue(mockStudent);
    vi.spyOn(passwordService, 'isLockedPassword').mockReturnValue(true);

    const res = await request(app)
      .post('/api/v1/auth/admission-login')
      .send({
        schoolCode: 'SchoolS024',
        admissionNumber: '539',
        password: 'AnyPassword123!'
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('PASSWORD_NOT_SET');
  });

  it('rejects suspended school with 403 TENANT_ACCESS_ERROR', async () => {
    vi.spyOn(authRepository, 'findSchoolByCode').mockResolvedValue({
      ...mockSchool,
      status: 'suspended'
    });

    const res = await request(app)
      .post('/api/v1/auth/admission-login')
      .send({
        schoolCode: 'SchoolS024',
        admissionNumber: '539',
        password: 'ValidPassword123!'
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('TENANT_ACCESS_ERROR');
  });

  it('rejects nonexistent school code with 401 INVALID_CREDENTIALS (enumeration resistance)', async () => {
    vi.spyOn(authRepository, 'findSchoolByCode').mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/auth/admission-login')
      .send({
        schoolCode: 'NonExistentSchoolCode',
        admissionNumber: '539',
        password: 'ValidPassword123!'
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });
});
