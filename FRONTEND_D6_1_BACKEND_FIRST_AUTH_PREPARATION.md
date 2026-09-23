# FRONTEND D6.1 — BACKEND-FIRST AUTH PREPARATION & FIREBASE AUTH DECOUPLING

## EXECUTIVE SUMMARY

This document completes **Phase FRONTEND.D6.1 — Backend-First Auth Preparation & Firebase Auth Decoupling**.

The application codebase has been refactored to isolate the backend-native PostgreSQL REST authentication path while preserving the active HYBRID_BRIDGE for the **37 operational Firebase-managed accounts**.

No changes were made to Firebase directly:
* **Firebase Auth mutations**: 0
* **Firestore mutations**: 0
* **Firebase Storage mutations**: 0
* **Firebase project mutations**: 0
* **Production user modifications**: 0

---

## 1. CURRENT HYBRID_BRIDGE ARCHITECTURE

The active institutional authentication flow for staff, admin, and teacher accounts remains:

```text
User credentials (Email + Password)
        ↓
signInWithEmailAndPassword(auth, identifier, password)
        ↓
getIdToken()
        ↓
POST /api/v1/auth/firebase-exchange (D5 JIT password upgrade)
        ↓
PostgreSQL Session / JWT / tokenVersion
        ↓
GET /api/v1/auth/me
```

This bridge continues servicing the 37 accounts that have not yet undergone native Argon2id password setup.

---

## 2. NATIVE REST ARCHITECTURE PREPARATION

The target native authentication implementation is isolated inside `frontend/src/context/AuthContext.jsx`:

```javascript
const _nativeInstitutionalLogin = async (identifier, password) => {
  const res = await authApi.login({ identifier, password });
  const token = res.data?.accessToken;
  if (!token) throw new Error('No access token received from native login.');
  setAccessToken(token);

  const meRes = await authApi.getMe();
  const userData = meRes?.data?.user || meRes?.data || res.data?.user;
  const normalized = normalizeAuthUser(userData);

  setCurrentUser({ uid: normalized.uid, email: normalized.email, ...normalized });
  setUserProfile(normalized);
  return { user: normalized, profile: normalized };
};
```

This path communicates directly with `POST /api/v1/auth/login` without invoking Firebase Auth SDK.

---

## 3. D5 JIT MIGRATION BRIDGE STATUS

`POST /api/v1/auth/firebase-exchange` remains fully operational on the backend, verified by 34 dedicated security tests (`tests/security/d5-jit-migration-security.test.js`).

Safety properties enforced:
* Only `FIREBASE_AUTH` managed accounts can undergo JIT password upgrade
* `FUTURE_AUTH` accounts cannot be migrated via exchange
* Parent accounts cannot be migrated via exchange
* Native `ARGON2ID` credentials cannot be overwritten
* Concurrency, tenant isolation, and zero plaintext logging strictly maintained

---

## 4. CURRENT 37-USER GATE CENSUS

A fresh census of the PostgreSQL database confirms:

```text
Total Users in Database:               686
Operational FIREBASE_LOCKED Accounts:  37 (33 TEACHER, 1 ADMIN, 3 TENANT_USER)
Native ARGON2ID Accounts:              0
Locked Parent Accounts:                646
Locked Future Auth Accounts:           3

NATIVE INSTITUTIONAL CUTOVER GATE:     BLOCKED (37 accounts remaining)
```

Because 37 accounts rely on Firebase Authentication, the institutional login swap to native REST remains safely gated until this census reaches zero.

---

## 5. DEAD FIREBASE AUTH CODE REMOVED

The following unused functions were audited across the entire repository and removed from `frontend/src/firebase/auth.js`:

1. `registerUser` — Dead (never called by frontend application)
2. `loginUser` — Dead (superseded by AuthContext unified login)
3. `loginWithAdmissionNumber` — Dead (superseded by `authApi.admissionLogin`)
4. `getUserProfile` — Dead (superseded by `authApi.getMe`)
5. `resetPassword` — Dead (superseded by D3 REST `authApi.passwordResetRequest`)
6. `logoutUser` — Dead (all dashboard components migrated to `useAuth().logoutUser`)

In `frontend/src/context/AuthContext.jsx`:
* Removed `onAuthStateChanged` import (Session restoration is 100% REST `/me` based)
* Removed `getUserProfile`, `loginUser`, `loginWithAdmissionNumber` imports

---

## 6. FIREBASE AUTH CODE INTENTIONALLY RETAINED

The following Firebase Auth functions are intentionally retained in `AuthContext.jsx` while the 37-account gate remains open:
* `signInWithEmailAndPassword` — Required by `_hybridBridgeLogin`
* `getIdToken` — Required by `_hybridBridgeLogin`
* `signOut` — Required during logout to clean up active client SDK sessions

---

## 7. SUPPORT TICKETS EXCEPTION

The Support Tickets system (`src/pages/SupportTickets.jsx`) operates on an isolated Firebase project configuration (`zuna-landing-page-22564`).

* **Status**: PRESERVED (Out of scope for institutional auth migration)
* **Action**: No modifications made.

---

## 8. FIREBASE STORAGE EXCEPTION

Firebase Storage fallbacks in `src/services/cloudinary.js` and `src/firebase/config.js` provide fallback image/document storage when primary Cloudinary uploads fail.

* **Status**: PRESERVED (Out of scope for auth decommissioning)
* **Action**: No modifications made.

---

## 9. FIREBASE DATA INTENTIONALLY UNTOUCHED

Explicit verification of zero data operations:
* **Firestore writes**: 0
* **Firestore deletes**: 0
* **Firebase Auth mutations**: 0
* **Firebase Storage mutations**: 0
* **Firebase project mutations**: 0

No data migration was attempted or script executed.

---

## 10. SEPARATION OF AUTH & DATA MIGRATION

Authentication preparation (this phase) is strictly separated from future data migration.

* **Auth Migration Target**: `POST /api/v1/auth/login` → Argon2id → JWT + HttpOnly Refresh Cookie
* **Data Migration Target**: Controlled offline data migration phase from Firestore to PostgreSQL (Future separate phase)

---

## 11. TEST RESULTS

### Backend Test Suite
```text
Backend Security / Auth Suite:  34/34 PASS
Full Backend Suite:              227/227 test files PASS (2840/2840 tests PASS)
Duration:                        94.59s
```

### Frontend Test Suite
```text
AuthContext Test Suite:          10/10 PASS
Full Frontend Suite:             132/132 test files PASS (1221/1221 tests PASS)
Duration:                        27.45s
```

---

## 12. BUILD RESULT

```text
npm run build (frontend)
Result: SUCCESS (built in 2.46s, 0 errors)
```

---

## 13. REMAINING BLOCKERS

```text
Blocker: Operational Firebase-managed accounts = 37
Cutover: BLOCKED until Firebase account count = 0
```

---

## NEXT STEPS & HARD STOP

As mandated:
* **STOP**.
* Do NOT migrate Firebase or Firestore data.
* Do NOT delete Firebase users or projects.
* Do NOT perform the 37-user production migration.
* Do NOT remove D5 JIT bridge.
* Do NOT start the final native institutional login cutover until operational Firebase user count reaches zero and a fresh census confirms it.
