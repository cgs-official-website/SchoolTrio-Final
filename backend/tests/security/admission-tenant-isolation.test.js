import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import * as authRepository from '../../src/modules/auth/auth.repository.js';
import * as passwordService from '../../src/modules/auth/password.service.js';
import * as sessionService from '../../src/modules/auth/session.service.js';
import * as tokenService from '../../src/modules/auth/token.service.js';


describe('Security: Admission Number Tenant Isolation & Injection Resistance', () => {
  const app = createApp();

  const schoolA = {
    id: '25e9637a-7fa4-4ac2-b43d-b4c0edcf2932',
    name: 'Spring Mount Valley School',
    code: 'SchoolS024',
    status: 'approved'
  };

  const schoolB = {
    id: 'e2638de0-cf88-4cef-96db-74c353c6e43d',
    name: 'TrustITec College',
    code: 'SchoolS015',
    status: 'approved'
  };

  const studentA = {
    id: '00944d2b-8fd3-49bc-b9bc-695f2b414cb0',
    schoolId: schoolA.id,
    admissionNumber: '539',
    firstName: 'Student A',
    status: 'Active',
    parents: [
      {
        id: 'link-1',
        relationship: 'Parent',
        parent: {
          id: 'parent-profile-1',
          schoolId: schoolA.id,
          userId: 'parent-user-a-uuid',
          user: {
            id: 'parent-user-a-uuid',
            schoolId: schoolA.id,
            email: 'parent.a@s024.sms.internal',
            passwordHash: '$argon2id$v=19$validhashA',
            passwordAlgorithm: 'argon2id',
            systemRole: 'PARENT',
            tokenVersion: 1,
            isActive: true,
            legacyFirestoreId: 'firestore-legacy-id-123'
          }
        }
      }
    ]
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects cross-tenant login when School B code is supplied for a School A student', async () => {
    vi.spyOn(authRepository, 'findSchoolByCode').mockImplementation(async (code) => {
      if (code === 'SchoolS015') return schoolB;
      if (code === 'SchoolS024') return schoolA;
      return null;
    });

    vi.spyOn(authRepository, 'findStudentWithParentsByAdmissionNumber').mockImplementation(
      async (schoolId, admNo) => {
        // Student 539 only exists in schoolA, not schoolB
        if (schoolId === schoolA.id && admNo === '539') return studentA;
        return null;
      }
    );

    // Attempting login with School B code + School A admission number
    const res = await request(app)
      .post('/api/v1/auth/admission-login')
      .send({
        schoolCode: 'SchoolS015',
        admissionNumber: '539',
        password: 'ValidPassword123!'
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('ignores client-supplied X-Tenant-Id or X-School-Id headers during admission login', async () => {
    vi.spyOn(authRepository, 'findSchoolByCode').mockResolvedValue(schoolA);
    vi.spyOn(authRepository, 'findStudentWithParentsByAdmissionNumber').mockResolvedValue(studentA);
    vi.spyOn(passwordService, 'isLockedPassword').mockReturnValue(false);
    vi.spyOn(passwordService, 'verifyPassword').mockResolvedValue(true);
    vi.spyOn(sessionService, 'createSession').mockResolvedValue({
      rawToken: 'b'.repeat(64),
      sessionId: 'session-uuid'
    });
    vi.spyOn(tokenService, 'issueAccessToken').mockReturnValue('jwt-token-for-school-a');

    const res = await request(app)
      .post('/api/v1/auth/admission-login')
      .set('X-Tenant-Id', schoolB.id) // Attacker attempting to override tenant with School B
      .set('X-School-Id', schoolB.id)
      .send({
        schoolCode: 'SchoolS024',
        admissionNumber: '539',
        password: 'ValidPassword123!'
      });

    expect(res.status).toBe(200);
    // Identity is derived strictly from schoolCode -> School A
    expect(res.body.data.user.schoolId).toBe(schoolA.id);
  });

  it('does not leak passwordHash, passwordAlgorithm, legacyFirestoreId, or internal student data in response payload', async () => {
    vi.spyOn(authRepository, 'findSchoolByCode').mockResolvedValue(schoolA);
    vi.spyOn(authRepository, 'findStudentWithParentsByAdmissionNumber').mockResolvedValue(studentA);
    vi.spyOn(passwordService, 'isLockedPassword').mockReturnValue(false);
    vi.spyOn(passwordService, 'verifyPassword').mockResolvedValue(true);
    vi.spyOn(sessionService, 'createSession').mockResolvedValue({
      rawToken: 'c'.repeat(64),
      sessionId: 'session-uuid'
    });
    vi.spyOn(tokenService, 'issueAccessToken').mockReturnValue('jwt-token');

    const res = await request(app)
      .post('/api/v1/auth/admission-login')
      .send({
        schoolCode: 'SchoolS024',
        admissionNumber: '539',
        password: 'ValidPassword123!'
      });

    expect(res.status).toBe(200);
    const bodyStr = JSON.stringify(res.body);

    expect(bodyStr).not.toContain('$argon2id');
    expect(bodyStr).not.toContain('firestore-legacy-id-123');
    expect(bodyStr).not.toContain('studentA');
    expect(bodyStr).not.toContain('Student A');
    expect(res.body.data.user.passwordHash).toBeUndefined();
    expect(res.body.data.user.passwordAlgorithm).toBeUndefined();
    expect(res.body.data.user.legacyFirestoreId).toBeUndefined();
  });
});
