# FRONTEND.D6 — Firebase Auth Decommission: Architecture & Status Report

**Date**: September 21, 2026
**Author**: Migration Automation (D1 → D6)
**Status**: IN PROGRESS — Phase 3 BLOCKED (37 Firebase-managed accounts pending JIT migration)

---

## 1. Previous Authentication Architecture (HYBRID_BRIDGE)

```text
Institutional Login:
  Browser → Firebase signInWithEmailAndPassword()
          → Firebase issues ID token
          → POST /api/v1/auth/firebase-exchange (idToken + password)
          → Backend verifies Firebase token (RS256 + project boundary)
          → D5 JIT: upgrades !LOCKED_FIREBASE_AUTH_MANAGED → Argon2id
          → PostgreSQL session created
          → JWT + HttpOnly refresh cookie issued
          → GET /api/v1/auth/me
          → RBAC

Parent Login (unchanged):
  Browser → POST /api/v1/auth/admission-login
          → PostgreSQL Argon2id verification
          → Session + JWT

Session Restoration (already REST):
  Browser → getAccessToken() → GET /api/v1/auth/me
          → fallback: POST /api/v1/auth/refresh
```

**Active since D1 audit. Firebase Auth is in the credential-verification path for institutional users only.**

---

## 2. Target Native REST Architecture (Phase 3 — BLOCKED)

```text
Institutional Login:
  Browser → POST /api/v1/auth/login  { identifier, password }
          → Backend: email normalize → findUserByEmail → isLockedPassword guard
          → Argon2id verify (argon2.verify)
          → !isActive → 403 ACCOUNT_DISABLED
          → school.status === 'suspended' → 403 TENANT_ACCESS_ERROR
          → school.status === 'pending' → 403 TENANT_ACCESS_ERROR
          → sessionService.createSession()
          → issueAccessToken({ sub, schoolId, systemRole, tokenVersion })
          → HttpOnly Secure SameSite=Strict refresh cookie
          → JWT access token in response body
          → GET /api/v1/auth/me
          → RBAC

Parent Login:
  UNCHANGED — POST /api/v1/auth/admission-login

Session Restoration:
  UNCHANGED — already REST-only
```

**Zero Firebase calls in this path. `authApi.login` is implemented and tested.**

---

## 3. D3 — Password Reset/Setup Migration

- `POST /api/v1/auth/password-reset/request` — REST ✅
- `POST /api/v1/auth/password-reset/confirm` — REST ✅
- `POST /api/v1/auth/password-setup/confirm` — REST ✅
- All D3 contracts are REST-backed. Firebase `sendPasswordResetEmail` is dead code. Not called.

---

## 4. D5 — JIT Firebase Credential Migration Bridge

| Endpoint | `POST /api/v1/auth/firebase-exchange` |
|---|---|
| Purpose | Converts `!LOCKED_FIREBASE_AUTH_MANAGED_*` to Argon2id on first login |
| Trigger | User provides `password` along with Firebase `idToken` |
| Status | **RETAINED** — 37 accounts not yet migrated |
| Atomicity | WHERE clause: `passwordHash LIKE '!LOCKED_FIREBASE_AUTH_MANAGED%'` — first-writer-wins |
| Concurrency | Proven by D5 tests (CONC-A, CONC-B, CONC-C) |

### D5 Census (September 21, 2026)

| Category | Count |
|---|---|
| `$argon2id$` native | 0 (JIT fires on next login) |
| `!LOCKED_FIREBASE_AUTH_MANAGED` | 38 total, 37 operational |
| `!LOCKED_FUTURE_AUTH_REQUIRED` | 5 |
| `!LOCKED_PARENT_NO_DIRECT_AUTH` | 643 |
| Unknown/invalid | 0 |

---

## 5. D6 — Native Cutover Status

### Phase 3 Gate: 🚫 BLOCKED

```
D6 CUTOVER BLOCKED — REMAINING FIREBASE-MANAGED ACCOUNTS

Operational !LOCKED_FIREBASE_AUTH_MANAGED: 37
  TEACHER ×33 | ADMIN ×1 | TENANT_USER ×3

Strategy: Wait naturally.
HYBRID_BRIDGE remains active. D5 JIT fires on each user's next login.
```

### Phase 5a: ✅ COMPLETE — Dashboard `logoutUser` Migration

All five dashboard pages migrated from `import { logoutUser } from '../firebase/auth'` → `useAuth().logoutUser`:

- `AdminDashboard.jsx`
- `TeacherDashboard.jsx`
- `SuperAdminDashboard.jsx`
- `ParentDashboard.jsx`
- `SuperAdmin/Layout.jsx`

### Phase 10: ✅ COMPLETE — Native Login Tests Added

4 new tests added to `AuthContext.test.jsx`:
- `D6-NL-01`: Native institutional login via `authApi.login` succeeds
- `D6-NL-02`: Firebase-independent — `authApi.login` does not call `firebase/auth`
- `D6-NL-03`: Wrong password → `INVALID_CREDENTIALS` error propagated correctly
- `D6-NL-04`: Logout calls `authApi.logout` to revoke PostgreSQL session

---

## 6. Session Architecture

| Concern | Implementation |
|---|---|
| Session store | `RefreshSession` table in PostgreSQL |
| Refresh token | SHA-256 hashed before storage (raw token in HttpOnly cookie) |
| Access token | In-memory only (tokenService); never persisted |
| tokenVersion | In JWT + DB; `authenticate` middleware enforces match |
| Revocation | `DELETE FROM RefreshSession WHERE id = :id` on logout |
| Rotation | Single-flight `POST /api/v1/auth/refresh` replaces old session |
| Stale token | tokenVersion mismatch → 401 → client clears state |

---

## 7. RBAC Architecture

```text
JWT { sub, schoolId, systemRole, tokenVersion }
  ↓
authenticate middleware (token verify + tokenVersion check + user fetch)
  ↓
req.user = { id, email, schoolId, systemRole, school, isActive }
  ↓
tenantMiddleware (schoolId from JWT matches route parameter)
  ↓
rbacMiddleware (systemRole check)
  ↓
handler
```

Native login places the same `schoolId` and `systemRole` in the JWT as the Firebase exchange path — RBAC behavior is identical.

---

## 8. Firebase Dependencies Intentionally Retained

| Dependency | File | Reason |
|---|---|---|
| `signInWithEmailAndPassword` | `AuthContext.jsx` L183 | HYBRID_BRIDGE active — 37 accounts |
| `getIdToken` | `AuthContext.jsx` L184 | HYBRID_BRIDGE active |
| `firebase-exchange` call | `AuthContext.jsx` L188 | D5 JIT bridge active |
| `signOut(auth)` cleanup | `AuthContext.jsx` L229 | Needed while Firebase sessions exist |
| `onAuthStateChanged` import | `AuthContext.jsx` L2 | Dead import — FIREBASE_LEGACY branch only |
| `firebase/config.js` | config | Needed for `auth`, `db`, `storage` |
| `firebase/auth.js` | legacy functions | Dead under HYBRID_BRIDGE — cleanup in Phase 3 |

---

## 9. Firebase Dependencies Removed

| What | Where | Replaced With |
|---|---|---|
| `logoutUser` direct import | 5 dashboard pages | `useAuth().logoutUser` |

---

## 10. Support Tickets Exception

`SupportTickets.jsx` uses the **separate** `zuna-landing-page-22564` Firebase project (Firestore only).
This is entirely independent of the authentication Firebase project (`school-management-system-6a2c4`).

**Status: PERMANENTLY DEFERRED. DO NOT MODIFY.**

---

## 11. Storage Exception

`firebase/storage` is used in `cloudinary.js` for file upload fallback.

**Status: PRESERVED. DO NOT MODIFY.**

---

## 12. Remaining Migration Bridge

`POST /api/v1/auth/firebase-exchange` must be retained until:
1. Operational `!LOCKED_FIREBASE_AUTH_MANAGED` count = 0
2. `AuthContext.jsx` L188 caller is removed (Phase 3)
3. Backend tests updated to mark as removed

Current status: **LEGACY MIGRATION BRIDGE — RETAINED**

---

## 13. Security Verification

| Check | Result |
|---|---|
| Password never logged | ✅ No console.log(password) anywhere |
| Password never in URL | ✅ POST body only |
| Password never in localStorage | ✅ Only access JWT in `sms_auth_token` |
| Refresh token HttpOnly | ✅ `httpOnly: true, secure: true, sameSite: 'strict'` |
| Firebase token not required (native path) | ✅ `POST /api/v1/auth/login` has zero Firebase dependency |
| JWT/tokenVersion enforced | ✅ `authenticate` middleware |
| Tenant isolation | ✅ `schoolId` in JWT; all queries scoped by it |
| RBAC not bypassed | ✅ `ProtectedRoute` + backend middleware |
| Session revocation | ✅ `authApi.logout()` deletes RefreshSession row |
| Firebase users modified | ✅ 0 |
| Firebase passwords modified | ✅ 0 |
| Firestore records modified | ✅ 0 |
| Firebase project modified | ✅ 0 |
| Production users manually migrated | ✅ 0 |

---

## 14. Test Results

| Suite | Result |
|---|---|
| Backend: auth + security (targeted) | **770 / 770** ✅ |
| Backend: full suite | **770 / 770** ✅ |
| Frontend: full suite | **1221 / 1221** ✅ (+4 new D6 tests) |
| Frontend: production build | **PASS** (2.63s) |

### New D6 Tests

| Test | File |
|---|---|
| D6-NL-01: native institutional login | `AuthContext.test.jsx` |
| D6-NL-02: Firebase independence proof | `AuthContext.test.jsx` |
| D6-NL-03: wrong password error propagation | `AuthContext.test.jsx` |
| D6-NL-04: logout session revocation | `AuthContext.test.jsx` |

---

## 15. Final Firebase Repository Audit

| Reference | Location | Status | Action |
|---|---|---|---|
| `signInWithEmailAndPassword` | `AuthContext.jsx` L183 | ACTIVE HYBRID_BRIDGE | RETAINED — gate blocked |
| `getIdToken` | `AuthContext.jsx` L184 | ACTIVE HYBRID_BRIDGE | RETAINED |
| `firebaseExchange` call | `AuthContext.jsx` L188 | LEGACY MIGRATION BRIDGE | RETAINED — 37 accounts |
| `firebase/auth` import | `AuthContext.jsx` L2 | ACTIVE + dead imports | RETAINED — gate blocked |
| `signOut(auth)` | `AuthContext.jsx` L229 | LOGOUT CLEANUP | RETAINED — Firebase sessions exist |
| `onAuthStateChanged` | `firebase/auth.js` + `AuthContext.jsx` | FIREBASE_LEGACY dead code | RETAINED until Phase 3 |
| `loginUser` | `firebase/auth.js` | DEAD — FIREBASE_LEGACY only | RETAINED until Phase 3 |
| `loginWithAdmissionNumber` | `firebase/auth.js` | DEAD — FIREBASE_LEGACY only | RETAINED until Phase 3 |
| `registerUser` | `firebase/auth.js` | DEAD — never called | RETAINED until Phase 3 |
| `getUserProfile` | `firebase/auth.js` | DEAD — FIREBASE_LEGACY only | RETAINED until Phase 3 |
| `resetPassword` (sendPasswordResetEmail) | `firebase/auth.js` | DEAD — D3 supersedes | RETAINED until Phase 3 |
| `firebase/config.js` | config init | REQUIRED (auth, db, storage) | PRESERVED |
| `POST /api/v1/auth/firebase-exchange` | backend route | LEGACY MIGRATION BRIDGE | RETAINED — 37 accounts |
| `firebase/firestore.js` | Firestore features | ACTIVE (noticeboard, etc.) | PRESERVED |
| `SupportTickets.jsx` | `zuna-landing-page-22564` | DEFERRED | DO NOT TOUCH |
| `cloudinary.js` firebase/storage | File upload fallback | ACTIVE | PRESERVED |
| `whatsappService.js` auth import | FIREBASE_LEGACY dead path | Dead under HYBRID_BRIDGE | RETAINED |
| `logoutUser` firebase import | 5 dashboard pages | **REMOVED** ✅ | Now uses `useAuth().logoutUser` |

---

## Required Final Report

### 1. Authentication Architecture

**Before (HYBRID_BRIDGE):**
```
Firebase signInWithEmailAndPassword → getIdToken → POST /firebase-exchange → PostgreSQL session
```

**After Phase 3 completes (NATIVE REST):**
```
POST /api/v1/auth/login → PostgreSQL Argon2id → PostgreSQL session
```

### 2. Native Cutover Status

```
BLOCKED — 37 operational Firebase-managed accounts remain
```

### 3. Firebase Institutional Auth References

| | Before D6 | After D6 (this session) |
|---|---|---|
| Active institutional auth Firebase calls | 3 (signIn, getIdToken, exchange) | 3 (unchanged — gate blocked) |
| Dashboard Firebase logoutUser imports | 5 | 0 ✅ |

### 4. Remaining Firebase Dependencies

| Dependency | Type |
|---|---|
| HYBRID_BRIDGE login (AuthContext.jsx L181-200) | Active — gate blocked |
| `POST /api/v1/auth/firebase-exchange` endpoint | Legacy migration bridge |
| `signOut(auth)` logout cleanup | Needed while HYBRID_BRIDGE active |
| Support Tickets (`zuna-landing-page-22564`) | Permanently deferred |
| Firebase Storage (`cloudinary.js`) | Preserved |
| `firebase/config.js` | Required (auth + db + storage) |
| `firebase/firestore.js` | Required (real-time features) |

### 5. Production Safety

```
Firebase users modified:           0
Firebase passwords modified:       0
Firestore records modified:        0
Firebase project modified:         0
Production users manually migrated: 0
```

### 6. Tests

```
Backend auth/security:   770 / 770  ✅
Backend full suite:      770 / 770  ✅
Frontend full suite:    1221 / 1221 ✅  (+4 new D6 tests)
Production build:       PASS        ✅
```

### 7. Security

```
No password logging:              ✅
No token leakage:                 ✅
No RBAC bypass:                   ✅
No tenant isolation violation:    ✅
Firebase-free native login path:  ✅ (authApi.login → REST)
```

### 8. Final Marker

```
FRONTEND.D6 — NATIVE AUTH CUTOVER BLOCKED

37 operational !LOCKED_FIREBASE_AUTH_MANAGED accounts remain.
HYBRID_BRIDGE active. D5 JIT migration bridge active.
Phase 3 will execute when census confirms count = 0.
All preparatory work complete. Tests pass. Build clean.
```

---

*Next step: Re-run `node d6_final_census.mjs` from backend/ when institutional users have logged in.*
*When count = 0, execute the 4-line swap in AuthContext.jsx and remove Firebase auth imports.*
