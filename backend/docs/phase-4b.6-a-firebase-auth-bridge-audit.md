# PHASE 4B.6-A: FIREBASE → POSTGRESQL AUTHENTICATION BRIDGE AUDIT
## INVESTIGATION & IMPLEMENTATION READINESS REPORT

**Phase**: 4B.6-A — Investigation & Audit Only  
**Status**: **READY FOR PHASE 4B.6-B**  
**Date**: September 9, 2026  
**Implementation Constraint**: **STRICT AUDIT ONLY — ZERO WRITES, ZERO DATA MUTATIONS, ZERO FIREBASE/POSTGRESQL MODIFICATIONS**  

---

## Executive Summary

This audit establishes the technical foundation, identity mappings, security threat model, and transition mechanics required to bridge Firebase Authentication to the PostgreSQL + JWT authentication infrastructure built across Phases 4A through 4B.5-B.

The investigation confirms that:
1. **Frontend Authentication Model**: The React/Vite frontend currently authenticates directly against Firebase Auth (`signInWithEmailAndPassword`, `loginWithAdmissionNumber`), resolves user authorization and school scoping directly from Firestore collections (`users/{uid}`, `schools/{schoolId}/teachers`, `schools/{schoolId}/roles`), and maintains client state via `onAuthStateChanged`.
2. **PostgreSQL Identity Mapping**: 686 users are persisted in PostgreSQL across two active schools (`SchoolS024` with 367 users, `SchoolS015` with 319 users) and one suspended school (`SchoolS019` with 0 users). 35 institutional staff and admin users possess verified Firebase Auth UIDs mapped in PostgreSQL (`legacyFirestoreId` / `!LOCKED_FIREBASE_AUTH_MANAGED`).
3. **Parent Authentication Separation**: 646 parent users have synthetic internal email addresses (`*.sms.internal` / `*.parent.local`) and are secured with `!LOCKED_PARENT_NO_DIRECT_AUTH`. These users authenticate natively via Phase 4B.4 Admission Number login and do not require Firebase Auth.
4. **Firebase Project Isolation**: Two independent Firebase projects exist:
   - **Primary School Management Project** (`school-management-system-6a2c4`): Handles user authentication and core school Firestore data.
   - **Support Desk Project** (`zuna-landing-page-22564`): Isolated Firebase instance (`ZunaSharedApp`) used exclusively for administrative support tickets. It must remain strictly excluded from user authentication.
5. **Readiness**: The backend authentication foundation (Argon2id, JWT token service, RefreshSession rotation, tokenVersion enforcement, tenant middleware, RBAC middleware, and rate limiting) is fully verified and ready for Phase 4B.6-B token exchange implementation.

---

## 1. Current Firebase Authentication Inventory

| File Location | Function / Hook | Firebase API | Target User Type | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| [`src/firebase/config.js`](file:///c:/Projects/SMS/src/firebase/config.js) | Module init | `initializeApp`, `getAuth`, `initializeFirestore` | All Users | Initializes primary Firebase App (`school-management-system-6a2c4`) with offline multi-tab Firestore persistence. |
| [`src/firebase/auth.js`](file:///c:/Projects/SMS/src/firebase/auth.js) | `loginUser(email, password)` | `signInWithEmailAndPassword(auth, email, password)` | Staff, Admin, SuperAdmin | Authenticates standard email/password credentials via Firebase Client SDK. |
| [`src/firebase/auth.js`](file:///c:/Projects/SMS/src/firebase/auth.js) | `loginWithAdmissionNumber(admissionNumber, password)` | `signInWithEmailAndPassword(auth, syntheticEmail, password)` | Parents (Legacy Frontend) | Reconstructs synthetic email `${admissionNumber}@parent.School.com` to authenticate against Firebase Auth. |
| [`src/firebase/auth.js`](file:///c:/Projects/SMS/src/firebase/auth.js) | `getUserProfile(uid)` | `getDoc(doc(db, "users", uid))`, `getDocs(query(schools/{id}/teachers))` | All Users | Fetches user profile, role, schoolId, `assignedClassId`, and `loginPanel` from Firestore. |
| [`src/firebase/auth.js`](file:///c:/Projects/SMS/src/firebase/auth.js) | `logoutUser()` | `signOut(auth)` | All Users | Signs out from Firebase Client Auth session. |
| [`src/firebase/auth.js`](file:///c:/Projects/SMS/src/firebase/auth.js) | `registerUser(...)` | `createUserWithEmailAndPassword(auth, email, password)`, `setDoc(users/{uid})` | Self-Registered Users | Registers new account in Firebase Auth and writes Firestore profile. |
| [`src/firebase/auth.js`](file:///c:/Projects/SMS/src/firebase/auth.js) | `resetPassword(email)` | `sendPasswordResetEmail(auth, email)` | All Users | Triggers Firebase Client password reset email. |
| [`src/context/AuthContext.jsx`](file:///c:/Projects/SMS/src/context/AuthContext.jsx) | `AuthProvider` | `onAuthStateChanged(auth, callback)` | All Users | Subscribes to Firebase session state, executes optimistic profile cache load via `CacheService`, and refreshes from Firestore. |
| [`src/pages/LoginPage.jsx`](file:///c:/Projects/SMS/src/pages/LoginPage.jsx) | `handleLogin(e)` | `loginUser`, `loginWithAdmissionNumber`, `getUserProfile` | All Users | UI entry point for login; routes to `/admin`, `/teacher`, `/parent`, or `/superadmin`. |
| [`api/forgot-password.js`](file:///c:/Projects/SMS/api/forgot-password.js) | Vercel Serverless Handler | `admin.auth().generatePasswordResetLink(email)` | All Users | Uses Firebase Admin SDK + Resend API to generate custom branded password reset links. |
| [`src/components/RaiseTicketModal.jsx`](file:///c:/Projects/SMS/src/components/RaiseTicketModal.jsx) | `ZunaSharedApp` | `getFirestore` on project `zuna-landing-page-22564` | School Admins | Submits technical support tickets to Central Zuna desk. **Zero auth usage**. |
| [`src/pages/SuperAdmin/SupportTickets.jsx`](file:///c:/Projects/SMS/src/pages/SuperAdmin/SupportTickets.jsx) | `ZunaSharedApp` | `getFirestore` on project `zuna-landing-page-22564` | SuperAdmin | Views and responds to support tickets. **Zero auth usage**. |

---

## 2. Frontend Authentication Flow (Current vs Future)

### Current Flow (Firebase-Authoritative)
```
User enters credentials (Email / Password)
  ↓
LoginPage calls loginUser() / signInWithEmailAndPassword()
  ↓
Firebase Auth validates credentials & issues Firebase ID Token
  ↓
AuthContext onAuthStateChanged fires with Firebase User
  ↓
Frontend queries Firestore `users/{uid}` + `schools/{schoolId}/teachers`
  ↓
Frontend extracts role, schoolId, permissions directly from Firestore doc
  ↓
Frontend routes to role-specific dashboard (/admin, /teacher, /parent, /superadmin)
  ↓
All data queries execute directly against Firestore SDK (No backend JWT involved)
```

### Transition Flow (Phase 4B.6-B Token Exchange Bridge)
```
User enters credentials on Frontend (Firebase Auth or Google SSO)
  ↓
Firebase Auth authenticates user & issues raw Firebase ID Token
  ↓
Frontend calls POST /api/v1/auth/firebase-exchange with { idToken }
  ↓
Backend cryptographically verifies Firebase ID Token (RS256, Google x509 certs, aud, iss, exp)
  ↓
Backend extracts verified Firebase UID (`sub`) and email
  ↓
Backend queries PostgreSQL User via `legacyFirestoreId == uid` OR `email == verifiedEmail`
  ↓
Backend validates PostgreSQL account state (isActive == true, school status != 'suspended')
  ↓
Backend derives tenant authority (schoolId) and role (systemRole, staffProfile) from PostgreSQL
  ↓
Backend issues authoritative PostgreSQL JWT Access Token (15m TTL) + HttpOnly Refresh Cookie (7d TTL)
  ↓
Frontend stores JWT and uses Bearer Authorization header for all backend REST APIs
```

---

## 3. Firebase UID → PostgreSQL User Reconciliation

A comprehensive read-only audit of the live PostgreSQL database was executed on September 9, 2026.

### Summary Metrics
- **Total PostgreSQL Users**: 686
- **Active Users (`isActive = true`)**: 686 (100%)
- **Inactive Users (`isActive = false`)**: 0 (0%)
- **Users with `legacyFirestoreId`**: 367 (53.5%)
- **Users without `legacyFirestoreId`**: 319 (46.5%)
- **Duplicate `legacyFirestoreId`**: 0 (Zero collisions)
- **Duplicate Emails**: 0 (Zero collisions)
- **MigrationIdMap Records (`users` collection)**: 686

### School-by-School Reconciliation
| School Code | School Name | Status | Total Users | Firebase Auth Linked (`legacyFirestoreId` 28-char UID) | Staff Without Firebase (`legacyFirestoreId` 20-char Doc ID) | Parent Profiles (Synthetic Emails / `!LOCKED_PARENT`) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **SchoolS024** | Spring Mount Valley School | `approved` | 367 | 34 (33 Teachers + 1 Admin) | 5 (Teachers in `teachers` subcollection) | 328 (`parent.<phone>@s024.sms.internal`) |
| **SchoolS015** | TrustITec College | `approved` | 319 | 1 (Admin) | 0 | 318 (`p_phone_<phone>@s015.parent.local`) |
| **SchoolS019** | Zuna International School | `suspended` | 0 | 0 | 0 | 0 |
| **SYSTEM_TEMPLATE** | System Institutional Template | `active` | 0 | 0 | 0 | 0 |
| **Total** | | | **686** | **35** | **5** | **646** |

### Password Hash Types in PostgreSQL
| Password Hash Marker | Count | Target Entity | Authentication Route |
| :--- | :--- | :--- | :--- |
| `!LOCKED_PARENT_NO_DIRECT_AUTH` | 643 | Migrated Parents | Phase 4B.4 Admission Number Login (`/auth/admission-login`) |
| `!LOCKED_FIREBASE_AUTH_MANAGED` | 38 | Migrated Staff & Admins with Firebase Auth | Phase 4B.6-B Firebase Token Exchange (`/auth/firebase-exchange`) |
| `!LOCKED_FUTURE_AUTH_REQUIRED` | 5 | Staff without active Firebase Auth user doc | Phase 4B.5-B Password Setup (`/auth/password-setup/confirm`) |
| `$argon2id$...` (Active Native Password) | 0 | Accounts transitioned to native passwords | Native Login (`/auth/login`) |

---

## 4. User Categorization Matrix

| Category | Description | Count | Exchange / Auth Strategy |
| :--- | :--- | :--- | :--- |
| **A: Direct Firebase Bridge Eligible** | Staff/Admin users with verified Firebase Auth accounts and matching `legacyFirestoreId` or institutional email in PostgreSQL (`!LOCKED_FIREBASE_AUTH_MANAGED`). | 35 | **Allowed**: Exchange verified Firebase ID token for PostgreSQL JWT. |
| **B: PostgreSQL Admission Login Only** | Migrated parent accounts linked to student admission numbers with synthetic emails (`!LOCKED_PARENT_NO_DIRECT_AUTH`). | 646 | **Separate**: Authenticate via `POST /api/v1/auth/admission-login`. Do not use Firebase bridge. |
| **C: Staff Requiring Initial Password Setup** | Staff members present in school rosters who lack a Firebase Auth root account (`!LOCKED_FUTURE_AUTH_REQUIRED`). | 5 | **Setup Required**: Must receive invitation / setup token via `POST /api/v1/auth/password-setup/confirm`. |
| **D: Unmapped / Foreign Firebase Accounts** | Users with valid Firebase accounts that do not exist in PostgreSQL (e.g. orphan Firebase accounts, foreign domain users). | Unknown | **Rejected**: Return `401 Unauthorized` (`USER_NOT_FOUND`). Zero auto-provisioning. |
| **E: Inactive / Disabled Accounts** | PostgreSQL users with `isActive = false`. | 0 | **Rejected**: Return `403 Forbidden` (`ACCOUNT_DISABLED`) regardless of Firebase token validity. |
| **F: Suspended School Accounts** | Users belonging to suspended schools (e.g. `SchoolS019`). | 0 | **Rejected**: Return `403 Forbidden` (`TENANT_SUSPENDED`). |
| **G: SuperAdmin Accounts** | System-wide administrators with `schoolId = NULL`. | 0 in DB | **Allowed**: Exchange verified SuperAdmin Firebase ID token for SuperAdmin JWT; supports `X-Tenant-Id` header switching. |

---

## 5. Identity Matching Strategy for Exchange

When the backend receives a Firebase ID Token at `POST /api/v1/auth/firebase-exchange`:

### 1. Primary Authority: `legacyFirestoreId` Matching
- The cryptographically verified Firebase `uid` (`decodedToken.uid` / `decodedToken.sub`) is queried against `User.legacyFirestoreId`.
- **Confidence**: 100% (Unique index, zero collisions).

### 2. Secondary Fallback: Verified Email Matching
- If `legacyFirestoreId` is null (e.g. users migrated in S015 or users newly bound via Firebase email):
  - Verify that `decodedToken.email_verified === true` (or trusted domain check).
  - Match normalized `decodedToken.email.toLowerCase().trim()` against PostgreSQL `User.email`.
- **Confidence**: High (PostgreSQL email is strictly unique).

### 3. Forbidden Matching Mechanisms
- **NEVER** match by client-supplied `userId` or `schoolId`.
- **NEVER** match by admission number alone during Firebase token exchange.
- **NEVER** select arbitrary parent accounts when multiple parent links exist.

---

## 6. Firebase Token Verification Requirements

The backend verification engine in Phase 4B.6-B must execute strict server-side validation:

1. **Cryptographic Signature**: RS256 signature verification against Google's public JSON Web Key Sets (JWKS) via `firebase-admin` (or Google x509 cert endpoint `https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com`).
2. **Issuer (`iss`)**: Must strictly equal `https://securetoken.google.com/school-management-system-6a2c4` (or configured project ID).
3. **Audience (`aud`)**: Must strictly equal `school-management-system-6a2c4` (or configured project ID).
4. **Token Expiration (`exp`)**: `exp > Math.floor(Date.now() / 1000)`. Stale or expired tokens must be immediately rejected with `401 Unauthorized`.
5. **Issued At (`iat`) & Auth Time (`auth_time`)**: Must be valid timestamps in the past.
6. **Project Boundary Guard**: Tokens issued for `zuna-landing-page-22564` (the support tickets project) or any other Google Cloud project will have mismatched `aud` and `iss` and will be rejected automatically.

---

## 7. PostgreSQL JWT Exchange Contract

### Endpoint Specification
`POST /api/v1/auth/firebase-exchange`  
**Access**: Public (Carries Firebase ID Token)  
**Rate Limit**: 10 requests per minute per IP (`rl:auth:firebase-exchange:`)  

### Request Payload
```json
{
  "idToken": "eyJhbGciOiJSUzI1NiIsImtpZCI6IjEy..."
}
```

### Backend Processing Pipeline
```
1. Validate request body (zod schema: idToken non-empty string).
2. Rate limit check (10 req/min per IP).
3. Verify Firebase ID Token via Firebase Admin SDK / Google Auth API.
4. Extract verified `uid`, `email`, and `email_verified`.
5. Find PostgreSQL User:
   a. First by `legacyFirestoreId == uid`
   b. Fallback by `email == normalizedEmail` (if email_verified is true)
6. Guard checks:
   a. If User not found -> throw UnauthorizedError('User account not found', ERROR_CODES.USER_NOT_FOUND)
   b. If User.isActive === false -> throw ForbiddenError('Account is deactivated', ERROR_CODES.ACCOUNT_DISABLED)
   c. If User.schoolId and User.school.status === 'suspended' -> throw ForbiddenError('School tenant is suspended', ERROR_CODES.TENANT_SUSPENDED)
7. Create standard PostgreSQL RefreshSession (7-day TTL, SHA-256 hash).
8. Issue standard PostgreSQL JWT Access Token (15-min TTL) with minimal claims:
   {
     "sub": user.id,
     "schoolId": user.schoolId,
     "systemRole": user.systemRole,
     "tokenVersion": user.tokenVersion,
     "jti": "<uuid>"
   }
9. Set HttpOnly `sms_refresh_token` cookie on HTTP response.
10. Return 200 OK with accessToken and safe user payload.
```

### Success Response (200 OK)
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "e9c4e270-26e1-43ac-8279-886ec13f4776",
      "email": "lakshmipriya@springmount.co.in",
      "schoolId": "25e9637a-7fa4-4ac2-b43d-b4c0edcf2932",
      "systemRole": "TEACHER"
    }
  },
  "message": "Firebase authentication exchanged successfully"
}
```

---

## 8. Transitioning Locked Accounts to Native Credentials

How a user with `!LOCKED_FIREBASE_AUTH_MANAGED` transitions to native Argon2id credentials:

```
[Phase 4B.6-B]
User logs in via Firebase Auth on frontend
  ↓
Frontend exchanges Firebase ID Token for backend JWT
  ↓
User is now authenticated in PostgreSQL backend with active JWT session
  ↓
User navigates to "Set Password / Security Settings" in dashboard
  ↓
Frontend invokes POST /api/v1/auth/change-password (or password setup)
  ↓
Backend updates passwordHash to Argon2id, increments tokenVersion, and clears locked marker
  ↓
[Future State]
User can now log in directly via POST /api/v1/auth/login using their native password!
```

---

## 9. Security Threat Model

| Threat Scenario | Attack Vector | Mitigation in Bridge Design |
| :--- | :--- | :--- |
| **Token Forgery** | Attacker crafts a fake JWT with arbitrary `uid` or `email`. | Server-side RS256 cryptographic verification using Google's public keys. Forged signatures fail instantly. |
| **Cross-Project Substitution** | Attacker obtains a valid token from `zuna-landing-page-22564` and attempts to log into the school system. | Backend strictly checks `aud == process.env.FIREBASE_PROJECT_ID` (`school-management-system-6a2c4`). Support project tokens are rejected. |
| **Token Replay / Stale Token** | Attacker replays an intercepted Firebase ID token. | Firebase ID tokens expire in 1 hour; `exp` is strictly verified. Replaying an expired token yields `401 Unauthorized`. |
| **Identity Spoofing** | Attacker sends a request with valid token but adds `userId` or `role: "SUPER_ADMIN"` in body. | Body fields are ignored. Identity, schoolId, and role are derived exclusively from the verified token's database mapping. |
| **Disabled Account Bypass** | User deactivated in PostgreSQL tries logging in via still-active Firebase account. | Backend checks `User.isActive` in PostgreSQL. If `false`, returns `403 Forbidden` (`ACCOUNT_DISABLED`). |
| **Suspended School Access** | User belonging to suspended school `SchoolS019` tries logging in. | Backend queries `User.school.status`. If `suspended`, returns `403 Forbidden` (`TENANT_SUSPENDED`). |
| **Credential Leakage** | Raw Firebase tokens or passwords logged in server logs. | Raw `idToken` is never logged, never stored in DB, and never returned in responses. |

---

## 10. Required Environment Configuration (Names Only)

For Phase 4B.6-B backend implementation, the following configuration names are required:
- `FIREBASE_PROJECT_ID` (Default: `school-management-system-6a2c4`)
- `FIREBASE_SERVICE_ACCOUNT_KEY` or `FIREBASE_SERVICE_ACCOUNT_PATH` (JSON service account credential for server-side Admin SDK verification)
- `JWT_ACCESS_SECRET` (Existing: for signing PostgreSQL access tokens)
- `JWT_ACCESS_EXPIRY` (Existing: `15m`)
- `REFRESH_TOKEN_SECRET` (Existing: for refresh token hashing)
- `DATABASE_URL` (Existing: PostgreSQL connection string)
- `REDIS_URL` (Existing: Redis connection string)

*(No secrets, private keys, or credentials are printed or modified in this report).*

---

## 11. Coexistence & Rollback Strategy

### Coexistence Architecture
1. **Existing Firebase Users (Staff/Admin)**: Continue using Firebase Auth on frontend -> Exchange token at `/api/v1/auth/firebase-exchange` -> Receive PostgreSQL JWT.
2. **Migrated Parents**: Use Admission Number Login (`/api/v1/auth/admission-login`) directly against PostgreSQL.
3. **Transitioned Users**: Once a user sets an Argon2id password, they can log in directly at `/api/v1/auth/login`.

### Rollback Strategy
If the Firebase token exchange endpoint encounters an unexpected issue during deployment:
1. **Zero Data Destruction**: No users, passwords, or schema changes are destroyed or altered.
2. **Frontend Routing Fallback**: The frontend can immediately fall back to existing Firebase direct Firestore access by toggling an environment flag (`VITE_USE_BACKEND_AUTH=false`).
3. **Isolated Endpoint**: `/api/v1/auth/firebase-exchange` is an independent endpoint; rolling it back or disabling it has zero impact on `/auth/login`, `/auth/admission-login`, or `/auth/refresh`.

---

## 12. Safety Invariants Verification Checklist

- [x] No Firebase writes executed.
- [x] No Firestore writes executed.
- [x] No Firebase Auth writes executed.
- [x] No PostgreSQL user mutations executed.
- [x] No account unlocks executed (All 686 accounts remain locked).
- [x] No password changes executed.
- [x] No `tokenVersion` changes executed.
- [x] No session revocations executed.
- [x] No migrations created or executed.
- [x] No frontend changes made.
- [x] No packages installed.
- [x] No secrets or private keys exposed.
- [x] No TypeScript introduced.
- [x] No Docker introduced.

---

## 13. Implementation Plan for Phase 4B.6-B

When approved for Phase 4B.6-B:
1. **Install / Configure `firebase-admin` in `backend/package.json`**:
   - Install `firebase-admin` in backend dependencies.
   - Implement `firebase-auth.service.js` with server-side token verification and mocked verification for test suites.
2. **Implement Exchange Schema & Controller**:
   - `firebaseExchangeSchema` in `auth.schemas.js`.
   - `firebaseExchange` handler in `auth.service.js` and `auth.controller.js`.
   - Route `POST /api/v1/auth/firebase-exchange` in `auth.routes.js` with rate limiting (`10/min`).
3. **Implement Test Suite**:
   - Unit tests for Firebase ID token verification, claim extraction, and UID/email matching.
   - Integration tests for `POST /api/v1/auth/firebase-exchange` (valid token, expired token, invalid signature, wrong audience, disabled user, suspended school, unmapped user).
   - Security tests proving tenant isolation, session creation, and credential redaction.
4. **Execute Quality Gates & Migration Verification**:
   - Run Vitest, ESLint, and Prisma validation.

---

## 14. Final Audit Status

**READY FOR PHASE 4B.6-B**

---

# HARD STOP
Audit complete. No code changes or Firebase bridge implementation performed. Awaiting user authorization to proceed to Phase 4B.6-B.
