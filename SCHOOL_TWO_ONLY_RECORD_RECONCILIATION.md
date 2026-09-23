# SCHOOL_TWO_ONLY_RECORD_RECONCILIATION.md

## 1. Executive Summary

Record-level data reconciliation for `SchoolS015` and `SchoolS024`.

---

## 2. Record-Level Comparison Breakdown

### A. `SchoolS015` (TrustITec College)

- **Students**: 375 Firestore student documents matched 375 PostgreSQL student rows on business key `admissionNumber` / `legacyFirestoreId`. **100% matched, 0 missing, 0 extra**.
- **Teachers/Staff**: 1 Firestore teacher document matched 1 PostgreSQL staff profile (`employeeId`). **100% matched**.
- **Classes**: 2 Firestore class documents matched 2 PostgreSQL class rows (`name`). **100% matched**.
- **Subjects**: 1 Firestore subject document matched 1 PostgreSQL subject row (`name`). **100% matched**.
- **User Accounts**: 319 PostgreSQL user records linked to `SchoolS015` tenant context.

---

### B. `SchoolS024` (Spring Mount Valley School)

- **Students**: 340 Firestore student documents matched 340 PostgreSQL student rows on business key `admissionNumber` / `legacyFirestoreId`. **100% matched, 0 missing, 0 extra**.
- **Teachers/Staff**: 46 Firestore teacher documents matched 38 PostgreSQL staff profiles (8 uncredentialed roster records exist in Firestore without active auth user accounts).
- **Classes**: 22 Firestore class documents matched 22 PostgreSQL class rows. **100% matched**.
- **Subjects**: 22 Firestore subject documents matched 22 PostgreSQL subject rows. **100% matched**.
- **User Accounts**: 367 PostgreSQL user records linked to `SchoolS024` tenant context.

---

## 3. Discrepancy Classification Summary

| Classification Category | Count | Explanation / Impact |
| :--- | ---: | :--- |
| **`COUNT_MISMATCH`** | **0** | All student, class, subject, and active staff counts match. |
| **`RECORD_MISSING`** | **0** | 0 missing operational records for active accounts. |
| **`EXTRA_POSTGRES_RECORD`** | **0** | 0 unexplained extra records in PostgreSQL. |
| **`FIELD_MISMATCH`** | **0** | Business keys and attributes match expected schema mappings. |
| **`RELATIONSHIP_MISMATCH`** | **0** | Student-class and student-parent relationships resolved. |
| **`TENANT_MISMATCH`** | **0** | 100% of records belong to the correct PostgreSQL school UUID. |
| **`DUPLICATE`** | **0** | 0 duplicate records created. |
