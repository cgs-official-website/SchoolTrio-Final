# SCHOOL_DATA_ROLLBACK_PLAN.md

## 1. Executive Summary

Rollback and disaster recovery strategy for the School Tenant and Authentication Migration phase.

- **Primary Source of Truth & Rollback Anchor**: Live Firebase Firestore and Firebase Authentication remain **100% untouched and intact**.
- **Destructive Firebase Operations Policy**: Zero deletes, zero writes, zero password alterations permitted on Firebase.

---

## 2. Trigger Conditions for Rollback

Rollback procedure is activated immediately if any of the following occur during migration execution:

1. **Transaction Failure**: Unrecoverable error during a school migration transaction.
2. **Tenant Boundary Corruption**: Any record inserted or updated with a missing, null, or mismatched `schoolId`.
3. **Data Loss / Overwrite Violation**: Existing valid PostgreSQL data in `SchoolS015` or `SchoolS024` is accidentally mutated or truncated.
4. **Authentication Failure**: Native REST authentication breaks for existing active accounts.

---

## 3. Rollback Procedures

### Procedure A: Isolated School Rollback (Non-Destructive)

If a specific school migration fails:

1. **Abort Transaction**: Roll back the isolated database transaction for that school batch.
2. **Isolate School Status**: Mark school status as `MIGRATION_FAILED` in logs.
3. **Preserve Operational Schools**: Operational tenants (`SchoolS015`, `SchoolS024`) continue uninterrupted.

---

### Procedure B: Database Point-In-Time Restore (Full System)

If a systemic database corruption occurs:

1. **Stop Application Backend**: Pause API traffic.
2. **Restore PostgreSQL Database**: Restore from pre-migration PostgreSQL backup/snapshot.
3. **Verify Firebase Source**: Re-run read-only preflight check against Firebase to ensure zero data drift.
4. **Resume Application**: Restart backend service under `HYBRID_BRIDGE` mode.

---

## 4. Emergency Contacts & Escalation

- **Database Administrator**: System DevOps
- **Security Lead**: SuperAdmin Security Team
- **Rollback Lead**: Migration Automation Engineer
