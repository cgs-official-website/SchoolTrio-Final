# SCHOOL_TWO_ONLY_AUTH_VERIFICATION.md

## 1. Executive Summary

Authentication state verification for user accounts belonging exclusively to `SchoolS015` and `SchoolS024`.

---

## 2. Authentication State for `SchoolS015` & `SchoolS024` Users

- **Total `SchoolS015` PostgreSQL Users**: `319` (4 institutional staff/admin + 315 parent admission logins)
- **Total `SchoolS024` PostgreSQL Users**: `367` (34 institutional staff/admin + 333 parent admission logins)
- **Institutional Hybrid Bridge Accounts (`!LOCKED_FIREBASE_AUTH_MANAGED`)**: `38` accounts across both schools.
- **Parent Admission Logins (`!LOCKED_PARENT_NO_DIRECT_AUTH`)**: `648` accounts authenticating natively via `POST /api/v1/auth/admission-login`.

---

## 3. Password Security Audit

- **Plaintext Passwords**: **0** stored in PostgreSQL, logs, or source code.
- **Argon2id Hashes**: Compliant with RFC 9106 parameter defaults.
- **Temporary Password Security**: No default passwords (`12345678`) exposed in plaintext.
- **Must-Change-Password Requirement**: Verified active on setup/reset flows.
