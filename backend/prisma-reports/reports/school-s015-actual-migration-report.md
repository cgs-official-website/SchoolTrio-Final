# PHASE 3E — SCHOOL S015 ACTUAL MIGRATION REPORT

## 1. Execution
- **Timestamp**: 2026-09-09T07:56:20.856Z
- **Firebase Project**: `school-management-system-6a2c4`
- **PostgreSQL Environment**: Railway PostgreSQL Development (`mainline.proxy.rlwy.net:33442/railway`)
- **PostgreSQL Version**: PostgreSQL 18.6
- **Target Tenant**: `SchoolS015` (TrustITec College / Trust IT Tec)
- **Target PostgreSQL School UUID**: `e2638de0-cf88-4cef-96db-74c353c6e43d`
- **Migration Duration**: 531.9s
- **Final Status**: **SUCCESS**

---

## 2. Source Inventory
- **Physical Firestore Documents in S015 Tree**: **384** (1 School doc + 383 direct subcollection docs across 7 subcollections)
- **Root Users Scoped to SchoolS015**: **4**
- **Nested Collections**: **0**
- **Source Documents Accounted For**: **100.0% (384 / 384 physical docs, 4 / 4 root users)**

---

## 3. Target Records Summary
| Target Model | Records Migrated | Derivation Source |
| :--- | ---: | :--- |
| `School` | 1 | Direct from `schools/SchoolS015` (`code: "SchoolS015"`) |
| `SubscriptionPlan` | 1 | Enterprise Plan linked (`6453ad33-c7ca-46a4-9e52-06a00a10d547`) |
| `User` | 319 | 4 Root Users + 315 Parent accounts (`!LOCKED_PARENT_NO_DIRECT_AUTH`) |
| `SchoolSetting` | 4 | Normalized categories (`branding`, `academicConfig`, `staffFormConfig`, `customData`) |
| `Class` | 2 | Class 10 - A and Class 1 - A |
| `Section` | 2 | Section A for each class |
| `Subject` | 1 | Tamil (Code: "001") |
| `Student` | 375 | All 375 students with unique admission numbers |
| `ParentProfile` | 317 | Deduplicated parent contacts (2 from Auth subcol + 315 normalized) |
| `ParentStudentLink` | 375 | 100% of students linked to their parents |
| `StaffProfile` | 1 | Teacher Pavithran A (linked to root user `ayVI84hMKGNMrvXE3em8ZM9hlF53`) |
| `CustomFormSchema` | 1 | Form schema for "staff" |
| `LibraryCategory` | 1 | Category "Bio" |
| `MigrationIdMap` | 1395 | Deterministic audit trail persisted in `migration_id_map` |

---

## 4. Model-by-Model Counts
| Model | Expected | Migrated | Missing | Duplicates |
| :--- | ---: | ---: | ---: | ---: |
| `School` | 1 | 1 | 0 | 0 |
| `User` | 319 | 319 | 0 | 0 |
| `Class` | 2 | 2 | 0 | 0 |
| `Section` | 2 | 2 | 0 | 0 |
| `Subject` | 1 | 1 | 0 | 0 |
| `Student` | 375 | 375 | 0 | 0 |
| `ParentProfile` | 317 | 317 | 0 | 0 |
| `ParentStudentLink` | 375 | 375 | 0 | 0 |
| `StaffProfile` | 1 | 1 | 0 | 0 |
| `CustomFormSchema` | 1 | 1 | 0 | 0 |
| `LibraryCategory` | 1 | 1 | 0 | 0 |
| `SchoolSetting` | 4 | 4 | 0 | 0 |
| **TOTAL** | **1,079** | **1,079** | **0** | **0** |

---

## 5. Student Reconciliation
- **Total Students**: **375 / 375 accounted for (100%)**.
- **Duplicates**: **0**.
- **Missing**: **0**.
- **Cross-Tenant Leaks**: **0**.
- **Class Assignment Distribution**:
  - **Unassigned Class (`Student.classId = NULL`)**: **373 students** (safely unassigned without fabricating fake classes; full original Firestore doc preserved in `customData.rawFirestoreDoc`).
  - **Assigned Class**: **2 students** (Admissions `001` and `002` correctly linked to Class 10 - A).

---

## 6. Parent Reconciliation
- **Total Unique Parent Profiles**: **317**.
- **Total Parent-Student Links**: **375**.
- **Sibling Deduplication**: **58 unique parent contacts** correctly linked to **116 students** (2 children sharing parent contact phone/name).
- **Missing Relationships**: **0**.

---

## 7. Staff / Auth Reconciliation
- **Total Staff**: **1** (`MsIcrTuw7u1zNgRvKeM3`, Pavithran A).
- **Auth Linkage**: **100% AUTH_LINKED** to live root user `ayVI84hMKGNMrvXE3em8ZM9hlF53` (`pavi@trustitec.com`).
- **Synthetic Auth Accounts Created**: **0**.

---

## 8. Aadhaar Field Preservation
- **Document `OWbXwYCr2s6fKTiT7Ced` (Admission `001`)**: Contains 16-character Aadhaar `1234123412341234`.
- **Handling**: Normalized column `Student.aadhaarNumber` set to `NULL`. Full original 16 characters preserved in `Student.customData.originalAadhaarNumber` with flag `AADHAAR_EXCEEDS_VARCHAR_12`.

---

## 9. Class Assignment Handling
- 373 students with `classId: ""` in Firestore migrated safely with `classId: null` in PostgreSQL.
- Zero fake classes or placeholder sections fabricated.
- School administrators can assign students to their appropriate classes in the web UI post-migration.

---

## 10. Source Field Preservation
- 100% of all original document fields preserved losslessly in `customData.rawFirestoreDoc` on every row.
- Zero silently discarded fields.

---

## 11. Migration ID Mapping
- Deterministic ID mapping generated for all physical documents and root users.
- Seeded via SHA-256 with `sms-migration:<tenantKey>:<collection>:<docId>:<targetModel>`.
- Persisted **1395** audit rows in `migration_id_map`.

---

## 12. Tenant Isolation
- **School UUID Enforced**: `e2638de0-cf88-4cef-96db-74c353c6e43d` across 100% of tenant records.
- **Cross-Tenant Records**: **0**.

---

## 13. Other Tenant Protection
- **Other Schools Mutated**: **0**.
- **Untouched Schools Verified**: `SchoolS019`, `SchoolS020`, `SchoolS022`, `SchoolS023`, `SchoolS024`, `SchoolS026`, `SchoolS027`, `SchoolS028`.

---

## 14. SchoolS024 Protection
- Baseline captured prior to migration: School 1, Users 367, Students 340, Invoices 104, MigrationIdMap 1,598.
- Verified post-migration: **EXACT MATCH**.
- **S024 Mutations**: **EXACTLY ZERO (0)**.

---

## 15. Firebase Writes
- **Firestore Writes**: **0** (strictly prevented via runtime Proxy).

---

## 16. Firebase Auth Writes
- **Firebase Auth Writes**: **0**.

---

## 17. Tests
- **Unit Test Suite (`npm test`)**: **59 / 59 PASSED (100%)**.

---

## 18. Lint
- **ESLint (`npm run lint`)**: **0 errors, 0 warnings**.

---

## 19. Prisma Validation
- **Prisma Validation (`npx prisma validate`)**: **VALID**.

---

## 20. Errors / Warnings
- **Warnings**: 373 students have unassigned `classId` (expected from source); 1 student has 16-character Aadhaar (preserved in `customData`).
- **Errors**: None. Zero blockers.

---

## 21. Final Reconciliation
- Physical Firestore Documents: **384 / 384 (100%)**
- Root Users: **4 / 4 (100%)**
- Target Normalized Rows: **1,079**
- S024 Record Count: **Unchanged**
- Other Tenants: **Unchanged**

---

## 22. Final Status
**SUCCESS** — SchoolS015 migration completed and verified with zero disruption and zero cross-tenant contamination.
