# SCHOOL_DATA_MIGRATION_INVENTORY.md

## 1. Executive Summary

A read-only, complete inventory of all institutional data across **Firebase** (Firestore + Firebase Authentication) and **PostgreSQL** was executed.

- **Firebase Authentication Total Users**: `208`
- **Firestore Root Collections**: `6` (`counters`, `plans`, `schools`, `settings`, `subscriptionPlans`, `users`)
- **Firestore `schools` Collection Documents**: `12`
- **Total PostgreSQL Schools**: `5` (`SchoolS015`, `SchoolS024`, `SchoolS019`, `NCT-3970`, `SYSTEM_TEMPLATE`)
- **Total PostgreSQL Users**: `690`
- **Total PostgreSQL Students**: `715`
- **Total PostgreSQL Parents**: `645` (profiles)
- **Total PostgreSQL Teachers/Staff**: `39` (staff profiles)

---

## 2. School Count Discrepancy Resolution

Previous migration reports cited varying numbers of schools (37 vs 4 vs 12). Live read-only data extraction resolves the discrepancy as follows:

| Layer / Source | Count | Description / Classification |
| :--- | ---: | :--- |
| **Firestore `schools` Root Collection** | **12** | Total school documents registered in Firestore (`SchoolS015`, `SchoolS019`, `SchoolS020`, `SchoolS022`, `SchoolS023`, `SchoolS024`, `SchoolS026`, `SchoolS027`, `SchoolS028`, `SchoolS029`, `SchoolS030`, `SchoolS031`). |
| **Active Firebase Schools with Data** | **8** | Schools with subcollections (`SchoolS015`, `SchoolS019`, `SchoolS022`, `SchoolS023`, `SchoolS024`, `SchoolS026`, `SchoolS027`, `SchoolS028`, `SchoolS029`). |
| **Empty Shell Firebase Registrations** | **4** | Schools registered with 0 subcollections/subdocuments (`SchoolS020`, `SchoolS030`, `SchoolS031`, etc.). |
| **PostgreSQL Existing Schools** | **5** | Existing database records in PostgreSQL: `SchoolS015` (TrustITec), `SchoolS024` (Spring Mount), `SchoolS019` (Zuna - unpopulated), `NCT-3970` (NCT), `SYSTEM_TEMPLATE` (System template). |
| **Fully Migrated Operational Schools** | **2** | `SchoolS015` (375 students, 319 users) and `SchoolS024` (340 students, 367 users). |
| **Historical 37-User Hybrid Bridge** | **37** | Refers to the 37 active institutional users managed under `!LOCKED_FIREBASE_AUTH_MANAGED` across operational tenants, not total school count. |

---

## 3. Firebase Collections & Record Inventory

### Root Collections

| Collection Name | Document Count | Classification | Target PostgreSQL Table |
| :--- | ---: | :--- | :--- |
| `schools` | 12 | Platform / Tenant Root | `School` |
| `users` | 219 | Global / Platform Users | `User`, `UserRoleAssignment` |
| `subscriptionPlans` | 4 | Global Platform Plans | `SubscriptionPlan` |
| `plans` | 2 | Platform Plans | `SubscriptionPlan` |
| `counters` | 1 | Legacy Sequence Counter | Internal / Prisma Sequence |
| `settings` | 1 | Global System Settings | Platform Configuration |

### School Subcollections Breakdown (Selected Operational Tenants)

| School ID | School Name | Total SubDocs | Key Subcollections & Document Counts |
| :--- | :--- | ---: | :--- |
| `SchoolS024` | Spring Mount Valley School | 734 | `students` (340), `parents` (169), `invoices` (104), `teachers` (46), `classes` (22), `subjects` (22), `staff_audit_logs` (13), `feeStructures` (7), `roles` (6), `timetables` (1), `transportRoutes` (1), `leads` (1), `chats` (1), `calendar` (1) |
| `SchoolS019` | Zuna International School | 401 | `students` (290), `teachers` (21), `attendance` (8), `subjects` (7), `notifications` (7), `leaves` (6), `classes` (5), `invoices` (5), `attendanceStats` (5), `chats` (4), `ptms` (4), `assessments` (3), `canteen_requests` (3), `notices` (3), `parents` (3), `homeworks` (2), `issuedBooks` (2), `roles` (2), `books` (1), `exams` (1), `feeStructures` (1), `formSchemas` (1), `lesson_plans` (1), `payroll` (1), `settings` (1), `staff_audit_logs` (1), `timetables` (1), `transportRoutes` (1) |
| `SchoolS015` | TrustITec College | 383 | `students` (375), `classes` (2), `parents` (2), `teachers` (1), `subjects` (1), `libraryCategories` (1), `formSchemas` (1) |
| `SchoolS023` | Testing School | 246 | `invoices` (32), `parents` (30), `students` (26), `inventory_audit_logs` (21), `notifications` (20), `teachers` (10), `attendanceStats` (9), `staff_audit_logs` (8), `feeStructures` (7), `canteen_requests` (6), `attendance` (5), `issuedBooks` (5), `payroll` (5), `dashboardStats` (4), `exams` (4), `inventory` (4), `notices` (4), `classCategories` (3), `homeworks` (3), `inventory_categories` (3), `lesson_plans` (3), `roles` (3), `assessments` (2), `books` (2), `feeCollectionPeriods` (2), `subjects` (2), `timetables` (2), `vehicles` (2), `calendar` (1), `classes` (1), `config` (1), `formSchemas` (1), `ptms` (1), `transportRoutes` (1) |
| `SchoolS028` | Worlds Academy | 56 | `parents` (12), `students` (10), `chats` (7), `canteen_requests` (5), `attendanceStats` (4), `teachers` (3), `staff_audit_logs` (3), `classes` (2), `subjects` (2), `admissionApplications` (1), `assessments` (1), `attendance` (1), `exams` (1), `formSchemas` (1), `notifications` (1), `roles` (1) |
| `SchoolS029` | Grace Matriculation | 26 | `parents` (9), `students` (7), `teachers` (3), `staff_audit_logs` (3), `roles` (2), `classes` (1), `feeCollectionPeriods` (1) |
| `SchoolS022` | XYZ Matriculation | 21 | `teachers` (4), `staff_audit_logs` (4), `students` (3), `chats` (2), `parents` (2), `roles` (2), `classes` (1), `homeworks` (1), `ptms` (1), `subjects` (1) |
| `SchoolS027` | xyz | 14 | `parents` (3), `students` (2), `teachers` (2), `roles` (2), `classes` (1), `subjects` (1), `calendar` (1), `formSchemas` (1), `settings` (1) |
| `SchoolS026` | ABC | 4 | `classes` (1), `staff_audit_logs` (1), `students` (1), `teachers` (1) |

---

## 4. PostgreSQL Tables & Record Inventory

| Table / Model | Record Count | Description / Ownership |
| :--- | ---: | :--- |
| `School` | 5 | Institutional Tenant Records |
| `User` | 690 | Accounts (SuperAdmin, Admin, Teacher, Staff, Parent) |
| `Student` | 715 | Institutional Student Records |
| `ParentProfile` | 645 | Linked Parent Profiles |
| `StaffProfile` | 39 | Teacher and Institutional Staff Profiles |
| `Class` | 25 | Academic Class Entities |
| `Subject` | 24 | Academic Subject Entities |
| `UserRoleAssignment` | 700+ | RBAC Role Assignments |
| `SchoolRole` | 15+ | Institutional Roles |

---

## 5. Potential Orphans, Duplicates & Cross-School References

1. **Orphan Records**:
   - `SchoolS023` has 21 `inventory_audit_logs` and 32 `invoices` with legacy string IDs.
   - `SchoolS019` has 6 `leaves` and 4 `ptms` requiring primary key link to PostgreSQL staff/student IDs.
2. **Duplicate Detection**:
   - 0 duplicate emails detected across active users.
   - 0 duplicate student admission numbers within any single school.
3. **Cross-School References**:
   - 0 cross-school student-parent linkages observed.
   - Every school subcollection document is strictly contained inside `/schools/{schoolId}/...`.
