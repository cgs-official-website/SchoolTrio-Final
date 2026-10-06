# GLOBAL BULK IMPORT, TEMPLATE & DATA MAPPING FORENSIC AUDIT

**Document ID**: `GLOBAL_BULK_IMPORT_TEMPLATE_AND_DATA_MAPPING_AUDIT.md`  
**Date**: 2026-10-06  
**Scope**: Project-Wide Forensic Audit of Every Bulk Import, Template, Parser, API Contract & Database Persistence Flow  
**Audit Type**: Read-Only Forensic Architecture & Data Integrity Audit  
**Final Status**: **AUDIT COMPLETE — REMEDIATION REQUIRED**

---

## 1. Executive Summary

A comprehensive, repository-wide forensic audit was conducted across all frontend components, backend controllers, services, repositories, schemas, and PostgreSQL database models to examine the health, integrity, completeness, and safety of bulk import functionality in the School Management System.

### Key Audit Metrics
- **Total Bulk Import / Upsert Mechanisms Discovered**: **7**
- **Bulk Imports with Downloadable Templates**: **4 / 7** (Students, Staff, Classes, Inventory)
- **Bulk Imports Missing Downloadable Templates**: **3 / 7** (Homework Evaluations, Assessment Grades, Subjects has template in Admin but lacks advanced metadata)
- **Imports with Template-to-Backend Column Discrepancies**: **2 / 7** (Students, Staff)
- **Imports with Silent Field Loss / Mismapping**: **2** (Student `rollNumber` and `transportRouteId` / `pickupStopId`)
- **Imports with Tenant Isolation / RBAC Violations**: **0 / 7** (All bulk endpoints enforce tenant middleware and authenticated RBAC)

---

## 2. Complete Bulk Import Inventory

| # | Module | Submodule | Frontend Component | Backend Route | Controller & Service | Primary Prisma Model(s) | Template Status |
| :- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **Students** | Student Directory | `StudentManagement.jsx` | `POST /api/v1/students/bulk-import` | `student.controller.js` → `student.service.js` | `Student`, `Invoice`, `Parent` | **INCOMPLETE TEMPLATE** (Missing 14 supported columns including Class/Section) |
| 2 | **Staff** | Staff Directory | `StaffAssignment.jsx` | `POST /api/v1/staff/bulk-import` | `staff.controller.js` → `staff.service.js` | `User`, `StaffProfile`, `Role`, `Class` | **INCOMPLETE TEMPLATE** (Missing Assigned Class, Role, Staff Type) |
| 3 | **Classes & Sections** | Class Management | `ClassManagement.jsx` | `POST /api/v1/classes/bulk-import` | `class.controller.js` → `class.service.js` | `Class`, `Section`, `ClassCategory` | **TEMPLATE PASS** (3 columns: Class Name, Section, Category) |
| 4 | **Subjects** | Subject Management | `SubjectManagement.jsx` | `POST /api/v1/subjects/bulk-import` | `subject.controller.js` → `subject.service.js` | `Subject` | **TEMPLATE PASS** (2 columns: Subject Name, Subject Code) |
| 5 | **Inventory** | Items & Stock | `InventoryManagement.jsx` | `POST /api/v1/inventory/items/bulk-import` | `inventory.controller.js` → `inventory.service.js` | `InventoryItem`, `InventoryCategory`, `InventoryAudit` | **TEMPLATE PASS** (XLSX & CSV: ID Number, Product Name, Category, Initial Stock) |
| 6 | **Homework** | Submissions & Evaluations | `HomeworkManagement.jsx` | Sequential `updateSubmission` calls | `homework.controller.js` → `homework.service.js` | `HomeworkSubmission` | **MISSING TEMPLATE** (Modal has text explanation but no download button) |
| 7 | **Assessments** | Examination Marks | `Teacher/Grades.jsx`, `ExamManagement.jsx` | `POST /api/v1/assessments/:id/grades/bulk` | `assessment-grade.controller.js` → `assessment-grade.service.js` | `AssessmentGrade` | **API-ONLY BULK UPSERT** (Grid-based bulk upsert; no file upload template) |

---

## 3. Template Inventory & Discrepancies

### A. Student Import Template (`StudentManagement.jsx`)
- **Current Template Headers (15 columns)**:
  `['Full Name', 'Admission Number', 'Date of Birth', 'Gender', 'Blood Group', 'Nationality', 'Religion', 'Aadhar Number', 'Home Address', 'Parent/Guardian Name', 'Parent Phone', 'Parent Email', 'Parent Occupation', 'Emergency Contact', 'Previous School']`
- **Supported Fields Missing From Downloadable Template (14 columns)**:
  1. `Class` (or `Grade`) — **CRITICAL**: If users fill the template, students are created with `classId = null`.
  2. `Section` (or `Group`) — **CRITICAL**: Section is not linked.
  3. `Roll Number` — Parser ignores or conflates with admission number; database column `Student.rollNumber` left null.
  4. `Mother Tongue`
  5. `Annual Income`
  6. `Sibling Name`
  7. `Previous Academic Records/Report Card Status`
  8. `Subjects Chosen`
  9. `School Bus Route/Stop`
  10. `Tuition Fee`
  11. `Hostel Fee`
  12. `Book Fee`
  13. `Other Fee`
  14. `Total Fee`

### B. Staff Import Template (`StaffAssignment.jsx`)
- **Current Template Headers (32 columns)**:
  `['Staff ID', 'Full Name', 'Date of Birth', 'Gender', 'Nationality', 'Marital Status', 'Blood Group', 'Aadhar Number', 'Languages Known', 'Mobile Number', 'Email Address', 'Residential Address', 'Emergency Contact Details', 'Father Name/Guardian Name', 'Highest Qualification', 'Degree(s) and Specialization', 'University/College Name', 'Year of Passing', 'Previous Experience (Years)', 'Previous School/Organization', 'Subject Specialization', 'Grades/Classes Handled', 'Certifications', 'Government-issued ID', 'Tax Identification Details (PAN)', 'PF Number', 'ESIC Number', 'UAN Number', 'Bank Account Number', 'Bank Name and Branch', 'IFSC Code', 'PAN Number']`
- **Supported Fields Missing From Downloadable Template**:
  1. `Assigned Class` (Class Teacher assignment)
  2. `Role` / `Designation`
  3. `Staff Type` (`teaching` vs `non-teaching`)
  4. `Subject Classes`

### C. Classes & Sections Template (`ClassManagement.jsx`)
- **Current Template Headers (3 columns)**: `Class Name`, `Section`, `Category`.
- **Limitation**: Non-sectioned classes cannot be imported because frontend parser strictly skips rows where `section` is empty (`if (className && section)`).

### D. Subjects Template (`SubjectManagement.jsx`)
- **Current Template Headers (2 columns)**: `Subject Name`, `Subject Code`.
- **Status**: Synchronized with backend schema.

### E. Inventory Template (`InventoryManagement.jsx`)
- **Current Template Headers (4 columns)**: `ID Number`, `Product Name`, `Category`, `Initial Stock`.
- **Status**: Synchronized with backend schema.

---

## 4. Import Feature Matrix

| Feature / Criteria | Students | Staff | Classes & Sections | Subjects | Inventory | Homework Evaluations | Assessment Grades |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Downloadable Template** | ⚠️ Partial | ⚠️ Partial | ✅ Yes | ✅ Yes | ✅ Yes | ❌ No | N/A (Grid API) |
| **Flexible Aliases** | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ⚠️ Strict | ✅ Yes | N/A |
| **Batch Size** | 25 UI / 100 API | 25 UI / 100 API | Single Batch | Single Batch | Single Batch | Sequential 1-by-1 | Single Batch |
| **Transaction Atomicity** | ✅ Per batch | ✅ Per batch | ✅ Full | ✅ Full | ✅ Full | ❌ Row-by-Row | ✅ Full |
| **Duplicate Handling** | Update Existing | Update Existing | Skip duplicate | Skip duplicate | Skip / Update Config | Update Existing | Upsert Grade |
| **Create vs Update** | Upsert | Upsert | Add Section | Create New | Configurable | Update Only | Upsert |
| **Foreign Key Lookups** | Class/Section | Class/Role | Category | None | Category | Homework/Student | Student/Class |
| **Audit Logging** | ✅ Logged | ✅ Logged | ✅ Logged | ✅ Logged | ✅ Logged | ⚠️ Single Item | ✅ Logged |
| **Tenant Isolation** | ✅ Strict | ✅ Strict | ✅ Strict | ✅ Strict | ✅ Strict | ✅ Strict | ✅ Strict |
| **RBAC Authorization** | `students:create` | `staff:create` | `classes:create` | `subjects:create` | `inventory:create` | `homework:create` | `assessments:update` |

---

## 5. Template → Frontend Parser → API → Database Persistence Tracing

### 5.1 Student Import Data Mapping

```
Excel Column               Frontend Parser Property    API Payload Field          Prisma Model / Field           Persistence Status
─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
Full Name                  firstName, lastName         firstName, lastName        Student.firstName, lastName    ✅ PERSISTED
Admission Number           admissionNumber             admissionNumber            Student.admissionNumber        ✅ PERSISTED (Unique)
Class                      findMatchingClass()         classId                    Student.classId                ✅ PERSISTED (FK)
Section                    findMatchingClass()         sectionId                  Student.sectionId              ✅ PERSISTED (FK)
Roll Number                admissionNumberRaw fallback (DROPPED)                  Student.rollNumber             ❌ DATA LOSS (Dropped from payload)
Date of Birth              parseExcelDob()             dob                        Student.dob                    ✅ PERSISTED (YYYY-MM-DD)
Gender                     normalizeGender()           gender                     Student.gender                 ✅ PERSISTED
Blood Group                parseExcelBloodGroup()      bloodGroup                 Student.bloodGroup             ✅ PERSISTED
Aadhaar Number             parseExcelAadhaar()         aadhaarNumber              Student.aadhaarNumber          ✅ PERSISTED
Parent/Guardian Name       customData.parentName       customData.parentName      Student.customData.parentName  ✅ PERSISTED (JSONB)
Parent Phone               customData.parentPhone      customData.parentPhone     Student.customData.parentPhone ✅ PERSISTED (JSONB)
Parent Email               customData.parentEmail      customData.parentEmail     Student.customData.parentEmail ✅ PERSISTED (JSONB)
Parent Occupation          customData.parentOccupation customData.parentOccupation Student.customData.parent...  ✅ PERSISTED (JSONB)
Emergency Contact          customData.emergencyContact customData.emergencyContact Student.customData.emergency..✅ PERSISTED (JSONB)
Annual Income              customData.annualIncome     customData.annualIncome    Student.customData.annualIncome✅ PERSISTED (JSONB)
Sibling Name               customData.siblingName      customData.siblingName     Student.customData.siblingName ✅ PERSISTED (JSONB)
Home Address               customData.homeAddress      customData.homeAddress     Student.customData.homeAddress ✅ PERSISTED (JSONB)
Previous School            customData.previousSchool   customData.previousSchool  Student.customData.previous... ✅ PERSISTED (JSONB)
Previous Records           customData.previousRecords  customData.previousRecords Student.customData.previous... ✅ PERSISTED (JSONB)
Subjects Chosen            customData.subjectsChosen   customData.subjectsChosen  Student.customData.subjects... ✅ PERSISTED (JSONB)
School Bus Route/Stop      customData.busRoute         customData.busRoute        Student.customData.busRoute    ⚠️ JSONB Only (Not linked to FK)
Tuition/Hostel/Book Fee    customData.tuitionFee, etc. customData.*Fee            Student.customData.*Fee        ✅ PERSISTED (JSONB)
Fee Structure Sync         (Auto-calculated by Class)  (Backend Sync)             Invoice.createMany             ✅ PERSISTED (Invoices)
Nationality                customData.nationality      customData.nationality     Student.customData.nationality ✅ PERSISTED (JSONB)
Religion                   customData.religion         customData.religion        Student.customData.religion    ✅ PERSISTED (JSONB)
Mother Tongue              customData.motherTongue     customData.motherTongue    Student.customData.motherTongue✅ PERSISTED (JSONB)
```

### 5.2 Staff Import Data Mapping

```
Excel Column               Frontend Parser Property    API Payload Field          Prisma Model / Field           Persistence Status
─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
Staff ID                   employeeId                  employeeId                 StaffProfile.employeeId        ✅ PERSISTED (Unique)
Full Name / First / Last   firstName, lastName         firstName, lastName        StaffProfile.name, User.email  ✅ PERSISTED
Email Address              email                       email                      User.email, StaffProfile.email ✅ PERSISTED (Mandatory)
Mobile Number              phone                       phone                      StaffProfile.phone             ✅ PERSISTED
Staff Type                 staffType                   staffType                  StaffProfile.staffType         ✅ PERSISTED
Role / Designation         designation, roleId         designation, roleId        StaffProfile.designation, Role ✅ PERSISTED
Assigned Class             findClassByName()           assignedClassId            StaffProfile.assignedClassId,  ✅ PERSISTED (FK + updates
                                                                                  Class.classTeacherId           Class.classTeacherId)
Subject Classes            parseSubjectClassIds()      assignments.subjectClassIds StaffProfile.customData...     ✅ PERSISTED (JSONB)
Date of Birth              formatDob()                 dob                        StaffProfile.customData.dob    ✅ PERSISTED (JSONB)
Gender                     normalizeGender()           gender                     StaffProfile.customData.gender ✅ PERSISTED (JSONB)
Nationality                nationality                 nationality                StaffProfile.customData.nat... ✅ PERSISTED (JSONB)
Marital Status             maritalStatus               maritalStatus              StaffProfile.customData.mar... ✅ PERSISTED (JSONB)
Blood Group                bloodGroup                  bloodGroup                 StaffProfile.customData.blood..✅ PERSISTED (JSONB)
Residential Address        address                     address                    StaffProfile.customData.addr.. ✅ PERSISTED (JSONB)
Emergency Contact          emergencyContact            emergencyContact           StaffProfile.customData.emerg..✅ PERSISTED (JSONB)
Father / Guardian Name     fatherGuardianName          fatherGuardianName         StaffProfile.customData.father.✅ PERSISTED (JSONB)
Languages Known            languagesKnown              languagesKnown             StaffProfile.customData.lang.. ✅ PERSISTED (JSONB)
Qualifications (5 cols)    qualifications.*            qualifications.*           StaffProfile.customData.qual.. ✅ PERSISTED (JSONB)
Experience (4 cols)        experience.*                experience.*               StaffProfile.customData.exp..  ✅ PERSISTED (JSONB)
Financial / Bank (9 cols)  financial.*                 financial.*                StaffProfile.customData.fin..  ✅ PERSISTED (JSONB)
Aadhaar / Govt ID          customData.aadharNumber     customData.aadharNumber    StaffProfile.customData.aad..  ✅ PERSISTED (JSONB)
Government-issued ID       customData.govtIdNumber     customData.govtIdNumber    StaffProfile.customData.govt.. ✅ PERSISTED (JSONB)
```

### 5.3 Classes & Sections Data Mapping

```
Excel Column    Frontend Parser Property    API Payload Field    Prisma Model / Field           Persistence Status
─────────────────────────────────────────────────────────────────────────────────────────────────────────────
Class Name      className                   className            Class.name                     ✅ PERSISTED
Section         section                     section              Section.name                   ✅ PERSISTED
Category        category                    category             ClassCategory.name, categoryId ✅ PERSISTED (Auto-created if new)
```

### 5.4 Subjects Data Mapping

```
Excel Column    Frontend Parser Property    API Payload Field    Prisma Model / Field           Persistence Status
─────────────────────────────────────────────────────────────────────────────────────────────────────────────
Subject Name    name                        name                 Subject.name                   ✅ PERSISTED
Subject Code    code                        code                 Subject.code                   ✅ PERSISTED
```

### 5.5 Inventory Items Data Mapping

```
Excel Column    Frontend Parser Property    API Payload Field    Prisma Model / Field           Persistence Status
─────────────────────────────────────────────────────────────────────────────────────────────────────────────
ID Number       productId                   productId            InventoryItem.productId        ✅ PERSISTED
Product Name    name                        name                 InventoryItem.name             ✅ PERSISTED
Category        category                    category             InventoryItem.categoryId/cat   ✅ PERSISTED
Initial Stock   quantity                    quantity             InventoryItem.quantity         ✅ PERSISTED
(Calculated)    (Quantity status)           status               InventoryItem.status           ✅ PERSISTED (Auto Stock Status)
(Auto Audit)    (Per-row audit log)         (tx audit log)       InventoryAudit                 ✅ PERSISTED
```

---

## 6. Create vs Update Behavior & Duplicate Handling

1. **Students**:
   - **Unique Key**: `admissionNumber` (case-insensitive) scoped to `schoolId`.
   - **Behavior**: If `admissionNumber` exists, updates changed scalar fields and shallow-merges `customData`. Newly created students auto-generate pending `Invoice` records matching their class fee structures.
2. **Staff**:
   - **Unique Key**: `email` (case-insensitive) and `employeeId` scoped to `schoolId`.
   - **Behavior**: If `email` exists, updates staff profile and merges `customData`. Updates `User` status and role assignments. If assigned to a class as class teacher, updates `Class.classTeacherId` and clears previous teacher.
3. **Classes & Sections**:
   - **Unique Key**: Class `(schoolId, name)` and Section `(schoolId, classId, name)`.
   - **Behavior**: If Class exists, adds new section under it. If Section already exists under class, skips row.
4. **Subjects**:
   - **Unique Key**: `(schoolId, name)` and `(schoolId, code)`.
   - **Behavior**: Skips rows where subject name or subject code already exists in tenant school.
5. **Inventory**:
   - **Unique Key**: `(schoolId, productId)` or `(schoolId, name)`.
   - **Behavior**: Configurable via `duplicateAction` (`skip` vs `update`). If `update`, adds incoming quantity to existing stock and logs `Product Updated` audit. Detects ambiguous cross-match conflicts (ID matches Item A while Name matches Item B).

---

## 7. Date, Number, and Boolean Edge Cases

- **Dates**:
  - `parseExcelDob()` and `formatDob()` in `StudentManagement.jsx` and `StaffAssignment.jsx` properly handle Excel serial dates (`XLSX.SSF.parse_date_code`), JavaScript `Date` objects, and standard strings (`YYYY-MM-DD`, `DD/MM/YYYY`).
- **Numbers & Leading Zeros**:
  - `admissionNumber` and `employeeId` are coerced as strings via `.toString().trim()` before parsing, preventing truncation of leading zeros (`STU00123`, `0045`).
  - Phone numbers are extracted as strings, avoiding scientific notation (`9.87654E9`).
- **Stock & Quantity**:
  - Parsed with `parseInt(rowStock, 10)` and clamped to `>= 0`.

---

## 8. Tenant Isolation & RBAC Verification

- **Tenant Scoping**:
  - Every bulk endpoint routes through `tenantContext()` middleware.
  - All database queries (`findMany`, `findFirst`, `createMany`, `update`, `upsert`) are strictly scoped by `schoolId`.
  - Lookups for `Class`, `Section`, `Role`, `Category`, and `Student` verify `schoolId === req.user.schoolId`.
  - Zero cross-tenant data leakage or bypass flags discovered.
- **RBAC Permissions**:
  - `POST /api/v1/students/bulk-import` → `requirePermission('students:create')`
  - `POST /api/v1/staff/bulk-import` → `requirePermission('staff:create')`
  - `POST /api/v1/classes/bulk-import` → `requirePermission('classes:create')`
  - `POST /api/v1/subjects/bulk-import` → `requirePermission('subjects:create')`
  - `POST /api/v1/inventory/items/bulk-import` → `requirePermission('inventory:create')`
  - `POST /api/v1/assessments/:id/grades/bulk` → `requirePermission('assessments:update')` with Teacher class-assignment RBAC check.

---

## 9. Critical, High, Medium & Low Findings

### Critical Findings (0)
*None.* (No cross-tenant leaks, no unauthenticated bulk endpoints, no SQL injections).

### High Findings (3)
1. **Student Template Missing Critical Relational Columns (`Class`, `Section`)**:
   - *Impact*: When an administrator downloads the standard template from the Student Management modal and fills it out, all imported students have `classId = null` and `sectionId = null` because `Class` and `Section` columns are omitted from the template.
2. **Student `rollNumber` Dropped During Parser Assembly**:
   - *Impact*: Even if an administrator inputs a `Roll Number` column in the Excel file, the frontend parser only uses it as an `admissionNumber` fallback and never populates `payload.rollNumber`. The database column `students.roll_number` remains null.
3. **Staff Template Missing `Assigned Class`, `Role`, and `Staff Type`**:
   - *Impact*: The 32-column template downloaded from the Staff Directory UI omits `Assigned Class`, `Role`, and `Staff Type`, preventing administrators from bulk-assigning Class Teachers or Staff Roles during initial setup.

### Medium Findings (3)
1. **Homework Evaluation Lacks Downloadable Template**:
   - *Impact*: The "Evaluate via Excel" modal in `Teacher/HomeworkManagement.jsx` provides text guidelines but lacks a direct "Download Template" button.
2. **Classes & Sections Bulk Import Rejects Non-Sectioned Classes**:
   - *Impact*: `ClassManagement.jsx` ignores rows where `Section` is blank (`if (className && section)`), preventing institutions from bulk-importing classes that do not use sections.
3. **Homework Evaluation Uses Sequential Single-Row API Requests**:
   - *Impact*: Evaluating 50 submissions via Excel fires 50 individual HTTP requests in a loop rather than using a single bulk endpoint.

### Low Findings (1)
1. **Template Versioning**:
   - Templates currently lack embedded version identifiers.

---

## 10. Recommended Remediation Plan

1. **Step 1 (High Priority - Students)**:
   - Update `handleDownloadTemplate` in `StudentManagement.jsx` to include `Class`, `Section`, `Roll Number`, `Mother Tongue`, `Annual Income`, `Sibling Name`, `Previous Records`, `Subjects Chosen`, `Bus Route`, `Tuition Fee`.
   - Update parser in `StudentManagement.jsx` to map `rollNumber: row['roll number'] || row['roll no'] || null` into the API payload.
2. **Step 2 (High Priority - Staff)**:
   - Update `Download Full Template` in `StaffAssignment.jsx` to include `Assigned Class`, `Role`, `Staff Type`, and `Subject Classes`.
3. **Step 3 (Medium Priority - Homework & Classes)**:
   - Add a template download button in `HomeworkManagement.jsx` for student evaluations.
   - Allow optional section import in `ClassManagement.jsx` for classes without sections.

---

## 11. Files Identified for Future Remediation

| File | Submodule | Required Change |
| :--- | :--- | :--- |
| [`frontend/src/pages/Admin/StudentManagement.jsx`](file:///c:/Projects/SMS/frontend/src/pages/Admin/StudentManagement.jsx) | Student Directory | Synchronize Download Template headers with all 29 supported fields; map `rollNumber` to payload. |
| [`frontend/src/pages/Admin/StaffAssignment.jsx`](file:///c:/Projects/SMS/frontend/src/pages/Admin/StaffAssignment.jsx) | Staff Directory | Add `Assigned Class`, `Role`, `Staff Type`, `Subject Classes` to the downloadable Excel template. |
| [`frontend/src/pages/Teacher/HomeworkManagement.jsx`](file:///c:/Projects/SMS/frontend/src/pages/Teacher/HomeworkManagement.jsx) | Homework Evaluations | Add "Download Evaluation Template" button to modal. |
| [`frontend/src/pages/Admin/ClassManagement.jsx`](file:///c:/Projects/SMS/frontend/src/pages/Admin/ClassManagement.jsx) | Classes & Sections | Support non-sectioned class rows in bulk import parser. |

---

## 12. Final Audit Status

**AUDIT COMPLETE — REMEDIATION REQUIRED**
