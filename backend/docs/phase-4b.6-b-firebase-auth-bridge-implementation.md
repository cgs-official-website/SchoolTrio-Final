# Phase 4B.6-B — Firebase → PostgreSQL Authentication Bridge Implementation

## 1. Executive Summary

Phase 4B.6-B implements the server-side Firebase Authentication → PostgreSQL/JWT authentication bridge endpoint (`POST /api/v1/auth/firebase-exchange`) for the School Management System SaaS backend.

The bridge enables eligible Firebase-authenticated Staff and School Admin users to verify their identity via Firebase Auth ID tokens and receive authoritative PostgreSQL JWT access tokens, active PostgreSQL `RefreshSession` records, and HttpOnly `sms_refresh_token` cookies.

The implementation preserves PostgreSQL as the sole source of truth for authorization, tenant membership, and RBAC authority, while enforcing strict zero user auto-provisioning and maintaining all existing locked-account invariants (`!LOCKED_*`).

---

## 2. Architecture & Security Invariants

### 2.1 Project Boundary & Cryptographic Token Verification
- **Target Firebase Project**: `school-management-system-6a2c4` (configured via `FIREBASE_PROJECT_ID`).
- **Support Project Isolation**: Tokens issued for support desk `zuna-landing-page-22564` are rejected at the verification boundary with `401 Unauthorized` (`INVALID_FIREBASE_TOKEN`).
- **Cryptographic Claims Enforced**:
  - `aud`: Must match `FIREBASE_PROJECT_ID` (`school-management-system-6a2c4`).
  - `iss`: Must match `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`.
  - `exp`: Unexpired token verified cryptographically via Firebase Admin SDK.
  - `uid` / `sub`: Must be non-empty string.
  - `email` & `email_verified`: Extracted safely.

### 2.2 Strict Identity Resolution & Conflict Detection
Identity resolution is executed in `auth.repository.js` (`findUserForFirebaseIdentity`):
1. **Primary Mapping**: `User.legacyFirestoreId === verifiedFirebaseUid`.
2. **Secondary Fallback**: Only if no UID match exists, `emailVerified === true`, and the email is not synthetic, match against normalized `User.email`.
3. **Synthetic Email Guard**: Synthetic parent emails matching `*.sms.internal`, `*.parent.local`, or `@parent.` are excluded from email fallback matching to prevent parent account hijacking.
4. **Identity Conflict Protection**: If Firebase UID matches User A while verified email matches User B (`User A.id !== User B.id`), the exchange rejects with `401 Unauthorized` (`IDENTITY_CONFLICT`). Zero database updates or account relinking occur.
5. **Strict Zero Auto-Provisioning**: Unmapped Firebase accounts are rejected with `401 Unauthorized` (`USER_NOT_FOUND`). No records are created in `User`, `School`, `StaffProfile`, or `ParentProfile`.

### 2.3 PostgreSQL Authority (Tenant & RBAC)
- **RBAC Authority**: User's `systemRole` is derived exclusively from PostgreSQL `User.systemRole`. Firebase custom claims or client-provided role fields are completely ignored.
- **Tenant Authority**: User's `schoolId` is derived exclusively from PostgreSQL `User.schoolId`. Client-supplied headers or body fields are ignored during exchange.
- **Account State**: Deactivated PostgreSQL accounts (`isActive === false`) are rejected with `403 Forbidden` (`ACCOUNT_DISABLED`).
- **Tenant Status**: Suspended schools (`school.status === 'suspended'`) are rejected with `403 Forbidden` (`TENANT_SUSPENDED`). Pending schools are rejected with `403 Forbidden` (`TENANT_ACCESS_ERROR`).

### 2.4 Credential & Session Lifecycle
- **Locked Accounts Unchanged**: Migrated Firebase accounts with `!LOCKED_FIREBASE_AUTH_MANAGED` remain locked against direct password authentication. The exchange does not overwrite or remove the locked marker.
- **JWT Issuance**: Minimal-claim JWT access tokens (`sub`, `schoolId`, `systemRole`, `tokenVersion`) issued via existing `token.service.js`.
- **RefreshSession**: Secure random refresh token generated and stored via existing `session.service.js`.
- **HttpOnly Cookie**: Set solely in `sms_refresh_token` cookie with `HttpOnly`, `SameSite=Strict`, `Path=/api/v1/auth`, and 7-day TTL.
- **Rate Limiting**: Rate limited to 10 requests/minute/IP (`rl:auth:firebase-exchange:`).

---

## 3. Files Created & Modified

### Created Files
- `backend/src/services/firebase-auth.service.js`: Server-side Firebase ID token verification service with project boundary validation and DI verifier support.
- `backend/tests/unit/auth/firebase-auth.service.test.js`: Unit tests for token verification, audience/issuer checks, and claim extraction.
- `backend/tests/integration/auth/auth-firebase-exchange.test.js`: Integration tests for HTTP `POST /api/v1/auth/firebase-exchange`.
- `backend/tests/security/firebase-bridge-security.test.js`: Security, tenant isolation, and session lifecycle tests.
- `backend/docs/phase-4b.6-b-firebase-auth-bridge-implementation.md`: This architecture and implementation document.

### Modified Files
- `backend/package.json`: Added `firebase-admin` dependency.
- `backend/src/config/constants.js`: Added error codes (`INVALID_FIREBASE_TOKEN`, `USER_NOT_FOUND`, `TENANT_SUSPENDED`, `IDENTITY_CONFLICT`).
- `backend/src/config/env.js`: Added `FIREBASE_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT_KEY`, `FIREBASE_SERVICE_ACCOUNT_PATH`.
- `backend/.env.example`: Added Firebase environment variable placeholders.
- `backend/src/modules/auth/auth.repository.js`: Added `findUserForFirebaseIdentity` with UID lookup, verified email fallback, synthetic email guard, and conflict detection.
- `backend/src/modules/auth/auth.schemas.js`: Added `firebaseExchangeSchema` (`idToken` string validation).
- `backend/src/modules/auth/auth.service.js`: Added `firebaseExchange` domain orchestration.
- `backend/src/modules/auth/auth.controller.js`: Added `firebaseExchange` controller handler setting HttpOnly cookie and returning safe user payload.
- `backend/src/modules/auth/auth.routes.js`: Mounted `POST /api/v1/auth/firebase-exchange` with 10 req/min rate limiter.
- `backend/tests/unit/auth/auth.repository.test.js`: Added 7 test cases for `findUserForFirebaseIdentity`.
- `backend/tests/unit/auth/auth.service.test.js`: Added 6 test cases for `firebaseExchange`.

---

## 4. Test & Verification Results

### Test Suite Execution
- Total Test Files: 41 passed (41 total)
- Total Tests: 371 passed (371 total, 0 failed, 0 skipped)
- ESLint: 0 errors
- Prisma Validate: Valid schema
- Prisma Generate: Client generated successfully
- App Bootstrap: Verified

### Live Database Verification
- Primary UID matching verified on live migrated S024 staff account (`aswani.d@springmount.co.in`, `legacyFirestoreId: 6Uatg8jKMFdxejf2U2SCleCmqVW2`).
- Verified email fallback verified.
- Synthetic parent email rejection verified.
- Full exchange pipeline executed against live PostgreSQL:
  - `RefreshSession` created in DB with correct expiry and null `revokedAt`.
  - JWT access token issued with exact PostgreSQL claims.
  - Zero mutation of user credentials (`passwordHash` preserved as `!LOCKED_FIREBASE_AUTH_MANAGED`, `tokenVersion` unchanged, `legacyFirestoreId` unchanged).
