# Global Bulk Import Template Contract & Data Integrity Forensic Audit Report

**Repository:** School Management System  
**Audit Scope:** Website-Wide Bulk Import, Spreadsheet, Excel, and CSV Data Workflows  
**Mode:** READ-ONLY FORENSIC AUDIT (No Code, Schema, or Data Modifications)  
**Date:** 2026-10-07  
**Status:** AUDIT COMPLETE — ISSUES REGISTERED

---

## 1. Executive Summary

A comprehensive, website-wide forensic audit of all bulk data import, Excel, CSV, and spreadsheet ingestion mechanisms across the School Management System codebase was conducted. The audit traced the entire end-to-end data lifecycle:

$$\text{Template Definition} \longrightarrow \text{User Download} \longrightarrow \text{File Parser} \longrightarrow \text{Normalization} \longrightarrow \text{API Payload} \longrightarrow \text{Backend Validation} \longrightarrow \text{Business Logic} \longrightarrow \text{Database Persistence} \longrightarrow \text{Live Data Sync}$$

### Core Forensic Findings:
1. **6 File-Based Import Workflows** were identified across the application:
   - **Student Directory Bulk Import** (`Admin/StudentManagement.jsx`)
   - **Staff Directory & Assignment Bulk Import** (`Admin/StaffAssignment.jsx`)
   - **Subjects Bulk Import** (`Admin/SubjectManagement.jsx`)
   - **Classes & Sections Bulk Import** (`Admin/ClassManagement.jsx`)
   - **Inventory Products Bulk Import** (`Admin/InventoryManagement.jsx`)
   - **Homework Evaluation / Grading Excel Upload** (`Teacher/HomeworkManagement.jsx`)
2. **Template Drift & Omissions**:
   - **Student Template**: The downloadable `Bulk_Import_Template.xlsx` omits `Class` and `Section` columns, even though the frontend parser and backend logic fully support class/section resolution. Students imported via the standard template end up unassigned to any class.
   - **Staff Template**: The 32-column `staff_import_template.xlsx` omits `Assigned Class`, `Subject Classes`, `Staff Type`, and `Role`, which are supported in the parser.
   - **Homework Evaluation**: Has a functional Excel parser and submission updater, but **provides NO template download button** anywhere in the UI.
3. **Database & Relational Integrity**:
   - Subjects, Classes, and Inventory use atomic, multi-statement Prisma transactions (`$transaction`) with duplicate detection and tenant isolation.
   - Student bulk import creates or updates students atomically and automatically provisions pending invoices for matching class fee structures.
   - Staff bulk import automatically provisions system `User` accounts with secure placeholder passwords (`!LOCKED_NO_PASSWORD_SET`) and synchronizes class teacher assignments.
4. **Live Data Event Triggers**:
   - Students, Staff, and Subjects correctly invoke `notifyDataChanged(entity)` after batch completion.
   - Classes and Inventory bulk imports do **NOT** emit `notifyDataChanged` signals upon successful import.

---

## 2. Audit Scope & Discovery Methodology

Every frontend page, component, utility, API client, backend route, schema validator, controller, service, repository, and Prisma schema was forensically audited.

### Inspection Keywords & Patterns Searched:
- **Frontend**: `sheet_to_json`, `aoa_to_sheet`, `json_to_sheet`, `XLSX.read`, `XLSX.writeFile`, `readAsBinaryString`, `readAsArrayBuffer`, `FileReader`, `bulkImport`, `uploadFile`, `importFile`.
- **Backend**: `/bulk-import`, `/bulk`, `createMany`, `createManyAndReturn`, `$transaction`, `bulkImportStudents`, `bulkImportStaff`, `bulkImportSubjects`, `bulkImportClasses`, `bulkImportItems`.

---

## 3. Complete Bulk Import Inventory

| # | Module | Feature / Operation | Frontend File | API Endpoint | Backend Controller & Service | Template Source |
|---|---|---|---|---|---|---|
| **1** | **Students** | Bulk Student Import | `Admin/StudentManagement.jsx` | `POST /api/v1/students/bulk-import` | `student.controller.js` / `student.service.js` | Generated XLSX (`Bulk_Import_Template.xlsx`) |
| **2** | **Staff** | Bulk Staff & Assignments | `Admin/StaffAssignment.jsx` | `POST /api/v1/staff/bulk-import` | `staff.controller.js` / `staff.service.js` | Generated XLSX (`staff_import_template.xlsx`) |
| **3** | **Subjects** | Bulk Subject Import | `Admin/SubjectManagement.jsx` | `POST /api/v1/subjects/bulk-import` | `subject.controller.js` / `subject.service.js` | Generated XLSX (`Subject_Import_Template.xlsx`) |
| **4** | **Classes** | Bulk Class & Section Import | `Admin/ClassManagement.jsx` | `POST /api/v1/classes/bulk-import` | `class.controller.js` / `class.service.js` | Generated XLSX (`Class_Import_Template.xlsx`) |
| **5** | **Inventory** | Bulk Inventory Items | `Admin/InventoryManagement.jsx` | `POST /api/v1/inventory/items/bulk-import` | `inventory.controller.js` / `inventory.service.js` | Generated CSV/XLSX (`inventory_import_template.*`) |
| **6** | **Homework** | Excel Evaluation Upload | `Teacher/HomeworkManagement.jsx` | `PUT /api/v1/homework/:id/submissions/:studentId` (Loop) | `homework.controller.js` / `homework.service.js` | **NO TEMPLATE** |

*(Note: Assessments Grades and Attendance Sessions support UI-grid batch saving via REST, but do not feature external file/spreadsheet ingestion).*

---

## 4. Master Import Matrix

| # | Module | Template Exists | Template Source | Parser Contract | API Contract | Backend Validation | DB Persistence | Tenant Isolated | RBAC Authoritative | Live Event Dispatched | Overall Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **1** | **Students** | YES | Dynamic XLSX | Partial (Missing Class/Sec in template) | Full | Full (`bulkImportStudentsSchema`) | Full (`Student`, `Invoice`) | YES (`schoolId`) | `canCreate('students')` | YES (`'students'`) | **PARTIAL** |
| **2** | **Staff** | YES | Dynamic XLSX | Partial (Missing Class/Role in template) | Full | Full (`bulkImportStaffSchema`) | Full (`StaffProfile`, `User`, `RoleAssignment`) | YES (`schoolId`) | `canCreate('staff')` | YES (`'staff'`) | **PARTIAL** |
| **3** | **Subjects** | YES | Dynamic XLSX | Full (1:1 with template) | Full | Full (`bulkImportSubjectsSchema`) | Full (`Subject`) | YES (`schoolId`) | `canCreate('subjects')` | YES (`'subjects'`) | **PASS** |
| **4** | **Classes** | YES | Dynamic XLSX | Full (1:1 with template) | Full | Full (`bulkImportClassesSchema`) | Full (`Class`, `Section`, `ClassCategory`) | YES (`schoolId`) | `canCreate('classes')` | **NO** (Missing) | **PARTIAL** |
| **5** | **Inventory** | YES | Dynamic CSV/XLSX | Full (1:1 with template) | Full | Full (`bulkImportItemsSchema`) | Full (`InventoryItem`, `InventoryTransaction`) | YES (`schoolId`) | `canCreate('inventory')` | **NO** (Missing) | **PARTIAL** |
| **6** | **Homework** | **NO** | None | Ad-hoc (Requires specific headers) | Client Loop | Per-submission | Full (`HomeworkSubmission`) | YES (`schoolId`) | `canEdit('homework')` | **NO** (Missing) | **FAIL** |

---

## 5. Detailed Forensic Tracing by Module

### 5.1 Students Bulk Import

#### A. Template Contract vs Parser Mapping
- **Download Action**: User clicks "Download Standard Template" in `StudentManagement.jsx:2852`.
- **Downloaded Headers (15 Columns)**:
  `['Full Name', 'Admission Number', 'Date of Birth', 'Gender', 'Blood Group', 'Nationality', 'Religion', 'Aadhar Number', 'Home Address', 'Parent/Guardian Name', 'Parent Phone', 'Parent Email', 'Parent Occupation', 'Emergency Contact', 'Previous School']`

| Template Header | Parser Expected Field | Mapped API Field | Persisted DB Field | Status |
|---|---|---|---|---|
| `Full Name` | `row['full name']` | `firstName`, `lastName` | `Student.firstName`, `Student.lastName` | **PASS** |
| `Admission Number` | `row['admission number']` | `admissionNumber` | `Student.admissionNumber` | **PASS** |
| `Date of Birth` | `row['date of birth']` | `dob` | `Student.dob` | **PASS** |
| `Gender` | `row['gender']` | `gender` | `Student.gender` | **PASS** |
| `Blood Group` | `row['blood group']` | `bloodGroup` | `Student.bloodGroup` | **PASS** |
| `Nationality` | `row['nationality']` | `customData.nationality` | `Student.customData` (JSON) | **PASS** |
| `Religion` | `row['religion']` | `customData.religion` | `Student.customData` (JSON) | **PASS** |
| `Aadhar Number` | `row['aadhar number']` | `aadhaarNumber` | `Student.aadhaarNumber` | **PASS** |
| `Home Address` | `row['home address']` | `customData.homeAddress` | `Student.customData` (JSON) | **PASS** |
| `Parent/Guardian Name`| `row['parent/guardian name']` | `customData.parentName` | `Student.customData` (JSON) | **PASS** |
| `Parent Phone` | `row['parent phone']` | `customData.parentPhone` | `Student.customData` (JSON) | **PASS** |
| `Parent Email` | `row['parent email']` | `customData.parentEmail` | `Student.customData` (JSON) | **PASS** |
| `Parent Occupation` | `row['parent occupation']` | `customData.parentOccupation` | `Student.customData` (JSON) | **PASS** |
| `Emergency Contact` | `row['emergency contact']` | `customData.emergencyContact` | `Student.customData` (JSON) | **PASS** |
| `Previous School` | `row['previous school']` | `customData.previousSchool` | `Student.customData` (JSON) | **PASS** |
| *(NOT IN TEMPLATE)* | `row['class']` | `classId` | `Student.classId` | **MISSING IN TEMPLATE** |
| *(NOT IN TEMPLATE)* | `row['section']` | `sectionId` | `Student.sectionId` | **MISSING IN TEMPLATE** |

#### B. Data Pipeline Analysis
1. **Parser & Chunking**: Parses Excel rows, chunks into batches of 25 (`BATCH_SIZE = 25`), and sends concurrent/sequential `bulkImportStudents(chunk)` requests.
2. **Backend Execution**: `student.service.js:bulkImportStudents` runs an atomic `$transaction`. Existing students by `admissionNumber` are updated (`toUpdateItems`); new students are batch-inserted via `prisma.student.createManyAndReturn`.
3. **Automated Fee Invoice Generation**: For all newly created students with a resolved `classId`, the service queries active `FeeStructure` records for the class and batch-inserts `Invoice` records (`status: 'Pending'`).
4. **Live Data Event**: Emits `notifyDataChanged('students')` once after all chunks complete.

---

### 5.2 Staff Bulk Import

#### A. Template Contract vs Parser Mapping
- **Download Action**: User clicks "Download Full Template (32 columns)" in `StaffAssignment.jsx:2026`.
- **Downloaded Headers (32 Columns)**:
  `['Staff ID', 'Full Name', 'Date of Birth', 'Gender', 'Nationality', 'Marital Status', 'Blood Group', 'Aadhar Number', 'Languages Known', 'Mobile Number', 'Email Address', 'Residential Address', 'Emergency Contact Details', 'Father Name/Guardian Name', 'Highest Qualification', 'Degree(s) and Specialization', 'University/College Name', 'Year of Passing', 'Previous Experience (Years)', 'Previous School/Organization', 'Subject Specialization', 'Grades/Classes Handled', 'Certifications', 'Government-issued ID', 'Tax Identification Details (PAN)', 'PF Number', 'ESIC Number', 'UAN Number', 'Bank Account Number', 'Bank Name and Branch', 'IFSC Code', 'PAN Number']`

| Template Header | Parser Key | Backend Field | DB Model & Column | Status |
|---|---|---|---|---|
| `Staff ID` | `staff id` | `employeeId` | `StaffProfile.employeeId` | **PASS** |
| `Full Name` | `full name` | `name`, `firstName`, `lastName` | `StaffProfile.name`, `customData` | **PASS** |
| `Date of Birth` | `date of birth` | `dob` | `customData.dob` | **PASS** |
| `Gender` | `gender` | `gender` | `customData.gender` | **PASS** |
| `Nationality` | `nationality` | `nationality` | `customData.nationality` | **PASS** |
| `Marital Status` | `marital status` | `maritalStatus` | `customData.maritalStatus` | **PASS** |
| `Blood Group` | `blood group` | `bloodGroup` | `customData.bloodGroup` | **PASS** |
| `Aadhar Number` | `aadhar number` | `customData.aadharNumber` | `customData.aadharNumber` | **PASS** |
| `Languages Known` | `languages known` | `customData.languagesKnown` | `customData.languagesKnown` | **PASS** |
| `Mobile Number` | `mobile number` | `phone` | `StaffProfile.phone` | **PASS** |
| `Email Address` | `email address` | `email` | `StaffProfile.email`, `User.email` | **PASS** |
| `Residential Address` | `residential address` | `customData.address` | `customData.address` | **PASS** |
| `Emergency Contact Details` | `emergency contact` | `customData.emergencyContact` | `customData.emergencyContact` | **PASS** |
| `Father Name/Guardian Name` | `father name` | `customData.fatherGuardianName`| `customData.fatherGuardianName` | **PASS** |
| `Highest Qualification` | `highest qualification` | `customData.qualifications.*` | `customData.qualifications` | **PASS** |
| `Degree(s) and Specialization`| `degree specialization` | `customData.qualifications.*` | `customData.qualifications` | **PASS** |
| `University/College Name` | `university name` | `customData.qualifications.*` | `customData.qualifications` | **PASS** |
| `Year of Passing` | `year of passing` | `customData.qualifications.*` | `customData.qualifications` | **PASS** |
| `Previous Experience (Years)`| `previous experience` | `customData.experience.*` | `customData.experience` | **PASS** |
| `Previous School/Organization`| `previous school` | `customData.experience.*` | `customData.experience` | **PASS** |
| `Subject Specialization` | `subject specialization`| `customData.experience.*` | `customData.experience` | **PASS** |
| `Grades/Classes Handled` | `grades/classes handled`| `customData.experience.*` | `customData.experience` | **PASS** |
| `Certifications` | `certifications` | `customData.qualifications.*` | `customData.qualifications` | **PASS** |
| `Government-issued ID` | `government-issued id` | `customData.govtIdNumber` | `customData.govtIdNumber` | **PASS** |
| `Tax ID Details (PAN)` | `tax identification` | `customData.financial.taxIdDetails` | `customData.financial` | **PASS** |
| `PF Number` | `pf number` | `customData.financial.pfNumber` | `customData.financial` | **PASS** |
| `ESIC Number` | `esic number` | `customData.financial.esicNumber` | `customData.financial` | **PASS** |
| `UAN Number` | `uan number` | `customData.financial.uanNumber` | `customData.financial` | **PASS** |
| `Bank Account Number` | `bank account number` | `customData.financial.bankAccountNumber` | `customData.financial` | **PASS** |
| `Bank Name and Branch` | `bank name and branch` | `customData.financial.bankName` | `customData.financial` | **PASS** |
| `IFSC Code` | `ifsc code` | `customData.financial.ifscCode` | `customData.financial` | **PASS** |
| `PAN Number` | `pan number` | `customData.financial.panNumber` | `customData.financial` | **PASS** |
| *(NOT IN TEMPLATE)* | `row['assigned class']` | `assignedClassId` | `StaffProfile.assignedClassId`, `Class.classTeacherId` | **MISSING IN TEMPLATE** |
| *(NOT IN TEMPLATE)* | `row['subject classes']` | `assignments.subjectClassIds` | `customData.assignments.subjectClassIds` | **MISSING IN TEMPLATE** |
| *(NOT IN TEMPLATE)* | `row['role']` | `roleId` | `RoleAssignment.schoolRoleId` | **MISSING IN TEMPLATE** |

#### B. Data Pipeline Analysis
1. **User Account Linking**: For every new staff member, a `User` entity is created in the transaction with locked hash `!LOCKED_NO_PASSWORD_SET` and linked via `StaffProfile.userId`.
2. **Role Assignment**: Maps designation/role to `SchoolRole` and creates `RoleAssignment`.
3. **Class Teacher Sync**: If `assignedClassId` is present, updates `Class.classTeacherId` in DB.
4. **Live Data Event**: Emits `notifyDataChanged('staff')` after all chunks finish.

---

### 5.3 Subjects Bulk Import

#### A. Template Contract vs Parser Mapping
- **Download Action**: User clicks "Download Template" in `SubjectManagement.jsx:258`.
- **Downloaded Headers**: `['Subject Name', 'Subject Code']`

| Template Header | Parser Key | API Field | Backend Schema | DB Column | Status |
|---|---|---|---|---|---|
| `Subject Name` | `Subject Name` | `name` | `z.string().min(1).max(100)` | `Subject.name` | **PASS** |
| `Subject Code` | `Subject Code` | `code` | `z.string().max(50).optional()` | `Subject.code` | **PASS** |

#### B. Data Pipeline Analysis
- In-memory `Set` of existing names and codes within the school tenant.
- Filters out duplicate names or codes without throwing a fatal error.
- Persists all valid subjects in a single `tx.subject.createMany({ data })`.
- Emits `notifyDataChanged('subjects')` immediately upon success.

---

### 5.4 Classes & Sections Bulk Import

#### A. Template Contract vs Parser Mapping
- **Download Action**: User clicks "Download Template" in `ClassManagement.jsx:330`.
- **Downloaded Headers**: `['Class Name', 'Section', 'Category']`

| Template Header | Parser Key | API Field | Backend Schema | DB Destination | Status |
|---|---|---|---|---|---|
| `Class Name` | `Class Name` | `className` | `z.string().min(1).max(100)` | `Class.name` | **PASS** |
| `Section` | `Section` | `section` | `z.string().min(1).max(20)` | `Section.name` | **PASS** |
| `Category` | `Category` | `category` | `z.string().max(100).optional()` | `ClassCategory.name` (Auto-created) | **PASS** |

#### B. Data Pipeline Analysis
- Transactionally resolves category (creating new `ClassCategory` if needed).
- Finds or creates the `Class` entity, then adds the `Section` entity.
- Skips if the section already exists under the class.
- **Defect**: Missing `notifyDataChanged('classes')` invocation in `ClassManagement.jsx:444`.

---

### 5.5 Inventory Items Bulk Import

#### A. Template Contract vs Parser Mapping
- **Download Action**: User downloads template in `InventoryManagement.jsx:386` (supports `.csv` and `.xlsx`).
- **Downloaded Headers**: `['ID Number', 'Product Name', 'Category', 'Initial Stock']`

| Template Header | Parser Key | API Field | Backend Schema | DB Destination | Status |
|---|---|---|---|---|---|
| `ID Number` | `id number` | `productId` | `z.string().nullable().optional()` | `InventoryItem.productId` | **PASS** |
| `Product Name` | `product name` | `name` | `z.string().min(1).max(200)` | `InventoryItem.name` | **PASS** |
| `Category` | `category` | `category` | `z.string().min(1).max(100)` | `InventoryCategory.name`, `InventoryItem.categoryId` | **PASS** |
| `Initial Stock` | `initial stock` | `quantity` | `z.number().int().min(0)` | `InventoryItem.quantity`, `InventoryTransaction` | **PASS** |

#### B. Data Pipeline Analysis
- In-memory validation for intra-file duplicates.
- Supports configurable duplicate strategy (`skip` vs `update`) and auto-category generation.
- Full transactional safety with rollback.
- Generates downloadable CSV error logs detailing exact row and reason on failure.
- **Defect**: Missing `notifyDataChanged('inventory')` invocation in `InventoryManagement.jsx:498`.

---

### 5.6 Homework Evaluation Excel Upload

#### A. Pipeline Analysis
- **File**: `Teacher/HomeworkManagement.jsx:456` (`handleExcelUpload`).
- **Template Status**: **NO TEMPLATE EXISTS**. No download link or sample file provided.
- **Parser Headers**: Looks for `row['Admission Number']` (or `AdmissionNo`, `ADM`), `row['Status']`, `row['Grade']` (or `Marks`), `row['Feedback']` (or `Remarks`), `row['Homework Title']`.
- **Data Path**:
  $$\text{User uploads file} \longrightarrow \text{Client parses rows} \longrightarrow \text{Sequential client loop calling } \texttt{updateSubmission()} \longrightarrow \text{Single DB updates}$$
- **Defects**:
  1. No template download available to teachers.
  2. N+1 sequential HTTP request loop (slow, non-atomic, prone to partial network failures).
  3. No live data event emitted.

---

## 6. Field-Level Integrity Matrix

| Module | Template Column Header | Parsed in Frontend? | Passed to API Payload? | Accepted by Backend Schema? | Persisted in Database? | Database Model & Target Column | Relational Foreign Key | Integrity Status |
|---|---|---|---|---|---|---|---|---|
| **Students** | `Full Name` | YES | YES (`firstName`, `lastName`) | YES | YES | `Student.firstName`, `Student.lastName` | N/A | **PASS** |
| **Students** | `Admission Number` | YES | YES (`admissionNumber`) | YES | YES | `Student.admissionNumber` | N/A | **PASS** |
| **Students** | `Date of Birth` | YES | YES (`dob`) | YES | YES | `Student.dob` | N/A | **PASS** |
| **Students** | `Gender` | YES | YES (`gender`) | YES | YES | `Student.gender` | N/A | **PASS** |
| **Students** | `Blood Group` | YES | YES (`bloodGroup`) | YES | YES | `Student.bloodGroup` | N/A | **PASS** |
| **Students** | `Nationality` | YES | YES (`customData.nationality`) | YES | YES | `Student.customData` (JSON) | N/A | **PASS** |
| **Students** | `Religion` | YES | YES (`customData.religion`) | YES | YES | `Student.customData` (JSON) | N/A | **PASS** |
| **Students** | `Aadhar Number` | YES | YES (`aadhaarNumber`) | YES | YES | `Student.aadhaarNumber` | N/A | **PASS** |
| **Students** | `Home Address` | YES | YES (`customData.homeAddress`) | YES | YES | `Student.customData` (JSON) | N/A | **PASS** |
| **Students** | `Parent/Guardian Name`| YES | YES (`customData.parentName`) | YES | YES | `Student.customData` (JSON) | N/A | **PASS** |
| **Students** | `Parent Phone` | YES | YES (`customData.parentPhone`) | YES | YES | `Student.customData` (JSON) | N/A | **PASS** |
| **Students** | `Parent Email` | YES | YES (`customData.parentEmail`) | YES | YES | `Student.customData` (JSON) | N/A | **PASS** |
| **Students** | `Parent Occupation` | YES | YES (`customData.parentOccupation`)| YES | YES | `Student.customData` (JSON) | N/A | **PASS** |
| **Students** | `Emergency Contact` | YES | YES (`customData.emergencyContact`)| YES | YES | `Student.customData` (JSON) | N/A | **PASS** |
| **Students** | `Previous School` | YES | YES (`customData.previousSchool`) | YES | YES | `Student.customData` (JSON) | N/A | **PASS** |
| **Students** | *(Template Omission: Class)* | YES (`row['class']`) | YES (`classId`) | YES | YES | `Student.classId` | `Class.id` | **OMITTED IN TEMPLATE** |
| **Students** | *(Template Omission: Section)* | YES (`row['section']`) | YES (`sectionId`) | YES | YES | `Student.sectionId` | `Section.id` | **OMITTED IN TEMPLATE** |
| **Staff** | `Staff ID` | YES | YES (`employeeId`) | YES | YES | `StaffProfile.employeeId` | N/A | **PASS** |
| **Staff** | `Full Name` | YES | YES (`name`, `firstName`, `lastName`) | YES | YES | `StaffProfile.name`, `customData` | N/A | **PASS** |
| **Staff** | `Email Address` | YES | YES (`email`) | YES | YES | `StaffProfile.email`, `User.email` | `User.id` | **PASS** |
| **Staff** | `Mobile Number` | YES | YES (`phone`) | YES | YES | `StaffProfile.phone` | N/A | **PASS** |
| **Staff** | *(28 Additional Profile Columns)* | YES | YES (Structured objects) | YES | YES | `StaffProfile.customData` | N/A | **PASS** |
| **Staff** | *(Template Omission: Class)* | YES (`row['assigned class']`) | YES (`assignedClassId`) | YES | YES | `StaffProfile.assignedClassId` | `Class.id` | **OMITTED IN TEMPLATE** |
| **Staff** | *(Template Omission: Role)* | YES (`row['role']`) | YES (`roleId`) | YES | YES | `RoleAssignment.schoolRoleId` | `SchoolRole.id` | **OMITTED IN TEMPLATE** |
| **Subjects** | `Subject Name` | YES | YES (`name`) | YES | YES | `Subject.name` | N/A | **PASS** |
| **Subjects** | `Subject Code` | YES | YES (`code`) | YES | YES | `Subject.code` | N/A | **PASS** |
| **Classes** | `Class Name` | YES | YES (`className`) | YES | YES | `Class.name` | N/A | **PASS** |
| **Classes** | `Section` | YES | YES (`section`) | YES | YES | `Section.name` | `Class.id` | **PASS** |
| **Classes** | `Category` | YES | YES (`category`) | YES | YES | `ClassCategory.name`, `Class.categoryId` | `ClassCategory.id` | **PASS** |
| **Inventory**| `ID Number` | YES | YES (`productId`) | YES | YES | `InventoryItem.productId` | N/A | **PASS** |
| **Inventory**| `Product Name` | YES | YES (`name`) | YES | YES | `InventoryItem.name` | N/A | **PASS** |
| **Inventory**| `Category` | YES | YES (`category`) | YES | YES | `InventoryCategory.name`, `InventoryItem.categoryId` | `InventoryCategory.id` | **PASS** |
| **Inventory**| `Initial Stock` | YES | YES (`quantity`) | YES | YES | `InventoryItem.quantity`, `InventoryTransaction` | N/A | **PASS** |
| **Homework** | *(No Template: Admission No)* | YES (`row['Admission Number']`) | YES (`studentId`) | YES | YES | `HomeworkSubmission.studentId` | `Student.id` | **NO TEMPLATE** |
| **Homework** | *(No Template: Status)* | YES (`row['Status']`) | YES (`status`) | YES | YES | `HomeworkSubmission.status` | N/A | **NO TEMPLATE** |
| **Homework** | *(No Template: Grade)* | YES (`row['Grade']`) | YES (`grade`) | YES | YES | `HomeworkSubmission.grade` | N/A | **NO TEMPLATE** |
| **Homework** | *(No Template: Feedback)* | YES (`row['Feedback']`) | YES (`feedback`) | YES | YES | `HomeworkSubmission.feedback` | N/A | **NO TEMPLATE** |

---

## 7. Tenant Isolation, RBAC & Security Audit

### 7.1 Tenant Isolation
- **All 5 Backend Endpoints** (`POST /students/bulk-import`, `POST /staff/bulk-import`, `POST /subjects/bulk-import`, `POST /classes/bulk-import`, `POST /inventory/items/bulk-import`) strictly extract `schoolId` from `req.schoolId` (resolved by `tenantContext` middleware).
- Uploaded payloads **cannot override or spoof `schoolId`**.
- Relational lookups (e.g. `FeeStructure`, `SchoolRole`, `Class`, `Section`, `InventoryCategory`) are unconditionally scoped to `where: { schoolId }`.
- Cross-tenant injection attempts fail safely (record not found in tenant).

### 7.2 RBAC Authorization
- `POST /api/v1/students/bulk-import` $\longrightarrow$ Protected by `authorize('students', 'create')`.
- `POST /api/v1/staff/bulk-import` $\longrightarrow$ Protected by `authorize('staff', 'create')`.
- `POST /api/v1/subjects/bulk-import` $\longrightarrow$ Protected by `authorize('subjects', 'create')`.
- `POST /api/v1/classes/bulk-import` $\longrightarrow$ Protected by `authorize('classes', 'create')`.
- `POST /api/v1/inventory/items/bulk-import` $\longrightarrow$ Protected by `authorize('inventory', 'create')`.

---

## 8. Issue Register

| ID | Module | Severity | Defect / Problem | Evidence | Impact | Recommended Remediation |
|---|---|---|---|---|---|---|
| **ISSUE-BLK-001** | **Students** | **HIGH** | `Bulk_Import_Template.xlsx` omits `Class` and `Section` columns | `StudentManagement.jsx:2854-2856` | Users downloading the official template cannot assign students to classes during import; students become unassigned. | Add `'Class'` and `'Section'` to `ws_data` in template generator; add example row `['Grade 10', 'A']`. |
| **ISSUE-BLK-002** | **Homework** | **HIGH** | Missing Downloadable Template for Homework Evaluations | `HomeworkManagement.jsx:456-540` | Teachers cannot know the expected Excel column headers (`Admission Number`, `Status`, `Grade`, `Feedback`); import is error-prone. | Add "Download Evaluation Template" button generating an Excel file pre-populated with class roster admission numbers. |
| **ISSUE-BLK-003** | **Homework** | **MEDIUM** | Sequential Client-Side Loop for Excel Import | `HomeworkManagement.jsx:506` | Large class imports execute N individual HTTP requests, risking network timeouts, partial updates, and UI blocking. | Create dedicated batch endpoint `PUT /api/v1/homework/:id/submissions/bulk` and call once with payload array. |
| **ISSUE-BLK-004** | **Classes** | **LOW** | Missing Live Data Refresh Broadcast | `ClassManagement.jsx:444` | Open class lists in other tabs or teacher timetable views do not immediately reflect newly imported classes/sections without reload. | Add `notifyDataChanged('classes')` upon successful bulk import response. |
| **ISSUE-BLK-005** | **Inventory**| **LOW** | Missing Live Data Refresh Broadcast | `InventoryManagement.jsx:498` | Open inventory tabs in other browser windows do not live-refresh on bulk import. | Add `notifyDataChanged('inventory')` upon successful bulk import response. |
| **ISSUE-BLK-006** | **Staff** | **LOW** | Template omits `Assigned Class`, `Subject Classes`, `Staff Type`, `Role` | `StaffAssignment.jsx:2017` | Optional assignment fields supported by the parser are missing from the downloaded template. | Expand template columns or add a separate "Assignments Template" tab in the workbook. |

---

## 9. Recommended Remediation Roadmap

1. **Priority 1 (Data Usability)**:
   - Update `StudentManagement.jsx` template generator to include `Class` and `Section` columns with sample values (`Grade 10`, `A`).
   - Add a "Download Roster Template" button in `HomeworkManagement.jsx` that pre-fills student names and admission numbers for the selected homework.
2. **Priority 2 (Architecture & Live Data)**:
   - Wire `notifyDataChanged('classes')` in `ClassManagement.jsx:444`.
   - Wire `notifyDataChanged('inventory')` in `InventoryManagement.jsx:498`.
   - Create a single batch submission endpoint `PUT /api/v1/homework/:id/submissions/bulk` to replace the sequential client loop.
3. **Priority 3 (Staff Template Completeness)**:
   - Update `StaffAssignment.jsx` template headers to include optional `Assigned Class` and `Role` columns.

---

## 10. Audit Summary & Hard Stop Status

- **Total Bulk Imports Discovered:** 6
- **Imports with Official Templates:** 5
- **Imports without Templates:** 1
- **Overall Status Breakdown:**
  - **PASS:** 1 (Subjects)
  - **PARTIAL:** 4 (Students, Staff, Classes, Inventory)
  - **FAIL:** 1 (Homework Evaluations)
- **Issues Registered:**
  - **Critical:** 0
  - **High:** 2 (Student template missing Class/Section; Homework missing template)
  - **Medium:** 1 (Homework client-side sequential loop)
  - **Low:** 3 (Classes & Inventory live data emission; Staff template optional columns)

**AUDIT COMPLETE. NO CODE MODIFICATIONS PERFORMED. HARD STOP REACHED.**
