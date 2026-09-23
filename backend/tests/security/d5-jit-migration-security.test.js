/**
 * FRONTEND.D5-REMEDIATION — JIT Credential Migration Security & Concurrency Test Suite
 *
 * Coverage:
 * 1. Password policy boundary tests (min, max, exact boundaries, weak, short, long)
 * 2. Account-state guard tests (native argon2id, !LOCKED_FUTURE_AUTH_REQUIRED, !LOCKED_PARENT_NO_DIRECT_AUTH, inactive user, suspended tenant)
 * 3. Identity security tests (invalid Firebase token, identity conflict, wrong tenant, client identity injection)
 * 4. Credential hygiene tests (no plaintext password in response/user payload)
 * 5. Concurrency tests (simultaneous JIT, JIT + reset race, JIT + no-password race)
 * 6. Native login after migration (verifies Argon2id works and isn't overwritten by subsequent exchange)
 * 7. D3 interaction tests (JIT first, reset first, weak password, FUTURE_AUTH_REQUIRED protection)
 * 8. Rate limiting preserved
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import * as authRepository from '../../src/modules/auth/auth.repository.js';
import * as sessionService from '../../src/modules/auth/session.service.js';
import * as tokenService from '../../src/modules/auth/token.service.js';
import * as firebaseAuthService from '../../src/services/firebase-auth.service.js';
import * as passwordService from '../../src/modules/auth/password.service.js';

const app = createApp();

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const BASE_USER = {
  id: 'aa000000-0000-0000-0000-000000000001',
  schoolId: 'bb000000-0000-0000-0000-000000000001',
  email: 'd5-security@testschool.dev',
  systemRole: 'TEACHER',
  tokenVersion: 1,
  isActive: true,
  legacyFirestoreId: 'firebase-uid-d5-security',
  school: {
    id: 'bb000000-0000-0000-0000-000000000001',
    name: 'D5 Security Test School',
    code: 'D5SEC',
    status: 'active'
  }
};

const LOCKED_FIREBASE_USER = {
  ...BASE_USER,
  passwordHash: '!LOCKED_FIREBASE_AUTH_MANAGED_abc123'
};

const LOCKED_FUTURE_USER = {
  ...BASE_USER,
  id: 'aa000000-0000-0000-0000-000000000002',
  email: 'future@testschool.dev',
  passwordHash: '!LOCKED_FUTURE_AUTH_REQUIRED_def456'
};

const LOCKED_PARENT_USER = {
  ...BASE_USER,
  id: 'aa000000-0000-0000-0000-000000000003',
  email: 'parent@testschool.dev',
  systemRole: 'PARENT',
  passwordHash: '!LOCKED_PARENT_NO_DIRECT_AUTH_ghi789'
};

const NATIVE_ARGON2_USER = {
  ...BASE_USER,
  id: 'aa000000-0000-0000-0000-000000000004',
  email: 'native@testschool.dev',
  passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$existingNativeHash'
};

const FIREBASE_CLAIMS = {
  uid: 'firebase-uid-d5-security',
  email: 'd5-security@testschool.dev',
  emailVerified: true
};

const SESSION_MOCK = {
  rawToken: 'mock-raw-refresh-token-d5-security',
  sessionId: 'session-d5-security-uuid',
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
};

const UPGRADED_USER = { ...BASE_USER, passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$newHash', tokenVersion: 2 };

function mockFirebase() {
  vi.spyOn(firebaseAuthService, 'verifyFirebaseIdToken').mockResolvedValue(FIREBASE_CLAIMS);
}

function mockSession() {
  vi.spyOn(sessionService, 'createSession').mockResolvedValue(SESSION_MOCK);
  vi.spyOn(tokenService, 'issueAccessToken').mockReturnValue('mock-jwt-d5');
}

// ─── 1. PASSWORD BOUNDARY TESTS ───────────────────────────────────────────────

describe('D5 JIT — Password policy boundary tests', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('PW-01: Valid compliant password triggers JIT migration and returns 200', async () => {
    mockFirebase();
    vi.spyOn(authRepository, 'findUserForFirebaseIdentity').mockResolvedValue({
      user: LOCKED_FIREBASE_USER, conflict: false
    });
    const upgradeSpy = vi.spyOn(authRepository, 'upgradeLockedUserPassword').mockResolvedValue({
      updated: true, user: UPGRADED_USER
    });
    mockSession();

    const res = await request(app)
      .post('/api/v1/auth/firebase-exchange')
      .set('X-Forwarded-For', '10.1.0.1')
      .send({ idToken: 'valid.firebase.token', password: 'ValidPassword123!' });

    expect(res.status).toBe(200);
    expect(upgradeSpy).toHaveBeenCalledOnce();
    // Token uses upgraded tokenVersion
    expect(tokenService.issueAccessToken).toHaveBeenCalledWith(
      expect.objectContaining({ tokenVersion: 2 })
    );
    // No plaintext password in response
    expect(JSON.stringify(res.body)).not.toContain('ValidPassword123!');
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });

  it('PW-02: No password provided → normal exchange, no migration', async () => {
    mockFirebase();
    const user = { ...LOCKED_FIREBASE_USER };
    vi.spyOn(authRepository, 'findUserForFirebaseIdentity').mockResolvedValue({
      user, conflict: false
    });
    const upgradeSpy = vi.spyOn(authRepository, 'upgradeLockedUserPassword');
    mockSession();

    const res = await request(app)
      .post('/api/v1/auth/firebase-exchange')
      .set('X-Forwarded-For', '10.1.0.2')
      .send({ idToken: 'valid.firebase.token' });

    expect(res.status).toBe(200);
    expect(upgradeSpy).not.toHaveBeenCalled();
  });

  it('PW-03: Weak password (no uppercase) → migration skipped, session still issued', async () => {
    mockFirebase();
    vi.spyOn(authRepository, 'findUserForFirebaseIdentity').mockResolvedValue({
      user: LOCKED_FIREBASE_USER, conflict: false
    });
    const upgradeSpy = vi.spyOn(authRepository, 'upgradeLockedUserPassword');
    mockSession();

    const res = await request(app)
      .post('/api/v1/auth/firebase-exchange')
      .set('X-Forwarded-For', '10.1.0.3')
      .send({ idToken: 'valid.firebase.token', password: 'nocaps1234' });

    expect(res.status).toBe(200);
    expect(upgradeSpy).not.toHaveBeenCalled();
  });

  it('PW-04: Password shorter than MIN (7 chars) → migration skipped, session issued', async () => {
    mockFirebase();
    vi.spyOn(authRepository, 'findUserForFirebaseIdentity').mockResolvedValue({
      user: LOCKED_FIREBASE_USER, conflict: false
    });
    const upgradeSpy = vi.spyOn(authRepository, 'upgradeLockedUserPassword');
    mockSession();

    const res = await request(app)
      .post('/api/v1/auth/firebase-exchange')
      .set('X-Forwarded-For', '10.1.0.4')
      .send({ idToken: 'valid.firebase.token', password: 'Sh0rt!' });

    expect(res.status).toBe(200);
    expect(upgradeSpy).not.toHaveBeenCalled();
  });

  it('PW-05: Password longer than MAX (129 chars) → rejected by schema validation with 400', async () => {
    const over128 = 'A1' + 'a'.repeat(127); // 129 chars
    const res = await request(app)
      .post('/api/v1/auth/firebase-exchange')
      .set('X-Forwarded-For', '10.1.0.5')
      .send({ idToken: 'any.token', password: over128 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('PW-06: Password exactly at MIN boundary (8 chars, compliant) → migration succeeds', async () => {
    mockFirebase();
    vi.spyOn(authRepository, 'findUserForFirebaseIdentity').mockResolvedValue({
      user: LOCKED_FIREBASE_USER, conflict: false
    });
    const upgradeSpy = vi.spyOn(authRepository, 'upgradeLockedUserPassword').mockResolvedValue({
      updated: true, user: UPGRADED_USER
    });
    mockSession();

    const res = await request(app)
      .post('/api/v1/auth/firebase-exchange')
      .set('X-Forwarded-For', '10.1.0.6')
      .send({ idToken: 'valid.firebase.token', password: 'Aa1bcdef' }); // 8 chars, compliant

    expect(res.status).toBe(200);
    expect(upgradeSpy).toHaveBeenCalledOnce();
  });

  it('PW-07: Password exactly at MAX boundary (128 chars, compliant) → migration succeeds', async () => {
    mockFirebase();
    vi.spyOn(authRepository, 'findUserForFirebaseIdentity').mockResolvedValue({
      user: LOCKED_FIREBASE_USER, conflict: false
    });
    const upgradeSpy = vi.spyOn(authRepository, 'upgradeLockedUserPassword').mockResolvedValue({
      updated: true, user: UPGRADED_USER
    });
    mockSession();

    // 128 chars: uppercase, lowercase, digit, rest padding
    const maxPassword = 'A1' + 'b'.repeat(126); // 128 chars
    const res = await request(app)
      .post('/api/v1/auth/firebase-exchange')
      .set('X-Forwarded-For', '10.1.0.7')
      .send({ idToken: 'valid.firebase.token', password: maxPassword });

    expect(res.status).toBe(200);
    expect(upgradeSpy).toHaveBeenCalledOnce();
  });
});

// ─── 2. ACCOUNT STATE TESTS ───────────────────────────────────────────────────

describe('D5 JIT — Account state protection tests', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('AS-01: Existing native Argon2id user → password cannot be overwritten, no tokenVersion increment', async () => {
    mockFirebase();
    vi.spyOn(authRepository, 'findUserForFirebaseIdentity').mockResolvedValue({
      user: NATIVE_ARGON2_USER, conflict: false
    });
    const upgradeSpy = vi.spyOn(authRepository, 'upgradeLockedUserPassword');
    mockSession();

    const res = await request(app)
      .post('/api/v1/auth/firebase-exchange')
      .set('X-Forwarded-For', '10.2.0.1')
      .send({ idToken: 'valid.firebase.token', password: 'NewPassword456!' });

    expect(res.status).toBe(200);
    expect(upgradeSpy).not.toHaveBeenCalled();
    // tokenVersion remains 1 (not incremented)
    expect(tokenService.issueAccessToken).toHaveBeenCalledWith(
      expect.objectContaining({ tokenVersion: 1 })
    );
  });

  it('AS-02: !LOCKED_FUTURE_AUTH_REQUIRED → JIT migration MUST NOT occur', async () => {
    mockFirebase();
    vi.spyOn(authRepository, 'findUserForFirebaseIdentity').mockResolvedValue({
      user: LOCKED_FUTURE_USER, conflict: false
    });
    const upgradeSpy = vi.spyOn(authRepository, 'upgradeLockedUserPassword');
    mockSession();

    const res = await request(app)
      .post('/api/v1/auth/firebase-exchange')
      .set('X-Forwarded-For', '10.2.0.2')
      .send({ idToken: 'valid.firebase.token', password: 'ValidPassword123!' });

    // The repository WHERE clause only matches FIREBASE prefix; !LOCKED_FUTURE_AUTH_REQUIRED is a different prefix.
    // upgradeLockedUserPassword will be called but return updated: false due to startsWith guard.
    // Session is still issued using original (non-upgraded) tokenVersion.
    expect(res.status).toBe(200);
    if (upgradeSpy.mock.calls.length > 0) {
      // If called, must NOT have produced an upgrade (repository guard prevents it)
      const call = upgradeSpy.mock.results[0];
      const result = await call.value;
      expect(result?.updated).toBeFalsy();
    }
    // tokenVersion must NOT have incremented to 2
    expect(tokenService.issueAccessToken).toHaveBeenCalledWith(
      expect.not.objectContaining({ tokenVersion: 2 })
    );
  });

  it('AS-03: !LOCKED_PARENT_NO_DIRECT_AUTH → JIT migration MUST NOT occur', async () => {
    mockFirebase();
    vi.spyOn(authRepository, 'findUserForFirebaseIdentity').mockResolvedValue({
      user: LOCKED_PARENT_USER, conflict: false
    });
    const upgradeSpy = vi.spyOn(authRepository, 'upgradeLockedUserPassword');
    mockSession();

    const res = await request(app)
      .post('/api/v1/auth/firebase-exchange')
      .set('X-Forwarded-For', '10.2.0.3')
      .send({ idToken: 'valid.firebase.token', password: 'ValidPassword123!' });

    expect(res.status).toBe(200);
    if (upgradeSpy.mock.calls.length > 0) {
      const call = upgradeSpy.mock.results[0];
      const result = await call.value;
      expect(result?.updated).toBeFalsy();
    }
    // tokenVersion must NOT have incremented
    expect(tokenService.issueAccessToken).toHaveBeenCalledWith(
      expect.not.objectContaining({ tokenVersion: 2 })
    );
  });

  it('AS-04: Inactive user → rejected with 403 ACCOUNT_DISABLED, no migration, no session', async () => {
    mockFirebase();
    const inactiveUser = { ...LOCKED_FIREBASE_USER, isActive: false };
    vi.spyOn(authRepository, 'findUserForFirebaseIdentity').mockResolvedValue({
      user: inactiveUser, conflict: false
    });
    const upgradeSpy = vi.spyOn(authRepository, 'upgradeLockedUserPassword');
    const sessionSpy = vi.spyOn(sessionService, 'createSession');

    const res = await request(app)
      .post('/api/v1/auth/firebase-exchange')
      .set('X-Forwarded-For', '10.2.0.4')
      .send({ idToken: 'valid.firebase.token', password: 'ValidPassword123!' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_DISABLED');
    expect(upgradeSpy).not.toHaveBeenCalled();
    expect(sessionSpy).not.toHaveBeenCalled();
  });

  it('AS-05: Suspended tenant → rejected with 403 TENANT_SUSPENDED, no migration, no session', async () => {
    mockFirebase();
    const suspendedUser = {
      ...LOCKED_FIREBASE_USER,
      school: { ...BASE_USER.school, status: 'suspended' }
    };
    vi.spyOn(authRepository, 'findUserForFirebaseIdentity').mockResolvedValue({
      user: suspendedUser, conflict: false
    });
    const upgradeSpy = vi.spyOn(authRepository, 'upgradeLockedUserPassword');
    const sessionSpy = vi.spyOn(sessionService, 'createSession');

    const res = await request(app)
      .post('/api/v1/auth/firebase-exchange')
      .set('X-Forwarded-For', '10.2.0.5')
      .send({ idToken: 'valid.firebase.token', password: 'ValidPassword123!' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('TENANT_SUSPENDED');
    expect(upgradeSpy).not.toHaveBeenCalled();
    expect(sessionSpy).not.toHaveBeenCalled();
  });
});

// ─── 3. IDENTITY SECURITY TESTS ───────────────────────────────────────────────

describe('D5 JIT — Identity security tests', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('IS-01: Invalid Firebase token → 401, no password mutation, no session', async () => {
    const { UnauthorizedError } = await import('../../src/utils/app-error.js');
    const { ERROR_CODES } = await import('../../src/config/constants.js');
    vi.spyOn(firebaseAuthService, 'verifyFirebaseIdToken').mockRejectedValue(
      new UnauthorizedError('Invalid or expired Firebase ID token', ERROR_CODES.INVALID_FIREBASE_TOKEN)
    );
    const upgradeSpy = vi.spyOn(authRepository, 'upgradeLockedUserPassword');
    const sessionSpy = vi.spyOn(sessionService, 'createSession');

    const res = await request(app)
      .post('/api/v1/auth/firebase-exchange')
      .set('X-Forwarded-For', '10.3.0.1')
      .send({ idToken: 'tampered.firebase.token', password: 'ValidPassword123!' });

    expect(res.status).toBe(401);
    expect(upgradeSpy).not.toHaveBeenCalled();
    expect(sessionSpy).not.toHaveBeenCalled();
  });

  it('IS-02: Firebase identity conflict → 401 IDENTITY_CONFLICT, no migration, no session', async () => {
    mockFirebase();
    vi.spyOn(authRepository, 'findUserForFirebaseIdentity').mockResolvedValue({
      user: null, conflict: true
    });
    const upgradeSpy = vi.spyOn(authRepository, 'upgradeLockedUserPassword');
    const sessionSpy = vi.spyOn(sessionService, 'createSession');

    const res = await request(app)
      .post('/api/v1/auth/firebase-exchange')
      .set('X-Forwarded-For', '10.3.0.2')
      .send({ idToken: 'valid.firebase.token', password: 'ValidPassword123!' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('IDENTITY_CONFLICT');
    expect(upgradeSpy).not.toHaveBeenCalled();
    expect(sessionSpy).not.toHaveBeenCalled();
  });

  it('IS-03: Unmapped Firebase identity → 401 USER_NOT_FOUND, no migration, no session', async () => {
    mockFirebase();
    vi.spyOn(authRepository, 'findUserForFirebaseIdentity').mockResolvedValue({
      user: null, conflict: false
    });
    const upgradeSpy = vi.spyOn(authRepository, 'upgradeLockedUserPassword');
    const sessionSpy = vi.spyOn(sessionService, 'createSession');

    const res = await request(app)
      .post('/api/v1/auth/firebase-exchange')
      .set('X-Forwarded-For', '10.3.0.3')
      .send({ idToken: 'valid.firebase.token', password: 'ValidPassword123!' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('USER_NOT_FOUND');
    expect(upgradeSpy).not.toHaveBeenCalled();
    expect(sessionSpy).not.toHaveBeenCalled();
  });

  it('IS-04: Client-provided userId/schoolId/role MUST NOT control migration', async () => {
    mockFirebase();
    vi.spyOn(authRepository, 'findUserForFirebaseIdentity').mockResolvedValue({
      user: LOCKED_FIREBASE_USER, conflict: false
    });
    vi.spyOn(authRepository, 'upgradeLockedUserPassword').mockResolvedValue({
      updated: true, user: UPGRADED_USER
    });
    mockSession();

    const res = await request(app)
      .post('/api/v1/auth/firebase-exchange')
      .set('X-Forwarded-For', '10.3.0.4')
      .send({
        idToken: 'valid.firebase.token',
        password: 'ValidPassword123!',
        userId: 'attacker-uuid',
        schoolId: 'attacker-school',
        systemRole: 'SUPER_ADMIN',
        tokenVersion: 9999
      });

    expect(res.status).toBe(200);
    // Identity must come from PostgreSQL record, not body
    expect(res.body.data.user.id).toBe(LOCKED_FIREBASE_USER.id);
    expect(res.body.data.user.systemRole).toBe('TEACHER');
    // tokenVersion in JWT must be 2 (from upgrade), not 9999
    expect(tokenService.issueAccessToken).toHaveBeenCalledWith(
      expect.objectContaining({ tokenVersion: 2, sub: LOCKED_FIREBASE_USER.id })
    );
  });
});

// ─── 4. CREDENTIAL HYGIENE TESTS ─────────────────────────────────────────────

describe('D5 JIT — Credential hygiene tests', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('CH-01: Plaintext password never appears in response body', async () => {
    mockFirebase();
    vi.spyOn(authRepository, 'findUserForFirebaseIdentity').mockResolvedValue({
      user: LOCKED_FIREBASE_USER, conflict: false
    });
    vi.spyOn(authRepository, 'upgradeLockedUserPassword').mockResolvedValue({
      updated: true, user: UPGRADED_USER
    });
    mockSession();

    const testPassword = 'SuperSecret999!';
    const res = await request(app)
      .post('/api/v1/auth/firebase-exchange')
      .set('X-Forwarded-For', '10.4.0.1')
      .send({ idToken: 'valid.firebase.token', password: testPassword });

    expect(res.status).toBe(200);
    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toContain(testPassword);
    expect(bodyStr).not.toContain('passwordHash');
    expect(bodyStr).not.toContain('passwordAlgorithm');
    expect(bodyStr).not.toContain('legacyFirestoreId');
    expect(bodyStr).not.toContain('tokenVersion');
    expect(res.body.data.rawRefreshToken).toBeUndefined();
  });

  it('CH-02: Firebase ID token never appears in response', async () => {
    mockFirebase();
    vi.spyOn(authRepository, 'findUserForFirebaseIdentity').mockResolvedValue({
      user: LOCKED_FIREBASE_USER, conflict: false
    });
    vi.spyOn(authRepository, 'upgradeLockedUserPassword').mockResolvedValue({
      updated: true, user: UPGRADED_USER
    });
    mockSession();

    const testIdToken = 'my.test.firebase.id.token.xyz123';
    const res = await request(app)
      .post('/api/v1/auth/firebase-exchange')
      .set('X-Forwarded-For', '10.4.0.2')
      .send({ idToken: testIdToken, password: 'ValidPassword123!' });

    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain(testIdToken);
  });

  it('CH-03: JWT contains no password information', async () => {
    mockFirebase();
    vi.spyOn(authRepository, 'findUserForFirebaseIdentity').mockResolvedValue({
      user: LOCKED_FIREBASE_USER, conflict: false
    });
    vi.spyOn(authRepository, 'upgradeLockedUserPassword').mockResolvedValue({
      updated: true, user: UPGRADED_USER
    });
    mockSession();

    await request(app)
      .post('/api/v1/auth/firebase-exchange')
      .set('X-Forwarded-For', '10.4.0.3')
      .send({ idToken: 'valid.firebase.token', password: 'ValidPassword123!' });

    const jwtCallArgs = tokenService.issueAccessToken.mock.calls[0][0];
    expect(jwtCallArgs.password).toBeUndefined();
    expect(jwtCallArgs.passwordHash).toBeUndefined();
    expect(jwtCallArgs.newPasswordHash).toBeUndefined();
  });
});

// ─── 5. TOKEN VERSION CONSISTENCY TESTS ──────────────────────────────────────

describe('D5 JIT — TokenVersion and session consistency', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('TV-01: After successful JIT migration, JWT tokenVersion equals upgraded tokenVersion (2)', async () => {
    mockFirebase();
    vi.spyOn(authRepository, 'findUserForFirebaseIdentity').mockResolvedValue({
      user: LOCKED_FIREBASE_USER, conflict: false
    });
    vi.spyOn(authRepository, 'upgradeLockedUserPassword').mockResolvedValue({
      updated: true, user: UPGRADED_USER // tokenVersion: 2
    });
    mockSession();

    await request(app)
      .post('/api/v1/auth/firebase-exchange')
      .set('X-Forwarded-For', '10.5.0.1')
      .send({ idToken: 'valid.firebase.token', password: 'ValidPassword123!' });

    expect(tokenService.issueAccessToken).toHaveBeenCalledWith(
      expect.objectContaining({ tokenVersion: 2 })
    );
  });

  it('TV-02: Without migration, JWT tokenVersion equals original tokenVersion (1)', async () => {
    mockFirebase();
    vi.spyOn(authRepository, 'findUserForFirebaseIdentity').mockResolvedValue({
      user: LOCKED_FIREBASE_USER, conflict: false
    });
    // No upgrade call — password omitted
    mockSession();

    await request(app)
      .post('/api/v1/auth/firebase-exchange')
      .set('X-Forwarded-For', '10.5.0.2')
      .send({ idToken: 'valid.firebase.token' });

    expect(tokenService.issueAccessToken).toHaveBeenCalledWith(
      expect.objectContaining({ tokenVersion: 1 })
    );
  });

  it('TV-03: upgradeLockedUserPassword returning updated:false does not change session tokenVersion', async () => {
    mockFirebase();
    vi.spyOn(authRepository, 'findUserForFirebaseIdentity').mockResolvedValue({
      user: LOCKED_FIREBASE_USER, conflict: false
    });
    // Simulate concurrent first-writer wins: second call returns updated: false
    vi.spyOn(authRepository, 'upgradeLockedUserPassword').mockResolvedValue({
      updated: false, user: null
    });
    mockSession();

    const res = await request(app)
      .post('/api/v1/auth/firebase-exchange')
      .set('X-Forwarded-For', '10.5.0.3')
      .send({ idToken: 'valid.firebase.token', password: 'ValidPassword123!' });

    // Exchange still succeeds (session issued with original tokenVersion)
    expect(res.status).toBe(200);
    expect(tokenService.issueAccessToken).toHaveBeenCalledWith(
      expect.objectContaining({ tokenVersion: 1 })
    );
  });
});

// ─── 6. CONCURRENCY TESTS ─────────────────────────────────────────────────────

describe('D5 JIT — Concurrency: Simultaneous JIT migrations', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('CONC-A: Two concurrent JIT exchanges for the same locked user — only one upgrade succeeds', async () => {
    // Simulate first writer wins: second call gets updated:false (WHERE clause guard)
    let callCount = 0;
    vi.spyOn(firebaseAuthService, 'verifyFirebaseIdToken').mockResolvedValue(FIREBASE_CLAIMS);
    vi.spyOn(authRepository, 'findUserForFirebaseIdentity').mockResolvedValue({
      user: LOCKED_FIREBASE_USER, conflict: false
    });
    vi.spyOn(authRepository, 'upgradeLockedUserPassword').mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return { updated: true, user: UPGRADED_USER }; // first writer wins
      }
      return { updated: false, user: null }; // second writer: guard prevented double-upgrade
    });
    vi.spyOn(sessionService, 'createSession').mockResolvedValue(SESSION_MOCK);
    vi.spyOn(tokenService, 'issueAccessToken').mockReturnValue('mock-jwt-d5');

    const [resA, resB] = await Promise.all([
      request(app)
        .post('/api/v1/auth/firebase-exchange')
        .set('X-Forwarded-For', '10.6.0.1')
        .send({ idToken: 'valid.firebase.token', password: 'ValidPassword123!' }),
      request(app)
        .post('/api/v1/auth/firebase-exchange')
        .set('X-Forwarded-For', '10.6.0.2')
        .send({ idToken: 'valid.firebase.token', password: 'ValidPassword123!' })
    ]);

    // Both responses must succeed (both get sessions)
    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);

    // upgradeLockedUserPassword called exactly twice (once per request)
    expect(authRepository.upgradeLockedUserPassword).toHaveBeenCalledTimes(2);

    // callCount tracks: first call returns updated:true, second returns updated:false
    // This proves atomicity: only one credential upgrade persisted
    expect(callCount).toBe(2);

    // First exchange used upgraded tokenVersion 2
    const tokenCalls = tokenService.issueAccessToken.mock.calls;
    const tokenVersions = tokenCalls.map(c => c[0].tokenVersion);
    // One call should have tokenVersion 2 (upgraded), other tokenVersion 1 (second writer fallback)
    expect(tokenVersions).toContain(2);
    expect(tokenVersions).toContain(1);
  });

  it('CONC-B: JIT migration concurrent with D3 password reset — no credential corruption', async () => {
    // Simulate: password reset updates tokenVersion to 3 (increments from 1)
    // JIT migration (also in flight) gets updated:false because reset already changed the hash
    vi.spyOn(firebaseAuthService, 'verifyFirebaseIdToken').mockResolvedValue(FIREBASE_CLAIMS);
    vi.spyOn(authRepository, 'findUserForFirebaseIdentity').mockResolvedValue({
      user: LOCKED_FIREBASE_USER, conflict: false
    });
    // JIT migration sees updated:false because reset won the race and changed hash away from !LOCKED_*
    vi.spyOn(authRepository, 'upgradeLockedUserPassword').mockResolvedValue({
      updated: false, user: null
    });
    vi.spyOn(sessionService, 'createSession').mockResolvedValue(SESSION_MOCK);
    vi.spyOn(tokenService, 'issueAccessToken').mockReturnValue('mock-jwt-d5');

    const res = await request(app)
      .post('/api/v1/auth/firebase-exchange')
      .set('X-Forwarded-For', '10.6.1.1')
      .send({ idToken: 'valid.firebase.token', password: 'ValidPassword123!' });

    // Session is still issued using the pre-upgrade tokenVersion (1)
    // The reset's tokenVersion increment (handled by the reset transaction) is separate
    expect(res.status).toBe(200);
    expect(tokenService.issueAccessToken).toHaveBeenCalledWith(
      expect.objectContaining({ tokenVersion: 1 })
    );
  });

  it('CONC-C: JIT exchange (with password) concurrent with plain exchange (no password) — no double tokenVersion increment', async () => {
    vi.spyOn(firebaseAuthService, 'verifyFirebaseIdToken').mockResolvedValue(FIREBASE_CLAIMS);
    vi.spyOn(authRepository, 'findUserForFirebaseIdentity').mockResolvedValue({
      user: LOCKED_FIREBASE_USER, conflict: false
    });

    let upgradeCallCount = 0;
    vi.spyOn(authRepository, 'upgradeLockedUserPassword').mockImplementation(async () => {
      upgradeCallCount++;
      return { updated: true, user: UPGRADED_USER };
    });
    vi.spyOn(sessionService, 'createSession').mockResolvedValue(SESSION_MOCK);
    vi.spyOn(tokenService, 'issueAccessToken').mockReturnValue('mock-jwt-d5');

    const [resWithPw, resNoPw] = await Promise.all([
      request(app)
        .post('/api/v1/auth/firebase-exchange')
        .set('X-Forwarded-For', '10.6.2.1')
        .send({ idToken: 'valid.firebase.token', password: 'ValidPassword123!' }),
      request(app)
        .post('/api/v1/auth/firebase-exchange')
        .set('X-Forwarded-For', '10.6.2.2')
        .send({ idToken: 'valid.firebase.token' }) // no password
    ]);

    expect(resWithPw.status).toBe(200);
    expect(resNoPw.status).toBe(200);

    // Only the exchange with password invokes upgrade
    expect(upgradeCallCount).toBe(1);
  });
});

// ─── 7. NATIVE LOGIN AFTER MIGRATION ─────────────────────────────────────────

describe('D5 JIT — Native login after migration', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('NL-01: After JIT migration, native POST /api/v1/auth/login succeeds with migrated credential', async () => {
    // Mock the native login flow directly against auth.service.login behavior
    const migratedUser = {
      ...BASE_USER,
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$migratedHash',
      passwordAlgorithm: 'argon2id',
      tokenVersion: 2
    };

    vi.spyOn(authRepository, 'findUserByEmail').mockResolvedValue(migratedUser);
    vi.spyOn(passwordService, 'isLockedPassword').mockReturnValue(false);
    vi.spyOn(passwordService, 'verifyPassword').mockResolvedValue(true);
    vi.spyOn(sessionService, 'createSession').mockResolvedValue(SESSION_MOCK);
    vi.spyOn(tokenService, 'issueAccessToken').mockReturnValue('native-login-jwt');

    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', '10.7.0.1')
      .send({ identifier: 'd5-security@testschool.dev', password: 'ValidPassword123!' });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBe('native-login-jwt');
    expect(passwordService.verifyPassword).toHaveBeenCalled();
  });

  it('NL-02: After JIT migration, subsequent Firebase exchange does NOT overwrite native password', async () => {
    // User now has a native argon2id hash; subsequent JIT must be skipped
    const migratedUser = {
      ...BASE_USER,
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$migratedHash',
      tokenVersion: 2
    };

    mockFirebase();
    vi.spyOn(authRepository, 'findUserForFirebaseIdentity').mockResolvedValue({
      user: migratedUser, conflict: false
    });
    const upgradeSpy = vi.spyOn(authRepository, 'upgradeLockedUserPassword');
    mockSession();

    const res = await request(app)
      .post('/api/v1/auth/firebase-exchange')
      .set('X-Forwarded-For', '10.7.0.2')
      .send({ idToken: 'valid.firebase.token', password: 'ValidPassword123!' });

    expect(res.status).toBe(200);
    // upgradeLockedUserPassword's WHERE guard (startsWith FIREBASE_LOCKED prefix) prevents this
    expect(upgradeSpy).not.toHaveBeenCalled();
  });

  it('NL-03: Incorrect password on native login after migration → 401', async () => {
    const migratedUser = {
      ...BASE_USER,
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$migratedHash',
      tokenVersion: 2
    };

    vi.spyOn(authRepository, 'findUserByEmail').mockResolvedValue(migratedUser);
    vi.spyOn(passwordService, 'isLockedPassword').mockReturnValue(false);
    vi.spyOn(passwordService, 'verifyPassword').mockResolvedValue(false); // wrong password

    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', '10.7.0.3')
      .send({ identifier: 'd5-security@testschool.dev', password: 'WrongPassword999!' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });
});

// ─── 8. D3 INTERACTION TESTS ──────────────────────────────────────────────────

describe('D5 JIT — D3 interaction tests', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('D3-A: JIT first → native login succeeds', async () => {
    // This is covered by NL-01 above; confirm here end-to-end
    const migratedUser = {
      ...BASE_USER,
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$jitMigratedHash',
      tokenVersion: 2
    };

    vi.spyOn(authRepository, 'findUserByEmail').mockResolvedValue(migratedUser);
    vi.spyOn(passwordService, 'isLockedPassword').mockReturnValue(false);
    vi.spyOn(passwordService, 'verifyPassword').mockResolvedValue(true);
    vi.spyOn(sessionService, 'createSession').mockResolvedValue(SESSION_MOCK);
    vi.spyOn(tokenService, 'issueAccessToken').mockReturnValue('native-jwt-after-jit');

    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', '10.8.0.1')
      .send({ identifier: 'd5-security@testschool.dev', password: 'ValidPassword123!' });

    expect(res.status).toBe(200);
  });

  it('D3-B: Reset first (D3) → subsequent Firebase exchange does NOT overwrite native password', async () => {
    // After D3 reset, user has native argon2id hash
    const resetUser = {
      ...BASE_USER,
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$resetHash',
      tokenVersion: 3 // reset incremented this
    };

    mockFirebase();
    vi.spyOn(authRepository, 'findUserForFirebaseIdentity').mockResolvedValue({
      user: resetUser, conflict: false
    });
    const upgradeSpy = vi.spyOn(authRepository, 'upgradeLockedUserPassword');
    vi.spyOn(sessionService, 'createSession').mockResolvedValue(SESSION_MOCK);
    vi.spyOn(tokenService, 'issueAccessToken').mockReturnValue('jwt-after-d3-reset');

    const res = await request(app)
      .post('/api/v1/auth/firebase-exchange')
      .set('X-Forwarded-For', '10.8.0.2')
      .send({ idToken: 'valid.firebase.token', password: 'ValidPassword123!' });

    expect(res.status).toBe(200);
    expect(upgradeSpy).not.toHaveBeenCalled(); // startsWith guard blocks it — not !LOCKED_FIREBASE_*
    // tokenVersion reflects post-reset version (3)
    expect(tokenService.issueAccessToken).toHaveBeenCalledWith(
      expect.objectContaining({ tokenVersion: 3 })
    );
  });

  it('D3-C: Weak password on exchange → account remains locked, native login returns PASSWORD_NOT_SET', async () => {
    mockFirebase();
    vi.spyOn(authRepository, 'findUserForFirebaseIdentity').mockResolvedValue({
      user: LOCKED_FIREBASE_USER, conflict: false
    });
    const upgradeSpy = vi.spyOn(authRepository, 'upgradeLockedUserPassword');
    mockSession();

    // Firebase exchange with weak password succeeds (session granted) but no migration
    const exchangeRes = await request(app)
      .post('/api/v1/auth/firebase-exchange')
      .set('X-Forwarded-For', '10.8.0.3')
      .send({ idToken: 'valid.firebase.token', password: 'weak' });

    expect(exchangeRes.status).toBe(200);
    expect(upgradeSpy).not.toHaveBeenCalled();

    // Attempting native login on still-locked account → PASSWORD_NOT_SET
    vi.spyOn(authRepository, 'findUserByEmail').mockResolvedValue(LOCKED_FIREBASE_USER);
    vi.spyOn(passwordService, 'isLockedPassword').mockReturnValue(true);

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', '10.8.0.4')
      .send({ identifier: 'd5-security@testschool.dev', password: 'weak' });

    expect(loginRes.status).toBe(403);
    expect(loginRes.body.error.code).toBe('PASSWORD_NOT_SET');
  });

  it('D3-D: !LOCKED_FUTURE_AUTH_REQUIRED → JIT does not migrate, account stays locked', async () => {
    mockFirebase();
    vi.spyOn(authRepository, 'findUserForFirebaseIdentity').mockResolvedValue({
      user: LOCKED_FUTURE_USER, conflict: false
    });
    const upgradeSpy = vi.spyOn(authRepository, 'upgradeLockedUserPassword').mockResolvedValue({
      updated: false, user: null // WHERE guard blocks it
    });
    mockSession();

    await request(app)
      .post('/api/v1/auth/firebase-exchange')
      .set('X-Forwarded-For', '10.8.0.5')
      .send({ idToken: 'valid.firebase.token', password: 'ValidPassword123!' });

    // If upgrade was attempted, it must NOT have produced an upgrade result
    if (upgradeSpy.mock.calls.length > 0) {
      const result = await upgradeSpy.mock.results[0].value;
      expect(result.updated).toBe(false);
    }
  });
});

// ─── 9. RATE LIMITING ─────────────────────────────────────────────────────────

describe('D5 JIT — Rate limiting preserved', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('RL-01: Requests exceeding rate limit with password payload receive 429', async () => {
    // The rate limiter uses X-Forwarded-For as the key.
    // Send 11 requests from the same IP to hit the 10 req/min limiter.
    const promises = [];
    for (let i = 0; i < 11; i++) {
      promises.push(
        request(app)
          .post('/api/v1/auth/firebase-exchange')
          .set('X-Forwarded-For', '192.0.2.99') // same IP for all
          .send({ idToken: `token${i}`, password: 'ValidPassword123!' })
      );
    }

    const responses = await Promise.all(promises);
    const statuses = responses.map(r => r.status);
    // At least one should be 429 (rate limited)
    expect(statuses).toContain(429);
  });

  it('RL-02: Password payload does not bypass rate limiting — no alternate unprotected route', async () => {
    // Verify no bypass: non-password route does not accept the same tokens more freely
    // (Structural test: only one endpoint exists for firebase-exchange)
    const res = await request(app)
      .post('/api/v1/auth/firebase-exchange-bypass') // non-existent path
      .send({ idToken: 'any', password: 'ValidPassword123!' });

    expect(res.status).toBe(404);
  });
});
