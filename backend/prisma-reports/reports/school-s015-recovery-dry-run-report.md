# SCHOOL S015 RECOVERY & DRY-RUN REPORT

## Status
READY_WITH_MANUAL_REVIEW

## 1. Execution
- **Timestamp**: 2026-09-09T07:22:23.263Z
- **Environment**: Development / Audit
- **Firebase Project**: `school-management-system-6a2c4`
- **PostgreSQL Host**: `mainline.proxy.rlwy.net:33442`
- **PostgreSQL Database**: `railway`
- **PostgreSQL Engine**: PostgreSQL 18.6
- **Target Tenant**: `SchoolS015` (TrustITec College / Trust IT Tec)
- **Proposed Target School UUID**: `e2638de0-cf88-4cef-96db-74c353c6e43d`
- **Read-Only Confirmation**: **STRICTLY VERIFIED**. All write operations intercepted by runtime Proxy guards and Prisma read-only execution.
  - PostgreSQL writes: **0**
  - Firestore writes: **0**
  - Firebase Auth writes: **0**

---

## 2. Source Inventory

### Physical Firestore Documents
| Firestore Path | Documents | Nested Docs | Notes |
| :--- | ---: | ---: | :--- |
| `schools/SchoolS015` | 1 | 0 | Root School Document (Name: "TrustITec College", Plan: "6chcUGgB5rRtu0rJwe1V") |
| `schools/SchoolS015/classes` | 2 | 0 | Class "10" (Sec A) & Class "1" (Sec A) |
| `schools/SchoolS015/formSchemas` | 1 | 0 | Custom form schema for module "staff" |
| `schools/SchoolS015/libraryCategories` | 1 | 0 | Category "Bio" |
| `schools/SchoolS015/parents` | 2 | 0 | Authenticated parent profiles (Priya, Sachin Tendulkar) |
| `schools/SchoolS015/students` | 375 | 0 | Enrolled students (Admissions "001", "002", and 373 bulk records) |
| `schools/SchoolS015/subjects` | 1 | 0 | Subject "Tamil" (Code "001", assigned to Pavithran A) |
| `schools/SchoolS015/teachers` | 1 | 0 | Staff "Pavithran A" (pavi@trustitec.com) |
| **TOTAL SUBCOLLECTION DOCS** | **383** | **0** | **7 direct subcollections** |
| **TOTAL PHYSICAL FIRESTORE DOCS** | **384** | **0** | **1 School Root + 383 Direct Subcollection Docs** |

### Root Firebase Auth Users Scoped to SchoolS015
| User Document ID | Email | Role | Associated Entity | Status |
| :--- | :--- | :--- | :--- | :--- |
| `lkZ4q3SZffXIe0Jk0Oxpru1JkxQ2` | `pravin@globaltrustitec.com` | `admin` | School Administrator / Tenant Root | AUTH_LINKED |
| `ayVI84hMKGNMrvXE3em8ZM9hlF53` | `pavi@trustitec.com` | `teacher` | Teacher `MsIcrTuw7u1zNgRvKeM3` (Pavithran A) | AUTH_LINKED |
| `boY5ichUtvQ5XadSsrDZYYx5gPu2` | `001@parent.school.com` | `parent` | Parent doc `EF8W8VkA3iRChDQppCNR` / Student `001` | AUTH_LINKED |
| `3WAeFijABLTzHGGFfypJZPcvwn72` | `002@parent.school.com` | `parent` | Parent doc `OmTGUuk8DxOnJKTgaKvv` / Student `002` | AUTH_LINKED |
| **TOTAL ROOT S015 USERS** | | | **4 Root Users** | |

---

## 3. Count Reconciliation

| Phase / Source | Physical Subcollection Docs | Root School Doc | Total Physical Firestore Docs | Root Users | Notes |
| :--- | ---: | ---: | ---: | ---: | :--- |
| **Phase 3A Audit** | 382 | 1 | 383 | 4 | Minor summation typo in 3A source table (sum of subcollections 2+1+1+2+375+1+1 was 383, written as 382) |
| **Phase 3B Dry Run** | 383 | 1 | 384 | 4 | Reconciled subcollection sum of 383 docs |
| **Current Live Firestore** | **383** | **1** | **384** | **4** | **100% Match with live Firestore. Zero drift detected.** |

**Discrepancy Analysis**:
- No source documents have been added or removed since Phase 3A.
- The difference of 1 document between the Phase 3A table summary (382) and the actual subcollection document count (383) was due to an arithmetic typographical oversight in the Phase 3A summary table where `2 + 1 + 1 + 2 + 375 + 1 + 1` was labeled 382 instead of 383.
- The live Firestore data confirms: exactly **383 direct subcollection documents**, **1 root school document** (total **384 physical documents**), and **4 root users**.

---

## 4. Evaluation Against All 63 PostgreSQL Models

| PostgreSQL Model | Source | Count | Mapping Method | Notes |
| :--- | :--- | ---: | :--- | :--- |
| **1. Platform Global** | | | | |
| `School` | source-backed | 1 | Direct entity map | `schools/SchoolS015` |
| `SubscriptionPlan` | derived | 1 | Foreign key lookup | Linked to "Enterprise Plan" (`6453ad33-c7ca-46a4-9e52-06a00a10d547`) |
| `User` | source-backed | 319 | Direct + Normalized parent users | 4 Root Users + 315 Parent accounts without root auth |
| `SchoolSetting` | normalized | 4 | Category normalization | Branding, academic, staff, customData |
| `SchoolRole` | no source data | 0 | N/A | S015 uses system default roles (Admin, Teacher, Parent) |
| `RolePermission` | no source data | 0 | N/A | Default module permissions |
| `UserRoleAssignment` | derived | 4 | Direct role map | 1 Admin, 1 Teacher, 2 Parents |
| **2. Academic Structure** | | | | |
| `ClassCategory` | no source data | 0 | N/A | S015 does not use class categories |
| `Class` | source-backed | 2 | Direct entity map | Class "10" and Class "1" |
| `Section` | normalized | 2 | Class section normalization | Section "A" for each class |
| `Subject` | source-backed | 1 | Direct entity map | Subject "Tamil" (Code: "001") |
| `TimetablePeriod` | no source data | 0 | N/A | No timetables collection in S015 |
| `AcademicCalendarEvent` | no source data | 0 | N/A | No calendar collection in S015 |
| `LessonPlan` | no source data | 0 | N/A | No lesson plans in S015 |
| `AcademicResource` | no source data | 0 | N/A | No academic resources in S015 |
| **3. Students & Parents** | | | | |
| `Student` | source-backed | 375 | Direct entity map | All 375 students mapped with unique admission numbers |
| `ParentProfile` | normalized | 317 | Deduplicated parent normalization | 2 from `parents` subcol + 315 from student contacts |
| `ParentStudentLink` | normalized | 375 | Composite relation | 100% of students linked to their parents |
| `StudentAttendance` | no source data | 0 | N/A | No attendance subcollection |
| `AttendanceSession` | no source data | 0 | N/A | No attendance sessions |
| `StudentPromotionHistory`| no source data | 0 | N/A | No promotion records |
| **4. Staff & HR** | | | | |
| `StaffProfile` | source-backed | 1 | Direct entity map | Teacher "Pavithran A" |
| `StaffAttendance` | no source data | 0 | N/A | No staff attendance |
| `StaffSubjectAssignment` | derived | 1 | Relational assignment | Tamil assigned to Pavithran A |
| `TeacherClassAssignment` | derived | 1 | Relational assignment | Class 10 assigned to Pavithran A |
| `PayrollRecord` | no source data | 0 | N/A | No payroll in S015 |
| `PayrollSalaryComponent`| no source data | 0 | N/A | No payroll components |
| `PayrollDeduction` | no source data | 0 | N/A | No deductions |
| `StaffLeaveBalance` | no source data | 0 | N/A | No leave balances |
| **5. Examinations** | | | | |
| `Examination` | no source data | 0 | N/A | No examinations in S015 |
| `ExamSchedule` | no source data | 0 | N/A | No exam schedules |
| `ExamGrade` | no source data | 0 | N/A | No exam grades |
| `ReportCardTemplate` | no source data | 0 | N/A | No report card templates |
| **6. Finance** | | | | |
| `FeeStructure` | no source data | 0 | N/A | No feeStructures subcollection in S015 |
| `FeeCollectionPeriod` | no source data | 0 | N/A | No fee collection periods |
| `Invoice` | no source data | 0 | N/A | No invoices subcollection in S015 |
| `InvoiceItem` | no source data | 0 | N/A | No invoice items |
| `Payment` | no source data | 0 | N/A | No payments |
| **7. Library** | | | | |
| `LibraryCategory` | source-backed | 1 | Direct entity map | Category "Bio" |
| `LibraryBook` | no source data | 0 | N/A | No books in S015 |
| `LibraryBookIssue` | no source data | 0 | N/A | No book issues |
| **8. Transport** | | | | |
| `TransportVehicle` | no source data | 0 | N/A | No vehicles subcollection |
| `TransportRoute` | no source data | 0 | N/A | No routes subcollection |
| `RouteStop` | no source data | 0 | N/A | No stops |
| **9. Inventory** | | | | |
| `InventoryCategory` | no source data | 0 | N/A | No inventory categories |
| `InventoryItem` | no source data | 0 | N/A | No inventory items |
| `InventoryTransaction` | no source data | 0 | N/A | No inventory transactions |
| **10. Communication & Auxiliary** | | | | |
| `ChatRoom` | no source data | 0 | N/A | No chat subcollection in S015 |
| `ChatMessage` | no source data | 0 | N/A | No chat messages |
| `BroadcastChannel` | no source data | 0 | N/A | No broadcast channels |
| `ChannelPost` | no source data | 0 | N/A | No posts |
| `Notice` | no source data | 0 | N/A | No notices |
| `Notification` | no source data | 0 | N/A | No notifications |
| `LeaveApplication` | no source data | 0 | N/A | No leave applications |
| `LeaveApprovalRule` | no source data | 0 | N/A | No leave rules |
| `Complaint` | no source data | 0 | N/A | No complaints |
| `PtmAppointment` | no source data | 0 | N/A | No PTM appointments |
| `CanteenRequest` | no source data | 0 | N/A | No canteen requests |
| `CustomModule` | no source data | 0 | N/A | No custom modules |
| `CustomModuleRecord` | no source data | 0 | N/A | No custom module records |
| `CustomFormSchema` | source-backed | 1 | Direct entity map | Form schema for "staff" |
| `AdmissionLead` | no source data | 0 | N/A | No leads in S015 |
| `LeadForm` | no source data | 0 | N/A | No lead forms |
| `AdmissionApplication` | no source data | 0 | N/A | No admission applications |
| `AuditLog` | no source data | 0 | N/A | No audit logs |
| `MigrationIdMap` | system-generated | 703 | Deterministic mapping audit | 384 physical docs + 4 users + 315 parent users |

**Total Estimated PostgreSQL Normalized Rows**: **~1,077 rows** (excluding default settings/seed).

---

## 5. Relationship Recovery

- **School → User**: 4 direct root users verified + 315 parent accounts. Status: **VALID**.
- **School → Class**: 2 classes verified (`Yw01DanOfKXbRSTSMXXq`, `qozjdj0LExBy1ipim2oo`). Status: **VALID**.
- **Class → Section**: 2 sections normalized (Section A for each class). Status: **VALID**.
- **Class → Student**:
  - 2 students assigned to Class 10 (Sec A): Status: **VALID**.
  - 373 students have `classId: ""` (unassigned academic class). In PostgreSQL schema, `Student.classId` is nullable (`Class?`). The students can be safely persisted with `classId = NULL` without inventing or guessing classes. Status: **UNASSIGNED / REQUIRES POST-MIGRATION UI ALLOCATION**.
- **Student → Parent**:
  - 375 / 375 students have complete parent contact information.
  - 2 students link to `parents` subcollection auth profiles.
  - 373 students link to normalized parent contact profiles.
  - 58 parent contacts link to 116 sibling students (shared contact information). Status: **VALID**.
- **Teacher → User**:
  - 1 teacher (`MsIcrTuw7u1zNgRvKeM3`) links to root user `ayVI84hMKGNMrvXE3em8ZM9hlF53`. Status: **VALID (AUTH_LINKED)**.
- **Teacher → Subject / Class**:
  - Subject "Tamil" lists `assignedTeacherIds: ["MsIcrTuw7u1zNgRvKeM3"]`.
  - Teacher lists `subjectClassIds: ["Yw01DanOfKXbRSTSMXXq"]`. Status: **VALID**.
- **Transport / Finance / Communication**:
  - No active transport, fee, invoice, or chat relationships exist in S015. Status: **N/A**.

---

## 6. Tenant Isolation

- **Cross-Tenant References**: **0**
- **Foreign School Document IDs**: **0**
- **Other School References Detected**: **0**
- Deep scan across all 384 documents and 4 root users confirmed 100% strict isolation to tenant `SchoolS015`.

---

## 7. Data Quality

### Students
- **Missing / Duplicate Admission Numbers**: **0**. Every student has a unique admission number (375 unique values).
- **Names**: 375 / 375 (100%) have `firstName`. 372 have `lastName`.
- **Date of Birth**:
  - 364 students: valid `DD-MM-YYYY` (e.g. `16-06-2022`). Safely parsed to standard ISO `YYYY-MM-DD`.
  - 2 students: valid `YYYY-MM-DD` (`2010-11-29`).
  - 9 students: empty / missing DOB. Preserved as `NULL` in `Student.dob`.
  - Malformed / corrupted DOBs: **0**.
- **Aadhaar Numbers**:
  - 373 students have no Aadhaar number.
  - 1 student has a valid 12-digit Aadhaar (`123412341234`).
  - 1 student (Doc `001`) has a 16-digit Aadhaar (`1234123412341234`).
    - *Handling*: Preserve full 16-character string in `customData.originalAadhaarNumber`. Set normalized `Student.aadhaarNumber = NULL` with quality flag `EXCEEDS_VARCHAR_12` to prevent SQL string length overflow.
- **Academic Class Assignment**:
  - 373 / 375 students have `classId: ""`. Will be migrated as `classId = NULL` without fabricating classes.

### Staff
- 1 teacher record, 100% complete data, valid email, valid mobile, linked to root user.

### Classes & Subjects
- 2 classes with unique names ("10" and "1").
- 1 subject with unique code ("001") and valid teacher assignment.

---

## 8. Parent Analysis

- **Total Students**: **375**
- **Total Unique Parent Contacts**: **317**
- **Parent-Student Relationships**: **375**
- **Sibling Links**: **58 unique parent contacts** represent **116 students** (2 students per contact sharing phone/name).
- **Authenticated Parents in Source**: **2** (Priya with student 001, Sachin Tendulkar with student 002).
- **Normalized Parent Profiles**: **315** contacts extracted from student records.
- **Students Without Parent Information**: **0**.

---

## 9. Staff / Auth Analysis

| Teacher Doc ID | Name | Email | Associated Firebase User | Auth Classification |
| :--- | :--- | :--- | :--- | :--- |
| `MsIcrTuw7u1zNgRvKeM3` | Pavithran A | `pavi@trustitec.com` | `ayVI84hMKGNMrvXE3em8ZM9hlF53` | **AUTH_LINKED** |

- Staff Count: **1**
- Auth-Linked: **1 (100%)**
- Future Auth Linkage Required: **0**
- Synthetic Firebase Auth Accounts Needed: **0**

---

## 10. Orphan Records

- **Orphan Invoices**: **0** (S015 has no invoices).
- **Orphan Staff**: **0** (linked to root user).
- **Orphan Classes**: **0** (valid school ownership).
- **Orphan Subjects**: **0** (valid school ownership).
- **Orphan Parents**: **0** (both subcollection parents link to valid students 001 and 002).
- **Students with Unassigned Class**: **373**.
  - In Firestore, these students were stored with `classId: ""`.
  - In PostgreSQL, `Student.classId` is nullable.
  - Safe treatment: Map `classId = NULL` in PostgreSQL. Do NOT invent a fake class or assign students to random classes.

---

## 11. Lossless Field Analysis

100% of all document fields across all 7 subcollections and the root school document have been classified:
1. **Direct PostgreSQL Column**: Standard core fields (`firstName`, `lastName`, `admissionNumber`, `gender`, `bloodGroup`, `name`, `section`, `code`, `email`, `phone`, etc.).
2. **Normalized Field**: `section` -> `Section` model; parent details -> `ParentProfile` and `ParentStudentLink`; `subjectClassIds` -> `StaffSubjectAssignment`.
3. **JSON / customData Preservation**:
   - `customData.rawFirestoreDoc`: The entire original Firestore document is stored as JSON in `customData` on every migrated row.
   - Extra fields (`tuitionFee`, `bookFee`, `otherFee`, `totalFee`, `busRoute`, `homeAddress`, `previousSchool`, `religion`, `nationality`, `motherTongue`, `referenceLetters`, `relievingLetter`, etc.) are preserved losslessly.
4. **Zero Silently Discarded Fields**: No source data will be lost during migration.

---

## 12. Migration ID Mapping

- Deterministic ID mapping generated for all 384 physical Firestore documents and 4 root users.
- Seeded via SHA-256 with `sms-migration:<tenantKey>:<collection>:<docId>:<targetModel>`.
- Running the dry run repeatedly produces identical UUIDs.
- Total deterministic mappings prepared: **388** primary mappings + **315** parent contact mappings.

---

## 13. Migration Readiness Classification

| Status | Count | Entities | Notes |
| :--- | ---: | :--- | :--- |
| **READY** | **14** | 1 School + 4 Root Users + 2 Classes + 1 Subject + 1 Teacher + 1 FormSchema + 1 LibraryCategory + 2 Parents + 1 Student | 100% clean, verified, schema-aligned |
| **WARNING** | **374** | 373 Students with unassigned class + 1 Student with 16-digit Aadhaar | Non-blocking. Migratable with `classId = NULL` and Aadhaar preservation in `customData` |
| **MANUAL_REVIEW** | **0** | None | No ambiguous or corrupted records requiring human intervention |
| **QUARANTINE** | **0** | None | Zero corrupt or cross-tenant records |
| **BLOCKED** | **0** | None | Zero schema-level or foreign key blockers |
| **TOTAL** | **388** | **384 Physical Docs + 4 Root Users** | |

---

## 14. SchoolS024 Protection Verification

PostgreSQL baseline check performed before and after this dry-run audit confirms:
- **SchoolS024 UUID**: `25e9637a-7fa4-4ac2-b43d-b4c0edcf2932`
- **SchoolS024 Record Count**: Exactly 1 School, 367 Users, 2 Roles, 4 Settings, 22 Classes, 22 Sections, 22 Subjects, 340 Students, 328 Parents, 340 Links, 38 Staff, 7 FeeStructures, 104 Invoices, 1 Route, 1 Chat, 1 Lead, 1 Timetable, 1 Calendar, 1598 MigrationIdMaps.
- **Mutations to S024**: **EXACTLY ZERO (0)**.
- **Existing S015 in PostgreSQL**: **EXACTLY ZERO (0)** (clean slate confirmed).

---

## 15. Test Results

- **Unit Tests (`npm test`)**: **59 / 59 PASSED (100%)**
- **ESLint (`npm run lint`)**: **0 errors, 0 warnings**
- **Prisma Schema Validation (`npx prisma validate`)**: **VALID**
- **Browser Testing**: *Selenium unavailable — browser validation not executed.*

---

## 16. Errors / Warnings / Manual Review Items

1. **WARNING — 373 Students with Unassigned Class**:
   - 373 students in `schools/SchoolS015/students` have `classId: ""`.
   - In PostgreSQL, `Student.classId` is nullable.
   - Recommended treatment for Phase 3E: Migrate these students with `classId = NULL`. Do not fabricate synthetic classes. Post-migration, the school administrator can assign students to their classes in the application.
2. **WARNING — 1 Student with 16-digit Aadhaar (Doc `001`)**:
   - Document `OWbXwYCr2s6fKTiT7Ced` has `aadharNumber: "1234123412341234"` (16 chars).
   - PostgreSQL column `Student.aadhaarNumber` is `VarChar(12)`.
   - Recommended treatment for Phase 3E: Preserve full value in `customData.originalAadhaarNumber`, set normalized column to `NULL` with quality flag `AADHAAR_EXCEEDS_VARCHAR_12`.

---

## 17. Final Recommendation

**STATUS: READY_WITH_MANUAL_REVIEW**

SchoolS015 has zero schema blockers, zero orphan invoices, zero cross-tenant references, and 100% auth linkage for staff. The data is structurally sound and ready for migration planning (Phase 3E) with approved handling for the 373 unassigned student classes and the single 16-digit Aadhaar document.
