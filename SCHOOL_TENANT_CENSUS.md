# SCHOOL_TENANT_CENSUS.md

## 1. Executive Summary

Phase 2 tenant census mapping across all 12 Firebase Firestore school documents and PostgreSQL school UUIDs.

- **Total Firebase School Registrations**: `12`
- **Total PostgreSQL School UUIDs**: `5` (`SchoolS015`, `SchoolS024`, `SchoolS019`, `NCT-3970`, `SYSTEM_TEMPLATE`)
- **Fully Migrated Schools**: `2` (`SchoolS015`, `SchoolS024`)
- **Partially Migrated / Registered Schools**: `1` (`SchoolS019`)
- **Unmigrated Operational Schools**: `6` (`SchoolS022`, `SchoolS023`, `SchoolS026`, `SchoolS027`, `SchoolS028`, `SchoolS029`)
- **Empty Shell Registrations**: `3` (`SchoolS020`, `SchoolS030`, `SchoolS031`)

---

## 2. Institutional Tenant Census Mapping

| Firebase School ID | School Name | PostgreSQL School ID | Firebase Records | PostgreSQL Records | Status |
| :--- | :--- | :--- | ---: | ---: | :--- |
| **`SchoolS015`** | TrustITec College | `e2638de0-cf88-4cef-96db-74c353c6e43d` | 383 | 1,015 | `FULLY_MIGRATED` |
| **`SchoolS024`** | Spring Mount Valley School | `25e9637a-7fa4-4ac2-b43d-b4c0edcf2932` | 734 | 1,117 | `FULLY_MIGRATED` |
| **`SchoolS019`** | Zuna International School | `4e2c7fdf-46c1-4bc7-927f-e3382e8c579d` | 401 | 0 | `PARTIALLY_MIGRATED` / `MIGRATION_REQUIRED` |
| **`SchoolS023`** | Testing School | `UNMAPPED` | 246 | 0 | `NOT_MIGRATED` |
| **`SchoolS028`** | Worlds Academy | `UNMAPPED` | 56 | 0 | `NOT_MIGRATED` |
| **`SchoolS029`** | Grace Matriculation | `UNMAPPED` | 26 | 0 | `NOT_MIGRATED` |
| **`SchoolS022`** | XYZ Matriculation | `UNMAPPED` | 21 | 0 | `NOT_MIGRATED` |
| **`SchoolS027`** | xyz | `UNMAPPED` | 14 | 0 | `NOT_MIGRATED` |
| **`SchoolS026`** | ABC | `UNMAPPED` | 4 | 0 | `NOT_MIGRATED` |
| **`SchoolS020`** | CGS Matriculation | `UNMAPPED` | 0 | 0 | `DEFERRED` (Empty shell) |
| **`SchoolS030`** | Choco academic | `UNMAPPED` | 0 | 0 | `DEFERRED` (Empty shell) |
| **`SchoolS031`** | hihjl | `UNMAPPED` | 0 | 0 | `DEFERRED` (Empty shell) |
| *Native PG* | NCT | `ce65c586-fe9e-4361-a0a9-d71a1dc9c66d` | 0 | 1 (User) | `POSTGRES_ONLY` |
| *Native PG* | System Template | `86e6e8b1-f3be-44fb-9759-268027ec2802` | 0 | 2 (Classes) | `POSTGRES_ONLY` (System Template) |

---

## 3. School Status Definitions & Classification Criteria

1. **`FULLY_MIGRATED`**:
   - Both Firebase and PostgreSQL records exist.
   - Record counts in PostgreSQL equal or exceed Firebase document counts.
   - Example: `SchoolS015` (375 students) and `SchoolS024` (340 students).
2. **`PARTIALLY_MIGRATED`**:
   - School shell record created in PostgreSQL, but entity subcollections (students, staff, classes) have not been migrated yet.
   - Example: `SchoolS019` (Zuna International).
3. **`NOT_MIGRATED`**:
   - Valid operational school data exists in Firestore, but no corresponding PostgreSQL `School` or entity records exist yet.
   - Example: `SchoolS023`, `SchoolS028`, `SchoolS029`, `SchoolS022`, `SchoolS027`, `SchoolS026`.
4. **`DEFERRED`**:
   - Shell registration documents in Firestore with 0 subcollections and 0 operational records.
   - Example: `SchoolS020`, `SchoolS030`, `SchoolS031`.
5. **`POSTGRES_ONLY`**:
   - PostgreSQL records created directly in PostgreSQL without a Firebase counterpart.
   - Example: `NCT-3970` and `SYSTEM_TEMPLATE`.
