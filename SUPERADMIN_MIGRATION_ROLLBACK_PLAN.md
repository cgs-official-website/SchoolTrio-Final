# SUPERADMIN MIGRATION ROLLBACK PLAN

## OVERVIEW

This document outlines the safety procedures and rollback steps for the SuperAdmin authentication and platform data migration phase.

---

## SAFETY INVARIANTS

1. **Firebase Source Protection**: Zero write or delete operations will be performed on Firebase Auth, Firestore, or Firebase Storage during this migration.
2. **Side-by-Side Preservation**: Firebase user records and Firestore documents remain completely intact in their original state.
3. **Reversibility**: If any unexpected issue occurs during the SuperAdmin REST transition, the SuperAdmin can instantly revert to the D5 JIT exchange auth path without data loss.

---

## ROLLBACK PROCEDURES

### Scenario A: SuperAdmin REST Login Failure

If the PostgreSQL SuperAdmin user fails native REST login via `POST /api/v1/auth/login`:
1. Verify the `password_hash` in PostgreSQL `users` table is valid Argon2id.
2. Re-run `superadmin.service.js` seed or setup routine to generate a fresh password hash.
3. Fallback: The SuperAdmin account can log in via Firebase Auth and perform D5 JIT exchange (`POST /api/v1/auth/firebase-exchange`), which automatically synchronizes and updates the PostgreSQL session.

### Scenario B: Database Mutation Reversion

If SuperAdmin platform data records in PostgreSQL require rollback:
1. All created records retain `legacy_firestore_id` references for 100% trace identification.
2. Migrated SuperAdmin records can be soft-deactivated or removed using targeted SQL queries matching `legacy_firestore_id IS NOT NULL`.
3. Firebase source data remains unmodified and available for immediate re-syncing.

---

## VERIFICATION CHECKLIST BEFORE COMMIT

- [x] Firebase Firestore writes: 0
- [x] Firebase Firestore deletes: 0
- [x] Firebase project configuration modifications: 0
- [x] PostgreSQL SuperAdmin user created with valid Argon2id hash
- [x] `SUPER_ADMIN` system role assigned with `schoolId = NULL`
- [x] Native REST endpoints (`POST /api/v1/auth/login` and `GET /api/v1/auth/me`) return `200 OK` for SuperAdmin
