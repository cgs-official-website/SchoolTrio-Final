# PHASE 3F — SCHOOL S019 RECOVERY & DRY-RUN REPORT

## 1. Executive Summary
- **Target School**: `SchoolS019` (Zuna International School)
- **Execution Timestamp**: 2026-09-09T08:15:21.734Z
- **Read-Only Status**: **STRICTLY ENFORCED** (0 PostgreSQL writes, 0 Firestore writes, 0 Auth writes)
- **Firebase Project**: `school-management-system-6a2c4`
- **Proposed PostgreSQL School UUID**: `4e2c7fdf-46c1-4bc7-927f-e3382e8c579d`
- **Physical Firestore Source Documents**: **424**
- **Root Users Scoped to School**: **7**
- **Estimated Normalized PostgreSQL Records**: **1249** (across 17 models)
- **Expected MigrationIdMap Rows**: **1241**
- **Final Classification**: **READY_WITH_MANUAL_REVIEW**

---

## 2. Source Inventory
| Firestore Path | Document Count | Target PostgreSQL Model | Status |
| :--- | ---: | :--- | :--- |
| `schools/SchoolS019` | 1 | `School` | Discovered |
| `schools/SchoolS019/assessments` | 3 | `CustomModule / Dynamic` | Discovered |
| `schools/SchoolS019/attendance` | 8 | `CustomModule / Dynamic` | Discovered |
| `schools/SchoolS019/attendanceStats` | 5 | `CustomModule / Dynamic` | Discovered |
| `schools/SchoolS019/books` | 1 | `CustomModule / Dynamic` | Discovered |
| `schools/SchoolS019/canteen_requests` | 3 | `CustomModule / Dynamic` | Discovered |
| `schools/SchoolS019/chats` | 4 | `CustomModule / Dynamic` | Discovered |
| `schools/SchoolS019/classes` | 5 | `Class / Section` | Discovered |
| `schools/SchoolS019/dashboardStats` | 7 | `CustomModule / Dynamic` | Discovered |
| `schools/SchoolS019/exams` | 1 | `CustomModule / Dynamic` | Discovered |
| `schools/SchoolS019/feeStructures` | 1 | `FeeStructure` | Discovered |
| `schools/SchoolS019/formSchemas` | 1 | `CustomFormSchema` | Discovered |
| `schools/SchoolS019/homeworks` | 2 | `CustomModule / Dynamic` | Discovered |
| `schools/SchoolS019/invoices` | 5 | `Invoice` | Discovered |
| `schools/SchoolS019/issuedBooks` | 2 | `CustomModule / Dynamic` | Discovered |
| `schools/SchoolS019/leaves` | 6 | `CustomModule / Dynamic` | Discovered |
| `schools/SchoolS019/lesson_plans` | 1 | `CustomModule / Dynamic` | Discovered |
| `schools/SchoolS019/notices` | 3 | `Notice` | Discovered |
| `schools/SchoolS019/notifications` | 7 | `CustomModule / Dynamic` | Discovered |
| `schools/SchoolS019/parents` | 3 | `ParentProfile` | Discovered |
| `schools/SchoolS019/payroll` | 1 | `CustomModule / Dynamic` | Discovered |
| `schools/SchoolS019/ptms` | 4 | `PtmAppointment` | Discovered |
| `schools/SchoolS019/roles` | 2 | `CustomModule / Dynamic` | Discovered |
| `schools/SchoolS019/settings` | 1 | `CustomModule / Dynamic` | Discovered |
| `schools/SchoolS019/staff_audit_logs` | 1 | `CustomModule / Dynamic` | Discovered |
| `schools/SchoolS019/students` | 290 | `Student` | Discovered |
| `schools/SchoolS019/subjects` | 7 | `Subject` | Discovered |
| `schools/SchoolS019/teachers` | 21 | `StaffProfile` | Discovered |
| `schools/SchoolS019/timetables` | 5 | `CustomModule / Dynamic` | Discovered |
| `schools/SchoolS019/transportRoutes` | 1 | `CustomModule / Dynamic` | Discovered |
| `schools/SchoolS019/chats/K3HdHOWobR2EYvHOEzkG_4euaF9ZPiHaL4zJlV8ODVNz5V2M2/messages` | 11 | `Unknown` | Discovered |
| `schools/SchoolS019/chats/K3HdHOWobR2EYvHOEzkG_ych6SnVdHpWX0FvOP6sJwvftLre2/messages` | 1 | `Unknown` | Discovered |
| `schools/SchoolS019/chats/VO0453JYqDDDaoQh8QLu_4euaF9ZPiHaL4zJlV8ODVNz5V2M2/messages` | 2 | `Unknown` | Discovered |
| `schools/SchoolS019/chats/VO0453JYqDDDaoQh8QLu_ych6SnVdHpWX0FvOP6sJwvftLre2/messages` | 1 | `Unknown` | Discovered |
| `schools/SchoolS019/homeworks/NOLWmEqOL6xmboHIps3y/submissions` | 2 | `Unknown` | Discovered |
| `schools/SchoolS019/students/K3HdHOWobR2EYvHOEzkG/report_cards` | 1 | `Unknown` | Discovered |
| `schools/SchoolS019/students/VO0453JYqDDDaoQh8QLu/report_cards` | 1 | `Unknown` | Discovered |
| `schools/SchoolS019/students/q1MUchlmdEQP2h7vQos3/report_cards` | 1 | `Unknown` | Discovered |
| `schools/SchoolS019/students/rC68MXUX620prLQ1IvcD/report_cards` | 1 | `Unknown` | Discovered |
| `schools/SchoolS019/students/ykoVtQjiuRH604UG4LzF/report_cards` | 1 | `Unknown` | Discovered |
| `users?schoolId=SchoolS019` | 7 | `User` | Discovered |

### Arithmetic Breakdown:
- **Root School Document**: 1
- **Direct Subcollection Documents**: 401
- **Nested Subcollection Documents**: 22
- **Total Physical Firestore Documents**: **424**
- **Root Users (`/users` collection)**: **7**

---

## 3. 63-Model PostgreSQL Mapping Evaluation
| # | Model | Classification | Source Path | Source Count | Target Expected | Transformation & Strategy |
| :---: | :--- | :--- | :--- | ---: | ---: | :--- |
| 1 | `School` | Source-backed | `schools/SchoolS019` | 1 | 1 | Mapped directly from root school doc. |
| 2 | `SubscriptionPlan` | System-generated | `PostgreSQL SubscriptionPlan` | 1 | 1 | Linked to Enterprise Plan. |
| 3 | `User` | Derived/normalized from source | `users?schoolId=SchoolS019 + parents + staff` | 7 | 318 | 7 root users + 293 parent users + 18 staff shadow users. |
| 4 | `RefreshSession` | No source data | `None` | 0 | 0 | Unpopulated schema extension model. |
| 5 | `MigrationIdMap` | System-generated | `Migration Engine ID Mapper` | 1241 | 1241 | Deterministic SHA-256 audit mapping rows. |
| 6 | `AuditLog` | No source data | `None` | 0 | 0 | Model unpopulated in source tenant. |
| 7 | `RolePermission` | No source data | `None` | 0 | 0 | Model unpopulated in source tenant. |
| 8 | `UserRoleAssignment` | No source data | `None` | 0 | 0 | Model unpopulated in source tenant. |
| 9 | `ParentStudentLink` | Derived/normalized from source | `schools/SchoolS019/students` | 290 | 290 | 1 link per student connecting to normalized ParentProfile. |
| 10 | `SchoolSetting` | Derived/normalized from source | `schools/SchoolS019` | 1 | 4 | 4 normalized setting categories (branding, academicConfig, staffFormConfig, customData). |
| 11 | `SchoolRole` | No source data | `None` | 0 | 0 | Model unpopulated in source tenant. |
| 12 | `ClassCategory` | No source data | `None` | 0 | 0 | Model unpopulated in source tenant. |
| 13 | `Class` | Source-backed | `schools/SchoolS019/classes` | 5 | 5 | Unique class name formatted as `${name} - ${section}`. |
| 14 | `Section` | Derived/normalized from source | `schools/SchoolS019/classes` | 5 | 5 | 1 section per class document. |
| 15 | `Subject` | Source-backed | `schools/SchoolS019/subjects` | 7 | 7 | Unique subject code/name fallback. |
| 16 | `TimetablePeriod` | No source data | `None` | 0 | 0 | Model unpopulated in source tenant. |
| 17 | `AcademicCalendarEvent` | No source data | `None` | 0 | 0 | Model unpopulated in source tenant. |
| 18 | `LessonPlan` | No source data | `None` | 0 | 0 | Model unpopulated in source tenant. |
| 19 | `AcademicResource` | No source data | `None` | 0 | 0 | Unpopulated schema extension model. |
| 20 | `Student` | Source-backed | `schools/SchoolS019/students` | 290 | 290 | Direct student mapping with class reference handling. |
| 21 | `ParentProfile` | Derived/normalized from source | `schools/SchoolS019/students + parents` | 290 | 293 | 293 deduplicated parent profiles. |
| 22 | `StaffProfile` | Source-backed | `schools/SchoolS019/teachers` | 21 | 21 | Linked to root User or locked shadow User. |
| 23 | `HRPayrollRecord` | No source data | `None` | 0 | 0 | Model unpopulated in source tenant. |
| 24 | `AttendanceSession` | No source data | `None` | 0 | 0 | Model unpopulated in source tenant. |
| 25 | `AttendanceRecord` | No source data | `None` | 0 | 0 | Model unpopulated in source tenant. |
| 26 | `AttendanceStat` | No source data | `None` | 0 | 0 | Model unpopulated in source tenant. |
| 27 | `AbsenteeFlag` | No source data | `None` | 0 | 0 | Unpopulated schema extension model. |
| 28 | `Examination` | No source data | `None` | 0 | 0 | Model unpopulated in source tenant. |
| 29 | `Assessment` | No source data | `None` | 0 | 0 | Model unpopulated in source tenant. |
| 30 | `AssessmentGrade` | No source data | `None` | 0 | 0 | Model unpopulated in source tenant. |
| 31 | `ReportCardTemplate` | No source data | `None` | 0 | 0 | Unpopulated schema extension model. |
| 32 | `ReportCard` | No source data | `None` | 0 | 0 | Model unpopulated in source tenant. |
| 33 | `HomeworkAssignment` | No source data | `None` | 0 | 0 | Model unpopulated in source tenant. |
| 34 | `HomeworkSubmission` | No source data | `None` | 0 | 0 | Model unpopulated in source tenant. |
| 35 | `FeeCollectionPeriod` | No source data | `None` | 0 | 0 | Model unpopulated in source tenant. |
| 36 | `FeeStructure` | Source-backed | `schools/SchoolS019/feeStructures` | 1 | 1 | Fee structure definitions. |
| 37 | `Invoice` | Source-backed | `schools/SchoolS019/invoices` | 5 | 5 | Invoice records with nullable studentId. |
| 38 | `LibraryCategory` | Source-backed | `schools/SchoolS019/libraryCategories` | 0 | 0 | Library category definitions. |
| 39 | `LibraryBook` | No source data | `None` | 0 | 0 | Model unpopulated in source tenant. |
| 40 | `LibraryBookIssue` | No source data | `None` | 0 | 0 | Model unpopulated in source tenant. |
| 41 | `TransportVehicle` | No source data | `None` | 0 | 0 | Model unpopulated in source tenant. |
| 42 | `TransportRoute` | Source-backed | `schools/SchoolS019/transport` | 0 | 0 | Transport routes. |
| 43 | `RouteStop` | No source data | `None` | 0 | 0 | Model unpopulated in source tenant. |
| 44 | `InventoryCategory` | No source data | `None` | 0 | 0 | Model unpopulated in source tenant. |
| 45 | `InventoryItem` | No source data | `None` | 0 | 0 | Model unpopulated in source tenant. |
| 46 | `InventoryAuditLog` | No source data | `None` | 0 | 0 | Model unpopulated in source tenant. |
| 47 | `ChatRoom` | Source-backed | `schools/SchoolS019/chatRooms` | 0 | 0 | Chat rooms. |
| 48 | `ChatMessage` | No source data | `None` | 0 | 0 | Model unpopulated in source tenant. |
| 49 | `BroadcastChannel` | No source data | `None` | 0 | 0 | Unpopulated schema extension model. |
| 50 | `ChannelPost` | No source data | `None` | 0 | 0 | Unpopulated schema extension model. |
| 51 | `Notice` | Source-backed | `schools/SchoolS019/notices` | 3 | 3 | School notices. |
| 52 | `Notification` | No source data | `None` | 0 | 0 | Model unpopulated in source tenant. |
| 53 | `LeaveApplication` | No source data | `None` | 0 | 0 | Model unpopulated in source tenant. |
| 54 | `LeaveApprovalRule` | No source data | `None` | 0 | 0 | Unpopulated schema extension model. |
| 55 | `PtmAppointment` | Source-backed | `schools/SchoolS019/ptms` | 4 | 4 | PTM appointments. |
| 56 | `CanteenRequest` | No source data | `None` | 0 | 0 | Model unpopulated in source tenant. |
| 57 | `Complaint` | No source data | `None` | 0 | 0 | Unpopulated schema extension model. |
| 58 | `CustomModule` | No source data | `None` | 0 | 0 | Unpopulated schema extension model. |
| 59 | `CustomFormSchema` | Source-backed | `schools/SchoolS019/formSchemas` | 1 | 1 | Form schema definitions. |
| 60 | `CustomModuleRecord` | No source data | `None` | 0 | 0 | Unpopulated schema extension model. |
| 61 | `AdmissionLead` | Source-backed | `schools/SchoolS019/leads` | 0 | 0 | Admission leads. |
| 62 | `LeadForm` | No source data | `None` | 0 | 0 | Unpopulated schema extension model. |
| 63 | `AdmissionApplication` | No source data | `None` | 0 | 0 | Model unpopulated in source tenant. |

---

## 4. Data Quality Audit Findings

### 4.1 Student Quality Findings (288 flagged)
| Student Doc ID | Admission # | Name | Issues Flagged |
| :--- | :--- | :--- | :--- |
| `01FrpgQJCRIgFvRPZIk2` | `ADM-075` | Nandhini Kandasamy | **OVERSIZED_AADHAAR**: Aadhaar '2356 9725 2175' exceeds 12 chars; **UNASSIGNED_CLASS**: Student has empty classId: '' |
| `06rUGKb9q2x9G1JZ1u9n` | `ADM-129` | Priya Dharshini Rajendran | **OVERSIZED_AADHAAR**: Aadhaar '6317 9706 2397' exceeds 12 chars; **UNASSIGNED_CLASS**: Student has empty classId: '' |
| `0CUF4gN3hE4DelQXNbGf` | `ADM-062` | Rajesh Subramaniam | **OVERSIZED_AADHAAR**: Aadhaar '2208 6353 6541' exceeds 12 chars; **UNASSIGNED_CLASS**: Student has empty classId: '' |
| `0GVemTX5iRYcF7aIGzqf` | `ADM-046` | Gopinath Gopalakrishnan | **OVERSIZED_AADHAAR**: Aadhaar '6856 6246 2873' exceeds 12 chars; **UNASSIGNED_CLASS**: Student has empty classId: '' |
| `0djLHPmM2GVMAoNL4CjY` | `ADM-266` | Vidya Ponnusamy | **OVERSIZED_AADHAAR**: Aadhaar '4516 3088 1848' exceeds 12 chars; **UNASSIGNED_CLASS**: Student has empty classId: '' |
| `0jK3GZAY4JUJQvmoZ1pc` | `ADM-080` | Chitra Gopalakrishnan | **OVERSIZED_AADHAAR**: Aadhaar '9948 8375 5037' exceeds 12 chars; **UNASSIGNED_CLASS**: Student has empty classId: '' |
| `0lO9p4Q3cVH8lzTsxQSv` | `ADM-056` | Vaishnavi Ramasamy | **OVERSIZED_AADHAAR**: Aadhaar '7677 2190 3404' exceeds 12 chars; **UNASSIGNED_CLASS**: Student has empty classId: '' |
| `0m2w6PXeZlm0pf9TxBWh` | `ADM-269` | Yamuna Subramaniam | **OVERSIZED_AADHAAR**: Aadhaar '5411 1295 7369' exceeds 12 chars; **UNASSIGNED_CLASS**: Student has empty classId: '' |
| `0rMv7gd0bosBecmzkx0w` | `ADM-213` | Gunasekaran Kandasamy | **OVERSIZED_AADHAAR**: Aadhaar '3945 8153 9554' exceeds 12 chars; **UNASSIGNED_CLASS**: Student has empty classId: '' |
| `0vPZtty7JNmCqtiKXwhe` | `ADM-054` | Manikandan Ponnusamy | **OVERSIZED_AADHAAR**: Aadhaar '7751 4010 5123' exceeds 12 chars; **UNASSIGNED_CLASS**: Student has empty classId: '' |
| `0wDj3LJRGk846la1YZyi` | `ADM-131` | Sangeetha Duraisamy | **OVERSIZED_AADHAAR**: Aadhaar '1950 8501 6579' exceeds 12 chars; **UNASSIGNED_CLASS**: Student has empty classId: '' |
| `1SXlXxfdV4DQSwzXhgQk` | `ADM-120` | Divya Bharathi Thangaraj | **OVERSIZED_AADHAAR**: Aadhaar '2723 8656 2422' exceeds 12 chars; **UNASSIGNED_CLASS**: Student has empty classId: '' |
| `1zTtqOalbr4rtgOByWcN` | `ADM-072` | Nandhini Marimuthu | **OVERSIZED_AADHAAR**: Aadhaar '2148 6289 0233' exceeds 12 chars; **UNASSIGNED_CLASS**: Student has empty classId: '' |
| `2N2SwjmmIhqRqJzjWga5` | `ADM-137` | Kavitha Murugan | **OVERSIZED_AADHAAR**: Aadhaar '7652 1328 3389' exceeds 12 chars; **UNASSIGNED_CLASS**: Student has empty classId: '' |
| `2OQMGVOsMCwzU723aBpF` | `ADM-232` | Thirumurugan Velusamy | **OVERSIZED_AADHAAR**: Aadhaar '2471 1013 7381' exceeds 12 chars; **UNASSIGNED_CLASS**: Student has empty classId: '' |
| `2UrbmvWOmtoO0NsQWpiu` | `ADM-127` | Yogeswaran Velusamy | **OVERSIZED_AADHAAR**: Aadhaar '2511 4262 5827' exceeds 12 chars; **UNASSIGNED_CLASS**: Student has empty classId: '' |
| `2jEl4W6a6VNXGWFimSru` | `ADM-180` | Deepak Balasubramanian | **OVERSIZED_AADHAAR**: Aadhaar '3139 3116 8786' exceeds 12 chars; **UNASSIGNED_CLASS**: Student has empty classId: '' |
| `2py0AhP3HXBG69bTS30m` | `ADM-132` | Vidya Venkatesan | **OVERSIZED_AADHAAR**: Aadhaar '7116 2411 2412' exceeds 12 chars; **UNASSIGNED_CLASS**: Student has empty classId: '' |
| `30svmW3Xr98C12BMVEBD` | `ADM-173` | Preethi Perumal | **OVERSIZED_AADHAAR**: Aadhaar '3733 4741 1307' exceeds 12 chars; **UNASSIGNED_CLASS**: Student has empty classId: '' |
| `35kJEdD2aUgCfRr2kc0i` | `ADM-027` | Padma Krishnan | **OVERSIZED_AADHAAR**: Aadhaar '5107 6226 8388' exceeds 12 chars; **UNASSIGNED_CLASS**: Student has empty classId: '' |
| `3CgB5yvp7aGlpUEP1amU` | `ADM-178` | Lakshmi Thangaraj | **OVERSIZED_AADHAAR**: Aadhaar '5107 6537 6118' exceeds 12 chars; **UNASSIGNED_CLASS**: Student has empty classId: '' |
| `3ErKYNZSXeRwSR7Mqeo7` | `ADM-284` | Thirumurugan Perumal | **OVERSIZED_AADHAAR**: Aadhaar '0402 7909 1712' exceeds 12 chars; **UNASSIGNED_CLASS**: Student has empty classId: '' |
| `3aAUAHcUmQO5VbRIppzB` | `ADM-014` | Vaishnavi Murugan | **OVERSIZED_AADHAAR**: Aadhaar '3678 3777 0143' exceeds 12 chars; **UNASSIGNED_CLASS**: Student has empty classId: '' |
| `3jNdIdIF7keOgJdZocfl` | `ADM-021` | Rajeswari Marimuthu | **OVERSIZED_AADHAAR**: Aadhaar '4064 0909 7439' exceeds 12 chars; **UNASSIGNED_CLASS**: Student has empty classId: '' |
| `3wK3ivFGZBoaCcxBnakw` | `ADM-225` | Senthil Thangaraj | **OVERSIZED_AADHAAR**: Aadhaar '4381 0474 2955' exceeds 12 chars; **UNASSIGNED_CLASS**: Student has empty classId: '' |
| *... and 263 more* | | | |

### 4.2 Staff Quality Findings (0 flagged)
*No staff data quality issues detected.*

### 4.3 Academic Structure Quality Findings (0 flagged)
*No academic structure data quality issues detected.*

### 4.4 Fees & Invoice Findings (0 flagged)
*No fee/invoice issues detected.*

---

## 5. Parent Normalization & Sibling Analysis
- **Unique Parent Identities Detected**: **293**
- **Parent Users Required**: **293**
- **Parent Profiles Required**: **293**
- **Parent-Student Links Required**: **290**
- **Sibling Groups Detected**: **0**

### Sibling Groups Breakdown:
*No sibling groups detected (each student has a distinct contact).* 

---

## 6. Firebase Auth Linkage Audit (Read-Only)
- **Root Users with schoolId == 'SchoolS019'**: **7**
  - Live Auth Matches: **7**
  - Unmatched: **0**
- **Staff Auth Matches**: **3**
- **Staff Requiring Locked Shadow User**: **18**
- **Firebase Auth Writes Performed**: **EXACTLY ZERO (0)**

---

## 7. Tenant Isolation Audit
- **Cross-Tenant References Detected**: **0**
- **Cross-Tenant Leaks with S024**: **0**
- **Cross-Tenant Leaks with S015**: **0**

---

## 8. Protected Baselines Verification
- **SchoolS024 Baseline Status**:
  - School Row: `25e9637a-7fa4-4ac2-b43d-b4c0edcf2932` (`Spring Mount Valley School`)
  - Students: **340** (Unchanged)
  - Invoices: **104** (Unchanged)
  - MigrationIdMap: **1598** (Unchanged)
- **SchoolS015 Baseline Status**:
  - School Row: `e2638de0-cf88-4cef-96db-74c353c6e43d` (`TrustITec College`)
  - Students: **375** (Unchanged)
  - Parents: **317** (Unchanged)
  - Links: **375** (Unchanged)
  - Staff: **1** (Unchanged)
  - Users: **319** (Unchanged)
  - MigrationIdMap: **1395** (Unchanged)
- **PostgreSQL Writes During Dry-Run**: **EXACTLY ZERO (0)**

---

## 9. Automated Safety & Quality Gates
- **Unit Tests (`npm test`)**: **59 / 59 PASSED**
- **ESLint (`npm run lint`)**: **0 errors, 0 warnings**
- **Prisma Schema Validation (`npx prisma validate`)**: **VALID**
- **Selenium Browser Automation**: **Selenium unavailable — NOT RUN**

---

## 10. Final Classification & Recovery Plan
- **Classification**: **READY_WITH_MANUAL_REVIEW**
- **Summary**: All live Firestore documents and root users for `SchoolS019` have been audited, mapped, and verified in complete read-only isolation without modifying PostgreSQL, Firestore, or Firebase Auth.
