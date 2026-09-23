# FRONTEND.D5 - JIT Firebase Credential Migration Bridge: Implementation and Security Reference

**Date**: September 21, 2026
**Phase**: IMPLEMENTATION -- VERIFIED
**Status**: ALL CHECKS PASSING
**Target Population**: 38 Firebase-managed institutional users (!LOCKED_FIREBASE_AUTH_MANAGED_*)

## 1. Migration Eligibility

### Eligible Accounts (JIT Migration proceeds)

A user account is eligible for JIT migration only if ALL of the following are true:

| Criterion | Required value |
|---|---|
| Firebase token verification | Passes RS256 verification against Google certs |
| Identity mapping | Maps to a unique PostgreSQL User record |
| User.isActive | true |
| User.school.status | 'active' |
| User.passwordHash starts with | '!LOCKED_FIREBASE_AUTH_MANAGED' (exactly this prefix) |
| Supplied password | Present, non-empty, max 128 characters |
| Password policy | Passes all complexity rules (min 8 chars, upper, lower, digit) |

### Excluded Accounts (JIT Migration is blocked by WHERE guard)

| Locked Prefix | Behavior |
|---|---|
| !LOCKED_FUTURE_AUTH_REQUIRED | NOT migrated - WHERE guard blocks it (different prefix) |
| !LOCKED_PARENT_NO_DIRECT_AUTH | NOT migrated - WHERE guard blocks it (different prefix) |
| argon2id native hash | NOT migrated - isLockedPassword returns false; upgrade not invoked |
| Suspended / inactive account | Request rejected before upgrade logic is reached |

## 2. Execution Order (Verified)

The exact execution order within auth.service.js::firebaseExchange:

  1. Firebase token verification       -- verifyFirebaseIdToken(idToken)
                                           RS256, project boundary, audience, issuer
  2. Identity mapping                  -- authRepository.findUserForFirebaseIdentity()
                                           Primary: legacyFirestoreId == uid
                                           Fallback: verified email match
  3. Identity conflict detection       -- if (conflict) -> IDENTITY_CONFLICT 401
  4. User-not-found guard              -- if (!user) -> USER_NOT_FOUND 401
  5. Account active state validation   -- if (!user.isActive) -> ACCOUNT_DISABLED 403
  6. Tenant status validation          -- if (school.status != 'active') -> 403
  7. Locked-marker detection           -- isLockedPassword(user.passwordHash)
     Password-policy validation        -- validatePasswordPolicy(password)
     Argon2id hashing                  -- hashPassword(password)
     Conditional password upgrade      -- authRepository.upgradeLockedUserPassword()
     tokenVersion update                  (WHERE passwordHash LIKE '!LOCKED_FIREBASE_AUTH_MANAGED%')
  8. Session creation                  -- sessionService.createSession(effectiveUser)
  9. JWT creation                      -- issueAccessToken({ sub, schoolId, systemRole, tokenVersion })
 10. Response                          -- { accessToken, user: { id, email, schoolId, systemRole } }

IMPORTANT: Steps 7 (JIT upgrade path) is conditional. If any guard in steps 1-6 rejects, steps 7-10 never execute.

## 3. Locked Marker Behavior

### !LOCKED_FIREBASE_AUTH_MANAGED_<hash>
- Set on institutional accounts migrated from Firebase into PostgreSQL via the school migration scripts.
- 38 users in the current production population.
- The JIT upgrade atomically:
  1. Replaces the hash with a valid Argon2id hash.
  2. Increments tokenVersion once.
  3. Returns the updated user record.
- Atomicity guarantee: The SQL WHERE id = :id AND passwordHash LIKE '!LOCKED_FIREBASE_AUTH_MANAGED%' condition
  is evaluated inside a Prisma transaction. If a concurrent upgrade already changed the hash, updateMany.count === 0
  and no second upgrade occurs.

### !LOCKED_FUTURE_AUTH_REQUIRED
- Set on accounts that require explicit password setup via D3 setup token.
- JIT migration is blocked because the WHERE clause requires the !LOCKED_FIREBASE_AUTH_MANAGED prefix specifically.

### !LOCKED_PARENT_NO_DIRECT_AUTH
- Set on parent accounts that authenticate only via admission-login.
- WHERE clause blocks upgrade.

## 4. Password Policy

Enforced by validatePasswordPolicy() in password.service.js:

| Rule | Requirement |
|---|---|
| Minimum length | 8 characters |
| Maximum length | 128 characters |
| Must contain | At least one uppercase letter [A-Z] |
| Must contain | At least one lowercase letter [a-z] |
| Must contain | At least one digit [0-9] |
| Case conversion | Never applied |
| Trimming | Never applied |

Schema-level: The Zod schema enforces password: z.string().min(1).max(128).optional().
Passwords exceeding 128 chars are rejected with HTTP 400 VALIDATION_ERROR before reaching the service.

Service-level: If policy fails, upgrade is silently skipped and a normal session is issued. Weak password is never stored.

## 5. TokenVersion Semantics

| Scenario | Resulting tokenVersion in JWT |
|---|---|
| No password provided | Original tokenVersion (unchanged) |
| Password provided, migration succeeds | tokenVersion + 1 (post-upgrade) |
| Password provided, migration fails (concurrent second writer) | Original tokenVersion (updated: false) |
| Password provided, user already has native hash | Original tokenVersion (not locked; upgrade not invoked) |
| Password provided, fails policy | Original tokenVersion (upgrade not invoked) |

IMPORTANT: tokenVersion increment is idempotent. Only one credential upgrade can persist for any given account.

Stale token invalidation: The authenticate middleware enforces decoded.tokenVersion === user.tokenVersion.
Any access token issued with the pre-migration tokenVersion is automatically invalidated after migration.

## 6. Concurrency Behavior

CONC-A: Two simultaneous JIT exchanges for the same locked user
- Both call upgradeLockedUserPassword.
- First writer: updateMany matches WHERE clause -> updates hash -> count = 1 -> returns { updated: true, user: upgraded }.
- Second writer: hash no longer starts with !LOCKED_FIREBASE_AUTH_MANAGED -> count = 0 -> { updated: false }.
- Result: Both get valid sessions. tokenVersion increments exactly once. No credential corruption.

CONC-B: JIT concurrent with D3 password reset
- If reset wins: hash becomes Argon2id -> JIT WHERE clause does not match -> updated: false -> JIT uses original tokenVersion.
- If JIT wins: hash becomes Argon2id -> subsequent reset still works -> reset increments tokenVersion again.
- In both cases: No stale credential survives.

CONC-C: JIT with password concurrent with plain exchange (no password)
- Plain exchange does not invoke upgradeLockedUserPassword at all.
- JIT invokes it once.
- Result: tokenVersion increments exactly once.

## 7. D3 Interaction

| Scenario | JIT Behavior | Native Login After |
|---|---|---|
| JIT first (compliant password) | Migrates -> Argon2id | Succeeds |
| D3 reset first | Hash already Argon2id -> JIT WHERE guard blocks upgrade | Succeeds with reset credential |
| Weak password on exchange | Migration skipped, session still issued | Native login -> PASSWORD_NOT_SET (still locked) |
| !LOCKED_FUTURE_AUTH_REQUIRED | WHERE guard blocks JIT | Must use D3 setup flow |

## 8. Credential Hygiene Guarantees

| Location | Password present? |
|---|---|
| HTTP response body | Never |
| JWT access token claims | Never |
| RefreshSession row | Never (only tokenHash stored) |
| Server logs | Never (Pino logger does not capture body) |
| React state (useState) | Never (closure-scoped only) |
| localStorage / sessionStorage | Never |
| Firebase ID token in response | Never |
| passwordHash in API response | Never (excluded from SAFE_USER_SELECT projection) |

## 9. Security Test Matrix (34 tests, all passing)

### Password Policy (7 tests)
PW-01: Valid compliant password -> migration succeeds               PASS
PW-02: No password -> normal exchange, no migration                  PASS
PW-03: Weak password (no uppercase) -> skipped, session issued       PASS
PW-04: Too-short password (<8) -> skipped, session issued           PASS
PW-05: Too-long password (>128) -> 400 VALIDATION_ERROR             PASS
PW-06: Exactly MIN boundary (8 chars, compliant) -> migrates         PASS
PW-07: Exactly MAX boundary (128 chars, compliant) -> migrates       PASS

### Account State (5 tests)
AS-01: Existing Argon2id -> not overwritten, tokenVersion unchanged  PASS
AS-02: !LOCKED_FUTURE_AUTH_REQUIRED -> NOT migrated                  PASS
AS-03: !LOCKED_PARENT_NO_DIRECT_AUTH -> NOT migrated                 PASS
AS-04: Inactive user -> 403 ACCOUNT_DISABLED, no mutation, no session PASS
AS-05: Suspended tenant -> 403 TENANT_SUSPENDED, no mutation, no session PASS

### Identity Security (4 tests)
IS-01: Invalid Firebase token -> 401, no mutation, no session        PASS
IS-02: Identity conflict -> 401 IDENTITY_CONFLICT, no mutation       PASS
IS-03: Unmapped identity -> 401 USER_NOT_FOUND, no mutation          PASS
IS-04: Client-injected userId/schoolId/role ignored                  PASS

### Credential Hygiene (3 tests)
CH-01: Plaintext password absent from response, headers, user DTO    PASS
CH-02: Firebase ID token absent from response                        PASS
CH-03: JWT payload contains no password data                         PASS

### TokenVersion Consistency (3 tests)
TV-01: Successful migration -> JWT tokenVersion = 2                  PASS
TV-02: No migration -> JWT tokenVersion = 1                          PASS
TV-03: Second writer (updated:false) -> JWT tokenVersion = original  PASS

### Concurrency (3 tests)
CONC-A: Two simultaneous JIT migrations -> exactly one upgrade       PASS
CONC-B: JIT concurrent with D3 reset -> no credential corruption     PASS
CONC-C: JIT + no-password exchange -> no double increment            PASS

### Native Login After Migration (3 tests)
NL-01: Native login succeeds after JIT migration                     PASS
NL-02: Subsequent Firebase exchange does not overwrite native hash   PASS
NL-03: Wrong password on native login -> 401 INVALID_CREDENTIALS     PASS

### D3 Interaction (4 tests)
D3-A: JIT first -> native login succeeds                             PASS
D3-B: D3 reset first -> exchange does not overwrite                  PASS
D3-C: Weak password -> account stays locked, native login -> PASSWORD_NOT_SET PASS
D3-D: !LOCKED_FUTURE_AUTH_REQUIRED -> JIT does not migrate           PASS

### Rate Limiting (2 tests)
RL-01: Requests exceeding limit with password payload -> 429         PASS
RL-02: No alternate unprotected route exists                         PASS

## 10. Test Counts

| Suite | File | Tests |
|---|---|---|
| D5 Security and Concurrency | tests/security/d5-jit-migration-security.test.js | 34 |
| Firebase Exchange Integration | tests/integration/auth/auth-firebase-exchange.test.js | 12 |
| Firebase Bridge Security | tests/security/firebase-bridge-security.test.js | 13 |
| Auth Unit Tests | tests/unit/auth/* | 155 |
| Auth Integration Tests | tests/integration/auth/* | 51 |
| Total Backend Auth + Security | -- | 770 |
| Frontend Total | -- | 1217 |

## 11. Deferred Items

| Item | Deferred To |
|---|---|
| Firebase Auth decommission | D6 |
| Institutional login switch to native REST | D6 |
| !LOCKED_FUTURE_AUTH_REQUIRED accounts migration | After D6 |
| Firebase SDK removal | D6 |
| HYBRID_BRIDGE mode deactivation | D6 |

## 12. Completion

FRONTEND.D5 -- JIT FIREBASE CREDENTIAL MIGRATION BRIDGE VERIFIED
