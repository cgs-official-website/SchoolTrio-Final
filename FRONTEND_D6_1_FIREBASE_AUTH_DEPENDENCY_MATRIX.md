# FRONTEND D6.1 — FIREBASE AUTH DEPENDENCY MATRIX

## OVERVIEW

This document presents the verified repository-wide matrix of all Firebase Authentication references as of **Phase D6.1 — Backend-First Auth Preparation & Firebase Auth Decoupling**.

Every reference is classified by its current location, active execution status, functional purpose, planned REST replacement, and target action.

---

## DEPENDENCY MATRIX

| Firebase Reference | Location | Active? | Purpose | Replacement | Action |
| :--- | :--- | :---: | :--- | :--- | :--- |
| `signInWithEmailAndPassword` | `AuthContext.jsx` (`_hybridBridgeLogin`) | **YES** | HYBRID_BRIDGE institutional login for remaining 37 Firebase-managed users | `authApi.login` (`_nativeInstitutionalLogin`) | **WAIT FOR GATE** (37 accounts remaining) |
| `getIdToken` | `AuthContext.jsx` (`_hybridBridgeLogin`) | **YES** | Obtains ID token for D5 JIT token exchange | Native JWT from `POST /api/v1/auth/login` | **WAIT FOR GATE** (37 accounts remaining) |
| `firebaseExchange` | `AuthContext.jsx` / `backend/src/controllers/auth.controller.js` | **YES** | D5 JIT migration bridge (`POST /api/v1/auth/firebase-exchange`) | Direct `POST /api/v1/auth/login` | **WAIT FOR GATE** (37 accounts remaining) |
| `signOut` | `AuthContext.jsx` (`logoutUser`) | **YES** | Cleans up legacy Firebase client session alongside REST logout | REST `authApi.logout` | **WAIT FOR GATE** (37 accounts remaining) |
| `onAuthStateChanged` | `AuthContext.jsx` | **NO** | Legacy Firebase auth state listener | None (REST `/me` session restoration authority) | **REMOVED** (Cleaned in D6.1) |
| `loginUser` | `firebase/auth.js` | **NO** | Legacy email login helper | `authApi.login` | **REMOVED** (Cleaned in D6.1) |
| `loginWithAdmissionNumber` | `firebase/auth.js` | **NO** | Legacy parent admission login helper | `authApi.admissionLogin` | **REMOVED** (Cleaned in D6.1) |
| `registerUser` | `firebase/auth.js` | **NO** | Legacy Firestore user registration helper | REST registration API | **REMOVED** (Cleaned in D6.1) |
| `getUserProfile` | `firebase/auth.js` | **NO** | Legacy Firestore user profile fetcher | `authApi.getMe` | **REMOVED** (Cleaned in D6.1) |
| `resetPassword` | `firebase/auth.js` | **NO** | Legacy Firebase password reset email helper | REST `authApi.passwordResetRequest` | **REMOVED** (Cleaned in D6.1) |
| `logoutUser` | `firebase/auth.js` | **NO** | Direct Firebase logout export | `useAuth().logoutUser` | **REMOVED** (Cleaned in D6.1) |
| Support Tickets | `SupportTickets.jsx` | **YES** | Isolated ticket management system (`zuna-landing-page-22564`) | Deferred future migration | **PRESERVE** (Out of scope) |
| Firebase Storage | `services/cloudinary.js` / `firebase/config.js` | **YES** | Document upload fallback when Cloudinary fails | Cloudinary / S3 | **PRESERVE** (Out of scope) |

---

## VERIFICATION SUMMARY

1. **Active Institutional Login Path**: RETAINED via `_hybridBridgeLogin` in `AuthContext.jsx`. Continues servicing 37 Firebase-managed accounts via D5 JIT bridge (`POST /api/v1/auth/firebase-exchange`).
2. **Native REST Path**: Isolated in `_nativeInstitutionalLogin` in `AuthContext.jsx`. Ready for 1-line activation once gate reaches 0.
3. **Dead Code Removed**: 6 functions (`registerUser`, `loginUser`, `loginWithAdmissionNumber`, `getUserProfile`, `resetPassword`, `logoutUser`) removed from `firebase/auth.js`. `onAuthStateChanged` removed from `AuthContext.jsx`.
4. **Dashboard Logouts**: 100% of dashboard pages use `useAuth().logoutUser`. Zero direct imports of Firebase `logoutUser`.
5. **Session Restoration**: 100% REST-based via `authApi.getMe` and `authApi.refreshSession`. Zero Firebase calls during app startup or session restoration.
6. **Firebase Mutations**: **0** mutations to Firebase Auth, Firestore, Storage, or project configuration.
