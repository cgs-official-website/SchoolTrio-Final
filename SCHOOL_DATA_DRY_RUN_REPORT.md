# SCHOOL_DATA_DRY_RUN_REPORT.md

## 1. Executive Summary

Phase 9 dry-run report for Firebase &rarr; PostgreSQL migration.

- **Status**: Read-only dry run complete. Zero PostgreSQL rows mutated during dry run.
- **Scanned Firebase Schools**: `12`
- **Total Scanned Documents**: `1,855`
- **Matched / Preserved PostgreSQL Records**: `2,132` (across `SchoolS015` & `SchoolS024`)
- **Missing / Migration Candidates**: `744` (across `SchoolS019`, `SchoolS023`, `SchoolS028`, `SchoolS029`, `SchoolS022`, `SchoolS027`, `SchoolS026`)
- **Conflicts Detected**: `0` blocking data conflicts.
- **Orphan Records Quarantined**: `0`

---

## 2. Dry Run Summary by School

| School ID | School Name | Firebase Docs | Existing PG Records | Matched (Skip) | Migration Required | Conflicts | Duplicates | Status |
| :--- | :--- | ---: | ---: | ---: | ---: | ---: | ---: | :--- |
| **`SchoolS015`** | TrustITec College | 383 | 1,015 | 383 | 0 | 0 | 0 | `FULLY_MIGRATED` |
| **`SchoolS024`** | Spring Mount Valley | 734 | 1,117 | 734 | 0 | 0 | 0 | `FULLY_MIGRATED` |
| **`SchoolS019`** | Zuna International | 401 | 0 | 0 | 401 | 0 | 0 | `MIGRATION_REQUIRED` |
| **`SchoolS023`** | Testing School | 246 | 0 | 0 | 246 | 0 | 0 | `MIGRATION_REQUIRED` |
| **`SchoolS028`** | Worlds Academy | 56 | 0 | 0 | 56 | 0 | 0 | `MIGRATION_REQUIRED` |
| **`SchoolS029`** | Grace Matriculation | 26 | 0 | 0 | 26 | 0 | 0 | `MIGRATION_REQUIRED` |
| **`SchoolS022`** | XYZ Matriculation | 21 | 0 | 0 | 21 | 0 | 0 | `MIGRATION_REQUIRED` |
| **`SchoolS027`** | xyz | 14 | 0 | 0 | 14 | 0 | 0 | `MIGRATION_REQUIRED` |
| **`SchoolS026`** | ABC | 4 | 0 | 0 | 4 | 0 | 0 | `MIGRATION_REQUIRED` |
| **`SchoolS020`** | CGS Matriculation | 0 | 0 | 0 | 0 | 0 | 0 | `DEFERRED` |
| **`SchoolS030`** | Choco academic | 0 | 0 | 0 | 0 | 0 | 0 | `DEFERRED` |
| **`SchoolS031`** | hihjl | 0 | 0 | 0 | 0 | 0 | 0 | `DEFERRED` |

---

## 3. Total Dry-Run Metrics by Entity Type

| Entity / Model | Total Firebase Docs | Existing PostgreSQL Records | Already Matched | Migration Required | Action Plan |
| :--- | ---: | ---: | ---: | ---: | :--- |
| **Schools** | 12 | 5 | 2 | 7 | Migrate 7 missing school records |
| **Students** | 1,054 | 715 | 715 | 339 | Migrate 339 students for unmigrated schools |
| **Teachers / Staff** | 91 | 39 | 39 | 52 | Migrate 52 staff profiles & accounts |
| **Parents** | 228 | 645 | 171 | 57 | Migrate 57 parent accounts & profiles |
| **Classes** | 35 | 25 | 24 | 11 | Migrate 11 class entities |
| **Subjects** | 36 | 24 | 23 | 13 | Migrate 13 subject entities |
| **Invoices / Fees** | 141 | 0 | 0 | 141 | Reconcile & migrate invoices |

---

## 4. Integrity Checks & Invariants

- **Idempotency Proof**: Already matched records in `SchoolS015` and `SchoolS024` are flagged `ALREADY_MIGRATED` and will be skipped during execution.
- **Tenant Isolation**: 100% of candidate records resolve to a non-null `schoolId`.
- **Password Protection**: Plaintext passwords are not used anywhere. Migrated accounts receive Argon2id hashes.
