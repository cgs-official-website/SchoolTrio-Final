# SCHOOL_DATA_RECONCILIATION.md

## 1. Executive Summary

Phase 3 & Phase 12 entity-by-entity data reconciliation between Firebase and PostgreSQL.

- **Objective**: Reconcile existing PostgreSQL data with Firebase source data before and after migration.
- **Rule**: Existing valid PostgreSQL records in `SchoolS015` and `SchoolS024` are strictly preserved without blind overwriting.

---

## 2. Reconciliation Matrix by Entity Category

### A. Fully Migrated Tenants (`SchoolS015` & `SchoolS024`)

| Entity | Firebase Count | PostgreSQL Before | Already Matched | Action | Discrepancy Explanation |
| :--- | ---: | ---: | ---: | :--- | :--- |
| `SchoolS015` Students | 375 | 375 | 375 | **SKIP** | 100% matched via admission number |
| `SchoolS015` Users | 319 | 319 | 319 | **SKIP** | 100% matched via email & admission login |
| `SchoolS015` Staff | 1 | 1 | 1 | **SKIP** | 100% matched |
| `SchoolS024` Students | 340 | 340 | 340 | **SKIP** | 100% matched via admission number |
| `SchoolS024` Users | 367 | 367 | 367 | **SKIP** | 100% matched via email & admission login |
| `SchoolS024` Staff | 38 | 38 | 38 | **SKIP** | 100% matched |

---

### B. Unmigrated / Candidate Tenants (`SchoolS019`, `SchoolS023`, `SchoolS028`, `SchoolS029`, `SchoolS022`, `SchoolS027`, `SchoolS026`)

| School ID | Entity | Firebase Count | PostgreSQL Before | Proposed Action | Target PostgreSQL State |
| :--- | :--- | ---: | ---: | :--- | ---: |
| **`SchoolS019`** | Students | 290 | 0 | `MIGRATE` | 290 |
| **`SchoolS019`** | Teachers/Staff | 21 | 0 | `MIGRATE` | 21 |
| **`SchoolS019`** | Classes | 5 | 0 | `MIGRATE` | 5 |
| **`SchoolS019`** | Subjects | 7 | 0 | `MIGRATE` | 7 |
| **`SchoolS023`** | Students | 26 | 0 | `MIGRATE` | 26 |
| **`SchoolS023`** | Teachers/Staff | 10 | 0 | `MIGRATE` | 10 |
| **`SchoolS023`** | Parents | 30 | 0 | `MIGRATE` | 30 |
| **`SchoolS028`** | Students | 10 | 0 | `MIGRATE` | 10 |
| **`SchoolS028`** | Teachers/Staff | 3 | 0 | `MIGRATE` | 3 |
| **`SchoolS029`** | Students | 7 | 0 | `MIGRATE` | 7 |
| **`SchoolS022`** | Students | 3 | 0 | `MIGRATE` | 3 |
| **`SchoolS027`** | Students | 2 | 0 | `MIGRATE` | 2 |
| **`SchoolS026`** | Students | 1 | 0 | `MIGRATE` | 1 |

---

## 3. Discrepancy & Conflict Resolution Rules

1. **`ALREADY_MIGRATED`**:
   - Primary identifier or business key match (e.g. `admissionNum`, `email`, `employeeId`).
   - Action: **SKIP**. Zero mutation.
2. **`MIGRATION_REQUIRED`**:
   - Valid Firebase document with no matching PostgreSQL record.
   - Action: **INSERT**. Create record with correct `schoolId`.
3. **`PARTIAL_MIGRATION`**:
   - PostgreSQL record exists but lacks non-critical fields.
   - Action: **RECONCILE**. Update missing fields only.
4. **`POSTGRES_ONLY`**:
   - Native PostgreSQL records (`NCT-3970`, `SYSTEM_TEMPLATE`).
   - Action: **PRESERVE**. Do not delete or overwrite.
